# Evidence pack: growth-inflation-quadrant/s2map_indices_4w

Unit: sigma of 4w return. Useful bar: +0.08321. 2356 scored rows, 46 independent clusters, 2 instruments, 2004-01-02 → 2026-07-24. Prereg verdict: **null**.

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

**Headline:** -0.07373 [-0.1734, +0.02667]. Shuffled-signal 95% band [-0.04484, +0.04133]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.0416) | 0% | +0.0416 |
| 1.0× bar (+0.08321) | 8% | +0.08321 |
| 2.0× bar (+0.1664) | 100% | +0.1664 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.7724 (clean -0.07373). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| nas100 | 1178 | -0.0668 | [-0.154, +0.02005] |
| spx500 | 1178 | -0.08066 | [-0.1625, +0.04669] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2004 | 106 | -0.3933 | [-0.4665, -0.3173] |
| 2005 | 104 | -0.1829 | [-0.3832, +0.03348] |
| 2006 | 104 | -0.2844 | [-0.4318, -0.1369] |
| 2007 | 104 | +0.2037 | [-0.07974, +0.4871] |
| 2008 | 104 | +0.7539 | [+0.3242, +1.184] |
| 2009 | 104 | -0.001737 | [-0.0276, +0.02412] |
| 2010 | 106 | -0.1555 | [-0.316, -0.000839] |
| 2011 | 104 | -0.3038 | [-0.5383, -0.05054] |
| 2012 | 104 | +0.01027 | [-0.02336, +0.0439] |
| 2013 | 104 | -0.2084 | [-0.4127, -0.004164] |
| 2014 | 104 | +0.1207 | [-0.03593, +0.2774] |
| 2015 | 104 | +0.2881 | [+0.1518, +0.4245] |
| 2016 | 106 | -0.01674 | [-0.2576, +0.2334] |
| 2017 | 104 | -0.3256 | [-0.4317, -0.2194] |
| 2018 | 104 | +0.02406 | [-0.04341, +0.09153] |
| 2019 | 104 | +0.08674 | [-0.0005623, +0.174] |
| 2020 | 104 | -0.4967 | [-0.9519, -0.04148] |
| 2021 | 106 | +0.04088 | [-0.1153, +0.1912] |
| 2022 | 104 | +0.03471 | [-0.1117, +0.1702] |
| 2023 | 104 | -0.2084 | [-0.2924, -0.1244] |
| 2024 | 104 | -0.0999 | [-0.2512, +0.05137] |
| 2025 | 104 | -0.4122 | [-0.7102, -0.1142] |
| 2026 | 60 | -0.232 | [-0.305, +0.2425] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 1180 | -0.03665 | [-0.1664, +0.1235] |
| H2 | 1176 | -0.1109 | [-0.2342, +0.02309] |

Without the largest 1% of rows: -0.06664.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| deflation | 754 | +0.1444 | [+0.08499, +0.2039] |
| goldilocks | 476 | -0.1387 | [-0.2523, -0.02514] |
| reflation | 508 | -0.04102 | [-0.1344, +0.05239] |
| stagflation | 618 | -0.03567 | [-0.132, +0.06071] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = (instrument, Friday) where the map takes a side; outcome = forward z demeaned per instrument (B0). Cluster = calendar half-year. CAUTION: the pack's shuffled placebo permutes the side row by row, which breaks the quadrant's persistence and makes its band too narrow; the registered placebo is the circular shift in results.json (placebo_p97_5). Leak = side set to the sign of the realised outcome. Plants are added to the real rows AFTER removing the real estimate (prereg amendment A1).
