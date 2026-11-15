# Evidence pack: positioning-flow-inputs:rr|fx|alone|+5

Unit: Brier skill vs B0 (fraction). Useful bar: +0.004794. 7170 scored rows, 1196 independent clusters, 6 instruments, 2022-01-03 → 2026-08-13. Prereg verdict: **NULL**.

## Diagnosis: SMALL BUT REAL: above zero, below the useful size

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | True |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.0009573 [+0.0001154, +0.001853]. Shuffled-signal 95% band [-0.000653, +0.0006414]; the real estimate sits at the 100th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002397) | 100% | +0.003365 |
| 1.0× bar (+0.004794) | 100% | +0.005761 |
| 2.0× bar (+0.009589) | 100% | +0.01056 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean +0.0009573). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1195 | +0.0007942 | [-0.0006604, +0.00221] |
| EURUSD | 1195 | +0.0002091 | [-0.00123, +0.001771] |
| GBPUSD | 1196 | +0.0005546 | [-0.0008575, +0.002014] |
| USDCAD | 1196 | +0.001689 | [+0.0001628, +0.003206] |
| USDCHF | 1193 | +0.0005966 | [-0.0007541, +0.002021] |
| USDJPY | 1195 | +0.001928 | [-0.0001125, +0.003882] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 1548 | -8.565e-07 | [-4.47e-05, +3.512e-05] |
| 2023 | 1553 | +8.381e-06 | [-3.132e-06, +1.946e-05] |
| 2024 | 1559 | -0.0002611 | [-0.0007109, +0.0002158] |
| 2025 | 1550 | +0.002045 | [-0.0006502, +0.004886] |
| 2026 | 960 | +0.004279 | [+0.0003102, +0.008494] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3587 | +8.073e-05 | [-1.375e-05, +0.0001713] |
| H2 | 3583 | +0.001834 | [+5.335e-05, +0.003697] |

Without the largest 1% of rows: +0.0008124.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 717 | +0.0002613 | [-0.0008085, +0.001331] |
| D2 | 717 | -0.0004949 | [-0.0007241, -0.0002657] |
| D3 | 717 | -1.494e-05 | [-6.956e-05, +3.969e-05] |
| D4 | 717 | -6.328e-06 | [-1.218e-05, -4.773e-07] |
| D5 | 717 | -5.001e-07 | [-1.7e-06, +6.998e-07] |
| D6 | 717 | -7.688e-08 | [-2.95e-06, +2.797e-06] |
| D7 | 717 | -5.88e-06 | [-1.517e-05, +3.408e-06] |
| D8 | 717 | +3.692e-05 | [-2.602e-05, +9.986e-05] |
| D9 | 717 | +0.0001121 | [-0.0001793, +0.0004034] |
| D10 | 717 | +0.002499 | [+0.001307, +0.003692] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est +0.00096 [-0.00055, +0.00265] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00030. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
