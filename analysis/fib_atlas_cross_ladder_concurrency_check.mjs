// User's own, sharper question (2026-09-13): when Asia and Monday trade the
// SAME pair, are they double-counted -- treated as if two independent
// instruments could each hold a position, when in reality they're the same
// real-world instrument at the same real-world time?
//
// Confirmed directly in js/fibAtlasVotePortfolio.js's own comment (line
// ~106-112): "two ladders on one pair combine exactly like two different
// pairs do, with zero new math." applyConcurrencyCap is called PER
// CONSTITUENT (line 129), i.e. separately for "EURUSD (Asia)" and "EURUSD
// (Monday)", BEFORE they're merged into the combined portfolio. So the
// production combined portfolio CAN hold an Asia-EURUSD position and a
// Monday-EURUSD position at the same real moment, each independently risked
// at riskPct, summed as if uncorrelated.
//
// This script re-scores the SAME 17-pair "Select recommended" universe with
// concurrency capped JOINTLY per real instrument (pooling Asia+Monday
// BEFORE applying applyConcurrencyCap, matching how one real trading account
// actually experiences exposure) and compares to the current production
// (separate-per-ladder) capping -- isolating exactly how much of the
// portfolio's Sharpe/win-rate/trade-count comes from this one accounting
// choice.
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

// Pre-cap pipeline stages (identical order to production: continuation-exit
// swap -> margin -> cost-efficiency -> gap filter), stopping BEFORE the
// concurrency cap so the caller can choose separate-per-ladder vs joint.
function preCapFilter(trades, cost) {
  const swapped = applyStoredContinuationExit(trades, CONFIG.continuationExit);
  const marginFiltered = swapped.filter(t => t.margin >= CONFIG.minMargin);
  const costFiltered = applyCostEfficiencyFilter(marginFiltered, cost, CONFIG.minCostRatio);
  return applyGapFilter(costFiltered, CONFIG.maxGapMin);
}

function postCap(kept) {
  return applyFadeStopFraction(kept, CONFIG.stopTightenFrac, 0, { preserveSizing: true });
}

async function main() {
  console.log('Fetching raw trades for 17 pairs x 2 ladders...\n');
  const perPairSeparate = {}, perPairJoint = {};

  for (const pair of PAIRS) {
    const ladderTrades = {};
    for (const ladder of LADDERS) {
      const routePrefix = ladder === 'asia' ? 'asia-fib-atlas' : 'monday-fib-atlas';
      const resp = await fetchWithRetry(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=1`);
      if (!resp || !resp.ok) continue;
      const j = await resp.json();
      ladderTrades[ladder] = preCapFilter(j.trades ?? [], j.cost).map(t => ({ ...t, ladder }));
    }

    // PRODUCTION (current): cap each ladder SEPARATELY, then merge.
    const separateKept = [];
    for (const ladder of LADDERS) {
      const capped = applyConcurrencyCap(ladderTrades[ladder] ?? [], { maxConcurrent: 1, perDirection: true });
      separateKept.push(...postCap(capped?.kept ?? []));
    }
    separateKept.sort((a, b) => a.time - b.time);

    // JOINT (corrected): pool BOTH ladders' pre-cap trades for this ONE real
    // instrument, sort chronologically, THEN cap -- one real position at a
    // time on the real instrument, whichever ladder's signal got there first.
    const pooled = [...(ladderTrades.asia ?? []), ...(ladderTrades.monday ?? [])].sort((a, b) => a.time - b.time);
    const jointCapped = applyConcurrencyCap(pooled, { maxConcurrent: 1, perDirection: true });
    const jointKept = postCap(jointCapped?.kept ?? []);

    perPairSeparate[pair] = separateKept.map(t => ({ ...t, pair }));
    perPairJoint[pair] = jointKept.map(t => ({ ...t, pair }));
  }

  function summarize(perPairTrades) {
    const riskAdjByPair = {};
    let n = 0;
    for (const [pair, trades] of Object.entries(perPairTrades)) {
      riskAdjByPair[pair] = riskAdjustTrades(trades, 0.5).map(t => ({ ...t, pair }));
      n += trades.length;
    }
    const weights = Object.fromEntries(Object.keys(riskAdjByPair).map(p => [p, 1 / Object.keys(riskAdjByPair).length]));
    const combined = buildPortfolioDailySeries(riskAdjByPair, { weights });
    const stats = portfolioStats(combined.dailyReturns, { mc: false });
    const allTrades = Object.values(riskAdjByPair).flat();
    const wins = allTrades.filter(t => t.win ?? t.pnlPct > 0).length;
    return { n, winRate: +(100 * wins / n).toFixed(1), stats };
  }

  const sepSummary = summarize(perPairSeparate);
  const jointSummary = summarize(perPairJoint);

  console.log('pair\tseparateN\tjointN\tdroppedByJointCap');
  for (const pair of PAIRS) {
    const sN = perPairSeparate[pair]?.length ?? 0, jN = perPairJoint[pair]?.length ?? 0;
    console.log(`${pair.toUpperCase()}\t${sN}\t${jN}\t${sN - jN}`);
  }

  console.log('\n=== PORTFOLIO: separate-per-ladder cap (production) vs joint-per-instrument cap (corrected) ===');
  console.log(`n trades:  separate=${sepSummary.n}  joint=${jointSummary.n}`);
  console.log(`Win rate:  separate=${sepSummary.winRate}%  joint=${jointSummary.winRate}%`);
  console.log(`Sharpe:    separate=${sepSummary.stats.sharpe}  joint=${jointSummary.stats.sharpe}`);
  console.log(`PF:        separate=${sepSummary.stats.profitFactor}  joint=${jointSummary.stats.profitFactor}`);
  console.log(`CAGR%:     separate=${sepSummary.stats.cagr}  joint=${jointSummary.stats.cagr}`);
  console.log(`maxDD%:    separate=${sepSummary.stats.maxDD}  joint=${jointSummary.stats.maxDD}`);
}

main();
