# Evidence pack: mtf-structure-ema

Unit: hit-rate excess over B0. Useful bar: +0.03. 8539 scored rows, 107 independent clusters, 13 instruments, 2018-01-02 → 2026-08-19. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 54% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** -0.003432 [-0.01611, +0.009679]. Shuffled-signal 95% band [-0.009235, +0.006081]; the real estimate sits at the 36th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.015) | 5% | +0.01157 |
| 1.0× bar (+0.03) | 100% | +0.02657 |
| 2.0× bar (+0.06) | 100% | +0.05657 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.4983 (clean -0.003432). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 580 | -0.007853 | [-0.03999, +0.03032] |
| EURJPY | 711 | -0.01178 | [-0.04622, +0.01767] |
| EURUSD | 578 | -0.02243 | [-0.0641, +0.01432] |
| GBPJPY | 690 | +0.032 | [+0.001289, +0.06181] |
| GBPUSD | 521 | -0.008387 | [-0.0437, +0.02793] |
| GOLD | 691 | +0.007168 | [-0.0296, +0.03289] |
| NAS100 | 865 | -0.01537 | [-0.04862, +0.01078] |
| NZDUSD | 536 | +0.01307 | [-0.0361, +0.05686] |
| SPX500 | 847 | +0.00407 | [-0.03348, +0.02733] |
| US30 | 739 | -0.04241 | [-0.07525, -0.01228] |
| USDCAD | 534 | -0.02219 | [-0.06324, +0.01473] |
| USDCHF | 537 | +0.002078 | [-0.04636, +0.05025] |
| USDJPY | 710 | +0.02654 | [-0.01217, +0.0538] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 864 | -0.02674 | [-0.06787, +0.01362] |
| 2019 | 962 | +0.01632 | [-0.02706, +0.06317] |
| 2020 | 1107 | +0.01333 | [-0.03978, +0.0521] |
| 2021 | 961 | -0.03399 | [-0.0773, +0.004377] |
| 2022 | 988 | +0.02579 | [-0.02175, +0.07225] |
| 2023 | 918 | -0.005175 | [-0.04225, +0.0235] |
| 2024 | 1116 | +0.0121 | [-0.02194, +0.05521] |
| 2025 | 1044 | -0.009115 | [-0.02952, +0.01116] |
| 2026 | 579 | -0.04959 | [-0.0899, -0.02322] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 4275 | -0.002758 | [-0.02331, +0.01665] |
| H2 | 4264 | -0.004107 | [-0.02504, +0.01246] |

Without the largest 1% of rows: +0.002404.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1.0 | 2465 | +0.00118 | [-0.01856, +0.02092] |
| 1.0 | 6074 | -0.004346 | [-0.0169, +0.00821] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Family ema, horizon 24h (07:00 London to the next session 07:00). Outcome = y - B0 (point-in-time base rate), so the estimate is the hit-rate excess over B0 (called days). Cluster = 21-session date block. leak_fn = tomorrow's (the 24h outcome's) sign. The pack placebo shuffles rows within instrument (row-level); the registered noise test in RESULTS.md shuffles whole 21-session date blocks.
