#!/usr/bin/env node
// hedge-method-comparison: walk-forward hedge-ratio comparison. Prereg: forge/HEDGE_METHOD_COMPARISON_PREREG.md (seed 20261120).
//   node scripts/hedge-method-comparison/run.mjs        (needs analysis/output/hedge-method-comparison/daily_closes.json from fetch.mjs)
import fs from 'node:fs';
import { weightPath, hedged, varOf, es5Of, worstDecileMean, rng, wls, WIN0 } from './lib.mjs';

const OUT = new URL('../../analysis/output/hedge-method-comparison/', import.meta.url);
const D = JSON.parse(fs.readFileSync(new URL('daily_closes.json', OUT), 'utf8'));
const SEED = 20261120, B = 500, BLOCK = 21, PLACEBO_DRAWS = 50;
const n = D.dates.length;

// log returns (index 0 = 0, never used: evaluation starts at day 250)
const R = {}; for (const k of D.keys) { R[k] = new Float64Array(n); for (let i = 1; i < n; i++) R[k][i] = Math.log(D.close[k][i] / D.close[k][i - 1]); }
// synthetic dollar index: USD-up return from the five currencies' weights (renormalised, SEK has no leg)
const W = { eurusd: -0.576, gbpusd: -0.119, usdjpy: 0.136, usdcad: 0.091, usdchf: 0.036 }, WS = 0.958;
R.dxy = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; for (const [k, w] of Object.entries(W)) s += w * R[k][i]; R.dxy[i] = s / WS; }

const PROBLEMS = [
  ['gold', ['dxy']], ['gold', ['dxy', 'nq']], ['nq', ['gold', 'usdjpy']], ['nq', ['us2000']], ['us2000', ['gold']], ['us30', ['gold', 'usdjpy']],
  ['eurusd', ['usdchf']], ['gbpusd', ['eurusd', 'usdjpy']], ['audusd', ['nq']], ['audusd', ['nq', 'gold']], ['usdjpy', ['nq']], ['de30', ['nq', 'eurusd']],
].map(([a, h], i) => ({ id: i + 1, a, h, name: `${a.toUpperCase()} <- ${h.map(x => x.toUpperCase()).join(', ')}` }));
const METHODS = ['none', 'naive', 'ols60', 'ols120', 'ols250', 'ewma', 'blend', 'ridge', 'downside', 'minES', 'kalman'];
const m = n - WIN0, half = Math.floor(m / 2);
console.log(`dates ${n} (${D.dates[0]} -> ${D.dates.at(-1)}), eval days ${m} (${D.dates[WIN0]} -> ${D.dates.at(-1)}), problems ${PROBLEMS.length}, methods ${METHODS.length}`);

