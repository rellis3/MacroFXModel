# Evidence pack: positioning-flow-inputs:book|fx|alone|21:00

Unit: Brier skill vs B0 (fraction). Useful bar: +0.004079. 5928 scored rows, 1979 independent clusters, 3 instruments, 2019-01-02 → 2026-08-20. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.0002273 [-0.0005903, +0.0001379]. Shuffled-signal 95% band [-0.0004579, +0.0002554]; the real estimate sits at the 17th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002039) | 100% | +0.001817 |
| 1.0× bar (+0.004079) | 100% | +0.003855 |
| 2.0× bar (+0.008158) | 100% | +0.006364 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.0002273). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| EURUSD | 1977 | -5.052e-05 | [-0.0005161, +0.0003922] |
| GBPUSD | 1976 | -0.0001027 | [-0.0005926, +0.0004112] |
| USDJPY | 1975 | -0.000532 | [-0.001338, +0.0001654] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2019 | 772 | -8.123e-05 | [-0.001441, +0.001578] |
| 2020 | 777 | -1.13e-06 | [-1.837e-05, +1.812e-05] |
| 2021 | 778 | +8.471e-07 | [-1.118e-05, +1.348e-05] |
| 2022 | 774 | +2.42e-05 | [-1.206e-05, +6.289e-05] |
| 2023 | 776 | -0.001496 | [-0.003559, +0.0003477] |
| 2024 | 780 | -0.0001894 | [-0.001285, +0.0009498] |
| 2025 | 777 | -1.171e-06 | [-2.492e-05, +1.789e-05] |
| 2026 | 494 | +5.607e-06 | [-2.086e-05, +2.784e-05] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 2966 | -1.684e-05 | [-0.0004061, +0.0003499] |
| H2 | 2962 | -0.0004393 | [-0.001001, +4.152e-05] |

Without the largest 1% of rows: -0.0001732.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 593 | -0.0006071 | [-0.001198, -1.608e-05] |
| D2 | 593 | -0.0001132 | [-0.000236, +9.594e-06] |
| D3 | 593 | +1.696e-08 | [-7.4e-06, +7.434e-06] |
| D4 | 592 | -2.184e-06 | [-6.346e-06, +1.979e-06] |
| D5 | 593 | -1.296e-06 | [-3.835e-06, +1.243e-06] |
| D6 | 593 | -6.042e-07 | [-1.485e-06, +2.764e-07] |
| D7 | 592 | -8.181e-07 | [-3.315e-06, +1.679e-06] |
| D8 | 593 | +3.754e-06 | [-4.547e-06, +1.205e-05] |
| D9 | 593 | +1.373e-05 | [-0.0001214, +0.0001488] |
| D10 | 593 | +0.0001414 | [-0.0004609, +0.0007436] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00023 [-0.00055, +0.00004] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00023. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
