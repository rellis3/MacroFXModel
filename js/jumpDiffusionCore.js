/**
 * jumpDiffusionCore — Tier 1 primitive: the jump/diffusion decomposition, live side.
 *
 * Pure functions only (numbers in, numbers out). No fetch, no fs, no clock read, no
 * `process` — browser-safe, for the same reason `londonSession.js` exists: a pure
 * helper must not sit behind an I/O import.
 *
 * ## Why this file exists at all
 *
 * The research side of this decomposition lives in `volatilityExhaustion/` (Python,
 * Phases 12-14) and runs as a batch job over ~1.6GB of 1-min bars. That can never run
 * on a request. But the *same* maths has to run on today's partial session to answer
 * "how is today arriving", so it exists on both sides — and the repo rule for shared
 * maths (`PYTHON_LEGO.md`) is GENERATE-don't-port: reproduce it exactly and then
 * ASSERT the two agree, rather than trusting that they do.
 *
 * `volatilityExhaustion/crosscheck_jump.mjs` + `crosscheck_jump.py` are that contract:
 * Python dumps a synthetic return series, this module scores it, Python asserts the
 * two match to 1e-12. Same pattern as `crosscheck_sigma.mjs` for the σ contract.
 *
 * ## What it computes
 *
 *   RV = Σr²                       total realised variance
 *   BV = (π/2)·Σ|rₜ||rₜ₋₁|         jump-robust (a lone jump enters one product a side)
 *   jump share = max(RV−BV,0)/RV   a CONTINUOUS descriptive share, not a classifier
 *
 * plus Lee-Mykland (2008) jump TIMES: scale each return by a trailing bipower local
 * volatility and threshold at the Gumbel critical value, so α is a stated per-day
 * false-positive rate rather than a hand-picked ATR multiple.
 *
 * ## Three things that are easy to get wrong, and are handled here
 *
 * 1. **Gap-spanning returns are dropped.** RV and BV sum over CONSECUTIVE returns, so
 *    a return across a weekend or a session break is not a 5-minute return — squaring
 *    it hands RV a jump that never happened. `buildGrid` keeps only returns whose two
 *    bars are exactly one step apart on the clock.
 * 2. **The local-volatility window must span days.** A session holds only ~288 5-min
 *    returns and K is 270, so a window rebuilt per-day never fills and the detector
 *    goes blind for the first ~11 hours. (That was a real bug in the research code,
 *    caught only by plotting detections against time of day.) Callers therefore pass a
 *    CONTINUOUS multi-day return series and mark where today starts.
 * 3. **Returns are deseasonalised before the test.** Intraday FX volatility runs a ~3×
 *    diurnal cycle, so an unadjusted detector just flags the US session for being busy.
 *    The periodicity factors are FROZEN by the offline study and passed in — never
 *    refit here, both because a live refit would drift from the research and because
 *    one session is nowhere near enough to estimate them.
 */

const C_BP = Math.sqrt(2 / Math.PI);

export const STEP_MIN = 5;        // the noise-robust sampling grid (see Phase 1)
export const K_WINDOW = 270;      // Lee-Mykland's recommendation for 5-min data
export const ALPHA = 0.01;        // per-DAY false-positive rate under pure diffusion
export const BUCKET_MIN = 30;     // periodicity bucket width (48 buckets/day)
export const BARS_PER_DAY = 1440 / STEP_MIN;   // 288 — the n the threshold uses

/** RV and BV over a return array. Returns null when there is too little to compute. */
export function bipower(r) {
  if (!r || r.length < 3) return null;
  let rv = 0, bv = 0;
  for (let i = 0; i < r.length; i++) rv += r[i] * r[i];
  for (let i = 1; i < r.length; i++) bv += Math.abs(r[i]) * Math.abs(r[i - 1]);
  return { rv, bv: (Math.PI / 2) * bv };
}

/** max(RV−BV,0)/RV. null when undefined. Mirrors vol_exhaustion_lib.jump_fraction. */
export function jumpFraction(r) {
  const b = bipower(r);
  if (!b) return null;
  if (!(b.rv > 1e-18)) return null;
  return Math.max(b.rv - b.bv, 0) / b.rv;
}

/**
 * Gumbel critical value for max|L| over n returns (Lee-Mykland 2008, Lemma 1).
 * NOTE the caller should pass the FULL-day bar count even mid-session: using the
 * partial count would shrink the multiple-testing correction and over-detect early
 * in the day, and would also make a live reading incomparable with the historical
 * table, which was built on full days. Erring conservative is the safe direction.
 */
export function lmThreshold(n = BARS_PER_DAY, alpha = ALPHA) {
  if (!(n >= 5)) return Infinity;
  const lnN = Math.log(n);
  const s2 = Math.sqrt(2 * lnN);
  const cN = s2 / C_BP - (Math.log(Math.PI) + Math.log(lnN)) / (2 * C_BP * s2);
  const sN = 1 / (C_BP * s2);
  return cN + sN * (-Math.log(-Math.log(1 - alpha)));
}

/**
 * Trailing bipower local volatility: σ̂ᵢ from the k returns STRICTLY BEFORE i.
 * Bipower rather than a rolling stdev so a previous jump cannot inflate the yardstick
 * and mask the next one. NaN until the window is at least half full.
 */
