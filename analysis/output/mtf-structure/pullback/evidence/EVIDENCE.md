# Evidence pack: mtf-structure-pullback

Unit: hit-rate excess over B0. Useful bar: +0.03. 5196 scored rows, 107 independent clusters, 13 instruments, 2018-01-02 → 2026-08-19. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 69% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.007521 [-0.009495, +0.0245]. Shuffled-signal 95% band [-0.00829, +0.01436]; the real estimate sits at the 79th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.015) | 100% | +0.02252 |
| 1.0× bar (+0.03) | 100% | +0.03752 |
| 2.0× bar (+0.06) | 100% | +0.06752 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.4983 (clean +0.007521). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 421 | +0.01319 | [-0.03131, +0.05367] |
| EURJPY | 381 | +0.0108 | [-0.03282, +0.06992] |
| EURUSD | 438 | +0.01079 | [-0.03024, +0.05182] |
| GBPJPY | 372 | +0.005588 | [-0.04093, +0.06053] |
| GBPUSD | 406 | +0.01177 | [-0.02905, +0.04982] |
| GOLD | 352 | +0.04031 | [-0.005319, +0.08509] |
| NAS100 | 367 | +0.005468 | [-0.04051, +0.05385] |
| NZDUSD | 432 | -0.008802 | [-0.06234, +0.0347] |
| SPX500 | 371 | +0.03808 | [-0.006327, +0.0885] |
| US30 | 376 | -0.007094 | [-0.04894, +0.04572] |
| USDCAD | 449 | -0.01144 | [-0.05042, +0.03637] |
| USDCHF | 422 | -0.01668 | [-0.05328, +0.02296] |
| USDJPY | 409 | +0.01504 | [-0.03448, +0.07218] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 592 | -0.004172 | [-0.06306, +0.05301] |
| 2019 | 608 | -0.008956 | [-0.05897, +0.03466] |
| 2020 | 606 | -0.004452 | [-0.0669, +0.06949] |
| 2021 | 574 | +0.007394 | [-0.03096, +0.04816] |
| 2022 | 675 | +0.03998 | [-0.01879, +0.103] |
| 2023 | 552 | -0.0007367 | [-0.03516, +0.03853] |
| 2024 | 629 | +0.01609 | [-0.0291, +0.05467] |
| 2025 | 573 | +0.003408 | [-0.03055, +0.04723] |
| 2026 | 387 | +0.01756 | [-0.0305, +0.05217] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 2602 | -0.001506 | [-0.02494, +0.02389] |
| H2 | 2594 | +0.01658 | [-0.00293, +0.03682] |

Without the largest 1% of rows: +0.01274.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1.0 | 2019 | +0.005091 | [-0.01674, +0.02692] |
| 1.0 | 3177 | +0.01554 | [-0.001791, +0.03286] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Family pullback, horizon 24h (07:00 London to the next session 07:00). Outcome = y - B0 (point-in-time base rate), so the estimate is the hit-rate excess over B0 (called days). Cluster = 21-session date block. leak_fn = tomorrow's (the 24h outcome's) sign. The pack placebo shuffles rows within instrument (row-level); the registered noise test in RESULTS.md shuffles whole 21-session date blocks.
