/**
 * Session/time-of-day disaggregation of the baseline impulse/EMA/range
 * engine's trade population. Question: does pooling all 24 hours hide a
 * real subset edge that only fires in a specific session (London open, NY
 * open, etc.), the way a discretionary trader like the screenshots' would
 * naturally condition on?
 *
 * Multiple-testing discipline (CLAUDE.md "How we talk about results"):
 * bucketing by UTC hour-of-day is 24 cells. At a 5% single-test false-
 * positive rate, ~1 cell looking "significant" by chance alone is expected
 * even with zero real effect. A survivor must (a) clear a real bar (n≥30,
 * positive Sharpe) AND (b) be IS/OOS-consistent (not just full-sample
 * positive) to count for anything — reported below, not just the ranked list.
 *
 * Bucketed by `legExtremeTime` (when the impulse's pullback actually begins
 * forming), NOT `fillTime`. A first pass bucketed by fillTime and found 77%
 * of all gold trades landing in hours 22-04 UTC, with 78% of the hour-00
 * trades filling within 30 minutes of midnight — not a real session effect,
 * but an artifact of the day-loop's daily reset: it re-scans from UTC
 * midnight every day and takes the FIRST qualifying setup, which is very
 * often a leg that was already fully formed before midnight (carried over
 * from the prior day/session), so the trade's fill gets artificially
 * anchored to day-start regardless of when the actual pattern formed.
 * `legExtremeTime` is the moment the leg's own pullback begins — the
 * meaningful "when did this shape start" timestamp, immune to the
 * day-boundary artifact. It's a v2-only, purely-additive field (v1 stays
 * pinned and untouched, see js/impulseEmaRangeV2Engine.js's header), so
 * this script runs v2 at its v1-matching defaults (verified byte-identical
 * to v1's committed baseline) to get the timestamped trade population
 * directly, rather than reading v1's own trades.json off disk.
 *
 * Usage: node session_split.mjs <gold|nq> <outDir> [m1Dir]
 */
import { loadM1ForPair } from '/home/user/MacroFXModel/js/volBacktestM1Engine.js';
import { runImpulseEmaRange } from '/home/user/MacroFXModel/js/impulseEmaRangeV2Engine.js';
import { summarizeTrades } from '/home/user/MacroFXModel/js/metricsCore.js';
import fs from 'fs';

const pair = process.argv[2];
const outDir = process.argv[3];
const m1Dir = process.argv[4] || undefined;
if (!pair || !outDir) { console.error('usage: session_split.mjs <gold|nq> <outDir> [m1Dir]'); process.exit(1); }

const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no data`); process.exit(2); }
const trades = runImpulseEmaRange(packed, { instrument: pair }).trades;
console.error(`${pair}: ${trades.length} trades generated (v2 @ v1-matching defaults)`);

const byHour = new Map();
for (const t of trades) {
  const h = new Date(t.legExtremeTime * 1000).getUTCHours();
  if (!byHour.has(h)) byHour.set(h, []);
  byHour.get(h).push(t);
}

const rows = [];
const sortedDates = trades.map(t => t.date).sort();
const splitIdx = Math.floor(sortedDates.length * 0.6);
const splitDate = sortedDates[splitIdx];

for (let h = 0; h < 24; h++) {
  const group = byHour.get(h) || [];
  if (!group.length) { rows.push({ hour: h, n: 0 }); continue; }
  const full = summarizeTrades(group.map(t => t.netPct), group.map(t => t.date));
  const isG = group.filter(t => t.date < splitDate);
  const oosG = group.filter(t => t.date >= splitDate);
  const is = summarizeTrades(isG.map(t => t.netPct), isG.map(t => t.date));
  const oos = summarizeTrades(oosG.map(t => t.netPct), oosG.map(t => t.date));
  rows.push({
    hour: h, n: group.length, winRate: full.winRate, sharpe: full.sharpe, pf: full.profitFactor,
    isSharpe: is.sharpe, isN: is.trades, oosSharpe: oos.sharpe, oosN: oos.trades,
  });
}

rows.sort((a, b) => (b.sharpe ?? -Infinity) - (a.sharpe ?? -Infinity));
console.error(`\n${pair} — trades by UTC hour-of-day, sorted best full-sample Sharpe first`);
console.error('hour  n     winRate  sharpe   PF     IS sharpe(n)      OOS sharpe(n)');
for (const r of rows) {
  if (!r.n) { console.error(`${String(r.hour).padStart(2, '0')}    0     —`); continue; }
  console.error(`${String(r.hour).padStart(2, '0')}    ${String(r.n).padEnd(5)} ${String(r.winRate).padEnd(7)}  ${String(r.sharpe).padEnd(7)}  ${String(r.pf).padEnd(5)}  ${r.isSharpe}(n=${r.isN})`.padEnd(70) + `${r.oosSharpe}(n=${r.oosN})`);
}

// Survivor bar: n>=30 total AND IS/OOS both positive AND full-sample positive.
const survivors = rows.filter(r => r.n >= 30 && r.sharpe > 0 && r.isSharpe > 0 && r.oosSharpe > 0);
const cellsWithEnoughData = rows.filter(r => r.n >= 30).length;
console.error(`\n${pair} — ${cellsWithEnoughData} hour-cells have n>=30; chance-baseline expects ~${(cellsWithEnoughData * 0.05).toFixed(1)} "significant"-looking cells from noise alone at a loose 5% rate.`);
console.error(`${pair} — survivors (n>=30, full+IS+OOS all Sharpe>0): ${survivors.length ? survivors.map(r => `hour ${r.hour} (full=${r.sharpe}, IS=${r.isSharpe}, OOS=${r.oosSharpe}, n=${r.n})`).join('; ') : 'none'}`);

fs.writeFileSync(`${outDir}/${pair}.session_split.json`, JSON.stringify({ pair, splitDate, rows, survivors, cellsWithEnoughData }, null, 2));
console.error(`\nwrote ${outDir}/${pair}.session_split.json`);
