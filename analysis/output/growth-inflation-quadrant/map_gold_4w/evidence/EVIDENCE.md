# Evidence pack: growth-inflation-quadrant/map_gold_4w

Unit: sigma of 4w return. Useful bar: +0.08321. 669 scored rows, 36 independent clusters, 1 instruments, 2009-05-29 → 2026-07-24. Prereg verdict: **underpowered**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | False |
| beats placebo 97 5 | True |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.1318 [+0.01596, +0.262]. Shuffled-signal 95% band [-0.05694, +0.084]; the real estimate sits at the 100th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.0416) | 0% | +0.0416 |
| 1.0× bar (+0.08321) | 0% | +0.08321 |
| 2.0× bar (+0.1664) | 100% | +0.1664 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.8301 (clean +0.1318). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| xauusd | 669 | +0.1318 | [+0.0151, +0.2542] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2011 | 38 | +0.2655 | [+0.1474, +0.5553] |
| 2012 | 37 | -0.0218 | [-0.09632, +0.1543] |
| 2013 | 36 | -0.1745 | [-0.4614, +0.2763] |
| 2014 | 37 | +0.1714 | [-0.1076, +0.4996] |
| 2015 | 49 | -0.2302 | [-0.3661, -0.07651] |
| 2016 | 49 | +0.4955 | [+0.36, +0.6154] |
| 2017 | 41 | -0.08252 | [-0.2202, +0.1561] |
| 2018 | 35 | +0.3305 | [+0.1639, +0.8115] |
| 2019 | 52 | +0.3672 | [+0.2524, +0.482] |
| 2020 | 35 | +0.2451 | [+0.1309, +0.353] |
| 2021 | 34 | +0.2304 | [+0.04851, +0.7355] |
| 2022 | 41 | +0.4728 | [+0.1855, +1.027] |
| 2023 | 45 | -0.1041 | [-0.1168, -0.09477] |
| 2024 | 32 | -0.2541 | [-0.3398, +0.1176] |
| 2025 | 40 | +0.7417 | [+0.4587, +0.894] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 335 | +0.01093 | [-0.1552, +0.1538] |
| H2 | 334 | +0.2531 | [+0.07417, +0.4428] |

Without the largest 1% of rows: +0.1172.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| deflation | 232 | +0.1367 | [-0.002403, +0.2759] |
| goldilocks | 209 | -0.1636 | [-0.2943, -0.03287] |
| stagflation | 228 | +0.09765 | [-0.05034, +0.2456] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = (instrument, Friday) where the map takes a side; outcome = forward z demeaned per instrument (B0). Cluster = calendar half-year. CAUTION: the pack's shuffled placebo permutes the side row by row, which breaks the quadrant's persistence and makes its band too narrow; the registered placebo is the circular shift in results.json (placebo_p97_5). Leak = side set to the sign of the realised outcome. Plants are added to the real rows AFTER removing the real estimate (prereg amendment A1).
