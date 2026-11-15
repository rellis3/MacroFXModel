# Evidence pack: positioning-flow-inputs:vrp|fx|incr|21:00

Unit: Brier skill gain over the bias-learner base, as a fraction of B0 error. Useful bar: +0.004454. 7190 scored rows, 1200 independent clusters, 6 instruments, 2022-01-03 → 2026-08-20. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 50% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** +0.0008461 [-0.0004392, +0.00212]. Shuffled-signal 95% band [-0.0005526, +0.0008886]; the real estimate sits at the 96th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002227) | 100% | +0.003081 |
| 1.0× bar (+0.004454) | 100% | +0.005311 |
| 2.0× bar (+0.008909) | 100% | +0.009771 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1.002 (clean +0.0008461). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1196 | -0.0002749 | [-0.001745, +0.001274] |
| EURUSD | 1200 | +0.001197 | [-0.0008262, +0.003416] |
| GBPUSD | 1198 | +0.001175 | [-0.001034, +0.003005] |
| USDCAD | 1200 | -0.0002481 | [-0.001872, +0.001283] |
| USDCHF | 1196 | -9.124e-05 | [-0.00166, +0.001657] |
| USDJPY | 1200 | +0.003354 | [+0.001122, +0.005836] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 1538 | +0.004074 | [-0.002071, +0.009314] |
| 2023 | 1550 | +7.843e-06 | [-7.188e-06, +2.246e-05] |
| 2024 | 1560 | +1.131e-05 | [-0.0002695, +0.0003325] |
| 2025 | 1554 | -0.0001498 | [-0.001405, +0.001091] |
| 2026 | 988 | +1.05e-05 | [-4.551e-05, +6.337e-05] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3598 | +0.001799 | [-0.0007081, +0.003724] |
| H2 | 3592 | -0.0001089 | [-0.0006587, +0.0003371] |

Without the largest 1% of rows: -0.0001153.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 719 | +0.00042 | [-0.001017, +0.001857] |
| D2 | 719 | -7.129e-05 | [-0.0002894, +0.0001468] |
| D3 | 719 | -4.179e-05 | [-9.604e-05, +1.246e-05] |
| D4 | 719 | -7.192e-06 | [-1.602e-05, +1.64e-06] |
| D5 | 719 | -1.58e-06 | [-3.38e-06, +2.206e-07] |
| D6 | 719 | +1.078e-06 | [-1.132e-06, +3.288e-06] |
| D7 | 719 | +6.592e-06 | [-2.501e-06, +1.569e-05] |
| D8 | 719 | -3.4e-05 | [-9.574e-05, +2.773e-05] |
| D9 | 719 | +9.224e-05 | [-0.000133, +0.0003175] |
| D10 | 719 | +0.001746 | [+0.0004811, +0.00301] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est +0.00085 [-0.00008, +0.00203] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00103. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
