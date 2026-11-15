# Evidence pack: positioning-flow-inputs:monthend|fx|incr|+5

Unit: Brier skill gain over the bias-learner base, as a fraction of B0 error. Useful bar: +0.00202. 2150 scored rows, 308 independent clusters, 7 instruments, 2018-01-29 → 2026-07-31. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | False |
| beats placebo 97 5 | True |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 86% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.01641 [-0.009632, +0.04271]. Shuffled-signal 95% band [-0.03505, -0.009709]; the real estimate sits at the 100th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.00101) | 0% | +0.01764 |
| 1.0× bar (+0.00202) | 0% | +0.01867 |
| 2.0× bar (+0.004039) | 0% | +0.02065 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.9993 (clean +0.01641). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 308 | +0.03437 | [+0.002625, +0.07259] |
| EURUSD | 307 | +0.02992 | [+0.004463, +0.06158] |
| GBPUSD | 308 | +0.01998 | [-0.01394, +0.05626] |
| NZDUSD | 307 | +0.02561 | [-0.01679, +0.06048] |
| USDCAD | 307 | +0.01245 | [-0.02206, +0.044] |
| USDCHF | 306 | +0.006411 | [-0.02818, +0.04238] |
| USDJPY | 307 | -0.01388 | [-0.04866, +0.02282] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 252 | +0.0138 | [+0.002278, +0.02543] |
| 2019 | 249 | +0.0006669 | [-0.02697, +0.03294] |
| 2020 | 250 | +0.1199 | [-0.04913, +0.2396] |
| 2021 | 252 | +0.03961 | [-0.01193, +0.08061] |
| 2022 | 245 | -0.04413 | [-0.1509, +0.08316] |
| 2023 | 252 | +0.01285 | [-0.002367, +0.02782] |
| 2024 | 251 | +0.01576 | [+0.005605, +0.02638] |
| 2025 | 252 | +0.03327 | [-0.007549, +0.0768] |
| 2026 | 147 | -0.08737 | [-0.2528, +0.07004] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 1080 | +0.04452 | [+0.006472, +0.08564] |
| H2 | 1070 | -0.01188 | [-0.04637, +0.02008] |

Without the largest 1% of rows: +0.02901.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 215 | -0.007929 | [-0.02919, +0.01333] |
| D2 | 215 | +0.008973 | [+0.0008664, +0.01708] |
| D3 | 215 | +0.007623 | [+0.003996, +0.01125] |
| D4 | 215 | +0.0006814 | [-0.001189, +0.002552] |
| D5 | 215 | -6.26e-05 | [-0.0006792, +0.000554] |
| D6 | 215 | +0.0005426 | [-0.0001432, +0.001229] |
| D7 | 215 | +0.002985 | [+0.001053, +0.004917] |
| D8 | 215 | +0.001788 | [-0.002338, +0.005914] |
| D9 | 215 | +0.01452 | [+0.006185, +0.02286] |
| D10 | 215 | +0.0121 | [-0.01057, +0.03477] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est +0.01641 [-0.02129, +0.04965] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00778. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
