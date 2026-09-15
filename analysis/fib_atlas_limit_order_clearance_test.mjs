// Direct owner ask (2026-09-15): is switching live entry from a reactive
// market order to a resting limit order (at the plan's modeled rung price)
// backtestable -- would it help or hurt?
//
// Key realization this script tests: the EXISTING backtest already prices
// every trade at the exact rung level with a guaranteed fill whenever a bar's
// high/low reaches it (priceBarrierTrade) -- that's already an implicit
// limit-order simulation (rest at the level, fill whenever touched, zero
// slippage), not a market-order-with-slippage model. So "how would limit
// orders do" isn't a NEW scenario to build -- it's the honest question of how
// much of the CURRENT backtest's edge rides on touches so marginal a real
// resting order might plausibly never have filled at all (thin liquidity at
// that exact instant, a broker's own spread/feed never quite reaching the
// level even though this M1 source's bar high/low did).
//
// Method: for every touch that survives the full production pipeline (same
// filters buildFibAtlasVotePortfolio applies), compute CLEARANCE -- how many
// pips beyond the rung the triggering bar's own high/low actually reached
// (re-derived from the raw M1 bar at the touch's own time, since the touch
// record itself only carries the rung price, not the bar's real extreme).
// Recompute the full portfolio at several minimum-clearance thresholds and
// compare Sharpe/win-rate/PF/CAGR/maxDD against the unfiltered (0-threshold)
// baseline -- the sensitivity curve IS the answer to "does the edge survive
// discarding wick-only touches."
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../js/mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { voteDecision, priceBarrierTrade } from '../js/asiaFibAtlasVoteReview.js';
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  applyCostEfficiencyFilter, applyGapFilter, applyFadeStopFraction, applyStoredContinuationExit } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'eurcad', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const LADDERS = ['asia', 'monday'];
const REARM = 0.3;
// continuationExit deliberately OFF here: the chandelier-trailed pnl fields
// are precomputed separately (needs real M1 access at store-generation time,
// applyTrailingContinuation's own doc) and aren't present on a fresh walk's
// touches -- orthogonal anyway to the entry-side clearance question this
// script tests, so left off rather than faked.
const CONFIG = { minMargin: 2, minCostRatio: 3, maxGapMin: 30, continuationExit: false, stopTightenFrac: 0.9 };
const CLEARANCE_THRESHOLDS = [0, 0.2, 0.5, 1, 2, 3];   // pips

function runPipeline(trades, cost) {
  const swapped = applyStoredContinuationExit(trades, CONFIG.continuationExit);
  const marginFiltered = swapped.filter(t => t.margin >= CONFIG.minMargin);
  const costFiltered = applyCostEfficiencyFilter(marginFiltered, cost, CONFIG.minCostRatio);
  const gapFiltered = applyGapFilter(costFiltered, CONFIG.maxGapMin);
  const capped = applyConcurrencyCap(gapFiltered, { maxConcurrent: 1, perDirection: true });
  return applyFadeStopFraction(capped?.kept ?? [], CONFIG.stopTightenFrac, 0, { preserveSizing: true });
}

