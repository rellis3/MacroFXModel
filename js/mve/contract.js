// mve/contract.js — the ONE interface every fair-value model implements. This is
// the Tier-1 brick contract the whole MVE rests on (see MARKET_VALUATION_ENGINE.md
// Part 9.2). The ensemble, the Kalman filter and the UI all consume this shape,
// so a model is a "value emitter" iff it returns one of these.
//
//   estimate(ctx) -> Estimate
//   Estimate = { name, kind, fairValue, sigma, confidence, asOf, meta }
//
// Bucket A/B/C from the audit is encoded in `kind`:
//   'anchor' — emits a fair-value PRICE (enters the consensus). Bucket A.
//   'weight' — no price; scales confidence / holding time only. Bucket B.
//   'alpha'  — a separate signal (momentum/carry); NEVER folded into fair value. Bucket C.

export const KIND = { ANCHOR: 'anchor', WEIGHT: 'weight', ALPHA: 'alpha' };

// Normalise + validate a raw estimate. Throws on a malformed anchor (a silent
// bad fair value is a 10x PnL bug, per the house rules) but is lenient on weights.
export function makeEstimate({ name, kind = KIND.ANCHOR, fairValue = null, sigma = null,
                               confidence = 0.5, asOf = null, meta = {} } = {}) {
  if (!name) throw new Error('makeEstimate: name required');
  if (kind === KIND.ANCHOR) {
    if (!Number.isFinite(fairValue)) throw new Error(`anchor "${name}" has non-finite fairValue`);
    if (!(sigma > 0))                throw new Error(`anchor "${name}" needs sigma > 0`);
  }
  return {
    name, kind,
    fairValue: Number.isFinite(fairValue) ? fairValue : null,
    sigma:     sigma > 0 ? sigma : null,
    confidence: clamp01(confidence),
    asOf,
    meta,
  };
}

export const isAnchor = e => e && e.kind === KIND.ANCHOR && Number.isFinite(e.fairValue) && e.sigma > 0;
export const isWeight = e => e && e.kind === KIND.WEIGHT;
export const isAlpha  = e => e && e.kind === KIND.ALPHA;

export function clamp01(x) { return x == null || !Number.isFinite(x) ? 0.5 : Math.max(0, Math.min(1, x)); }

// Split a bag of estimates into the three buckets.
export function bucket(estimates) {
  return {
    anchors: estimates.filter(isAnchor),
    weights: estimates.filter(isWeight),
    alphas:  estimates.filter(isAlpha),
  };
}
