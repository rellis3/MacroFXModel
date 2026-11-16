# Evidence pack: mtf-structure-conflict-hmm

Unit: hit-rate excess over B0. Useful bar: +0.02. 28993 scored rows, 107 independent clusters, 13 instruments, 2018-01-02 → 2026-08-19. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 77% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** -0.002645 [-0.01067, +0.005607]. Shuffled-signal 95% band [-0.002874, +0.007417]; the real estimate sits at the 3th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.01) | 10% | +0.007355 |
| 1.0× bar (+0.02) | 100% | +0.01736 |
| 2.0× bar (+0.04) | 100% | +0.03736 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.0006747 (clean -0.002645). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 2235 | -0.004472 | [-0.03474, +0.0289] |
| EURJPY | 2234 | -0.005096 | [-0.02065, +0.01294] |
| EURUSD | 2233 | -0.0176 | [-0.03879, -0.0003748] |
| GBPJPY | 2232 | +0.03768 | [+0.007623, +0.06571] |
| GBPUSD | 2236 | -0.03786 | [-0.07049, -0.01185] |
| GOLD | 2227 | -0.0006667 | [-0.005398, +0.002975] |
| NAS100 | 2225 | -0.01315 | [-0.0334, +0.001987] |
| NZDUSD | 2233 | -0.01105 | [-0.04885, +0.02012] |
| SPX500 | 2216 | -0.00538 | [-0.02436, +0.009475] |
| US30 | 2219 | -0.01279 | [-0.02431, -0.002684] |
| USDCAD | 2235 | +0.009424 | [-0.01526, +0.02924] |
| USDCHF | 2233 | -0.003381 | [-0.04657, +0.03875] |
| USDJPY | 2235 | +0.03177 | [+0.00287, +0.0616] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 3353 | -0.01894 | [-0.04299, +0.006918] |
| 2019 | 3352 | +0.01372 | [-0.01913, +0.04959] |
| 2020 | 3359 | +0.005118 | [-0.02082, +0.02901] |
| 2021 | 3370 | +0.005796 | [-0.01953, +0.03762] |
| 2022 | 3346 | -0.02121 | [-0.0601, +0.009146] |
| 2023 | 3356 | +0.00439 | [-0.02081, +0.03746] |
| 2024 | 3374 | +0.003403 | [-0.01199, +0.02031] |
| 2025 | 3353 | -0.01063 | [-0.0279, +0.005091] |
| 2026 | 2130 | -0.002888 | [-0.02155, +0.01441] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 14508 | -0.003061 | [-0.01682, +0.01256] |
| H2 | 14485 | -0.002371 | [-0.01096, +0.007668] |

Without the largest 1% of rows: +0.002434.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| 0 | 15592 | +0.006398 | [-0.001441, +0.01424] |
| 1 | 13401 | +0.002703 | [-0.005747, +0.01115] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Family conflict-hmm, horizon 24h (07:00 London to the next session 07:00). Outcome = y - B0 (point-in-time base rate), so the estimate is the hit-rate excess over B0 (kept minus all base-call days). Cluster = 21-session date block. leak_fn = smoothed-HMM D1 side and smoothed alignment as the kept flag. The pack placebo shuffles rows within instrument (row-level); the registered noise test in RESULTS.md shuffles whole 21-session date blocks.
