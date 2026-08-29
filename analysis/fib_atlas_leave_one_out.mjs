// Fib Atlas leave-one-out portfolio study -- the Asia/Monday sibling of
// scripts/leave_one_out_portfolio.mjs (Level Atlas's own "Select recommended"
// button's source analysis). SAME method, SAME shared bricks
// (applyConcurrencyCap/riskAdjustTrades/buildPortfolioDailySeries/
// portfolioStats), adapted only for: (a) Fib Atlas's R2-hosted trade store
// instead of Level Atlas's local analysis/output/ dump, (b) three modes --
// asia-only, monday-only, and combined (both ladders' trades for a pair as
// TWO separate constituents, same groupKey convention buildFibAtlasVote
// Portfolio/vote-portfolio-combined already use) -- since the "strongest
// pairs" set can differ per ladder.
//
// This is NOT a fix for the DSR=0 / holdsOOS-leakage finding already
// recorded in LEGO_MODULES.md (2026-08-29) -- it's a DIFFERENT, separate
// question (which pairs correlate/stack drawdown once combined), run on the
// SAME already-flagged-as-selection-biased trade series. Greedily picking
// pairs that most improve an already-inflated backtest's maxDD is itself
// another layer of fitting to the same holdout -- do not treat this script's
// output as a validated "recommended set" the way Level Atlas's own is
// (that one was separately OOS-validated afterward, scripts/
// oos_validate_pair_selection.mjs, before a button shipped). Print-only, no
// button/UI wiring here -- this is stage 1 (see this file's run output) of
// the same multi-stage process Level Atlas went through.
//
//   LADDER=asia    node analysis/fib_atlas_leave_one_out.mjs
//   LADDER=monday  node analysis/fib_atlas_leave_one_out.mjs
//   LADDER=combined node analysis/fib_atlas_leave_one_out.mjs
import { getJSON } from '../js/r2Store.js';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';

const LADDER = (process.env.LADDER || 'asia').toLowerCase(); // 'asia' | 'monday' | 'combined'
const MIN_MARGIN = Number(process.env.MIN_MARGIN || 2), MAX_CONCURRENT = 1, RISK_PCT = 1;
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const LADDER_LABEL = { asia: 'Asia', monday: 'Monday' };

async function loadConstituent(prefix, pair) {
  const stored = await getJSON(`${prefix}/${pair}-votetrades.json`);
  if (!stored) return null;
  const filtered = stored.trades.filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  if (!capped?.kept?.length) return null;
  return riskAdjustTrades(capped.kept, RISK_PCT).map(t => ({ ...t }));
}

async function buildConstituents() {
  const perPairTrades = {};
  if (LADDER === 'combined') {
    for (const pair of RANGE_FIB_INSTRUMENTS) {
      for (const ladder of ['asia', 'monday']) {
        const trades = await loadConstituent(LADDER_PREFIX[ladder], pair);
        if (!trades) continue;
        const sym = `${pair.toUpperCase()} (${LADDER_LABEL[ladder]})`;
        perPairTrades[sym] = trades.map(t => ({ ...t, pair: sym }));
      }
    }
  } else {
    const prefix = LADDER_PREFIX[LADDER];
    if (!prefix) throw new Error(`LADDER must be asia|monday|combined, got "${LADDER}"`);
    for (const pair of RANGE_FIB_INSTRUMENTS) {
      const trades = await loadConstituent(prefix, pair);
      if (!trades) continue;
      const sym = pair.toUpperCase();
      perPairTrades[sym] = trades.map(t => ({ ...t, pair: sym }));
    }
  }
  return perPairTrades;
}

function combine(perPairTrades, symSet) {
  const subset = Object.fromEntries(Object.entries(perPairTrades).filter(([sym]) => symSet.has(sym)));
  const weights = Object.fromEntries(Object.keys(subset).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(subset, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false });
}

async function main() {
  console.log(`Fib Atlas leave-one-out — ladder=${LADDER}  minMargin=${MIN_MARGIN}\n`);
  const perPairTrades = await buildConstituents();
  const allSyms = new Set(Object.keys(perPairTrades));
  if (allSyms.size < 2) { console.error(`Only ${allSyms.size} constituent(s) with data — nothing to compare.`); process.exit(1); }

  const baseline = combine(perPairTrades, allSyms);
  console.log(`Baseline (all ${allSyms.size} constituents): Sharpe ${baseline.sharpe}  CAGR ${baseline.cagr}%  maxDD ${baseline.maxDD}%  Calmar ${baseline.calmar}\n`);

  const results = [];
  for (const sym of allSyms) {
    const without = new Set([...allSyms].filter(s => s !== sym));
    const stats = combine(perPairTrades, without);
    results.push({
      sym, ddImprovement: stats.maxDD - baseline.maxDD, sharpeChange: stats.sharpe - baseline.sharpe,
      maxDDWithout: stats.maxDD, sharpeWithout: stats.sharpe,
    });
  }
  results.sort((a, b) => b.ddImprovement - a.ddImprovement);
  console.log('Leave-one-out ranking (biggest drawdown-improvement-from-removal first):\n');
  for (const r of results) {
    console.log(`  ${r.sym.padEnd(20)} removing it: maxDD ${baseline.maxDD}% -> ${r.maxDDWithout.toFixed(2)}% (${r.ddImprovement >= 0 ? '+' : ''}${r.ddImprovement.toFixed(2)}pp)   Sharpe ${baseline.sharpe} -> ${r.sharpeWithout.toFixed(2)} (${r.sharpeChange >= 0 ? '+' : ''}${r.sharpeChange.toFixed(2)})`);
  }

  console.log('\n\nGreedy forward-elimination (remove the single worst contributor, re-rank, repeat):\n');
  let current = new Set(allSyms);
  const removedOrder = [];
  const steps = Math.min(20, allSyms.size - 1);
  for (let step = 0; step < steps; step++) {
    const stats = combine(perPairTrades, current);
    console.log(`  ${current.size} constituents: Sharpe ${stats.sharpe}  maxDD ${stats.maxDD}%  Calmar ${stats.calmar}`);
    let worst = null, worstImprovement = -Infinity;
    for (const sym of current) {
      const without = new Set([...current].filter(s => s !== sym));
      const s = combine(perPairTrades, without);
      const improvement = s.maxDD - stats.maxDD;
      if (improvement > worstImprovement) { worstImprovement = improvement; worst = sym; }
    }
    console.log(`    -> removing ${worst} next (improves maxDD by ${worstImprovement >= 0 ? '+' : ''}${worstImprovement.toFixed(2)}pp)`);
    current.delete(worst);
    removedOrder.push(worst);
  }
  const finalStats = combine(perPairTrades, current);
  console.log(`  ${current.size} constituents remaining: Sharpe ${finalStats.sharpe}  maxDD ${finalStats.maxDD}%  Calmar ${finalStats.calmar}`);
  console.log(`\nRemoved (in removal order): ${removedOrder.join(', ') || '(none)'}`);
  console.log(`Remaining: ${[...current].join(', ')}`);
}

main();
