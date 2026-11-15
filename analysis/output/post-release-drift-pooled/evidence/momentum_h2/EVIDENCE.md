# Evidence pack: post-release-drift-pooled:momentum_h2

Unit: daily sigma. Useful bar: +0.1. 2028 scored rows, 360 independent clusters, 5 instruments, 2010-11-03 → 2026-08-13. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 80% |
| survives top1pct removed | True |
| survives costs | False |

**Headline:** -0.03143 [-0.07985, +0.01678]. Shuffled-signal 95% band [-0.03522, +0.03391]; the real estimate sits at the 5th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.05) | 0% | +0.01857 |
| 1.0× bar (+0.1) | 100% | +0.06857 |
| 2.0× bar (+0.2) | 100% | +0.1686 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.5955 (clean -0.03143). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| eurusd | 374 | -0.02485 | [-0.108, +0.04417] |
| gbpusd | 374 | +0.02285 | [-0.04452, +0.09664] |
| gold | 366 | -0.004379 | [-0.07722, +0.07605] |
| nq | 542 | -0.115 | [-0.1877, -0.0356] |
| usdjpy | 372 | -0.02917 | [-0.08634, +0.02405] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2014 | 33 | -0.2889 | [-0.619, +0.03257] |
| 2015 | 36 | -0.1916 | [-0.4537, +0.09459] |
| 2016 | 35 | +0.0006364 | [-0.2198, +0.2275] |
| 2017 | 173 | +0.07606 | [-0.06291, +0.1943] |
| 2018 | 175 | -0.08825 | [-0.2136, +0.04954] |
| 2019 | 200 | -0.1572 | [-0.2848, -0.04557] |
| 2020 | 191 | +0.03469 | [-0.08329, +0.164] |
| 2021 | 198 | +0.03474 | [-0.1104, +0.1491] |
| 2022 | 212 | -0.1542 | [-0.2629, -0.02214] |
| 2023 | 193 | +0.07398 | [-0.08944, +0.2948] |
| 2024 | 194 | -0.1025 | [-0.3359, +0.08983] |
| 2025 | 189 | -0.01319 | [-0.155, +0.09336] |
| 2026 | 127 | +0.01767 | [-0.1502, +0.165] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 1018 | -0.01379 | [-0.07886, +0.04457] |
| H2 | 1010 | -0.04614 | [-0.1118, +0.02435] |

Without the largest 1% of rows: -0.0232.
Net of costs: -0.03314.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 203 | +0.06556 | [-0.07635, +0.2075] |
| D2 | 203 | +0.04205 | [-0.0601, +0.1442] |
| D3 | 203 | +0.0813 | [-0.01179, +0.1744] |
| D4 | 202 | +0.0317 | [-0.0775, +0.1409] |
| D5 | 203 | +0.001723 | [-0.1055, +0.109] |
| D6 | 203 | -0.04949 | [-0.1538, +0.05484] |
| D7 | 202 | -0.1534 | [-0.2511, -0.05573] |
| D8 | 203 | +0.03328 | [-0.0648, +0.1313] |
| D9 | 203 | -0.03934 | [-0.1487, +0.07] |
| D10 | 203 | +0.04836 | [-0.0721, +0.1688] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows rebuilt from the study's saved rows.parquet via its own y_cols(); headline recomputed here as the event-weighted mean (>= 3 instruments). Halves split at the median row date (the prereg split was 2018-01-01). Cost converted from R at the 0.5 sigma stop (x0.5). The placebo here shuffles each instrument's side across dates; the study's own placebo used random non-release times.
