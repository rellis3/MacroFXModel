# hl-spread-estimator — results

Prereg: `forge/HL_SPREAD_ESTIMATOR_PREREG.md` (committed in `55647800`, 2026-11-14, before any estimate was computed; no amendment). Run 2026-11-14, seed 20261114, month bootstrap B = 1000, mirror 200 pairings.
Branch `main`. Ledger id: `hl-spread-estimator`. Scripts `scripts/hl-spread-estimator/` (`run.py`, `finish.py`); per-instrument table `per_instrument.csv`.

## Verdict: NULL

Neither published estimator reproduces the quoted OANDA spread on the 34 instruments where we hold bid/ask. **Level:** the pooled median relative error is **952%** for Corwin-Schultz (95% CI 916% to 982%) and **174%** for Abdi-Ranaldo (100% to 342%), against a gate of 30% (upper end ≤ 40%): both estimators overstate the spread, by a median factor of 10.7x (CS) and 5.9x (AR), because the daily range is dominated by volatility, not the spread. **Variation:** the median within-instrument month-to-month Spearman is 0.29 (CI 0.22 to 0.34) for CS and 0.06 (0.02 to 0.11) for AR against a bar of 0.50. **Ordering across instruments:** +0.06 (CS) and -0.05 (AR) against 0.80. Every gate fails for both; the registered NULL rule (the error interval's lower end above 0.40 for both estimators) holds. The measurement is powered: the intervals are tight and far from the bars.

## Scored cells

| Estimator | Pooled median relative error (95% CI) | Gate | Pooled median Spearman (95% CI) | Gate | Cross-instrument ordering | Gate | Bias (median est/measured) |
|---|---|---|---|---|---|---|---|
| Corwin-Schultz | 9.52 (9.16, 9.82) | ≤ 0.30 FAIL | 0.29 (0.22, 0.34) | ≥ 0.50 FAIL | +0.06 (-0.32, +0.43) | ≥ 0.80 FAIL | 10.7x |
| Abdi-Ranaldo | 1.74 (1.00, 3.42) | ≤ 0.30 FAIL | 0.06 (0.02, 0.11) | ≥ 0.50 FAIL | -0.05 (-0.42, +0.34) | ≥ 0.80 FAIL | 5.9x |

## Controls (THE MIRROR)

Pairing each instrument's estimate with a randomly chosen other instrument's measured spread (200 pairings, same months) gives a median relative error of 9.6 (CS) and 1.9 (AR), and a median Spearman of 0.18 (CS) and 0.05 (AR). The real pairing is barely different from a random one (CS Spearman 0.29 real vs 0.18 random; AR 0.06 vs 0.05): the estimators are not tracking anything instrument-specific beyond the shared volatility cycle.

## Descriptive

- **By group (CS relative error / Spearman / bias):** FX majors 10.8 / 0.41 / 12.7x (n 7); FX crosses 7.0 / 0.25 / 8.5x (n 20); gold 14.1 / -0.01 / 15.2x; indices 28.9 / 0.05 / 29.6x (n 6).
- **By group (AR):** FX majors 1.75 / 0.10 / 7.1x; FX crosses 1.72 / 0.09 / 5.2x; indices 5.17 / 0.01 / 20.3x.
- CS follows the month-to-month swings in FX majors a little (median Spearman 0.41), which is the volatility cycle the measured spread also shows, but its level is about 11x too high. A scaled or volatility-adjusted version would be a new prereg (the prereg fixed "used as published"): the within-instrument tracking of CS (0.29 pooled) is too weak to support one on FX crosses, gold or indices.

## Deviations from the prereg

None. The measured spread is the quoted ask minus bid (OANDA 1-minute closes) over the London session; it is not the realised fill cost of an account (`cost-verification` found NQ and gold fills inside the quote), which is a limit stated in the prereg.

## What this changes

No bar-only spread estimator is usable for costs on this universe. Keep using the bid/ask M1 history (2016-10 to 2026-08) for the cost of any net-of-cost test within that window, and the live `spread_profile_v1` from 2026-09; pre-2016-10 net-of-cost verdicts are not extended by this route and stay "gross". For history before 2016, a measured spread source (broker or vendor quotes) is needed.
