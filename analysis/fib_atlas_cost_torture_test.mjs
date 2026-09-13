// Cost torture test (external review's #4) -- sweeps transaction cost from
// 0x to 10x the real, already-modeled per-pair cost and reports Sharpe/PF/
// win-rate/maxDD at each multiple, on the SAME real "best config" pipeline
// (gap filter, cost-efficiency filter, chandelier exit, fade-stop tighten).
// Finds the break-even cost multiple -- the standard "how fragile is this
// edge to slippage/spread being worse than modeled" check.
//
// Mechanism: every stored trade's pnlPct already has ITS pair's real cost
// baked in once (priceBarrierTrade: pnlPct = pnlPips*pip/denom*100 - cost).
// To re-price at a different cost multiple m, add back the original cost
// and subtract m*cost -- the exact pattern runBarrierWalkForward's own
// costStress already uses (js/asiaFibAtlasVoteReview.js), reused here, not
// reinvented. NOTE: this re-prices AFTER the cost-efficiency filter has
// already selected trades using the ORIGINAL (1x) cost -- i.e. this tests
// "what if realized costs are worse than modeled", not "what if the filter
// itself used a different cost assumption" (a separate, narrower question).
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  applyCostEfficiencyFilter, applyGapFilter, applyFadeStopFraction, applyStoredContinuationExit } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const BASE = process.env.BASE || 'https://macrofxmodel-production.up.railway.app';
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'eurcad', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const LADDERS = ['asia', 'monday'];
const CONFIG = { minMargin: 2, minCostRatio: 3, maxGapMin: 30, continuationExit: 'chandelier', stopTightenFrac: 0.9 };
const MULTS = [0, 0.25, 0.5, 1, 2, 3, 5, 10];

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

// Re-prices EVERY pnlPct-bearing field at cost multiple m (add back 1x,
// subtract m*x) -- same trades, same win/loss determination stays whatever
// it already was EXCEPT where a bigger cost flips a previously-tiny-margin
// win into a loss (a real, honest possibility this must allow, not paper over).
function restress(trades, cost, mult) {
  return trades.map(t => {
    const newPnlPct = +(t.pnlPct + cost - mult * cost).toFixed(4);
    return { ...t, pnlPct: newPnlPct, win: newPnlPct > 0 };
  });
}

function portfolioStatsFor(byPair) {
  const riskAdj = {};
  for (const sym of Object.keys(byPair)) riskAdj[sym] = riskAdjustTrades(byPair[sym], 0.5).map(t => ({ ...t, pair: sym }));
  const weights = Object.fromEntries(Object.keys(riskAdj).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(riskAdj, { weights });
  const ps = portfolioStats(combined.dailyReturns, { mc: false });
  const all = Object.values(riskAdj).flat();
  const winRate = all.length ? +(100 * all.filter(t => t.win).length / all.length).toFixed(1) : null;
  const gp = all.filter(t => t.win).reduce((a, t) => a + t.pnlPct, 0), gl = -all.filter(t => !t.win).reduce((a, t) => a + t.pnlPct, 0);
  return { trades: all.length, sharpe: ps.sharpe, maxDD: ps.maxDD, cagr: ps.cagr, winRate, pf: gl > 1e-9 ? +(gp / gl).toFixed(2) : null };
}

async function main() {
  console.log(`Fetching raw trades for ${PAIRS.length} pairs x ${LADDERS.length} ladders...`);
  const raw = {};
  await Promise.all(PAIRS.flatMap(pair => LADDERS.map(async ladder => {
    const routePrefix = ladder === 'asia' ? 'asia-fib-atlas' : 'monday-fib-atlas';
    const resp = await fetchWithRetry(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=1`);
    if (!resp || !resp.ok) return;
    const j = await resp.json();
    const label = ladder === 'asia' ? 'Asia' : 'Monday';
    raw[`${j.instrument} (${label})`] = { trades: j.trades ?? [], cost: j.cost };
  })));

  const filteredByPair = {};
  for (const sym of Object.keys(raw)) filteredByPair[sym] = runPipeline(raw[sym].trades, raw[sym].cost);

  console.log(['costMult', 'trades', 'sharpe', 'PF', 'winRate%', 'maxDD%', 'CAGR%'].join('\t'));
  let breakEven = null;
  for (const mult of MULTS) {
    const restressedByPair = {};
    for (const sym of Object.keys(filteredByPair)) restressedByPair[sym] = restress(filteredByPair[sym], raw[sym].cost, mult);
    const s = portfolioStatsFor(restressedByPair);
    console.log([`${mult}x`, s.trades, s.sharpe, s.pf, s.winRate + '%', s.maxDD + '%', s.cagr + '%'].join('\t'));
    if (s.sharpe <= 0 && breakEven == null) breakEven = mult;
  }
  console.log(breakEven != null ? `\nSharpe crosses zero somewhere at/before ${breakEven}x real cost.` : `\nSharpe stayed positive across the whole 0-10x sweep.`);
}

main();
