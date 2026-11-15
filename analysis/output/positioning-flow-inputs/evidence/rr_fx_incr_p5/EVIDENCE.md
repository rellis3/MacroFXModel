# Evidence pack: positioning-flow-inputs:rr|fx|incr|+5

Unit: Brier skill gain over the bias-learner base, as a fraction of B0 error. Useful bar: +0.002778. 7161 scored rows, 1195 independent clusters, 6 instruments, 2022-01-03 → 2026-08-13. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 50% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +3.668e-05 [-0.0006779, +0.0007765]. Shuffled-signal 95% band [-0.0005642, +0.00038]; the real estimate sits at the 69th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.001389) | 100% | +0.001434 |
| 1.0× bar (+0.002778) | 100% | +0.002823 |
| 2.0× bar (+0.005556) | 100% | +0.005603 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.9993 (clean +3.668e-05). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1193 | -0.0004541 | [-0.001725, +0.0006983] |
| EURUSD | 1194 | +0.0004525 | [-0.0006974, +0.001741] |
| GBPUSD | 1195 | -0.0006812 | [-0.001759, +0.0005103] |
| USDCAD | 1195 | +0.001132 | [+3.425e-05, +0.002261] |
| USDCHF | 1190 | -0.0008171 | [-0.002002, +0.0003664] |
| USDJPY | 1194 | +0.0005995 | [-0.0006955, +0.001814] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 1540 | +1.018e-06 | [-4.382e-05, +4.553e-05] |
| 2023 | 1552 | +9.579e-06 | [-4.041e-06, +2.134e-05] |
| 2024 | 1559 | -0.0001079 | [-0.0003162, +0.0001179] |
| 2025 | 1550 | +0.0002585 | [-1.603e-05, +0.0006174] |
| 2026 | 960 | +1.365e-05 | [-0.005134, +0.005174] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3584 | +3.422e-05 | [-7.163e-06, +6.937e-05] |
| H2 | 3577 | +3.915e-05 | [-0.001628, +0.001477] |

Without the largest 1% of rows: +0.0006338.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 717 | -0.001215 | [-0.002087, -0.0003441] |
| D2 | 716 | -0.0001005 | [-0.0001627, -3.833e-05] |
| D3 | 716 | -8.955e-06 | [-2.893e-05, +1.102e-05] |
| D4 | 716 | -4.261e-06 | [-1.009e-05, +1.568e-06] |
| D5 | 716 | -9.193e-07 | [-2.341e-06, +5.027e-07] |
| D6 | 716 | -5.834e-07 | [-2.971e-06, +1.804e-06] |
| D7 | 716 | -7e-06 | [-1.428e-05, +2.836e-07] |
| D8 | 716 | -3.342e-06 | [-2.105e-05, +1.437e-05] |
| D9 | 716 | +8.515e-05 | [+2.223e-05, +0.0001481] |
| D10 | 716 | +0.001349 | [+0.0005136, +0.002184] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est +0.00004 [-0.00098, +0.00074] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00042. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
