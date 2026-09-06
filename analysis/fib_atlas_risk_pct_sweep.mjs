// One-off analysis (2026-09-06): does risk-% / trade have a real "optimal"
// value on the Fib Atlas combined (Asia+Monday) 16-pair "best config"
// portfolio, or is it just a personal risk-tolerance dial? Owner picked 1%
// without being sure; people online talk about 1% vs 3%. Answer this with
// the real engine on real stored trades, not algebra alone.
//
// Reuses buildFibAtlasVotePortfolio exactly as
// /api/asia-fib-atlas/vote-portfolio-combined does, at the page's own
// "Load best config" params (loadBestConfigBtn in
// asia-fib-atlas-vote-portfolio.html), sweeping ONLY riskPct.
import { buildFibAtlasVotePortfolio } from '../js/fibAtlasVotePortfolio.js';
import { getJSON } from '../js/r2Store.js';

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

// "Best config" per loadBestConfigBtn, everything held fixed except riskPct.
const BASE_OPTS = {
  pairs: constituentKeys,
  minMargin: 2,
  maxConcurrent: 1,
  perDirection: true,          // hedge-only
  weighting: 'equal',
  sizing: 'fixed-risk',
  maxHeatPct: null,
  targetVol: 10,
  throttleOn: false,
  stopTightenFrac: 0.9,        // FIB_ATLAS_STOP_TIGHTEN_FRAC
  minCostRatio: 3,             // FIB_ATLAS_MIN_COST_RATIO
  maxGapMin: 30,               // FIB_ATLAS_MAX_GAP_MIN
  continuationExit: 'chandelier',
};

const RISK_PCTS = [0.25, 0.5, 1, 1.5, 2, 3, 4, 5];

console.log(`Loaded ${constituentKeys.filter(k => rawCache.get(k)).length}/${constituentKeys.length} constituents`);
console.log('');
const header = ['riskPct', 'trades', 'days', 'sharpe(add)', 'sharpeHAC', 'cagr%(compound)', 'maxDD%(compound)', 'calmar(compound)', 'cagr%(additive)', 'maxDD%(additive)', 'calmar(additive)'];
console.log(header.join('\t'));

const rows = [];
for (const riskPct of RISK_PCTS) {
  const result = await buildFibAtlasVotePortfolio({ ...BASE_OPTS, riskPct, loadPairVoteTrades: cachedLoader });
  if (result.error) { console.error(`riskPct=${riskPct}: ERROR ${result.error}`); continue; }
  const s = result.stats;
  const row = {
    riskPct, trades: result.trades.length, days: result.days,
    sharpe: s.sharpe, sharpeHAC: s.sharpeHAC?.sharpeNW,
    cagrCompound: s.cagr, maxDDCompound: s.maxDD, calmarCompound: s.calmar,
    cagrAdditive: s.cagrNonCompounded, maxDDAdditive: s.maxDDNonCompounded, calmarAdditive: s.calmarNonCompounded,
  };
  rows.push(row);
  console.log([riskPct, row.trades, row.days, row.sharpe?.toFixed(3), row.sharpeHAC?.toFixed(3),
    row.cagrCompound?.toFixed(2), row.maxDDCompound?.toFixed(2), row.calmarCompound?.toFixed(2),
    row.cagrAdditive?.toFixed(2), row.maxDDAdditive?.toFixed(2), row.calmarAdditive?.toFixed(2)].join('\t'));
}

console.log('');
console.log('Sharpe range across sweep:', Math.min(...rows.map(r => r.sharpe)).toFixed(3), '-', Math.max(...rows.map(r => r.sharpe)).toFixed(3));
console.log('SharpeHAC range across sweep:', Math.min(...rows.map(r => r.sharpeHAC)).toFixed(3), '-', Math.max(...rows.map(r => r.sharpeHAC)).toFixed(3));
console.log('Compound CAGR/riskPct ratio (should be flat if linear):', rows.map(r => (r.cagrCompound / r.riskPct).toFixed(2)).join(', '));
console.log('Compound maxDD/riskPct ratio (should be flat if linear):', rows.map(r => (r.maxDDCompound / r.riskPct).toFixed(2)).join(', '));
console.log('Compound Calmar across sweep:', rows.map(r => r.calmarCompound.toFixed(2)).join(', '));
console.log('Additive CAGR/riskPct ratio (should be ~constant, exactly linear):', rows.map(r => (r.cagrAdditive / r.riskPct).toFixed(2)).join(', '));
console.log('Additive maxDD/riskPct ratio (should be ~constant, exactly linear):', rows.map(r => (r.maxDDAdditive / r.riskPct).toFixed(2)).join(', '));
