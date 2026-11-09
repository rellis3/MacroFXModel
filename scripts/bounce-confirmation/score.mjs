#!/usr/bin/env node
/**
 * bounce-confirmation — does cross-asset confirmation (HY-over-IG not widening, semis over
 * equal-weight) separate post-drop Nasdaq bounces that persist from those that fade?
 *
 * Design frozen in forge/BOUNCE_CONFIRMATION_PREREG.md (committed 24bb5870, 2026-11-09)
 * BEFORE this file was written. Every constant below is the prereg's.
 *
 *   node scripts/bounce-confirmation/score.mjs --counts    # episodes + arm counts only, no outcome read
 *   node scripts/bounce-confirmation/score.mjs --planted   # positive control: +1.5pp planted on CONFIRMED Y5
 *   node scripts/bounce-confirmation/score.mjs             # the one real run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clusteredBlockBootstrap, bhFdr } from '../../js/harness/stats.mjs';
import { mdeMeanDiff, holm, pFromCI } from '../../js/preregStats.js';
import { mulberry32 } from '../../js/statsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../analysis/output/bounce-confirmation');
const MODE = process.argv.includes('--counts') ? 'counts' : process.argv.includes('--planted') ? 'planted' : 'run';

// ── pre-registered constants ──────────────────────────────────────────────────
const SEED = 20261109, B = 2000, BLOCK = 3;
const LOCKBOX_END = '2026-08-21', FROM = '2007-04-11';
const LOW_WIN = 10, MIN_BOUNCE = 0.015, WITHIN = 3, DECLUSTER = 10;
const HORIZONS = [5, 10], DESC_H = 20;
const BAR = { h5: 1.5, h10: 2.0, fade: -1.0 };
const PLANT = 1.5;

// ── data (Yahoo adjusted closes, keyless; truncated at the lockbox BEFORE any join) ───
const UA = { headers: { 'User-Agent': 'Mozilla/5.0' } };
async function yahoo(sym) {
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=30y&interval=1d`;
  const r = await fetch(u, UA); if (!r.ok) throw new Error(`${sym} HTTP ${r.status}`);
  const j = await r.json(), res = j.chart.result[0];
  const c = res.indicators.adjclose?.[0]?.adjclose ?? res.indicators.quote[0].close;
  const m = new Map();
  res.timestamp.forEach((t, i) => { const d = new Date(t * 1000).toISOString().slice(0, 10); if (Number.isFinite(c[i]) && d <= LOCKBOX_END) m.set(d, c[i]); });
  return m;
}
async function fredOas() {
  try { const r = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2'); const t = await r.text(); if (!r.ok || !/^(observation_date|DATE)/.test(t)) return null;
    const m = new Map(); for (const l of t.trim().split('\n').slice(1)) { const [d, v] = l.split(','); const x = parseFloat(v); if (Number.isFinite(x) && d <= LOCKBOX_END) m.set(d, x); } return m; } catch { return null; }
}
const SYMS = { ndx: '^NDX', smh: 'SMH', rsp: 'RSP', hyg: 'HYG', lqd: 'LQD', spx: '^GSPC' };
const raw = {}; for (const [k, s] of Object.entries(SYMS)) raw[k] = await yahoo(s);
const oas = MODE === 'counts' ? null : await fredOas();
const dates = [...raw.ndx.keys()].filter(d => d >= FROM && ['smh', 'rsp', 'hyg', 'lqd', 'spx'].every(k => raw[k].has(d))).sort();
const S = {}; for (const k of Object.keys(SYMS)) S[k] = dates.map(d => raw[k].get(d));
const n = dates.length;
console.log(`sessions ${n}  ${dates[0]} -> ${dates.at(-1)}  (lockbox ${LOCKBOX_END})${oas ? `  FRED OAS ${oas.size} obs` : '  FRED OAS unavailable'}`);

// ── episodes (the setup) ──────────────────────────────────────────────────────
const N = S.ndx;
const isLow = i => i >= LOW_WIN - 1 && N.slice(i - LOW_WIN + 1, i + 1).every(v => v >= N[i]);
const episodes = []; let lastD = -Infinity;
for (let D = LOW_WIN + WITHIN; D < n; D++) {
  if (D - lastD <= DECLUSTER) continue;
  let L = -1;
  for (let k = D - WITHIN; k < D; k++) if (isLow(k) && N[D] / N[k] - 1 >= MIN_BOUNCE) { L = k; break; }
  if (L < 0) continue;
  const hi20 = Math.max(...N.slice(Math.max(0, L - 19), L + 1));
  episodes.push({ D, L, d: dates[D], lowD: dates[L], drop: (N[L] / hi20 - 1) * 100, bounce: (N[D] / N[L] - 1) * 100 });
  lastD = D;
}
// confirmation from the low to the bounce day; shifted-window placebo from [L-10, L]
const ratioChg = (a, b, i0, i1) => (S[a][i1] / S[b][i1]) / (S[a][i0] / S[b][i0]) - 1;
for (const e of episodes) {
  e.C = ratioChg('hyg', 'lqd', e.L, e.D) * 100; e.M = ratioChg('smh', 'rsp', e.L, e.D) * 100;
  e.arm = e.C < 0 ? 'UNCONFIRMED' : e.M > 0 ? 'CONFIRMED' : 'MIXED';
  const L0 = Math.max(0, e.L - 10);
  e.Cs = ratioChg('hyg', 'lqd', L0, e.L) * 100; e.Ms = ratioChg('smh', 'rsp', L0, e.L) * 100;
  e.armShift = e.Cs < 0 ? 'UNCONFIRMED' : e.Ms > 0 ? 'CONFIRMED' : 'MIXED';
  if (oas) { const o0 = oas.get(e.lowD), o1 = oas.get(e.d); e.oasChg = (o0 != null && o1 != null) ? +(o1 - o0).toFixed(3) : null; }
  e.half = e.d < '2017-01-01' ? 1 : 2;
}
const count = a => episodes.filter(e => e.arm === a).length;
console.log(`episodes ${episodes.length}  CONFIRMED ${count('CONFIRMED')}  UNCONFIRMED ${count('UNCONFIRMED')}  MIXED ${count('MIXED')}  | halves ${episodes.filter(e => e.half === 1).length}/${episodes.filter(e => e.half === 2).length}`);
// power restated at the actual counts (control SD from the post-low windows, as in the prereg)
const sd = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const postLow = new Set(); for (let i = LOW_WIN; i < n; i++) if (isLow(i)) for (let k = i; k <= i + 10 && k < n - DESC_H; k++) postLow.add(k);
const ctlSd = Object.fromEntries(HORIZONS.map(h => [h, sd([...postLow].map(i => (N[i + h] / N[i] - 1) * 100))]));
const nC = count('CONFIRMED'), nU = count('UNCONFIRMED');
const mde = { h5: mdeMeanDiff({ sd: ctlSd[5], n1: nC, n2: nU }), h10: mdeMeanDiff({ sd: ctlSd[10], n1: nC, n2: nU }), fade: mdeMeanDiff({ sd: ctlSd[5], n1: nU, n2: Infinity }) };
console.log(`control SD 5s ${ctlSd[5].toFixed(2)}  10s ${ctlSd[10].toFixed(2)}  | MDE at actual counts: H1 h5 ${mde.h5.toFixed(2)} (bar ${BAR.h5})  H1 h10 ${mde.h10.toFixed(2)} (bar ${BAR.h10})  H2 ${mde.fade.toFixed(2)} (bar ${Math.abs(BAR.fade)})`);
if (MODE === 'counts') { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'counts.json'), JSON.stringify({ at: new Date().toISOString(), n, from: dates[0], to: dates.at(-1), episodes: episodes.length, arms: { CONFIRMED: nC, UNCONFIRMED: nU, MIXED: count('MIXED') }, ctlSd, mde }, null, 1)); process.exit(0); }

// ── outcomes (only past this line is any outcome read) ───────────────────────
const usable = episodes.filter(e => e.D + DESC_H < n);
for (const e of usable) {
  for (const h of [...HORIZONS, DESC_H]) { e[`y${h}`] = (N[e.D + h] / N[e.D] - 1) * 100; e[`s${h}`] = (S.spx[e.D + h] / S.spx[e.D] - 1) * 100; }
  e.giveBack = N.slice(e.D + 1, e.D + 11).some(v => v < N[e.L]);
}
if (MODE === 'planted') for (const e of usable) if (e.arm === 'CONFIRMED') e.y5 += PLANT;
// leverage control: residual of y_h on [1, drop, bounce] over all usable episodes
function ols(y, X) { // X rows [1, x1, x2]; returns residuals
  const k = X[0].length; const XtX = Array.from({ length: k }, () => Array(k).fill(0)); const Xty = Array(k).fill(0);
  for (let i = 0; i < y.length; i++) for (let a = 0; a < k; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b]; }
  // gaussian elimination
  const A = XtX.map((r, i) => [...r, Xty[i]]);
  for (let c = 0; c < k; c++) { let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = 0; r < k; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let cc = c; cc <= k; cc++) A[r][cc] -= f * A[c][cc]; } }
  const beta = A.map((r, i) => r[k] / r[i]);
  return y.map((v, i) => v - X[i].reduce((s, x, a) => s + x * beta[a], 0));
}
const X = usable.map(e => [1, e.drop, e.bounce]);
for (const h of HORIZONS) { const res = ols(usable.map(e => e[`y${h}`]), X); usable.forEach((e, i) => { e[`r${h}`] = res[i]; }); }

const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const diffStat = (key, armKey = 'arm') => rows => { const c = rows.filter(r => r[armKey] === 'CONFIRMED').map(r => r[key]), u = rows.filter(r => r[armKey] === 'UNCONFIRMED').map(r => r[key]); return (c.length && u.length) ? mean(c) - mean(u) : NaN; };
const clusters = usable.map(e => [e]);   // one cluster per de-clustered episode, in time order
const boot = (stat) => clusteredBlockBootstrap(clusters, stat, { meanBlock: BLOCK, nBoot: B, seed: SEED, minClusters: 30 });

// label-shuffle placebo (within CONFIRMED/UNCONFIRMED episodes only)
function shufflePlacebo(key) {
  const rng = mulberry32(SEED); const pool = usable.filter(e => e.arm !== 'MIXED'); const labels = pool.map(e => e.arm); const dist = [];
  for (let b = 0; b < B; b++) { const lab = labels.slice(); for (let i = lab.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [lab[i], lab[j]] = [lab[j], lab[i]]; }
    const c = [], u = []; pool.forEach((e, i) => (lab[i] === 'CONFIRMED' ? c : u).push(e[key])); dist.push(mean(c) - mean(u)); }
  dist.sort((a, b) => a - b); const sdP = sd(dist); return { p95: dist[Math.floor(0.95 * B)], p05: dist[Math.floor(0.05 * B)], sd: sdP };
}
const cells = {};
for (const h of HORIZONS) {
  const rawB = boot(diffStat(`y${h}`)), resB = boot(diffStat(`r${h}`)), shiftB = boot(diffStat(`r${h}`, 'armShift')), plc = shufflePlacebo(`r${h}`);
  const halves = [1, 2].map(hf => diffStat(`r${h}`)(usable.filter(e => e.half === hf)));
  cells[`H1_h${h}`] = { raw: rawB, resid: resB, shifted: shiftB, placebo: plc, halves, bar: h === 5 ? BAR.h5 : BAR.h10 };
}
const fadeB = boot(rows => mean(rows.filter(r => r.arm === 'UNCONFIRMED').map(r => r.y5)));
cells.H2_h5 = { resid: fadeB, halves: [1, 2].map(hf => mean(usable.filter(e => e.arm === 'UNCONFIRMED' && e.half === hf).map(e => e.y5))), bar: BAR.fade };

// gate
const gate = {};
for (const h of HORIZONS) {
  const c = cells[`H1_h${h}`], est = c.resid.obs, [lo, hi] = c.resid.ci95;
  gate[`H1_h${h}`] = { sign: est > 0, size: est >= c.bar, ci: lo > 0, halves: c.halves.every(v => v > 0), placebo: est > c.placebo.p95 && c.bar > c.placebo.sd, shiftedFails: !(c.shifted.obs >= c.bar && c.shifted.ci95[0] > 0) };
  gate[`H1_h${h}`].pass = Object.values(gate[`H1_h${h}`]).every(Boolean);
}
{ const c = cells.H2_h5, est = c.resid.obs; gate.H2_h5 = { sign: est < 0, size: est <= c.bar, ci: c.resid.ci95[1] < 0, halves: c.halves.every(v => v < 0) }; gate.H2_h5.pass = Object.values(gate.H2_h5).every(Boolean); }
const pvals = [cells.H1_h5.resid.pValue, cells.H1_h10.resid.pValue, cells.H2_h5.resid.pValue];
const holmRes = holm(pvals, 0.05);

// descriptive
const byArm = key => Object.fromEntries(['CONFIRMED', 'UNCONFIRMED', 'MIXED'].map(a => [a, +mean(usable.filter(e => e.arm === a).map(e => e[key])).toFixed(3)]));
const desc = {
  legs: { creditOnly: Object.fromEntries(HORIZONS.map(h => [h, boot(rows => mean(rows.filter(r => r.C >= 0).map(r => r[`r${h}`])) - mean(rows.filter(r => r.C < 0).map(r => r[`r${h}`])))])),
          semisOnly: Object.fromEntries(HORIZONS.map(h => [h, boot(rows => mean(rows.filter(r => r.M > 0).map(r => r[`r${h}`])) - mean(rows.filter(r => r.M <= 0).map(r => r[`r${h}`])))])) },
  hitRate5: Object.fromEntries(['CONFIRMED', 'UNCONFIRMED', 'MIXED'].map(a => [a, +(usable.filter(e => e.arm === a && e.y5 > 0).length / Math.max(1, usable.filter(e => e.arm === a).length)).toFixed(3)])),
  giveBack10: Object.fromEntries(['CONFIRMED', 'UNCONFIRMED', 'MIXED'].map(a => [a, +(usable.filter(e => e.arm === a && e.giveBack).length / Math.max(1, usable.filter(e => e.arm === a).length)).toFixed(3)])),
  y5: byArm('y5'), y10: byArm('y10'), y20: byArm('y20'), spx5: byArm('s5'), spx10: byArm('s10'),
  unconditional5: +mean(usable.map(e => e.y5)).toFixed(3), ordinary5: +mean([...postLow].map(i => (N[i + 5] / N[i] - 1) * 100)).toFixed(3),
  byYear: Object.entries(usable.reduce((a, e) => { const y = e.d.slice(0, 4); (a[y] = a[y] || []).push(e); return a; }, {})).map(([y, es]) => ({ y, n: es.length, c: es.filter(e => e.arm === 'CONFIRMED').length, u: es.filter(e => e.arm === 'UNCONFIRMED').length, diff5: +diffStat('r5')(es).toFixed(2) })),
  ex2008_2020: Object.fromEntries(HORIZONS.map(h => [h, +diffStat(`r${h}`)(usable.filter(e => !/^(2008|2020)/.test(e.d))).toFixed(3)])),
  last3y: Object.fromEntries(HORIZONS.map(h => [h, +diffStat(`r${h}`)(usable.filter(e => e.d >= '2023-08-22')).toFixed(3)])),
  oas: oas ? { n: usable.filter(e => e.oasChg != null).length, armsByOas: Object.fromEntries(HORIZONS.map(h => [h, +(mean(usable.filter(e => e.oasChg != null && e.oasChg <= 0).map(e => e[`r${h}`])) - mean(usable.filter(e => e.oasChg != null && e.oasChg > 0).map(e => e[`r${h}`]))).toFixed(3)])) } : null,
};
const descP = [desc.legs.creditOnly[5], desc.legs.creditOnly[10], desc.legs.semisOnly[5], desc.legs.semisOnly[10]].map(b => b.pValue);
const bh = bhFdr(descP, 0.10);

const verdict = MODE === 'planted' ? (gate.H1_h5.ci && cells.H1_h5.resid.obs > cells.H1_h5.placebo.p95 ? 'PLANTED-RECOVERED' : 'PLANTED-MISSED')
  : (gate.H1_h5.pass || gate.H1_h10.pass || gate.H2_h5.pass) ? 'VALIDATED'
  : (mde.h5 <= BAR.h5 && mde.h10 <= BAR.h10 && mde.fade <= Math.abs(BAR.fade)) ? 'NULL' : 'UNDERPOWERED';

const out = { id: 'bounce-confirmation', mode: MODE, verdict, ranAt: new Date().toISOString(), seed: SEED, B, prereg: 'forge/BOUNCE_CONFIRMATION_PREREG.md', preregCommit: '24bb5870', branch: 'ccr-dfef37e6-2ty8zi',
  sample: { n, from: dates[0], to: dates.at(-1), episodes: episodes.length, usable: usable.length, arms: { CONFIRMED: nC, UNCONFIRMED: nU, MIXED: count('MIXED') } }, ctlSd, mde, bar: BAR,
  cells: [
    { name: 'H1 h5 residual diff', n: `${nC} vs ${nU}`, est: cells.H1_h5.resid.obs, lo: cells.H1_h5.resid.ci95[0], hi: cells.H1_h5.resid.ci95[1], raw: cells.H1_h5.raw.obs, rawCi: cells.H1_h5.raw.ci95, mde: +mde.h5.toFixed(2), bar: BAR.h5, p: pvals[0], holmPass: holmRes[0], halves: cells.H1_h5.halves.map(v => +v.toFixed(2)), placebo: cells.H1_h5.placebo, shifted: { est: cells.H1_h5.shifted.obs, ci: cells.H1_h5.shifted.ci95 }, gate: gate.H1_h5 },
    { name: 'H1 h10 residual diff', n: `${nC} vs ${nU}`, est: cells.H1_h10.resid.obs, lo: cells.H1_h10.resid.ci95[0], hi: cells.H1_h10.resid.ci95[1], raw: cells.H1_h10.raw.obs, rawCi: cells.H1_h10.raw.ci95, mde: +mde.h10.toFixed(2), bar: BAR.h10, p: pvals[1], holmPass: holmRes[1], halves: cells.H1_h10.halves.map(v => +v.toFixed(2)), placebo: cells.H1_h10.placebo, shifted: { est: cells.H1_h10.shifted.obs, ci: cells.H1_h10.shifted.ci95 }, gate: gate.H1_h10 },
    { name: 'H2 h5 unconfirmed mean (fade)', n: `${nU}`, est: cells.H2_h5.resid.obs, lo: cells.H2_h5.resid.ci95[0], hi: cells.H2_h5.resid.ci95[1], mde: +mde.fade.toFixed(2), bar: BAR.fade, p: pvals[2], holmPass: holmRes[2], halves: cells.H2_h5.halves.map(v => +v.toFixed(2)), gate: gate.H2_h5 },
  ], descriptive: { ...desc, bhFdr: bh }, episodes: usable.map(e => ({ d: e.d, lowD: e.lowD, drop: +e.drop.toFixed(2), bounce: +e.bounce.toFixed(2), C: +e.C.toFixed(2), M: +e.M.toFixed(2), arm: e.arm, y5: +e.y5.toFixed(2), y10: +e.y10.toFixed(2), y20: +e.y20.toFixed(2), giveBack: e.giveBack })) };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, MODE === 'planted' ? 'planted.json' : 'results.json'), JSON.stringify(out, null, 1));
for (const c of out.cells) console.log(`${c.name.padEnd(32)} est ${c.est >= 0 ? '+' : ''}${c.est.toFixed(2)} [${c.lo.toFixed(2)}, ${c.hi.toFixed(2)}]${c.raw != null ? `  raw ${c.raw >= 0 ? '+' : ''}${c.raw.toFixed(2)}` : ''}  halves ${c.halves.join('/')}  p ${c.p}  holm ${c.holmPass}${c.placebo ? `  placebo p95 ${c.placebo.p95.toFixed(2)} sd ${c.placebo.sd.toFixed(2)}` : ''}${c.shifted ? `  shifted ${c.shifted.est.toFixed(2)} [${c.shifted.ci[0].toFixed(2)}, ${c.shifted.ci[1].toFixed(2)}]` : ''}  gate ${JSON.stringify(c.gate)}`);
console.log(`VERDICT: ${verdict}`);
console.log('descriptive:', JSON.stringify({ y5: desc.y5, y10: desc.y10, hit5: desc.hitRate5, giveBack: desc.giveBack10, unconditional5: desc.unconditional5, ordinary5: desc.ordinary5, legs5: { credit: desc.legs.creditOnly[5].obs, semis: desc.legs.semisOnly[5].obs }, ex0820: desc.ex2008_2020, last3y: desc.last3y, oas: desc.oas }));
