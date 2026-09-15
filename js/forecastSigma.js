/**
 * Forecast σ — the volatility estimators the fitted ladder is calibrated against.
 *
 * WHY THIS EXISTS AS ITS OWN MODULE. `js/forecastLadderParams.js` ships width
 * multipliers that are quantiles of (realized ÷ σ). A multiplier is only valid for
 * the σ it was fit against: feed it a different σ series and the calibration is
 * gone, silently, with the bands still looking plausible. So the frozen spec is the
 * PAIR (estimator, widths), and this module is the JS half of that pair — a
 * line-for-line port of `forge/vol.py`'s estimators, cross-checked against the
 * Python on a shared synthetic series by `forecastSigma.test.mjs`.
 *
 * Causality convention, copied deliberately: each estimator reports volatility AS
 * OF THE CLOSE of its own bar (day t's own OHLC included). Turning that into
 * something forecast-ready is the job of ONE explicit function, `asOfYesterday` —
 * never baked into individual estimators, because three estimators with three
 * silently different shift conventions is exactly the bug forge's prefix-invariance
 * tests were written to catch.
 */

import { realizedVarSeries, _harFitCore, VAR_FLOOR_FRAC } from './volForecastBench.js';

const SQRT252 = Math.sqrt(252);

// Rolling sample variance (ddof=1) — matches pandas .rolling(n).var().
function _rollVar(x, n) {
  const out = new Array(x.length).fill(NaN);
  for (let i = n - 1; i < x.length; i++) {
    const w = x.slice(i - n + 1, i + 1);
    if (w.some(v => !Number.isFinite(v))) continue;
    const mu = w.reduce((s, v) => s + v, 0) / n;
    out[i] = w.reduce((s, v) => s + (v - mu) ** 2, 0) / (n - 1);
  }
  return out;
}

function _rollMean(x, n) {
  const out = new Array(x.length).fill(NaN);
  for (let i = n - 1; i < x.length; i++) {
    const w = x.slice(i - n + 1, i + 1);
    if (w.some(v => !Number.isFinite(v))) continue;
    out[i] = w.reduce((s, v) => s + v, 0) / n;
  }
  return out;
}

/**
 * Yang-Zhang, rolling `window`, annualized %.
 *   σ²_YZ = σ²_overnight + k·σ²_open-close + (1−k)·σ²_Rogers-Satchell
 *   k = 0.34 / (1.34 + (n+1)/(n−1))
 */
export function yangZhangSigma(bars, window) {
  const n = bars.length;
  const overnight = new Array(n).fill(NaN);
  const oc = new Array(n).fill(NaN);
  const rs = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (i > 0) overnight[i] = Math.log(b.open / bars[i - 1].close);
    const o = Math.log(b.close / b.open);
    const u = Math.log(b.high / b.open);
    const d = Math.log(b.low / b.open);
    oc[i] = o;
    rs[i] = u * (u - o) + d * (d - o);
  }
  const k = 0.34 / (1.34 + (window + 1) / (window - 1));
  const vOn = _rollVar(overnight, window);
  const vOc = _rollVar(oc, window);
  const vRs = _rollMean(rs, window);
  return vOn.map((_, i) => {
    const v = vOn[i] + k * vOc[i] + (1 - k) * vRs[i];
    return Number.isFinite(v) ? Math.sqrt(Math.max(v, 0)) * SQRT252 * 100 : NaN;
  });
}

