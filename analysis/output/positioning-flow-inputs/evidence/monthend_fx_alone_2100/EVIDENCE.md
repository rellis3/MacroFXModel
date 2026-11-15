# Evidence pack: positioning-flow-inputs:monthend|fx|alone|21:00

Unit: Brier skill vs B0 (fraction). Useful bar: +0.005593. 2162 scored rows, 309 independent clusters, 7 instruments, 2018-01-29 → 2026-07-31. Prereg verdict: **NULL**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 71% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.001899 [-0.008691, +0.005051]. Shuffled-signal 95% band [-0.005481, +0.001653]; the real estimate sits at the 45th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002797) | 0% | +0.0009569 |
| 1.0× bar (+0.005593) | 0% | +0.003742 |
| 2.0× bar (+0.01119) | 100% | +0.009368 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.001899). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 309 | -0.001315 | [-0.0105, +0.008319] |
| EURUSD | 309 | -0.002389 | [-0.01235, +0.007482] |
| GBPUSD | 309 | -0.005101 | [-0.01372, +0.004513] |
| NZDUSD | 308 | -0.001851 | [-0.01174, +0.008081] |
| USDCAD | 309 | -0.004663 | [-0.01355, +0.003085] |
| USDCHF | 309 | +0.001778 | [-0.007368, +0.01016] |
| USDJPY | 309 | +0.0002769 | [-0.007701, +0.009989] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 252 | +0.001648 | [-0.001488, +0.004671] |
| 2019 | 251 | -0.00159 | [-0.02089, +0.01657] |
| 2020 | 252 | -0.0003929 | [-0.03489, +0.03042] |
| 2021 | 252 | +0.001954 | [-0.007358, +0.01333] |
| 2022 | 252 | -0.01786 | [-0.05077, +0.01678] |
| 2023 | 252 | -8.655e-06 | [-5.856e-05, +3.947e-05] |
| 2024 | 252 | -2.223e-05 | [-5.992e-05, +9.391e-06] |
| 2025 | 252 | +1.693e-05 | [+7.517e-06, +2.791e-05] |
| 2026 | 147 | -0.0001178 | [-0.0003417, +0.0001214] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 1084 | -0.005137 | [-0.0158, +0.007913] |
| H2 | 1078 | +0.001376 | [-0.003984, +0.005978] |

Without the largest 1% of rows: -0.000651.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 217 | -0.004652 | [-0.01048, +0.001177] |
| D2 | 216 | +0.001064 | [-0.0006097, +0.002737] |
| D3 | 216 | +0.0003095 | [-0.0001101, +0.0007291] |
| D4 | 216 | -1.034e-05 | [-2.112e-05, +4.502e-07] |
| D5 | 216 | +3.451e-06 | [+1.518e-06, +5.384e-06] |
| D6 | 216 | +1.214e-06 | [-3.493e-07, +2.776e-06] |
| D7 | 216 | -2.251e-06 | [-1.166e-05, +7.155e-06] |
| D8 | 216 | +0.0003601 | [-5.87e-05, +0.0007788] |
| D9 | 216 | +0.001039 | [-0.0007446, +0.002822] |
| D10 | 217 | -0.002838 | [-0.008853, +0.003176] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00190 [-0.00960, +0.00417] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00167. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
