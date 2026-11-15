# Evidence pack: positioning-flow-inputs:book|gold|alone|21:00

Unit: Brier skill vs B0 (fraction). Useful bar: +0.003747. 1906 scored rows, 1906 independent clusters, 1 instruments, 2019-01-02 → 2026-08-20. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | False |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 100% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** -0.0004379 [-0.005219, +0.004121]. Shuffled-signal 95% band [-0.007772, +0.001777]; the real estimate sits at the 86th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.001873) | 0% | +0.001522 |
| 1.0× bar (+0.003747) | 0% | +0.003449 |
| 2.0× bar (+0.007493) | 100% | +0.007119 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.0004379). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| GOLD | 1906 | -0.0004379 | [-0.004504, +0.003618] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2019 | 249 | -1.07e-05 | [-0.001483, +0.00107] |
| 2020 | 251 | +0.0003479 | [+0.0001069, +0.0005913] |
| 2021 | 251 | +0.006765 | [-0.003494, +0.01749] |
| 2022 | 248 | -0.005198 | [-0.0331, +0.02544] |
| 2023 | 249 | -0.002807 | [-0.01597, +0.009042] |
| 2024 | 250 | -0.002474 | [-0.01477, +0.006633] |
| 2025 | 249 | -6.769e-05 | [-0.000163, +3.697e-05] |
| 2026 | 159 | -1.577e-05 | [-0.0001001, +6.536e-05] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 954 | +0.0004651 | [-0.006652, +0.008051] |
| H2 | 952 | -0.001346 | [-0.005232, +0.003091] |

Without the largest 1% of rows: +0.001513.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 191 | +0.0005459 | [-0.00886, +0.009952] |
| D2 | 191 | +0.001322 | [-0.001386, +0.004031] |
| D3 | 190 | -0.0001936 | [-0.001265, +0.0008778] |
| D4 | 191 | -2.696e-05 | [-0.0001222, +6.831e-05] |
| D5 | 190 | -2.089e-05 | [-4.963e-05, +7.84e-06] |
| D6 | 191 | -8.645e-06 | [-1.663e-05, -6.614e-07] |
| D7 | 190 | +8.623e-05 | [+3.524e-05, +0.0001372] |
| D8 | 191 | +0.00012 | [-0.0002095, +0.0004494] |
| D9 | 190 | -0.001938 | [-0.003856, -2.021e-05] |
| D10 | 191 | -0.0009891 | [-0.006928, +0.00495] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00044 [-0.00493, +0.00416] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00065. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
