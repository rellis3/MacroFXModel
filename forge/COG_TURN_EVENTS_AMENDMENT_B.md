# COG-TURN-EVENTS, Amendment B: the matched-control exclusion biased the race and move-share columns

*Registered 2026-10-15 after reading the results of the main run (verdict: insufficient evidence) and Addendum A, before any corrected number was computed.*

## What was found
The main design drew matched controls only from bars at least 8 bars away from **any** line turn. Line turns occur about every 28 bars (3 152 turns in 90 000 bars), so excluding 17 bars around each leaves mostly quiet stretches. Controls were therefore systematically quieter than a typical bar, and any event bar (an active bar by construction) looked more active than its control. The signature: the time-shift placebo (line shifted by 5-60 days, which carries no information) returned a mean "move share" difference of **+0.069** in Addendum A and a mean of about +0.002 for the signed return, where an unbiased design should return about zero for both. The registered gates that used the race shares (`race_ok` in the primary-cell table, the fav / adv / neu / MFE / MAE rows, and Addendum A's move share) are affected; the signed-return test is not materially affected (controls' signed returns average near zero whether the controls are quiet or not), and the registered verdict did not depend on the race gate alone (a pattern needed return, race, placebo and incremental gates together).

## The correction (applies to every control-based number, original left in place)
Controls exclude only the bars within +/-8 of **their own event**; they are no longer excluded for being near other events. Same matching keys (Nasdaq zig-zag state, hour +/-1, trailing-1h-return quintile; plus trailing 2 h range quintile in Addendum A). Placebo draws use the same rule, so the placebo mean is expected to be near zero for every metric; the placebo mean is printed for the signed return **and** for the move share. If the corrected placebo mean is still more than 0.02 from zero for move share, the matched-control comparison is declared uninterpretable for that metric and only the regression-based tests (clustered OLS with Nasdaq-only controls) are used for it.

## Pass rules
Unchanged from COG-TURN-EVENTS and Addendum A. The corrected run is a second reading of the same registered gates. A relationship counts as robust only if it passes under the corrected controls; the original run is kept so the change is visible, and nothing found under the original controls alone is promoted.

## Why this was not a free choice
The correction removes the cause of a measured bias (placebo mean far from zero); it cannot be tuned toward a result because the matching keys, horizons, thresholds, splits and gates are all the registered ones, and the same corrected rule is applied to real events and placebo draws alike.
