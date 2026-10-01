# WaveTrend divergence, the reaction after the touch, and the all-features ceiling — pre-registration

Committed 2026-10-01 before any number below was computed. New columns for the Fade/Continue Book.
Owner's questions: (1) recent WaveTrend divergences at lines were followed by big fades — does that hold
over 10 years? (2) speed/explosion into the line and a snap back off it; ROC and ATR over X bars;
VWAP σ bands. Already in the book and NOT re-tested here (forge/APPROACH_BOOK_EURUSD_PREREG.md,
THEORY_FEATURES_LEVELS, RUBBER_BAND, EXHAUSTION_PLAYBOOK): move over 5/15/60 bars, acceleration, efficiency,
bar size vs the last hour, jump ratio, WaveTrend 1m/15m/1h level + MTF stretch, money flow, relative
volume, VWAP distance, and M15 close back inside. New here: divergence, ROC/ATR at longer lookbacks,
VWAP σ-band position, and the reaction in the minutes after the touch.

## Why divergence needs two versions
A swing high is only a swing once later bars are lower (right = 2 bars). A divergence visible on the chart
has therefore already been confirmed by price turning. Scoring it from the touch would use the turn
(look-ahead); ignoring the turn would not test what traders see. So:

- **D1 — developing divergence at the touch (knowable then).** WaveTrend 9/12/3 on M5 and on M15 bars
  (completed bars only). For an up line: price's high since the last confirmed swing high exceeds that
  swing high, while wt1 on the last completed bar is ≥ 2 below wt1 at that swing (mirror for down lines).
  The swing must be confirmed before the touch and lie 3–36 bars back. Scored from the touch, like every
  book column.
- **D2 — confirmed divergence (what the chart shows).** After the touch, wait for the first swing high
  (M5, left 3 / right 2) at or beyond the line to CONFIRM, within 60 minutes. Decision point = the bar the
  confirmation completes. Divergence = that swing's wt1 ≥ 2 below the previous confirmed swing high's wt1
  (previous swing 3–36 bars earlier, lower price). CONTROL = confirmed swings at the line WITHOUT divergence.
  The race restarts at the decision point with the touch's same targets (continue = next line out first,
  fade = line behind first). Comparing D2 with its control holds "price turned" constant, so the question
  is only whether the oscillator adds anything to the turn.

## Reaction after the touch (R1)
Decision 5, 15 and 30 minutes after the touch. Features from bars between the touch and the decision only:
furthest beyond the line (σ), where price sits now vs the line (σ), whether the last M5 close is back
inside, the speed of the move back (σ per minute from the extreme). The race restarts at the decision bar.
Passes already resolved by the decision are dropped and their share reported.

## New approach features (A2)
ROC over 240 bars; ATR(14) on M15 ÷ ATR(14) on M15 averaged over the previous 20 days at the same time;
largest 1-bar range in the last 15 bars ÷ the 60-bar median (explosion); VWAP σ-band position = (line −
London-day VWAP) ÷ volume-weighted SD of typical price since the day open (bands 1/2/3).

## Tests (fixed)
- **T1 (each new column, pooled 16 instruments):** within-cell (line family × London HOUR × range used)
  difference in continue rate between the column's groups, day-bootstrap 95% CI, same sign both halves
  (2016–22 / 2023–26). D2 is compared only with its control.
- **T2 (tradeable):** follow / fade net R > 0 in both halves, Benjamini–Hochberg 10% across every
  group × direction in this study.
- **T3 (ceiling):** one gradient-boosted model (sklearn HistGradientBoosting, fixed params max_depth 3,
  lr 0.05, 300 iters, l2 1.0, min leaf 100) on ALL book features (situation, approach, levels, divergence,
  A2), walk-forward by year 2023–2026 with a 5-day embargo, predicting continue. Report Brier skill vs the
  book's cell rates, and trade only when the predicted edge over break-even exceeds 5 points: net R > 0 in
  2023–24 AND 2025–26. This answers "if we combine everything, how much certainty is there in total?"
- Every builder runs a future-scramble self-check from the bar after its decision point.
