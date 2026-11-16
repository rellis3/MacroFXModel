# Evidence pack: bias-engine-backtest-5d

Unit: sigma (drift-adjusted, per call). Useful bar: +0.17. 35463 scored rows, 207 independent clusters, 35 instruments, 2010-01-04 → 2026-08-14. Prereg verdict: **—**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 77% |
| survives top1pct removed | True |
| survives costs | False |

**Headline:** -0.06735 [-0.1463, +0.01055]. Shuffled-signal 95% band [-0.0338, +0.01031]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.085) | 80% | +0.085 |
| 1.0× bar (+0.17) | 100% | +0.17 |
| 2.0× bar (+0.34) | 100% | +0.34 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1.743 (clean -0.06735). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDCAD | 400 | +0.01042 | [-0.4221, +0.5461] |
| AUDCHF | 1231 | -0.1663 | [-0.365, +0.1062] |
| AUDJPY | 1152 | -0.1481 | [-0.4386, +0.1343] |
| AUDNZD | 632 | -0.06922 | [-0.4503, +0.2678] |
| AUDUSD | 766 | -0.1133 | [-0.3496, +0.1437] |
| CADCHF | 1212 | -0.05567 | [-0.3078, +0.1912] |
| CADJPY | 1209 | +0.03138 | [-0.2174, +0.3118] |
| CHFJPY | 660 | +0.1316 | [-0.2058, +0.4457] |
| DE30 | 1557 | -0.1221 | [-0.3117, +0.05136] |
| EURAUD | 469 | -0.3399 | [-0.7782, +0.04151] |
| EURCAD | 576 | -0.05896 | [-0.3591, +0.2962] |
| EURCHF | 621 | +0.01238 | [-0.3283, +0.3424] |
| EURGBP | 412 | -0.1628 | [-0.5372, +0.1372] |
| EURJPY | 670 | -0.02479 | [-0.2944, +0.212] |
| EURNZD | 949 | -0.08999 | [-0.34, +0.1418] |
| EURUSD | 867 | -0.01822 | [-0.239, +0.2199] |
| GBPAUD | 414 | -0.1017 | [-0.4704, +0.2339] |
| GBPCAD | 270 | -0.09236 | [-0.7225, +0.3322] |
| GBPCHF | 1008 | +0.0662 | [-0.1433, +0.2909] |
| GBPJPY | 871 | -0.04884 | [-0.3791, +0.2411] |
| GBPNZD | 835 | -0.07134 | [-0.3545, +0.1725] |
| GBPUSD | 490 | -0.04907 | [-0.3084, +0.2972] |
| GOLD | 1619 | +0.06534 | [-0.1707, +0.3144] |
| NQ | 2300 | -0.04725 | [-0.2083, +0.08481] |
| NZDCAD | 861 | +0.005192 | [-0.2417, +0.2758] |
| NZDCHF | 1371 | -0.2171 | [-0.5318, +0.08475] |
| NZDJPY | 1528 | -0.09314 | [-0.2867, +0.06966] |
| NZDUSD | 1040 | -0.1423 | [-0.3761, +0.08938] |
| SPX500 | 2393 | -0.07797 | [-0.2427, +0.08406] |
| UK100 | 1427 | -0.05576 | [-0.2775, +0.1295] |
| US2000 | 1489 | -0.1332 | [-0.3564, +0.0609] |
| US30 | 1471 | -0.1385 | [-0.345, +0.1044] |
| USDCAD | 736 | -0.005946 | [-0.413, +0.3639] |
| USDCHF | 934 | -0.03103 | [-0.3039, +0.1721] |
| USDJPY | 1023 | +0.0303 | [-0.1594, +0.2429] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2010 | 1975 | +0.0007493 | [-0.2902, +0.224] |
| 2011 | 2203 | -0.2684 | [-0.629, +0.08089] |
| 2012 | 1711 | -0.08668 | [-0.4836, +0.1895] |
| 2013 | 1933 | -0.2728 | [-0.5292, -0.03694] |
| 2014 | 1383 | +0.08621 | [-0.3272, +0.4659] |
| 2015 | 2826 | -0.01512 | [-0.3359, +0.3394] |
| 2016 | 1898 | -0.2569 | [-0.635, +0.1754] |
| 2017 | 1764 | -0.1566 | [-0.4019, +0.1095] |
| 2018 | 2321 | -0.03262 | [-0.2863, +0.2203] |
| 2019 | 2548 | +0.165 | [-0.04894, +0.3483] |
| 2020 | 2393 | -0.1011 | [-0.557, +0.4211] |
| 2021 | 1624 | -0.2166 | [-0.4648, +0.01685] |
| 2022 | 2573 | +0.03022 | [-0.2353, +0.379] |
| 2023 | 2687 | +0.169 | [-0.07031, +0.4041] |
| 2024 | 2021 | -0.1748 | [-0.376, +0.02904] |
| 2025 | 2180 | -0.0877 | [-0.3239, +0.1368] |
| 2026 | 1423 | -0.1224 | [-0.3807, +0.06277] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 17734 | -0.111 | [-0.2341, +0.02414] |
| H2 | 17729 | -0.02371 | [-0.1351, +0.09306] |

Without the largest 1% of rows: -0.06655.
Net of costs: -0.07233.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 3547 | +0.1324 | [+0.04315, +0.2216] |
| D2 | 3546 | +0.04689 | [-0.03818, +0.132] |
| D3 | 3546 | +0.1473 | [+0.06686, +0.2277] |
| D4 | 3546 | +0.1476 | [+0.06525, +0.23] |
| D5 | 3547 | -0.03184 | [-0.1095, +0.04578] |
| D6 | 3546 | -0.003573 | [-0.07982, +0.07268] |
| D7 | 3546 | -0.07604 | [-0.1495, -0.002544] |
| D8 | 3546 | +0.01899 | [-0.05355, +0.09152] |
| D9 | 3546 | -0.04809 | [-0.1181, +0.02188] |
| D10 | 3547 | -0.05677 | [-0.1239, +0.0104] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Outcome = signed move in trailing-60-day daily sigma minus the point-in-time B0 drift; cost = real spread in sigma. Row-level shuffled placebo here; the registered gate uses the 21-session block permutation in RESULTS.md.
