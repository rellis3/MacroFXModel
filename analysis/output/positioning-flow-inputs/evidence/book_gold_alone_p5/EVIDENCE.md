# Evidence pack: positioning-flow-inputs:book|gold|alone|+5

Unit: Brier skill vs B0 (fraction). Useful bar: +0.003747. 1965 scored rows, 1965 independent clusters, 1 instruments, 2019-01-02 → 2026-08-13. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.004371 [-0.007763, -0.0008761]. Shuffled-signal 95% band [-0.004043, +0.002417]; the real estimate sits at the 1th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.001873) | 0% | -0.002399 |
| 1.0× bar (+0.003747) | 0% | -0.0005469 |
| 2.0× bar (+0.007493) | 30% | +0.003222 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.004371). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| GOLD | 1965 | -0.004371 | [-0.00855, -0.001116] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2019 | 258 | -0.00107 | [-0.001698, -0.0003898] |
| 2020 | 259 | -1.395e-05 | [-4.559e-05, +1.383e-05] |
| 2021 | 258 | +9.234e-06 | [-3.513e-05, +4.463e-05] |
| 2022 | 257 | +0.0001178 | [+4.392e-05, +0.0001879] |
| 2023 | 257 | -0.03549 | [-0.05903, -0.0159] |
| 2024 | 259 | +0.004202 | [-0.008498, +0.01625] |
| 2025 | 258 | -0.0005192 | [-0.0009605, -9.154e-05] |
| 2026 | 159 | +7.436e-05 | [-3.424e-05, +0.0001881] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 983 | -0.0002507 | [-0.0004223, -8.073e-05] |
| H2 | 982 | -0.008578 | [-0.01545, -0.001011] |

Without the largest 1% of rows: -0.0009702.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 197 | -0.004009 | [-0.007333, -0.0006856] |
| D2 | 196 | -7.849e-05 | [-0.0002205, +6.348e-05] |
| D3 | 197 | -0.0001143 | [-0.0001796, -4.906e-05] |
| D4 | 196 | +9.282e-06 | [-1.567e-05, +3.423e-05] |
| D5 | 197 | -2.117e-06 | [-1.407e-05, +9.841e-06] |
| D6 | 196 | -3.455e-06 | [-9.349e-06, +2.439e-06] |
| D7 | 196 | +4.373e-07 | [-2.578e-06, +3.453e-06] |
| D8 | 197 | +5.639e-06 | [-9.053e-06, +2.033e-05] |
| D9 | 196 | +0.0002527 | [-0.001248, +0.001754] |
| D10 | 197 | -0.006785 | [-0.01469, +0.001122] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00437 [-0.01188, +0.00232] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00171. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
