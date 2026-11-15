# Evidence pack: positioning-flow-inputs:vrp|idx|alone|21:00

Unit: Brier skill vs B0 (fraction). Useful bar: +0.005775. 6426 scored rows, 2146 independent clusters, 3 instruments, 2018-01-02 → 2026-08-20. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 67% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** -2.654e-05 [-0.0001188, +6.594e-05]. Shuffled-signal 95% band [-7.309e-05, +6.08e-05]; the real estimate sits at the 24th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002888) | 100% | +0.0007751 |
| 1.0× bar (+0.005775) | 100% | +0.0007751 |
| 2.0× bar (+0.01155) | 100% | +0.0007751 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -2.654e-05). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| NAS100 | 2145 | -6.299e-05 | [-0.0001893, +5.563e-05] |
| SPX500 | 2136 | -2.387e-05 | [-0.00015, +0.0001229] |
| US30 | 2145 | +7.138e-06 | [-9.63e-05, +0.000143] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 739 | -5.005e-05 | [-0.0001016, +5.998e-06] |
| 2019 | 741 | +2.093e-06 | [-3.306e-07, +4.424e-06] |
| 2020 | 741 | -1.984e-05 | [-5.668e-05, +1.823e-05] |
| 2021 | 753 | +4.318e-06 | [-5.553e-06, +1.315e-05] |
| 2022 | 744 | -2.886e-05 | [-5.558e-05, -3.689e-06] |
| 2023 | 744 | -3.553e-06 | [-7.911e-06, +6.113e-08] |
| 2024 | 747 | +1.158e-06 | [-6.928e-06, +9.172e-06] |
| 2025 | 741 | +3.885e-06 | [-1.61e-05, +2.221e-05] |
| 2026 | 476 | -0.0002174 | [-0.0015, +0.00101] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3214 | -1.518e-05 | [-3.334e-05, -2.69e-07] |
| H2 | 3212 | -3.79e-05 | [-0.0002448, +0.0001569] |

Without the largest 1% of rows: +1.533e-05.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 643 | -1.521e-05 | [-0.0001342, +0.0001038] |
| D2 | 643 | +3.968e-07 | [-1.892e-06, +2.686e-06] |
| D3 | 642 | -1.066e-06 | [-2.066e-06, -6.681e-08] |
| D4 | 643 | -1.476e-07 | [-4.511e-07, +1.559e-07] |
| D5 | 642 | +1.151e-07 | [-6.074e-08, +2.909e-07] |
| D6 | 643 | -1.352e-07 | [-7.497e-07, +4.793e-07] |
| D7 | 642 | +8.684e-07 | [-4.897e-07, +2.227e-06] |
| D8 | 643 | -1.378e-06 | [-4.383e-06, +1.627e-06] |
| D9 | 642 | -1.22e-05 | [-1.862e-05, -5.778e-06] |
| D10 | 643 | -3.71e-05 | [-0.000158, +8.377e-05] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00003 [-0.00007, +0.00008] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00030. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
