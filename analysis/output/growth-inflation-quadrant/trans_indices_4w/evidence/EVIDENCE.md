# Evidence pack: growth-inflation-quadrant/trans_indices_4w

Unit: sigma of 4w return. Useful bar: +0.08321. 202 scored rows, 34 independent clusters, 2 instruments, 2009-07-17 → 2026-05-22. Prereg verdict: **null**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.183 [-0.4907, +0.0607]. Shuffled-signal 95% band [-0.1883, +0.1708]; the real estimate sits at the 3th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.0416) | 0% | +0.0416 |
| 1.0× bar (+0.08321) | 0% | +0.08321 |
| 2.0× bar (+0.1664) | 0% | +0.1664 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.7973 (clean -0.183). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| nas100 | 101 | -0.1356 | [-0.4743, +0.09134] |
| spx500 | 101 | -0.2303 | [-0.534, +0.04451] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 102 | -0.01626 | [-0.2749, +0.2158] |
| H2 | 100 | -0.353 | [-0.9089, +0.0265] |

Without the largest 1% of rows: -0.06482.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| deflation | 48 | +0.339 | [+0.1118, +0.5662] |
| goldilocks | 50 | +0.1126 | [-0.145, +0.3702] |
| reflation | 50 | -0.2878 | [-0.9471, +0.3715] |
| stagflation | 54 | +0.2209 | [+0.01252, +0.4292] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = (instrument, Friday) where the map takes a side; outcome = forward z demeaned per instrument (B0). Cluster = calendar half-year. CAUTION: the pack's shuffled placebo permutes the side row by row, which breaks the quadrant's persistence and makes its band too narrow; the registered placebo is the circular shift in results.json (placebo_p97_5). Leak = side set to the sign of the realised outcome. Plants are added to the real rows AFTER removing the real estimate (prereg amendment A1).