export function localSigma(r, k = K_WINDOW) {
  const n = r.length;
  const out = new Float64Array(n).fill(NaN);
  const cs = new Float64Array(n + 1);          // cs[j] = Σ prod[0..j-1]
  // cs[1] stays 0: the product array has no entry at index 0 (it needs a predecessor).
  for (let i = 1; i < n; i++) {
    cs[i + 1] = cs[i] + Math.abs(r[i]) * Math.abs(r[i - 1]);
  }
  for (let i = 0; i < n; i++) {
    const lo = Math.max(i - k + 1, 1);
    const hi = i;                               // exclusive: products lo..hi-1
    if (hi - lo < Math.floor(k / 2)) continue;
    const s2 = (cs[hi] - cs[lo]) / Math.max(hi - lo, 1);
    out[i] = Math.sqrt(Math.max(s2, 0));
  }
  return out;
}

/**
 * Build the `step`-minute return grid from time-ordered bars, DROPPING any return
 * that spans more than one step (weekend, holiday, a broker's maintenance break).
 *
 * `bars`: [{ time: epochSeconds, close: number }, ...], ascending, complete bars only.
 * Returns { ret, tod, endIdx } where tod[i] is the UTC minute-of-day of the bar the
 * return ENDS on (the key the periodicity factors are indexed by) and endIdx[i] is
 * that bar's index in `bars`.
 */
export function buildGrid(bars, { stepMin = STEP_MIN } = {}) {
  const ret = [], tod = [], endIdx = [];
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1], b = bars[i];
    if (!(a.close > 0) || !(b.close > 0)) continue;
    const gapMin = (b.time - a.time) / 60;
    if (Math.abs(gapMin - stepMin) > 1e-9) continue;      // not one clean step apart
    ret.push(Math.log(b.close / a.close));
    tod.push(Math.floor((b.time % 86400) / 60));
    endIdx.push(i);
  }
  return { ret, tod, endIdx };
}

/**
 * Divide each return by its time-of-day periodicity factor. `factors` is the FROZEN
 * 48-length array the offline study fitted (mean 1, indexed by UTC 30-min bucket).
 * A missing or malformed table is a no-op rather than a silent wrong answer — the
 * caller is expected to surface that it is running unadjusted.
 */
export function deseasonalise(ret, tod, factors, { bucketMin = BUCKET_MIN } = {}) {
  const nb = 1440 / bucketMin;
  const ok = Array.isArray(factors) && factors.length === nb;
  const out = new Float64Array(ret.length);
  for (let i = 0; i < ret.length; i++) {
    // Python floors the factor at 0.05 when FITTING, so a frozen table never carries
    // anything smaller; the clamp here mirrors that rather than substituting 1.
    const f = ok ? Math.max(factors[Math.floor(tod[i] / bucketMin) % nb], 0.05) : 1;
    out[i] = ret[i] / f;
  }
  return { adjusted: out, applied: ok };
}

/**
 * Flag Lee-Mykland jumps over a CONTINUOUS multi-day return series.
 * Returns { flags, threshold, applied } — flags[i] true where |L| exceeds the bar.
 */
export function detectJumps(ret, tod, factors, { k = K_WINDOW, alpha = ALPHA, n = BARS_PER_DAY } = {}) {
  const { adjusted, applied } = deseasonalise(ret, tod, factors);
  const sig = localSigma(adjusted, k);
  const threshold = lmThreshold(n, alpha);
  const flags = new Array(ret.length).fill(false);
  for (let i = 0; i < ret.length; i++) {
    const s = sig[i];
    if (!Number.isFinite(s) || !(s > 0)) continue;
    if (Math.abs(adjusted[i]) / s > threshold) flags[i] = true;
  }
  return { flags, threshold, applied };
}

/**
 * Score a live jump share against the study's time-of-day distribution.
 * `table` is { checkpoints: [minuteOfLondonDay...], p50:[], p75:[], p90:[], p95:[], p99:[] }
 * for one instrument. Picks the LAST checkpoint at or before `londonMinute` — a
 * reading is compared against the same slice of the day it actually covers, which is
 * the whole point: a 9am jump share is not comparable to a full-day percentile.
 * Returns null when the session is too young for any checkpoint to apply.
 */
export function scoreAgainstTimeOfDay(shareFrac, londonMinute, table) {
  if (!table || !Array.isArray(table.checkpoints) || !table.checkpoints.length) return null;
  let idx = -1;
  for (let i = 0; i < table.checkpoints.length; i++) {
    if (table.checkpoints[i] <= londonMinute) idx = i; else break;
  }
  if (idx < 0) return null;
  const pct = shareFrac * 100;
  const at = k => (Array.isArray(table[k]) ? table[k][idx] : null);
  const p50 = at('p50'), p75 = at('p75'), p90 = at('p90'), p95 = at('p95'), p99 = at('p99');
  let band = 'typical';
  if (p99 != null && pct >= p99) band = 'extreme';
  else if (p95 != null && pct >= p95) band = 'very high';
  else if (p90 != null && pct >= p90) band = 'high';
  else if (p50 != null && pct < p50) band = 'below median';
  return {
    checkpoint_min: table.checkpoints[idx],
    pct: Math.round(pct * 100) / 100,
    p50, p75, p90, p95, p99, band,
  };
}
