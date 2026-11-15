# Evidence pack: regime-picks-rule C1-hmm

Unit: R per instrument-session. Useful bar: +0.04. 20163 scored rows, 74 independent clusters, 13 instruments, 2020-08-24 → 2026-08-20. Prereg verdict: **NULL**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 0% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** +0 [+0, +0]. Shuffled-signal 95% band [+0, +0]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.02) | 0% | +0 |
| 1.0× bar (+0.04) | 0% | +0 |
| 2.0× bar (+0.08) | 0% | +0 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.02909 (clean +0). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1554 | +0 | [+0, +0] |
| EURJPY | 1553 | +0 | [+0, +0] |
| EURUSD | 1554 | +0 | [+0, +0] |
| GBPJPY | 1554 | +0 | [+0, +0] |
| GBPUSD | 1554 | +0 | [+0, +0] |
| GOLD | 1546 | +0 | [+0, +0] |
| NQ | 1544 | +0 | [+0, +0] |
| NZDUSD | 1554 | +0 | [+0, +0] |
| SPX500 | 1544 | +0 | [+0, +0] |
| US30 | 1544 | +0 | [+0, +0] |
| USDCAD | 1554 | +0 | [+0, +0] |
| USDCHF | 1554 | +0 | [+0, +0] |
| USDJPY | 1554 | +0 | [+0, +0] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2020 | 1209 | +0 | [+0, +0] |
| 2021 | 3371 | +0 | [+0, +0] |
| 2022 | 3350 | +0 | [+0, +0] |
| 2023 | 3359 | +0 | [+0, +0] |
| 2024 | 3376 | +0 | [+0, +0] |
| 2025 | 3357 | +0 | [+0, +0] |
| 2026 | 2141 | +0 | [+0, +0] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 10093 | +0 | [+0, +0] |
| H2 | 10070 | +0 | [+0, +0] |

Without the largest 1% of rows: +0.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| HIGH | 3758 | -0.0626 | [-0.09946, -0.02574] |
| LOW | 12408 | -0.06409 | [-0.08493, -0.04325] |
| MID | 3997 | -0.03026 | [-0.06934, +0.008806] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = test instrument-sessions 2020-08-24 -> 2026-08-21, 13 instruments; unit R per instrument-session; cluster = 21-session date block. C1: outcome = the regime book's net R (flat sessions carry the mean of the three rules' R with side 0, so estimate = book mean). The pack's placebo shuffles side within instrument; the registered noise threshold is the run's regime-label block shuffle (RESULTS.md). Leak: smoothed (forward-backward) HMM labels re-picked.
