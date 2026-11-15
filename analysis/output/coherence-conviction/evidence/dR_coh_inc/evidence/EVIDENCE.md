# Evidence pack: coherence-conviction:dR_coh_inc

Unit: R per entry (4h lean). Useful bar: +0.05. 30571 scored rows, 2385 independent clusters, 13 instruments, 2016-11-21 → 2026-08-21. Prereg verdict: **—**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 46% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** +0.001425 [-0.0368, +0.03931]. Shuffled-signal 95% band [-0.02269, +0.02255]; the real estimate sits at the 56th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 0% | +0.02642 |
| 1.0× bar (+0.05) | 100% | +0.05142 |
| 2.0× bar (+0.1) | 100% | +0.1014 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1.386 (clean +0.001425). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 2383 | +0.06206 | [-0.01292, +0.1326] |
| EURJPY | 2383 | -0.03336 | [-0.1234, +0.05253] |
| EURUSD | 2383 | +0.06233 | [-0.02107, +0.1348] |
| GBPJPY | 2383 | -0.03465 | [-0.1166, +0.04215] |
| GBPUSD | 2383 | -0.01896 | [-0.1153, +0.04791] |
| GOLD | 2236 | +0.02406 | [-0.06639, +0.1123] |
| NAS100 | 2294 | -0.1039 | [-0.1965, -0.02993] |
| NZDUSD | 2383 | +0.09122 | [+0.02242, +0.1718] |
| SPX500 | 2295 | -0.06972 | [-0.1605, +0.02785] |
| US30 | 2296 | -0.07413 | [-0.1617, +0.01358] |
| USDCAD | 2384 | +0.05726 | [-0.03727, +0.1362] |
| USDCHF | 2383 | +0.05564 | [-0.03929, +0.1438] |
| USDJPY | 2385 | -0.007829 | [-0.08951, +0.07282] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2016 | 348 | -0.3909 | [-0.6639, -0.1453] |
| 2017 | 3165 | +0.01941 | [-0.07905, +0.1124] |
| 2018 | 3139 | -0.09146 | [-0.189, +0.03418] |
| 2019 | 3143 | +0.05493 | [-0.06065, +0.1615] |
| 2020 | 3137 | +0.06873 | [-0.05984, +0.1936] |
| 2021 | 3166 | +0.0171 | [-0.1196, +0.1427] |
| 2022 | 3128 | +0.135 | [-0.01077, +0.2909] |
| 2023 | 3134 | -0.02633 | [-0.1322, +0.1118] |
| 2024 | 3117 | +0.03925 | [-0.06401, +0.1611] |
| 2025 | 3102 | -0.105 | [-0.2168, +0.01787] |
| 2026 | 1992 | -0.009981 | [-0.1858, +0.1789] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 15287 | +0.002533 | [-0.04312, +0.0509] |
| H2 | 15284 | +7.826e-05 | [-0.06257, +0.06414] |

Without the largest 1% of rows: -0.001949.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1.0 | 11305 | -0.03129 | [-0.0472, -0.01537] |
| 0.0 | 10280 | -0.0252 | [-0.04197, -0.00842] |
| 1.0 | 8986 | -0.02986 | [-0.04755, -0.01218] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = every labelled entry of the 4h lean; signal = +1 on COH rows, -1 on INC rows (else 0); estimate = mean outcome on COH rows minus mean on INC days. Placebo shuffles the label across dates within instrument (outcome fixed). Plant: a lift of the planted size on the +1 rows. Leak: label = sign of the scored outcome. "side" mirrors the label so the pack shuffles the label only; the lean side is in column "lean".
