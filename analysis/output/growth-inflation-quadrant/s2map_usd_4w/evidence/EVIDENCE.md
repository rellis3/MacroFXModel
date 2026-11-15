# Evidence pack: growth-inflation-quadrant/s2map_usd_4w

Unit: sigma of 4w return. Useful bar: +0.08321. 4326 scored rows, 47 independent clusters, 7 instruments, 2003-10-10 → 2026-07-24. Prereg verdict: **null**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 86% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.1131 [-0.2077, -0.01385]. Shuffled-signal 95% band [-0.03449, +0.02013]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.0416) | 0% | +0.0416 |
| 1.0× bar (+0.08321) | 2% | +0.08321 |
| 2.0× bar (+0.1664) | 100% | +0.1664 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.7839 (clean -0.1131). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| audusd | 618 | -0.2248 | [-0.3819, -0.08663] |
| eurusd | 618 | -0.181 | [-0.3308, -0.02662] |
| gbpusd | 618 | -0.03995 | [-0.1608, +0.08338] |
| nzdusd | 618 | -0.1378 | [-0.2529, -0.005212] |
| usdcad | 618 | -0.1728 | [-0.3284, -0.01101] |
| usdchf | 618 | -0.05152 | [-0.1591, +0.04996] |
| usdjpy | 618 | +0.01596 | [-0.1251, +0.1499] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2004 | 168 | -0.5874 | [-0.9268, -0.1864] |
| 2005 | 217 | +0.2647 | [+0.08639, +0.7007] |
| 2006 | 112 | +0.461 | [-0.005775, +1.488] |
| 2007 | 231 | -0.2982 | [-0.4294, +0.189] |
| 2008 | 133 | -0.09531 | [-0.1551, -0.05185] |
| 2009 | 210 | +0.01288 | [-0.004579, +0.03035] |
| 2010 | 280 | -0.00704 | [-0.1206, +0.2039] |
| 2011 | 63 | +0.03512 | [-0.3045, +0.1322] |
| 2012 | 301 | +0.01439 | [-0.05786, +0.09749] |
| 2013 | 203 | -0.1366 | [-0.157, -0.1147] |
| 2014 | 182 | -0.5687 | [-0.7543, -0.3157] |
| 2015 | 175 | -0.2191 | [-0.4268, +0.1502] |
| 2016 | 210 | +0.2325 | [+0.08424, +0.7198] |
| 2017 | 189 | -0.3476 | [-0.4943, -0.09807] |
| 2018 | 238 | -0.1185 | [-0.157, -0.1067] |
| 2019 | 154 | +0.06709 | [-0.1296, +0.4113] |
| 2020 | 189 | -0.7892 | [-0.8269, -0.6573] |
| 2021 | 154 | -0.1379 | [-0.405, +0.04692] |
| 2022 | 147 | -0.4936 | [-1.058, +0.2583] |
| 2023 | 364 | -0.0313 | [-0.05049, -0.0121] |
| 2024 | 196 | +0.2128 | [+0.1553, +0.3341] |
| 2025 | 119 | -0.09698 | [-0.3355, +0.06995] |
| 2026 | 70 | -0.1092 | [-0.3875, +1.004] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 2170 | -0.1022 | [-0.2578, +0.05165] |
| H2 | 2156 | -0.1241 | [-0.285, +0.004112] |

Without the largest 1% of rows: -0.09615.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| deflation | 2646 | -0.1214 | [-0.1568, -0.08603] |
| goldilocks | 1680 | +0.1 | [+0.04333, +0.1567] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = (instrument, Friday) where the map takes a side; outcome = forward z demeaned per instrument (B0). Cluster = calendar half-year. CAUTION: the pack's shuffled placebo permutes the side row by row, which breaks the quadrant's persistence and makes its band too narrow; the registered placebo is the circular shift in results.json (placebo_p97_5). Leak = side set to the sign of the realised outcome. Plants are added to the real rows AFTER removing the real estimate (prereg amendment A1).
