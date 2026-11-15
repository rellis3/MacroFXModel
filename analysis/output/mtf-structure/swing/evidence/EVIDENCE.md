# Evidence pack: mtf-structure-swing

Unit: hit-rate excess over B0. Useful bar: +0.03. 558 scored rows, 99 independent clusters, 13 instruments, 2018-01-03 → 2026-08-18. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 58% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.02585 [-0.07638, +0.01882]. Shuffled-signal 95% band [-0.04956, +0.01847]; the real estimate sits at the 25th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.015) | 0% | -0.01085 |
| 1.0× bar (+0.03) | 0% | +0.004154 |
| 2.0× bar (+0.06) | 0% | +0.03415 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.5012 (clean -0.02585). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| EURJPY | 49 | +0.03654 | [-0.09041, +0.175] |
| EURUSD | 41 | -0.01102 | [-0.1754, +0.1708] |
| GBPJPY | 67 | -0.06986 | [-0.1697, +0.002491] |
| GBPUSD | 35 | -0.07359 | [-0.2518, +0.06611] |
| GOLD | 42 | -0.1492 | [-0.3104, +0.02699] |
| NAS100 | 66 | -0.05707 | [-0.1944, +0.06805] |
| NZDUSD | 38 | -0.001494 | [-0.156, +0.1102] |
| SPX500 | 43 | +0.03904 | [-0.1605, +0.1788] |
| US30 | 34 | +0.005238 | [-0.142, +0.16] |
| USDCAD | 40 | +0.1245 | [-0.0006697, +0.2479] |
| USDCHF | 38 | -0.07716 | [-0.2389, +0.08532] |
| USDJPY | 37 | +0.04552 | [-0.1024, +0.1624] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 50 | -0.1555 | [-0.2827, -0.02344] |
| 2019 | 52 | +0.1227 | [+0.008352, +0.2035] |
| 2020 | 82 | -0.002208 | [-0.1714, +0.1031] |
| 2021 | 73 | -0.1356 | [-0.2988, +0.01133] |
| 2022 | 81 | +0.08538 | [-0.07853, +0.2099] |
| 2023 | 64 | -0.04081 | [-0.1905, +0.06934] |
| 2024 | 55 | -0.1365 | [-0.2562, -0.02461] |
| 2025 | 64 | +0.008725 | [-0.1239, +0.1439] |
| 2026 | 37 | -0.008046 | [-0.1339, +0.1443] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 280 | -0.02987 | [-0.1124, +0.0376] |
| H2 | 278 | -0.0218 | [-0.07675, +0.04657] |

Without the largest 1% of rows: -0.01984.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1.0 | 172 | +0.02866 | [-0.04668, +0.104] |
| 1.0 | 386 | -0.02459 | [-0.07466, +0.02547] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Family swing, horizon 24h (07:00 London to the next session 07:00). Outcome = y - B0 (point-in-time base rate), so the estimate is the hit-rate excess over B0 (called days). Cluster = 21-session date block. leak_fn = tomorrow's (the 24h outcome's) sign. The pack placebo shuffles rows within instrument (row-level); the registered noise test in RESULTS.md shuffles whole 21-session date blocks.
