# Pre-registration: stop sized to the context of the moment (time of day, current volatility)

Committed 2026-10-08 before any number of this phase is computed. Follows forge/LINE_TOUCH_WIDE_SCAN_PREREG.md and
forge/LINE_TOUCH_COST_PREREG.md. Trigger: the user's point that a stop fixed at a share of the day's forecast range
cannot know the hour or what price is doing now, so it is too tight when the market is quiet and mis-sized when fast.

## Stop (replaces the fixed fraction)

- **Local range L** = high minus low of the 60 minutes ending at the touch bar (M1). It reflects the hour (volume time)
  and the volatility of the day so far, with no look ahead.
- **Stop distance = m x L**, with m in {0.5, 1.0, 1.5}, clamped to [0.05, 0.50] of the day's expected range so a dead or
  a spike hour cannot give a degenerate stop.
- **R is that distance**, so a trade's cost in R = multiplier x spread / (stop distance in price). Quiet hour: stop
  small, cost large in R, and the model sees it before entering. Fast hour: stop wide, cost small.
- Trail and exit exactly as before: lock +0.5R after +1R, trail 1R behind the extreme, 3R target, session-end close.

## Everything else unchanged

Population, eligibility (5-minute range <= 0.5 of expected range, hour < 20 UTC), 41 features (L / expected range is
added as a feature), walk-forward by year, one trade per instrument-day, ~2 a week calibrated on discovery
out-of-fold, cost = 2x repo table per instrument (1x and 3x reported), score = predicted gross R minus the trade's own
cost, width chosen on discovery net at 2x, holdout 2022-06-24 onward.

## Honesty about the holdout

The holdout has now been read for four designs. This phase is judged by the same pass rule, with the trial count
raised accordingly, and a pass only licenses the forward paper record.

## Pass rule (all required, chosen m, 2x cost, holdout)

Net mean > 0 with day-clustered 95% interval excluding zero; both halves (split 2024-06-01) positive; net beats the
rate-matched placebo 95th percentile (30 shuffled-target reruns, same trade count); at least 10 of 17 instruments net
positive; at least 1 trade a week. Placebo is run only if the first two hold.
