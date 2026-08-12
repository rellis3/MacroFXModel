// Trade Decision Engine — model registry, v1 (FITTED).
//
// Logistic fit on the backfill event log (Trade_Decision_Engine/backfill.js →
// fitLogistic), pooled 6 FX majors, 110883 after-cost events, time-ordered
// train/OOS + embargo. OOS Brier 0.2469 vs the v0 hand-set prior
// 0.2724 (fit beats prior). Better CALIBRATED, not more selective —
// OOS calibration is shallow (see FIT_FINDINGS.md); use for honest probability + sizing,
// not as proof of a strong per-trade edge.
//
// Candidate features TESTED and DROPPED (no OOS improvement in this backfill): htf_align
// (weight ≈0.003, agree-win 55.6% vs oppose 55.7% — did NOT replicate the header claim in
// decisionCore) and wt_stretch_fade (Phase-11's edge is forecast-line-specific, null on the
// engine's broad zones). So v1 = a RE-FIT of the v0 feature set — no new feature earned in.
// The fit's own correction worth noting: stretch_fade goes +0.45 (hand-set) → −0.14 (fitted),
// i.e. fading a distance-stretched level is mildly ANTI-predictive after cost.
//
// Fit on FX majors only — RE-FIT before applying to gold / indices.
// Provenance: fitted in-session; re-run the script in FIT_FINDINGS.md to regenerate.

export const MODEL_V1 = {
  version: 'v1-fitted-fx-majors',
  calibrated: true,
  fit: { events: 110883, oos_n: 38635, brier_fitted: 0.2469, brier_v0: 0.2724, pairs: ["eurusd","gbpusd","audusd","nzdusd","usdcad","usdchf"] },

  intercept: 0.2470,

  weights: {
    fade_range_regime: -0.0150,
    follow_trend_regime: 0.0014,
    fade_on_trend_day: 0.0000,
    follow_on_quiet_day: 0.0000,
    confluence: 0.0016,
    zone_score: -0.0119,
    stretch_fade: -0.1396,
    stretch_follow_chase: -0.0056,
    vol_extreme: 0.0281,
    vol_compressed: 0.0111,
    news_soon: 0.0000,
    late_session: -0.0672,
    fast_approach_fade: -0.1003,
    fast_approach_follow: 0.0030,
  },

  goThreshold: 0.55,
  sizeCurve: {"base":0.5,"slope":5,"cap":1.5},
};
