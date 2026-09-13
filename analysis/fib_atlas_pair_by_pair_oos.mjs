// Pair-by-pair OOS table (external review's #6) -- the "does the edge live
// independently in 15-20 pairs, or is it one mechanism riding correlated
// pairs" question. For each pair (Asia+Monday combined per pair, matching
// how the combined portfolio actually trades it), applies the SAME real
// "best config" pipeline, takes an honest 70/30 chronological IS/OOS split
// PER PAIR (not reusing the portfolio-level split), and reports OOS-only
// Sharpe/PF/win-rate/maxDD/expectancy.
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  applyCostEfficiencyFilter, applyGapFilter, applyFadeStopFraction, applyStoredContinuationExit } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const BASE = process.env.BASE || 'https://macrofxmodel-production.up.railway.app';
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'eurcad', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const LADDERS = ['asia', 'monday'];
const CONFIG = { minMargin: 2, minCostRatio: 3, maxGapMin: 30, continuationExit: 'chandelier', stopTightenFrac: 0.9 };

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (resp.ok || resp.status === 404) return resp;
      if (i === retries) return resp;
    } catch (e) { if (i === retries) return null; }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
}

function runPipeline(trades, cost) {
  const swapped = applyStoredContinuationExit(trades, CONFIG.continuationExit);
  const marginFiltered = swapped.filter(t => t.margin >= CONFIG.minMargin);
  const costFiltered = applyCostEfficiencyFilter(marginFiltered, cost, CONFIG.minCostRatio);
  const gapFiltered = applyGapFilter(costFiltered, CONFIG.maxGapMin);
  const capped = applyConcurrencyCap(gapFiltered, { maxConcurrent: 1, perDirection: false });
  const tightened = applyFadeStopFraction(capped?.kept ?? [], CONFIG.stopTightenFrac, 0, { preserveSizing: true });
  return tightened;
}

function statsFor(trades) {
  if (!trades.length) return { trades: 0, sharpe: null, pf: null, winRate: null, maxDD: null, expectancy: null };
  const riskAdj = riskAdjustTrades(trades, 0.5).map(t => ({ ...t, pair: 'X' }));
  const combined = buildPortfolioDailySeries({ X: riskAdj }, { weights: { X: 1 } });
  const ps = portfolioStats(combined.dailyReturns, { mc: false });
  const wins = riskAdj.filter(t => t.win), losses = riskAdj.filter(t => !t.win);
  const gp = wins.reduce((a, t) => a + t.pnlPct, 0), gl = -losses.reduce((a, t) => a + t.pnlPct, 0);
  const expectancy = riskAdj.reduce((a, t) => a + t.pnlPct, 0) / riskAdj.length;
  return {
    trades: riskAdj.length, sharpe: ps.sharpe, maxDD: ps.maxDD,
    winRate: +(100 * wins.length / riskAdj.length).toFixed(1),
    pf: gl > 1e-9 ? +(gp / gl).toFixed(2) : null,
    expectancy: +expectancy.toFixed(4),
  };
}

async function main() {
  console.log(`Fetching raw trades for ${PAIRS.length} pairs x ${LADDERS.length} ladders...\n`);
  console.log(['pair', 'oosTrades', 'winRate%', 'PF', 'sharpe', 'maxDD%', 'expectancy%'].join('\t'));
  let survivedCount = 0, totalCount = 0;
  for (const pair of PAIRS) {
    // Combine Asia+Monday for this ONE pair (matches how the combined
    // portfolio actually trades it) into one pooled, chronologically-sorted
    // trade list, run the real pipeline, then split 70/30 by date -- an
    // honest per-pair holdout, not reusing the portfolio-level split.
    let pooled = [];
    for (const ladder of LADDERS) {
      const routePrefix = ladder === 'asia' ? 'asia-fib-atlas' : 'monday-fib-atlas';
      const resp = await fetchWithRetry(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=1`);
      if (!resp || !resp.ok) continue;
      const j = await resp.json();
      const filtered = runPipeline(j.trades ?? [], j.cost);
      pooled.push(...filtered);
    }
    pooled.sort((a, b) => a.time - b.time);
    if (!pooled.length) { console.log(`${pair.toUpperCase()}\t(no trades survive the pipeline)`); continue; }
    const dates = [...new Set(pooled.map(t => t.date))].sort();
    const cutoff = dates[Math.floor(dates.length * 0.7)];
    const oos = pooled.filter(t => t.date > cutoff);
    const s = statsFor(oos);
    totalCount++;
    if (s.sharpe != null && s.sharpe > 0) survivedCount++;
    console.log([pair.toUpperCase(), s.trades, s.winRate + '%', s.pf, s.sharpe, s.maxDD + '%', s.expectancy + '%'].join('\t'));
  }
  console.log(`\n${survivedCount}/${totalCount} pairs show a positive OOS Sharpe independently.`);
}

main();
