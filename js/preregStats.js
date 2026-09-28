/**
 * Pre-registration statistics -- the two numbers every test writes down BEFORE it runs.
 *
 *   1. POWER. What is the smallest effect this design could detect? If that is bigger
 *      than the smallest effect that would matter (the pass bar, the 0.15 execution
 *      gate), the test cannot pass and a "null" from it means nothing. Say so first.
 *   2. MULTIPLICITY. How many cells are scored, and how is the pass bar corrected for
 *      them? Five cells at 5% give a 23% chance of one false pass.
 *
 * Template: MD files/PREREG_TEMPLATE.md. Pure functions, no I/O.
 * Tested by js/preregStats.test.mjs.   node js/preregStats.test.mjs
 */

// ── normal distribution ─────────────────────────────────────────────────────

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf, |err| < 1.5e-7). */
export function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    * Math.exp(-x * x / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Inverse standard normal CDF (Acklam, relative error < 1.2e-9). */
export function normInv(p) {
  if (!(p > 0 && p < 1)) throw new RangeError(`normInv: p must be in (0,1), got ${p}`);
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425, hi = 1 - lo;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > hi) return -normInv(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** z_alpha + z_power: the multiplier that turns a standard error into a detectable effect. */
const powerMultiplier = (alpha, power, twoSided) => normInv(1 - (twoSided ? alpha / 2 : alpha)) + normInv(power);

// ── 1. power: minimum detectable effect ─────────────────────────────────────

/**
 * Minimum detectable difference in means, setup vs control.
 *   sd  -- outcome SD, measured on the CONTROL sample (allowed before registering:
 *          it never touches a setup outcome).
 *   deff -- design effect (variance inflation) for overlap/clustering the de-clustering
 *          does not remove; 1 = independent. Overlapping h-day windows ≈ h.
 * Returns the effect, in the outcome's units, that the test finds `power` of the time.
 */
export function mdeMeanDiff({ sd, n1, n2 = Infinity, alpha = 0.05, power = 0.8, twoSided = true, deff = 1 }) {
  if (!(sd > 0 && n1 > 0 && n2 > 0)) throw new RangeError('mdeMeanDiff: sd, n1, n2 must be > 0');
  const se = sd * Math.sqrt(deff * (1 / n1 + 1 / n2));
  return powerMultiplier(alpha, power, twoSided) * se;
}

/**
 * Minimum detectable effect from a known interval -- for bootstrap designs, where the
 * SE comes from a placebo run (control vs control) or from the same harness's last
 * study on the same instruments and n. Width of a `level` interval → SE → MDE.
 */
export function mdeFromCI({ lo, hi, level = 0.95, alpha = 0.05, power = 0.8, twoSided = true }) {
  if (!(hi > lo)) throw new RangeError('mdeFromCI: hi must exceed lo');
  const se = (hi - lo) / (2 * normInv(1 - (1 - level) / 2));
  return powerMultiplier(alpha, power, twoSided) * se;
}

/**
 * Minimum detectable lift in a hit rate over its base rate p0 (normal approximation,
 * variance at p0 -- fine for n ≥ 30 and p0 in [0.2, 0.8]). Returns the lift, so the
 * detectable hit rate is p0 + lift.
 */
export function mdeProportion({ n, p0 = 0.5, alpha = 0.05, power = 0.8, twoSided = true }) {
  if (!(n > 0 && p0 > 0 && p0 < 1)) throw new RangeError('mdeProportion: n > 0, 0 < p0 < 1');
  return powerMultiplier(alpha, power, twoSided) * Math.sqrt(p0 * (1 - p0) / n);
}

/** Setup count needed to detect `mde` against a control of size ratio×n (ratio=Infinity: control SE ignored). */
export function nForMde({ sd, mde, alpha = 0.05, power = 0.8, twoSided = true, deff = 1, ratio = Infinity }) {
  if (!(sd > 0 && mde > 0)) throw new RangeError('nForMde: sd and mde must be > 0');
  const k = powerMultiplier(alpha, power, twoSided);
  return Math.ceil(deff * (1 + 1 / ratio) * (k * sd / mde) ** 2);
}

/**
 * The power verdict the template records. `bar` is the smallest effect that would
 * matter (the pass bar). A test whose MDE exceeds it is UNDERPOWERED by design: run it
 * only as a description, and never bank its null as a null.
 */
export function powerVerdict({ mde, bar }) {
  const ratio = mde / bar;
  return { mde, bar, ratio, verdict: ratio <= 1 ? 'POWERED' : 'UNDERPOWERED' };
}

// ── 2. multiplicity ─────────────────────────────────────────────────────────

/** Two-sided p-value implied by an estimate and its (symmetric, normal) interval. */
export function pFromCI({ est, lo, hi, level = 0.95 }) {
  const se = (hi - lo) / (2 * normInv(1 - (1 - level) / 2));
  return 2 * (1 - normCdf(Math.abs(est) / se));
}

/** Holm step-down (family-wise error). For the SCORED cells -- the ones a pass rests on. */
export function holm(pvals, alpha = 0.05) {
  const m = pvals.length;
  const order = pvals.map((p, i) => [p, i]).sort((x, y) => x[0] - y[0]);
  const rejected = new Array(m).fill(false), adjusted = new Array(m);
  let running = 0, stopped = false;
  order.forEach(([p, i], k) => {
    running = Math.max(running, Math.min(1, (m - k) * p));
    adjusted[i] = running;
    if (!stopped && p <= alpha / (m - k)) rejected[i] = true; else stopped = true;
  });
  return { rejected, adjusted };
}

/**
 * Benjamini-Hochberg (false discovery rate). For DISAGGREGATION cells -- the
 * per-pair / per-regime slices reported under a pooled result. q = 0.10 is the
 * house default (SessionResearch/stats_util.py bh_fdr).
 */
export function benjaminiHochberg(pvals, q = 0.10) {
  const m = pvals.length;
  const order = pvals.map((p, i) => [p, i]).sort((x, y) => x[0] - y[0]);
  let kMax = -1;
  order.forEach(([p], k) => { if (p <= (k + 1) / m * q) kMax = k; });
  const rejected = new Array(m).fill(false), adjusted = new Array(m);
  let running = 1;
  for (let k = m - 1; k >= 0; k--) {
    const [p, i] = order[k];
    running = Math.min(running, p * m / (k + 1));
    adjusted[i] = Math.min(1, running);
    if (k <= kMax) rejected[i] = true;
  }
  return { rejected, adjusted };
}

/**
 * Chance baseline for a family: how many passes noise alone gives, and how surprising
 * the observed count is. P(X ≥ passes) for X ~ Binomial(tests, alpha).
 */
export function chanceBaseline({ tests, passes, alpha = 0.05 }) {
  let tail = 0, pmf = (1 - alpha) ** tests;
  for (let k = 0; k <= tests; k++) {
    if (k >= passes) tail += pmf;
    pmf *= (tests - k) / (k + 1) * alpha / (1 - alpha);
  }
  return {
    tests, passes, alpha,
    expected: tests * alpha,
    pAtLeastOne: 1 - (1 - alpha) ** tests,
    pAtLeastObserved: Math.min(1, tail),
  };
}
