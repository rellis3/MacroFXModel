/**
 * Fib Atlas vote-portfolio combiner (2026-08-28) — the multi-pair "collective"
 * counterpart to the single-pair vote-margin backtest (`js/asiaFibAtlasVoteReview.js`),
 * shared by BOTH the Asia and Monday ladders (`js/asiaFibAtlasRoutes.js` and
 * `js/mondayFibAtlasRoutes.js`'s own `/vote-portfolio` routes) since the two
 * engines' trade objects share Level Atlas's own field shape by design (see
 * asiaFibAtlasVoteReview.js's header) and the combination math has nothing
 * engine-specific in it.
 *
 * This is a deliberate, from-scratch extraction of `js/levelAtlasRoutes.js`'s
 * own `/api/level-atlas/vote-portfolio` route body — same computation, same
 * query-param contract, same response shape — NOT an in-place refactor of
 * that route. Level Atlas's own route is large, working, and carries its own
 * OOS-validated correlated-risk warnings (level-atlas-vote-portfolio.html);
 * migrating it to call this shared function too is a real future unification
 * (flagged in LEGO_MODULES.md as a known, intentional duplication candidate)
 * but was judged riskier than helpful to do in the same change that adds a
 * NEW consumer — better to prove this extraction against Asia+Monday first.
 *
 * Deliberately NOT included here: `applyFadeStopTightening` — a Level-Atlas-
 * specific, separately OOS-validated feature (its own stop-tightening
 * percentile study, `scripts/oos_validate_fade_stop.mjs`) with no equivalent
 * study run for the fib-ladder engines yet. Adding it here would mean
 * silently assuming it transfers, which hasn't been checked.
 *
 * `loadPairVoteTrades(pair)` is the one thing callers must supply — an async
 * function returning the stored `{instrument, trades, cost, ...}` blob for
 * one pair (or null), so this module has no opinion on WHERE that blob lives
 * (Asia's `asia-fib-atlas/{pair}-votetrades.json` vs Monday's
 * `monday-fib-atlas/{pair}-votetrades.json` — same R2 shape, different prefix).
 */
import {
  applyConcurrencyCap, buildPortfolioDailySeries, inverseVolWeights,
  riskAdjustTrades, applyPortfolioHeatCap, applyDrawdownThrottle, applyFadeStopFraction,
} from './levelAtlasVoteReview.js';
import { maxDrawdownFromPnls } from './metricsCore.js';
import { portfolioStats } from './backtestStats.js';

// portfolioStats' own maxDD/cagr/calmar assume reinvestment (compounding).
// riskAdjustTrades never actually compounds — every trade risks a CONSTANT
// riskPct of the ORIGINAL notional — so the honest complement is an ADDITIVE
// (non-reinvested) drawdown/return on the same series. Same reasoning and
// same two Tier-1 bricks (`maxDrawdownFromPnls`, arithmetic-mean annualising)
// levelAtlasRoutes.js's own `/vote-portfolio` route already uses.
export function withNonCompoundedDD(statsObj, dailyReturns) {
  const maxDDNonCompounded = +maxDrawdownFromPnls(dailyReturns).toFixed(2);
  const years = dailyReturns.length / 252;
  const cagrNonCompounded = years > 0 ? +(dailyReturns.reduce((s, r) => s + r, 0) / years).toFixed(2) : 0;
  const calmarNonCompounded = maxDDNonCompounded < 0 ? +(cagrNonCompounded / Math.abs(maxDDNonCompounded)).toFixed(2) : 0;
  return { ...statsObj, maxDDNonCompounded, cagrNonCompounded, calmarNonCompounded };
}

/**
 * buildFibAtlasVotePortfolio(opts) -> the full /vote-portfolio response body,
 * or { error } if no pair had data.
 *
 * opts: { pairs, minMargin=2, maxConcurrent=1, perDirection=false,
 *   weighting='equal'|'inverse-vol', sizing='fixed-risk'|'nav', riskPct=1,
 *   maxHeatPct=null, targetVol=10, throttleOn=false, triggerDD=-5,
 *   restoreDD=0, throttleMult=0.5, stopTightenFrac=null, loadPairVoteTrades }
 *
 * `stopTightenFrac` (2026-08-29): validated by analysis/
 * fib_atlas_sl_tightening_backtest.mjs (see LEGO_MODULES.md) — tightens FADE
 * decisions' stop to this fraction of their native distance (e.g. 0.9),
 * leaving follow trades untouched. Applied AFTER each constituent's own
 * concurrency cap (same order the validating backtest used), BEFORE risk-
 * adjustment/heat-cap/throttle — a no-op when null/1, so every existing
 * caller is unaffected.
 */
