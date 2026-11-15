# Evidence pack: growth-inflation-quadrant/map_usd_4w

Unit: sigma of 4w return. Useful bar: +0.08321. 3087 scored rows, 35 independent clusters, 7 instruments, 2009-08-21 → 2026-07-24. Prereg verdict: **null**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.06678 [-0.2045, +0.0612]. Shuffled-signal 95% band [-0.03068, +0.03319]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.0416) | 0% | +0.0416 |
| 1.0× bar (+0.08321) | 0% | +0.08321 |
| 2.0× bar (+0.1664) | 100% | +0.1664 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.747 (clean -0.06678). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| audusd | 441 | -0.1078 | [-0.2589, +0.03479] |
| eurusd | 441 | -0.113 | [-0.2942, +0.09844] |
| gbpusd | 441 | -0.039 | [-0.1685, +0.121] |
| nzdusd | 441 | -0.07005 | [-0.1773, +0.05046] |
| usdcad | 441 | -0.01535 | [-0.1458, +0.1337] |
| usdchf | 441 | -0.07928 | [-0.2358, +0.08733] |
| usdjpy | 441 | -0.04307 | [-0.2271, +0.1353] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2009 | 91 | +0.2568 | [+0.2568, +0.2568] |
| 2010 | 175 | -0.3049 | [-0.5913, -0.04048] |
| 2011 | 105 | +0.04478 | [-0.4189, +0.1161] |
| 2012 | 189 | -0.1243 | [-0.1395, -0.119] |
| 2013 | 133 | -0.2138 | [-0.4422, -0.08063] |
| 2014 | 196 | -0.6503 | [-1.095, +0.03656] |
| 2015 | 196 | -0.1571 | [-0.4325, +0.04945] |
| 2016 | 203 | -0.1576 | [-0.2039, +0.02006] |
| 2017 | 147 | +0.507 | [+0.3389, +0.5742] |
| 2018 | 182 | -0.05737 | [-0.2649, +0.01907] |
| 2019 | 196 | -0.03247 | [-0.05188, -0.01008] |
| 2020 | 189 | -0.21 | [-0.2807, -0.1338] |
| 2021 | 182 | -0.2764 | [-0.3061, -0.2203] |
| 2022 | 259 | -0.1947 | [-0.4618, -0.09576] |
| 2023 | 259 | +0.1989 | [-0.158, +0.537] |
| 2024 | 133 | +0.6411 | [+0.08709, +0.7888] |
| 2025 | 105 | +0.03697 | [-0.252, +0.3672] |
| 2026 | 147 | +0.02285 | [-0.1868, +0.914] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 1547 | -0.1341 | [-0.3121, +0.03539] |
| H2 | 1540 | +0.0008848 | [-0.1299, +0.2014] |

Without the largest 1% of rows: -0.05667.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| deflation | 1624 | -0.0702 | [-0.1158, -0.02456] |
| goldilocks | 1463 | +0.06299 | [+0.01076, +0.1152] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = (instrument, Friday) where the map takes a side; outcome = forward z demeaned per instrument (B0). Cluster = calendar half-year. CAUTION: the pack's shuffled placebo permutes the side row by row, which breaks the quadrant's persistence and makes its band too narrow; the registered placebo is the circular shift in results.json (placebo_p97_5). Leak = side set to the sign of the realised outcome. Plants are added to the real rows AFTER removing the real estimate (prereg amendment A1).
