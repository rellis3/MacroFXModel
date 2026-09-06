// One-off audit (2026-09-06) — owner relayed a sharp external critique of the
// live "Asia+Monday combined" Performance Summary (Sharpe 18.37, Calmar
// 783.5, max DD -1.01%, apparently 0 negative months across 62). Rather than
// defend or dismiss, trace it: same "best config" as
// asia-fib-atlas-vote-portfolio.html's loadBestConfigBtn, real R2 trades.
//
// Checks, in the order the critique raised them:
//  1. Total Return vs trades x avg-trade arithmetic (they flagged a ~10x gap)
//  2. Real month-by-month day-pooled returns -- how many are actually negative
//  3. Worst N days/months, and what's happening in them
//  4. Fragility: remove the best 1%/5%/10% of trades, see what survives
//  5. A basic lookahead sanity check on trade timestamps (touch < resolve,
//     gapMin only ever referencing an EARLIER touch)
import { buildFibAtlasVotePortfolio } from '../js/fibAtlasVotePortfolio.js';
import { getJSON } from '../js/r2Store.js';
import { portfolioStats } from '../js/backtestStats.js';
import { maxDrawdownFromPnls } from '../js/metricsCore.js';

const FIB_ATLAS_ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd', 'gbpjpy', 'gbpaud', 'gbpcad',
  'gbpchf', 'gbpnzd', 'audjpy', 'audnzd', 'audcad', 'audchf', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold'];
const EXCLUDE = new Set(['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy']);
const DEFAULT_PAIRS = FIB_ATLAS_ALL_PAIRS.filter(p => !EXCLUDE.has(p));

const LADDERS = ['asia', 'monday'];
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const LADDER_LABEL = { asia: 'Asia', monday: 'Monday' };
const constituentKeys = DEFAULT_PAIRS.flatMap(pair => LADDERS.map(ladder => `${pair}|${ladder}`));

const rawCache = new Map();
await Promise.all(constituentKeys.map(async key => {
  const [pair, ladder] = key.split('|');
  rawCache.set(key, await getJSON(`${LADDER_PREFIX[ladder]}/${pair}-votetrades.json`));
}));
const cachedLoader = async constituentKey => {
  const [, ladder] = constituentKey.split('|');
  const stored = rawCache.get(constituentKey);
  if (!stored) return null;
  return { ...stored, groupKey: `${stored.instrument} (${LADDER_LABEL[ladder]})`, ladder };
};

// Exact "Load best config" params (asia-fib-atlas-vote-portfolio.html), incl.
// the LIVE default riskPct=0.5 (not the sweep script's varied value).
const OPTS = {
  pairs: constituentKeys,
  minMargin: 2, maxConcurrent: 1, perDirection: true,
  weighting: 'equal', sizing: 'fixed-risk', riskPct: 0.5,
  maxHeatPct: null, targetVol: 10, throttleOn: false,
  stopTightenFrac: 0.9, minCostRatio: 3, maxGapMin: 30, continuationExit: 'chandelier',
  loadPairVoteTrades: cachedLoader,
};

const result = await buildFibAtlasVotePortfolio(OPTS);
if (result.error) { console.error('ERROR:', result.error); process.exit(1); }

console.log('=== 1. Total return vs trades x avg-trade arithmetic ===');
const pnls = result.trades.map(t => t.pnlPct);
const avgTrade = pnls.reduce((a, b) => a + b, 0) / pnls.length;
const sumAllTradePnls = pnls.reduce((a, b) => a + b, 0);
const additiveTotalReturn = result.equityCurve.reduce((a, r) => a + r.dailyReturn, 0);
console.log(`trades: ${result.trades.length}, avg trade pnlPct: ${avgTrade.toFixed(4)}%`);
console.log(`naive check (trades x avg trade): ${sumAllTradePnls.toFixed(2)}%`);
console.log(`additive total return (sum of daily pooled returns): ${additiveTotalReturn.toFixed(2)}%`);
console.log(`ratio (should be ~1.0 if daily-pooled = per-trade sum, i.e. no double counting): ${(additiveTotalReturn / sumAllTradePnls).toFixed(4)}`);
console.log('');

