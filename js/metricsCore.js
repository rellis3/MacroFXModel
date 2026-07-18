/**
 * Metrics Core — the performance-metrics baseplate brick. Sharpe, Sortino,
 * Calmar, max drawdown, profit factor, win rate and expectancy were each
 * re-implemented in 8+ JS engines (sys-backtest-shared, honestForecastEngine,
 * nasdaqPerformance, zscoreSpreadEngine, macroEquityEngine, rangeFibEngine,
 * gold-backtest-worker, backtest.js) with DIFFERENT annualisation (√12 vs √252
 * vs actual-trade-frequency) and DIFFERENT drawdown definitions. That made
 * "Sharpe 1.4" mean different things in different cards. This brick states the
 * convention in the call, not in a hidden default.
 *
 * Two layers:
 *   • Low-level metric fns — `sharpeRatio`, `sortinoRatio`, `maxDrawdown*`,
 *     `profitFactor`, `winRate`, `expectancy`, `calmar`. Each takes its
 *     annualisation explicitly (periodsPerYear) so the caller owns the meaning.
 *   • `summarizeTrades(pnls, dates)` — reproduces honestForecastEngine.summarize
 *     BIT-FOR-BIT (per-trade Sharpe annualised by the strategy's *actual* trade
 *     frequency, additive-cumulative drawdown, PF 99-fallback). honestForecast
 *     can adopt it without moving a number; new code gets the honest default.
 */

import { mean, stdev } from './statsCore.js';

// ── Drawdown ─────────────────────────────────────────────────────────────────
// Additive cumulative drawdown of a per-trade pnl series (units = pnl units, ≤0).
// Matches honestForecastEngine: cum += x; peak = max(peak, cum); dd = cum - peak.
export function maxDrawdownFromPnls(pnls) {
  let cum = 0, peak = 0, maxDD = 0;
  for (const x of pnls) { cum += x; if (cum > peak) peak = cum; const dd = cum - peak; if (dd < maxDD) maxDD = dd; }
  return maxDD;
}

// Multiplicative drawdown of an equity curve, as a NEGATIVE fraction (e.g. -0.18).
export function maxDrawdownFromEquity(equity) {
  let peak = -Infinity, maxDD = 0;
  for (const v of equity) { if (v > peak) peak = v; if (peak > 0) { const dd = (v - peak) / peak; if (dd < maxDD) maxDD = dd; } }
  return maxDD;
}

// ── Ratios ───────────────────────────────────────────────────────────────────
// Sharpe of a per-period return series, annualised by √periodsPerYear.
// ddof=0 (population) by default to match the engines that scale per-trade.
export function sharpeRatio(returns, periodsPerYear = 1, ddof = 0) {
  if (returns.length < 2) return 0;
  const m = mean(returns), sd = stdev(returns, ddof);
  return sd > 1e-12 ? (m / sd) * Math.sqrt(periodsPerYear) : 0;
}

// Sortino: like Sharpe but divides by downside deviation (returns below 0).
export function sortinoRatio(returns, periodsPerYear = 1) {
  if (returns.length < 2) return 0;
  const m = mean(returns);
  let dsq = 0, k = 0;
  for (const r of returns) { if (r < 0) { dsq += r * r; k++; } }
  const dd = k ? Math.sqrt(dsq / k) : 0;
  return dd > 1e-12 ? (m / dd) * Math.sqrt(periodsPerYear) : 0;
}

// Calmar = annualised return / |max drawdown|. Both supplied by the caller
// (definitions of "annual return" vary too much to assume one here).
export function calmar(annualReturn, maxDD) {
  const m = Math.abs(maxDD);
  return m > 1e-12 ? annualReturn / m : 0;
}

// ── Sharpe honesty: error bars + minimum track record ────────────────────────
// Standard error of an ANNUALISED Sharpe estimate (Lo 2002, iid-normal case).
// `sharpeAnnual` is the annualised Sharpe, `nPeriods` the number of return
// observations it was estimated from, `periodsPerYear` their frequency.
// Derivation: per-period SE = √((1+SR_p²/2)/T), annualised by √k →
// SE_ann = √((k + SR_ann²/2)/T). Report every Sharpe as `SR ± SE` — a card
// showing 0.6 ± 0.5 is telling you the sample can't distinguish it from zero.
export function sharpeStdError(sharpeAnnual, nPeriods, periodsPerYear = 252) {
  if (!(nPeriods > 1) || !(periodsPerYear > 0)) return Infinity;
  return Math.sqrt((periodsPerYear + (sharpeAnnual * sharpeAnnual) / 2) / nPeriods);
}

