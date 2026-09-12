// Does Thread 1 (Level Atlas) trade better when its touch lands near a
// REINFORCED Fib Atlas level? — 2026-09-11
//
// Fib Atlas already filters its own ~45 raw levels/day down to a small,
// meaningful subset via two real reinforcement checks (js/asiaFibAtlasEngine.js):
// today's Asia range vs the previous Asia range, and this week's Monday
// range vs the previous Monday -- only levels landing within
// `confluenceThresholdPips` (2 pips for FX, per-instrument for others) of
// BOTH cycles count as reinforced. This reuses that exact, already-built
// logic (not a re-derivation) to build each day's reinforced-level grid, then
// asks a purely descriptive question on Level Atlas's OWN already-validated
// real-OOS trades: does a touch landing near one of those reinforced levels
// predict a better trade? No new parameter is fit (the threshold is Fib
// Atlas's own pre-existing constant), so a single real-OOS pass is honest --
// same discipline as vote_atlas_confluence_with_base_rate.mjs.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';
import { buildAsiaSessions, buildMondayRanges, prevSession, mondayForDay, prevMonday } from '../js/sessionRanges.js';
import { calcFibs } from '../js/fibProjection.js';
import { confluenceThresholdPips } from '../js/asiaFibAtlasEngine.js';
import { pipSize } from '../js/instrumentRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const MIN_MARGIN = 3;
const MAX_CONCURRENT = 3;

const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ['eurusd', 'gbpusd', 'usdjpy', 'audusd',
  'usdchf', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function reinforcedGrid(todayRange, prevRange, thresholdPips, pip) {
  if (!todayRange || !prevRange) return [];
  const gridToday = calcFibs(todayRange.low, todayRange.range);
  const gridPrev = calcFibs(prevRange.low, prevRange.range);
  const out = [];
  for (const g of gridToday) {
    let best = Infinity;
    for (const p of gridPrev) { const d = Math.abs(g.price - p.price) / pip; if (d < best) best = d; }
    if (best <= thresholdPips) out.push(g.price);
  }
  return out;
}
function nearestDist(price, grid, pip) {
  if (!grid.length) return null;
  let best = Infinity;
  for (const g of grid) { const d = Math.abs(price - g) / pip; if (d < best) best = d; }
  return best;
}

const allTrades = [];
const perPair = {};
for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed0 = await loadM1ForPair(pair);
  const packed = boundPacked(packed0, LOOKBACK_DAYS);
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const pip = pipSize(pair.toUpperCase()) || 1;
  const threshold = confluenceThresholdPips(pair.toUpperCase());

  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);
  const { split: realSplit } = splitAt(atRearm);
  const isOnly = atRearm.filter(t => t.date < realSplit);
  const honestBook = buildAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM });
  const trades = buildBarrierTrades(touches, honestBook, { rearmFrac: DEFAULT_REARM, cost, oosStartDate: realSplit })
    .filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT }).kept ?? [];

  const asiaSessions = buildAsiaSessions(packed, 'london');
  const mondayRanges = buildMondayRanges(packed, 'london');
  const asiaByDate = new Map(asiaSessions.map(s => [s.date, s]));
  const reinforcedCache = new Map(); // date -> combined reinforced price array

  function reinforcedForDate(date, dayEpoch) {
    if (reinforcedCache.has(date)) return reinforcedCache.get(date);
    const asiaToday = asiaByDate.get(date);
    const asiaPrev = asiaToday ? prevSession(asiaSessions, asiaToday.epoch) : null;
    const asiaReinforced = reinforcedGrid(asiaToday, asiaPrev, threshold, pip);
    const monToday = mondayForDay(mondayRanges, dayEpoch);
    const monPrev = monToday ? prevMonday(mondayRanges, monToday.epoch) : null;
    const monReinforced = reinforcedGrid(monToday, monPrev, threshold, pip);
    const combined = [...asiaReinforced, ...monReinforced];
    reinforcedCache.set(date, combined);
    return combined;
  }

  const withDist = capped.map(t => {
    const grid = reinforcedForDate(t.date, t.time - (t.time % 86400)); // t.time is epoch seconds; day-aligned enough for mondayForDay's window check
    const dist = nearestDist(t.entry, grid, pip);
    return { ...t, instrument: pair.toUpperCase(), fibDist: dist, nearFib: dist != null && dist <= threshold, hadGrid: grid.length > 0 };
  });
  perPair[pair.toUpperCase()] = withDist;
  allTrades.push(...withDist);
  const withGrid = withDist.filter(t => t.hadGrid).length;
  console.log(`  ${withDist.length} trades, ${withGrid} had a reinforced grid that day, ${withDist.filter(t => t.nearFib).length} landed near one`);
}

