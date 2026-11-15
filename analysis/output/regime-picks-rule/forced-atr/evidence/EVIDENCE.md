# Evidence pack: regime-picks-rule forced-atr (post-hoc, descriptive)

Unit: R per instrument-session. Useful bar: +0.04. 20163 scored rows, 74 independent clusters, 13 instruments, 2020-08-24 → 2026-08-20. Prereg verdict: **descriptive (A1)**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 92% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.04301 [-0.06443, -0.02054]. Shuffled-signal 95% band [-0.04301, -0.04301]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.02) | 0% | -0.02301 |
| 1.0× bar (+0.04) | 0% | -0.003012 |
| 2.0× bar (+0.08) | 100% | +0.03699 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1.31 (clean -0.04301). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1554 | -0.03997 | [-0.08625, +0.01781] |
| EURJPY | 1553 | -0.07105 | [-0.1149, -0.01785] |
| EURUSD | 1554 | -0.03767 | [-0.1012, +0.02065] |
| GBPJPY | 1554 | -0.04964 | [-0.1093, +0.01439] |
| GBPUSD | 1554 | -0.03088 | [-0.08655, +0.05435] |
| GOLD | 1546 | -0.01972 | [-0.09111, +0.05326] |
| NQ | 1544 | +0.02472 | [-0.04742, +0.09772] |
| NZDUSD | 1554 | -0.03715 | [-0.1072, +0.006682] |
| SPX500 | 1544 | -0.06526 | [-0.1234, -0.003489] |
| US30 | 1544 | -0.03097 | [-0.1135, +0.05295] |
| USDCAD | 1554 | -0.09496 | [-0.1524, -0.04382] |
| USDCHF | 1554 | -0.05689 | [-0.1313, +0.04653] |
| USDJPY | 1554 | -0.04924 | [-0.09165, -0.0007448] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2020 | 1209 | -0.06525 | [-0.136, +0.01222] |
| 2021 | 3371 | -0.04005 | [-0.07183, -0.008758] |
| 2022 | 3350 | -0.05536 | [-0.0987, -0.0158] |
| 2023 | 3359 | -0.04962 | [-0.09162, -0.006615] |
| 2024 | 3376 | -0.02556 | [-0.07825, +0.01803] |
| 2025 | 3357 | -0.05128 | [-0.1197, +0.03008] |
| 2026 | 2141 | -0.02 | [-0.1007, +0.05943] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 10093 | -0.04777 | [-0.06762, -0.02628] |
| H2 | 10070 | -0.03824 | [-0.07398, -0.0004489] |

Without the largest 1% of rows: -0.1198.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| HIGH | 6215 | -0.02048 | [-0.06394, +0.02297] |
| LOW | 8362 | -0.04629 | [-0.06494, -0.02765] |
| MID | 5586 | -0.06317 | [-0.09554, -0.03079] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

POST-HOC (amendment A1). The forced picker takes the best training-mean rule per regime at each quarterly refit even when that mean is negative. Not scored.
