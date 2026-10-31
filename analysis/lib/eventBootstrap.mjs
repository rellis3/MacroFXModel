/**
 * One bootstrap for event-vs-control studies (REPO_REVIEW_2026-10-31 S2).
 *
 * Replaces the drawBlock/bootDiff pair that was copied into outcome_loop, dispersion_study,
 * four_golds_study and crack_spread_study. That copy resampled the EVENT arm with
 * block = min(block, n): at n <= block there is one start position, so every replicate was the
 * original sample (SE 0), and at n = 14-26 the SE was 1.7-2.7x too small. "Validated" cells with
 * 9-26 firings rested on intervals that had almost no width.
 *
 * Event arm: every caller de-clusters firings (no re-fire inside the outcome horizon), so event
 * outcomes do not overlap and are resampled one firing at a time (i.i.d.).
 * Control arm: overlapping daily outcomes, so a CIRCULAR moving-block bootstrap (every start
 * position is reachable; the block is clamped to n).
 */

/** Circular moving-block resample of `x` (same length). `block` is clamped to [1, n]. */
export function circularBlock(x, block, rnd) {
  const n = x.length; if (!n) return [];
  const L = Math.max(1, Math.min(block | 0, n));
  const s = new Array(n); let k = 0;
  while (k < n) { const st = Math.floor(rnd() * n); for (let i = 0; i < L && k < n; i++) s[k++] = x[(st + i) % n]; }
  return s;
}

/** I.i.d. resample (block 1). */
export function iidResample(x, rnd) {
  const n = x.length, s = new Array(n);
  for (let i = 0; i < n; i++) s[i] = x[Math.floor(rnd() * n)];
  return s;
}

const mean = x => x.length ? x.reduce((s, v) => s + v, 0) / x.length : null;
const r3 = v => (v == null || !Number.isFinite(v)) ? null : +v.toFixed(3);

/**
 * Event-minus-control difference in means with a percentile 95% interval.
 * a: de-clustered event outcomes; b: control outcomes (overlapping); block: control block length.
 * Returns null when a has fewer than minA rows or b fewer than `block` rows (same guards as before).
 */
export function bootDiff(a, b, { block = 10, reps = 1000, rnd, minA = 5 } = {}) {
  if (typeof rnd !== 'function') throw new Error('bootDiff needs a seeded rnd');
  if (a.length < minA || b.length < block) return null;
  const out = new Array(reps);
  for (let k = 0; k < reps; k++) out[k] = mean(iidResample(a, rnd)) - mean(circularBlock(b, block, rnd));
  out.sort((p, q) => p - q);
  return { nA: a.length, nB: b.length, diff: r3(mean(a) - mean(b)), lo: r3(out[Math.floor(reps * 0.025)]), hi: r3(out[Math.floor(reps * 0.975)]) };
}
