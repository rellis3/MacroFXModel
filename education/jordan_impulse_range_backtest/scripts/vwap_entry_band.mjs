/**
 * Is a fixed 38.2-61.8% Fib retracement the real pullback-quality trigger, or
 * would distance from the session's own VWAP explain the entries just as
 * well (or better)? Same impulse/EMA/range gates, only the "is this pullback
 * good enough to enter" check changes: entryBandMode: 'vwap' requires
 * |close - sessionVWAP| <= vwapBandAtrMult x ATR instead of a Fib fraction.
 *
 * Usage: node vwap_entry_band.mjs <gold|nq> <outDir> [m1Dir]
 */
import { loadM1ForPair } from '/home/user/MacroFXModel/js/volBacktestM1Engine.js';
import { runImpulseEmaRange } from '/home/user/MacroFXModel/js/impulseEmaRangeV1Engine.js';
import { summarizeSplit } from '/home/user/MacroFXModel/js/honestForecastEngine.js';
import { summarizeTrades } from '/home/user/MacroFXModel/js/metricsCore.js';
import fs from 'fs';

const pair = process.argv[2];
const outDir = process.argv[3];
const m1Dir = process.argv[4] || undefined;
if (!pair || !outDir) { console.error('usage: vwap_entry_band.mjs <gold|nq> <outDir> [m1Dir]'); process.exit(1); }

const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no data`); process.exit(2); }

const THRESHOLDS = [0.25, 0.5, 0.75, 1.0, 1.5];
const rows = [];

for (const vwapBandAtrMult of THRESHOLDS) {
  const t0 = Date.now();
  const { trades, records } = runImpulseEmaRange(packed, { instrument: pair, entryBandMode: 'vwap', vwapBandAtrMult });
  const split = summarizeSplit(records, 0.4);
  const full = summarizeTrades(records.map(r => r.pnl_pct), records.map(r => r.date));
  const oosP = records.filter(r => split.splitDate ? r.date >= split.splitDate : false);
  const oos = summarizeTrades(oosP.map(r => r.pnl_pct), oosP.map(r => r.date));
  const row = { vwapBandAtrMult, nTrades: trades.length, winRate: full.winRate, sharpe: full.sharpe, pf: full.profitFactor, oosSharpe: oos.sharpe, oosN: oos.trades, ms: Date.now() - t0 };
  rows.push(row);
  console.error(`vwapBand=${vwapBandAtrMult}xATR: ${row.nTrades} trades winRate=${row.winRate}% sharpe=${row.sharpe} PF=${row.pf} oosSharpe=${row.oosSharpe}(n=${row.oosN})  ${row.ms}ms`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${pair}.vwap_entry_band.json`, JSON.stringify({ pair, rows }, null, 2));
console.error(`\nwrote ${outDir}/${pair}.vwap_entry_band.json`);
