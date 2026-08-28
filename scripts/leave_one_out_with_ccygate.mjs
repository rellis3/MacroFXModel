// Re-runs leave_one_out_portfolio.mjs's exact methodology (leave-one-out +
// greedy forward-elimination ranking of correlated-drawdown contributors),
// but with the OOS-validated currency loss gate (1% daily loss/currency,
// scripts/oos_validate_currency_loss_gate.mjs) applied FIRST -- the pair-
// exclusion set currently shipped ("Select recommended", 10 pairs removed)
// was chosen BEFORE the gate existed. If the gate already damps the same
// correlated-stacking mechanism the exclusion set was built to fix, fewer
// pairs might need excluding now; if it's an orthogonal mechanism, the same
// ~10 pairs should still show up as the worst offenders.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades, applyCurrencyLossGate } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 1, MAX_DAILY_LOSS_PCT = 1;

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

const perPairTradesRaw = {};
for (const p of PAIRS) {
  const { sym, trades } = loadPair(p);
  perPairTradesRaw[sym] = trades;
}

// Gate ACROSS all 27 pairs together (matches the route: merge chronologically
// first, gate, then re-split) -- gating is a cross-pair, currency-level
// decision, not a per-pair one.
const merged = Object.values(perPairTradesRaw).flat();
const gated = applyCurrencyLossGate(merged, { maxDailyLossPct: MAX_DAILY_LOSS_PCT });
console.log(`Currency loss gate (${MAX_DAILY_LOSS_PCT}%): ${gated.skippedCount} of ${gated.totalCount} trades blocked (${(gated.skippedCount / gated.totalCount * 100).toFixed(1)}%)\n`);
const perPairTrades = {};
for (const t of gated.kept) (perPairTrades[t.pair] ??= []).push(t);

function combine(symSet) {
  const subset = Object.fromEntries(Object.entries(perPairTrades).filter(([sym]) => symSet.has(sym)));
  const weights = Object.fromEntries(Object.keys(subset).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(subset, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false });
}

const allSyms = new Set(Object.keys(perPairTrades));
const baseline = combine(allSyms);
console.log(`GATED baseline (all ${allSyms.size} pairs): Sharpe ${baseline.sharpe}  CAGR ${baseline.cagr}%  maxDD ${baseline.maxDD}%  Calmar ${baseline.calmar}`);

// For direct comparison, also print the UNGATED baseline (same universe, no gate).
function combineUngated(symSet) {
  const subset = Object.fromEntries(Object.entries(perPairTradesRaw).filter(([sym]) => symSet.has(sym)));
  const weights = Object.fromEntries(Object.keys(subset).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(subset, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false });
}
const allSymsUngated = new Set(Object.keys(perPairTradesRaw));
const baselineUngated = combineUngated(allSymsUngated);
console.log(`UNGATED baseline (all ${allSymsUngated.size} pairs): Sharpe ${baselineUngated.sharpe}  CAGR ${baselineUngated.cagr}%  maxDD ${baselineUngated.maxDD}%  Calmar ${baselineUngated.calmar}\n`);

const results = [];
for (const sym of allSyms) {
  const without = new Set([...allSyms].filter(s => s !== sym));
  const stats = combine(without);
  results.push({
    sym,
    ddImprovement: stats.maxDD - baseline.maxDD,
    sharpeChange: stats.sharpe - baseline.sharpe,
    maxDDWithout: stats.maxDD,
    sharpeWithout: stats.sharpe,
  });
}
results.sort((a, b) => b.ddImprovement - a.ddImprovement);
console.log('Leave-one-out ranking WITH the currency gate active (biggest drawdown-improvement-from-removal first):\n');
for (const r of results) {
  console.log(`  ${r.sym.padEnd(8)} removing it: maxDD ${baseline.maxDD}% -> ${r.maxDDWithout.toFixed(2)}% (${r.ddImprovement >= 0 ? '+' : ''}${r.ddImprovement.toFixed(2)}pp)   Sharpe ${baseline.sharpe} -> ${r.sharpeWithout.toFixed(2)} (${r.sharpeChange >= 0 ? '+' : ''}${r.sharpeChange.toFixed(2)})`);
}

console.log('\n\nGreedy forward-elimination WITH the currency gate active (remove the single worst contributor, re-rank, repeat):\n');
let current = new Set(allSyms);
const removedOrder = [];
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
  removedOrder.push(worst);
}
const finalStats = combine(current);
console.log(`  ${current.size} pairs remaining: Sharpe ${finalStats.sharpe}  maxDD ${finalStats.maxDD}%  Calmar ${finalStats.calmar}`);
console.log(`\nFull removal order: ${removedOrder.join(', ')}`);

// Direct comparison at the SAME stop point as the currently-shipped
// "Select recommended" set (17 pairs, 10 removed) -- does the gate let a
// SMALLER exclusion set reach similar/better maxDD than 10-removed-ungated did?
const SHIPPED_EXCLUDE = new Set(['gbpaud', 'gbpchf', 'usdcad', 'audcad', 'nzdjpy', 'eurgbp', 'gbpjpy', 'nzdusd', 'eurjpy', 'eurcad'].map(p => p.toUpperCase()));
const shippedKept = new Set([...allSyms].filter(s => !SHIPPED_EXCLUDE.has(s)));
const shippedGated = combine(shippedKept);
console.log(`\nShipped "Select recommended" 17-pair set, GATED: Sharpe ${shippedGated.sharpe}  maxDD ${shippedGated.maxDD}%  Calmar ${shippedGated.calmar}`);
