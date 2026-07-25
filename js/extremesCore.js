/**
 * Extremes Core — EVT (extreme value theory) Tier-1 primitives (engine #7 of
 * the analytics map, `ANALYTICS_ENGINE_DESIGN.md`). Nothing in the codebase
 * fit a tail before this brick: `metricsCore.histVaR/histCVaR` read the
 * EMPIRICAL tail (they cannot say anything beyond the worst observed point),
 * while a GPD fit extrapolates tail probability honestly from the exceedances
 * — the "how bad CAN today get" number, and the 1-in-N-days return level.
 *
 * Measurement brick, not a signal: it describes tail geometry. The
 * pre-registered EVT-stop-vs-chandelier A/B (design doc §4) is the only path
 * by which any of this touches a trade decision.
 *
 * Conventions:
 *   • All inputs are POSITIVE magnitudes (losses, ranges, excess ratios) —
 *     the caller flips signs; this brick has no long/short opinion.
 *   • GPD fit is probability-weighted moments (Hosking–Wallis 1987):
 *     closed-form, deterministic, robust for the ξ < 0.5 tails financial
 *     series live in. No optimizer, no randomness.
 *   • ξ (xi) is the shape: ξ = 0 exponential tail, ξ > 0 fat/Pareto tail
 *     (ξ ≥ 0.5 ⇒ infinite variance — report it, don't hide it), ξ < 0
 *     finite endpoint.
 */

// ── Quantile (type-7, matches metricsCore's histVaR interpolation) ───────────
export function quantileSorted(sortedAsc, p) {
  const n = sortedAsc.length;
  if (!n) return NaN;
  if (n === 1) return sortedAsc[0];
  const pos = Math.min(Math.max(p, 0), 1) * (n - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sortedAsc[lo] + (pos - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

// ── Hill estimator (tail index of a Pareto-like tail) ────────────────────────
// Top-k order statistics of positive xs. Returns {alpha, xi} where alpha is
// the Pareto tail exponent (P(X > x) ~ x^-alpha) and xi = 1/alpha. Sensitive
// to k by construction — callers should read it across a k-range, not trust
// one k. Null when k is infeasible or the reference order stat is ≤ 0.
export function hillEstimator(xs, k) {
  const v = xs.filter(x => Number.isFinite(x) && x > 0).sort((a, b) => b - a);
  if (k < 1 || k + 1 > v.length || v[k] <= 0) return null;
  let s = 0;
  for (let i = 0; i < k; i++) s += Math.log(v[i] / v[k]);
  if (s <= 0) return null;
  const alpha = k / s;
  return { alpha, xi: 1 / alpha, k, n: v.length };
}

// ── GPD fit by probability-weighted moments ──────────────────────────────────
// excesses: positive values ALREADY over the threshold (x − u). Returns
// {xi, beta, n} or null if degenerate. PWM: b0 = mean; t ≈ E[X(1−F(X))] via
// the Landwehr plotting position (i − 0.35)/n; then
//   xi = 2 − b0/(b0 − 2t),   beta = 2·b0·t/(b0 − 2t).
// Exact-recovery check (exp(β): t = β/4 ⇒ xi = 0, beta = β) is in the tests.
export function fitGPD(excesses) {
  const v = excesses.filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  const n = v.length;
  if (n < 10) return null;
  let b0 = 0, t = 0;
  for (let i = 0; i < n; i++) {
    b0 += v[i];
    t += (1 - (i + 1 - 0.35) / n) * v[i];
  }
  b0 /= n; t /= n;
  const d = b0 - 2 * t;
  if (!(Math.abs(d) > 1e-15)) return null;
  const xi = 2 - b0 / d;
  const beta = 2 * b0 * t / d;
  if (!Number.isFinite(xi) || !Number.isFinite(beta) || beta <= 0) return null;
  return { xi, beta, n };
}

// ── Peaks-over-threshold fit ─────────────────────────────────────────────────
// Sets u at the q-quantile of xs, fits the GPD to the exceedances. zeta =
// nExc/n is the exceedance rate the tail formulas condition on. Null when the
// tail is too thin to fit (nExc < 10) — an honest "not enough tail", not a 0.
export function potFit(xs, { q = 0.95 } = {}) {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  const n = v.length;
  if (n < 40) return null;
  const u = quantileSorted(v, q);
  const exc = [];
  for (let i = n - 1; i >= 0 && v[i] > u; i--) exc.push(v[i] - u);
  const g = fitGPD(exc);
  if (!g) return null;
  return { u, q, xi: g.xi, beta: g.beta, nExc: g.n, n, zeta: g.n / n };
}

// ── Tail quantile / expected shortfall / return level ────────────────────────
// P(X > x) = zeta·(1 + xi·(x−u)/beta)^(−1/xi)  (POT survivor function).
// gpdQuantile(p): the level exceeded with probability 1−p (p must exceed the
// threshold quantile q for the extrapolation to be meaningful).
export function gpdQuantile(p, { u = 0, xi, beta, zeta = 1 }) {
  const tailP = (1 - p) / zeta;
  if (!(tailP > 0) || !(beta > 0)) return NaN;
  if (Math.abs(xi) < 1e-9) return u + beta * Math.log(1 / tailP);
  return u + (beta / xi) * (Math.pow(tailP, -xi) - 1);
}

// Expected shortfall (mean loss GIVEN the p-quantile is exceeded). Finite
// only for xi < 1; returns NaN otherwise rather than a fake number.
export function gpdES(p, fit) {
  const varP = gpdQuantile(p, fit);
  if (!Number.isFinite(varP) || fit.xi >= 1) return NaN;
  return (varP + fit.beta - fit.xi * (fit.u ?? 0)) / (1 - fit.xi);
}

// Return level: the magnitude exceeded on average once every m observations
// (m in the same units xs was sampled at — for daily series, m = 250 ≈ the
// 1-in-a-trading-year move). Identical to gpdQuantile(1 − 1/m).
export function returnLevel(m, fit) {
  if (!(m > 0)) return NaN;
  return gpdQuantile(1 - 1 / m, fit);
}

// ── Convenience: fit-and-read in one call ────────────────────────────────────
export function evtVaR(xs, p, { q = 0.95 } = {}) {
  const fit = potFit(xs, { q });
  return fit ? gpdQuantile(p, fit) : NaN;
}
export function evtES(xs, p, { q = 0.95 } = {}) {
  const fit = potFit(xs, { q });
  return fit ? gpdES(p, fit) : NaN;
}
