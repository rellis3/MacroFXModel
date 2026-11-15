# Evidence pack: bias-learner:+1|fx

Unit: Brier skill vs B0 (fraction). Useful bar: +0.002388. 20044 scored rows, 2236 independent clusters, 9 instruments, 2018-01-02 → 2026-08-19. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 78% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.0004807 [-0.0003935, +0.00134]. Shuffled-signal 95% band [-0.0006179, +0.0003559]; the real estimate sits at the 99th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.001194) | 100% | +0.001675 |
| 1.0× bar (+0.002388) | 100% | +0.002869 |
| 2.0× bar (+0.004777) | 100% | +0.005258 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean +0.0004807). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 2223 | +0.0004182 | [-0.0006782, +0.001735] |
| EURJPY | 2230 | -0.0004153 | [-0.001169, +0.0004385] |
| EURUSD | 2226 | +0.0005974 | [-0.00106, +0.00208] |
| GBPJPY | 2234 | +0.001613 | [+0.0001336, +0.002885] |
| GBPUSD | 2232 | +0.0007934 | [-0.0002432, +0.001888] |
| NZDUSD | 2231 | +0.00034 | [-0.0008626, +0.001303] |
| USDCAD | 2232 | +0.001289 | [-0.0001032, +0.002452] |
| USDCHF | 2203 | -0.0006292 | [-0.002834, +0.001868] |
| USDJPY | 2233 | +0.0003067 | [-0.001481, +0.002077] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 2327 | -4.55e-05 | [-0.0002629, +0.0001845] |
| 2019 | 2290 | -4.28e-05 | [-0.0002129, +0.0001468] |
| 2020 | 2332 | -0.0001092 | [-0.0003867, +0.0002168] |
| 2021 | 2322 | +3.879e-05 | [-0.0002366, +0.0003014] |
| 2022 | 2308 | +5.384e-06 | [-0.0005267, +0.0005474] |
| 2023 | 2324 | +0.0001787 | [-0.000157, +0.0004508] |
| 2024 | 2337 | +0.0005823 | [+1.455e-05, +0.001263] |
| 2025 | 2331 | -0.001783 | [-0.008123, +0.00436] |
| 2026 | 1473 | +0.008472 | [+0.002619, +0.01473] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 10026 | -7.202e-05 | [-0.0002007, +5.24e-05] |
| H2 | 10018 | +0.001037 | [-0.0006614, +0.002619] |

Without the largest 1% of rows: +0.0007695.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 2005 | +0.0003599 | [-0.0003102, +0.00103] |
| D2 | 2004 | +3.169e-05 | [-4.184e-05, +0.0001052] |
| D3 | 2004 | -2.131e-05 | [-5.994e-05, +1.732e-05] |
| D4 | 2005 | +1.025e-05 | [-7.484e-06, +2.798e-05] |
| D5 | 2004 | +3.155e-06 | [-1.712e-06, +8.022e-06] |
| D6 | 2004 | +8.579e-06 | [-9.105e-06, +2.626e-05] |
| D7 | 2005 | -1.493e-07 | [-3.53e-05, +3.5e-05] |
| D8 | 2004 | +7.294e-06 | [-5.148e-05, +6.607e-05] |
| D9 | 2004 | +0.0001314 | [+1.957e-05, +0.0002432] |
| D10 | 2005 | +0.00067 | [-0.000298, +0.001638] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

OOS predictions rebuilt with the runner's own functions (registered BSS_B0: 21:00|fx +0.045%, +1|fx +0.048%). The pack bootstraps dates iid (runner: 21-date moving blocks, SE floored by 200 block-shuffled-label refits), so the runner's CI is the binding one. Placebo = the model's lean (p - b0) shuffled across dates within instrument (no refit). Buckets: per-row Brier gain over B0 by decile of the lean. Halves at the median row date (runner: 2018-21 vs 2022-26).
