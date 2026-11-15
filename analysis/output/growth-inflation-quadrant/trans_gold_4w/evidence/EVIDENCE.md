# Evidence pack: growth-inflation-quadrant/trans_gold_4w

Unit: sigma of 4w return. Useful bar: +0.08321. 76 scored rows, 33 independent clusters, 1 instruments, 2009-08-21 → 2026-05-22. Prereg verdict: **underpowered**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | False |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** +0.193 [+0.01237, +0.4123]. Shuffled-signal 95% band [-0.1676, +0.2265]; the real estimate sits at the 95th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.0416) | 0% | +0.0416 |
| 1.0× bar (+0.08321) | 0% | +0.08321 |
| 2.0× bar (+0.1664) | 10% | +0.1664 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.7715 (clean +0.193). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| xauusd | 76 | +0.193 | [+0.005541, +0.3941] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 39 | +0.1459 | [-0.07952, +0.4699] |
| H2 | 37 | +0.2427 | [-0.09527, +0.5367] |


## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| deflation | 24 | +0.2326 | [-0.1438, +0.6091] |
| goldilocks | 25 | -0.1283 | [-0.5083, +0.2517] |
| stagflation | 27 | +0.2177 | [-0.1376, +0.5729] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = (instrument, Friday) where the map takes a side; outcome = forward z demeaned per instrument (B0). Cluster = calendar half-year. CAUTION: the pack's shuffled placebo permutes the side row by row, which breaks the quadrant's persistence and makes its band too narrow; the registered placebo is the circular shift in results.json (placebo_p97_5). Leak = side set to the sign of the realised outcome. Plants are added to the real rows AFTER removing the real estimate (prereg amendment A1).
