# Evidence pack: h4-trend-hold:DAY

Unit: R per trade (net of 0.03 R). Useful bar: +0.05. 35545 scored rows, 2739 independent clusters, 13 instruments, 2016-01-27 → 2026-08-20. Prereg verdict: **EXPLORATORY (no verdict word)**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 85% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.01533 [-0.03216, +0.003245]. Shuffled-signal 95% band [-0.02962, -0.008601]; the real estimate sits at the 75th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 0% | +0.009672 |
| 1.0× bar (+0.05) | 100% | +0.03467 |
| 2.0× bar (+0.1) | 100% | +0.08467 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.7329 (clean -0.01533). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 2739 | -0.03943 | [-0.07545, -0.00774] |
| EURJPY | 2739 | -0.02414 | [-0.06198, +0.008946] |
| EURUSD | 2739 | -0.01161 | [-0.04719, +0.02399] |
| GBPJPY | 2739 | -0.003764 | [-0.0392, +0.04095] |
| GBPUSD | 2739 | -0.02508 | [-0.06545, +0.01694] |
| GOLD | 2725 | +0.01407 | [-0.02449, +0.05191] |
| NAS100 | 2723 | +0.001884 | [-0.03392, +0.03532] |
| NZDUSD | 2739 | -0.02815 | [-0.05688, -0.0007898] |
| SPX500 | 2723 | -0.02198 | [-0.06239, +0.01194] |
| US30 | 2723 | -0.02166 | [-0.0537, +0.01575] |
| USDCAD | 2739 | -0.02157 | [-0.06462, +0.007522] |
| USDCHF | 2739 | -0.01428 | [-0.04917, +0.02625] |
| USDJPY | 2739 | -0.00338 | [-0.0389, +0.0304] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2016 | 3138 | +0.00566 | [-0.0518, +0.06351] |
| 2017 | 3350 | -0.0515 | [-0.0998, -0.001561] |
| 2018 | 3363 | -0.009153 | [-0.06751, +0.03944] |
| 2019 | 3363 | +0.004617 | [-0.04312, +0.04847] |
| 2020 | 3364 | +0.01664 | [-0.04228, +0.08416] |
| 2021 | 3375 | -0.04765 | [-0.09593, +0.01156] |
| 2022 | 3350 | -0.02638 | [-0.09053, +0.0275] |
| 2023 | 3362 | -0.01299 | [-0.07409, +0.04374] |
| 2024 | 3376 | -0.02688 | [-0.07032, +0.02246] |
| 2025 | 3360 | +0.004116 | [-0.04976, +0.06299] |
| 2026 | 2144 | -0.02844 | [-0.08825, +0.03856] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 17773 | -0.01084 | [-0.03217, +0.01173] |
| H2 | 17772 | -0.01981 | [-0.04022, +0.003514] |

Without the largest 1% of rows: -0.03115.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1 | 16369 | +0.008396 | [-0.006096, +0.02289] |
| 1 | 19176 | +0.0184 | [+0.005631, +0.03117] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

DATA DIFFERS FROM THE STUDY: local M1 mid resampled to H1, 2016-01-04 -> 2026-08-21, 13 instruments; the study used dashboard OANDA H1 2026-02-26 -> 2026-11-12. The rule is the study's own simulate(). Bar +0.05 R borrowed from exit-on-fixed-entries (the study had none). Max |chosen-side R - simulate() R| = 0.00e+00. DAY: R_long/R_short from simulate() with the slope forced, same path. Buckets: (R_long - R_short)/2 by slope state; a working trend read would put the long-slope bucket above zero and the short-slope bucket below.
