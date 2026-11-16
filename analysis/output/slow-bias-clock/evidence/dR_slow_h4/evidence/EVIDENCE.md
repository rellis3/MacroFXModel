# Evidence pack: slow-bias-clock:dR_slow_h4

Unit: R per entry (risk-weighted). Useful bar: +0.05. 31735 scored rows, 2495 independent clusters, 13 instruments, 2016-11-21 → 2026-08-21. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 69% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** -0.002479 [-0.01976, +0.01502]. Shuffled-signal 95% band [-0.0004959, +0.01525]; the real estimate sits at the 2th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 90% | +0.02252 |
| 1.0× bar (+0.05) | 100% | +0.04752 |
| 2.0× bar (+0.1) | 100% | +0.09752 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.666 (clean -0.002479). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 2493 | +0.02733 | [-0.00702, +0.06951] |
| EURJPY | 2493 | -0.004302 | [-0.04165, +0.03311] |
| EURUSD | 2493 | -0.03242 | [-0.07266, +0.01178] |
| GBPJPY | 2493 | -0.01679 | [-0.04831, +0.01693] |
| GBPUSD | 2493 | -0.02731 | [-0.06757, +0.0122] |
| GOLD | 2336 | -0.009257 | [-0.04582, +0.02826] |
| NAS100 | 2394 | +0.02742 | [-0.01762, +0.06552] |
| NZDUSD | 2493 | -0.007643 | [-0.04198, +0.02962] |
| SPX500 | 2395 | +0.04039 | [-0.001124, +0.08586] |
| US30 | 2170 | +0.02501 | [-0.01446, +0.06771] |
| USDCAD | 2494 | -0.01338 | [-0.06978, +0.03412] |
| USDCHF | 2493 | -0.04074 | [-0.0876, -0.001461] |
| USDJPY | 2495 | -0.004886 | [-0.04764, +0.03265] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2016 | 343 | +0.01345 | [-0.1188, +0.1352] |
| 2017 | 3092 | +0.01552 | [-0.04122, +0.06714] |
| 2018 | 3291 | -0.02173 | [-0.08902, +0.03452] |
| 2019 | 3282 | -0.007866 | [-0.06118, +0.04367] |
| 2020 | 3276 | -0.04358 | [-0.1037, +0.01544] |
| 2021 | 3305 | +0.003644 | [-0.05797, +0.06783] |
| 2022 | 3267 | +0.0009373 | [-0.08276, +0.07908] |
| 2023 | 3273 | -0.0002635 | [-0.04971, +0.05637] |
| 2024 | 3269 | +0.001769 | [-0.04925, +0.06304] |
| 2025 | 3254 | -0.002946 | [-0.04914, +0.0502] |
| 2026 | 2083 | +0.04816 | [-0.03125, +0.1208] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 15873 | -0.009328 | [-0.03798, +0.01912] |
| H2 | 15862 | +0.004305 | [-0.02216, +0.03353] |

Without the largest 1% of rows: +0.003299.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 3174 | -0.00799 | [-0.04089, +0.02491] |
| D2 | 3173 | -0.0188 | [-0.05373, +0.01612] |
| D3 | 3174 | -0.05164 | [-0.08919, -0.01408] |
| D4 | 3173 | -0.01469 | [-0.0547, +0.02531] |
| D5 | 3174 | +0.01749 | [-0.02158, +0.05656] |
| D6 | 3173 | +0.01231 | [-0.02521, +0.04983] |
| D7 | 3173 | +0.007938 | [-0.02893, +0.04481] |
| D8 | 3174 | +0.03755 | [+0.001182, +0.07391] |
| D9 | 3173 | +0.01481 | [-0.021, +0.05063] |
| D10 | 3174 | +0.005852 | [-0.0266, +0.0383] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Benchmark: 4h EMA20 slope side. Plant: the market drifts by e R in the slow side direction on every entry, e = effect/(1 - agreement +0.196), so the difference rises by the planted amount. Leak: the side is the sign of the same session move.
