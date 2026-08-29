// Fib Atlas SL-tightening backtest -- the Asia/Monday sibling of
// analysis/sl_tightening_backtest.mjs (the study behind Level Atlas's live
// SL-tightening feature), extended with the fuller 9-step checklist the
// owner asked to have replicated: real empirical distribution grid, IS-frozen
// selection rule tested unchanged on OOS, tail-risk diagnostics for a
// never-peaking curve, a realistic portfolio heat-cap sweep, a Sharpe
// confidence interval (not a bare point estimate), per-trade vs per-day win
// rate, and intraday (not just end-of-day) drawdown.
//
// Reuses every shared brick unchanged -- ZERO new backtest math:
//   applyConcurrencyCap / riskAdjustTrades / buildPortfolioDailySeries /
//   priceAtTighterStop / applyPortfolioHeatCap   (levelAtlasVoteReview.js)
//   portfolioStats / backtestStats                (backtestStats.js)
//   skewness / histCVaR                           (metricsCore.js)
//   intradayMtmDrawdown / tradeTimingStats         (intradayDrawdown.js —
//     already built for exactly this: an MAE-anchored, concurrency-aware
//     mark-to-market drawdown. Fib Atlas trades already carry the fields it
//     wants (time/resolveTime/pnlPct/maePct) with zero adaptation.)
//
// Cost note: Fib Atlas's stored votetrades already have REAL per-pair cost
// baked into pnlPct (js/asiaFibAtlasRoutes.js's build step calls
// costForPair() before ever writing to R2 -- see that file's `/run` handler).
// Repricing a trade at a tighter stop is the SAME trade exiting earlier, not
// a new one, so `priceAtTighterStop` is called with cost=0 here (mirrors
// Level Atlas's own script's COST=0 exactly) -- passing the real cost again
// would double-charge it.
//
// IS/OOS discipline: the R2-stored trades are already only the book's own
// OOS slice (buildBarrierTrades filters to date >= book.splitDate before
// ever being persisted) -- but the STOP-FRACTION parameter tested here has
// never been fit against ANY of that data before now. So this script draws
// its OWN fresh 70/30 split inside that pool, fits the fraction on the
// first 70% by a rule stated below BEFORE looking at results, freezes it,
// and reports the frozen choice on the untouched final 30% -- a genuinely
// clean holdout for THIS parameter, same discipline as Level Atlas's own
// script, regardless of what is or isn't settled about the vote-decision
// layer itself (see LEGO_MODULES.md's 2026-08-29 holdsOOS entry -- a
// separate question from whether tightening the stop helps, conditional on
// whatever trades exist).
//
// DECISION filter (2026-08-29, added after the MAE-timing checkpoint study
// found fade's give-back-predicts-loss signal is 30-100% stronger than
// follow's at every checkpoint -- the earlier uniform fade+follow run
// likely undersold what fade alone supports and over-touched follow's much
// weaker signal): DECISION=fade|follow|all selects which decisions this
// run's trade pool includes, mirroring Level Atlas's own
// applyFadeStopTightening design choice to only ever tighten fade. Default
// 'all' keeps the original uniform behaviour for comparison.
import { getJSON } from '../js/r2Store.js';
import {
  applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  priceAtTighterStop, applyPortfolioHeatCap, applyDrawdownThrottle,
} from '../js/levelAtlasVoteReview.js';
import { portfolioStats, backtestStats } from '../js/backtestStats.js';
import { skewness, histCVaR } from '../js/metricsCore.js';
import { intradayMtmDrawdown, tradeTimingStats } from '../js/intradayDrawdown.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';

const LADDER = (process.env.LADDER || 'asia').toLowerCase();
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const MIN_MARGIN = Number(process.env.MIN_MARGIN || 2), MAX_CONCURRENT = 1, RISK_PCT = 1, COST = 0;
const DECISION = (process.env.DECISION || 'all').toLowerCase(); // 'all' | 'fade' | 'follow'
const FRACTIONS = [1.0, 0.90, 0.75, 0.60, 0.50, 0.40, 0.25];
const HEAT_CAPS = [1, 2, 3]; // % of NAV, simultaneous
const PAIRS = RANGE_FIB_INSTRUMENTS;

