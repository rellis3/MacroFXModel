# Evidence pack: positioning-flow-inputs:rr|fx|incr|21:00

Unit: Brier skill gain over the bias-learner base, as a fraction of B0 error. Useful bar: +0.002778. 7188 scored rows, 1200 independent clusters, 6 instruments, 2022-01-03 → 2026-08-20. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** -0.001918 [-0.004642, +0.0004969]. Shuffled-signal 95% band [-0.002525, +0.0001883]; the real estimate sits at the 15th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.001389) | 0% | -0.0005019 |
| 1.0× bar (+0.002778) | 0% | +0.000879 |
| 2.0× bar (+0.005556) | 100% | +0.003658 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1.001 (clean -0.001918). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1196 | -0.0009257 | [-0.004421, +0.002394] |
| EURUSD | 1200 | -0.003196 | [-0.007588, +0.000605] |
| GBPUSD | 1198 | -0.004294 | [-0.008999, +0.001262] |
| USDCAD | 1200 | -0.0004889 | [-0.003964, +0.002753] |
| USDCHF | 1194 | -0.001491 | [-0.003898, +0.0009229] |
| USDJPY | 1200 | -0.001098 | [-0.003597, +0.001227] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 1538 | -0.009154 | [-0.02112, +0.00261] |
| 2023 | 1550 | +7.582e-05 | [-0.0001574, +0.0002854] |
| 2024 | 1560 | -0.0001778 | [-0.001088, +0.0007623] |
| 2025 | 1552 | +6.577e-05 | [-7.357e-05, +0.000218] |
| 2026 | 988 | +0.0003799 | [-0.0001154, +0.0008945] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3598 | -0.003723 | [-0.007903, +0.0006266] |
| H2 | 3590 | -0.0001077 | [-0.000454, +0.0002625] |

Without the largest 1% of rows: +4.65e-06.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 719 | -0.001953 | [-0.003923, +1.732e-05] |
| D2 | 719 | -0.0001451 | [-0.0003135, +2.323e-05] |
| D3 | 719 | -2.917e-07 | [-6.338e-05, +6.279e-05] |
| D4 | 718 | -1.316e-05 | [-4.12e-05, +1.488e-05] |
| D5 | 719 | +1.503e-06 | [-5.831e-06, +8.837e-06] |
| D6 | 719 | +4.157e-06 | [-1.105e-05, +1.937e-05] |
| D7 | 718 | +6.117e-05 | [+2.345e-05, +9.889e-05] |
| D8 | 719 | +2.607e-05 | [-6.552e-05, +0.0001177] |
| D9 | 719 | +0.0001876 | [-0.000165, +0.0005402] |
| D10 | 719 | -0.00295 | [-0.006094, +0.0001938] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00192 [-0.00445, -0.00002] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00050. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
