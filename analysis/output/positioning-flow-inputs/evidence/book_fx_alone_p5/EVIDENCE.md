# Evidence pack: positioning-flow-inputs:book|fx|alone|+5

Unit: Brier skill vs B0 (fraction). Useful bar: +0.004079. 5923 scored rows, 1975 independent clusters, 3 instruments, 2019-01-02 → 2026-08-13. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 67% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.0001292 [-0.0004182, +0.0001646]. Shuffled-signal 95% band [-0.0002507, +0.0003086]; the real estimate sits at the 15th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002039) | 100% | +0.001917 |
| 1.0× bar (+0.004079) | 100% | +0.003527 |
| 2.0× bar (+0.008158) | 100% | +0.003527 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.0001292). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| EURUSD | 1974 | -0.0002188 | [-0.0006353, +0.000248] |
| GBPUSD | 1975 | -0.0001749 | [-0.0008048, +0.0004339] |
| USDJPY | 1974 | +9.054e-06 | [-0.0003081, +0.00031] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2019 | 777 | -0.0008878 | [-0.003553, +0.001533] |
| 2020 | 780 | -1.183e-05 | [-2.543e-05, +1.336e-06] |
| 2021 | 780 | -1.861e-06 | [-9.378e-06, +5.193e-06] |
| 2022 | 774 | -3.815e-06 | [-2.678e-05, +1.891e-05] |
| 2023 | 777 | +3.131e-06 | [-5.429e-06, +9.808e-06] |
| 2024 | 779 | -1.156e-05 | [-3.865e-05, +1.151e-05] |
| 2025 | 776 | -5.773e-05 | [-9.637e-05, -2.985e-05] |
| 2026 | 480 | -1.13e-05 | [-4.187e-05, +1.315e-05] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 2964 | -0.0002414 | [-0.0007739, +0.0003306] |
| H2 | 2959 | -1.625e-05 | [-2.717e-05, -3.285e-06] |

Without the largest 1% of rows: -9.922e-05.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 593 | +7.993e-07 | [-8.908e-05, +9.068e-05] |
| D2 | 592 | -1.4e-05 | [-1.847e-05, -9.538e-06] |
| D3 | 592 | -3.613e-06 | [-5.98e-06, -1.246e-06] |
| D4 | 592 | +1.724e-06 | [+2.483e-07, +3.199e-06] |
| D5 | 593 | +2.305e-08 | [-4.79e-07, +5.251e-07] |
| D6 | 592 | -1.389e-07 | [-9.006e-07, +6.228e-07] |
| D7 | 592 | +2.192e-07 | [-1.82e-06, +2.258e-06] |
| D8 | 592 | +2.708e-06 | [-1.385e-06, +6.8e-06] |
| D9 | 592 | +1.81e-05 | [+8.409e-07, +3.536e-05] |
| D10 | 593 | -0.000327 | [-0.001076, +0.0004225] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00013 [-0.00073, +0.00039] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00054. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
