# Evidence pack: positioning-flow-inputs:rr|idx|incr|+5

Unit: Brier skill gain over the bias-learner base, as a fraction of B0 error. Useful bar: +1.194e-05. 1188 scored rows, 1188 independent clusters, 1 instruments, 2022-01-03 → 2026-08-13. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | False |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.000515 [-0.001293, +0.0001422]. Shuffled-signal 95% band [-0.00124, +0.001005]; the real estimate sits at the 24th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+5.969e-06) | 0% | -0.0005019 |
| 1.0× bar (+1.194e-05) | 0% | -0.0004576 |
| 2.0× bar (+2.388e-05) | 0% | -0.0004067 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1.021 (clean -0.000515). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| NAS100 | 1188 | -0.000515 | [-0.001283, +0.0001032] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 254 | -0.002069 | [-0.005198, +0.0003631] |
| 2023 | 258 | +1.405e-06 | [-6.124e-06, +8.786e-06] |
| 2024 | 259 | +7.297e-09 | [-1.395e-06, +2.209e-06] |
| 2025 | 257 | -3.465e-06 | [-6.439e-06, -5.206e-08] |
| 2026 | 160 | -5.363e-05 | [-0.0002293, +0.0001559] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 595 | -0.0009856 | [-0.002271, +0.0003164] |
| H2 | 593 | -1.639e-05 | [-8.044e-05, +4.357e-05] |

Without the largest 1% of rows: -4.97e-05.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 119 | -0.0005664 | [-0.001911, +0.0007778] |
| D2 | 119 | +4.191e-05 | [+1.395e-05, +6.986e-05] |
| D3 | 119 | +4.085e-06 | [+1.316e-06, +6.854e-06] |
| D4 | 118 | -3.275e-06 | [-4.66e-06, -1.891e-06] |
| D5 | 119 | -4.099e-07 | [-1.077e-06, +2.567e-07] |
| D6 | 119 | +1.741e-07 | [+1.326e-09, +3.469e-07] |
| D7 | 118 | -1.009e-07 | [-3.648e-07, +1.63e-07] |
| D8 | 119 | -2.688e-07 | [-1.162e-06, +6.247e-07] |
| D9 | 119 | -1.587e-05 | [-4.975e-05, +1.8e-05] |
| D10 | 119 | -0.0007398 | [-0.001865, +0.0003858] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00051 [-0.00152, +0.00009] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00185. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
