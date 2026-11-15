# Evidence pack: h4-trend-hold:HOLD

Unit: R per trade (net of 0.03 R). Useful bar: +0.05. 16719 scored rows, 2659 independent clusters, 13 instruments, 2016-01-27 → 2026-08-20. Prereg verdict: **EXPLORATORY (no verdict word)**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 54% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** +0.01035 [-0.02823, +0.04656]. Shuffled-signal 95% band [-0.05066, -0.003077]; the real estimate sits at the 100th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 43% | +0.03535 |
| 1.0× bar (+0.05) | 100% | +0.06035 |
| 2.0× bar (+0.1) | 100% | +0.1103 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1.156 (clean +0.01035). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1295 | -0.008951 | [-0.09019, +0.06811] |
| EURJPY | 1294 | +0.01655 | [-0.07979, +0.08782] |
| EURUSD | 1282 | +0.02624 | [-0.06129, +0.1029] |
| GBPJPY | 1274 | +0.01525 | [-0.06475, +0.09233] |
| GBPUSD | 1341 | -0.02131 | [-0.1116, +0.05744] |
| GOLD | 1267 | +0.1027 | [-0.002532, +0.1867] |
| NAS100 | 1265 | +0.002198 | [-0.07512, +0.08482] |
| NZDUSD | 1276 | +0.006478 | [-0.07703, +0.0969] |
| SPX500 | 1268 | -0.0005643 | [-0.08879, +0.07859] |
| US30 | 1285 | -0.002547 | [-0.08184, +0.08583] |
| USDCAD | 1262 | -0.02452 | [-0.1168, +0.06243] |
| USDCHF | 1348 | -0.01297 | [-0.1066, +0.08226] |
| USDJPY | 1262 | +0.03953 | [-0.04356, +0.1279] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2016 | 1442 | +0.007795 | [-0.09228, +0.1418] |
| 2017 | 1551 | -0.001369 | [-0.1117, +0.1078] |
| 2018 | 1596 | +0.02771 | [-0.1036, +0.1219] |
| 2019 | 1552 | +0.04522 | [-0.06046, +0.1554] |
| 2020 | 1541 | +0.1216 | [-0.02162, +0.305] |
| 2021 | 1630 | -0.06416 | [-0.1745, +0.06563] |
| 2022 | 1585 | -0.01185 | [-0.1419, +0.1228] |
| 2023 | 1610 | -0.01763 | [-0.1344, +0.09383] |
| 2024 | 1566 | +0.04683 | [-0.07231, +0.1707] |
| 2025 | 1560 | +0.01879 | [-0.08097, +0.1253] |
| 2026 | 1086 | -0.08188 | [-0.1917, +0.04412] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 8364 | +0.02768 | [-0.02027, +0.08917] |
| H2 | 8355 | -0.00701 | [-0.06242, +0.04907] |

Without the largest 1% of rows: -0.06886.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1 | 8059 | -0.001128 | [-0.03714, +0.03489] |
| 1 | 8660 | +0.07684 | [+0.04265, +0.111] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

DATA DIFFERS FROM THE STUDY: local M1 mid resampled to H1, 2016-01-04 -> 2026-08-21, 13 instruments; the study used dashboard OANDA H1 2026-02-26 -> 2026-11-12. The rule is the study's own simulate(). Bar +0.05 R borrowed from exit-on-fixed-entries (the study had none). Max |chosen-side R - simulate() R| = 0.00e+00. HOLD: opposite-side R approximated as -(R+cost)-cost (wrong for stopped trades), so the HOLD placebo is approximate. Buckets: (R_long - R_short)/2 by slope state; a working trend read would put the long-slope bucket above zero and the short-slope bucket below.
