# Evidence pack: positioning-flow-inputs:book|fx|incr|+5

Unit: Brier skill gain over the bias-learner base, as a fraction of B0 error. Useful bar: +0.002449. 5911 scored rows, 1972 independent clusters, 3 instruments, 2019-01-02 → 2026-08-13. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 33% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** +0.000286 [-0.001047, +0.001688]. Shuffled-signal 95% band [-0.001506, +0.0005604]; the real estimate sits at the 92th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.001224) | 100% | +0.001522 |
| 1.0× bar (+0.002449) | 100% | +0.002746 |
| 2.0× bar (+0.004897) | 100% | +0.005195 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1.001 (clean +0.000286). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| EURUSD | 1970 | -0.001606 | [-0.003726, +0.0006169] |
| GBPUSD | 1970 | -0.001005 | [-0.00244, +0.0009073] |
| USDJPY | 1971 | +0.003536 | [+0.001579, +0.005693] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2019 | 771 | -0.00042 | [-0.002493, +0.001838] |
| 2020 | 780 | -0.004428 | [-0.008807, +0.0001141] |
| 2021 | 777 | -0.0009302 | [-0.003472, +0.001209] |
| 2022 | 771 | +0.0103 | [+0.002099, +0.01921] |
| 2023 | 777 | +2.773e-06 | [-3.727e-06, +8.457e-06] |
| 2024 | 779 | -4.216e-06 | [-1.221e-05, +3.107e-06] |
| 2025 | 776 | -0.0021 | [-0.003358, -0.001029] |
| 2026 | 480 | -0.0001732 | [-0.0006674, +0.0002337] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 2958 | -0.002182 | [-0.004211, +0.0001058] |
| H2 | 2953 | +0.002771 | [+0.00141, +0.004657] |

Without the largest 1% of rows: -0.001507.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 592 | -0.0009679 | [-0.002789, +0.0008533] |
| D2 | 591 | -0.0005717 | [-0.001192, +4.887e-05] |
| D3 | 591 | +0.0002219 | [-6.062e-05, +0.0005044] |
| D4 | 591 | -8.424e-05 | [-0.0001563, -1.221e-05] |
| D5 | 591 | -1.539e-06 | [-3.759e-06, +6.823e-07] |
| D6 | 591 | -5.569e-07 | [-1.029e-06, -8.451e-08] |
| D7 | 591 | +1.849e-05 | [-3.277e-06, +4.025e-05] |
| D8 | 591 | -0.0001031 | [-0.0003402, +0.000134] |
| D9 | 591 | -0.0003857 | [-0.001073, +0.0003019] |
| D10 | 591 | +0.002588 | [+0.0007093, +0.004467] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est +0.00029 [-0.00277, +0.00381] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00145. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
