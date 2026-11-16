# Evidence pack: mtf-structure-hmm

Unit: hit-rate excess over B0. Useful bar: +0.03. 13401 scored rows, 107 independent clusters, 13 instruments, 2018-01-02 → 2026-08-19. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 62% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** -0.003828 [-0.01367, +0.006376]. Shuffled-signal 95% band [-0.007193, +0.001543]; the real estimate sits at the 30th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.015) | 78% | +0.01117 |
| 1.0× bar (+0.03) | 100% | +0.02617 |
| 2.0× bar (+0.06) | 100% | +0.05617 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.007531 (clean -0.003828). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 649 | -0.009914 | [-0.04687, +0.01919] |
| EURJPY | 1243 | +0.00954 | [-0.01199, +0.03224] |
| EURUSD | 1059 | -0.03943 | [-0.06345, -0.01696] |
| GBPJPY | 652 | +0.0427 | [+0.007311, +0.06955] |
| GBPUSD | 594 | -0.05384 | [-0.0871, -0.01912] |
| GOLD | 2052 | +0.008454 | [-0.01563, +0.02842] |
| NAS100 | 1284 | -0.01626 | [-0.0438, +0.01129] |
| NZDUSD | 689 | -0.006606 | [-0.05337, +0.02649] |
| SPX500 | 1350 | -0.003828 | [-0.02897, +0.01943] |
| US30 | 1694 | -0.02268 | [-0.04649, -0.001051] |
| USDCAD | 949 | +0.004524 | [-0.02852, +0.0371] |
| USDCHF | 388 | -0.0125 | [-0.05742, +0.04008] |
| USDJPY | 798 | +0.05189 | [+0.0191, +0.08413] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 1675 | -0.02663 | [-0.06004, +0.008636] |
| 2019 | 1163 | +0.01341 | [-0.01693, +0.04665] |
| 2020 | 916 | +0.01505 | [-0.01128, +0.03607] |
| 2021 | 1802 | +0.0007053 | [-0.02992, +0.03109] |
| 2022 | 1327 | -0.03384 | [-0.07589, +0.01532] |
| 2023 | 1439 | -0.009504 | [-0.03951, +0.02124] |
| 2024 | 1995 | +0.01738 | [-0.0005298, +0.03383] |
| 2025 | 1920 | -0.005273 | [-0.02287, +0.01073] |
| 2026 | 1164 | -0.002839 | [-0.03202, +0.04571] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 6704 | -0.01057 | [-0.02415, +0.007935] |
| H2 | 6697 | +0.002926 | [-0.008386, +0.01303] |

Without the largest 1% of rows: +0.001436.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1.0 | 2806 | +0.01559 | [-0.0029, +0.03409] |
| 1.0 | 10595 | -0.0007113 | [-0.01021, +0.008788] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Family hmm, horizon 24h (07:00 London to the next session 07:00). Outcome = y - B0 (point-in-time base rate), so the estimate is the hit-rate excess over B0 (called days). Cluster = 21-session date block. leak_fn = smoothed-HMM alignment side (forward-backward over the test year). The pack placebo shuffles rows within instrument (row-level); the registered noise test in RESULTS.md shuffles whole 21-session date blocks.
