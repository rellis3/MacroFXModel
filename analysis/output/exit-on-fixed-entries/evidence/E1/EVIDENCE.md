# Evidence pack: exit-on-fixed-entries:E1

Unit: R per entry (E1 - E0, slope minus random entries, spread on). Useful bar: +0.05. 32738 scored rows, 2523 independent clusters, 13 instruments, 2016-11-21 → 2026-08-17. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 77% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** +0.01176 [-0.0001781, +0.02408]. Shuffled-signal 95% band [-0.007372, +0.0074]; the real estimate sits at the 100th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 100% | +0.03676 |
| 1.0× bar (+0.05) | 100% | +0.06176 |
| 2.0× bar (+0.1) | 100% | +0.1118 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.4084 (clean +0.01176). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 2523 | +0.01656 | [-0.009066, +0.0421] |
| EURJPY | 2522 | -0.00369 | [-0.02521, +0.02203] |
| EURUSD | 2523 | +0.002738 | [-0.01794, +0.02326] |
| GBPJPY | 2522 | +0.007198 | [-0.02608, +0.0367] |
| GBPUSD | 2523 | +0.01938 | [-0.003756, +0.0417] |
| GOLD | 2510 | +0.01701 | [-0.007323, +0.04391] |
| NAS100 | 2508 | +0.01345 | [-0.01526, +0.04004] |
| NZDUSD | 2522 | +0.02136 | [-0.002925, +0.04806] |
| SPX500 | 2508 | +0.02236 | [+0.0009043, +0.04488] |
| US30 | 2508 | +0.03997 | [+0.009642, +0.0653] |
| USDCAD | 2523 | +0.003643 | [-0.01864, +0.03116] |
| USDCHF | 2523 | -0.0007367 | [-0.02041, +0.0248] |
| USDJPY | 2523 | -0.00612 | [-0.03105, +0.01661] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2016 | 370 | +0.07506 | [+0.01142, +0.1442] |
| 2017 | 3350 | +0.05 | [+0.01587, +0.08734] |
| 2018 | 3363 | +0.009145 | [-0.02326, +0.04398] |
| 2019 | 3363 | +0.007001 | [-0.02969, +0.03777] |
| 2020 | 3364 | +0.05019 | [+0.003056, +0.08755] |
| 2021 | 3375 | -0.0213 | [-0.06252, +0.01983] |
| 2022 | 3350 | -0.01161 | [-0.05546, +0.03516] |
| 2023 | 3362 | +0.01646 | [-0.02484, +0.05088] |
| 2024 | 3376 | +0.03044 | [-0.003918, +0.06733] |
| 2025 | 3360 | -0.00892 | [-0.04445, +0.02395] |
| 2026 | 2105 | -0.02414 | [-0.06412, +0.01692] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 16370 | +0.02156 | [+0.0008477, +0.03941] |
| H2 | 16368 | +0.001955 | [-0.01661, +0.0183] |

Without the largest 1% of rows: -0.01032.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1 | 15011 | -0.005996 | [-0.0277, +0.01571] |
| 1 | 17727 | +0.04556 | [+0.02551, +0.06561] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Entries rebuilt with the runner's own build() (one instrument at a time). Registered E1 Delta +0.012 [-0.004, +0.029]. The pack bootstraps dates iid (runner: 21-date blocks plus a 500-shift placebo whose SD floors the SE). Placebo here = slope sides shuffled across dates within instrument. Buckets: outcome = D_L - D_S by slope state; a working signal would show long-slope rows above zero and short-slope rows below.
