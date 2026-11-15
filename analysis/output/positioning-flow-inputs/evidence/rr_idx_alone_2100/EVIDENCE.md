# Evidence pack: positioning-flow-inputs:rr|idx|alone|21:00

Unit: Brier skill vs B0 (fraction). Useful bar: -0.000201. 1150 scored rows, 1150 independent clusters, 1 instruments, 2022-01-03 → 2026-08-20. Prereg verdict: **UNDERPOWERED**.

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

**Headline:** +0.0007661 [-0.0006233, +0.002445]. Shuffled-signal 95% band [-0.00177, +0.00153]; the real estimate sits at the 83th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (-0.0001005) | 0% | +0.0007823 |
| 1.0× bar (-0.000201) | 0% | +0.0007741 |
| 2.0× bar (-0.0004019) | 0% | +0.0008103 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean +0.0007661). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| NAS100 | 1150 | +0.0007661 | [-0.0006005, +0.002266] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 248 | +0.003875 | [-0.002876, +0.009637] |
| 2023 | 248 | -0.0006178 | [-0.002636, +0.001094] |
| 2024 | 249 | +0.0001604 | [-0.001036, +0.001514] |
| 2025 | 247 | -5.011e-06 | [-1.461e-05, +3.711e-06] |
| 2026 | 158 | +2.908e-06 | [-9.017e-06, +1.709e-05] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 576 | +0.001452 | [-0.00101, +0.004323] |
| H2 | 574 | +6.582e-05 | [-0.0005101, +0.0005839] |

Without the largest 1% of rows: +7.57e-05.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 115 | +0.0002715 | [-0.002512, +0.003055] |
| D2 | 115 | -0.0002901 | [-0.0008743, +0.0002941] |
| D3 | 115 | +0.0004517 | [+5.176e-05, +0.0008516] |
| D4 | 115 | +8.713e-05 | [-0.0001638, +0.0003381] |
| D5 | 115 | +7.868e-05 | [-3.852e-05, +0.0001959] |
| D6 | 115 | -2.127e-06 | [-7.027e-06, +2.774e-06] |
| D7 | 115 | +3.547e-07 | [-8.902e-07, +1.6e-06] |
| D8 | 115 | +2.526e-07 | [-1.321e-06, +1.826e-06] |
| D9 | 115 | +1.248e-06 | [-3.205e-05, +3.455e-05] |
| D10 | 115 | +0.001311 | [-0.001063, +0.003685] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est +0.00077 [-0.00045, +0.00268] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00115. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
