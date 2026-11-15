# Evidence pack: positioning-flow-inputs:vrp|fx|alone|21:00

Unit: Brier skill vs B0 (fraction). Useful bar: +0.006135. 7199 scored rows, 1201 independent clusters, 6 instruments, 2022-01-03 → 2026-08-20. Prereg verdict: **NULL**.

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

**Headline:** -0.0001154 [-0.001039, +0.0009156]. Shuffled-signal 95% band [-0.000702, +0.0006468]; the real estimate sits at the 39th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.003068) | 100% | +0.002962 |
| 1.0× bar (+0.006135) | 100% | +0.006031 |
| 2.0× bar (+0.01227) | 100% | +0.01216 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.0001154). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1198 | +0.0004876 | [-0.001391, +0.002374] |
| EURUSD | 1201 | -0.0009857 | [-0.002859, +0.0008285] |
| GBPUSD | 1199 | -0.001413 | [-0.002743, -5.335e-05] |
| USDCAD | 1201 | +0.0007315 | [-0.0007427, +0.00225] |
| USDCHF | 1199 | +7.736e-06 | [-0.001421, +0.001492] |
| USDJPY | 1201 | +0.0004892 | [-0.001133, +0.002248] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 1546 | +1.316e-06 | [-2.42e-06, +4.67e-06] |
| 2023 | 1551 | +0.0004031 | [-0.0004542, +0.00126] |
| 2024 | 1560 | +0.0005472 | [-0.002887, +0.00346] |
| 2025 | 1554 | -0.001489 | [-0.005083, +0.001873] |
| 2026 | 988 | +1.051e-05 | [-4.779e-05, +5.928e-05] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3601 | +0.0001926 | [-0.0006219, +0.0009432] |
| H2 | 3598 | -0.0004238 | [-0.001937, +0.001158] |

Without the largest 1% of rows: +0.0001063.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 720 | -0.0004696 | [-0.001682, +0.0007432] |
| D2 | 720 | -0.0001998 | [-0.0006225, +0.0002228] |
| D3 | 720 | -7.963e-05 | [-0.0002331, +7.388e-05] |
| D4 | 720 | -4.564e-07 | [-2.661e-05, +2.57e-05] |
| D5 | 720 | +2.022e-07 | [-6.402e-07, +1.045e-06] |
| D6 | 719 | +1.478e-07 | [-3.815e-07, +6.772e-07] |
| D7 | 720 | +1.447e-06 | [-5.587e-06, +8.481e-06] |
| D8 | 720 | -1.669e-05 | [-0.0001215, +8.816e-05] |
| D9 | 720 | +0.000525 | [+0.0002061, +0.000844] |
| D10 | 720 | -4.84e-05 | [-0.001123, +0.001026] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00012 [-0.00104, +0.00077] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00017. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
