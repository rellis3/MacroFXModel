# Evidence pack: slow-bias-clock:dR_slow_long

Unit: R per entry (risk-weighted). Useful bar: +0.05. 31735 scored rows, 2495 independent clusters, 13 instruments, 2016-11-21 → 2026-08-21. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 77% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.01616 [-0.03362, +0.001983]. Shuffled-signal 95% band [-0.01339, +0.002979]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 0% | +0.008838 |
| 1.0× bar (+0.05) | 100% | +0.03384 |
| 2.0× bar (+0.1) | 100% | +0.08384 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.6523 (clean -0.01616). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 2493 | +0.01968 | [-0.01671, +0.07009] |
| EURJPY | 2493 | -0.01894 | [-0.04929, +0.01928] |
| EURUSD | 2493 | -0.01506 | [-0.0619, +0.04467] |
| GBPJPY | 2493 | -0.03488 | [-0.06158, -0.003021] |
| GBPUSD | 2493 | -0.02401 | [-0.07407, +0.01622] |
| GOLD | 2336 | +0.002981 | [-0.03415, +0.03541] |
| NAS100 | 2394 | -0.0152 | [-0.04374, +0.01261] |
| NZDUSD | 2493 | +0.000106 | [-0.04659, +0.0479] |
| SPX500 | 2395 | -0.009614 | [-0.03684, +0.02211] |
| US30 | 2170 | -0.02069 | [-0.05625, +0.01228] |
| USDCAD | 2494 | -0.04109 | [-0.07655, -0.0001052] |
| USDCHF | 2493 | -0.02984 | [-0.06925, +0.002663] |
| USDJPY | 2495 | -0.03298 | [-0.05809, -0.01048] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2016 | 343 | +0.05757 | [-0.0669, +0.1701] |
| 2017 | 3092 | -0.03298 | [-0.07528, -0.003626] |
| 2018 | 3291 | +0.02393 | [-0.04729, +0.07517] |
| 2019 | 3282 | -0.005729 | [-0.0747, +0.05631] |
| 2020 | 3276 | -0.02508 | [-0.07621, +0.03051] |
| 2021 | 3305 | -0.03018 | [-0.07387, +0.0192] |
| 2022 | 3267 | +0.005602 | [-0.0772, +0.1005] |
| 2023 | 3273 | -0.02034 | [-0.06994, +0.02695] |
| 2024 | 3269 | -0.01879 | [-0.05619, +0.02263] |
| 2025 | 3254 | -0.02945 | [-0.06842, +0.0151] |
| 2026 | 2083 | -0.04864 | [-0.09605, -0.002684] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 15873 | -0.01134 | [-0.03844, +0.01408] |
| H2 | 15862 | -0.02106 | [-0.04999, +0.006414] |

Without the largest 1% of rows: -0.0159.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 3174 | -0.03708 | [-0.0964, +0.02225] |
| D2 | 3173 | +0.009546 | [-0.04566, +0.06475] |
| D3 | 3174 | -0.07856 | [-0.1349, -0.02221] |
| D4 | 3173 | -0.0279 | [-0.06594, +0.01014] |
| D5 | 3174 | +0 | [+0, +0] |
| D6 | 3173 | +0 | [+0, +0] |
| D7 | 3173 | +0 | [+0, +0] |
| D8 | 3174 | +0 | [+0, +0] |
| D9 | 3173 | +0 | [+0, +0] |
| D10 | 3174 | +0 | [+0, +0] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Benchmark: always long. Plant: the market drifts by e R in the slow side direction on every entry, e = effect/(1 - agreement +0.308), so the difference rises by the planted amount. Leak: the side is the sign of the same session move.
