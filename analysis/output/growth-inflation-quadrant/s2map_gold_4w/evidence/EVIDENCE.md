# Evidence pack: growth-inflation-quadrant/s2map_gold_4w

Unit: sigma of 4w return. Useful bar: +0.08321. 818 scored rows, 41 independent clusters, 1 instruments, 2006-12-29 → 2026-07-24. Prereg verdict: **underpowered**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | False |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.04513 [-0.06704, +0.166]. Shuffled-signal 95% band [-0.07032, +0.0537]; the real estimate sits at the 96th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.0416) | 0% | +0.0416 |
| 1.0× bar (+0.08321) | 0% | +0.08321 |
| 2.0× bar (+0.1664) | 100% | +0.1664 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.8123 (clean +0.04513). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| xauusd | 818 | +0.04513 | [-0.07757, +0.1591] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2007 | 52 | +0.3342 | [-0.09452, +0.7629] |
| 2008 | 52 | -0.2323 | [-0.4586, -0.006089] |
| 2009 | 43 | -0.09449 | [-0.1524, -0.05659] |
| 2010 | 44 | -0.06046 | [-0.08025, -0.03188] |
| 2012 | 52 | +0.2361 | [+0.2202, +0.2521] |
| 2013 | 40 | -0.08297 | [-0.4314, +0.5642] |
| 2014 | 34 | -0.1274 | [-0.1996, -0.03595] |
| 2015 | 51 | -0.205 | [-0.4234, +0.005065] |
| 2016 | 45 | -0.2691 | [-0.42, -0.04273] |
| 2017 | 43 | +0.07197 | [-0.04934, +0.1878] |
| 2018 | 36 | +0.1689 | [+0.09091, +0.1989] |
| 2019 | 43 | +0.2065 | [-0.2223, +0.8021] |
| 2021 | 38 | -0.1576 | [-0.2372, -0.08592] |
| 2022 | 47 | +0.1904 | [+0.1386, +0.2602] |
| 2023 | 52 | -0.05517 | [-0.1023, -0.008071] |
| 2024 | 35 | +0.1556 | [-0.07971, +0.237] |
| 2025 | 44 | +0.6541 | [+0.3079, +0.8938] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 410 | -0.06031 | [-0.2394, +0.115] |
| H2 | 408 | +0.1511 | [-0.01153, +0.3385] |

Without the largest 1% of rows: +0.03379.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| deflation | 340 | +0.06546 | [-0.03658, +0.1675] |
| goldilocks | 205 | -0.1233 | [-0.2689, +0.02219] |
| stagflation | 273 | -0.03892 | [-0.1717, +0.09383] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = (instrument, Friday) where the map takes a side; outcome = forward z demeaned per instrument (B0). Cluster = calendar half-year. CAUTION: the pack's shuffled placebo permutes the side row by row, which breaks the quadrant's persistence and makes its band too narrow; the registered placebo is the circular shift in results.json (placebo_p97_5). Leak = side set to the sign of the realised outcome. Plants are added to the real rows AFTER removing the real estimate (prereg amendment A1).
