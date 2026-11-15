# Evidence pack: positioning-flow-inputs:vrp|gold|alone|+5

Unit: Brier skill vs B0 (fraction). Useful bar: +0.005587. 2223 scored rows, 2223 independent clusters, 1 instruments, 2018-01-02 → 2026-08-13. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** -0.0004239 [-0.001663, +0.0008479]. Shuffled-signal 95% band [-0.001356, +0.001099]; the real estimate sits at the 32th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002794) | 100% | +0.002391 |
| 1.0× bar (+0.005587) | 100% | +0.005187 |
| 2.0× bar (+0.01117) | 100% | +0.01078 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.0004239). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| GOLD | 2223 | -0.0004239 | [-0.001515, +0.0008897] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 258 | -0.0005805 | [-0.001522, +0.0002373] |
| 2019 | 258 | +3.116e-06 | [+1.066e-07, +5.897e-06] |
| 2020 | 259 | -2.544e-05 | [-5.1e-05, +3.242e-06] |
| 2021 | 258 | -3.547e-06 | [-8.724e-06, +1.33e-06] |
| 2022 | 257 | +5.522e-06 | [-3.852e-07, +1.117e-05] |
| 2023 | 257 | +0.0007413 | [-0.001466, +0.003186] |
| 2024 | 259 | +0.0006789 | [-0.00631, +0.008723] |
| 2025 | 258 | -0.004767 | [-0.01089, +0.003629] |
| 2026 | 159 | -7.78e-06 | [-3.278e-05, +1.56e-05] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 1112 | -0.000144 | [-0.0003145, +8.6e-05] |
| H2 | 1111 | -0.0007052 | [-0.00308, +0.002012] |

Without the largest 1% of rows: +9.342e-06.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 223 | -0.002425 | [-0.003991, -0.0008589] |
| D2 | 222 | -0.0003299 | [-0.0006005, -5.942e-05] |
| D3 | 222 | -2.155e-05 | [-3.842e-05, -4.677e-06] |
| D4 | 222 | +3.703e-07 | [-9.257e-07, +1.666e-06] |
| D5 | 223 | -8.791e-08 | [-4.3e-07, +2.542e-07] |
| D6 | 222 | -2.804e-07 | [-1.032e-06, +4.714e-07] |
| D7 | 222 | +1.916e-06 | [-2.496e-07, +4.082e-06] |
| D8 | 222 | -8.714e-05 | [-0.0001625, -1.174e-05] |
| D9 | 222 | -0.0005406 | [-0.001098, +1.728e-05] |
| D10 | 223 | +0.002355 | [-0.0001863, +0.004896] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00042 [-0.00231, +0.00142] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00256. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
