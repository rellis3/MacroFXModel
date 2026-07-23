/**
 * rangeExtConfidence.js — the LEVEL-SELECTION BRAIN for Asia range-extension
 * levels (a `score → choice` selector, per the Lego "brain" principle; NOT a
 * bag of tunable legs).
 *
 * WHY THIS EXISTS
 * ---------------
 * A single Asia session projects ~30–45 extension levels (the fibProjection
 * ladder, ±0.25 … ±10.5). Trading all of them is the documented losing
 * baseline: the in-house POI backtest (education/coleztrades_poi_backtest) faded
 * a ≥2-source level cluster across 26 pairs / 46,677 trades and returned pooled
 * Sharpe −3.43, OOS −3.12, expectancy −0.016 R/trade — a coin-flip eaten by
 * costs. "More levels / more confluence" was ALREADY the loser. So this module
 * does NOT stack confluence; it CONDITIONS each level on market STATE and keeps
 * only the few that the state actually supports.
 *
 * The two levers the education points at (and the POI test never pulled):
 *   1. fade-vs-FOLLOW direction — the framework fades every extension; but on a
 *      trend day / high-vol regime the SAME level is a breakout-follow, not a
 *      fade. Direction is chosen from state, not assumed.
 *   2. selection to a few — rank by a confidence built from state and trade only
 *      the top-N above a floor, so 14 candidates become 2–3 trades, not noise.
 *
 * This module is PURE: it takes pre-computed numeric features (the engine builds
 * them with no-lookahead data) and returns scores/choices. No data layer, no
 * DOM, no state. Unit-tested in rangeExtConfidence.test.mjs on synthetic input.
 *
 * CONTRACT
 * --------
 *   dayContext(feat, w?)      → { trendiness, direction, ... }  (per-day, per-pair)
 *   scoreLevel(lvl, ctx, w?)  → { confidence, direction, contributions }
 *   selectLevels(scored, opt) → filtered+ranked subset (top-N above a floor)
 *
 * Feature inputs are all normalised or raw numbers the engine supplies:
 *   day features (feat):
 *     volRegimePct  ∈[0,1]  ATR percentile vs its own 6–12mo history (0=low vol)
 *     asiaRangeRatio >0     today's Asia range ÷ trailing median Asia range
 *     dayTypeT       signed drift÷diffusion (dayTypeCore.dayTypeScore) — trendiness
 *   level features (lvl):
 *     mult    ≥0    extension multiple = |fib level| (distance beyond the range)
 *     zone    'above'|'below'|'inside'
 *     isKey   bool  a key multiple (0,0.25,0.5,0.75,1 …) vs a half-step
 *     alignment 'tight'|'strong'|'none'  two-session (today vs prior Asia) confluence
 */

