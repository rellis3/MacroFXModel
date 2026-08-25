/**
 * Fade-the-extension trade test (2026-08-23 follow-up).
 *
 * A colleague is reported (second-hand) to trade this pattern as a FADE:
 * once price extends at least ~2 range-widths beyond the impulse candle's
 * own edge (fib >= 2 bullish / fib <= -1 bearish — sub-2 is "still within
 * the impulse"), enter counter-trend at that ladder rung, target back to
 * the impulse candle's own median (fib=0.5). See simulateFadeTrade in
 * js/impulse4hRangeLevelsEngine.js for every pinned judgment call named.
 *
 * Reuses the impulses already detected and saved by run_analysis.mjs
 * (data/<pair>.impulses.json already carries low/high/range/atr/bullish/
 * m1StartIdx/m1EndIdx per impulse) — only re-loads the M1 packed arrays,
 * no re-detection needed.
 *
 * Usage: node fade_extension_trade.mjs <pairKey> <dataDir> [stopRungsOut] [m1Dir]
 */
import { loadM1ForPair } from '../../../js/volBacktestM1Engine.js';
import { simulateFadeTrade, metaFor, splitByDateFrac } from '../../../js/impulse4hRangeLevelsEngine.js';
import { summarizeTrades } from '../../../js/metricsCore.js';
import fs from 'fs';

const pair = process.argv[2];
const dataDir = process.argv[3];
const stopRungsOut = process.argv[4] ? Number(process.argv[4]) : 1;
const m1Dir = process.argv[5] || undefined;
if (!pair || !dataDir) { console.error('usage: fade_extension_trade.mjs <pairKey> <dataDir> [stopRungsOut] [m1Dir]'); process.exit(1); }

const impulsesPath = `${dataDir}/${pair}.impulses.json`;
if (!fs.existsSync(impulsesPath)) { console.error(`${pair}: ${impulsesPath} not found — run run_analysis.mjs first`); process.exit(2); }
const impulses = JSON.parse(fs.readFileSync(impulsesPath, 'utf8'));

const t0 = Date.now();
const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no M1 data — cannot run`); process.exit(2); }
console.error(`${pair}: loaded ${packed.n} M1 bars, ${impulses.length} saved impulses, in ${Date.now() - t0}ms`);

const cfg = { entryFib: 2.0, stopRungsOut };
const costPct = metaFor(pair).costPct;

const rows = [];
let nTriggered = 0, nFilled = 0;
for (const imp of impulses) {
  const r = simulateFadeTrade(packed, imp, imp.m1StartIdx, imp.m1EndIdx, cfg, costPct);
  if (r.triggered) nTriggered++;
  if (r.triggered && r.filled) {
    nFilled++;
    rows.push({ date: imp.date, bullish: imp.bullish, rangeAtrMult: imp.rangeAtrMult, ...r });
  }
}

const pnls = rows.map(r => r.netPct);
const dates = rows.map(r => r.date);
const full = summarizeTrades(pnls, dates);
const { is, oos } = splitByDateFrac(rows, 0.4, 'date');
const isSum = summarizeTrades(is.map(r => r.netPct), is.map(r => r.date));
const oosSum = summarizeTrades(oos.map(r => r.netPct), oos.map(r => r.date));

const out = {
  pair, stopRungsOut, entryFib: cfg.entryFib,
  nImpulses: impulses.length,
  nTriggered, triggerRate: +(nTriggered / impulses.length).toFixed(4),
  nFilled,
  full, is: isSum, oos: oosSum,
  trades: rows,
};
fs.mkdirSync(dataDir, { recursive: true });
const label = stopRungsOut === 1 ? pair : `${pair}_stopRungs${stopRungsOut}`;
fs.writeFileSync(`${dataDir}/${label}.fade_extension_trade.json`, JSON.stringify(out, null, 2));
console.error(`${label}: trigger=${nTriggered}/${impulses.length} (${(out.triggerRate * 100).toFixed(1)}%) filled=${nFilled} winRate=${full.winRate}% PF=${full.profitFactor} sharpe=${full.sharpe} oos.sharpe=${oosSum.sharpe}(n=${oosSum.trades}) in ${Date.now() - t0}ms`);
