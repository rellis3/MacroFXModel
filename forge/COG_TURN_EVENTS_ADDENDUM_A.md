# COG-TURN-EVENTS, Addendum A: is the "Nasdaq moves more after a line turn" pattern real volatility information?

*Registered 2026-10-15 after a three-draw debug run of the main script showed, for A0 (all confirmed line turns), the +-u race resolving more often than in matched bars in all three halves (favourable and adverse both +5-7 pp, "neither" -10 to -13 pp), while mean signed return was about zero. That debug output was seen BEFORE this addendum; the full registered run (200 placebo draws) was still running and has not been read. The addendum is therefore a follow-up to a pattern already seen once, and is labelled exploratory-confirmatory: it can lower or remove the pattern but cannot raise the main verdict.*

## The question
The main design matched controls on Nasdaq's zig-zag state, hour of day and trailing 1-hour return, but NOT on recent volatility. Line turns can cluster in busy periods (data releases, news), and busy periods are followed by more Nasdaq movement. If the extra movement is only that, it adds nothing to a volatility forecast we do not already have from Nasdaq's own recent range.

## Tests (A0 events, k = 0.75, 2 h horizon, video week excluded, same halves)
1. **Volatility-matched controls**: add the quintile of Nasdaq's trailing 2-hour range (8-bar high-low) to the matching key (state, hour +/- 1, trailing-1h-return quintile, range quintile). Outcome: **move share** = favourable + adverse race share (the race resolved either way within 2 h), and **direction share** = favourable / (favourable + adverse).
2. **Release exclusion**: the same, without events whose confirm bar is within 30 minutes after an 08:30 / 10:00 ET release or a 14:00 ET FOMC decision.
3. **Time-shift placebo for the move share**: the line shifted by 5-60 days (200 draws), same matching, move-share difference; the real value must exceed the placebo 95th percentile.
4. **Incremental volatility test**: on all bars, OLS of log Nasdaq absolute return over the next 8 bars on Nasdaq-only features (log trailing 8-bar range, log trailing 16-bar absolute return, log 20-day RMS, hour-of-day dummies for 24 hours) plus a dummy for 'within 8 bars after a confirmed line turn'; date-clustered SE; validation and OOS coefficients and out-of-sample R-squared with and without the dummy.

## Pass rule
**Volatility information is real** if (1) the move-share difference is above zero with one-sided p < 0.05 in validation AND OOS under the volatility-matched controls, (2) it survives release exclusion, (3) beats the placebo 95th percentile, and (4) the dummy is positive with |t| > 2 in validation and OOS and out-of-sample R-squared rises. Otherwise it is **explained by Nasdaq's own recent volatility or news clustering**. The direction share is reported either way: a direction effect requires it above 0.5 beyond matched, validation and OOS, p < 0.05.

## What changes
Real: a "line turn raises the odds of a larger Nasdaq move" note is eligible for the Rates card and a forward record as **volatility context, never direction**. Explained: closes it; the line stays same-hour context.
