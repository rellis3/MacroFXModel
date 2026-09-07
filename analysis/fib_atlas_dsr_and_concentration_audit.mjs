// One-off audit (2026-09-06), continuation of the smoothness/lookahead audit.
// Two checks the owner asked for directly ("anything we can check?"):
//
// 1. An HONEST day-pooled Deflated Sharpe. The dashboard's own DSR tile
//    (computeFibAtlasDeflatedSharpe, js/fibAtlasVotePortfolio.js) builds its
//    trial Sharpes from the PER-TRADE pnl list, not the day-pooled series
//    that produces the headline 18.37/14.27 Sharpe numbers it sits next to
//    on the page -- so that tile has never actually stress-tested the
//    number that looks alarming. This re-does it on the DAY-POOLED basis,
//    with a much wider trial grid (125 combos: stopTightenFrac x
//    minCostRatio x maxGapMin, 5 values each) than the page's own 6
//    single-lever-flips, since 6 trials is likely a real undercount of the
//    true search this config went through across many sessions.
//
// 2. A year-by-year concentration check on the day-pooled OOS series --
//    CLAUDE.md's own prescribed diagnostic ("a monthly/yearly return
//    heatmap is a cheap concentration check -- use it") -- to see whether
//    the edge is broadly consistent or carried by one or two unusually
//    good years.
import { buildFibAtlasVotePortfolio } from '../js/fibAtlasVotePortfolio.js';
import { getJSON } from '../js/r2Store.js';
import { deflatedSharpe } from '../js/backtestStats.js';

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

const BASE_OPTS = {
  pairs: constituentKeys, minMargin: 2, maxConcurrent: 1, perDirection: true,
  weighting: 'equal', sizing: 'fixed-risk', riskPct: 0.5,
  maxHeatPct: null, targetVol: 10, throttleOn: false,
  continuationExit: 'chandelier',
};

console.log('=== 1. Honest day-pooled Deflated Sharpe (wide trial grid) ===');
const STOP_VALS = [null, 0.8, 0.85, 0.9, 0.95];
const COST_VALS = [null, 1.5, 2, 3, 4];
const GAP_VALS = [null, 15, 20, 30, 45];

const results = [];
for (const stopTightenFrac of STOP_VALS) {
  for (const minCostRatio of COST_VALS) {
    for (const maxGapMin of GAP_VALS) {
      const r = await buildFibAtlasVotePortfolio({ ...BASE_OPTS, stopTightenFrac, minCostRatio, maxGapMin, loadPairVoteTrades: cachedLoader });
      if (r.error || !r.equityCurve?.length) continue;
      const dr = r.equityCurve.map(x => x.dailyReturn);
      const m = dr.reduce((a, b) => a + b, 0) / dr.length;
      const sd = Math.sqrt(dr.reduce((a, b) => a + (b - m) ** 2, 0) / dr.length);
      results.push({ stopTightenFrac, minCostRatio, maxGapMin, sharpe: r.stats.sharpe, dayPooledSR: sd > 1e-9 ? m / sd : 0, trades: r.trades.length, dailyReturns: dr });
    }
  }
}
console.log(`ran ${results.length}/${STOP_VALS.length * COST_VALS.length * GAP_VALS.length} combos successfully`);

const shipped = results.find(r => r.stopTightenFrac === 0.9 && r.minCostRatio === 3 && r.maxGapMin === 30);
const sortedBySharpe = results.slice().sort((a, b) => b.sharpe - a.sharpe);
const rank = sortedBySharpe.findIndex(r => r === shipped) + 1;
console.log(`shipped config (0.9 / 3 / 30): Sharpe=${shipped?.sharpe?.toFixed(3)}, rank ${rank} of ${results.length} (1=best)`);
console.log(`Sharpe distribution across all ${results.length} trials: min=${Math.min(...results.map(r => r.sharpe)).toFixed(2)}, p25=${sortedBySharpe[Math.floor(results.length * 0.75)].sharpe.toFixed(2)}, median=${sortedBySharpe[Math.floor(results.length / 2)].sharpe.toFixed(2)}, p75=${sortedBySharpe[Math.floor(results.length * 0.25)].sharpe.toFixed(2)}, max=${Math.max(...results.map(r => r.sharpe)).toFixed(2)}`);

const trialSRs = results.filter(r => r !== shipped).map(r => r.dayPooledSR);
const dsr = deflatedSharpe(shipped.dailyReturns, trialSRs);
console.log('Honest day-pooled DSR (', results.length - 1, 'real trials, not 6):', JSON.stringify(dsr));

console.log('');
console.log('=== 2. Year-by-year concentration check (shipped config, day-pooled) ===');
const byYear = new Map();
for (const { date, dailyReturn } of (await buildFibAtlasVotePortfolio({ ...BASE_OPTS, stopTightenFrac: 0.9, minCostRatio: 3, maxGapMin: 30, loadPairVoteTrades: cachedLoader })).equityCurve) {
  const y = date.slice(0, 4);
  byYear.set(y, (byYear.get(y) || 0) + dailyReturn);
}
const years = [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const totalAdd = years.reduce((s, [, r]) => s + r, 0);
console.log('year\tadditive return %\tshare of total');
for (const [y, r] of years) console.log(`${y}\t${r.toFixed(1)}\t${(100 * r / totalAdd).toFixed(1)}%`);
const sortedYears = years.slice().sort((a, b) => b[1] - a[1]);
console.log(`best year (${sortedYears[0][0]}) alone: ${(100 * sortedYears[0][1] / totalAdd).toFixed(1)}% of total additive return`);
console.log(`best 2 years combined: ${(100 * (sortedYears[0][1] + sortedYears[1][1]) / totalAdd).toFixed(1)}% of total`);
