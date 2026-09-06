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
 *     `profitFactor`, `winRate`, `expectancy`, `calmar`, plus the distribution
 *     shape / tail set (`skewness`, `excessKurtosis`, `histVaR`, `histCVaR`).
 *     Each takes its annualisation explicitly (periodsPerYear) so the caller
 *     owns the meaning.
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

// Newey-West (1987) HAC-adjusted Sharpe — for when `sharpeStdError` above
// isn't the real problem. That formula (and the naive Sharpe itself) both
// ASSUME the return series is i.i.d.; when returns are POSITIVELY
// autocorrelated (a "good day/week" tends to be followed by another), the
// naive sample variance understates the true variance of the return-
// generating process, so both the point estimate and its CI come out too
// optimistic — the CI just gets the WRONG width around a Sharpe that's
// itself already inflated (built 2026-08-30, after Fib Atlas's own
// portfolio pages showed Sharpe >10 in production and the owner correctly
// didn't trust it — see LEGO_MODULES.md; confirmed on real EURUSD Asia data
// that daily Sharpe 8.63 falls to 5.63 at weekly and 4.94 at monthly
// aggregation, and this function's own long-run-variance correction at a
// comparable ~45-day bandwidth independently lands on 4.90 — two different
// methods agreeing is real cross-validation, not a coincidence).
//
// long-run variance = gamma_0 + 2 * sum_{k=1..L} w(k) * gamma_k, gamma_k the
// sample autocovariance at lag k, w(k) the Bartlett kernel (1 - k/(L+1)).
// `bandwidth` defaults to Newey-West's own rule of thumb,
// floor(4*(T/100)^(2/9)) — the textbook-recommended L for this sample size.
// A LARGER bandwidth captures more real serial dependence (matches the
// weekly/monthly figures above at L≈45) but grows statistically unreliable
// as L approaches a meaningful fraction of T (estimating an autocovariance
// at lag 120 from a 552-observation sample is thin, noisy evidence) — so
// this is reported as a POINT with an explicit bandwidth, not a single
// "true" number; callers wanting the sensitivity should sweep `bandwidth`
// themselves (see `analysis/fib_atlas_autocorr_sharpe.mjs`'s own sweep for
// exactly this — the Sharpe kept declining out to L=120 without a clear
// plateau, meaning autocorrelation alone does not fully explain Fib Atlas's
// still-elevated headline Sharpe; there is a real, separate, unresolved
// residual beyond what this correction accounts for).
//
//   neweyWestSharpe(dailyReturns, periodsPerYear=252, bandwidth=null) ->
//     { sharpeNaive, sharpeNW, bandwidth, varianceInflation, n }
export function neweyWestSharpe(returns, periodsPerYear = 252, bandwidth = null) {
  const n = returns?.length ?? 0;
  if (n < 2) return { sharpeNaive: 0, sharpeNW: 0, bandwidth: 0, varianceInflation: 1, n };
  const L = bandwidth ?? Math.max(1, Math.floor(4 * Math.pow(n / 100, 2 / 9)));
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const autocov = k => {
    let s = 0;
    for (let i = 0; i < n - k; i++) s += (returns[i] - mean) * (returns[i + k] - mean);
    return s / n;
  };
  const gamma0 = autocov(0);
  let lrv = gamma0;
  for (let k = 1; k <= Math.min(L, n - 1); k++) lrv += 2 * (1 - k / (L + 1)) * autocov(k);
  lrv = Math.max(lrv, 1e-12); // a pathological negative HAC estimate is a degenerate input, not a real "infinite Sharpe"
  const sharpeNaive = gamma0 > 1e-12 ? mean / Math.sqrt(gamma0) * Math.sqrt(periodsPerYear) : 0;
  const sharpeNW = mean / Math.sqrt(lrv) * Math.sqrt(periodsPerYear);
  return {
    sharpeNaive: +sharpeNaive.toFixed(2), sharpeNW: +sharpeNW.toFixed(2),
    bandwidth: L, varianceInflation: gamma0 > 1e-12 ? +(lrv / gamma0).toFixed(2) : 1, n,
  };
}

// Newey-West (1987) HAC-robust single-regressor OLS — the honest way to ask
// "does this factor actually predict this outcome" without assuming i.i.d.
// residuals. Same Bartlett-kernel long-run-variance machine as
// `neweyWestSharpe` above, applied to the regression score (x−x̄)·u instead of
// to a return series — the standard OLS sandwich SE for k=1 regressor. Built
// for regression-testing a macro factor (e.g. liquidity impulse) against
// forward returns, where overlapping/autocorrelated residuals are the norm
// and a naive OLS t-stat overstates significance.
//   neweyWestOLS(x, y, bandwidth=null) ->
//     { beta, intercept, r2, n, seNaive, seNW, tStatNaive, tStatNW, bandwidth }
export function neweyWestOLS(x, y, bandwidth = null) {
  const n = Math.min(x?.length ?? 0, y?.length ?? 0);
  const degenerate = { beta: 0, intercept: 0, r2: 0, n, seNaive: Infinity, seNW: Infinity, tStatNaive: 0, tStatNW: 0, bandwidth: 0 };
  if (n < 3) return degenerate;

  const xbar = x.reduce((a, b) => a + b, 0) / n, ybar = y.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - xbar; sxx += dx * dx; sxy += dx * (y[i] - ybar); }
  if (sxx < 1e-12) return { ...degenerate, intercept: ybar };

  const beta = sxy / sxx, intercept = ybar - beta * xbar;
  const resid = new Array(n);
  let ssr = 0, sst = 0;
  for (let i = 0; i < n; i++) {
    const u = y[i] - intercept - beta * x[i];
    resid[i] = u; ssr += u * u; sst += (y[i] - ybar) ** 2;
  }
  const r2 = sst > 1e-12 ? 1 - ssr / sst : 0;
  const seNaive = Math.sqrt((ssr / Math.max(1, n - 2)) / sxx);

  const L = bandwidth ?? Math.max(1, Math.floor(4 * Math.pow(n / 100, 2 / 9)));
  const score = x.map((xi, i) => (xi - xbar) * resid[i]);
  const sMean = score.reduce((a, b) => a + b, 0) / n;
  const autocov = (k) => { let s = 0; for (let i = 0; i < n - k; i++) s += (score[i] - sMean) * (score[i + k] - sMean); return s / n; };
  let lrv = autocov(0);
  for (let k = 1; k <= Math.min(L, n - 1); k++) lrv += 2 * (1 - k / (L + 1)) * autocov(k);
  lrv = Math.max(lrv, 0);
  const seNW = Math.sqrt(n * lrv) / sxx;

  return {
    beta, intercept, r2, n, seNaive, seNW, bandwidth: L,
    tStatNaive: seNaive > 1e-12 ? beta / seNaive : 0,
    tStatNW: seNW > 1e-12 ? beta / seNW : 0,
  };
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

