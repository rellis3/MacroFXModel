# Evidence pack: post-release-drift-pooled:drift_h2

Unit: daily sigma. Useful bar: +0.1. 2034 scored rows, 362 independent clusters, 5 instruments, 2010-11-03 → 2026-08-13. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | False |

**Headline:** -0.04913 [-0.1087, +0.01114]. Shuffled-signal 95% band [-0.0326, +0.03574]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.05) | 0% | +0.0008669 |
| 1.0× bar (+0.1) | 12% | +0.05087 |
| 2.0× bar (+0.2) | 100% | +0.1509 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.5951 (clean -0.04913). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| eurusd | 374 | -0.04273 | [-0.1171, +0.042] |
| gbpusd | 374 | -0.03585 | [-0.1105, +0.03412] |
| gold | 367 | -0.03935 | [-0.1174, +0.03875] |
| nq | 545 | -0.04563 | [-0.1171, +0.03125] |
| usdjpy | 374 | -0.02132 | [-0.0853, +0.03939] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2014 | 34 | +0.08468 | [-0.1888, +0.4023] |
| 2015 | 36 | +0.08955 | [-0.2567, +0.4325] |
| 2016 | 35 | -0.07555 | [-0.32, +0.204] |
| 2017 | 173 | +0.03916 | [-0.08218, +0.1686] |
| 2018 | 175 | -0.04787 | [-0.2405, +0.11] |
| 2019 | 200 | -0.05131 | [-0.2121, +0.1274] |
| 2020 | 192 | +0.02166 | [-0.08586, +0.1293] |
| 2021 | 198 | -0.05193 | [-0.204, +0.1076] |
| 2022 | 212 | -0.3061 | [-0.4836, -0.1089] |
| 2023 | 193 | +0.07282 | [-0.1166, +0.2859] |
| 2024 | 195 | -0.04396 | [-0.311, +0.1712] |
| 2025 | 189 | -0.014 | [-0.1808, +0.1741] |
| 2026 | 128 | -0.08526 | [-0.2592, +0.0594] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 1022 | -0.009879 | [-0.07714, +0.07983] |
| H2 | 1012 | -0.08184 | [-0.1791, +0.01131] |

Without the largest 1% of rows: -0.04746.
Net of costs: -0.04877.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 204 | -0.01622 | [-0.1239, +0.09143] |
| D2 | 203 | +0.1292 | [+0.007637, +0.2507] |
| D3 | 203 | +0.0302 | [-0.07406, +0.1345] |
| D4 | 204 | +0.01913 | [-0.08026, +0.1185] |
| D5 | 203 | +0.08188 | [-0.04697, +0.2107] |
| D6 | 203 | -0.117 | [-0.219, -0.01489] |
| D7 | 204 | -0.04185 | [-0.1366, +0.05287] |
| D8 | 203 | +0.02642 | [-0.08341, +0.1362] |
| D9 | 203 | +0.006865 | [-0.1074, +0.1211] |
| D10 | 204 | -0.05031 | [-0.1535, +0.05289] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows rebuilt from the study's saved rows.parquet via its own y_cols(); headline recomputed here as the event-weighted mean (>= 3 instruments). Halves split at the median row date (the prereg split was 2018-01-01). Cost converted from R at the 0.5 sigma stop (x0.5). The placebo here shuffles each instrument's side across dates; the study's own placebo used random non-release times.
