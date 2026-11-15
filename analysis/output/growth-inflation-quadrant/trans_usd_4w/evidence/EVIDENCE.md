# Evidence pack: growth-inflation-quadrant/trans_usd_4w

Unit: sigma of 4w return. Useful bar: +0.08321. 343 scored rows, 31 independent clusters, 7 instruments, 2009-08-21 → 2026-05-22. Prereg verdict: **underpowered**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | False |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 57% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.01551 [-0.1811, +0.1339]. Shuffled-signal 95% band [-0.08728, +0.09453]; the real estimate sits at the 34th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.0416) | 0% | +0.0416 |
| 1.0× bar (+0.08321) | 0% | +0.08321 |
| 2.0× bar (+0.1664) | 60% | +0.1664 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.724 (clean -0.01551). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| audusd | 49 | -0.1799 | [-0.394, -0.008685] |
| eurusd | 49 | +0.05738 | [-0.1726, +0.3043] |
| gbpusd | 49 | -0.004485 | [-0.2193, +0.1864] |
| nzdusd | 49 | -0.006408 | [-0.2916, +0.2504] |
| usdcad | 49 | -0.09114 | [-0.2642, +0.06048] |
| usdchf | 49 | +0.003828 | [-0.2557, +0.2404] |
| usdjpy | 49 | +0.1121 | [-0.1949, +0.4169] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2019 | 42 | +0.04809 | [-0.04725, +0.5248] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 175 | -0.08406 | [-0.301, +0.06628] |
| H2 | 168 | +0.0559 | [-0.236, +0.3078] |

Without the largest 1% of rows: -0.03579.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| deflation | 168 | -0.1923 | [-0.3231, -0.06141] |
| goldilocks | 175 | -0.1542 | [-0.2921, -0.01619] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = (instrument, Friday) where the map takes a side; outcome = forward z demeaned per instrument (B0). Cluster = calendar half-year. CAUTION: the pack's shuffled placebo permutes the side row by row, which breaks the quadrant's persistence and makes its band too narrow; the registered placebo is the circular shift in results.json (placebo_p97_5). Leak = side set to the sign of the realised outcome. Plants are added to the real rows AFTER removing the real estimate (prereg amendment A1).