// ── Distribution shape / tail risk ───────────────────────────────────────────
// Cheap, pure functions of a return/pnl series that catch fat left tails a lone
// Sharpe hides (CLAUDE.md output-analysis guidance). All use POPULATION moments
// (ddof=0) to match the rest of this module and the (kurt-1)/4 term in
// `minTrackRecordLength`. Units are the series' own units (a per-TRADE pnl series
// gives per-trade tail stats, NOT portfolio VaR over a horizon — label as such).

// Sample skewness (Fisher-Pearson, biased/MLE g1). >0 right tail, <0 fat LEFT
// tail. 0 for n<3 or a flat series.
export function skewness(xs) {
  const n = xs.length;
  if (n < 3) return 0;
  const m = mean(xs);
  let s2 = 0, s3 = 0;
  for (const x of xs) { const d = x - m; const d2 = d * d; s2 += d2; s3 += d2 * d; }
  const sd = Math.sqrt(s2 / n);
  return sd > 1e-12 ? (s3 / n) / (sd * sd * sd) : 0;
}

// EXCESS kurtosis (normal = 0, not 3) — named "excess" so it can't be silently
// swapped with raw kurtosis. >0 = fatter tails than Gaussian. 0 for n<4 or flat.
export function excessKurtosis(xs) {
  const n = xs.length;
  if (n < 4) return 0;
  const m = mean(xs);
  let s2 = 0, s4 = 0;
  for (const x of xs) { const d2 = (x - m) ** 2; s2 += d2; s4 += d2 * d2; }
  const v = s2 / n;
  return v > 1e-24 ? (s4 / n) / (v * v) - 3 : 0;
}

// Empirical quantile of an ASCENDING-sorted copy (type-7 linear interpolation,
// numpy/R default) — no distributional assumption. Internal helper.
function quantileSorted(sorted, q) {
  const n = sorted.length;
  if (!n) return 0;
  if (n === 1) return sorted[0];
  const pos = q * (n - 1);
  const lo = Math.floor(pos), frac = pos - lo;
  return lo + 1 < n ? sorted[lo] + frac * (sorted[lo + 1] - sorted[lo]) : sorted[lo];
}

// Historical VaR at confidence p (default 95%): the (1−p) empirical quantile,
// returned in the series' own sign convention — for a loss-bearing series it is
// the NEGATIVE number below which (1−p) of outcomes fall ("5% of the time you
// lose at least |VaR|"). No parametric/normal assumption.
export function histVaR(xs, p = 0.95) {
  if (!xs.length) return 0;
  return quantileSorted(xs.slice().sort((a, b) => a - b), 1 - p);
}

// Historical CVaR / Expected Shortfall at confidence p: the mean of the outcomes
// at or beyond the VaR quantile — the AVERAGE size of the bad-tail event, the
// number VaR alone doesn't tell you. ≤ VaR by construction.
export function histCVaR(xs, p = 0.95) {
  if (!xs.length) return 0;
  const sorted = xs.slice().sort((a, b) => a - b);
  const thr = quantileSorted(sorted, 1 - p);
  let s = 0, k = 0;
  for (const x of sorted) { if (x <= thr) { s += x; k++; } else break; }
  return k ? s / k : thr;
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
  if (!n) return { trades: 0, winRate: 0, profitFactor: 0, expectancy: 0, sharpe: 0, sharpeSE: null, minTrackYears: null, maxDD: 0, totalPnl: 0, skew: 0, excessKurt: 0, var95: 0, cvar95: 0 };
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
  // Distribution shape of THIS strategy's per-trade pnl. Skew/kurt aren't just
  // reported — they feed minTrackRecordLength, which otherwise assumes Gaussian
  // returns (skew 0 / kurt 3). FX pnl is left-skewed and fat-tailed, and both
  // LENGTHEN the true track record needed to trust the Sharpe. `minTrackYears`
  // is now the honest, fat-tail-adjusted figure. (minTrackRecordLength wants raw
  // kurtosis, so pass excessKurt + 3.)
  const sk = skewness(pnls), ek = excessKurtosis(pnls);
  const mtrYears = minTrackRecordLength(annSharpe, { periodsPerYear: tradesPerYr, skew: sk, kurt: ek + 3 });
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
    // Additive fat-left-tail diagnostics (per-TRADE units, not portfolio VaR).
    skew: +sk.toFixed(3),
    excessKurt: +ek.toFixed(3),
    var95: +histVaR(pnls, 0.95).toFixed(4),
    cvar95: +histCVaR(pnls, 0.95).toFixed(4),
  };
}