console.log('=== 2. Month-by-month day-pooled returns ===');
const byMonth = new Map();
for (const { date, dailyReturn } of result.equityCurve) {
  const ym = date.slice(0, 7);
  byMonth.set(ym, (byMonth.get(ym) || 0) + dailyReturn);
}
const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const negMonths = months.filter(([, r]) => r < 0);
const posMonths = months.filter(([, r]) => r >= 0);
console.log(`total months: ${months.length}, positive: ${posMonths.length}, negative: ${negMonths.length}`);
console.log('worst 5 months:', months.slice().sort((a, b) => a[1] - b[1]).slice(0, 5).map(([m, r]) => `${m}: ${r.toFixed(2)}%`).join(' | '));
console.log('best 5 months:', months.slice().sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m, r]) => `${m}: ${r.toFixed(2)}%`).join(' | '));
console.log('');

console.log('=== 3. Day-level distribution ===');
const dayReturns = result.equityCurve.map(r => r.dailyReturn);
const negDays = dayReturns.filter(r => r < 0).length;
const zeroDays = dayReturns.filter(r => r === 0).length;
console.log(`days: ${dayReturns.length}, negative days: ${negDays} (${(100 * negDays / dayReturns.length).toFixed(1)}%), zero-return days: ${zeroDays}`);
console.log('worst 10 days:', result.equityCurve.slice().sort((a, b) => a.dailyReturn - b.dailyReturn).slice(0, 10).map(r => `${r.date}: ${r.dailyReturn.toFixed(3)}%`).join(' | '));
console.log('');

console.log('=== 4. Fragility: remove best N% of trades, re-run stats ===');
// This mirrors buildPortfolioDailySeries's own day-pooling but applied to a
// trade list with the top winners stripped out -- reconstruct daily series
// manually since buildFibAtlasVotePortfolio doesn't expose this as a lever.
function dailySeriesFrom(trades) {
  const byDate = new Map();
  for (const t of trades) {
    const d = t.date;
    byDate.set(d, (byDate.get(d) || 0) + t.pnlPct);
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, r]) => r);
}
function statsFor(trades) {
  const dr = dailySeriesFrom(trades);
  return portfolioStats(dr, { mc: false, targetVol: 10 });
}
const sortedByPnl = result.trades.slice().sort((a, b) => b.pnlPct - a.pnlPct);
for (const pct of [0, 0.01, 0.05, 0.10]) {
  const n = Math.round(sortedByPnl.length * pct);
  const removedSet = new Set(sortedByPnl.slice(0, n));
  const kept = result.trades.filter(t => !removedSet.has(t));
  const s = statsFor(kept);
  const totalRet = dailySeriesFrom(kept).reduce((a, b) => a + b, 0);
  console.log(`remove top ${(pct * 100).toFixed(0)}% (${n} trades): sharpe=${s.sharpe?.toFixed(2)}, maxDD=${s.maxDD?.toFixed(2)}%, totalReturn=${totalRet.toFixed(1)}%`);
}
console.log('');

console.log('=== 5. Lookahead sanity check on raw trade timestamps ===');
let badOrder = 0, badGap = 0, checked = 0;
for (const t of result.trades) {
  checked++;
  if (t.resolveTime != null && t.time != null && t.resolveTime < t.time) badOrder++;
  if (t.gapMin != null && t.gapMin < 0) badGap++;
}
console.log(`checked ${checked} trades: resolveTime < entry time: ${badOrder}, negative gapMin: ${badGap}`);
console.log('sample trade fields:', JSON.stringify(result.trades[0], null, 2).slice(0, 800));
console.log('');

console.log('=== 6. Day-pooled maxDD vs per-trade (non-netted) maxDD, and Sharpe corrections ===');
console.log(`day-pooled maxDD (what the dashboard shows): ${result.stats.maxDD?.toFixed(2)}%`);
const chronoTrades = result.trades.slice().sort((a, b) => (a.resolveTime ?? 0) - (b.resolveTime ?? 0));
const perTradeMaxDD = maxDrawdownFromPnls(chronoTrades.map(t => t.pnlPct));
console.log(`per-trade maxDD (chronological, no same-day netting): ${perTradeMaxDD.toFixed(2)}%  (ratio: ${(perTradeMaxDD / result.stats.maxDD).toFixed(2)}x deeper)`);
console.log(`day-pooled Sharpe (naive, daily): ${result.stats.sharpe?.toFixed(3)}`);
console.log(`day-pooled Sharpe (Newey-West HAC-corrected): ${result.stats.sharpeHAC?.sharpeNW?.toFixed(3)} (bandwidth=${result.stats.sharpeHAC?.bandwidth}, variance inflation=${result.stats.sharpeHAC?.varianceInflation}x)`);
