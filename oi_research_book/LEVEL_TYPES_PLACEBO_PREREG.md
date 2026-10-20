# Pre-registration: do the OTHER level types beat placebo, and how long does a level last?

Written 2026-10-20. Frozen once committed. Nothing in this file has been run.

## Why

`WALL_PLACEBO_PREREG.md` (17_wall_placebo.py, 2026-09-23) tested call walls and put walls only, at 15 / 60 / 240 min,
on the old primary-expiry walls, and found no wall-specific effect (wall 38.0% vs grid placebo 38.7%, calls, 15 min).
`24_ripple_walls_placebo.py` repeated it for the ripple walls. Max pain (10), real-IV gamma (16) and zero-gamma
distance (26, underpowered) were tested for next-day range or direction. What has NOT been tested, and is now drawn on
the OI Profile indicator:

1. Touch and reaction at the other level types: zero gamma, GEX flip, vanna flip, charm flip, max pain, the volume
   level, the gamma peak, and the expected-move edge (as a control: an IV ruler, not a positioning level).
2. The strongest-DTE book the indicator now uses (walls and gamma peak taken from the strongest bucket), against the
   old primary-expiry book.
3. Reaction measured as excursion (MFE and MAE over the next 1h / 4h / 24h) as well as break rate.
4. Calibration of the printed P(touch) against what happened, relative to a distance-only baseline.
5. Shelf life: a level as known on day t scored on t, t+1, t+2, t+3.

## Data

Same as 17: `OI Data/*.csv` plus `Oanda Parquet Files/*_m1.parquet`, 7 instruments, T-1 lag, same approach-side rule.
Sessions after 2026-08-21 are the lockbox and are not scored. NQ 1,521 days of Databento (monthlies only) is a second,
longer sample for index levels only; it is reported separately and never pooled with the 7-instrument set.

## Control (primary): grid placebo

For every real level of type X on day d, the placebo is the listed strikes at +-1 and +-2 increments (the same rule
as 17), on the same day, same code path, same buffers. Level types that are not strikes (zero gamma, flips, vanna and
charm flips, expected-move edges) use shifted copies at +-0.25 and +-0.5 of that day's one-sigma move, dropped when
within 0.1 sigma of another real level. Off-grid placebo is secondary.

## Tests (each level type reported separately; no pooling across types for the verdict)

T1 Touch rate: P(real level touched in the session) minus placebo, cluster bootstrap by (instrument, ISO week), 2,000 reps.
T2 Reaction after touch: break rate at 15 / 60 / 240 min and mean MFE / MAE (in units of the day's one-sigma), level
   minus placebo, same bootstrap.
T3 Calibration: reliability curve and Brier score of the printed P(touch) against outcomes, versus a distance-only
   logistic baseline. Reported for the sample where the export carried a P(touch) (levels with a value, not "-").
T4 Shelf life: T1 and T2 recomputed for the level set known on day t, scored on days t, t+1, t+2, t+3.

## Decision rules

PASS for a level type: at 15 min the break-rate difference vs grid placebo is below 0 with the CI excluding 0 AND the
MFE-minus-MAE difference has the same sign with its CI excluding 0 AND magnitude is at least 3 pp; AND it holds in
both halves of the sample split by date. Anything else is FAIL for that type.
Effective n is days, not touches. A type with fewer than 400 independent level-days is reported UNJUDGEABLE, not null.
Multiple testing: 8 level types x 3 horizons x 2 metrics are all logged here; the verdict uses Benjamini-Hochberg FDR at
0.10 across the full family. The expected-move edge is the negative control: if it passes, the detector is broken.
Costs: any type that passes T1-T2 is then run through the execution feasibility gate (spread / ATR below 0.15) before
anyone says it is tradeable. Passing placebo is a finding about the level, not a strategy.

## What would change a decision

A PASS for a type earns it a slot in the indicator's default levels and in OI-Conf's confluence list. A FAIL for all
types retires the "reaction" wording on the indicator and keeps the levels as a map of positioning only.

## Outputs

`scripts/28_level_types_placebo.py`, `data/results/level_types_placebo.json`, `LEVEL_TYPES_PLACEBO_RESULTS.md`.
