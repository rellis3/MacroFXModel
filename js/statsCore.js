/**
 * Stats Core — the numeric baseplate brick. Rolling z-scores, percentile rank,
 * regression slope, EWMA and the small moment helpers that were re-implemented
 * inline in at least five engines (nasdaqTransforms, globalLiquidityEngine,
 * macroEquityEngine, zscoreSpreadEngine, hmm5m). One source of truth so a
 * "z-score" means the same thing in every gate and backtest.
 *
 * The lego design
 *   • One quantity, explicit conventions. There were two silently-different
 *     z-scores in the tree: population stddev + clip (nasdaqTransforms) and
 *     sample stddev no-clip (GlobalLiquidity/mathx.py). Both live here as named,
 *     parameterised calls — `ddof` (0 = population, 1 = sample) and `clipAt` are
 *     arguments, never a hidden default that drifts between callers.
 *   • Faithful by construction. `rollingZScore` / `rollingPercentile` reproduce
 *     js/nasdaqTransforms.js bit-for-bit (population, NaN-fill, finite-filter)
 *     so existing callers can import without changing a single number.
 *   • Pure & dependency-free. No data fetching, no asset knowledge — just math.
 */

// ── Moments ──────────────────────────────────────────────────────────────────
export const sum  = a => a.reduce((s, x) => s + x, 0);
export const mean = a => (a.length ? sum(a) / a.length : 0);

// Variance with selectable degrees of freedom: ddof=0 population, ddof=1 sample.
export function variance(a, ddof = 0) {
  const n = a.length;
  if (n - ddof <= 0) return 0;
  const m = mean(a);
  let v = 0;
  for (const x of a) v += (x - m) ** 2;
  return v / (n - ddof);
}
export const stdev = (a, ddof = 0) => Math.sqrt(variance(a, ddof));

const clip = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ── Rolling z-score (array form) ─────────────────────────────────────────────
// z of arr[i] vs the trailing `period` window. Population stats by default
// (ddof=0). NaN until the window is full or where data is non-finite. Optional
// symmetric clip to ±clipAt. Bit-faithful to nasdaqTransforms.rollingZScore.
export function rollingZScore(arr, period, clipAt = null, ddof = 0) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = 0; i < arr.length; i++) {
    if (i + 1 < period || !Number.isFinite(arr[i])) continue;
    const win = arr.slice(i - period + 1, i + 1).filter(Number.isFinite);
    if (win.length < period) continue;
    const m  = mean(win);
    const sd = stdev(win, ddof);
    let z = sd > 0 ? (arr[i] - m) / sd : 0;
    if (clipAt != null) z = clip(z, -clipAt, clipAt);
    out[i] = z;
  }
  return out;
}

// ── Rolling z-score (scalar form) ────────────────────────────────────────────
// z of arr[idx] vs the trailing `period` values. Returns 0 for thin windows
// (<5 points) or zero variance. Bit-faithful to hmm5m.js rollingZ.
export function rollingZAt(arr, idx, period = 200) {
  const start = Math.max(0, idx - period + 1);
  const n     = idx - start + 1;
  if (n < 5) return 0;
  let m = 0;
  for (let i = start; i <= idx; i++) m += arr[i];
  m /= n;
  let v = 0;
  for (let i = start; i <= idx; i++) { const d = arr[i] - m; v += d * d; }
  const sd = Math.sqrt(v / n);
  return sd < 1e-12 ? 0 : (arr[idx] - m) / sd;
}

// ── Rolling percentile rank (0–100) ──────────────────────────────────────────
// % of the trailing `period` window ≤ arr[i]. Bit-faithful to
// nasdaqTransforms.rollingPercentile.
export function rollingPercentile(arr, period) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = 0; i < arr.length; i++) {
    if (i + 1 < period || !Number.isFinite(arr[i])) continue;
    const win = arr.slice(i - period + 1, i + 1).filter(Number.isFinite);
    if (win.length < period) continue;
    const below = win.filter(v => v <= arr[i]).length;
    out[i] = (below / win.length) * 100;
  }
  return out;
}

// ── Least-squares slope ──────────────────────────────────────────────────────
// Slope of values against their integer index 0..n-1 (per-bar drift). Used by
// the regime/trend classifiers (linreg slope of closes).
export function linregSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const xm = (n - 1) / 2;
  const ym = mean(values);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { const dx = i - xm; num += dx * (values[i] - ym); den += dx * dx; }
  return den > 1e-18 ? num / den : 0;
}

// ── EWMA ─────────────────────────────────────────────────────────────────────
// Exponentially-weighted moving average, seeded with the first value.
// lambda is the decay (weight on the prior); alpha = 1 - lambda on the new point.
export function ewma(values, lambda = 0.94) {
  if (!values.length) return [];
  const out = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) out[i] = lambda * out[i - 1] + (1 - lambda) * values[i];
  return out;
}