// Minimum Track Record Length (Bailey & López de Prado 2012): how many YEARS of
// live returns are needed before `sharpeAnnual` is statistically distinguishable
// from `benchmark` (default 0) at the confidence implied by `z` (default 1.645 =
// 95% one-sided). `skew`/`kurt` of the per-period returns sharpen the estimate;
// the defaults (0/3) give the Gaussian case. Returns Infinity when the Sharpe
// doesn't exceed the benchmark — no amount of data can confirm a non-edge.
export function minTrackRecordLength(sharpeAnnual, {
  benchmark = 0, z = 1.645, periodsPerYear = 252, skew = 0, kurt = 3,
} = {}) {
  const k = periodsPerYear;
  const sr = sharpeAnnual / Math.sqrt(k), srB = benchmark / Math.sqrt(k);
  if (!(sr > srB)) return Infinity;
  const adj = Math.max(1e-12, 1 - skew * sr + ((kurt - 1) / 4) * sr * sr);
  const periods = 1 + adj * Math.pow(z / (sr - srB), 2);
  return periods / k;   // years
}

// ── Trade-distribution metrics ───────────────────────────────────────────────
export function winRate(pnls) {
  if (!pnls.length) return 0;
  return pnls.filter(x => x > 0).length / pnls.length;
}

// gross wins / gross losses. Returns `noLoss` (default 99) when there are no
// losing trades but at least one win, 0 when empty — matches honestForecast.
export function profitFactor(pnls, noLoss = 99) {
  let gw = 0, gl = 0;
  for (const x of pnls) { if (x > 0) gw += x; else gl += -x; }
  return gl > 1e-9 ? gw / gl : (gw > 0 ? noLoss : 0);
}

export const expectancy = pnls => (pnls.length ? mean(pnls) : 0);

// ── Honest per-trade summary (reproduces honestForecastEngine.summarize) ──────
// pnls: per-trade pnl (e.g. pnl_pct). dates: same-length ISO 'YYYY-MM-DD' array
// (trade dates, any order). Annualises the per-trade Sharpe by the strategy's
// actual trade frequency, clamped to ≥0.25yr so tiny samples don't blow up.
export function summarizeTrades(pnls, dates) {
  const n = pnls.length;
  if (!n) return { trades: 0, winRate: 0, profitFactor: 0, expectancy: 0, sharpe: 0, sharpeSE: null, minTrackYears: null, maxDD: 0, totalPnl: 0 };
  const m = mean(pnls);
  const sd = stdev(pnls, 0);            // population std, as in the original
  const sorted = dates.slice().sort();
  const yrs = Math.max(
    (Date.parse(sorted[sorted.length - 1]) - Date.parse(sorted[0])) / (365.25 * 864e5),
    0.25);
  const tradesPerYr = n / yrs;
  const perTradeSharpe = sd > 1e-9 ? m / sd : 0;
  const annSharpe = perTradeSharpe * Math.sqrt(tradesPerYr);
  // Sharpe honesty pair (2026-07): every card that renders this summary now
  // carries the error bar (`SR ± sharpeSE`) and the minimum track record needed
  // to trust SR > 0 at 95% — a Sharpe inside its own error bar of zero has
  // shown nothing. Same trade-frequency basis as the Sharpe itself. Additive
  // fields only; the frozen golden test compares the original keys.
  const se = sharpeStdError(annSharpe, n, tradesPerYr);
  const mtrYears = minTrackRecordLength(annSharpe, { periodsPerYear: tradesPerYr });
  return {
    trades: n,
    tradesPerYr: +tradesPerYr.toFixed(1),
    winRate: +(winRate(pnls) * 100).toFixed(1),
    profitFactor: +profitFactor(pnls).toFixed(3),
    expectancy: +m.toFixed(4),
    sharpe: +annSharpe.toFixed(3),
    sharpeSE: Number.isFinite(se) ? +se.toFixed(3) : null,
    minTrackYears: Number.isFinite(mtrYears) ? +mtrYears.toFixed(1) : null,
    maxDD: +maxDrawdownFromPnls(pnls).toFixed(3),
    totalPnl: +pnls.reduce((s, x) => s + x, 0).toFixed(3),
  };
}
