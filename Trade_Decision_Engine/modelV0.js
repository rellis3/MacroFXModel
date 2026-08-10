// Trade Decision Engine — model registry, v0.
//
// v0 is a TRANSPARENT HAND-SET PRIOR, not a fitted model. Its job is to put the
// scoring plumbing in production and start accumulating the decision log that a
// real meta-labeled fit (v1) trains on. Every response carries
// `calibrated: false` so nothing downstream can mistake this for evidence.
//
// Weights are in logit units and apply to the bounded 0..1 features built by
// decisionCore.buildEventFeatures. Still the live default for every instrument
// modelV1 hasn't been re-fit on (see decisionCore.js's defaultModelFor) — v1 is
// FX-majors-only so far.

export const MODEL_V0 = {
  version: 'v0-prior-2026-07',
  calibrated: false,

  // logit(0.51) — near coin-flip before context says otherwise
  intercept: 0.04,

  weights: {
    fade_range_regime:     0.45,  // fading in a RANGE regime — the home game
    follow_trend_regime:   0.40,  // following with a directional regime + high T
    fade_on_trend_day:    -1.60,  // selling into a rally — the classic killer
    follow_on_quiet_day:  -0.90,  // chasing breakouts on a reversion day
    confluence:            0.55,  // distinct level sources stacked in the zone
    zone_score:            0.25,  // clusterLevels weighted score
    stretch_fade:          0.45,  // fading a level that is stretched from open
    stretch_follow_chase: -0.60,  // following into an already-extended move
    vol_extreme:          -0.80,  // top-decile σ — bands unreliable, spreads wide
    vol_compressed:        0.15,  // quiet tape mildly favours the setup
    news_soon:            -0.50,  // high-impact event inside soft horizon
    late_session:         -0.25,  // thin late-NY tape
    fast_approach_fade:   -0.50,  // freight train into a fade level
    fast_approach_follow:  0.30,  // momentum confirming a follow
  },

  // decision policy
  goThreshold: 0.55,

  // continuous sizing dial above threshold: 0.5 at threshold → 1.5 cap
  sizeCurve: { base: 0.5, slope: 5, cap: 1.5 },
};
