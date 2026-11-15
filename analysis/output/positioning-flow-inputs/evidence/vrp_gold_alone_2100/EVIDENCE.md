# Evidence pack: positioning-flow-inputs:vrp|gold|alone|21:00

Unit: Brier skill vs B0 (fraction). Useful bar: +0.005587. 2156 scored rows, 2156 independent clusters, 1 instruments, 2018-01-02 → 2026-08-20. Prereg verdict: **NULL**.

## Diagnosis: WRONG SIGN: there is an effect, and it is the opposite of the claim

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.0007726 [-0.001324, -0.000283]. Shuffled-signal 95% band [-0.0005738, +0.0004272]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002794) | 100% | +0.002035 |
| 1.0× bar (+0.005587) | 100% | +0.004828 |
| 2.0× bar (+0.01117) | 100% | +0.005111 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.0007726). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| GOLD | 2156 | -0.0007726 | [-0.001274, -0.0002411] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 250 | +0.0001212 | [-0.0006913, +0.0008499] |
| 2019 | 249 | -0.005227 | [-0.00929, -0.001172] |
| 2020 | 251 | -8.899e-06 | [-2.387e-05, +4.677e-06] |
| 2021 | 251 | -7.192e-07 | [-9.94e-06, +6.066e-06] |
| 2022 | 248 | -2.742e-06 | [-9.631e-06, +3.201e-06] |
| 2023 | 249 | +3.011e-09 | [-7.529e-09, +1.461e-08] |
| 2024 | 250 | +6.703e-07 | [-4.373e-06, +6.789e-06] |
| 2025 | 249 | -0.001556 | [-0.002979, +0.0001022] |
| 2026 | 159 | -8.933e-06 | [-4.057e-05, +1.931e-05] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 1079 | -0.001184 | [-0.002167, -2.256e-05] |
| H2 | 1077 | -0.0003597 | [-0.0007772, +1.321e-05] |

Without the largest 1% of rows: -0.0003297.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 216 | -0.001777 | [-0.002908, -0.0006455] |
| D2 | 216 | -0.0001205 | [-0.000293, +5.19e-05] |
| D3 | 215 | -1.878e-06 | [-5.624e-06, +1.868e-06] |
| D4 | 216 | -5.964e-07 | [-2.009e-06, +8.164e-07] |
| D5 | 215 | -1.959e-08 | [-3.181e-07, +2.789e-07] |
| D6 | 216 | -8.834e-08 | [-2.76e-07, +9.93e-08] |
| D7 | 215 | +4.825e-08 | [-1.048e-06, +1.145e-06] |
| D8 | 216 | -5.323e-07 | [-2.944e-06, +1.88e-06] |
| D9 | 215 | +5.701e-05 | [-1.097e-05, +0.000125] |
| D10 | 216 | -8.433e-05 | [-0.0007856, +0.000617] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00077 [-0.00155, -0.00017] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00043. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
