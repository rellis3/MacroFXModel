// Combines the full 26-pair Level Atlas vote-margin universe into one
// fixed-risk portfolio (mirrors js/levelAtlasRoutes.js's vote-portfolio
// route exactly, run locally for speed/comparison rather than via HTTP).
// Also compares the full 26-pair blend against a "curated" subset that
// excludes the pairs shown (scripts output, 2026-08-27) to have near-zero
// Sharpe once spread cost is accounted for.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 1;

const ALL_26_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd', 'gbpjpy', 'gbpaud', 'gbpcad',
  'gbpchf', 'gbpnzd', 'audjpy', 'audnzd', 'audcad', 'audchf', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold'];

// Pairs found (real, cost-driven, not a bug) to have near-zero Sharpe once
// spread is accounted for — see LEGO_MODULES.md.
const WEAK_HIGH_COST = ['eurnzd', 'gbpnzd', 'audnzd', 'audchf', 'gbpcad'];

function loadPair(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${pair}-votetrades.json`), 'utf8'));
  const filtered = raw.trades.filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  return { sym: raw.instrument, trades: riskAdjustTrades(capped.kept, RISK_PCT).map(t => ({ ...t, pair: raw.instrument })), kept: capped.kept.length };
}

function combine(pairs) {
  const perPairTrades = {}, ownSharpes = [];
  for (const p of pairs) {
    const { sym, trades } = loadPair(p);
    perPairTrades[sym] = trades;
    const solo = buildPortfolioDailySeries({ [sym]: trades });
    ownSharpes.push(portfolioStats(solo.dailyReturns, { mc: false }).sharpe);
  }
  const weights = Object.fromEntries(Object.keys(perPairTrades).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(perPairTrades, { weights });
  const stats = portfolioStats(combined.dailyReturns, { mc: false });
  const naiveAvg = +(ownSharpes.reduce((a, b) => a + b, 0) / ownSharpes.length).toFixed(3);
  return { stats, naiveAvg, nPairs: pairs.length, days: combined.dates.length };
}

console.log('=== ALL 26 PAIRS, equal fixed-risk (1%/trade), margin>=3, per-pair cap=1 ===');
const all26 = combine(ALL_26_PAIRS);
console.log(`  naive avg Sharpe: ${all26.naiveAvg}  ->  combined Sharpe: ${all26.stats.sharpe}`);
console.log(`  CAGR ${all26.stats.cagr}%  maxDD ${all26.stats.maxDD}%  Calmar ${all26.stats.calmar}  annVol ${all26.stats.annVol}%  (${all26.days} days)`);

console.log('\n=== CURATED: 21 pairs, excluding the 5 weak/high-cost pairs ===');
const curated = ALL_26_PAIRS.filter(p => !WEAK_HIGH_COST.includes(p));
const curated21 = combine(curated);
console.log(`  naive avg Sharpe: ${curated21.naiveAvg}  ->  combined Sharpe: ${curated21.stats.sharpe}`);
console.log(`  CAGR ${curated21.stats.cagr}%  maxDD ${curated21.stats.maxDD}%  Calmar ${curated21.stats.calmar}  annVol ${curated21.stats.annVol}%  (${curated21.days} days)`);

console.log('\n=== ORIGINAL 5 PAIRS (for reference) ===');
const orig5 = combine(['eurusd', 'gbpusd', 'gold', 'usdjpy', 'audusd']);
console.log(`  naive avg Sharpe: ${orig5.naiveAvg}  ->  combined Sharpe: ${orig5.stats.sharpe}`);
console.log(`  CAGR ${orig5.stats.cagr}%  maxDD ${orig5.stats.maxDD}%  Calmar ${orig5.stats.calmar}  annVol ${orig5.stats.annVol}%  (${orig5.days} days)`);
