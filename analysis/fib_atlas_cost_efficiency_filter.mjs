// Cost-efficiency filter — direct follow-up to the avg-win-vs-avg-loss
// investigation (2026-08-30, see LEGO_MODULES.md): confirmed the asymmetry
// (net avg win 0.063% vs avg loss -0.094%, ratio 0.67) is almost entirely a
// transaction-cost artifact, not a target/stop design flaw — GROSS (pre-
// cost) avg win/loss are essentially symmetric (0.080%/-0.078%, ratio
// 1.02), matching the target:stop pip ratio being ~1.00 at nearly every
// rung. Cost is subtracted as a FLAT amount from every trade regardless of
// outcome (js/asiaFibAtlasVoteReview.js:98), which shrinks small-distance
// trades' edge disproportionately (avg cost ~0.017%, vs avg gross win only
// ~0.080% — cost eats ~21% of the average win on its own, and far more on
// the smallest rungs, which showed gross wins as low as 0.009-0.028%).
//
// This tests the direct, obvious lever that finding suggests: skip trades
// whose target distance doesn't clear a minimum multiple of that pair's own
// cost -- a cost-efficiency gate, not a stop/target redesign. Pre-stated
// rule: maximize IS Sharpe (the natural goal for a filter meant to improve
// the edge itself, not specifically minimize drawdown -- that's a
// different, already-covered lever). 70/30 IS/OOS freeze, same discipline
// as every other lever this session.
//
//   LADDER=asia node analysis/fib_atlas_cost_efficiency_filter.mjs
import { getJSON } from '../js/r2Store.js';
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';

const LADDER = (process.env.LADDER || 'asia').toLowerCase();
const MIN_MARGIN = 2, MAX_CONCURRENT = 1, RISK_PCT = 1;
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
// Ratio of (gross target %) to (this pair's own per-trade cost %) -- e.g.
// COST_RATIOS=3 means "only take trades whose target move is at least 3x
// the round-trip cost". 1.0 = today's status quo (any positive-target
// trade is taken, however small).
const COST_RATIOS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const ASIA_EXCLUDE = new Set(['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy']);

async function loadAll() {
  const prefix = LADDER_PREFIX[LADDER];
  const byPair = {};
  for (const pair of RANGE_FIB_INSTRUMENTS) {
    if (LADDER === 'asia' && ASIA_EXCLUDE.has(pair)) continue;
    const s = await getJSON(`${prefix}/${pair}-votetrades.json`);
    if (!s) continue;
    const filtered = s.trades.filter(t => t.margin >= MIN_MARGIN);
    if (!filtered.length) continue;
    // targetPnlPct is the GROSS move the trade is aiming for -- the ratio
    // this filter gates on, computed from stored fields, no re-derivation.
    byPair[pair.toUpperCase()] = filtered.map(t => ({
      ...t, pair: pair.toUpperCase(), costPct: s.cost,
      targetPnlPct: t.targetPips * t.pip / t.entry * 100,
    }));
  }
  return byPair;
}

function statsFor(byPairFiltered) {
  const capped = {};
  for (const sym of Object.keys(byPairFiltered)) {
    const c = applyConcurrencyCap(byPairFiltered[sym], { maxConcurrent: MAX_CONCURRENT });
    if (c?.kept?.length) capped[sym] = riskAdjustTrades(c.kept, RISK_PCT).map(t => ({ ...t, pair: sym }));
  }
  const weights = Object.fromEntries(Object.keys(capped).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(capped, { weights });
  const ps = portfolioStats(combined.dailyReturns, { mc: false });
  const all = Object.values(capped).flat();
  const wins = all.filter(t => t.win), losses = all.filter(t => !t.win);
  const avgWin = wins.length ? wins.reduce((a, t) => a + t.pnlPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length : 0;
  return { trades: all.length, sharpe: ps.sharpe, maxDD: ps.maxDD, cagr: ps.cagr, avgWin: +avgWin.toFixed(4), avgLoss: +avgLoss.toFixed(4), ratio: avgLoss ? +(avgWin / -avgLoss).toFixed(2) : null };
}

function printRow(label, s) {
  console.log([label.padEnd(12), String(s.trades).padStart(7), String(s.sharpe).padStart(7), (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), (s.avgWin + '%').padStart(9), (s.avgLoss + '%').padStart(9), String(s.ratio).padStart(6)].join('  '));
}
function header() {
  console.log(['ratio>='.padEnd(12), 'trades'.padStart(7), 'sharpe'.padStart(7), 'maxDD'.padStart(8), 'CAGR'.padStart(9), 'avgWin'.padStart(9), 'avgLoss'.padStart(9), 'W:L'.padStart(6)].join('  '));
}

async function main() {
  console.log(`Fib Atlas cost-efficiency filter — ladder=${LADDER}  minMargin=${MIN_MARGIN}\n`);
  const byPair = await loadAll();
  const allSyms = Object.keys(byPair);
  const allTrades = Object.values(byPair).flat().sort((a, b) => a.time - b.time);
  const uniqueDates = [...new Set(allTrades.map(t => t.date))].sort();
  const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
  console.log(`${allTrades.length} trades across ${allSyms.length} pairs. IS/OOS split: ${cutoff}\n`);

  console.log('──── IN-SAMPLE (fit) ────');
  header();
  const isRows = [];
  for (const r of COST_RATIOS) {
    const filtered = {};
    for (const sym of allSyms) filtered[sym] = byPair[sym].filter(t => t.date <= cutoff && (t.targetPnlPct / t.costPct) >= r);
    const s = statsFor(filtered);
    isRows.push({ r, ...s });
    printRow(`>=${r}x`, s);
  }
  const chosen = isRows.slice().sort((a, b) => b.sharpe - a.sharpe)[0];
  console.log(`\nChosen (pre-stated rule: maximize IS Sharpe): cost-ratio >= ${chosen.r}x (IS Sharpe ${chosen.sharpe})\n`);

  console.log('──── OUT-OF-SAMPLE (frozen from IS, applied unchanged) ────');
  header();
  const oosBaseline = {}; for (const sym of allSyms) oosBaseline[sym] = byPair[sym].filter(t => t.date > cutoff);
  printRow('baseline', statsFor(oosBaseline));
  const oosChosen = {}; for (const sym of allSyms) oosChosen[sym] = byPair[sym].filter(t => t.date > cutoff && (t.targetPnlPct / t.costPct) >= chosen.r);
  printRow(`>=${chosen.r}x`, statsFor(oosChosen));
  console.log('\n(full OOS grid, for context:)');
  for (const r of COST_RATIOS) {
    const filtered = {};
    for (const sym of allSyms) filtered[sym] = byPair[sym].filter(t => t.date > cutoff && (t.targetPnlPct / t.costPct) >= r);
    printRow(`>=${r}x`, statsFor(filtered));
  }
}

main();
