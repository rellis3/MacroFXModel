// Which pairs are the biggest CORRELATED-DRAWDOWN contributors when combined
// into one portfolio -- a different question from "is this pair's own edge
// weak" (already answered, 5 pairs removed for that reason). Leave-one-out:
// build the fixed-risk portfolio from the current 27 selectable pairs, then
// rebuild it 27 more times each missing exactly one pair, and see how much
// removing that ONE pair improves the portfolio's max drawdown. A pair whose
// removal helps a lot is a real correlated-stacking contributor; a pair
// whose removal barely moves anything isn't.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 1;

// The 27 pairs currently selectable on the portfolio page (26-pair FX+gold
// universe minus the 5 already removed for weak edge-after-cost, plus 6 indices).
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

function combine(symSet) {
  const subset = Object.fromEntries(Object.entries(perPairTrades).filter(([sym]) => symSet.has(sym)));
  const weights = Object.fromEntries(Object.keys(subset).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(subset, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false });
}

const allSyms = new Set(Object.keys(perPairTrades));
const baseline = combine(allSyms);
console.log(`Baseline (all ${allSyms.size} pairs): Sharpe ${baseline.sharpe}  CAGR ${baseline.cagr}%  maxDD ${baseline.maxDD}%  Calmar ${baseline.calmar}\n`);

const results = [];
for (const sym of allSyms) {
  const without = new Set([...allSyms].filter(s => s !== sym));
  const stats = combine(without);
  results.push({
    sym,
    ddImprovement: stats.maxDD - baseline.maxDD, // positive = removing this pair IMPROVES (less negative) maxDD
    sharpeChange: stats.sharpe - baseline.sharpe,
    maxDDWithout: stats.maxDD,
    sharpeWithout: stats.sharpe,
  });
}

results.sort((a, b) => b.ddImprovement - a.ddImprovement);
console.log('Leave-one-out ranking (biggest drawdown-improvement-from-removal first):\n');
for (const r of results) {
  console.log(`  ${r.sym.padEnd(8)} removing it: maxDD ${baseline.maxDD}% -> ${r.maxDDWithout.toFixed(2)}% (${r.ddImprovement >= 0 ? '+' : ''}${r.ddImprovement.toFixed(2)}pp)   Sharpe ${baseline.sharpe} -> ${r.sharpeWithout.toFixed(2)} (${r.sharpeChange >= 0 ? '+' : ''}${r.sharpeChange.toFixed(2)})`);
}

// Greedy forward-elimination: does cutting several worst offenders TOGETHER
// compound to something meaningful, or does the drawdown stay structural
// (correlated stacking across MOST pairs, not a few bad apples) no matter
// how many are cut?
console.log('\n\nGreedy forward-elimination (remove the single worst contributor, re-rank, repeat):\n');
let current = new Set(allSyms);
for (let step = 0; step < 20; step++) {
  const stats = combine(current);
  console.log(`  ${current.size} pairs: Sharpe ${stats.sharpe}  maxDD ${stats.maxDD}%  Calmar ${stats.calmar}`);
  let worst = null, worstImprovement = -Infinity;
  for (const sym of current) {
    const without = new Set([...current].filter(s => s !== sym));
    const s = combine(without);
    const improvement = s.maxDD - stats.maxDD;
    if (improvement > worstImprovement) { worstImprovement = improvement; worst = sym; }
  }
  console.log(`    -> removing ${worst} next (improves maxDD by ${worstImprovement >= 0 ? '+' : ''}${worstImprovement.toFixed(2)}pp)`);
  current.delete(worst);
}
const finalStats = combine(current);
console.log(`  ${current.size} pairs remaining: Sharpe ${finalStats.sharpe}  maxDD ${finalStats.maxDD}%  Calmar ${finalStats.calmar}`);
