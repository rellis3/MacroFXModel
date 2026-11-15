# Evidence pack: regime-picks-rule forced-chain (post-hoc, descriptive)

Unit: R per instrument-session. Useful bar: +0.04. 20163 scored rows, 74 independent clusters, 13 instruments, 2020-08-24 → 2026-08-20. Prereg verdict: **descriptive (A1)**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 85% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.05791 [-0.0902, -0.02667]. Shuffled-signal 95% band [-0.05791, -0.05791]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.02) | 0% | -0.03791 |
| 1.0× bar (+0.04) | 0% | -0.01791 |
| 2.0× bar (+0.08) | 0% | +0.02209 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1.31 (clean -0.05791). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1554 | -0.07125 | [-0.1201, -0.02504] |
| EURJPY | 1553 | -0.05125 | [-0.1086, +0.006577] |
| EURUSD | 1554 | -0.163 | [-0.2517, -0.09024] |
| GBPJPY | 1554 | -0.03343 | [-0.08972, +0.02699] |
| GBPUSD | 1554 | -0.1102 | [-0.182, -0.0311] |
| GOLD | 1546 | -0.04703 | [-0.116, +0.02848] |
| NQ | 1544 | +0.04157 | [-0.05555, +0.1359] |
| NZDUSD | 1554 | -0.08919 | [-0.1295, -0.04071] |
| SPX500 | 1544 | -0.003086 | [-0.08796, +0.08838] |
| US30 | 1544 | -0.02089 | [-0.09413, +0.05662] |
| USDCAD | 1554 | -0.1305 | [-0.1893, -0.07021] |
| USDCHF | 1554 | -0.09583 | [-0.1684, -0.01629] |
| USDJPY | 1554 | +0.02259 | [-0.02725, +0.08839] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2020 | 1209 | +0.01715 | [-0.08739, +0.07409] |
| 2021 | 3371 | -0.04954 | [-0.1574, +0.0445] |
| 2022 | 3350 | -0.0004309 | [-0.03572, +0.04017] |
| 2023 | 3359 | -0.1275 | [-0.2481, +0.01102] |
| 2024 | 3376 | -0.08317 | [-0.1386, -0.03467] |
| 2025 | 3357 | -0.06477 | [-0.09381, -0.03647] |
| 2026 | 2141 | -0.04377 | [-0.09562, +0.004828] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 10093 | -0.02618 | [-0.07407, +0.01978] |
| H2 | 10070 | -0.08972 | [-0.1317, -0.05384] |

Without the largest 1% of rows: -0.1542.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| DN-HI | 4727 | -0.02175 | [-0.04566, +0.002157] |
| DN-LO | 3883 | -0.09044 | [-0.145, -0.03592] |
| UP-HI | 4603 | -0.04833 | [-0.07208, -0.02458] |
| UP-LO | 6950 | -0.07069 | [-0.1166, -0.02474] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

POST-HOC (amendment A1). The forced picker takes the best training-mean rule per regime at each quarterly refit even when that mean is negative. Not scored.
