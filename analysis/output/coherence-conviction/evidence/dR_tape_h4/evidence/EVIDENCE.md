# Evidence pack: coherence-conviction:dR_tape_h4

Unit: R per entry: tape side minus 4h side (COH days). Useful bar: +0.05. 8969 scored rows, 701 independent clusters, 13 instruments, 2016-11-22 → 2026-08-21. Prereg verdict: **—**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 54% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.005444 [-0.02759, +0.03716]. Shuffled-signal 95% band [-0.01633, +0.01541]; the real estimate sits at the 76th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 100% | +0.04751 |
| 1.0× bar (+0.05) | 100% | +0.08958 |
| 2.0× bar (+0.1) | 100% | +0.1737 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.6553 (clean +0.005444). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 701 | +0.02988 | [-0.03755, +0.08444] |
| EURJPY | 701 | +0.02646 | [-0.03297, +0.1022] |
| EURUSD | 701 | +0.005549 | [-0.05933, +0.06611] |
| GBPJPY | 701 | +0.01018 | [-0.05158, +0.06727] |
| GBPUSD | 701 | -0.004754 | [-0.07216, +0.05212] |
| GOLD | 660 | -0.01139 | [-0.0822, +0.07326] |
| NAS100 | 672 | -0.008128 | [-0.0671, +0.05447] |
| NZDUSD | 701 | -0.04226 | [-0.1052, +0.01978] |
| SPX500 | 672 | +0.03966 | [-0.008963, +0.1052] |
| US30 | 656 | +0.03027 | [-0.03363, +0.07564] |
| USDCAD | 701 | -0.007874 | [-0.06779, +0.04738] |
| USDCHF | 701 | -0.0008009 | [-0.07031, +0.06365] |
| USDJPY | 701 | +0.005437 | [-0.05961, +0.06731] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2016 | 48 | +0.1519 | [+0.006467, +0.3128] |
| 2017 | 807 | -0.04128 | [-0.1337, +0.02627] |
| 2018 | 1012 | -0.002436 | [-0.07455, +0.08785] |
| 2019 | 790 | +0.0231 | [-0.08584, +0.1402] |
| 2020 | 948 | -0.09262 | [-0.2134, +0.03438] |
| 2021 | 1275 | +0.05441 | [-0.0004718, +0.1138] |
| 2022 | 883 | +0.04556 | [-0.03152, +0.1223] |
| 2023 | 791 | -0.04188 | [-0.1266, +0.04436] |
| 2024 | 1056 | +0.02649 | [-0.07878, +0.121] |
| 2025 | 725 | +0.1167 | [+0.004401, +0.2165] |
| 2026 | 634 | -0.06652 | [-0.2119, +0.0613] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 4490 | -0.005664 | [-0.05237, +0.03757] |
| H2 | 4479 | +0.01658 | [-0.01634, +0.05964] |

Without the largest 1% of rows: +0.007006.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1.0 | 4261 | +0.004475 | [-0.02325, +0.0322] |
| 1.0 | 4708 | +0.00632 | [-0.01878, +0.03142] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = COH-day entries with a tape side. Placebo shuffles the tape side across dates within instrument. Plant: the market drifts e R in the tape direction, sized so the difference rises by the planted amount. Leak: the side is the sign of the same session move.
