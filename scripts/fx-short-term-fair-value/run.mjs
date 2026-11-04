#!/usr/bin/env node
// fx-short-term-fair-value: the walk-forward convergence test. Prereg: forge/FX_SHORT_TERM_FAIR_VALUE_PREREG.md.
//
//   node scripts/fx-short-term-fair-value/run.mjs --mode power   control only: real gaps, SYNTHETIC outcomes (a correlated
//                                                               random walk, and a planted mean-reverting world run
//                                                               through the exact pipeline). Reads no outcome.
//   node scripts/fx-short-term-fair-value/run.mjs --mode score   the registered run, once. Writes results.json + cells.
//
// Inputs: data/fx-short-term-fair-value/ (scripts/fx-short-term-fair-value/fetch.mjs). Outputs:
// analysis/output/fx-short-term-fair-value/. Seed 20261104 everywhere. Lockbox: no signal or outcome after 2026-08-21.
import fs from 'node:fs';
import { buildRows, rollingGaps, convergenceSample, closureBeta, closureAt, ar1HalfLife, SCORED_PAIRS } from '../../js/fxFairValue.js';
import { clusteredBlockBootstrap, clusterBy, bhFdr, normCdf } from '../../js/harness/stats.mjs';
import { holm } from '../../js/preregStats.js';
import { mulberry32 } from '../../js/statsCore.js';

