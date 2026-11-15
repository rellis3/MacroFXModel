# Evidence pack: slow-bias-clock:book_sharpe

Unit: annualised net Sharpe. Useful bar: +0.3. 69074 scored rows, 260 independent clusters, 13 instruments, 2005-01-03 → 2026-08-20. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: INCONCLUSIVE: the interval includes both zero and the useful size

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | False |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 77% |
| survives top1pct removed | True |
| survives costs | True |

**Headline:** +0.2388 [-0.07983, +0.5576]. Shuffled-signal 95% band [-0.1155, +0.5539]; the real estimate sits at the 50th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.15) | 100% | +0.3886 |
| 1.0× bar (+0.3) | 100% | +0.5382 |
| 2.0× bar (+0.6) | 100% | +0.8376 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +27.59 (clean +0.2388). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 5619 | +0.2137 | [-0.0565, +0.5323] |
| EURJPY | 5619 | +0.2569 | [-0.05848, +0.5584] |
| EURUSD | 5619 | +0.0686 | [-0.2708, +0.3982] |
| GBPJPY | 5619 | +0.5439 | [+0.225, +0.8656] |
| GBPUSD | 5619 | -0.1995 | [-0.4819, +0.09283] |
| GOLD | 5036 | +0.2488 | [-0.09083, +0.5907] |
| NAS100 | 5591 | +0.4023 | [+0.128, +0.7445] |
| NZDUSD | 5619 | +0.02117 | [-0.3109, +0.3892] |
| SPX500 | 5591 | +0.1943 | [-0.06132, +0.4897] |
| US30 | 2286 | +0.1198 | [-0.4203, +0.6332] |
| USDCAD | 5619 | -0.2933 | [-0.6824, +0.04776] |
| USDCHF | 5618 | -0.3313 | [-0.625, -0.03636] |
| USDJPY | 5619 | +0.3327 | [-0.05539, +0.6324] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2005 | 2856 | -0.6896 | [-1.903, +0.9085] |
| 2006 | 2854 | +0.9427 | [-0.8151, +2.675] |
| 2007 | 3080 | +0.05397 | [-1.499, +1.794] |
| 2008 | 3137 | +1.133 | [-0.2405, +1.948] |
| 2009 | 3126 | -0.01498 | [-1.705, +1.37] |
| 2010 | 3127 | +0.4119 | [-0.7408, +1.748] |
| 2011 | 3116 | -0.5242 | [-2.339, +1.244] |
| 2012 | 3117 | +0.6928 | [-1.024, +2.702] |
| 2013 | 3108 | +0.7573 | [-0.3296, +1.845] |
| 2014 | 3108 | +1.031 | [-0.1797, +2.531] |
| 2015 | 3108 | -0.4263 | [-1.229, +0.4336] |
| 2016 | 3105 | -0.4674 | [-1.638, +0.5963] |
| 2017 | 3147 | +0.6573 | [-0.5731, +1.924] |
| 2018 | 3363 | -0.2608 | [-2.057, +2.284] |
| 2019 | 3363 | +0.2706 | [-1.556, +2.254] |
| 2020 | 3376 | +0.5223 | [-1.648, +2.327] |
| 2021 | 3375 | -0.3358 | [-1.863, +1.142] |
| 2022 | 3363 | +0.01085 | [-1.671, +1.682] |
| 2023 | 3362 | -0.2828 | [-1.136, +0.41] |
| 2024 | 3376 | +0.3434 | [-1.029, +2.115] |
| 2025 | 3363 | +0.7094 | [-0.5804, +1.737] |
| 2026 | 2144 | +0.241 | [-1.283, +2.391] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 34538 | +0.3439 | [-0.1159, +0.7272] |
| H2 | 34536 | +0.1134 | [-0.3491, +0.5842] |

Without the largest 1% of rows: +0.3276.
Net of costs: +0.2388.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 6908 | -0.05651 | [-0.1086, -0.004398] |
| D2 | 6907 | +0.01604 | [-0.02611, +0.05818] |
| D3 | 6907 | -0.01044 | [-0.04643, +0.02555] |
| D4 | 6908 | -0.005112 | [-0.03941, +0.02919] |
| D5 | 6907 | +0.05868 | [+0.02414, +0.09321] |
| D6 | 6907 | +0.02974 | [-0.002065, +0.06155] |
| D7 | 6908 | +0.01386 | [-0.01702, +0.04475] |
| D8 | 6907 | +0.01954 | [-0.009796, +0.04887] |
| D9 | 6907 | +0.04186 | [+0.0119, +0.07181] |
| D10 | 6908 | -0.001958 | [-0.03349, +0.02958] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = (instrument, day) positions held close t to close t+1; estimate = Sharpe of the equal-weight daily mean of side*w*scale*return minus the mean cost (costs from the real turnover, held fixed under shuffles, so the placebo is slightly flattered). Bootstrap clusters = calendar months.
