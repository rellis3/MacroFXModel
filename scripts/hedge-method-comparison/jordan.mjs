#!/usr/bin/env node
// jordan-usdchf-hedge (EXPLORATORY, not pre-registered): the hedge Jordan posted on 2026-11-20 in the C.OG thread: short USD/CHF as the main trade, hedged with a short in EUR/USD, GBP/USD and NZD/USD.
// How much of USD/CHF's daily variance and bad-day tail does that hedge remove out of sample, with equal sizes versus regression sizes? Same panel and walk-forward as hedge-method-comparison (weights from days before t).
// node scripts/hedge-method-comparison/jordan.mjs   (needs analysis/output/hedge-method-comparison/daily_closes.json)
import fs from 'node:fs';
import { weightPath, hedged, varOf, es5Of, worstDecileMean, WIN0 } from './lib.mjs';
const OUT = new URL('../../analysis/output/hedge-method-comparison/', import.meta.url);
const D = JSON.parse(fs.readFileSync(new URL('daily_closes.json', OUT), 'utf8')), n = D.dates.length;
const R = {}; for (const k of D.keys) { R[k] = new Float64Array(n); for (let i = 1; i < n; i++) R[k][i] = Math.log(D.close[k][i] / D.close[k][i - 1]); }
const rA = R.usdchf, legs = ['eurusd', 'gbpusd', 'nzdusd'], RH = legs.map(k => R[k]);
const evalA = rA.slice(WIN0), m = evalA.length, half = Math.floor(m / 2);
const fixed = w => { const h = new Float64Array(m); for (let t = WIN0; t < n; t++) { let v = rA[t]; for (let j = 0; j < 3; j++) v -= w[j] * RH[j][t]; h[t - WIN0] = v; } return h; };
const arms = {
  'no hedge': new Float64Array(evalA),
  'Jordan, equal 1:1:1 (each leg the same size as the main)': fixed([-1, -1, -1]),
  'equal total size (1/3 each)': fixed([-1 / 3, -1 / 3, -1 / 3]),
  'regression sizes, 60-day': hedged(rA, RH, weightPath('ols60', rA, RH)),
  'regression sizes, EWMA': hedged(rA, RH, weightPath('ewma', rA, RH)),
  'regression sizes, 250-day': hedged(rA, RH, weightPath('ols250', rA, RH)),
};
const es0 = es5Of(evalA), wd0 = worstDecileMean(evalA, evalA), v0 = varOf(evalA);
const pct = x => (100 * x).toFixed(1) + '%';
const rows = Object.entries(arms).map(([name, h]) => ({ name, vr: 1 - varOf(h) / v0, vr1: 1 - varOf(h.slice(0, half)) / varOf(evalA.slice(0, half)), vr2: 1 - varOf(h.slice(half)) / varOf(evalA.slice(half)), es: 1 - es5Of(h) / es0, wd: 1 - worstDecileMean(h, evalA) / wd0, sd: Math.sqrt(varOf(h)) * 100 }));
// the average regression weights in the last year, to show what "regression sizes" look like next to 1:1:1
const wp = weightPath('ols60', rA, RH), last = wp.slice(-250).filter(Boolean), avg = [0, 1, 2].map(j => last.reduce((s, w) => s + w[j], 0) / last.length);
let md = `# jordan-usdchf-hedge (EXPLORATORY, not pre-registered)\n\nJordan's hedge from the C.OG thread (2026-11-20): short USD/CHF (main), short EUR/USD, GBP/USD and NZD/USD. Panel ${D.dates[0]} -> ${D.dates.at(-1)}, ${m} walk-forward days from ${D.dates[WIN0]}, daily NY-close returns, no costs. Same method as hedge-method-comparison. Exploratory: one hedge, no gate, no interval.\n\n| Hedge sizing | Variance removed | first half | second half | 5% tail cut | worst-decile capture | daily sd of the hedged position |\n|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.name} | ${pct(r.vr)} | ${pct(r.vr1)} | ${pct(r.vr2)} | ${pct(r.es)} | ${pct(r.wd)} | ${r.sd.toFixed(3)}% |\n`;
md += `\nAverage 60-day regression weights over the last 250 days (units of hedge return per unit of USD/CHF return, hedge direction negative = short alongside a short main): EUR/USD ${avg[0].toFixed(2)}, GBP/USD ${avg[1].toFixed(2)}, NZD/USD ${avg[2].toFixed(2)}. Equal sizing is -1, -1, -1.\n`;
fs.writeFileSync(new URL('JORDAN_HEDGE.md', OUT), md); console.log(md); process.exit(0);
