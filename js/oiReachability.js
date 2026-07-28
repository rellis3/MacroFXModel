/**
 * OI-WALL REACHABILITY — the probability that price actually TOUCHES each option wall
 * inside a horizon, plus which wall it reaches first and where paths spend their time.
 *
 * Built entirely on `forecastPathCore`'s existing intraday cone and seeded Monte Carlo
 * (`intradaySamplePaths`), so it inherits that cone's vol model, its event awareness and
 * its intrabar wick budget — a wick touch counts, which is the honest "did price reach
 * my level" test. No second simulator: one set of paths answers every question here.
 *
 * ── THE CALIBRATION, AND WHY THE RAW NUMBER IS NOT SHIPPED ──────────────────────────
 * `intradayReachability`'s raw pTouch is systematically OVER-CONFIDENT. Measured on
 * 36,486 EUR/USD M5 bars (2026-02-01 → 2026-07-28, 24,000 predictions, H=12 bars):
 *
 *      predicted   realised
 *          5%        11%      (+6pp)
 *         24%        23%      (-2pp)
 *         55%        50%      (-5pp)
 *         74%        59%     (-16pp)
 *         94%        68%     (-26pp)      mean |error| 9.0pp
 *
 * A "94% chance of touching" reaches 68% of the time. Realised outcomes compress into
 * roughly 11–68% while predictions span 5–94%. Shipping that raw would put a confident
 * wrong number in front of a trade.
 *
 * It IS monotonic though — realised rises with predicted at every step — so it ranks
 * correctly and can be recalibrated. Fitting a piecewise-linear map on the first half
 * (Feb–Apr) and testing on the untouched second half (May–Jul):
 *
 *      OOS mean error    RAW 9.4pp  →  CALIBRATED 1.7pp
 *      worst OOS bin     25pp       →  4pp
 *
 * So the calibrated number is good to about 2pp out of sample, and that is what callers
 * get. `raw` is returned alongside for transparency, never as the headline.
 *
 * LIMITS, stated plainly:
 *   • The map was fitted on EUR/USD M5 at H=12. Other pairs and horizons were NOT
 *     separately fitted — `calibrated` is a correction of known shape, not a per-pair
 *     guarantee. `calibSource` says which curve was applied so a caller can hedge.
 *   • The realised ceiling is ~69%: nothing in six months touched more often than that
 *     at this horizon, so the model will never honestly promise more. "Near certain" is
 *     not an available answer.
 *   • This is a PROBABILITY of touch under a diffusion. It says nothing about whether
 *     the wall then holds or breaks — that is a separate, unproven question.
 */

import { intradayCone, intradaySamplePaths, intradayReachability } from './forecastPathCore.js';

// Piecewise-linear reliability map, fitted on EUR/USD M5 Feb–Apr 2026 (H=12), verified
// on May–Jul. [rawPredicted, realisedFrequency]. Monotonic by construction.
export const REACH_CALIB = [
  [0.05, 0.11], [0.14, 0.17], [0.24, 0.23], [0.34, 0.31], [0.45, 0.41],
  [0.55, 0.50], [0.64, 0.56], [0.74, 0.59], [0.84, 0.66], [0.94, 0.68],
];

// Apply the map. Flat outside the fitted range rather than extrapolating — beyond the
// data the honest answer is the edge value, not a straight line into 100%.
export function calibrateTouch(p, curve = REACH_CALIB) {
  if (!Number.isFinite(p)) return null;
  if (p <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0] = curve[i - 1], [x1, y1] = curve[i];
    if (p <= x1) return y0 + (y1 - y0) * ((p - x0) / ((x1 - x0) || 1));
  }
  return curve[curve.length - 1][1];
}

