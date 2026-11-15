# Evidence pack: positioning-flow-inputs:book|gold|incr|+5

Unit: Brier skill gain over the bias-learner base, as a fraction of B0 error. Useful bar: +0.002458. 1959 scored rows, 1959 independent clusters, 1 instruments, 2019-01-02 → 2026-08-13. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.004717 [-0.01242, +0.002216]. Shuffled-signal 95% band [-0.0146, +0.001077]; the real estimate sits at the 68th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.001229) | 0% | -0.003321 |
| 1.0× bar (+0.002458) | 0% | -0.002101 |
| 2.0× bar (+0.004916) | 0% | +0.0003276 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.9997 (clean -0.004717). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| GOLD | 1959 | -0.004717 | [-0.01203, +0.002826] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2019 | 255 | -0.0009609 | [-0.001614, -0.0004107] |
| 2020 | 257 | -1.23e-05 | [-3.973e-05, +1.622e-05] |
| 2021 | 258 | +0.001765 | [-0.004253, +0.007565] |
| 2022 | 256 | +0.02391 | [-0.01733, +0.05734] |
| 2023 | 257 | -0.04374 | [-0.07375, -0.01671] |
| 2024 | 259 | +5.89e-05 | [-5.642e-05, +0.0001979] |
| 2025 | 258 | -0.007323 | [-0.01319, -0.001142] |
| 2026 | 159 | -0.0153 | [-0.05805, +0.02968] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 980 | +0.004498 | [-0.006207, +0.01507] |
| H2 | 979 | -0.01414 | [-0.02514, -0.003645] |

Without the largest 1% of rows: -0.004973.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 196 | +0.004238 | [-0.008248, +0.01672] |
| D2 | 196 | -0.0001872 | [-0.002366, +0.001992] |
| D3 | 196 | -0.000879 | [-0.00166, -9.819e-05] |
| D4 | 196 | -5.146e-05 | [-0.0001432, +4.025e-05] |
| D5 | 196 | -1.036e-05 | [-2.261e-05, +1.895e-06] |
| D6 | 195 | +4.807e-06 | [+9.155e-07, +8.698e-06] |
| D7 | 196 | +4.509e-05 | [-1.448e-05, +0.0001046] |
| D8 | 196 | +0.0005328 | [-0.0005657, +0.001631] |
| D9 | 196 | +0.0002477 | [-0.004307, +0.004802] |
| D10 | 196 | -0.01554 | [-0.02824, -0.002835] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00472 [-0.01696, +0.00901] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00268. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