function row(label, trades) {
  if (trades.length < 30) return `${label.padEnd(32)}${String(trades.length).padStart(7)}   [thin]`;
  const s = summarizeTrades(trades.map(t => t.pnlPct), trades.map(t => t.date));
  const n = trades.length;
  const m = trades.reduce((a, t) => a + t.pnlPct, 0) / n;
  const sd = Math.sqrt(trades.reduce((a, t) => a + (t.pnlPct - m) ** 2, 0) / (n - 1));
  const t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0;
  return label.padEnd(32) + String(n).padStart(7) + (s.winRate ?? 0).toFixed(1).padStart(8) +
    ((m >= 0 ? '+' : '') + m.toFixed(4)).padStart(10) + (s.profitFactor ?? 0).toFixed(2).padStart(7) +
    (s.sharpe ?? 0).toFixed(2).padStart(8) + ('t' + t.toFixed(2)).padStart(8);
}

const withGridAll = allTrades.filter(t => t.hadGrid);
console.log(`\nTotal: ${allTrades.length} trades, ${withGridAll.length} had a reinforced grid that day (${(withGridAll.length / allTrades.length * 100).toFixed(1)}%), ${allTrades.filter(t => t.nearFib).length} near`);

console.log('\n' + '='.repeat(94));
console.log('DOES PROXIMITY TO A REINFORCED FIB ATLAS LEVEL PREDICT TRADE QUALITY?');
console.log('='.repeat(94));
console.log('policy'.padEnd(32), 'n'.padStart(7), 'win%'.padStart(8), 'meanPct'.padStart(10), 'PF'.padStart(7), 'sharpe'.padStart(8), 't-stat'.padStart(8));
console.log(row('ALL (current live trades)', allTrades));
console.log(row('NEAR a reinforced Fib level', allTrades.filter(t => t.nearFib)));
console.log(row('NOT near (or no grid that day)', allTrades.filter(t => !t.nearFib)));
console.log(row('  ...of which: had grid, but far', withGridAll.filter(t => !t.nearFib)));

console.log('\n--- per pair ---');
let nearBetter = 0, farBetter = 0, tested = 0;
for (const pair of PAIRS) {
  const P = pair.toUpperCase();
  const near = perPair[P].filter(t => t.nearFib);
  const far = perPair[P].filter(t => !t.nearFib);
  console.log(row(`${P} near`, near));
  console.log(row(`${P} not-near`, far));
  if (near.length >= 30 && far.length >= 30) {
    tested++;
    const mN = near.reduce((a, t) => a + t.pnlPct, 0) / near.length;
    const mF = far.reduce((a, t) => a + t.pnlPct, 0) / far.length;
    if (mN > mF) nearBetter++; else farBetter++;
  }
}
console.log(`\nOf ${tested} pairs with enough data in both buckets: near-better in ${nearBetter}, not-near-better in ${farBetter}`);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'vote_atlas_fib_confluence_crossref.json'), JSON.stringify({
  totalTrades: allTrades.length, withGrid: withGridAll.length,
  near: summarizeTrades(allTrades.filter(t => t.nearFib).map(t => t.pnlPct), allTrades.filter(t => t.nearFib).map(t => t.date)),
  notNear: summarizeTrades(allTrades.filter(t => !t.nearFib).map(t => t.pnlPct), allTrades.filter(t => !t.nearFib).map(t => t.date)),
}, null, 1));
console.log(`\nWrote ${OUT_DIR}/vote_atlas_fib_confluence_crossref.json`);
