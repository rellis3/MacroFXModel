# Evidence pack: regime-picks-rule forced-hmm (post-hoc, descriptive)

Unit: R per instrument-session. Useful bar: +0.04. 20163 scored rows, 74 independent clusters, 13 instruments, 2020-08-24 → 2026-08-20. Prereg verdict: **descriptive (A1)**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 85% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.06261 [-0.09079, -0.0356]. Shuffled-signal 95% band [-0.06261, -0.06261]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.02) | 0% | -0.04261 |
| 1.0× bar (+0.04) | 0% | -0.02261 |
| 2.0× bar (+0.08) | 0% | +0.01739 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes -0.0002773 (clean -0.06261). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1554 | -0.09358 | [-0.1383, -0.04171] |
| EURJPY | 1553 | -0.05899 | [-0.1148, -0.008109] |
| EURUSD | 1554 | -0.08346 | [-0.1571, -0.01729] |
| GBPJPY | 1554 | -0.02881 | [-0.08851, +0.04753] |
| GBPUSD | 1554 | -0.0884 | [-0.1491, -0.01407] |
| GOLD | 1546 | -0.03269 | [-0.0976, +0.03296] |
| NQ | 1544 | +0.03256 | [-0.08949, +0.1441] |
| NZDUSD | 1554 | -0.1256 | [-0.1733, -0.07934] |
| SPX500 | 1544 | -0.02189 | [-0.08004, +0.03212] |
| US30 | 1544 | +0.000526 | [-0.07601, +0.06158] |
| USDCAD | 1554 | -0.1186 | [-0.1776, -0.0629] |
| USDCHF | 1554 | -0.1295 | [-0.2113, -0.04333] |
| USDJPY | 1554 | -0.06403 | [-0.1067, -0.0005692] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2020 | 1209 | -0.0902 | [-0.2234, +0.01015] |
| 2021 | 3371 | -0.08773 | [-0.1345, -0.04089] |
| 2022 | 3350 | -0.02722 | [-0.1051, +0.0739] |
| 2023 | 3359 | -0.08734 | [-0.2035, +0.026] |
| 2024 | 3376 | -0.05862 | [-0.1017, -0.01655] |
| 2025 | 3357 | -0.05314 | [-0.07911, -0.0159] |
| 2026 | 2141 | -0.04516 | [-0.09042, -0.01102] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 10093 | -0.05218 | [-0.09998, -0.01371] |
| H2 | 10070 | -0.07306 | [-0.1148, -0.04565] |

Without the largest 1% of rows: -0.1437.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| HIGH | 3758 | -0.07072 | [-0.1273, -0.01413] |
| LOW | 12408 | -0.07102 | [-0.09335, -0.04869] |
| MID | 3997 | -0.02885 | [-0.0551, -0.002598] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

POST-HOC (amendment A1). The forced picker takes the best training-mean rule per regime at each quarterly refit even when that mean is negative. Not scored.
