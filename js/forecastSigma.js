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
