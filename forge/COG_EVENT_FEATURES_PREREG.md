# COG-EVENT-FEATURES: do the slope, speed, persistence, magnitude and variability of the SOFR-Euribor series add information about Nasdaq's direction, turning points or volatility?

*Pre-registered 2026-10-15, before any feature was computed. Follows COG-TURN-EVENTS (turn events, matched and placebo baselines, races) and its Addendum A. This study adds what the owner's second brief asks and the turn-event study does not do: **describe each event by slope, strength, speed, persistence and variability**, test them **individually and combined** with **IC, R-squared, t, p and CIs** against a **Nasdaq-only baseline**, treat **direction, turning point and volatility as three separate outcomes**, **audit data staleness**, and state **economic significance after costs**. C.OG's own steps (video 03:20-05:10, 07:50-11:36): identify a candidate, wait for confirmation, measure direction and volatility, then test with R-squared, t, p, then IC. The random-baseline, session, regime and placebo machinery of COG-TURN-EVENTS is reused, not repeated.*

## Series and clocks (unchanged from COG-TURN-EVENTS)
Research series `x` = (SOFR Sep26 - Euribor Mar27) in bp, 15-minute, close-labelled, day screen (>= 3 distinct prices per leg per day), no display transform and no plot lead. Nasdaq `y` = log price on the same grid (CFD cache, then futures moves). Decision time = the close of the bar; every feature uses data up to and including that bar only; every forward outcome starts at that bar's close. A turn's feature set is available only from its **confirm** bar, never its extreme bar. Window 2024-04-15 to 2026-10-09; the video week (16-23 Sep 2026) is excluded from pooled statistics and shown separately.

## Event features (computed at each bar, causal)
- **dir**: current zig-zag state of the line (k = 0.75), +1 / -1; **turn**: +1 / -1 on the confirm bar of a flip, else 0 (held for 8 bars as in COG-TURN-EVENTS).
- **mag**: size of the current leg (running extreme minus the last confirmed turn level) divided by theta (leg strength).
- **speed**: change over the last 4 bars divided by theta.
- **slope**: (EMA8 - EMA32 of x) / rolling std of 15-minute changes over 480 bars.
- **persistence**: share of the last 16 bar-to-bar changes with the same sign as the current leg direction, and **age**: bars since the last confirmed turn (capped at 96).
- **var**: log of the ratio of the line's 16-bar realised variability (std of 15-minute changes) to its previous-20-day level (change in variability).
- **calm**: Nasdaq consolidating flag (trailing 8-bar range at or below its previous-20-day 30th percentile); **div**: line |4 h change| at or above its previous-20-day 90th percentile while Nasdaq |4 h return| at or below its previous-20-day 30th percentile (divergence, COG-TURN-EVENTS A4).
Event table (event time, confirm time, information available at confirm: dir, mag, speed, slope, persistence, var, calm, div, Nasdaq state; direction; magnitude in bp) is saved for every confirmed turn at every k in {0.5, 0.75, 1.0, 1.5, 2.5}.

## Three outcomes, each with its own null (all measured from the decision bar's close; Nasdaq 15-minute closes)
1. **Direction**: Nasdaq signed forward log return over H in {4, 8, 16, 32} bars (1 h, 2 h, 4 h, 8 h). Null: the feature has zero rank correlation (IC) with forward return given the Nasdaq-only baseline.
2. **Turning point**: whether Nasdaq's causal zig-zag (k = 0.75) confirms a flip within H in {8, 16, 32} bars, separately for flip-up and flip-down. Null: the feature does not change the probability of a flip beyond the baseline (logit, date-clustered).
3. **Volatility**: log of Nasdaq realised variability over the next 8 bars divided by the last 8 bars (change), and log absolute return over the next 8 bars. Null: no incremental explanatory power beyond Nasdaq's own trailing range, trailing absolute return, 20-day level and hour-of-day.

## Baseline and combinations
Nasdaq-only baseline features: previous 1 h, 4 h and 24 h returns, trailing 8-bar and 16-bar range, log 20-day RMS, position in the 96-bar range, own zig-zag state, hour-of-day dummies (intraday seasonality removed by including them, and by demeaning each outcome by its hour-of-day in-sample mean). Models: baseline; baseline + each feature alone (dir, turn, mag, speed, slope, persistence, age, var, div); baseline + all features together (**combined**); baseline + the turn-direction x session interaction (exploratory).

## Statistics (per outcome x model x H)
Effect size (standardised coefficient and, for turn probability, change in probability per 1 sd), t and p with **date-clustered** standard errors (clusters = UTC days, which absorb overlapping forward windows and intraday dependence; 1,000-draw day-block bootstrap cross-check for the combined models), 95% CIs, **R-squared** in-sample per half and the **out-of-sample incremental R-squared** (fit on in-sample + validation, scored on OOS) with a day-block bootstrap CI, and the **information coefficient**: Spearman rank correlation between the signal (the model's out-of-sample prediction increment, and each raw feature) and the realised outcome, averaged over days, with a day-level t. Multiple testing: BH-FDR 10% over all (feature x outcome x H) cells in the in-sample half; the family size is printed.

## Splits
In-sample 2024-04-15 to 2025-03-31, validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Honest limit (as before): no period is untouched for the combined line; the forward paper record from 2026-10-15 is the untouched test.

## Data and clock audit (reported before any result)
Per leg and per hour of day: share of 1-minute bars with no print, share of 15-minute bars below 5 minutes of data, longest runs without a price change, share of confirm bars where either leg changed price in the last 15 minutes (staleness at the decision bar), session coverage (Asia / Europe / US), number of days dropped by the quality screen, contract-roll check (the pinned pair has no roll in the window; the next roll is 2026-12-15), and confirmation that no feature references a later bar (a shift test: shifting the line forward one bar must change every feature value, and recomputing features on a series truncated at t must reproduce the value at t exactly).

## Economic significance
For each event type with a nonzero primary effect: expected signed 2 h return per event minus round-trip cost. Costs fixed now: 1.0 bp of price round trip for liquid index futures (about 3-4 NQ points at current levels, covering spread and one tick of slippage per side), reported also at 0.5 and 2.0 bp. A finding is economically meaningful only if net expected return per event is above zero at 1.0 bp with a day-clustered 95% lower bound above zero **or** it is explicitly labelled as context (no trade).

## Pass rules (registered)
- **Directional relationship**: a feature or combination with positive-sign OOS incremental R-squared and OOS IC above zero (day-level t > 2) **and** FDR-passing in-sample, same sign validation and OOS (one-sided p < 0.05 each).
- **Turning-point relationship**: same standard on the flip-probability outcome (OOS log-likelihood gain over baseline with day-block bootstrap CI above zero).
- **Volatility relationship**: same standard on the volatility outcomes.
- **Economic**: net-of-cost rule above. A statistical pass without an economic pass is reported as "statistical context only".
- Everything else is exploratory or inconclusive; the report labels each result as robust, exploratory or inconclusive and never promotes an exploratory finding.

## Not built
No live signal, no trade rule, no model beyond the linear baselines above. If a relationship passes, the next step is a forward paper record, not code in the bots.
