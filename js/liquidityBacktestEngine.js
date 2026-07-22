/**
 * Liquidity Backtest Engine — A/B comparison of the liquidity-levels strategy
 * against the baseline range-line strategy.
 *
 * Runs the SAME range-line analyser TWICE with different confluence source sets:
 *
 *   **Control (baseline):** the standard CONFLUENCE_SOURCES (pivots, prior_hilo,
 *   volume_profile, swing_sr, swing_fib, round_number, vwap) — the validated
 *   range-line book.
 *
 *   **Treatment (+liquidity):** the standard sources PLUS `liquidity_levels`
 *   (volume profile POC/VAH/VAL, naked prior extremes, session alignment zones,
 *   and OI walls in forward-only mode).
 *
 * Both runs use the same M1 data, session splits, and per-line policy learning
 * (IS → OOS). The comparison reads:
 *   "Worked"  → the treatment's OOS held-chandelier Sharpe improves over the
 *               baseline on ≥1/2 of pairs with ≥30 OOS trades, OR the liquidity
 *               level cells themselves show independent positive OOS expectancy.
 *   "Didn't"  → the liquidity levels add no OOS edge — the fib ladder already
 *               captures the relevant exhaustion levels.
 *
 * Pure: takes M1 sessions (already loaded), runs the analyser, returns a
 * comparison payload. No network.
 */

import { runRangeLineAnalyser, recordsForPair, extractTouches, runPerLine, runHeldPosition,
         buildPolicy, costForPair, portfolioStats, pnlFor,
         CONFLUENCE_SOURCES, DAILY_CONFLUENCE_SOURCES } from './rangeLineAnalyser.js';
import { bucketM1IntoSessions } from './forecastAnalyser.js';

// Default liquidity level source params (matching the education defaults).
const DEFAULT_LIQ_PARAMS = {
  vpLookback: 5,              // volume profile lookback in days
  nakedLookback: 30,          // naked level scan lookback
  nakedBufferPips: 0,         // buffer for "filled" detection
  alignPips: 2,               // session alignment tolerance (EUR/USD default)
};

// ── Run a single range-line book with a given confluence source set ────────────
function _runBook(sessions, assetClass, confSources, opts = {}) {
  const { asiaHrs = 6, minLookback = 20, minBarsPerSession = 30, dateFrom, dateTo,
          minN = 50, splitFrac = 0.6, marginPct = 0, costMults = [1, 2, 3],
          liqParams = {} } = opts;

  const confOn = !!confSources;
  const analyserOpts = {
    sources: ['asia', 'monday'],
    minLookback, minBarsPerSession, asiaHrs, dateFrom, dateTo,
    touchCfg: { velWin: 15, velFast: 0.60, chandFrac: 0.5 },
    confluence: confOn ? {
      enabled: true,
      mode: 'session',
      sources: confSources,
      tolFrac: 0.1,
      fib15: true,
      fib15ClusterPips: 8,
      naked: true,
      nakedLookback: 30,
      nakedBufferPips: 0,
      // Pass liquidity-specific params through the confluence ctx.
      // The levelSources `liquidity_levels` source reads ctx.params.
      vpLookback: liqParams.vpLookback ?? DEFAULT_LIQ_PARAMS.vpLookback,
      nakedLookbackLiq: liqParams.nakedLookback ?? DEFAULT_LIQ_PARAMS.nakedLookback,
      nakedBufferPipsLiq: liqParams.nakedBufferPips ?? DEFAULT_LIQ_PARAMS.nakedBufferPips,
      alignPips: liqParams.alignPips ?? DEFAULT_LIQ_PARAMS.alignPips,
    } : { enabled: false },
    pip: opts.pip,
  };

  const records = runRangeLineAnalyser(sessions, assetClass, analyserOpts);
  if (!records || !records.length) return null;

  const pairKey = opts.pair || 'unknown';
  const recByPair = { [pairKey]: records };

  const cost = costForPair(pairKey) || 0.0005;
  const slip = 0.0003;
  const cByPair = { [pairKey]: cost };
  const sByPair = { [pairKey]: slip };

  const touches = extractTouches(recByPair, { pairKey });
  if (!touches || !touches.length) return null;

  const allTouches = touches.map(t => ({ ...t, pair: pairKey }));
  const byPair = { [pairKey]: allTouches };
  const n = allTouches.length;
  const splitIdx = Math.floor(n * splitFrac);
  const dates = allTouches.map(t => t.date).sort();
  const splitDate = dates[Math.min(splitIdx, dates.length - 1)] || '';

  const policy = buildPolicy(allTouches, { minN, marginPct });
  if (!policy) return null;

  const perLine = runPerLine(byPair, { policy, splitDate, costByPair: cByPair, slipByPair: sByPair, costMults });
  const held = runHeldPosition(byPair, { policy, splitDate, costByPair: cByPair, slipByPair: sByPair, costMults });

  // Per-cell breakdown: OOS expectancy per cell, including liquidity-specific cells.
  const oosTouches = allTouches.filter(t => t.date >= splitDate);
  const cellStats = {};
  for (const t of oosTouches) {
    const p = policy[t.cell];
    if (!p || p.decision === 'skip') continue;
    const pnl = pnlFor(t, p.decision, { costPct: cost, slipPct: slip });
    (cellStats[t.cell] ??= { cell: t.cell, n: 0, sumPnl: 0, wins: 0, decision: p.decision }).n++;
    cellStats[t.cell].sumPnl += pnl;
    if (pnl > 0) cellStats[t.cell].wins++;
  }

  return {
    records: records.length,
    touches: allTouches.length,
    trades: perLine?.fixed?.trades ?? 0,
    splitDate,
    perLine: {
      fixed:   perLine?.fixed   ?? null,
      struct:  perLine?.struct  ?? null,
      chand:   perLine?.chand   ?? null,
      scale:   perLine?.scale   ?? null,
    },
    held,
    cellStats: Object.values(cellStats)
      .map(c => ({ ...c, expectancy: +(c.sumPnl / c.n).toFixed(5), winRate: +(c.wins / c.n * 100).toFixed(1) }))
      .sort((a, b) => a.cell.localeCompare(b.cell)),
  };
}