const U = [...D.keys, 'dxy'];                               // placebo pool: every series outside the problem's own set
const rand = rng(SEED);
const series = {};   // series[problemId][method] = { h (Float64Array), turnover }
const rAeval = {};   // rAeval[problemId] = Float64Array
let t0 = Date.now();
for (const P of PROBLEMS) {
  const rA = R[P.a], RH = P.h.map(k => R[k]);
  rAeval[P.id] = rA.slice(WIN0); series[P.id] = {};
  for (const meth of METHODS) {
    if (meth === 'none') { series[P.id][meth] = { h: rAeval[P.id], turnover: 0 }; continue; }
    const wp = weightPath(meth, rA, RH);
    let to = 0, c = 0; for (let t = WIN0 + 1; t < n; t++) { for (let j = 0; j < RH.length; j++) to += Math.abs(wp[t][j] - wp[t - 1][j]); c++; }
    series[P.id][meth] = { h: hedged(rA, RH, wp), turnover: to / c / RH.length };
  }
  // placebo: ols60 against random partners (same count of legs) from outside the problem's set
  const pool = U.filter(k => k !== P.a && !P.h.includes(k)); const vrs = [];
  for (let d = 0; d < PLACEBO_DRAWS; d++) {
    const pick = []; const bag = [...pool]; for (let j = 0; j < P.h.length; j++) pick.push(bag.splice(Math.floor(rand() * bag.length), 1)[0]);
    const h = hedged(rA, pick.map(k => R[k]), weightPath('ols60', rA, pick.map(k => R[k])));
    vrs.push(1 - varOf(h) / varOf(rAeval[P.id]));
  }
  vrs.sort((x, y) => x - y); series[P.id].placebo = { vr: vrs[Math.floor(vrs.length / 2)] };
  console.log(`problem ${P.id} ${P.name} done (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

// ── point estimates ──
const vr = (h, a) => 1 - varOf(h) / varOf(a);
const pt = {};
for (const P of PROBLEMS) {
  pt[P.id] = {};
  const a = rAeval[P.id], es0 = es5Of(a), wd0 = worstDecileMean(a, a);
  for (const meth of METHODS) {
    const h = series[P.id][meth].h;
    pt[P.id][meth] = {
      vr: vr(h, a), vr1: vr(h.slice(0, half), a.slice(0, half)), vr2: vr(h.slice(half), a.slice(half)),
      es: 1 - es5Of(h) / es0, wd: 1 - worstDecileMean(h, a) / wd0, turnover: series[P.id][meth].turnover,
    };
  }
}
const mean = x => x.reduce((s, v) => s + v, 0) / x.length;
const pooled = (meth, f) => mean(PROBLEMS.map(P => pt[P.id][meth][f]));
const pooledPlacebo = mean(PROBLEMS.map(P => series[P.id].placebo.vr));

// ── block bootstrap on the paired VR difference vs ols60 (same blocks for every problem and method) ──
const rb = rng(SEED + 1);
const nb = Math.ceil(m / BLOCK), boot = {}; for (const meth of METHODS) boot[meth] = [];
const sums = {};   // precomputed prefix sums for fast block resampling
for (const P of PROBLEMS) {
  sums[P.id] = {};
  const a = rAeval[P.id];
  for (const meth of [...METHODS, '_a']) {
    const h = meth === '_a' ? a : series[P.id][meth].h, s1 = new Float64Array(m + 1), s2 = new Float64Array(m + 1);
    for (let i = 0; i < m; i++) { s1[i + 1] = s1[i] + h[i]; s2[i + 1] = s2[i] + h[i] * h[i]; }
    sums[P.id][meth] = [s1, s2];
  }
}
for (let b = 0; b < B; b++) {
  const starts = []; for (let q = 0; q < nb; q++) starts.push(Math.floor(rb() * (m - BLOCK + 1)));
  const vrOf = (P, key) => {
    const [s1, s2] = sums[P.id][key]; let S1 = 0, S2 = 0, N = 0;
    for (const st of starts) { S1 += s1[st + BLOCK] - s1[st]; S2 += s2[st + BLOCK] - s2[st]; N += BLOCK; }
    return S2 / N - (S1 / N) ** 2;
  };
  const per = PROBLEMS.map(P => { const va = vrOf(P, '_a'), out = {}; for (const meth of METHODS) out[meth] = 1 - vrOf(P, meth) / va; return out; });
  for (const meth of METHODS) boot[meth].push(mean(per.map(o => o[meth] - o.ols60)));
}
const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; };

const rows = [];
for (const meth of METHODS) {
  if (meth === 'none' || meth === 'ols60') continue;
  const delta = pooled(meth, 'vr') - pooled('ols60', 'vr');
  const lo = q(boot[meth], 0.025), hi = q(boot[meth], 0.975);
  const pLe = boot[meth].filter(x => x <= 0).length / B, pGe = boot[meth].filter(x => x >= 0).length / B, p = Math.min(1, 2 * Math.min(pLe, pGe));
  const d1 = mean(PROBLEMS.map(P => pt[P.id][meth].vr1 - pt[P.id].ols60.vr1)), d2 = mean(PROBLEMS.map(P => pt[P.id][meth].vr2 - pt[P.id].ols60.vr2));
  const better = PROBLEMS.filter(P => pt[P.id][meth].vr > pt[P.id].ols60.vr).length;
  const beatsPlacebo = pooled(meth, 'vr') > pooledPlacebo;
  rows.push({ meth, delta, lo, hi, p, d1, d2, better, beatsPlacebo, es: pooled(meth, 'es') - pooled('ols60', 'es'), wd: pooled(meth, 'wd') - pooled('ols60', 'wd'), turnover: pooled(meth, 'turnover') });
}
// Benjamini-Hochberg at q = 0.10 across the nine methods
const ordered = [...rows].sort((x, y) => x.p - y.p); let kmax = -1; ordered.forEach((r, i) => { if (r.p <= ((i + 1) / ordered.length) * 0.10) kmax = i; }); ordered.forEach((r, i) => { r.bh = i <= kmax; });
for (const r of rows) {
  const gate = r.delta > 0.01 && r.lo > 0 && r.d1 > 0 && r.d2 > 0 && r.better >= 8 && r.beatsPlacebo;
  const mirror = r.delta < -0.01 && r.hi < 0 && r.d1 < 0 && r.d2 < 0 && r.better <= 4;
  r.verdict = gate && r.bh ? 'VALIDATED (beats OLS60)' : mirror ? 'WORSE than OLS60' : (r.lo >= -0.01 && r.hi <= 0.01) ? 'NULL (equal to OLS60)' : 'UNDERPOWERED';
  r.halfWidth = (r.hi - r.lo) / 2;
}

// ── H2: downside beta vs full beta, first hedge leg, 250d rolling windows every 21 days ──
const h2 = [];
for (const P of PROBLEMS) {
  const rA = R[P.a], rH = [R[P.h[0]]], ba = [], bd = [];
  for (let t = WIN0; t < n; t += 21) {
    const idx = Array.from({ length: 250 }, (_, j) => t - 250 + j), s = idx.map(i => rA[i]).sort((x, y) => x - y), cut = s[Math.floor(s.length * 0.25)];
    const all = wls(rA, rH, idx), dn = wls(rA, rH, idx.filter(i => rA[i] <= cut), null, 1e-6);
    if (all && dn) { ba.push(all[0]); bd.push(dn[0]); }
  }
  const med = x => { const s = [...x].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const ratios = ba.map((b, i) => (Math.abs(b) > 0.05 ? bd[i] / b : null)).filter(x => x != null);
  h2.push({ problem: P.name, windows: ba.length, betaAll: med(ba), betaDown: med(bd), medianRatio: ratios.length ? med(ratios) : null, shareDownLarger: bd.filter((x, i) => Math.abs(x) > Math.abs(ba[i])).length / ba.length });
}

const results = {
  seed: SEED, B, block: BLOCK, dates: [D.dates[0], D.dates.at(-1)], evalFrom: D.dates[WIN0], nDates: n, evalDays: m,
  problems: PROBLEMS.map(P => ({ id: P.id, name: P.name })), methods: METHODS, pooled: Object.fromEntries(METHODS.map(me => [me, { vr: pooled(me, 'vr'), es: pooled(me, 'es'), wd: pooled(me, 'wd'), turnover: pooled(me, 'turnover') }])),
  placeboVr: pooledPlacebo, perProblem: pt, versusOls60: rows, h2,
};
fs.writeFileSync(new URL('results.json', OUT), JSON.stringify(results, null, 2));

const pct = x => (100 * x).toFixed(1) + '%', pp = x => (x >= 0 ? '+' : '') + (100 * x).toFixed(2) + 'pp';
let md = `# hedge-method-comparison - RESULTS (generated by run.mjs)\n\nSeed ${SEED}, ${B} bootstrap resamples, ${BLOCK}-day blocks. ${n} common dates ${D.dates[0]} -> ${D.dates.at(-1)}, evaluation from ${D.dates[WIN0]} (${m} days), 12 problems.\n\n## Pooled out-of-sample (mean over the 12 problems)\n\n| Method | Variance removed | 5% tail cut | Worst-decile capture | Turnover/day |\n|---|---|---|---|---|\n`;
for (const me of METHODS) md += `| ${me} | ${pct(pooled(me, 'vr'))} | ${pct(pooled(me, 'es'))} | ${pct(pooled(me, 'wd'))} | ${pooled(me, 'turnover').toFixed(4)} |\n`;
md += `| placebo (ols60, random partner, median of ${PLACEBO_DRAWS}) | ${pct(pooledPlacebo)} | | | |\n\n## Versus the benchmark (ols60), paired, block bootstrap\n\n| Method | dVR | 95% CI | half-width | p | first half | second half | problems better (of 12) | BH q=0.10 | d tail | d worst-decile | verdict |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.meth} | ${pp(r.delta)} | [${pp(r.lo)}, ${pp(r.hi)}] | ${pp(r.halfWidth)} | ${r.p.toFixed(3)} | ${pp(r.d1)} | ${pp(r.d2)} | ${r.better} | ${r.bh ? 'yes' : 'no'} | ${pp(r.es)} | ${pp(r.wd)} | ${r.verdict} |\n`;
md += `\n## Per problem: variance removed out of sample\n\n| Problem | ${METHODS.join(' | ')} |\n|---|${METHODS.map(() => '---').join('|')}|\n`;
for (const P of PROBLEMS) md += `| ${P.name} | ${METHODS.map(me => pct(pt[P.id][me].vr)).join(' | ')} |\n`;
md += `\n## H2: downside beta vs full beta (first hedge leg, 250-day windows every 21 days; downside = A's worst 25% days)\n\n| Problem | windows | median beta (all days) | median beta (worst 25%) | median ratio | share of windows with larger downside beta |\n|---|---|---|---|---|---|\n`;
for (const r of h2) md += `| ${r.problem} | ${r.windows} | ${r.betaAll.toFixed(3)} | ${r.betaDown.toFixed(3)} | ${r.medianRatio == null ? 'n/a' : r.medianRatio.toFixed(2)} | ${pct(r.shareDownLarger)} |\n`;
fs.writeFileSync(new URL('RESULTS_TABLES.md', OUT), md);
console.log(md);
process.exit(0);