/** RiskMetrics EWMA on close-to-close log returns, annualized %. */
export function ewmaSigma(bars, lambda, minPeriods = 20) {
  const n = bars.length;
  const out = new Array(n).fill(NaN);
  if (n <= minPeriods) return out;
  const r = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) r[i] = Math.log(bars[i].close / bars[i - 1].close);

  // Seed with the sample variance (ddof=1) of returns 1..minPeriods, matching
  // numpy's nanvar(..., ddof=1) over that same slice.
  const seedWin = r.slice(1, minPeriods + 1).filter(Number.isFinite);
  if (seedWin.length < 2) return out;
  const mu = seedWin.reduce((s, v) => s + v, 0) / seedWin.length;
  let variance = seedWin.reduce((s, v) => s + (v - mu) ** 2, 0) / (seedWin.length - 1);

  out[minPeriods] = variance;
  for (let i = minPeriods + 1; i < n; i++) {
    variance = lambda * variance + (1 - lambda) * r[i] ** 2;   // day i's own return
    out[i] = variance;
  }
  return out.map(v => (Number.isFinite(v) ? Math.sqrt(Math.max(v, 0)) * SQRT252 * 100 : NaN));
}

/** Expanding-window close-to-close vol — the non-adaptive baseline, annualized %. */
export function naiveExpandingSigma(bars, minPeriods = 60) {
  const n = bars.length;
  const out = new Array(n).fill(NaN);
  let sum = 0, count = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const r = Math.log(bars[i].close / bars[i - 1].close);
      if (Number.isFinite(r)) { sum += r * r; count++; }
    }
    // pandas .expanding(min_periods=k) counts NON-NaN observations; r[0] is NaN,
    // so the first finite value appears once `count` reaches minPeriods.
    if (count >= minPeriods) out[i] = Math.sqrt(Math.max(sum / count, 0)) * SQRT252 * 100;
  }
  return out;
}

/**
 * HAR-RV, LOG form, on Garman-Klass daily realized variance — the estimator
 * validated in `volatilityExhaustion/har_cj_forecast.py` (Phase 14/15) and
 * registered into the bench as `harRvLogPred`/`harRvLogForecastNext`
 * (`js/volForecastBench.js`, LEGO_MODULES.md §1ay/§1az). Reuses that file's
 * `realizedVarSeries` and `_harFitCore` (the unclamped walk-forward HAR core)
 * directly — no second implementation of the OLS machinery, per the Lego
 * Principle. Mirrors `forge/vol.py`'s `har_rv_log_sigma` (LEGO_MODULES.md
 * §1bb) exactly, including the fixed-window scale below — see that
 * function's docstring for the full causality argument.
 *
 * UNLIKE yangZhangSigma/ewmaSigma/naiveExpandingSigma (which measure bar i's
 * OWN volatility using bar i's own OHLC, and only become a forecast via this
 * module's ONE explicit later step, `asOfYesterday`), HAR-RV is inherently a
 * walk-forward FORECAST already: `_harFitCore`'s value at index i is built
 * purely from lagged history STRICTLY BEFORE i. To still go through the same
 * uniform `asOfYesterday` shift every other entry in `SIGMA_ESTIMATORS` goes
 * through — never special-cased, so a caller can treat every estimator the
 * same way — this function pre-shifts its own output one step EARLY: index i
 * holds the forecast for bar i+1, not bar i. `asOfYesterday`'s later
 * right-shift (`out[t] = in[t-1]`) then lands the value back on the bar it
 * actually forecasts, un-double-shifted. Getting this backwards would
 * silently serve a forecast one day stale — verified by a dedicated
 * round-trip test in `forecastSigma.test.mjs`, not just asserted here.
 *
 * The smearing correction is a CAUSAL EXPANDING running mean (only residuals
 * strictly before the bar being predicted), not the whole-sample constant an
 * earlier draft of `harRvLogPred` used before its own no-lookahead test
 * caught the leak (LEGO_MODULES.md §1ay) — same fix, applied here from the
 * start rather than found the same way twice.
 *
 * SCALE IS FROM A FIXED EARLY WINDOW, not `_rvScale`'s whole-series median
 * (deliberately NOT reused here — see below). OLS with an intercept is
 * provably invariant to a uniform additive shift applied to target and every
 * regressor alike, and scaling by a constant before the log is exactly that
 * (log(rv·S) = log(rv) + log(S), the same log(S) on every observation) — so
 * the constant's VALUE never moves the fitted predictions, only the solve's
 * conditioning. But `forge/vol.py`'s prefix-invariance test caught that this
 * breaks down near the FLOOR: floor-clamping is a nonlinear max(), so a scale
 * depending on the WHOLE series changes which near-zero-range days get
 * floored (and to what) using data that hasn't happened yet at the day being
 * predicted — a genuine, if small (~1e-4 absolute annualized-%), lookahead
 * leak. `_rvScale` is correct and unchanged for `harRvLogPred`'s own use
 * (a one-shot backtest score, not a per-day causal series); this function
 * needs day-by-day causal purity, so it derives its own scale from a FIXED
 * early window instead — invariant to truncation anywhere after that window.
 */
