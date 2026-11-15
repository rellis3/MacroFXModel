# Evidence pack: hold-day-one-confirm:hold-r

Unit: R per sqrt-day (P-bar, net of 0.03 R). Useful bar: +0.1. 8987 scored rows, 898 independent clusters, 13 instruments, 2020-08-24 → 2026-08-19. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 54% |
| survives top1pct removed | False |
| survives costs | True |

**Headline:** +0.002884 [-0.04265, +0.05354]. Shuffled-signal 95% band [+0.00275, +0.03499]; the real estimate sits at the 3th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.05) | 90% | +0.05288 |
| 1.0× bar (+0.1) | 100% | +0.1029 |
| 2.0× bar (+0.2) | 100% | +0.2029 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.6318 (clean +0.002884). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 584 | -0.0388 | [-0.1514, +0.06389] |
| EURJPY | 600 | +0.008308 | [-0.1261, +0.1162] |
| EURUSD | 693 | -0.03948 | [-0.1413, +0.05416] |
| GBPJPY | 582 | +0.02278 | [-0.1163, +0.1539] |
| GBPUSD | 776 | -0.02241 | [-0.1295, +0.07236] |
| GOLD | 658 | +0.07355 | [-0.03938, +0.2155] |
| NQ | 823 | +0.03666 | [-0.07028, +0.1236] |
| NZDUSD | 641 | -0.04819 | [-0.1385, +0.06853] |
| SPX500 | 805 | +0.01733 | [-0.0825, +0.1412] |
| US30 | 799 | -0.03071 | [-0.1421, +0.1012] |
| USDCAD | 771 | +0.02024 | [-0.07078, +0.1147] |
| USDCHF | 718 | +0.0434 | [-0.0579, +0.1517] |
| USDJPY | 537 | -0.01665 | [-0.1331, +0.1073] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2020 | 445 | -0.08053 | [-0.2272, +0.05463] |
| 2021 | 1715 | -0.005055 | [-0.1026, +0.09399] |
| 2022 | 1695 | +0.02219 | [-0.1211, +0.1379] |
| 2023 | 1638 | +0.007 | [-0.1032, +0.1205] |
| 2024 | 1365 | -0.004009 | [-0.1189, +0.1242] |
| 2025 | 1350 | -0.04283 | [-0.1698, +0.101] |
| 2026 | 779 | +0.1092 | [-0.097, +0.3288] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 4496 | -0.008601 | [-0.07161, +0.05005] |
| H2 | 4491 | +0.01424 | [-0.058, +0.09572] |

Without the largest 1% of rows: -0.03069.
Net of costs: +0.002884.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 899 | -0.1326 | [-0.215, -0.0501] |
| D2 | 899 | -0.007042 | [-0.08688, +0.0728] |
| D3 | 898 | -0.1289 | [-0.209, -0.04882] |
| D4 | 899 | +0.0001937 | [-0.08539, +0.08577] |
| D5 | 899 | +0.08967 | [-0.009714, +0.1891] |
| D6 | 898 | +0.05837 | [-0.04291, +0.1597] |
| D7 | 899 | -0.00393 | [-0.1002, +0.09235] |
| D8 | 898 | -0.01271 | [-0.1036, +0.07822] |
| D9 | 899 | -0.03836 | [-0.1269, +0.05018] |
| D10 | 899 | -0.07588 | [-0.1744, +0.0226] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows rebuilt with the runner's own run() (hooks capture its outcome arrays). The pack bootstraps dates iid; the runner used 21-day moving blocks widened to a Monte-Carlo SE floor, so the runner's CI is the binding one. Halves split at the median row date (runner: 2023-08-18). The pack's placebo shuffles each row's side within instrument (the runner's placebo shifted the label grid in time). Registered P-bar +0.0029. Coin-entry P-bar held fixed at -0.0206 R.
