# COG-EVENT-FEATURES results

Run once per forge/COG_EVENT_FEATURES_PREREG.md. Research series only (raw bp, close-labelled, no display transform, no plot lead). In-sample 2024-04-15 to 2025-03-31, validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09; video week excluded.

## Verdicts (registered rules)

- **Direction: inconclusive / none** (0 cells pass)
- **Turning point (Nasdaq flip within H): inconclusive / none** (0 cells pass)
- **Volatility: inconclusive / none** (0 cells pass)
- FDR family: 98 single-feature cells (10%). Cells passing every gate overall: 0.

## Data and clock audit
- Truncation test: features recomputed with every bar after t blanked reproduce the full-series value at t exactly in 12 of 12 random bars (a mismatch would mean a feature reads the future). Shift test: moving the line forward one bar changes the speed feature in 70.0% of bars (so features are tied to bar time).
- Legs (1-minute midpoints): SOFR Sep26 (SR3U6): 880,170 minutes, 88% of minutes with an unchanged price, longest unchanged run 1081 min, 1.1% of 15-minute bars below 5 prints (dropped), least-active UTC hour 04 (95% unchanged), hours below half the peak coverage: 21; Euribor Mar27 (IH7): 762,300 minutes, 87% of minutes with an unchanged price, longest unchanged run 888 min, 1.2% of 15-minute bars below 5 prints (dropped), least-active UTC hour 03 (96% unchanged), hours below half the peak coverage: 20
- Staleness at the decision bar: at 66.3% of confirmed turns at least one leg printed the same 15-minute close as the bar before (one leg flat for 15 minutes), against 78.5% of all bars. Interpretation: turns do not systematically coincide with a stale leg; stale legs are common and a turn seen through one flat leg is a one-leg move.
- Quality screen (3 distinct prices per leg per day): 634 days with both legs, 4 removed. Session split of confirmed turns: Asia 19%, Europe 36%, US 45%.
- Contract rolls: the pinned pair (SR3U6, IH7) has no roll in the window; the next roll is 2026-12-15 (SR3Z6 / IM7). The Pine indicator plot offset (`leadDays`, default 1.0 day, drawn to the right) and every display transform (scale, offset, invert, bp, smoothing, auto-fit) are not used anywhere in this pipeline.

## Single-feature and combined results (t = date-clustered t of the feature added to the Nasdaq-only baseline, per half; IC = day-level Spearman IC out of sample with its t; oos_gain = out-of-sample R-squared gain (direction, volatility) or log-likelihood gain per observation (flip outcomes), with 95% day-block CI; p_IS / fdr_IS = in-sample p and BH-FDR 10% across the family)