const HAR_SIGMA_SCALE_WINDOW = 250;   // ~1 trading year

export function harRvLogSigma(bars) {
  const n = bars.length;
  const rv = realizedVarSeries(bars, 'gk');
  const early = rv.slice(0, Math.min(HAR_SIGMA_SCALE_WINDOW, n));
  const pos = early.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const S = pos.length ? 1 / pos[pos.length >> 1] : 1e4;
  const FLOOR = (1 / S) * VAR_FLOOR_FRAC;
  const logScaled = new Float64Array(n);
  for (let i = 0; i < n; i++) logScaled[i] = Math.log(Math.max(rv[i], FLOOR) * S);

  const fitted = _harFitCore(logScaled);               // unclamped — negative is normal

  const varScaled = new Float64Array(n).fill(NaN);
  let sresid = 0, ns = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(fitted[i])) {
      const smear = ns ? sresid / ns : 1;               // residuals from i' < i only
      varScaled[i] = Math.max(Math.exp(fitted[i]) * smear, FLOOR);
      sresid += Math.exp(logScaled[i] - fitted[i]);
      ns++;
    }
  }

  const out = new Array(n).fill(NaN);
  for (let i = 0; i < n - 1; i++) {                     // shift LEFT by one — see docstring
    const dailyVar = varScaled[i + 1] / S;
    if (Number.isFinite(dailyVar)) out[i] = Math.sqrt(Math.max(dailyVar, 0)) * SQRT252 * 100;
  }
  return out;
}

/**
 * Turn an as-of-close series into a forecast-ready one: the value at bar i is what
 * was knowable BEFORE bar i traded. The single place this shift happens.
 */
export function asOfYesterday(series) {
  const out = new Array(series.length).fill(NaN);
  for (let i = 1; i < series.length; i++) out[i] = series[i - 1];
  return out;
}

// The estimator registry, keyed exactly as `forge/vol.py`'s ESTIMATORS — the keys
// that appear in a frozen spec's `estimator` field.
export const SIGMA_ESTIMATORS = {
  ewma_094: bars => ewmaSigma(bars, 0.94),
  ewma_090: bars => ewmaSigma(bars, 0.90),
  yz_10:    bars => yangZhangSigma(bars, 10),
  yz_20:    bars => yangZhangSigma(bars, 20),
  yz_30:    bars => yangZhangSigma(bars, 30),
  naive:    bars => naiveExpandingSigma(bars),
  har_rv_log: bars => harRvLogSigma(bars),
};

/**
 * Forecast-ready σ for the NEXT bar, as a daily FRACTION — the number the ladder
 * consumes. Returns null when the series is too short for the estimator to have
 * produced a finite value.
 */
export function forecastSigma(bars, estimator = 'yz_30') {
  const fn = SIGMA_ESTIMATORS[estimator];
  if (!fn || !Array.isArray(bars) || bars.length < 2) return null;
  const series = fn(bars);
  const last = series[series.length - 1];       // as-of-close of the LAST bar =
  if (!Number.isFinite(last)) return null;      // what is knowable for the next one
  return last / 100 / SQRT252;                  // annualized % -> daily fraction
}
