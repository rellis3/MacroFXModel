/**
 * Liquidity-sweep filter: a well-known modern retail concept ("Judas swing" /
 * stop-hunt-then-reversal) — an impulsive leg only "counts" if its ORIGIN
 * point first swept (took out) a prior day's high/low before reversing. The
 * baseline engine takes ANY leg >= impulseAtrMult x ATR, with no check on
 * whether it actually ran stops first. Does requiring a real sweep behind
 * the leg improve the (already-null) trade population?
 *
 * Uses legOriginTime (a v2-only, purely-additive field — v1 stays pinned
 * and untouched, see js/impulseEmaRangeV2Engine.js's header) to find which
 * day the leg's origin bar falls in, and v2's own exported buildDaily to
 * get that day's prior-day H/L for comparison — reusing the engine's exact
 * day-bucketing, not a re-copy. Runs v2 at its v1-matching defaults (no new
 * backtest behavior — verified byte-identical to v1's committed baseline
 * before any of this session's follow-up numbers were trusted) to get the
 * timestamped trade population directly, rather than reading v1's
 * trades.json (which doesn't carry legOriginTime).
 *
 * up leg   (buy continuation)  -> "swept" if legOrigin < prior day's low
 * down leg (sell continuation) -> "swept" if legOrigin > prior day's high
 *
 * Usage: node liquidity_sweep_filter.mjs <gold|nq> <outDir> [m1Dir]
 */
import { loadM1ForPair } from '/home/user/MacroFXModel/js/volBacktestM1Engine.js';
import { runImpulseEmaRange, buildDaily } from '/home/user/MacroFXModel/js/impulseEmaRangeV2Engine.js';
import { summarizeTrades } from '/home/user/MacroFXModel/js/metricsCore.js';
import { summarizeSplit } from '/home/user/MacroFXModel/js/honestForecastEngine.js';
import fs from 'fs';

const pair = process.argv[2];
const outDir = process.argv[3];
const m1Dir = process.argv[4] || undefined;
if (!pair || !outDir) { console.error('usage: liquidity_sweep_filter.mjs <gold|nq> <outDir> [m1Dir]'); process.exit(1); }

const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no data`); process.exit(2); }

const daily = buildDaily(packed);
const DAY = 86400;
const dayIndexByKey = new Map(daily.map((d, i) => [d.time, i]));

const trades = runImpulseEmaRange(packed, { instrument: pair }).trades;
console.error(`${pair}: ${trades.length} baseline trades loaded`);

let missingPriorDay = 0;
const withFlag = trades.map(t => {
  const originDayKey = t.legOriginTime - (t.legOriginTime % DAY);
  const di = dayIndexByKey.get(originDayKey);
  if (di == null || di === 0) { missingPriorDay++; return { ...t, swept: null }; }
  const prior = daily[di - 1];
  const swept = t.legDir === 'up' ? t.legOrigin < prior.low : t.legOrigin > prior.high;
  return { ...t, swept };
});

const swept = withFlag.filter(t => t.swept === true);
const notSwept = withFlag.filter(t => t.swept === false);

function report(label, group) {
  if (!group.length) { console.error(`${label}: 0 trades`); return null; }
  const s = summarizeTrades(group.map(t => t.netPct), group.map(t => t.date));
  const records = group.map(t => ({ filled: true, pnl_pct: t.netPct, date: t.date }));
  const split = summarizeSplit(records, 0.4);
  const isP = group.filter(t => split.splitDate ? t.date < split.splitDate : true);
  const oosP = group.filter(t => split.splitDate ? t.date >= split.splitDate : false);
  const is = summarizeTrades(isP.map(t => t.netPct), isP.map(t => t.date));
  const oos = summarizeTrades(oosP.map(t => t.netPct), oosP.map(t => t.date));
  console.error(`${label}: n=${group.length} winRate=${s.winRate}% sharpe=${s.sharpe} PF=${s.profitFactor} totalR=${group.reduce((a, t) => a + t.rMult, 0).toFixed(1)}  |  IS sharpe=${is.sharpe}(n=${is.trades}) OOS sharpe=${oos.sharpe}(n=${oos.trades})`);
  return { ...s, isSharpe: is.sharpe, isN: is.trades, oosSharpe: oos.sharpe, oosN: oos.trades };
}

console.error(`\n${pair} — liquidity-sweep filter (missingPriorDay=${missingPriorDay})`);
const fullS = report('all trades (baseline)', withFlag.filter(t => t.swept !== null));
const sweptS = report('swept prior day H/L before reversing', swept);
const notSweptS = report('did NOT sweep (leg formed inside range)', notSwept);

fs.writeFileSync(`${outDir}/${pair}.liquidity_sweep_filter.json`, JSON.stringify({
  pair, missingPriorDay, nSwept: swept.length, nNotSwept: notSwept.length,
  full: fullS, sweptSummary: sweptS, notSweptSummary: notSweptS,
}, null, 2));
console.error(`\nwrote ${outDir}/${pair}.liquidity_sweep_filter.json`);
