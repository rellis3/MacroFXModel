# Evidence pack: coherence-conviction:dhit_coh_inc

Unit: hit rate of the 4h lean (R > 0). Useful bar: +0.05. 30571 scored rows, 2385 independent clusters, 13 instruments, 2016-11-21 → 2026-08-21. Prereg verdict: **—**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 62% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.0004153 [-0.02109, +0.02134]. Shuffled-signal 95% band [-0.01331, +0.01346]; the real estimate sits at the 46th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 100% | +0.02433 |
| 1.0× bar (+0.05) | 100% | +0.04989 |
| 2.0× bar (+0.1) | 100% | +0.09987 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.0004153). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 2383 | +0.04328 | [-0.01521, +0.08643] |
| EURJPY | 2383 | -0.00635 | [-0.05482, +0.03742] |
| EURUSD | 2383 | -0.001304 | [-0.04199, +0.05033] |
| GBPJPY | 2383 | -0.0374 | [-0.08458, +0.01192] |
| GBPUSD | 2383 | -0.0306 | [-0.07771, +0.01514] |
| GOLD | 2236 | -0.009613 | [-0.05786, +0.03633] |
| NAS100 | 2294 | -0.03889 | [-0.0891, +0.007082] |
| NZDUSD | 2383 | +0.04643 | [+0.003485, +0.09676] |
| SPX500 | 2295 | -0.009832 | [-0.05721, +0.04631] |
| US30 | 2296 | -0.04303 | [-0.09182, +0.001197] |
| USDCAD | 2384 | +0.05451 | [+0.006147, +0.1048] |
| USDCHF | 2383 | +0.01314 | [-0.03242, +0.06919] |
| USDJPY | 2385 | +0.009997 | [-0.04372, +0.0577] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2016 | 348 | -0.1977 | [-0.3788, +0] |
| 2017 | 3165 | +0.00313 | [-0.04809, +0.06466] |
| 2018 | 3139 | -0.03154 | [-0.09592, +0.02587] |
| 2019 | 3143 | +0.01606 | [-0.03439, +0.07167] |
| 2020 | 3137 | +0.01989 | [-0.05196, +0.08372] |
| 2021 | 3166 | +0.006371 | [-0.047, +0.06751] |
| 2022 | 3128 | +0.1024 | [+0.01065, +0.1752] |
| 2023 | 3134 | -0.0239 | [-0.07989, +0.03722] |
| 2024 | 3117 | +0.009986 | [-0.04713, +0.06408] |
| 2025 | 3102 | -0.05951 | [-0.1316, +0.01027] |
| 2026 | 1992 | -0.01468 | [-0.1079, +0.07175] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 15287 | -0.002157 | [-0.03052, +0.02528] |
| H2 | 15284 | +0.001478 | [-0.02762, +0.0326] |

Without the largest 1% of rows: -0.0004153.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1.0 | 11305 | +0.4598 | [+0.4506, +0.469] |
| 0.0 | 10280 | +0.4651 | [+0.4554, +0.4747] |
| 1.0 | 8986 | +0.4594 | [+0.4491, +0.4697] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = every labelled entry of the 4h lean; signal = +1 on COH rows, -1 on INC rows (else 0); estimate = mean outcome on COH rows minus mean on INC days. Placebo shuffles the label across dates within instrument (outcome fixed). Plant: a lift of the planted size on the +1 rows. Leak: label = sign of the scored outcome. "side" mirrors the label so the pack shuffles the label only; the lean side is in column "lean".
