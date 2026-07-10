// mve/regimeWeights.js — Phase 3. The regime-adaptive weight table, generalized
// from the (gold-only) js/gold-model.js REGIME_WEIGHTS into an ensemble-level
// mixture-of-experts gate. The regime chooses which fair-value MEMBER dominates
// (see MARKET_VALUATION_ENGINE.md Part 3). Weights are multipliers on the base
// precision weights, then renormalized — and CAPPED so a mislabeled regime can
// never hand the whole book to one model.
//
// These are a small, principled starting table to be proven OOS — NOT free knobs
// to sweep. Rationale per column:
//   RISK_OFF  → real-yield / macro anchors dominate; carry/positioning muted.
//   RISK_ON   → positioning & structure matter more; macro lean muted.
//   RANGE     → statistical mean-reversion dominates.
//   TREND     → fair value trusted less (trends run past it); widen, de-emphasise.

export const REGIME_WEIGHTS = {
  RISK_OFF: { macro_fv: 1.4, stat_fv: 0.9, yield_fv: 1.5, positioning: 0.7, structure: 0.9 },
  RISK_ON:  { macro_fv: 0.9, stat_fv: 1.0, yield_fv: 0.9, positioning: 1.4, structure: 1.2 },
  RANGE:    { macro_fv: 1.0, stat_fv: 1.5, yield_fv: 1.0, positioning: 1.1, structure: 1.2 },
  TREND:    { macro_fv: 0.8, stat_fv: 0.6, yield_fv: 0.9, positioning: 0.9, structure: 0.8 },
  NEUTRAL:  { macro_fv: 1.0, stat_fv: 1.0, yield_fv: 1.0, positioning: 1.0, structure: 1.0 },
};

const CAP = 3.0;   // no single member's regime multiplier may exceed this

// Apply the regime multiplier for member `name`. Falls back to 1 for unknown
// regime/member (a new emitter isn't silently zeroed).
export function regimeMultiplier(name, regime) {
  const row = REGIME_WEIGHTS[regime] || REGIME_WEIGHTS.NEUTRAL;
  const m = row[name];
  return Math.min(CAP, Number.isFinite(m) ? m : 1);
}
