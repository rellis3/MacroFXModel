/**
 * Does relaxing "one trade per day" find real edge the baseline engine is
 * missing? Owner's observation: on a real intraday chart it's common to see
 * a SECOND qualifying impulse the same day, after the first one has already
 * resolved — the baseline engine (js/impulseEmaRangeV2Engine.js) only ever
 * takes the FIRST qualifying setup per day and ignores every later one, a
 * pinned call flagged as untested in RESULTS.md's caveats.
 *
 * `maxTradesPerDay` is now a backward-compatible cfg on the shared engine
 * (default 1, verified byte-identical to the existing committed baseline
 * trades.json for both instruments before this script was trusted). This
 * sweeps maxTradesPerDay = 1 (control) / 2 / 3 / 5 and reports whether
 * taking every later same-day setup changes Sharpe/PF/win-rate — not just
 * trade count.
 *
 * Usage: node multi_trade_per_day.mjs <gold|nq> <outDir> [m1Dir]
 */
import { loadM1ForPair } from '/home/user/MacroFXModel/js/volBacktestM1Engine.js';
import { runImpulseEmaRange } from '/home/user/MacroFXModel/js/impulseEmaRangeV2Engine.js';
import { summarizeSplit } from '/home/user/MacroFXModel/js/honestForecastEngine.js';
import { summarizeTrades } from '/home/user/MacroFXModel/js/metricsCore.js';
import fs from 'fs';

const pair = process.argv[2];
const outDir = process.argv[3];
const m1Dir = process.argv[4] || undefined;
if (!pair || !outDir) { console.error('usage: multi_trade_per_day.mjs <gold|nq> <outDir> [m1Dir]'); process.exit(1); }

const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no data`); process.exit(2); }

const GRID = [1, 2, 3, 5];
const results = [];

for (const maxTradesPerDay of GRID) {
  const t0 = Date.now();
  const { trades, records } = runImpulseEmaRange(packed, { instrument: pair, maxTradesPerDay });
  const split = summarizeSplit(records, 0.4);
  const full = summarizeTrades(records.map(r => r.pnl_pct), records.map(r => r.date));
  const isP = records.filter(r => split.splitDate ? r.date < split.splitDate : true);
  const oosP = records.filter(r => split.splitDate ? r.date >= split.splitDate : false);
  const oos = summarizeTrades(oosP.map(r => r.pnl_pct), oosP.map(r => r.date));

  // How many days actually had a 2nd+ trade, and how the extras alone did
  // (are they diluting the mix, or a distinct-quality subset?).
  const byDate = new Map();
  for (const t of trades) byDate.set(t.date, (byDate.get(t.date) || 0) + 1);
  const daysWithExtra = [...byDate.values()].filter(n => n > 1).length;
  const firstOfDay = new Set();
  const extras = [];
  for (const t of trades) {
    if (!firstOfDay.has(t.date)) { firstOfDay.add(t.date); continue; }
    extras.push(t);
  }
  const extrasSummary = extras.length ? summarizeTrades(extras.map(t => t.netPct), extras.map(t => t.date)) : null;

  const row = {
    maxTradesPerDay, nTrades: trades.length, daysWithExtra,
    winRate: full.winRate, sharpe: full.sharpe, profitFactor: full.profitFactor,
    oosSharpe: oos.sharpe, oosTrades: oos.trades,
    extrasCount: extras.length, extrasWinRate: extrasSummary?.winRate ?? null, extrasSharpe: extrasSummary?.sharpe ?? null,
    ms: Date.now() - t0,
  };
  results.push(row);
  console.error(`maxTradesPerDay=${maxTradesPerDay}: ${row.nTrades} trades (${daysWithExtra} days w/ 2+), winRate=${row.winRate}% sharpe=${row.sharpe} PF=${row.profitFactor} oosSharpe=${row.oosSharpe}(n=${row.oosTrades})  [2nd+-only: n=${row.extrasCount} winRate=${row.extrasWinRate}% sharpe=${row.extrasSharpe}]  ${row.ms}ms`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${pair}.multi_trade_per_day.json`, JSON.stringify({ pair, results }, null, 2));
console.error(`\nwrote ${outDir}/${pair}.multi_trade_per_day.json`);
