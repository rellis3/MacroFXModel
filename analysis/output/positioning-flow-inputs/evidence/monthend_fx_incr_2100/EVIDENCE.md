# Evidence pack: positioning-flow-inputs:monthend|fx|incr|21:00

Unit: Brier skill gain over the bias-learner base, as a fraction of B0 error. Useful bar: +0.00202. 2150 scored rows, 308 independent clusters, 7 instruments, 2018-01-29 → 2026-07-31. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | False |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 71% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.0008958 [-0.004001, +0.002196]. Shuffled-signal 95% band [-0.001837, +0.001132]; the real estimate sits at the 22th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.00101) | 0% | +0.0001859 |
| 1.0× bar (+0.00202) | 0% | +0.001187 |
| 2.0× bar (+0.004039) | 100% | +0.003217 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.9978 (clean -0.0008958). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 308 | +0.0004401 | [-0.003302, +0.004754] |
| EURUSD | 307 | -0.001534 | [-0.005613, +0.002546] |
| GBPUSD | 308 | -0.001888 | [-0.006314, +0.002516] |
| NZDUSD | 306 | -0.002291 | [-0.006399, +0.001392] |
| USDCAD | 307 | -0.001913 | [-0.006234, +0.002053] |
| USDCHF | 306 | -0.001344 | [-0.006456, +0.002695] |
| USDJPY | 308 | +0.002269 | [-0.001838, +0.006674] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 252 | +0.00235 | [-0.001174, +0.006029] |
| 2019 | 248 | -3.351e-06 | [-3.276e-05, +3.401e-05] |
| 2020 | 250 | +1.794e-05 | [-9.639e-05, +0.0001208] |
| 2021 | 252 | +1.497e-05 | [-4.483e-05, +7.785e-05] |
| 2022 | 245 | -6.002e-05 | [-0.0002451, +8.743e-05] |
| 2023 | 252 | -9.305e-06 | [-5.368e-05, +3.947e-05] |
| 2024 | 252 | -2.465e-05 | [-6.014e-05, +8.311e-06] |
| 2025 | 252 | +9.597e-06 | [+3.624e-06, +1.515e-05] |
| 2026 | 147 | -0.0171 | [-0.06232, +0.0198] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 1079 | +0.000533 | [-0.0006617, +0.001584] |
| H2 | 1071 | -0.002344 | [-0.008008, +0.003929] |

Without the largest 1% of rows: -0.0008704.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 215 | -0.001842 | [-0.004597, +0.0009131] |
| D2 | 215 | -6.137e-06 | [-2.414e-05, +1.187e-05] |
| D3 | 215 | +2.155e-06 | [-5.633e-06, +9.942e-06] |
| D4 | 215 | +2.521e-06 | [-1.329e-06, +6.37e-06] |
| D5 | 215 | +2.465e-06 | [+1.264e-06, +3.665e-06] |
| D6 | 215 | +7.041e-07 | [-2.403e-07, +1.648e-06] |
| D7 | 215 | +2.032e-06 | [-1.647e-06, +5.711e-06] |
| D8 | 215 | +2.647e-06 | [-4.973e-06, +1.027e-05] |
| D9 | 215 | -9.617e-06 | [-2.744e-05, +8.205e-06] |
| D10 | 215 | -0.0003981 | [-0.003147, +0.002351] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00090 [-0.00152, +0.00059] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00121. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
