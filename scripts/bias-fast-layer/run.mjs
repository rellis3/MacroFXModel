#!/usr/bin/env node
// bias-fast-layer: score the fast call. Prereg: forge/BIAS_FAST_LAYER_PREREG.md.
//   node scripts/bias-fast-layer/run.mjs --control   (positive control only, §3.7; must pass before scoring)
//   node scripts/bias-fast-layer/run.mjs             (control, then the scoring once)
// Input: analysis/output/bias-fast-layer/panel.json (build.py). Output: results.json in the same folder.
import fs from 'node:fs';
import { TARGETS, SLOTS, CFG, fitBeta, callAt, forward, dollar, rates, HOURS } from '../../js/biasFastCore.js';
import { rng } from '../hedge-method-comparison/lib.mjs';

const SEED = 20261124, B = 1000, BLOCK = 21, BAR = 0.03, HALF = '2021-07-01', NPLACEBO = 50;
const OUT = new URL('../../analysis/output/bias-fast-layer/', import.meta.url);
const panel = JSON.parse(fs.readFileSync(new URL('panel.json', OUT), 'utf8'));
const NS = panel.sessions.length, CONTROL_ONLY = process.argv.includes('--control');
const R = rng(SEED);
const gauss = () => { let u = 0, v = 0; while (u === 0) u = R(); v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// ── fits and calls, point in time ────────────────────────────────────────────────────────────────────────────────
const t0 = Date.now();
const calls = [];   // {si, m, slot, dir, momDir, z, partU, partY, f3, f21, fit}
const fits = {};    // fits[m][si]
let evalStart = NS, skipped = { noFit: 0, noDrivers: 0, noFwd: 0 };
for (const m of TARGETS) {
  fits[m] = new Array(NS).fill(null);
  for (let si = 0; si < NS; si++) {
    const fit = fitBeta(panel, si, m); if (!fit.ok) { skipped.noFit++; continue; }
    fits[m][si] = fit; if (si < evalStart) evalStart = si;
    for (const s of SLOTS) {
      const c = callAt(panel, si, m, s, fit); if (!c) { skipped.noDrivers++; continue; }
      const f3 = forward(panel, si, m, s, fit), f21 = forward(panel, si, m, s, fit, { to: 21 });
      if (f3 == null) { skipped.noFwd++; continue; }
      calls.push({ si, m, slot: s, dir: c.dir, momDir: c.momDir, z: c.z, partU: c.partU, partY: c.partY, f3, f21 });
    }
  }
}
console.log('calls built', calls.length, 'eval starts', panel.sessions[evalStart], 'in', ((Date.now() - t0) / 1000).toFixed(1), 's', skipped);

// ── bootstrap: 21-session blocks over evaluation sessions; statistic = mean over sessions of the session mean ──────────
const nBlocks = Math.ceil((NS - evalStart) / BLOCK), blockOf = si => Math.floor((si - evalStart) / BLOCK);
const draws = Array.from({ length: B }, () => Array.from({ length: nBlocks }, () => Math.floor(R() * nBlocks)));
/** sess: Map si -> value. */
function stat(sess) {
  const s1 = new Float64Array(nBlocks), n = new Float64Array(nBlocks); let S = 0, N = 0;
  for (const [si, v] of sess) { const b = blockOf(si); s1[b] += v; n[b]++; S += v; N++; }
  const bs = draws.map(d => { let a = 0, c = 0; for (const b of d) { a += s1[b]; c += n[b]; } return c ? a / c : NaN; }).filter(Number.isFinite).sort((x, y) => x - y);
  const q = p => bs[Math.min(bs.length - 1, Math.max(0, Math.floor(p * bs.length)))];
  const pval = Math.min(1, 2 * Math.min(bs.filter(x => x <= 0).length, bs.filter(x => x >= 0).length) / bs.length);
  return { mean: N ? S / N : null, lo: q(0.025), hi: q(0.975), sessions: N, p: pval };
}
const sessMean = (rows, val) => { const a = new Map(); for (const r of rows) { const v = val(r); if (v == null || !Number.isFinite(v)) continue; const x = a.get(r.si) ?? [0, 0]; x[0] += v; x[1]++; a.set(r.si, x); } return new Map([...a].map(([k, [s, n]]) => [k, s / n])); };
const half = (sess, second) => new Map([...sess].filter(([si]) => (panel.sessions[si] >= HALF) === second));
const meanOf = sess => { let s = 0, n = 0; for (const v of sess.values()) { s += v; n++; } return n ? s / n : null; };

// ── positive control (§3.7) ───────────────────────────────────────────────────────────────────────────────────────
const fastCalls = calls.filter(c => c.dir !== 0);
const ctrl = stat(sessMean(fastCalls, c => c.dir * (0.10 * c.dir + gauss())));
const PC = { planted: 0.10, recovered: ctrl.mean, lo: ctrl.lo, hi: ctrl.hi, pass: Math.abs(ctrl.mean - 0.10) <= 0.02 && ctrl.lo > 0 };
console.log('positive control', PC);
if (CONTROL_ONLY || !PC.pass) { fs.writeFileSync(new URL('control.json', OUT), JSON.stringify({ seed: SEED, calls: calls.length, fastCalls: fastCalls.length, PC }, null, 1)); process.exit(PC.pass ? 0 : 1); }

// ── scoring, once ─────────────────────────────────────────────────────────────────────────────────────────────────
const r3 = n => (n == null ? null : +n.toFixed(4));
function gate(name, rows, val, { placebo = null } = {}) {
  const sess = sessMean(rows, val), st = stat(sess), h1 = meanOf(half(sess, false)), h2 = meanOf(half(sess, true));
  const perMarket = Object.fromEntries(TARGETS.map(m => { const xs = rows.filter(r => r.m === m).map(val).filter(v => v != null); return [m, { calls: xs.length, edge: xs.length ? r3(xs.reduce((a, b) => a + b, 0) / xs.length) : null }]; }));
  const pos = Object.values(perMarket).filter(x => x.edge > 0).length;
  const pass = st.mean > BAR && st.lo > 0 && h1 > 0 && h2 > 0 && pos >= 8 && (placebo == null || st.mean > placebo);
  const verdict = pass ? 'VALIDATED' : st.lo > -BAR && st.hi < BAR ? 'NULL' : 'UNDERPOWERED';
  return { name, edge: r3(st.mean), lo: r3(st.lo), hi: r3(st.hi), halfWidth: r3((st.hi - st.lo) / 2), p: st.p, sessions: st.sessions, calls: rows.length,
    halves: [r3(h1), r3(h2)], marketsPositive: pos, perMarket, mirror: st.hi < 0, verdict };
}

// placebo: drivers of a random other session, same slot, this session's fit and outcome
const placeboEdges = [];
for (let k = 0; k < NPLACEBO; k++) {
  const rows = [];
  for (const c of calls) {
    const sj = evalStart + Math.floor(R() * (NS - evalStart)); if (sj === c.si) continue;
    const i = HOURS.indexOf(c.slot), fit = fits[c.m][c.si];
    const U = dollar(panel, sj, 0, i, c.m), Y = rates(panel, sj, 0, i); if (U == null || Y == null) continue;
    const z = (fit.bU * U + fit.bY * Y) / (fit.sigma * Math.sqrt(i)); if (Math.abs(z) < CFG.callZ) continue;
    rows.push({ si: c.si, v: Math.sign(z) * c.f3 });
  }
  placeboEdges.push(meanOf(sessMean(rows, r => r.v)));
}
placeboEdges.sort((a, b) => a - b);
const placebo = { median: r3(placeboEdges[Math.floor(NPLACEBO / 2)]), lo: r3(placeboEdges[1]), hi: r3(placeboEdges[NPLACEBO - 2]) };

const H1 = gate('H1 fast call, next 3 h', fastCalls, c => c.dir * c.f3, { placebo: placebo.median });
// H2: paired by session, sessions with both a fast and a momentum call
const sF = sessMean(fastCalls, c => c.dir * c.f3), momCalls = calls.filter(c => c.momDir !== 0), sM = sessMean(momCalls, c => c.momDir * c.f3);
const diffRows = [...sF].filter(([si]) => sM.has(si)).map(([si, v]) => ({ si, m: null, d: v - sM.get(si) }));
const H2 = gate('H2 fast minus momentum, next 3 h', diffRows, r => r.d);
H2.perMarket = Object.fromEntries(TARGETS.map(m => { const a = fastCalls.filter(c => c.m === m).map(c => c.dir * c.f3), b = momCalls.filter(c => c.m === m).map(c => c.momDir * c.f3); const mu = x => x.reduce((s, y) => s + y, 0) / (x.length || 1); return [m, { edge: r3(mu(a) - mu(b)), fast: r3(mu(a)), momentum: r3(mu(b)) }]; }));
H2.marketsPositive = Object.values(H2.perMarket).filter(x => x.edge > 0).length;
H2.verdict = H2.edge > BAR && H2.lo > 0 && H2.halves.every(x => x > 0) && H2.marketsPositive >= 8 ? 'VALIDATED' : H2.lo > -BAR && H2.hi < BAR ? 'NULL' : 'UNDERPOWERED';
const H3 = gate('H3 drivers and market disagree, fast call, next 3 h', fastCalls.filter(c => c.momDir !== 0 && c.momDir !== c.dir), c => c.dir * c.f3);

// BH q = 0.10 across H1-H3
const hs = [H1, H2, H3].map((h, i) => ({ i, p: h.p })).sort((a, b) => a.p - b.p);
let kMax = -1; hs.forEach((h, k) => { if (h.p <= 0.10 * (k + 1) / hs.length) kMax = k; });
const bh = new Set(hs.slice(0, kMax + 1).map(h => h.i)); [H1, H2, H3].forEach((h, i) => { h.bh = bh.has(i); if (!h.bh && h.verdict === 'VALIDATED') h.verdict = 'UNDERPOWERED'; });

// descriptive
const desc = {
  momentum3h: gate('momentum alone, next 3 h', momCalls, c => c.momDir * c.f3),
  fastTo21: gate('fast call, to 21:00', fastCalls.filter(c => c.f21 != null), c => c.dir * c.f21),
  momentumTo21: gate('momentum, to 21:00', momCalls.filter(c => c.f21 != null), c => c.momDir * c.f21),
  dollarOnly: gate('dollar part only, next 3 h', calls.filter(c => Math.abs(c.partU) >= CFG.callZ), c => Math.sign(c.partU) * c.f3),
  ratesOnly: gate('2y part only, next 3 h', calls.filter(c => Math.abs(c.partY) >= CFG.callZ), c => Math.sign(c.partY) * c.f3),
  agree: gate('fast and momentum agree, next 3 h', fastCalls.filter(c => c.momDir === c.dir), c => c.dir * c.f3),
  bySlot: Object.fromEntries(SLOTS.map(s => { const x = fastCalls.filter(c => c.slot === s).map(c => c.dir * c.f3); return [s, { calls: x.length, edge: r3(x.reduce((a, b) => a + b, 0) / (x.length || 1)) }]; })),
  strong: gate('fast call |z| >= 1, next 3 h', fastCalls.filter(c => Math.abs(c.z) >= 1), c => c.dir * c.f3),
};
for (const d of Object.values(desc)) if (d?.verdict) delete d.verdict;

const res = { study: 'bias-fast-layer', seed: SEED, B, block: BLOCK, bar: BAR, sample: [panel.sessions[evalStart], panel.sessions.at(-1)], half: HALF,
  calls: calls.length, fastCalls: fastCalls.length, momentumCalls: momCalls.length, skipped, positiveControl: PC, placebo, H1, H2, H3, descriptive: desc };
fs.writeFileSync(new URL('results.json', OUT), JSON.stringify(res, null, 1));
for (const h of [H1, H2, H3]) console.log(h.name, h.edge, `[${h.lo}, ${h.hi}]`, 'halves', h.halves, 'markets+', h.marketsPositive, 'p', h.p, 'BH', h.bh, '->', h.verdict);
console.log('placebo', placebo);
for (const [k, d] of Object.entries(desc)) if (d.edge !== undefined) console.log(k, d.edge, `[${d.lo}, ${d.hi}]`, d.halves); else console.log(k, JSON.stringify(d));