// ── Tunable priors (weights, not fitted per-trade params) ─────────────────────
// Every constant here is a PRIOR chosen from the education, exposed so the
// backtest can ablate it. None is fit to trade outcomes. Defaults are meant to
// be A/B-tested, not trusted.
export const DEFAULT_WEIGHTS = {
  // day trendiness = how much the day favours continuation over reversion
  wDayType:   0.40,   // |dayTypeT| trend-day-ness
  wVolRegime: 0.35,   // ATR-percentile regime (high vol → continuation)
  wAsiaWide:  0.25,   // wide Asia range → directional day
  dayTypeScale: 0.60, // |T| that maps to a full 1.0 trend reading (soft-normalised)
  followThresh: 0.55, // trendiness above this → FOLLOW; below → FADE

  // level geometry quality
  wMult:  0.60,       // extension-multiple prior
  wAlign: 0.40,       // two-session alignment
  keyBonus: 0.10,     // key-level nudge

  // final blend: geometry vs regime-fit
  wGeom: 0.55,
  wFit:  0.45,

  // extension-multiple prior (fade): reactions expected to CLUSTER just beyond
  // the range and decay far out (10x is rare → noise as a fade, momentum as a
  // follow). Peak / width of a soft bump; near-range floor keeps 1x usable.
  multPeakFade: 1.5,
  multWidthFade: 2.2,
  multFarPenaltyFrom: 5.0,  // fades beyond this multiple are increasingly discounted
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Soft-normalise the signed trend-day score to a [0,1] trendiness magnitude.
function dayTypeMagnitude(dayTypeT, scale) {
  const t = Math.abs(dayTypeT || 0);
  return clamp01(t / (scale || 0.6));
}

// Asia-range wideness in [0,1]: narrow (<0.7× median) → 0, wide (>1.5×) → 1.
function asiaWideness(ratio) {
  if (!(ratio > 0)) return 0.5;
  return clamp01((ratio - 0.7) / (1.5 - 0.7));
}

// ── Per-day context: trendiness → fade/follow ─────────────────────────────────
// Combines the three state readings into ONE trendiness number (the selector
// input), then picks the day's default direction. Per-level scoring can still
// flip a level's direction by zone, but the day sets the regime posture.
export function dayContext(feat = {}, w = DEFAULT_WEIGHTS) {
  const dt   = dayTypeMagnitude(feat.dayTypeT, w.dayTypeScale);
  const vr   = clamp01(feat.volRegimePct ?? 0.5);
  const aw   = asiaWideness(feat.asiaRangeRatio);
  const wsum = w.wDayType + w.wVolRegime + w.wAsiaWide || 1;
  const trendiness = clamp01((w.wDayType * dt + w.wVolRegime * vr + w.wAsiaWide * aw) / wsum);
  return {
    trendiness,
    direction: trendiness > w.followThresh ? 'follow' : 'fade',
    parts: { dayType: dt, volRegime: vr, asiaWide: aw },
  };
}

// ── Extension-multiple prior ──────────────────────────────────────────────────
function multScore(mult, direction, w) {
  const m = Math.abs(mult || 0);
  if (direction === 'follow') {
    // Following a break: reaching a far level = strong momentum. Rise with
    // distance but saturate (don't reward absurd 8x+ chases). Near-range breaks
    // (<1x) are weak follows.
    return clamp01(0.25 + 0.5 * clamp01((m - 0.5) / 3.0));
  }
  // FADE: soft bump peaking just beyond the range, with an added far-out penalty.
  const bump = Math.exp(-(((m - w.multPeakFade) / w.multWidthFade) ** 2));
  const nearFloor = m >= 1 ? 0.35 : 0.2;      // keep the 1x edge usable
  let s = Math.max(bump, nearFloor);
  if (m > w.multFarPenaltyFrom) s *= clamp01(1 - (m - w.multFarPenaltyFrom) / 6.0);
  return clamp01(s);
}

function alignScore(alignment) {
  return alignment === 'tight' ? 1.0 : alignment === 'strong' ? 0.7 : 0.35;
}

// ── Per-level confidence ──────────────────────────────────────────────────────
// direction resolution: the day posture sets fade/follow, but an 'inside'-range
// level is never a clean extension trade (skip); zone only decides trade SIDE
// downstream in the engine.
export function scoreLevel(lvl = {}, ctx, w = DEFAULT_WEIGHTS) {
  const direction = ctx?.direction ?? 'fade';
  const mS = multScore(lvl.mult, direction, w);
  const aS = alignScore(lvl.alignment);
  const key = lvl.isKey ? w.keyBonus : 0;
  const qGeom = clamp01((w.wMult * mS + w.wAlign * aS) / (w.wMult + w.wAlign) + key);

  // regime fit: does the chosen action suit the day? fade wants low trendiness,
  // follow wants high.
  const qFit = direction === 'follow' ? ctx.trendiness : 1 - ctx.trendiness;

  const confidence = clamp01((w.wGeom * qGeom + w.wFit * qFit) / (w.wGeom + w.wFit));
  return {
    confidence: +confidence.toFixed(4),
    direction,
    contributions: {
      multScore: +mS.toFixed(3),
      alignScore: +aS.toFixed(3),
      qGeom: +qGeom.toFixed(3),
      qFit: +qFit.toFixed(3),
      trendiness: +ctx.trendiness.toFixed(3),
    },
  };
}

// ── Day-level selection: 14 candidates → a few trades ─────────────────────────
// scored = [{ ...level, confidence, direction }]. Keeps only levels above the
// floor, ranked by confidence, capped at topN. This is the anti-noise gate.
export function selectLevels(scored, { topN = 3, minConfidence = 0.5 } = {}) {
  return scored
    .filter((s) => s.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, topN);
}