// Per-wall reachability. `walls` = [{price, type, label}]. Returns one row per wall,
// sorted nearest-first, each with the calibrated probability, the raw one, and the
// median number of bars to first touch among the paths that got there.
export function wallReachability(ctx, i, walls, horizonBars, opts = {}) {
  if (!ctx || !Array.isArray(walls) || !walls.length) return [];
  const anchor = ctx.bars?.[i - 1]?.close;
  if (!(anchor > 0)) return [];
  const out = [];
  for (const w of walls) {
    if (!Number.isFinite(w?.price) || w.price <= 0) continue;
    let r = null;
    try { r = intradayReachability(ctx, i, w.price, horizonBars, opts); } catch { r = null; }
    if (!r) continue;
    out.push({
      price: w.price, type: w.type ?? null, label: w.label ?? null,
      side: r.side, raw: +r.pTouch.toFixed(4),
      calibrated: +calibrateTouch(r.pTouch).toFixed(4),
      medBarsToTouch: r.medBarsToTouch, z: r.z,
      distFrac: +((w.price - anchor) / anchor).toFixed(6),
      calibSource: 'eurusd-m5-h12',
    });
  }
  return out.sort((a, b) => Math.abs(a.distFrac) - Math.abs(b.distFrac));
}

// FIRST-TOUCH RACE — of the nearest wall above and the nearest below, which does price
// reach FIRST? This is the question a range trade actually asks, and it is not
// answerable from two independent touch probabilities (those can sum past 1 and say
// nothing about order). One path set, first crossing wins.
export function firstTouchRace(ctx, i, upTarget, downTarget, horizonBars, opts = {}) {
  if (!(upTarget > 0) && !(downTarget > 0)) return null;
  let sim;
  try { sim = intradaySamplePaths(ctx, i, horizonBars, { nPaths: 400, ...opts }); } catch { return null; }
  const paths = sim?.paths || [];
  if (!paths.length) return null;
  let up = 0, down = 0, neither = 0, upBars = [], downBars = [];
  for (const path of paths) {
    let hit = null;
    for (const step of path) {
      const hitUp = upTarget > 0 && step.high >= upTarget;
      const hitDn = downTarget > 0 && step.low <= downTarget;
      // Both inside one bar: unresolvable at this resolution, so count it as a tie
      // rather than silently awarding it to whichever test ran first.
      if (hitUp && hitDn) { hit = { side: 'tie', h: step.h }; break; }
      if (hitUp) { hit = { side: 'up', h: step.h }; break; }
      if (hitDn) { hit = { side: 'down', h: step.h }; break; }
    }
    if (!hit) { neither++; continue; }
    if (hit.side === 'up') { up++; upBars.push(hit.h); }
    else if (hit.side === 'down') { down++; downBars.push(hit.h); }
    else { up += 0.5; down += 0.5; }
  }
  const n = paths.length, med = a => { if (!a.length) return null; a.sort((x, y) => x - y);
    const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  return {
    n, upFirst: +(up / n).toFixed(4), downFirst: +(down / n).toFixed(4),
    neither: +(neither / n).toFixed(4),
    medBarsUp: med(upBars), medBarsDown: med(downBars),
    upTarget: upTarget || null, downTarget: downTarget || null,
    note: 'Raw path frequencies — the touch CALIBRATION applies to a single barrier and is not transferable to a race, so these are uncorrected and ordinal.',
  };
}

// VISIT DENSITY — how much time paths spend at each price. This is what "the most
// touched path" actually wants: under a driftless diffusion the modal PATH is flat, so
// asking for one is degenerate, but asking where the paths dwell is well posed and is a
// real picture of the cone's mass.
export function visitDensity(ctx, i, horizonBars, opts = {}) {
  const bins = Math.max(8, opts.bins ?? 40);
  let sim, cone;
  try {
    cone = intradayCone(ctx, i, horizonBars);
    sim = intradaySamplePaths(ctx, i, horizonBars, { nPaths: 300, ...opts });
  } catch { return null; }
  const paths = sim?.paths || [];
  if (!paths.length || !cone) return null;
  let lo = Infinity, hi = -Infinity;
  for (const p of paths) for (const s of p) { if (s.low < lo) lo = s.low; if (s.high > hi) hi = s.high; }
  if (!(hi > lo)) return null;
  const w = (hi - lo) / bins, counts = new Array(bins).fill(0);
  let total = 0;
  for (const p of paths) for (const s of p) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor((s.close - lo) / w)));
    counts[b]++; total++;
  }
  const peak = Math.max(...counts, 1);
  return {
    lo, hi, binWidth: w, anchor: cone.anchor, nPaths: paths.length,
    bins: counts.map((c, k) => ({
      priceLo: lo + k * w, priceHi: lo + (k + 1) * w, mid: lo + (k + 0.5) * w,
      count: c, share: +(c / total).toFixed(5), rel: +(c / peak).toFixed(4),
    })),
  };
}