export async function buildFibAtlasVotePortfolio({
  pairs, minMargin = 2, maxConcurrent = 1, perDirection = false,
  weighting = 'equal', sizing = 'fixed-risk', riskPct = 1,
  maxHeatPct = null, targetVol = 10,
  throttleOn = false, triggerDD = -5, restoreDD = 0, throttleMult = 0.5,
  stopTightenFrac = null,
  loadPairVoteTrades,
}) {
  // Each iteration is one "constituent" of the combined portfolio — normally
  // one pair (groupKey defaults to the R2 blob's own `instrument`), but a
  // caller combining Asia+Monday on the SAME pair can have `loadPairVoteTrades`
  // return a distinct `groupKey` (e.g. "EURUSD (Asia)"/"EURUSD (Monday)") and
  // a `ladder` tag per stored blob — everything below (concurrency cap, heat
  // cap, weighting, stats) already treats "constituent" generically, so two
  // ladders on one pair combine exactly like two different pairs do, with
  // zero new math. `groupKey` is optional and unused by the existing
  // single-ladder routes, so this is fully backward compatible.
  const perPairTradesRaw = {}, perPair = {}, missing = [];
  for (const pair of pairs) {
    const stored = await loadPairVoteTrades(pair);
    if (!stored) { missing.push(pair.toUpperCase()); continue; }
    const filtered = stored.trades.filter(t => t.margin >= minMargin);
    const capped = applyConcurrencyCap(filtered, { maxConcurrent, perDirection });
    const tightened = applyFadeStopFraction(capped?.kept ?? [], stopTightenFrac);
    const sym = stored.groupKey ?? stored.instrument;
    perPairTradesRaw[sym] = tightened.map(t => ({ ...t, instrument: stored.instrument, ladder: stored.ladder ?? null }));
    perPair[sym] = {
      totalDecided: filtered.length,
      kept: capped?.kept?.length ?? 0,
      skipped: capped?.skippedCount ?? 0,
      ownWinRate: capped?.keptSummary?.winRate ?? null,
    };
  }
  if (!Object.keys(perPairTradesRaw).length) return { error: `no vote-backtest data for any of: ${pairs.join(',')}`, missing };

  // rMultiple is invariant to sizing scheme; pnlPct only gets REPLACED by the
  // risk-scaled figure in fixed-risk mode — same reasoning as
  // levelAtlasRoutes.js's own route.
  const perPairTradesForStats = {};
  for (const sym of Object.keys(perPairTradesRaw)) {
    const adjusted = riskAdjustTrades(perPairTradesRaw[sym], riskPct);
    const withPair = (sizing === 'fixed-risk' ? adjusted : perPairTradesRaw[sym].map((t, i) => ({ ...t, rMultiple: adjusted[i].rMultiple })))
      .map(t => ({ ...t, pair: sym }));
    perPairTradesForStats[sym] = withPair;
  }

  // ownSharpe uses the SAME daily-return-series Sharpe as the combined
  // portfolio (portfolioStats), not a per-trade-annualized one — see
  // levelAtlasRoutes.js's own comment for why mixing the two methods would
  // make part of the apparent diversification benefit a methodology switch.
  for (const sym of Object.keys(perPairTradesForStats)) {
    const solo = buildPortfolioDailySeries({ [sym]: perPairTradesForStats[sym] });
    perPair[sym].ownSharpe = solo ? portfolioStats(solo.dailyReturns, { mc: false, targetVol }).sharpe : null;
  }

  // Cross-pair portfolio heat cap — applied AFTER each pair's own cap, on the
  // merged, globally-chronological trade list. Fixed-risk mode only (NAV
  // mode's weight fractions already cap total exposure at 100% by construction).
  let perPairTradesFinal = perPairTradesForStats;
  let heatCap = null;
  if (maxHeatPct) {
    const heatResult = applyPortfolioHeatCap(perPairTradesForStats, { maxHeatPct });
    if (heatResult) {
      const byPair = {};
      for (const t of heatResult.kept) (byPair[t.pair] ??= []).push(t);
      perPairTradesFinal = byPair;
      heatCap = { maxHeatPct, skippedCount: heatResult.skippedCount, totalCount: heatResult.totalCount };
      for (const sym of Object.keys(perPair)) perPair[sym].keptAfterHeat = byPair[sym]?.length ?? 0;
    }
  }

  const buildWeights = perPairTrades => sizing === 'fixed-risk'
    ? Object.fromEntries(Object.keys(perPairTrades).map(p => [p, 1]))
    : (weighting === 'inverse-vol' ? inverseVolWeights(perPairTrades) : null);

  const weights = buildWeights(perPairTradesFinal);
  const combined = buildPortfolioDailySeries(perPairTradesFinal, weights ? { weights } : {});
  const statsBeforeThrottle = portfolioStats(combined.dailyReturns, { mc: false, targetVol });

  let throttle = null, dailyReturnsFinal = combined.dailyReturns, datesFinal = combined.dates;
  let stats = withNonCompoundedDD(statsBeforeThrottle, combined.dailyReturns), statsNoThrottle = null;
  if (throttleOn) {
    const tr = applyDrawdownThrottle(combined.dailyReturns, combined.dates, { triggerDD, restoreDD, throttleMult });
    if (tr) {
      dailyReturnsFinal = tr.dailyReturns;
      stats = withNonCompoundedDD(portfolioStats(dailyReturnsFinal, { mc: false, targetVol }), dailyReturnsFinal);
      statsNoThrottle = withNonCompoundedDD(statsBeforeThrottle, combined.dailyReturns);
      throttle = { triggerDD, restoreDD, throttleMult, daysThrottled: tr.state.filter(s => s.throttled).length, totalDays: tr.state.length };
    }
  }

  let statsUncapped = null;
  if (heatCap) {
    const weightsUncapped = buildWeights(perPairTradesForStats);
    const combinedUncapped = buildPortfolioDailySeries(perPairTradesForStats, weightsUncapped ? { weights: weightsUncapped } : {});
    let uncappedReturns = combinedUncapped.dailyReturns;
    if (throttleOn) {
      const trU = applyDrawdownThrottle(uncappedReturns, combinedUncapped.dates, { triggerDD, restoreDD, throttleMult });
      if (trU) uncappedReturns = trU.dailyReturns;
    }
    statsUncapped = withNonCompoundedDD(portfolioStats(uncappedReturns, { mc: false, targetVol }), uncappedReturns);
  }

  const naiveAvgSharpe = (() => {
    const ss = Object.values(perPair).map(p => p.ownSharpe).filter(v => v != null);
    return ss.length ? +(ss.reduce((a, b) => a + b, 0) / ss.length).toFixed(3) : null;
  })();

  const totalKept = Object.values(perPair).reduce((a, p) => a + p.kept, 0);
  for (const sym of Object.keys(perPair)) {
    perPair[sym].weight = combined.byPair[sym]?.weight ?? 0;
    perPair[sym].tradeShare = totalKept > 0 ? +(perPair[sym].kept / totalKept).toFixed(4) : 0;
  }

  const trades = Object.entries(perPairTradesFinal).flatMap(([sym, list]) =>
    list.map(t => ({ ...t, weight: perPair[sym].weight }))
  ).sort((a, b) => a.time - b.time);

  return {
    pairs: Object.keys(perPairTradesForStats), missing, minMargin, maxConcurrent, perDirection, weighting,
    sizing, riskPct, heatCap, targetVol, throttle,
    stats, statsUncapped, statsNoThrottle, naiveAvgSharpe, days: datesFinal.length,
    equityCurve: datesFinal.map((d, i) => ({ date: d, dailyReturn: dailyReturnsFinal[i] })),
    perPair, trades,
  };
}
