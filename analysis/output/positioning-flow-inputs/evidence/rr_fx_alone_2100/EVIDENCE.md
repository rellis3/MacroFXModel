# Evidence pack: positioning-flow-inputs:rr|fx|alone|21:00

Unit: Brier skill vs B0 (fraction). Useful bar: +0.004794. 7197 scored rows, 1201 independent clusters, 6 instruments, 2022-01-03 → 2026-08-20. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 83% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** -0.0003706 [-0.003335, +0.002389]. Shuffled-signal 95% band [-0.002672, +0.0006436]; the real estimate sits at the 79th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002397) | 0% | +0.002045 |
| 1.0× bar (+0.004794) | 100% | +0.004442 |
| 2.0× bar (+0.009589) | 100% | +0.009237 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.0003706). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1198 | -0.0005803 | [-0.005814, +0.004027] |
| EURUSD | 1201 | -0.0001731 | [-0.003282, +0.003182] |
| GBPUSD | 1199 | -0.002557 | [-0.008498, +0.004791] |
| USDCAD | 1201 | -0.001046 | [-0.007226, +0.00529] |
| USDCHF | 1197 | -0.00218 | [-0.004909, +0.0003167] |
| USDJPY | 1201 | +0.004381 | [+0.001029, +0.008483] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 1546 | -0.005314 | [-0.01806, +0.008] |
| 2023 | 1551 | +0.0005239 | [-0.0004904, +0.001515] |
| 2024 | 1560 | -5.304e-05 | [-0.0007917, +0.000621] |
| 2025 | 1552 | +0.0009753 | [-0.001468, +0.003523] |
| 2026 | 988 | +0.003374 | [-0.0006743, +0.006318] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3601 | -0.001965 | [-0.007199, +0.003164] |
| H2 | 3596 | +0.001227 | [-0.0004913, +0.002895] |

Without the largest 1% of rows: +0.0007958.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 720 | -0.001193 | [-0.003886, +0.0015] |
| D2 | 720 | -0.0003531 | [-0.0009622, +0.0002559] |
| D3 | 719 | +2.133e-05 | [-0.0002701, +0.0003128] |
| D4 | 720 | +1.677e-05 | [-0.0001091, +0.0001426] |
| D5 | 720 | -1.128e-06 | [-3.671e-05, +3.446e-05] |
| D6 | 719 | +2.931e-05 | [-6.409e-05, +0.0001227] |
| D7 | 720 | +0.0001569 | [-7.887e-05, +0.0003926] |
| D8 | 719 | +0.0004372 | [-2.762e-05, +0.000902] |
| D9 | 720 | +0.000417 | [-0.000727, +0.001561] |
| D10 | 720 | -0.0004547 | [-0.004191, +0.003282] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00037 [-0.00282, +0.00167] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00050. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
