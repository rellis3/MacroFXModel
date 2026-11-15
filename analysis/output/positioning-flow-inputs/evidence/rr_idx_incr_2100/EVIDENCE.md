# Evidence pack: positioning-flow-inputs:rr|idx|incr|21:00

Unit: Brier skill gain over the bias-learner base, as a fraction of B0 error. Useful bar: +1.194e-05. 1147 scored rows, 1147 independent clusters, 1 instruments, 2022-01-03 → 2026-08-20. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | False |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.0007874 [-0.0005017, +0.002285]. Shuffled-signal 95% band [-0.001746, +0.001356]; the real estimate sits at the 90th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+5.969e-06) | 0% | +0.0008077 |
| 1.0× bar (+1.194e-05) | 0% | +0.0008128 |
| 2.0× bar (+2.388e-05) | 0% | +0.0008316 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1.003 (clean +0.0007874). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| NAS100 | 1147 | +0.0007874 | [-0.0004524, +0.002324] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 245 | +0.003572 | [-0.002463, +0.01021] |
| 2023 | 248 | -3.237e-06 | [-1.417e-05, +8.004e-06] |
| 2024 | 249 | +2.265e-06 | [-8.162e-06, +1.166e-05] |
| 2025 | 247 | -4.929e-06 | [-1.492e-05, +2.823e-06] |
| 2026 | 158 | +3.038e-06 | [-8.166e-06, +1.715e-05] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 574 | +0.001561 | [-0.001002, +0.004593] |
| H2 | 573 | -4.297e-07 | [-7.463e-06, +5.85e-06] |

Without the largest 1% of rows: +0.0001061.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 115 | +0.001043 | [-0.001757, +0.003842] |
| D2 | 115 | -2.043e-07 | [-1.411e-05, +1.37e-05] |
| D3 | 114 | -2.544e-07 | [-4.952e-06, +4.443e-06] |
| D4 | 115 | +8.324e-07 | [-2.879e-06, +4.544e-06] |
| D5 | 115 | +1.682e-06 | [-1.03e-06, +4.394e-06] |
| D6 | 114 | -2.407e-07 | [-2.063e-06, +1.581e-06] |
| D7 | 115 | +6.975e-07 | [-2.291e-07, +1.624e-06] |
| D8 | 114 | -7.564e-09 | [-1.017e-06, +1.002e-06] |
| D9 | 115 | +8.128e-07 | [-3.686e-06, +5.312e-06] |
| D10 | 115 | +0.0009107 | [-0.001243, +0.003065] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est +0.00079 [-0.00009, +0.00250] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00043. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