| outcome   | feature   |   t_IS |   t_VAL |   t_OOS |   ic_OOS |   ict_OOS |   oos_gain |   oos_lo |   oos_hi |   p_IS |   fdr_IS | passes   |
|:----------|:----------|-------:|--------:|--------:|---------:|----------:|-----------:|---------:|---------:|-------:|---------:|:---------|
| dir_4     | dirF      | -0.617 |  -1.454 |   0.28  |          |           |     -0.002 |   -0.006 |    0.002 |  0.537 |        0 | False    |
| dir_4     | turnF     |  0.041 |  -0.248 |   0.227 |          |           |     -0     |   -0.001 |    0     |  0.967 |        0 | False    |
| dir_4     | magS      | -0.907 |  -0.681 |   0.925 |   -0.007 |    -0.19  |     -0.003 |   -0.007 |    0.001 |  0.364 |        0 | False    |
| dir_4     | speed     | -1.562 |   0.592 |   0.291 |   -0.039 |    -1.366 |     -0     |   -0.002 |    0.001 |  0.118 |        0 | False    |
| dir_4     | slope     | -0.088 |   1.151 |   0.73  |   -0.033 |    -0.874 |      0.001 |   -0.002 |    0.004 |  0.93  |        0 | False    |
| dir_4     | persS     | -2.34  |  -1.281 |   0.412 |   -0.04  |    -1.164 |     -0.006 |   -0.014 |    0.003 |  0.019 |        0 | False    |
| dir_4     | ageS      | -0.504 |  -1.483 |   0.422 |   -0.014 |    -0.355 |     -0.002 |   -0.006 |    0.001 |  0.614 |        0 | False    |
| dir_4     | divS      |  0.346 |   0.465 |   0.321 |          |           |      0     |   -0.001 |    0.001 |  0.729 |        0 | False    |
| dir_4     | COMBINED  |        |         |         |          |           |     -0.006 |   -0.02  |    0.007 |        |      nan | False    |
| dir_8     | dirF      | -0.696 |  -1.289 |  -0.091 |          |           |     -0.003 |   -0.01  |    0.004 |  0.486 |        0 | False    |
| dir_8     | turnF     | -0.077 |  -0.273 |  -0.389 |          |           |      0     |   -0.002 |    0.002 |  0.939 |        0 | False    |
| dir_8     | magS      | -0.875 |  -0.678 |   0.72  |   -0.042 |    -0.871 |     -0.004 |   -0.01  |    0.002 |  0.381 |        0 | False    |
| dir_8     | speed     | -0.421 |   0.681 |  -0.344 |   -0.054 |    -1.621 |     -0     |   -0.001 |    0.001 |  0.674 |        0 | False    |
| dir_8     | slope     |  0.116 |   1.546 |   1.263 |   -0.064 |    -1.385 |      0.005 |   -0.004 |    0.013 |  0.907 |        0 | False    |
| dir_8     | persS     | -2.017 |  -0.401 |   0.589 |   -0.029 |    -0.682 |     -0.006 |   -0.014 |    0.003 |  0.044 |        0 | False    |
| dir_8     | ageS      | -0.764 |  -1.449 |   0.437 |   -0.055 |    -1.124 |     -0.005 |   -0.012 |    0.002 |  0.445 |        0 | False    |
| dir_8     | divS      |  0.951 |   0.816 |  -0.23  |          |           |     -0.001 |   -0.003 |    0.002 |  0.342 |        0 | False    |
| dir_8     | COMBINED  |        |         |         |          |           |     -0.005 |   -0.029 |    0.02  |        |      nan | False    |
| dir_16    | dirF      | -1.674 |  -2.364 |   0.12  |          |           |     -0.01  |   -0.025 |    0.003 |  0.094 |        0 | False    |
| dir_16    | turnF     | -1.235 |  -1.397 |  -0.863 |   -0.011 |    -0.314 |      0     |   -0.007 |    0.01  |  0.217 |        0 | False    |
| dir_16    | magS      | -1.623 |  -0.848 |   1.335 |   -0.046 |    -0.877 |     -0.01  |   -0.021 |   -0.001 |  0.105 |        0 | False    |
| dir_16    | speed     | -1.006 |   1.108 |   0.803 |   -0.042 |    -1.279 |      0     |   -0     |    0     |  0.314 |        0 | False    |
| dir_16    | slope     | -0.101 |   1.526 |   2.064 |   -0.087 |    -1.658 |      0.012 |   -0.001 |    0.025 |  0.92  |        0 | False    |
| dir_16    | persS     | -2.805 |  -0.241 |   0.957 |    0.017 |     0.413 |     -0.009 |   -0.023 |    0.003 |  0.005 |        0 | False    |
| dir_16    | ageS      | -1.601 |  -1.81  |   0.87  |   -0.084 |    -1.725 |     -0.014 |   -0.029 |   -0     |  0.109 |        0 | False    |
| dir_16    | divS      |  1.117 |   0.67  |   1.401 |          |           |      0.002 |   -0.004 |    0.009 |  0.264 |        0 | False    |
| dir_16    | COMBINED  |        |         |         |          |           |      0.004 |   -0.031 |    0.044 |        |      nan | False    |
| dir_32    | dirF      | -1.824 |  -0.952 |   1.218 |          |           |     -0.015 |   -0.03  |   -0.002 |  0.068 |        0 | False    |
| dir_32    | turnF     | -2.096 |  -0.717 |  -1.19  |          |           |      0.004 |   -0.003 |    0.011 |  0.036 |        0 | False    |
| dir_32    | magS      | -1.514 |  -0.037 |   2.639 |   -0.092 |    -1.786 |     -0.013 |   -0.021 |   -0.004 |  0.13  |        0 | False    |
| dir_32    | speed     | -1.393 |   1.643 |   2.091 |   -0.07  |    -1.966 |     -0     |   -0     |    0     |  0.164 |        0 | False    |
| dir_32    | slope     | -0.83  |   1.312 |   2.245 |   -0.117 |    -1.967 |      0.008 |    0.003 |    0.014 |  0.406 |        0 | False    |
| dir_32    | persS     | -1.823 |  -0.162 |   0.211 |   -0.04  |    -1     |     -0.003 |   -0.009 |    0.004 |  0.068 |        0 | False    |
| dir_32    | ageS      | -1.457 |  -0.658 |   1.87  |   -0.101 |    -1.872 |     -0.02  |   -0.037 |   -0.006 |  0.145 |        0 | False    |
| dir_32    | divS      | -0.801 |   0.073 |   2.24  |          |           |     -0.001 |   -0.003 |   -0     |  0.423 |        0 | False    |
| dir_32    | COMBINED  |        |         |         |          |           |     -0     |   -0.03  |    0.029 |        |      nan | False    |
| flipU_8   | dirF      | -0.575 |   0.512 |  -0.442 |          |           |      0     |   -0     |    0     |  0.565 |        0 | False    |
| flipU_8   | turnF     |  0.15  |   0.533 |   0.394 |          |           |      0     |   -0.001 |    0.001 |  0.881 |        0 | False    |
| flipU_8   | magS      | -0.242 |   0.388 |   0.241 |   -0.097 |    -2.189 |      0     |   -0     |    0     |  0.809 |        0 | False    |
| flipU_8   | speed     |  0.263 |  -0.487 |   0.236 |   -0.039 |    -1.096 |     -0     |   -0     |    0     |  0.792 |        0 | False    |
| flipU_8   | slope     |  1.016 |   0.163 |   0.352 |   -0.095 |    -1.843 |     -0     |   -0.002 |    0.002 |  0.31  |        0 | False    |
| flipU_8   | persS     | -0.638 |   1.493 |  -0.27  |   -0.002 |    -0.049 |     -0     |   -0.001 |    0.001 |  0.523 |        0 | False    |
| flipU_8   | ageS      | -0.779 |   0.264 |  -0.7   |   -0.07  |    -1.623 |      0     |   -0.001 |    0.001 |  0.436 |        0 | False    |
| flipU_8   | divS      |  0.07  |  -0.647 |  -0.553 |          |           |      0     |   -0     |    0     |  0.944 |        0 | False    |
| flipU_8   | COMBINED  |        |         |         |          |           |      0     |   -0.004 |    0.003 |        |      nan | False    |
| flipD_8   | dirF      | -0.584 |   1.007 |  -1.646 |          |           |     -0.001 |   -0.003 |   -0     |  0.559 |        0 | False    |
| flipD_8   | turnF     | -0.532 |  -0.249 |  -0.338 |          |           |      0     |   -0.001 |    0.001 |  0.595 |        0 | False    |
| flipD_8   | magS      |  0.296 |   0.337 |  -1.965 |    0.05  |     1.02  |     -0.002 |   -0.003 |   -0     |  0.767 |        0 | False    |
| flipD_8   | speed     | -0.856 |  -1.274 |   0.541 |    0.069 |     1.861 |     -0.001 |   -0.003 |    0.001 |  0.392 |        0 | False    |
| flipD_8   | slope     |  0.68  |  -0.411 |  -2.045 |   -0.016 |    -0.296 |     -0.001 |   -0.001 |   -0     |  0.496 |        0 | False    |
| flipD_8   | persS     |  0.907 |   0.329 |  -1.427 |    0.038 |     0.854 |     -0.002 |   -0.004 |   -0     |  0.365 |        0 | False    |
| flipD_8   | ageS      | -0.17  |   1.112 |  -1.962 |    0.042 |     0.852 |     -0.003 |   -0.006 |   -0.001 |  0.865 |        0 | False    |
| flipD_8   | divS      |  0.157 |   0.515 |  -0.826 |          |           |     -0     |   -0.001 |    0     |  0.875 |        0 | False    |
| flipD_8   | COMBINED  |        |         |         |          |           |     -0.008 |   -0.013 |   -0.003 |        |      nan | False    |
| flipU_16  | dirF      | -0.666 |   0.045 |  -1.1   |          |           |      0.001 |   -0.001 |    0.002 |  0.505 |        0 | False    |
| flipU_16  | turnF     | -0.686 |  -0.848 |  -1.434 |          |           |      0     |   -0.001 |    0.002 |  0.493 |        0 | False    |
| flipU_16  | magS      | -0.071 |   0.605 |  -0.318 |   -0.102 |    -1.83  |      0     |   -0     |    0     |  0.943 |        0 | False    |
| flipU_16  | speed     |  0.595 |  -0.471 |   0.836 |   -0.048 |    -1.451 |     -0     |   -0     |    0     |  0.552 |        0 | False    |
| flipU_16  | slope     |  0.705 |   0.471 |   0.29  |   -0.082 |    -1.347 |     -0     |   -0.002 |    0.002 |  0.481 |        0 | False    |
| flipU_16  | persS     | -0.04  |   1.339 |  -1.284 |   -0.025 |    -0.58  |     -0.002 |   -0.003 |    0     |  0.968 |        0 | False    |
| flipU_16  | ageS      | -0.54  |   0.256 |  -0.974 |   -0.078 |    -1.415 |      0.001 |   -0.001 |    0.002 |  0.589 |        0 | False    |
| flipU_16  | divS      |  1.094 |   0.711 |   0.092 |          |           |     -0     |   -0.002 |    0.001 |  0.274 |        0 | False    |
| flipU_16  | COMBINED  |        |         |         |          |           |     -0.001 |   -0.006 |    0.004 |        |      nan | False    |
| flipD_16  | dirF      | -0.722 |   1.708 |  -2.396 |          |           |     -0.005 |   -0.008 |   -0.002 |  0.471 |        0 | False    |
| flipD_16  | turnF     | -1.121 |   0.661 |  -1.621 |          |           |      0     |   -0     |    0.001 |  0.262 |        0 | False    |
| flipD_16  | magS      |  0.187 |   0.837 |  -2.302 |    0.071 |     1.178 |     -0.004 |   -0.007 |   -0.001 |  0.852 |        0 | False    |
| flipD_16  | speed     | -0.751 |  -0.082 |  -0.795 |    0.065 |     1.699 |      0     |   -0     |    0.001 |  0.453 |        0 | False    |
| flipD_16  | slope     |  1.063 |   0.83  |  -2.132 |    0.006 |     0.096 |     -0.008 |   -0.014 |   -0.002 |  0.288 |        0 | False    |
| flipD_16  | persS     |  1.169 |   0.684 |  -2.362 |    0.028 |     0.581 |     -0.004 |   -0.007 |   -0.001 |  0.242 |        0 | False    |
| flipD_16  | ageS      | -0.214 |   1.536 |  -2.16  |    0.062 |     0.976 |     -0.008 |   -0.013 |   -0.003 |  0.831 |        0 | False    |
| flipD_16  | divS      | -0.294 |   0.375 |  -0.129 |          |           |      0     |   -0     |    0     |  0.769 |        0 | False    |
| flipD_16  | COMBINED  |        |         |         |          |           |     -0.015 |   -0.023 |   -0.008 |        |      nan | False    |
| flipU_32  | dirF      | -0.277 |   0.187 |   0.12  |          |           |      0     |   -0     |    0     |  0.781 |        0 | False    |
| flipU_32  | turnF     | -0.768 |   0.282 |  -0.98  |          |           |      0     |   -0     |    0.001 |  0.442 |        0 | False    |
| flipU_32  | magS      |  0.137 |   0.299 |   0.328 |   -0.072 |    -1.283 |     -0     |   -0.001 |    0     |  0.891 |        0 | False    |
| flipU_32  | speed     | -0.528 |   0.405 |   0.711 |   -0.056 |    -1.522 |     -0     |   -0.001 |    0     |  0.598 |        0 | False    |
| flipU_32  | slope     |  0.74  |   0.139 |  -0.214 |   -0.074 |    -1.094 |     -0.001 |   -0.004 |    0.002 |  0.46  |        0 | False    |
| flipU_32  | persS     |  0.958 |  -0.585 |  -2.963 |   -0.03  |    -0.617 |     -0.001 |   -0.002 |   -0.001 |  0.338 |        0 | False    |
| flipU_32  | ageS      | -0.1   |  -0.01  |   0.24  |   -0.037 |    -0.653 |      0     |   -0     |    0     |  0.92  |        0 | False    |
| flipU_32  | divS      | -0.027 |   1.354 |   0.547 |          |           |      0     |   -0.001 |    0.001 |  0.978 |        0 | False    |
| flipU_32  | COMBINED  |        |         |         |          |           |     -0.003 |   -0.007 |    0.002 |        |      nan | False    |
| flipD_32  | dirF      | -0.351 |   1.666 |  -1.396 |          |           |     -0.002 |   -0.005 |    0     |  0.726 |        0 | False    |
| flipD_32  | turnF     | -1.538 |   1.802 |  -0.696 |          |           |      0     |   -0     |    0     |  0.124 |        0 | False    |
| flipD_32  | magS      |  0.438 |   0.617 |  -1.503 |    0.191 |     3.29  |     -0.002 |   -0.004 |   -0     |  0.662 |        0 | False    |
| flipD_32  | speed     | -0.696 |   1.201 |  -1.351 |    0.079 |     2.295 |      0     |   -0     |    0.001 |  0.487 |        0 | False    |
| flipD_32  | slope     |  1.521 |   1.509 |  -2.039 |    0.043 |     0.696 |     -0.014 |   -0.03  |   -0.002 |  0.128 |        0 | False    |
| flipD_32  | persS     |  1.446 |   0.373 |  -0.666 |    0.111 |     2.349 |     -0.001 |   -0.003 |    0.001 |  0.148 |        0 | False    |
| flipD_32  | ageS      |  0.192 |   1.085 |  -1.324 |    0.17  |     2.748 |     -0.003 |   -0.007 |    0     |  0.848 |        0 | False    |
| flipD_32  | divS      |  0.182 |   0.489 |  -1.516 |          |           |     -0     |   -0.001 |   -0     |  0.855 |        0 | False    |
| flipD_32  | COMBINED  |        |         |         |          |           |     -0.019 |   -0.038 |   -0.003 |        |      nan | False    |
| vol_chg   | aturn     |  0.166 |  -0.912 |   0.166 |          |           |     -0     |   -0.001 |    0.001 |  0.868 |        0 | False    |
| vol_chg   | mag       | -0.149 |  -0.97  |  -0.756 |   -0.056 |    -1.228 |      0     |   -0.001 |    0.001 |  0.882 |        0 | False    |
| vol_chg   | aspeed    |  1.125 |   0.329 |   1.495 |   -0.037 |    -1.59  |      0     |   -0.001 |    0.001 |  0.261 |        0 | False    |
| vol_chg   | aslope    | -1.268 |  -1.695 |  -2.023 |   -0.203 |    -4.304 |      0.002 |   -0.002 |    0.006 |  0.205 |        0 | False    |
| vol_chg   | pers      | -1.035 |   0.041 |   0.926 |   -0.034 |    -0.763 |     -0.001 |   -0.002 |    0     |  0.301 |        0 | False    |
| vol_chg   | age       |  0.048 |   0.233 |  -0.792 |    0.071 |     1.725 |      0     |   -0     |    0     |  0.962 |        0 | False    |
| vol_chg   | var       | -0.546 |  -0.482 |  -0.916 |   -0.176 |    -4.023 |      0     |   -0     |    0.001 |  0.585 |        0 | False    |
| vol_chg   | calm      |  0.998 |   2.146 |  -0.874 |          |           |     -0.002 |   -0.005 |    0.001 |  0.318 |        0 | False    |
| vol_chg   | adiv      | -0.736 |   0.895 |   1.012 |          |           |     -0     |   -0     |    0     |  0.462 |        0 | False    |
| vol_chg   | COMBINED  |        |         |         |          |           |      0.001 |   -0.005 |    0.007 |        |      nan | False    |
| vol_abs8  | aturn     |  1.593 |   0.771 |   0.391 |          |           |     -0.001 |   -0.004 |    0.003 |  0.111 |        0 | False    |
| vol_abs8  | mag       |  0.729 |  -0.311 |  -0.169 |   -0.021 |    -0.522 |     -0     |   -0     |    0     |  0.466 |        0 | False    |
| vol_abs8  | aspeed    |  2.522 |   1.743 |   1.45  |    0.029 |     1.025 |      0.001 |   -0.002 |    0.004 |  0.012 |        0 | False    |
| vol_abs8  | aslope    |  1.24  |  -0.861 |  -0.593 |   -0.021 |    -0.554 |     -0     |   -0.001 |    0     |  0.215 |        0 | False    |
| vol_abs8  | pers      | -0.421 |   0.281 |   0.237 |    0.015 |     0.407 |     -0     |   -0     |    0     |  0.674 |        0 | False    |
| vol_abs8  | age       | -1.274 |  -0.885 |   0.621 |   -0.005 |    -0.134 |     -0.001 |   -0.005 |    0.002 |  0.203 |        0 | False    |
| vol_abs8  | var       | -0.69  |   1.199 |  -1.343 |   -0.067 |    -1.618 |     -0     |   -0.001 |    0     |  0.49  |        0 | False    |
| vol_abs8  | calm      |  0.861 |   0.828 |  -1.52  |   -0.054 |    -1.538 |     -0.001 |   -0.003 |    0.001 |  0.389 |        0 | False    |
| vol_abs8  | adiv      |  1.08  |  -0.531 |   0.144 |          |           |     -0     |   -0.001 |    0.001 |  0.28  |        0 | False    |
| vol_abs8  | COMBINED  |        |         |         |          |           |     -0.002 |   -0.007 |    0.004 |        |      nan | False    |