async function buildPairTrades(pair, ladder) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) return [];
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const walkFn = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
  const { touches } = walkFn(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM] });
  const pool = touches.filter(t => t.rearmFrac === REARM);
  const book = buildAsiaFibAtlasBook(pool, { rearmFrac: REARM });
  if (!book) return [];

  // Bar index by minute (epoch seconds, M1-aligned) for clearance lookup --
  // packed.times is sorted ascending, one bisect setup reused per touch.
  const times = packed.times;
  function barAt(t) {
    let lo = 0, hi = times.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (times[mid] <= t) lo = mid; else hi = mid - 1; }
    return times[lo] === t ? lo : (times[lo] <= t ? lo : -1);
  }

  const realOOS = pool.filter(t => t.date >= book.splitDate && t.outcome !== 'neither');
  const trades = [];
  for (const t of realOOS) {
    const vd = voteDecision(book, t);
    if (!vd) continue;
    const priced = priceBarrierTrade(t, vd.decision, cost);
    if (!priced) continue;
    const idx = barAt(t.time);
    let clearancePips = null;
    if (idx >= 0) {
      const isAbove = t.side === 'above';
      const barExtreme = isAbove ? packed.highs[idx] : packed.lows[idx];
      clearancePips = isAbove ? (barExtreme - t.price) / t.pip : (t.price - barExtreme) / t.pip;
    }
    trades.push({
      instrument: t.instrument, date: t.date, time: t.time,
      resolveTime: t.concurrencyResolveTime ?? t.resolveTime ?? t.sessionCloseTime,
      side: t.side, rung: t.level, entry: t.price, pip: t.pip,
      decision: vd.decision, margin: vd.margin,
      targetPips: priced.targetPips, stopPips: priced.stopPips,
      win: priced.win, pnlPct: priced.pnlPct, timedOut: priced.timedOut ?? false,
      gapMin: t.gapMin ?? null, clearancePips,
      chandTrailedPnlPct: t.chandTrailedPnlPct, chandTrailedResolveTime: t.chandTrailedResolveTime,
      trailedPnlPct: t.trailedPnlPct, trailedResolveTime: t.trailedResolveTime,
    });
  }
  return runPipeline(trades, cost);
}

function summarize(trades) {
  const wins = trades.filter(t => t.win ?? t.pnlPct > 0).length;
  return { n: trades.length, winRate: trades.length ? +(100 * wins / trades.length).toFixed(1) : null };
}

async function main() {
  console.log('Building full per-pair/ladder trade lists with clearance data (this re-walks local M1 for all 17 pairs x 2 ladders)...\n');
  const perPairAll = {};
  for (const pair of PAIRS) {
    let pooled = [];
    for (const ladder of LADDERS) {
      try {
        const trades = await buildPairTrades(pair, ladder);
        pooled.push(...trades.map(t => ({ ...t, pair, ladder })));
      } catch (e) { console.log(`${pair} ${ladder}: FAILED (${e.message})`); }
    }
    perPairAll[pair] = pooled;
    console.log(`${pair.toUpperCase()}: ${pooled.length} trades built`);
  }

  const allTrades = Object.values(perPairAll).flat();
  const clearanceKnown = allTrades.filter(t => t.clearancePips != null);
  console.log(`\nTotal trades: ${allTrades.length} (${clearanceKnown.length} with resolvable clearance, ${allTrades.length - clearanceKnown.length} bar-index lookup misses)`);

  const sorted = [...clearanceKnown].sort((a, b) => a.clearancePips - b.clearancePips);
  console.log('\nClearance distribution (pips beyond the rung):');
  for (const p of [0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.99]) {
    const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
    console.log(`  p${(p * 100).toFixed(0)}: ${sorted[idx].clearancePips.toFixed(2)}p`);
  }

  console.log('\nthreshold(p)\tn\tdropped\twinRate%\tSharpe\tPF\tCAGR%\tmaxDD%');
  for (const thresh of CLEARANCE_THRESHOLDS) {
    const filteredByPair = {};
    let totalKept = 0, totalDropped = 0;
    for (const [pair, trades] of Object.entries(perPairAll)) {
      const kept = trades.filter(t => t.clearancePips == null || t.clearancePips >= thresh);
      filteredByPair[pair] = riskAdjustTrades(kept, 0.5).map(t => ({ ...t, pair }));
      totalKept += kept.length; totalDropped += trades.length - kept.length;
    }
    const weights = Object.fromEntries(Object.keys(filteredByPair).map(p => [p, 1 / Object.keys(filteredByPair).length]));
    const combined = buildPortfolioDailySeries(filteredByPair, { weights });
    const stats = portfolioStats(combined.dailyReturns, { mc: false });
    const s = summarize(Object.values(filteredByPair).flat());
    console.log(`${thresh}p\t${totalKept}\t${totalDropped}\t${s.winRate}\t${stats.sharpe}\t${stats.profitFactor}\t${stats.cagr}\t${stats.maxDD}`);
  }
}

main();
