#!/usr/bin/env node
// hedge-method-comparison A2 (POST-HOC, results seen): H2 re-done without the selection bias. Conditioning on A's worst days (the pre-registered H2 / M8) truncates the DEPENDENT variable, which
// shrinks an OLS slope toward zero even when the relationship is perfectly linear. Conditioning on the HEDGE leg's own days (its worst 25%, best 25%, and largest |move| 25%) does not.
// Descriptive only. node scripts/hedge-method-comparison/h2b.mjs
import fs from 'node:fs';
import { wls, WIN0 } from './lib.mjs';
const OUT = new URL('../../analysis/output/hedge-method-comparison/', import.meta.url);
const D = JSON.parse(fs.readFileSync(new URL('daily_closes.json', OUT), 'utf8')), n = D.dates.length;
const R = {}; for (const k of D.keys) { R[k] = new Float64Array(n); for (let i = 1; i < n; i++) R[k][i] = Math.log(D.close[k][i] / D.close[k][i - 1]); }
const W = { eurusd: -0.576, gbpusd: -0.119, usdjpy: 0.136, usdcad: 0.091, usdchf: 0.036 }; R.dxy = new Float64Array(n);
for (let i = 0; i < n; i++) { let s = 0; for (const [k, w] of Object.entries(W)) s += w * R[k][i]; R.dxy[i] = s / 0.958; }
const PAIRS = [['gold', 'dxy'], ['nq', 'gold'], ['nq', 'us2000'], ['us2000', 'gold'], ['us30', 'gold'], ['eurusd', 'usdchf'], ['gbpusd', 'eurusd'], ['audusd', 'nq'], ['usdjpy', 'nq'], ['de30', 'nq']];
const med = x => { const s = [...x].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const rows = [];
for (const [a, h] of PAIRS) {
  const rA = R[a], rH = [R[h]], all = [], worst = [], best = [], big = [];
  for (let t = WIN0; t < n; t += 21) {
    const idx = Array.from({ length: 250 }, (_, j) => t - 250 + j), hv = idx.map(i => rH[0][i]).sort((x, y) => x - y), av = idx.map(i => Math.abs(rH[0][i])).sort((x, y) => x - y);
    const lo = hv[Math.floor(hv.length * 0.25)], hi = hv[Math.floor(hv.length * 0.75)], bg = av[Math.floor(av.length * 0.75)];
    const f = (cond) => wls(rA, rH, idx.filter(cond), null, 1e-6)?.[0];
    const b0 = wls(rA, rH, idx)?.[0], bw = f(i => rH[0][i] <= lo), bb = f(i => rH[0][i] >= hi), bm = f(i => Math.abs(rH[0][i]) >= bg);
    if ([b0, bw, bb, bm].every(Number.isFinite)) { all.push(b0); worst.push(bw); best.push(bb); big.push(bm); }
  }
  rows.push({ pair: `${a.toUpperCase()} <- ${h.toUpperCase()}`, windows: all.length, all: med(all), whenHedgeWorst: med(worst), whenHedgeBest: med(best), whenHedgeBigMove: med(big) });
}
const f3 = x => x.toFixed(3);
let md = `\n## A2 (POST-HOC): beta conditioned on the HEDGE leg's days, not on A's\n\nMedian beta over 250-day windows every 21 days. Conditioning on the hedge leg does not shrink the slope mechanically. "Worst" = the hedge leg's worst 25% days in the window, "best" = its best 25%, "big move" = its largest 25% by absolute move.\n\n| Pair | windows | beta all days | beta when the hedge leg is at its worst | at its best | on big moves |\n|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.pair} | ${r.windows} | ${f3(r.all)} | ${f3(r.whenHedgeWorst)} | ${f3(r.whenHedgeBest)} | ${f3(r.whenHedgeBigMove)} |\n`;
fs.writeFileSync(new URL('RESULTS_A2.md', OUT), md); fs.writeFileSync(new URL('h2b.json', OUT), JSON.stringify(rows, null, 2));
console.log(md); process.exit(0);
