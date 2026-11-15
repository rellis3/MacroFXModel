# Evidence pack: positioning-flow-inputs:rr|idx|alone|+5

Unit: Brier skill vs B0 (fraction). Useful bar: -0.000201. 1191 scored rows, 1191 independent clusters, 1 instruments, 2022-01-03 → 2026-08-13. Prereg verdict: **UNDERPOWERED**.

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

**Headline:** -0.0004974 [-0.001465, +0.0004889]. Shuffled-signal 95% band [-0.001304, +0.001054]; the real estimate sits at the 30th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (-0.0001005) | 0% | -0.0004921 |
| 1.0× bar (-0.000201) | 0% | -0.0004953 |
| 2.0× bar (-0.0004019) | 0% | -0.0004903 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.0004974). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| NAS100 | 1191 | -0.0004974 | [-0.001428, +0.0003228] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 257 | -0.001269 | [-0.005085, +0.002331] |
| 2023 | 258 | +1.393e-06 | [-5.726e-06, +7.209e-06] |
| 2024 | 259 | -1.638e-07 | [-1.667e-06, +1.961e-06] |
| 2025 | 257 | -0.0004566 | [-0.001264, +0.0007302] |
| 2026 | 160 | -0.0006592 | [-0.002701, +0.001162] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 596 | -0.0006105 | [-0.002551, +0.0011] |
| H2 | 595 | -0.0003772 | [-0.001022, +0.0003222] |

Without the largest 1% of rows: -7.844e-05.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 120 | -0.0013 | [-0.00277, +0.0001692] |
| D2 | 119 | +0.0002077 | [+1.454e-05, +0.0004008] |
| D3 | 119 | +5.944e-05 | [-4.035e-06, +0.0001229] |
| D4 | 119 | +1.581e-06 | [-1.608e-06, +4.77e-06] |
| D5 | 119 | -5.18e-07 | [-2.313e-06, +1.277e-06] |
| D6 | 119 | -5.791e-07 | [-1.057e-06, -1.009e-07] |
| D7 | 119 | +3.039e-08 | [-3.145e-07, +3.753e-07] |
| D8 | 119 | -6.721e-05 | [-0.0001087, -2.574e-05] |
| D9 | 119 | -0.0003488 | [-0.0005511, -0.0001464] |
| D10 | 119 | +0.0002188 | [-0.001507, +0.001944] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00050 [-0.00158, +0.00033] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00282. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
