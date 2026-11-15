# Evidence pack: growth-inflation-quadrant/map_indices_4w

Unit: sigma of 4w return. Useful bar: +0.08321. 1792 scored rows, 36 independent clusters, 2 instruments, 2009-05-29 → 2026-07-24. Prereg verdict: **underpowered**.

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

**Headline:** +0.01796 [-0.07767, +0.1233]. Shuffled-signal 95% band [-0.04667, +0.04848]; the real estimate sits at the 77th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.0416) | 0% | +0.0416 |
| 1.0× bar (+0.08321) | 2% | +0.08321 |
| 2.0× bar (+0.1664) | 100% | +0.1664 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.735 (clean +0.01796). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| nas100 | 896 | +0.03486 | [-0.07925, +0.1284] |
| spx500 | 896 | +0.001059 | [-0.1128, +0.1146] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2009 | 62 | +0.01184 | [-0.02234, +0.1895] |
| 2010 | 106 | -0.1793 | [-0.3709, +0.005262] |
| 2011 | 104 | +0.1357 | [-0.1268, +0.3788] |
| 2012 | 104 | -0.1525 | [-0.3224, +0.0175] |
| 2013 | 104 | -0.115 | [-0.2887, +0.05858] |
| 2014 | 104 | -0.1287 | [-0.2922, +0.03481] |
| 2015 | 104 | +0.2441 | [+0.02951, +0.4586] |
| 2016 | 106 | -0.0004628 | [-0.01638, +0.01486] |
| 2017 | 104 | -0.2663 | [-0.8382, +0.3057] |
| 2018 | 104 | +0.1069 | [-0.0008643, +0.2146] |
| 2019 | 104 | -0.1462 | [-0.2353, -0.05708] |
| 2020 | 104 | -0.01977 | [-0.1356, +0.09602] |
| 2021 | 106 | +0.1639 | [+0.1185, +0.2076] |
| 2022 | 104 | -0.005838 | [-0.4408, +0.3969] |
| 2023 | 104 | +0.1797 | [-0.2375, +0.5968] |
| 2024 | 104 | +0.07483 | [-0.05561, +0.2053] |
| 2025 | 104 | +0.06393 | [-0.05227, +0.1801] |
| 2026 | 60 | +0.6027 | [+0.1876, +0.6665] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 898 | -0.05314 | [-0.1962, +0.06868] |
| H2 | 894 | +0.08937 | [-0.03134, +0.2221] |

Without the largest 1% of rows: +0.01448.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| deflation | 464 | -0.01766 | [-0.09023, +0.05491] |
| goldilocks | 418 | -0.02942 | [-0.1152, +0.0564] |
| reflation | 454 | +0.06253 | [-0.05821, +0.1833] |
| stagflation | 456 | -0.01732 | [-0.124, +0.08939] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = (instrument, Friday) where the map takes a side; outcome = forward z demeaned per instrument (B0). Cluster = calendar half-year. CAUTION: the pack's shuffled placebo permutes the side row by row, which breaks the quadrant's persistence and makes its band too narrow; the registered placebo is the circular shift in results.json (placebo_p97_5). Leak = side set to the sign of the realised outcome. Plants are added to the real rows AFTER removing the real estimate (prereg amendment A1).
