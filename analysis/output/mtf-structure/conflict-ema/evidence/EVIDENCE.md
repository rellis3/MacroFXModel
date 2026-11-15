# Evidence pack: mtf-structure-conflict-ema

Unit: hit-rate excess over B0. Useful bar: +0.02. 28993 scored rows, 107 independent clusters, 13 instruments, 2018-01-02 → 2026-08-19. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 69% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** -0.002687 [-0.01249, +0.008212]. Shuffled-signal 95% band [-0.005943, +0.01034]; the real estimate sits at the 17th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.01) | 0% | +0.007313 |
| 1.0× bar (+0.02) | 100% | +0.01731 |
| 2.0× bar (+0.04) | 100% | +0.03731 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.3513 (clean -0.002687). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 2235 | -0.007611 | [-0.04075, +0.02096] |
| EURJPY | 2234 | -6.958e-05 | [-0.0227, +0.02667] |
| EURUSD | 2233 | -0.01262 | [-0.04743, +0.01778] |
| GBPJPY | 2232 | +0.02891 | [+0.001044, +0.05616] |
| GBPUSD | 2236 | -0.01365 | [-0.04525, +0.01442] |
| GOLD | 2227 | -0.01436 | [-0.04088, +0.007612] |
| NAS100 | 2225 | -0.008182 | [-0.03219, +0.01399] |
| NZDUSD | 2233 | +0.02005 | [-0.01461, +0.05096] |
| SPX500 | 2216 | -0.004545 | [-0.02684, +0.01535] |
| US30 | 2219 | -0.02699 | [-0.05557, +0.00116] |
| USDCAD | 2235 | -0.01097 | [-0.04972, +0.01989] |
| USDCHF | 2233 | +0.00325 | [-0.04051, +0.0405] |
| USDJPY | 2235 | +0.01097 | [-0.01704, +0.03479] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 3353 | -0.02454 | [-0.06821, +0.00257] |
| 2019 | 3352 | +0.01991 | [-0.01047, +0.04914] |
| 2020 | 3359 | +0.003375 | [-0.03041, +0.03391] |
| 2021 | 3370 | -0.03508 | [-0.06719, +0.004872] |
| 2022 | 3346 | +0.01158 | [-0.03903, +0.04819] |
| 2023 | 3356 | +0.0138 | [-0.03219, +0.03326] |
| 2024 | 3374 | +0.0112 | [-0.01986, +0.05116] |
| 2025 | 3353 | -0.006331 | [-0.02282, +0.0112] |
| 2026 | 2130 | -0.04167 | [-0.07113, -0.02226] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 14508 | -0.006155 | [-0.02163, +0.008026] |
| H2 | 14485 | +0.0007453 | [-0.01449, +0.01299] |

Without the largest 1% of rows: +0.002629.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| 0 | 20454 | +0.007797 | [+0.0009561, +0.01464] |
| 1 | 8539 | -0.002751 | [-0.01334, +0.007844] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Family conflict-ema, horizon 24h (07:00 London to the next session 07:00). Outcome = y - B0 (point-in-time base rate), so the estimate is the hit-rate excess over B0 (kept minus all base-call days). Cluster = 21-session date block. leak_fn = tomorrow's sign on the kept rows. The pack placebo shuffles rows within instrument (row-level); the registered noise test in RESULTS.md shuffles whole 21-session date blocks.