// ── Run A/B: baseline vs liquidity-augmented ──────────────────────────────────
// Returns the pair's results for both variants, plus a comparison verdict.
// Pre-registered verdict logic:
//   "liquidity_wins"  → treatment's held-chandelier OOS Sharpe @2× cost is higher
//                       AND the liquidity-level cells show positive OOS expectancy
//   "neutral"         → treatment ≈ baseline (within noise)
//   "baseline_wins"   → treatment is worse
export function runLiquidityAB(sessions, assetClass = 'fx', opts = {}) {
  const { pair = 'unknown', asiaHrs = 6, minLookback = 20, minBarsPerSession = 30,
          dateFrom, dateTo, minN = 50, splitFrac = 0.6, marginPct = 0,
          costMults = [1, 2, 3], liqParams = {} } = opts;

  // ── Control: standard confluence sources ─────────────────────────────────────
  const baselineSources = CONFLUENCE_SOURCES;   // from rangeLineAnalyser
  const baseline = _runBook(sessions, assetClass, baselineSources, {
    pair, asiaHrs, minLookback, minBarsPerSession, dateFrom, dateTo,
    minN, splitFrac, marginPct, costMults, liqParams,
  });

  // ── Treatment: standard + liquidity_levels ───────────────────────────────────
  const treatmentSources = [...CONFLUENCE_SOURCES, 'liquidity_levels'];
  const treatment = _runBook(sessions, assetClass, treatmentSources, {
    pair, asiaHrs, minLookback, minBarsPerSession, dateFrom, dateTo,
    minN, splitFrac, marginPct, costMults, liqParams,
  });

  // ── Verdict ─────────────────────────────────────────────────────────────────
  let verdict = 'no_data';
  let reason = '';

  if (baseline && treatment) {
    const bPrice = baseline.held?.chand;
    const tPrice = treatment.held?.chand;
    const bS2 = bPrice?.costStress?.find(x => x.mult === 2)?.sharpe ?? null;
    const tS2 = tPrice?.costStress?.find(x => x.mult === 2)?.sharpe ?? null;
    const bTrades = bPrice?.trades ?? 0;
    const tTrades = tPrice?.trades ?? 0;

    // Check liquidity-specific cells in treatment.
    const liqCells = treatment.cellStats.filter(c =>
      c.cell.includes('liq_') || c.cell.includes('Liquidity') || c.cell.includes('Align'));
    const liqPositive = liqCells.filter(c => c.expectancy > 0).length;
    const liqTotal = liqCells.length;

    if (bTrades < 30 || tTrades < 30) {
      verdict = 'thin_sample';
      reason = `Baseline ${bTrades} / treatment ${tTrades} trades — below 30-trade OOS minimum`;
    } else if (bS2 != null && tS2 != null) {
      if (tS2 > bS2 && liqPositive >= Math.ceil(liqTotal * 0.5)) {
        verdict = 'liquidity_wins';
        reason = `Treatment OOS Sharpe @2× (${tS2.toFixed(2)}) > baseline (${bS2.toFixed(2)}) ` +
                 `with ${liqPositive}/${liqTotal} liquidity cells positive`;
      } else if (tS2 > bS2) {
        verdict = 'liquidity_wins_weak';
        reason = `Treatment OOS Sharpe @2× (${tS2.toFixed(2)}) > baseline (${bS2.toFixed(2)}) ` +
                 `but only ${liqPositive}/${liqTotal} liquidity cells positive`;
      } else if (Math.abs(tS2 - bS2) < 0.2) {
        verdict = 'neutral';
        reason = `Treatment OOS Sharpe @2× (${tS2.toFixed(2)}) ≈ baseline (${bS2.toFixed(2)}) — within noise`;
      } else {
        verdict = 'baseline_wins';
        reason = `Treatment OOS Sharpe @2× (${tS2.toFixed(2)}) < baseline (${bS2.toFixed(2)})`;
      }
    } else {
      verdict = 'no_sharpe';
      reason = 'Could not compute OOS Sharpe @2× for comparison';
    }
  } else if (!baseline && !treatment) {
    verdict = 'no_data';
    reason = 'Both runs produced no trades';
  } else {
    verdict = 'partial';
    reason = `Only ${baseline ? 'baseline' : 'treatment'} produced trades`;
  }

  return {
    pair,
    config: { asiaHrs, minLookback, minBarsPerSession, minN, splitFrac, marginPct,
              dateFrom, dateTo, costMults, liqParams },
    baseline,
    treatment,
    comparison: {
      verdict,
      reason,
      baselineTrades: baseline?.held?.chand?.trades ?? 0,
      treatmentTrades: treatment?.held?.chand?.trades ?? 0,
      baselineSharpe2x: baseline?.held?.chand?.costStress?.find(x => x.mult === 2)?.sharpe ?? null,
      treatmentSharpe2x: treatment?.held?.chand?.costStress?.find(x => x.mult === 2)?.sharpe ?? null,
      liquidityCells: treatment?.cellStats?.filter(c =>
        c.cell.includes('liq_') || c.cell.includes('Liquidity') || c.cell.includes('Align')
      ) ?? [],
    },
  };
}

