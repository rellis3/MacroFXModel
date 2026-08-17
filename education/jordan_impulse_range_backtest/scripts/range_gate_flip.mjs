/**
 * Is the range gate backwards? The baseline engine only takes a continuation
 * trade while the day's range-so-far has ROOM LEFT vs the trailing median
 * (rangeGateMode: 'roomLeft', usedFracOfMedian <= 1.0) — a "the day isn't
 * spent yet" read of the "H-L Range: Live/Median/75th Pct" tool visible in
 * the screenshots. Equally plausible from that same visible tool: Jordan
 * takes the trade once the day is already STRETCHED relative to a typical
 * session — a momentum/trend-day read, the opposite condition.
 *
 * `rangeGateMode: 'exhausted'` (js/impulseEmaRangeV2Engine.js, backward-
 * compatible cfg, default unchanged — verified byte-identical to the
 * committed baseline before trusting this) requires usedFracOfMedian >=
 * rangeGateMinUsedFrac instead of <=. Sweeps the threshold.
 *
 * Usage: node range_gate_flip.mjs <gold|nq> <outDir> [m1Dir]
 */
import { loadM1ForPair } from '/home/user/MacroFXModel/js/volBacktestM1Engine.js';
import { runImpulseEmaRange } from '/home/user/MacroFXModel/js/impulseEmaRangeV2Engine.js';
import { summarizeSplit } from '/home/user/MacroFXModel/js/honestForecastEngine.js';
import { summarizeTrades } from '/home/user/MacroFXModel/js/metricsCore.js';
import fs from 'fs';

const pair = process.argv[2];
const outDir = process.argv[3];
const m1Dir = process.argv[4] || undefined;
if (!pair || !outDir) { console.error('usage: range_gate_flip.mjs <gold|nq> <outDir> [m1Dir]'); process.exit(1); }

const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no data`); process.exit(2); }

const THRESHOLDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
const rows = [];

for (const rangeGateMinUsedFrac of THRESHOLDS) {
  const t0 = Date.now();
  const { trades, records } = runImpulseEmaRange(packed, { instrument: pair, rangeGateMode: 'exhausted', rangeGateMinUsedFrac });
  const split = summarizeSplit(records, 0.4);
  const full = summarizeTrades(records.map(r => r.pnl_pct), records.map(r => r.date));
  const oosP = records.filter(r => split.splitDate ? r.date >= split.splitDate : false);
  const oos = summarizeTrades(oosP.map(r => r.pnl_pct), oosP.map(r => r.date));
  const row = { rangeGateMinUsedFrac, nTrades: trades.length, winRate: full.winRate, sharpe: full.sharpe, pf: full.profitFactor, oosSharpe: oos.sharpe, oosN: oos.trades, ms: Date.now() - t0 };
  rows.push(row);
  console.error(`exhausted>=${rangeGateMinUsedFrac}: ${row.nTrades} trades winRate=${row.winRate}% sharpe=${row.sharpe} PF=${row.pf} oosSharpe=${row.oosSharpe}(n=${row.oosN})  ${row.ms}ms`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${pair}.range_gate_flip.json`, JSON.stringify({ pair, rows }, null, 2));
console.error(`\nwrote ${outDir}/${pair}.range_gate_flip.json`);