## Cells that pass every registered gate

_none_

## Economic significance (net of round-trip cost; 0.5 / 1.0 / 2.0 bp of price)

| strategy                                                                   | half   |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------------------------------------------------------------------------|:-------|-----:|------------:|----------:|----------:|---------:|---------:|
| trade every confirmed line turn in its direction (2 h)                     | VAL    |  914 |     -0.0058 |       0.5 |   -0.0108 |  -0.0372 |   0.0131 |
| trade every confirmed line turn in its direction (2 h)                     | VAL    |  914 |     -0.0058 |       1   |   -0.0158 |  -0.0422 |   0.0081 |
| trade every confirmed line turn in its direction (2 h)                     | VAL    |  914 |     -0.0058 |       2   |   -0.0258 |  -0.0522 |  -0.0019 |
| trade every confirmed line turn in its direction (2 h)                     | OOS    |  970 |      0.0225 |       0.5 |    0.0175 |  -0.0029 |   0.0405 |
| trade every confirmed line turn in its direction (2 h)                     | OOS    |  970 |      0.0225 |       1   |    0.0125 |  -0.0079 |   0.0355 |
| trade every confirmed line turn in its direction (2 h)                     | OOS    |  970 |      0.0225 |       2   |    0.0025 |  -0.0179 |   0.0255 |
| trade every confirmed line turn in its direction (2 h)                     | ALL    | 3015 |      0.005  |       0.5 |    0      |  -0.0136 |   0.0135 |
| trade every confirmed line turn in its direction (2 h)                     | ALL    | 3015 |      0.005  |       1   |   -0.005  |  -0.0186 |   0.0085 |
| trade every confirmed line turn in its direction (2 h)                     | ALL    | 3015 |      0.005  |       2   |   -0.015  |  -0.0286 |  -0.0015 |
| OOS top 5% of |combined-model increment| (2 h, direction of the increment) | OOS    |  153 |      0.0898 |       0.5 |    0.0848 |  -0.0763 |   0.2526 |
| OOS top 5% of |combined-model increment| (2 h, direction of the increment) | OOS    |  153 |      0.0898 |       1   |    0.0798 |  -0.0813 |   0.2476 |
| OOS top 5% of |combined-model increment| (2 h, direction of the increment) | OOS    |  153 |      0.0898 |       2   |    0.0698 |  -0.0913 |   0.2376 |

