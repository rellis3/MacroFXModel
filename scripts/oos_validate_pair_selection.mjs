// The greedy forward-elimination in leave_one_out_portfolio.mjs picks pairs
// to exclude by minimizing max DD on the FULL sample -- the same in-sample-
// optimization risk that burned the drawdown throttle earlier (tuned on
// 100% of the data, no held-out check). Splits the combined portfolio 70/30
// chronologically, runs the SAME greedy elimination on IS ONLY to pick an
// exclusion set, then checks whether that set (frozen, unchanged) actually
// improves the OOS slice's own max drawdown too.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 1;
const STOP_AT_N = 17; // where the full-sample greedy curve's Sharpe/DD tradeoff looked reasonable

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'gbpjpy', 'gbpaud',
  'gbpchf', 'audjpy', 'audcad', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold',
  'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function loadPair(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${pair}-votetrades.json`), 'utf8'));
  const filtered = raw.trades.filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  return { sym: raw.instrument, trades: riskAdjustTrades(capped.kept, RISK_PCT).map(t => ({ ...t, pair: raw.instrument })) };
}

const perPairTrades = {};
for (const p of PAIRS) {
  const { sym, trades } = loadPair(p);
  perPairTrades[sym] = trades;
}
const allSyms = new Set(Object.keys(perPairTrades));

// Split EACH pair's own trades 70/30 by date (not the combined series) so
// the split is defined per-pair, consistent with every other OOS test today.
function splitDate() {
  const combined = buildPortfolioDailySeries(perPairTrades, { weights: Object.fromEntries([...allSyms].map(s => [s, 1])) });
  return combined.dates[Math.floor(combined.dates.length * 0.7)];
}
const cutoff = splitDate();
console.log(`Split date: ${cutoff}\n`);

const isTrades = {}, oosTrades = {};
for (const sym of allSyms) {
  isTrades[sym] = perPairTrades[sym].filter(t => t.date <= cutoff);
  oosTrades[sym] = perPairTrades[sym].filter(t => t.date > cutoff);
}

function combine(tradesBySym, symSet) {
  const subset = Object.fromEntries([...symSet].map(s => [s, tradesBySym[s]]));
  const weights = Object.fromEntries([...symSet].map(s => [s, 1]));
  const combined = buildPortfolioDailySeries(subset, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false });
}

// Greedy elimination on IS ONLY.
let current = new Set(allSyms);
const removedInOrder = [];
while (current.size > STOP_AT_N) {
  const stats = combine(isTrades, current);
  let worst = null, worstImprovement = -Infinity;
  for (const sym of current) {
    const without = new Set([...current].filter(s => s !== sym));
    const s = combine(isTrades, without);
    const improvement = s.maxDD - stats.maxDD;
    if (improvement > worstImprovement) { worstImprovement = improvement; worst = sym; }
  }
  current.delete(worst);
  removedInOrder.push(worst);
}
console.log(`IS-chosen exclusion set (${removedInOrder.length} pairs): ${removedInOrder.join(', ')}\n`);

const isFull = combine(isTrades, allSyms);
const isReduced = combine(isTrades, current);
const oosFull = combine(oosTrades, allSyms);
const oosReduced = combine(oosTrades, current);

console.log('IS  (chosen on):  all 27 pairs:', `Sharpe ${isFull.sharpe} maxDD ${isFull.maxDD}%`, '  ->  reduced set:', `Sharpe ${isReduced.sharpe} maxDD ${isReduced.maxDD}%`);
console.log('OOS (unseen):     all 27 pairs:', `Sharpe ${oosFull.sharpe} maxDD ${oosFull.maxDD}%`, '  ->  reduced set:', `Sharpe ${oosReduced.sharpe} maxDD ${oosReduced.maxDD}%`);