// ── Multi-pair A/B ────────────────────────────────────────────────────────────
// Loads M1 for each pair in the universe, runs the A/B, pools results.
// sessionsByPair: { pair: Map(date → bars[]) } — pre-loaded by the server layer.
export function runLiquidityABSuite(pairs, loaders = {}, opts = {}) {
  const { assetClass = 'fx', ...rest } = opts;
  const results = [];

  for (const pair of pairs) {
    const sessions = loaders[pair];
    if (!sessions) continue;
    const r = runLiquidityAB(sessions, assetClass, { ...rest, pair });
    if (r) results.push(r);
  }

  // Pooled summary
  const withData = results.filter(r => r.comparison?.verdict !== 'no_data' && r.comparison?.verdict !== 'thin_sample');
  const wins = withData.filter(r => r.comparison?.verdict === 'liquidity_wins' || r.comparison?.verdict === 'liquidity_wins_weak');
  const losses = withData.filter(r => r.comparison?.verdict === 'baseline_wins');
  const neutrals = withData.filter(r => r.comparison?.verdict === 'neutral');

  return {
    pairs: results.length,
    withData: withData.length,
    verdict: {
      liquidityWins: wins.length,
      baselineWins: losses.length,
      neutral: neutrals.length,
      pctWins: withData.length ? +(wins.length / withData.length * 100).toFixed(1) : 0,
      detail: results.map(r => ({
        pair: r.pair,
        verdict: r.comparison?.verdict,
        reason: r.comparison?.reason,
        baselineSharpe2x: r.comparison?.baselineSharpe2x,
        treatmentSharpe2x: r.comparison?.treatmentSharpe2x,
        baselineTrades: r.baselineTrades,
        treatmentTrades: r.treatmentTrades,
      })),
    },
    results,
  };
}
