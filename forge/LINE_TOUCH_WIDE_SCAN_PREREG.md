# Pre-registration: wide scan of candle shape / position / time / regime at the forecast lines

Committed 2026-10-08 before any number of this scan was computed. Results go in
`analysis/output/line_touch_wide_scan/RESULTS.md` in a separate commit citing this one.

## Why

Narrow tests (one feature at a time, one stop/target grid) all returned null. A friend's bot (dry-run, five trades seen,
all winners, not evidence) trades the same C.OG lines selectively with a trailing stop and a session-end close. This
asks the wide question honestly: across EVERYTHING we can compute about how price arrived at a line, is there any
selector that decides fade / continue / skip and survives data it never saw?

## Population

- Every touch in `analysis/output/line-touch-response/*-response.json` (17 instruments, 396,538 touches, 2016-03 to
  2026-08-20). Touch detection is NOT re-implemented. Families hl50/75/90, oh50/75/90, dopen.
- **Discovery:** touches dated before 2022-06-24 (the file's own split). **Holdout:** 2022-06-24 onward. Holdout is read
  once, after the rule and every threshold are frozen.

## Features (all strictly from M1 bars up to and including the touch bar; none from after)

1. **Clock:** hour UTC, London session label, minutes into / left in the session, weekday.
2. **Line:** family, rung, side, level distance from the open in forecast sigma units.
3. **Day state:** day sigma scale, share of the expected range already used, position inside the running range (0-1),
   minutes since the running extreme, number of earlier touches that day and the signed outcome of the last one.
4. **Approach (speed and shape):** signed move over the prior 5/15/30/60 minutes in sigma, efficiency ratio (net move /
   path length), count of bars since the last counter-colour M5 bar, time spent within 0.1 sigma of the line before the
   touch.
5. **Candle shape:** body ratio, upper wick and lower wick ratios, and range / ATR for the last 1, 3 and 5 M5 bars, all
   signed to the touch direction.
6. **VWAP and momentum:** signed distance from session tick-volume VWAP in sigma, VWAP slope, ROC 15/60, RSI(14) on M5.
7. **Volume:** last-15-minute tick volume over the 60-minute mean, and over the 20-day same-hour mean.
8. **Prior day / regime:** previous day's return in sigma, overnight gap, 20-day realised-range / forecast ratio.

## Targets (signed in the CONTINUATION direction, units of the day's expected range)

- **T1:** return to 60 minutes after the touch bar close, and to 120 minutes.
- **T2 (structure, M1 forward walk):** enter at the touch bar close in the continuation direction. Stop = 0.10 of expected
  range. Trail once price is +1R by moving the stop to lock +0.5R and then following 1R behind the extreme. Exit at the
  earlier of the stop, 3R, or the end of the London session (the exact session-end minute is a parameter; the scan tries
  the session end only, not a free search). Output realised R. A short sign of the same structure gives the fade.

## Model and decision

- Gradient boosting (scikit-learn HistGradientBoosting), trained per target, walk-forward by calendar year inside the
  discovery period (expanding window; the year predicted is never in the training set). Features fixed above; no feature
  added or dropped after seeing a result.
- The decision rule is a threshold on the out-of-fold prediction: **continue** if predicted R above +c, **fade** if below
  -c, **skip** otherwise. c is chosen on discovery out-of-fold output only, as the value that gives 1 to 3 trades per
  week across all instruments, then frozen.
- Every model fit, target, c value tried is counted in `trials.json`; the headline p-value is Bonferroni-adjusted by
  that count.

## Placebo (the comparison that matters)

The whole pipeline (walk-forward fit, choose c, apply) is rerun 30 times with the target shuffled across touches inside
the same instrument-year-hour cell, breaking features to outcome and keeping every marginal. The real result must beat
the 95th percentile of the 30 placebo results on the holdout.

## Pass rule (all required)

On holdout: mean realised R net of cost > 0 at cost 0.02 of expected range per trade; day-clustered bootstrap 95%
interval excludes zero; both holdout halves (2022-06 to 2024-06, 2024-06 to 2026-08) positive; beats the placebo 95th
percentile; holds in at least 10 of the 17 instruments (not driven by one); at least 1 trade per week pooled. Gross and
net at cost 0, 0.02, 0.05 are all reported. A fail is reported as a fail with the feature importances and the best
discovery bucket's holdout value, so the next idea starts from where this one pointed.

## What this does not claim

Passing means a candidate for the forward paper record, not a live strategy. Nothing here touches live calculations.

## Amendment 1 (2026-10-08, after one discovery-only pass, holdout NOT read)

First discovery pass (out-of-fold, no holdout read) selected 571 trades at +0.52R gross, in every year 2018-2022, 99.8%
fades. An audit of the selection showed they are touches immediately after a spike: median last-5-minute move 0.83 of
the day's expected range (population median 0.10), 111 of the 571 on EURCHF in 2020, and the same minute counted up to
five times because several lines were touched at once. That is an unfillable fast-market reversion, not a decision
anyone could take at the touch-bar close, and it duplicates one event. Two rules are added before anything else is run
and before the holdout is read:

1. **Eligibility (applies to training and trading):** a touch is eligible only if the 5-minute range ending at the
   touch bar is at most 0.5 of the day's expected range. Sensitivity at 0.3 is reported alongside; it is not chosen
   on holdout.
2. **One trade per instrument per day:** the first eligible touch of the day whose score clears c. c is re-calibrated
   under this rule to 2 trades a week pooled on discovery out-of-fold output, then frozen.

The first-pass number is recorded here so it is not forgotten: **unamended discovery pass = +0.52R gross, an artifact.**