const SEED = 20261104, LOCKBOX_END = '2026-08-21', WINDOW = 250, HORIZONS = [5, 10, 20], SKIP = 1, BAR_HL = 120;
const B = Number(process.argv.find(a => a.startsWith('--B='))?.slice(4) ?? 2000);
const MODE = process.argv[process.argv.indexOf('--mode') + 1];
const DATA = new URL('../../data/fx-short-term-fair-value/', import.meta.url), OUT = new URL('../../analysis/output/fx-short-term-fair-value/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const load = k => JSON.parse(fs.readFileSync(new URL(`${k}.json`, DATA), 'utf8'));
const inv = s => s.map(p => ({ date: p.date, value: 1 / p.value }));
const bar = h => +closureAt(h, BAR_HL).toFixed(4);
const blockOf = h => Math.max(h, 63);   // a quarter: a 21-session block understated the null spread (power mode)

// ── the five pairs (price as quoted; base minus quote yields) ────────────────────────────────────────────────────
const Y = { USD: ['US2', 'US10'], EUR: ['DE2', 'DE10'], GBP: ['GB2', 'GB10'], JPY: ['JP2', 'JP10'], AUD: ['AU2', 'AU10'], CAD: ['CA2', 'CA10'] };
const FX = { EURUSD: ['DEXUSEU', false], GBPUSD: ['DEXUSUK', false], USDJPY: ['DEXJPUS', false], AUDUSD: ['DEXUSAL', false], USDCAD: ['DEXCAUS', false] };
const vix = load('VIX');
function pairRows(id) {
  const [base, quote] = [id.slice(0, 3), id.slice(3)], [sym, flip] = FX[id], fx = flip ? inv(load(sym)) : load(sym);
  return buildRows({ fx: fx.filter(p => p.date >= '1999-01-01' && p.date <= LOCKBOX_END), y2Base: load(Y[base][0]), y2Quote: load(Y[quote][0]), y10Base: load(Y[base][1]), y10Quote: load(Y[quote][1]), vix });
}
const P = Object.fromEntries(SCORED_PAIRS.map(id => { const rows = pairRows(id); return [id, { rows, gaps: rollingGaps(rows, { window: WINDOW }) }]; }));
const coverage = Object.fromEntries(SCORED_PAIRS.map(id => [id, { rows: P[id].rows.length, from: P[id].rows[0]?.date, to: P[id].rows.at(-1)?.date, firstSignal: P[id].gaps[0]?.date }]));
if (Object.values(P).some(p => p.rows.at(-1).date > LOCKBOX_END)) throw new Error('lockbox leak');

/** pooled rows for horizon h: { pair, date, gap, naive, fwd } */
function pooled(h, fwdOf = null) {
  const out = [];
  for (const id of SCORED_PAIRS) {
    const { rows, gaps } = P[id];
    for (const s of convergenceSample(rows, gaps, { h, skip: SKIP, end: LOCKBOX_END })) out.push({ pair: id, ...s, fwd: fwdOf ? fwdOf(id, s.date, h) : s.fwd });
  }
  return out;
}
const boot = (rows, stat, h, nBoot = B, seed = SEED) => clusteredBlockBootstrap(clusterBy(rows, r => r.date), stat, { meanBlock: blockOf(h), nBoot, seed });
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const splitDate = rows => median(rows.map(r => Date.parse(r.date))) ;

// ── power: synthetic outcomes on the real gaps ──────────────────────────────────────────────────────────────────
function syntheticFwd(seed = SEED, rho = 0.5, sd = 0.006) {
  // one draw of daily returns per calendar date, a common dollar factor (sign + for XXXUSD, − for USDXXX)
  const rng = mulberry32(seed), g = () => { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const dates = [...new Set(SCORED_PAIRS.flatMap(id => P[id].rows.map(r => r.date)))].sort();
  const cum = Object.fromEntries(SCORED_PAIRS.map(id => [id, new Map()])), acc = Object.fromEntries(SCORED_PAIRS.map(id => [id, 0]));
  for (const d of dates) { const F = g(); for (const id of SCORED_PAIRS) { const s = id.startsWith('USD') ? -1 : 1; acc[id] += sd * (Math.sqrt(rho) * s * F + Math.sqrt(1 - rho) * g()); cum[id].set(d, acc[id]); } }
  const idx = Object.fromEntries(SCORED_PAIRS.map(id => [id, new Map(P[id].rows.map((r, i) => [r.date, i]))]));
  return (id, date, h) => { const rows = P[id].rows, i = idx[id].get(date), a = rows[i + SKIP]?.date, b = rows[i + SKIP + h]?.date; return cum[id].get(b) - cum[id].get(a); };
}
function plantedWorld(rep, { hl = BAR_HL, uSd = 0.03, wSd = 0.005, b = [0.03, 0.02, -0.02] } = {}) {
  // the real yield gaps and VIX, a price built from them plus a mean-reverting gap (half-life hl) and a random walk
  const rng = mulberry32(SEED + 1000 * hl + rep), g = () => { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const phi = Math.pow(0.5, 1 / hl), out = {};
  for (const id of SCORED_PAIRS) {
    let u = 0, w = 0;
    const rows = P[id].rows.map(r => { u = phi * u + uSd * Math.sqrt(1 - phi * phi) * g(); w += wSd * g(); const y = b[0] * r.x[0] + b[1] * r.x[1] + b[2] * r.x[2] + u + w; return { ...r, y, price: Math.exp(y) }; });
    out[id] = { rows, gaps: rollingGaps(rows, { window: WINDOW, step: 5 }) };
  }
  return out;
}

/** Monte-Carlo null: the pooled beta on the real gaps against `draws` synthetic correlated random-walk outcomes. */
function mcNull(draws, base = 7_000_000) {
  const out = Object.fromEntries(HORIZONS.map(h => [h, []]));
  const sig = Object.fromEntries(HORIZONS.map(h => [h, pooled(h)]));   // the gaps; their real outcomes are replaced below
  for (let d = 0; d < draws; d++) { const f = syntheticFwd(base + d); for (const h of HORIZONS) out[h].push(closureBeta(sig[h].map(r => ({ gap: r.gap, fwd: f(r.pair, r.date, h) })))); }
  return Object.fromEntries(HORIZONS.map(h => { const v = out[h], m = v.reduce((a, x) => a + x, 0) / v.length; return [h, { draws, mean: +m.toFixed(5), sd: +Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)).toFixed(5), values: v }]; }));
}
if (MODE === 'power') {
  const mc = mcNull(200), cells = [];
  for (const h of HORIZONS) {
    const f0 = syntheticFwd(SEED), rows = pooled(h, f0), bt = boot(rows, s => closureBeta(s), h);
    const se = Math.max(bt.se, mc[h].sd), mde = 2.8 * se, mdeHolm = (2.394 + 0.842) * se;
    cells.push({ h, n: rows.length, dateClusters: bt.nClusters, independentWindows: Math.round(bt.nClusters / h), bootSe: bt.se, mcSd: mc[h].sd, mcMean: mc[h].mean, seUsed: +se.toFixed(5), mde: +mde.toFixed(4), mdeHolm: +mdeHolm.toFixed(4), bar: bar(h), powered: mdeHolm <= bar(h) });
    console.log(`h=${h}: n ${rows.length}, clusters ${bt.nClusters}, boot SE ${bt.se} (block ${blockOf(h)}), MC null sd ${mc[h].sd} mean ${mc[h].mean}; MDE ${mde.toFixed(4)} (Holm ${mdeHolm.toFixed(4)}) vs bar ${bar(h)}`);
  }
  // planted positive controls through the exact pipeline (gap fit, skip, lockbox cut, pooled beta, block bootstrap)
  const REPS = 6, planted = {};
  for (const hl of [20, 60, BAR_HL]) {
    const reps = [];
    for (let rep = 0; rep < REPS; rep++) {
      const W = plantedWorld(rep, { hl }), row = { rep };
      for (const h of HORIZONS) {
        const rows = []; for (const id of SCORED_PAIRS) for (const s2 of convergenceSample(W[id].rows, W[id].gaps, { h, skip: SKIP, end: LOCKBOX_END })) rows.push({ pair: id, ...s2 });
        const bt = boot(rows, x => closureBeta(x), h, 300, SEED + rep);
        row[`h${h}`] = { beta: bt.obs, lo: bt.ci95[0], p: bt.pValue };
      }
      reps.push(row);
    }
    const passRate = Object.fromEntries(HORIZONS.map(h => [h, reps.filter(r => r[`h${h}`].p * HORIZONS.length < 0.05 && r[`h${h}`].beta >= bar(h)).length / REPS]));
    planted[hl] = { reps: REPS, trueClosure: Object.fromEntries(HORIZONS.map(h => [h, +closureAt(h, hl).toFixed(4)])), meanBeta: Object.fromEntries(HORIZONS.map(h => [h, +(reps.reduce((a, r) => a + r[`h${h}`].beta, 0) / REPS).toFixed(4)])), passRate, rows: reps };
    console.log(`planted half-life ${hl}: true closure`, planted[hl].trueClosure, 'measured mean beta', planted[hl].meanBeta, 'pass rate', passRate);
  }
  const res = { mode: 'power', seed: SEED, B, ranAt: new Date().toISOString(), coverage, horizons: HORIZONS, barHalfLife: BAR_HL, block: HORIZONS.map(blockOf), cells,
    mcNull: Object.fromEntries(HORIZONS.map(h => [h, { draws: mc[h].draws, mean: mc[h].mean, sd: mc[h].sd }])), planted };
  fs.writeFileSync(new URL('power.json', OUT), JSON.stringify(res, null, 2));
} else if (MODE === 'score') {
  const cells = [], perPair = [], controls = {};
  for (const h of HORIZONS) {
    const rows = pooled(h), bt = boot(rows, s => closureBeta(s), h);
    const cut = splitDate(rows), first = rows.filter(r => Date.parse(r.date) < cut), second = rows.filter(r => Date.parse(r.date) >= cut);
    const h1 = boot(first, s => closureBeta(s), h), h2 = boot(second, s => closureBeta(s), h);
    const naive = boot(rows, s => closureBeta(s, 'naive'), h), diff = boot(rows, s => closureBeta(s) - closureBeta(s, 'naive'), h);
    cells.push({ name: `pooled h=${h}`, h, n: rows.length, dateClusters: bt.nClusters, est: bt.obs, lo: bt.ci95[0], hi: bt.ci95[1], se: bt.se, p: bt.pValue, bar: bar(h),
      halves: { splitAt: new Date(cut).toISOString().slice(0, 10), first: { est: h1.obs, lo: h1.ci95[0], hi: h1.ci95[1] }, second: { est: h2.obs, lo: h2.ci95[0], hi: h2.ci95[1] } },
      naive: { est: naive.obs, lo: naive.ci95[0], hi: naive.ci95[1] }, factorMinusNaive: { est: diff.obs, lo: diff.ci95[0], hi: diff.ci95[1] } });
    for (const id of SCORED_PAIRS) { const pr = rows.filter(r => r.pair === id), b2 = boot(pr, s => closureBeta(s), h); perPair.push({ pair: id, h, n: pr.length, est: b2.obs, lo: b2.ci95[0], hi: b2.ci95[1], p: b2.pValue }); }
    // placebo: the gap series shifted against its outcomes by k = 250, 300, ... days within each pair (circular)
    const shifts = [];
    for (let k = 250; k <= 250 + 99 * 25; k += 25) {
      const sh = []; for (const id of SCORED_PAIRS) { const pr = rows.filter(r => r.pair === id), L = pr.length; for (let i = 0; i < L; i++) sh.push({ gap: pr[(i + k) % L].gap, fwd: pr[i].fwd }); }
      shifts.push(closureBeta(sh));
    }
    const sd = Math.sqrt(shifts.reduce((s, v) => s + v * v, 0) / shifts.length - (shifts.reduce((s, v) => s + v, 0) / shifts.length) ** 2);
    controls[`h${h}`] = { placeboShifts: shifts.length, placeboMean: +(shifts.reduce((s, v) => s + v, 0) / shifts.length).toFixed(4), placeboSd: +sd.toFixed(4), realPercentile: +(100 * shifts.filter(v => v < bt.obs).length / shifts.length).toFixed(1) };
    // descriptive: the extreme gaps (|z| >= 2) alone, and the total closure (price and fair value together)
    const ext = rows.filter(r => Math.abs(r.z) >= 2);
    controls[`h${h}`].extremeZ = { n: ext.length, beta: ext.length > 50 ? +closureBeta(ext).toFixed(4) : null };
  }
  // Monte-Carlo null p (two-sided): the real beta against 400 synthetic random-walk outcomes on the same gaps
  const mc = mcNull(400);
  cells.forEach(c => { const v = mc[c.h].values; c.mcNull = { draws: v.length, mean: mc[c.h].mean, sd: mc[c.h].sd, p: +Math.min(1, 2 * Math.min((v.filter(x => x >= c.est).length + 1) / (v.length + 1), (v.filter(x => x <= c.est).length + 1) / (v.length + 1))).toFixed(4) }; });
  const H = holm(cells.map(c => c.p), 0.05), Hmc = holm(cells.map(c => c.mcNull.p), 0.05);
  cells.forEach((c, i) => {
    c.holmP = +H.adjusted[i].toFixed(4); c.holmPass = H.rejected[i];
    c.mcNull.holmPass = Hmc.rejected[i];
    const gate = { holm: !!c.holmPass && c.mcNull.holmPass, atBar: c.est >= c.bar, bothHalves: c.halves.first.est > 0 && c.halves.second.est > 0, beatsNaive: c.factorMinusNaive.lo > 0 };
    c.gate = gate; c.passes = Object.values(gate).every(Boolean);
  });
  // the registered verdict rule (prereg §4c)
  for (const c of cells) { c.mdeHolmRealised = +(3.236 * Math.max(c.se, c.mcNull.sd)).toFixed(4); c.cellVerdict = c.passes ? 'validated' : (c.mdeHolmRealised > c.bar && c.hi >= c.bar ? 'underpowered' : 'null'); c.mirror = c.est < 0 && c.holmPass && c.mcNull.holmPass ? 'significant negative closure (price runs from the model): description only' : null; }
  const verdict = cells.some(c => c.passes) ? 'validated' : cells.every(c => c.cellVerdict === 'null') ? 'null' : 'underpowered';
  const bh = bhFdr(perPair.map(c => c.p), 0.10); perPair.forEach((c, i) => (c.bhPass = bh.pass[i]));
  // descriptive: half-life of each pair's out-of-sample gap (AR(1) on the whole OOS gap series to the lockbox)
  const halfLives = Object.fromEntries(SCORED_PAIRS.map(id => [id, ar1HalfLife(P[id].gaps.map(g => g.gap))]));
  const r2 = Object.fromEntries(SCORED_PAIRS.map(id => { const v = P[id].gaps.map(g => g.r2).sort((a, b) => a - b); return [id, { p10: +v[Math.floor(v.length * 0.1)].toFixed(3), median: +v[Math.floor(v.length / 2)].toFixed(3), p90: +v[Math.floor(v.length * 0.9)].toFixed(3) }]; }));
  const res = { id: 'fx-short-term-fair-value', verdict, mode: 'score', seed: SEED, B, ranAt: new Date().toISOString(), lockboxEnd: LOCKBOX_END, window: WINDOW, skip: SKIP, barHalfLife: BAR_HL,
    prereg: 'forge/FX_SHORT_TERM_FAIR_VALUE_PREREG.md', coverage, cells, perPair, controls, descriptive: { halfLives, r2 }, holm: H };
  fs.writeFileSync(new URL('results.json', OUT), JSON.stringify(res, null, 2));
  console.log('VERDICT', verdict); console.log(JSON.stringify({ cells: cells.map(c => ({ h: c.h, est: c.est, ci: [c.lo, c.hi], p: c.p, holmP: c.holmP, bar: c.bar, gate: c.gate, mc: c.mcNull.p, cellVerdict: c.cellVerdict })), controls }, null, 1));
} else {
  console.log('usage: --mode power | --mode score');
}