async function loadTrades(pair) {
  const prefix = LADDER_PREFIX[LADDER];
  if (!prefix) throw new Error(`LADDER must be asia|monday, got "${LADDER}"`);
  const stored = await getJSON(`${prefix}/${pair}-votetrades.json`);
  if (!stored) return [];
  const filtered = stored.trades.filter(t => t.margin >= MIN_MARGIN && (DECISION === 'all' || t.decision === DECISION));
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  return (capped?.kept ?? []).map(t => ({ ...t, pair: stored.instrument }));
}

async function main() {
  console.log(`Fib Atlas SL-tightening backtest — ladder=${LADDER}  minMargin=${MIN_MARGIN}  decision=${DECISION}\n`);
  const byPair = {};
  for (const p of PAIRS) byPair[p] = await loadTrades(p);
  const allTrades = Object.values(byPair).flat().sort((a, b) => a.time - b.time);
  if (!allTrades.length) { console.error('No trades loaded — nothing to study.'); process.exit(1); }
  const uniqueDates = [...new Set(allTrades.map(t => t.date))].sort();
  const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
  console.log(`${allTrades.length} trades (margin>=${MIN_MARGIN}) across ${PAIRS.length} pairs. Fresh IS/OOS split for THIS study: ${cutoff}\n`);

  function sliceByPair(pred) {
    const out = {};
    for (const p of PAIRS) out[p] = byPair[p].filter(pred);
    return out;
  }
  const isByPair = sliceByPair(t => t.date <= cutoff);
  const oosByPair = sliceByPair(t => t.date > cutoff);

  function applyFraction(perPair, fraction) {
    if (fraction === 1.0) return perPair;
    const out = {};
    for (const p of PAIRS) {
      out[p] = perPair[p].map(t => {
        if (t.maePips == null) return t; // priceAtTighterStop needs maePips (see levelAtlasVoteReview.js)
        const priced = priceAtTighterStop(t, t.stopPips * fraction, COST);
        return priced ? { ...t, ...priced, stopPips: Math.min(t.stopPips * fraction, t.stopPips) } : t;
      });
    }
    return out;
  }

  function flatten(perPair) { return Object.values(perPair).flat(); }

  function statsFor(perPair, { heatCapPct = null, throttle = null } = {}) {
    const riskAdj = {};
    for (const p of PAIRS) riskAdj[p] = riskAdjustTrades(perPair[p], RISK_PCT).map(t => ({ ...t, pair: p }));
    let finalByPair = riskAdj, heatSkipped = null;
    if (heatCapPct) {
      const heatResult = applyPortfolioHeatCap(riskAdj, { maxHeatPct: heatCapPct });
      if (heatResult) {
        const byP = {};
        for (const t of heatResult.kept) (byP[t.pair] ??= []).push(t);
        finalByPair = byP;
        heatSkipped = { skipped: heatResult.skippedCount, total: heatResult.totalCount };
      }
    }
    const weights = Object.fromEntries(PAIRS.map(p => [p, 1]));
    const combined = buildPortfolioDailySeries(finalByPair, { weights });
    // Drawdown throttle (2026-08-29) — a DIFFERENT lever from the heat cap:
    // heat cap limits SIMULTANEOUS exposure at any one instant; the throttle
    // reacts to the strategy's OWN realized equity curve breaching a
    // drawdown threshold and de-risks until it recovers — built specifically
    // because a heat cap alone was shown (on Level Atlas's real data) to
    // barely dent a drawdown driven by a correlated LOSING STRETCH rather
    // than a pile-up of concurrent positions. Applied AFTER combining to
    // daily returns (its own contract — see levelAtlasVoteReview.js).
    let dailyFinal = combined.dailyReturns;
    if (throttle) {
      const tr = applyDrawdownThrottle(combined.dailyReturns, combined.dates, throttle);
      if (tr) dailyFinal = tr.dailyReturns;
    }
    const ps = portfolioStats(dailyFinal, { mc: false });

    const allRisk = flatten(finalByPair);
    const losers = allRisk.filter(t => !t.win);
    const avgLossRiskAdjPct = losers.length ? losers.reduce((a, t) => a + t.pnlPct, 0) / losers.length : null;
    const rawLosers = flatten(perPair).filter(t => !t.win);
    const avgLossRawPct = rawLosers.length ? rawLosers.reduce((a, t) => a + Math.abs(t.pnlPct), 0) / rawLosers.length : null;

    // Per-trade vs per-day win rate (step 8) — genuinely different numbers.
    const perTradeWinRate = allRisk.length ? +(allRisk.filter(t => t.win).length / allRisk.length * 100).toFixed(1) : null;
    const byDate = {};
    for (const t of allRisk) (byDate[t.date] ??= []).push(t);
    const days = Object.values(byDate);
    const perDayWinRate = days.length ? +(days.filter(ds => ds.reduce((a, t) => a + t.pnlPct, 0) > 0).length / days.length * 100).toFixed(1) : null;

    // Tail-risk diagnostics (step 4) — cheap, pure functions of the daily series.
    const skew = combined.dailyReturns.length >= 3 ? +skewness(combined.dailyReturns).toFixed(3) : null;
    const cvar95 = combined.dailyReturns.length ? +histCVaR(combined.dailyReturns, 0.95).toFixed(4) : null;

    // Intraday MTM drawdown (step 9) — reuses the already-built, already-
    // tested brick; NOT a new day-loop. maePct on Fib Atlas trades is the
    // adverse-excursion magnitude for the trade's own decision already.
    const mtm = intradayMtmDrawdown(allRisk.map(t => ({
      entryTime: t.time, exitTime: t.resolveTime, finalPnl: t.pnlPct, maePct: Math.abs(t.maePct ?? 0),
    })));
    const timing = tradeTimingStats(allRisk.map(t => ({ entryTime: t.time, exitTime: t.resolveTime, maePct: Math.abs(t.maePct ?? 0) })));

    return {
      trades: allRisk.length, days: combined.dailyReturns.length,
      perTradeWinRate, perDayWinRate,
      sharpe: ps.sharpe, maxDD: ps.maxDD, cagr: ps.cagr, calmar: ps.calmar,
      profitFactor: (() => {
        const gp = allRisk.filter(t => t.win).reduce((a, t) => a + t.pnlPct, 0);
        const gl = -allRisk.filter(t => !t.win).reduce((a, t) => a + t.pnlPct, 0);
        return gl > 1e-9 ? +(gp / gl).toFixed(2) : null;
      })(),
      avgLossRiskAdjPct: avgLossRiskAdjPct != null ? +avgLossRiskAdjPct.toFixed(3) : null,
      avgLossRawPct: avgLossRawPct != null ? +avgLossRawPct.toFixed(4) : null,
      skew, cvar95, heatSkipped,
      mtmMaxDD: mtm.maxDD, closedMaxDD: ps.maxDD, mtmCoverage: mtm.coverage,
      medianDurationMin: timing.medianDurationMin, avgDurationMin: timing.avgDurationMin,
      pnls: allRisk.map(t => t.pnlPct), dates: allRisk.map(t => t.date), // for backtestStats CI below
    };
  }

  function printRow(label, s) {
    console.log([
      label.padEnd(14), String(s.trades).padStart(6),
      (s.perTradeWinRate + '%').padStart(9), (s.perDayWinRate + '%').padStart(9),
      String(s.sharpe).padStart(7), (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9),
      String(s.calmar).padStart(6), String(s.profitFactor).padStart(6),
      (s.avgLossRawPct + '%').padStart(10), String(s.skew).padStart(7), String(s.cvar95).padStart(8),
    ].join('  '));
  }
  function header() {
    console.log([
      'variant'.padEnd(14), 'trades'.padStart(6), 'tradeWin%'.padStart(9), 'dayWin%'.padStart(9),
      'sharpe'.padStart(7), 'maxDD'.padStart(8), 'CAGR'.padStart(9), 'Calmar'.padStart(6), 'PF'.padStart(6),
      'avgLoss(raw%)'.padStart(10), 'skew'.padStart(7), 'CVaR95'.padStart(8),
    ].join('  '));
  }

  console.log('──── IN-SAMPLE (fit + evaluate on the same slice) ────');
  header();
  const isBaseline = statsFor(isByPair);
  printRow('baseline', isBaseline);
  const isRows = [];
  for (const f of FRACTIONS) {
    if (f === 1.0) continue;
    const s = statsFor(applyFraction(isByPair, f));
    isRows.push({ f, ...s });
    printRow(`frac=${f}`, s);
  }

  // Step 4: watch for a curve that never peaks. If Sharpe just keeps
  // climbing toward the tightest fraction with no interior maximum, that is
  // the "collect small wins, rare catastrophic loss" signature reversed
  // (here: an ever-TIGHTER stop looking ever better is what a whipsaw-immune
  // artifact would look like if the sample never lived through the regime
  // that punishes over-tight stops) — flag it plainly rather than trust a
  // monotonic curve at face value.
  const sharpes = [isBaseline.sharpe, ...isRows.map(r => r.sharpe)];
  const monotonicUp = sharpes.every((v, i) => i === 0 || v >= sharpes[i - 1]);
  const monotonicDown = sharpes.every((v, i) => i === 0 || v <= sharpes[i - 1]);
  if (monotonicUp || monotonicDown) {
    console.log(`\n⚠ IS Sharpe is MONOTONIC across the whole fraction grid (${monotonicUp ? 'always improves as the stop tightens' : 'always worsens as the stop tightens'}) — no interior peak. Treat the tail-risk columns (skew/CVaR95) above as the primary read here, not the Sharpe ranking alone.`);
  } else {
    console.log('\n✓ IS Sharpe has an interior peak across the fraction grid (not monotonic) — a real trade-off, not an edge-of-grid artifact.');
  }

  // Selection rule v2 (2026-08-29, fixed after the fade-only run showed the
  // v1 rule — "tightest fraction clearing a 90%-of-baseline floor" — picks
  // the TIGHTEST eligible fraction, not the BEST one. When baseline's own
  // Sharpe is weak, that floor is trivial to clear and the rule just walks
  // to the far edge of the grid, even when a looser fraction dominates it
  // on every axis (this happened: frac=0.4 was chosen over frac=0.75/0.9,
  // which beat it on Sharpe, maxDD, AND win-rate preserved — see
  // LEGO_MODULES.md's 2026-08-29 fade-only entry). Pre-stated rule NOW:
  // among fractions that improve maxDD over baseline, pick the one with the
  // HIGHEST IS Sharpe — maximize, don't just clear a floor.
  const eligible = isRows.filter(r => r.maxDD > isBaseline.maxDD);
  const chosen = eligible.length ? eligible.reduce((best, r) => (r.sharpe > best.sharpe ? r : best)) : null;
  console.log(chosen
    ? `\nChosen (pre-stated rule v2: among fractions with lower maxDD than baseline, the one with the HIGHEST IS Sharpe): fraction=${chosen.f}\n`
    : `\nNo fraction improved maxDD over baseline — none frozen for OOS.\n`);

  console.log('──── OUT-OF-SAMPLE (fraction frozen from IS, applied unchanged) ────');
  header();
  const oosBaseline = statsFor(oosByPair);
  printRow('baseline', oosBaseline);
  let oosChosen = null;
  if (chosen) { oosChosen = statsFor(applyFraction(oosByPair, chosen.f)); printRow(`frac=${chosen.f}`, oosChosen); }
  console.log('\n(full OOS grid, for context beyond just the chosen fraction:)');
  for (const f of FRACTIONS) {
    if (f === 1.0) continue;
    printRow(`frac=${f}`, statsFor(applyFraction(oosByPair, f)));
  }

  // Step 6: realistic portfolio heat cap — sweep 1/2/3% simultaneous exposure.
  console.log('\n──── Heat-cap sweep on OOS (baseline vs chosen fraction, if any) ────');
  console.log('cap%    variant       trades   sharpe   maxDD      skipped/total');
  for (const cap of HEAT_CAPS) {
    const s = statsFor(oosByPair, { heatCapPct: cap });
    console.log(`${String(cap).padStart(3)}%    baseline      ${String(s.trades).padStart(6)}   ${String(s.sharpe).padStart(6)}   ${(s.maxDD + '%').padStart(7)}   ${s.heatSkipped ? `${s.heatSkipped.skipped}/${s.heatSkipped.total}` : '—'}`);
    if (chosen) {
      const sc = statsFor(applyFraction(oosByPair, chosen.f), { heatCapPct: cap });
      console.log(`${String(cap).padStart(3)}%    frac=${chosen.f}     ${String(sc.trades).padStart(6)}   ${String(sc.sharpe).padStart(6)}   ${(sc.maxDD + '%').padStart(7)}   ${sc.heatSkipped ? `${sc.heatSkipped.skipped}/${sc.heatSkipped.total}` : '—'}`);
    }
  }

  // Combined-lever stack (2026-08-29): how far do these actually push
  // drawdown down when STACKED, not tested one at a time? chosen fraction
  // alone -> + a 2% heat cap -> + a drawdown throttle (trigger -5%,
  // restore 0%, half-size while throttled — the same defaults
  // fibAtlasVotePortfolio.js's own route exposes) -> all three together.
  console.log('\n──── Combined lever stack on OOS (chosen fraction + heat cap + drawdown throttle) ────');
  header();
  const THROTTLE_OPTS = { triggerDD: -5, restoreDD: 0, throttleMult: 0.5 };
  if (chosen) {
    printRow('baseline', oosBaseline);
    printRow(`frac=${chosen.f}`, oosChosen);
    printRow(`+heatCap2%`, statsFor(applyFraction(oosByPair, chosen.f), { heatCapPct: 2 }));
    printRow(`+throttle`, statsFor(applyFraction(oosByPair, chosen.f), { throttle: THROTTLE_OPTS }));
    printRow(`+both`, statsFor(applyFraction(oosByPair, chosen.f), { heatCapPct: 2, throttle: THROTTLE_OPTS }));
  } else {
    console.log('(no fraction was chosen — skipping the combined stack)');
  }

  // Step 7: Sharpe confidence interval, not a bare point estimate — from
  // backtestStats' own bootstrap (resample-with-replacement on the ACTUAL
  // trade list), 5th/50th/95th percentile. IMPORTANT: this is a DIFFERENT
  // Sharpe basis than the headline tables above (which use portfolioStats'
  // DAILY-aggregated Sharpe — the honest concurrency-aware figure per this
  // codebase's own convention, see backtestStats.js's own header comment).
  // backtestStats operates on the raw PER-TRADE series and annualizes by
  // trades/year, which overstates independence for a book with many
  // simultaneous positions. Printing backtestStats' OWN point estimate next
  // to its OWN CI (not portfolioStats' daily Sharpe) keeps the two
  // consistent — pairing a daily point estimate with a per-trade CI would
  // silently compare two different numbers under one label.
  console.log('\n──── Sharpe confidence interval (bootstrap 5th/50th/95th pctile, OOS, PER-TRADE basis — NOT the daily Sharpe in the tables above) ────');
  for (const [label, s] of [['baseline', oosBaseline], ...(oosChosen ? [[`frac=${chosen.f}`, oosChosen]] : [])]) {
    const bs = backtestStats(s.pnls, s.dates);
    console.log(`  ${label.padEnd(12)} per-trade point=${bs.sharpe}   90% CI=[${bs.bootstrap?.sharpe?.p5 ?? '—'}, ${bs.bootstrap?.sharpe?.p95 ?? '—'}]   P(profitable)=${bs.bootstrap?.pPositive ?? '—'}   (daily-basis Sharpe from table above: ${s.sharpe})`);
  }

  // Step 9 headline: how much bigger is the REAL (intraday, concurrency-aware)
  // drawdown than the closed-trade-only figure everything above reports?
  console.log('\n──── Intraday mark-to-market drawdown vs closed-trade-only maxDD (OOS) ────');
  for (const [label, s] of [['baseline', oosBaseline], ...(oosChosen ? [[`frac=${chosen.f}`, oosChosen]] : [])]) {
    console.log(`  ${label.padEnd(12)} closed maxDD=${s.closedMaxDD}%   intraday MTM maxDD=${s.mtmMaxDD}%   coverage=${s.mtmCoverage}   medianDur=${s.medianDurationMin}min`);
  }
}

main();