## Video week, every confirmed line turn with its features and 2 h outcome (descriptive, not used for any statistic)

| extreme          | confirm          |   d |   mag_bp |   slope |   speed |   persistence |    var |   nasdaq_state |   ret_2h | result     |
|:-----------------|:-----------------|----:|---------:|--------:|--------:|--------------:|-------:|---------------:|---------:|:-----------|
| 2026-09-16 18:00 | 2026-09-16 18:45 |  -1 |     3.5  |  nan    |   -0.29 |          0.5  |   0.63 |              1 |    0.65  | favourable |
| 2026-09-16 19:30 | 2026-09-17 00:45 |   1 |     2.75 |  nan    |  nan    |        nan    | nan    |              1 |   -0.028 | neither    |
| 2026-09-17 06:30 | 2026-09-17 10:30 |  -1 |     3    |  nan    |   -0.22 |          0.33 |  -0.32 |              1 |   -0.488 | adverse    |
| 2026-09-17 10:30 | 2026-09-17 12:15 |   1 |     2.75 |  nan    |    0.07 |          0.45 |   0.26 |              1 |    0.12  | neither    |
| 2026-09-17 13:30 | 2026-09-17 17:00 |  -1 |     2.75 |    0.11 |   -0.43 |          0.44 |  -0.12 |              1 |    0.076 | neither    |
| 2026-09-18 15:15 | 2026-09-18 17:15 |   1 |     3    |   -0.43 |    0.44 |          0.5  |   0.37 |             -1 |    0.292 | favourable |
| 2026-09-21 16:15 | 2026-09-22 00:15 |  -1 |     3    |  nan    |  nan    |        nan    | nan    |              1 |   -0.007 | neither    |
| 2026-09-22 06:15 | 2026-09-22 08:45 |   1 |     3.5  |  nan    |    0.67 |          0.67 |   0.39 |             -1 |    0.215 | neither    |
| 2026-09-22 11:45 | 2026-09-22 14:45 |  -1 |     3    |  nan    |   -0.52 |          0.46 |   0.32 |              1 |   -0.018 | neither    |
| 2026-09-22 16:30 | 2026-09-22 18:00 |   1 |     3.5  |  nan    |    0.74 |          0.64 |   0.34 |              1 |    0.211 | neither    |
| 2026-09-23 04:15 | 2026-09-23 07:00 |  -1 |     3.25 |  nan    |   -0.73 |          0.5  |   0.02 |              1 |    0.083 | neither    |
| 2026-09-23 17:00 | 2026-09-23 17:45 |   1 |     3    |  nan    |   -0.22 |          0.5  |   0.71 |             -1 |   -0.002 | neither    |

Figure: `event_features_video_week.png`. Event-level table (every k, with extreme time, confirm time and the information at confirmation): `event_features_events.csv`; every cell: `event_features_cells.csv`.

## Limits
- Only the pinned pair has deep history: contract-month robustness is not testable; the Dec-2026 roll is the first chance to test a second contract set forward.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Costs are assumptions (1.0 bp round trip is for liquid index futures), not measured fills.
- Logit/OLS are linear baselines; no nonlinear model was fitted and none is justified before a linear signal exists.