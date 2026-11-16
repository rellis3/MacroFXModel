# Evidence pack: bias-engine-backtest-sameday

Unit: sigma (drift-adjusted, per call). Useful bar: +0.04. 21051 scored rows, 123 independent clusters, 34 instruments, 2016-10-24 → 2026-08-21. Prereg verdict: **—**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 62% |
| survives top1pct removed | True |
| survives costs | True |

**Headline:** +0.01131 [-0.00698, +0.0282]. Shuffled-signal 95% band [-0.01419, +0.008254]; the real estimate sits at the 99th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.02) | 100% | +0.02 |
| 1.0× bar (+0.04) | 100% | +0.04 |
| 2.0× bar (+0.08) | 100% | +0.08 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.6869 (clean +0.01131). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDCAD | 221 | -0.1301 | [-0.2619, +0.002041] |
| AUDCHF | 614 | +0.07757 | [+0.006778, +0.1567] |
| AUDJPY | 573 | -0.009365 | [-0.06454, +0.04316] |
| AUDNZD | 310 | +0.0003455 | [-0.06598, +0.06658] |
| AUDUSD | 240 | -0.01384 | [-0.1292, +0.05192] |
| CADCHF | 595 | +0.02563 | [-0.05569, +0.1068] |
| CADJPY | 732 | +0.01206 | [-0.04817, +0.06261] |
| CHFJPY | 516 | +0.02849 | [-0.0469, +0.09331] |
| DE30 | 1434 | -0.007513 | [-0.05114, +0.03037] |
| EURAUD | 224 | +0.04506 | [-0.05865, +0.1702] |
| EURCAD | 364 | -0.02632 | [-0.1071, +0.08737] |
| EURCHF | 367 | +0.1182 | [+0.006359, +0.2345] |
| EURGBP | 230 | -0.06403 | [-0.1787, +0.0633] |
| EURJPY | 453 | +0.06686 | [+0.007795, +0.1343] |
| EURNZD | 408 | +0.01725 | [-0.051, +0.0873] |
| EURUSD | 378 | +0.03324 | [-0.05801, +0.1281] |
| GBPAUD | 179 | +0.09577 | [-0.04912, +0.2447] |
| GBPCAD | 146 | +0.05099 | [-0.1429, +0.232] |
| GBPCHF | 519 | +0.03696 | [-0.0345, +0.1085] |
| GBPJPY | 563 | +0.009192 | [-0.05832, +0.08678] |
| GBPNZD | 518 | -0.01375 | [-0.1163, +0.06853] |
| GBPUSD | 245 | -0.08376 | [-0.2048, +0.03759] |
| GOLD | 989 | +0.05576 | [-0.01042, +0.1218] |
| NQ | 1411 | +0.009093 | [-0.03649, +0.06133] |
| NZDCAD | 523 | -0.03118 | [-0.09417, +0.0359] |
| NZDJPY | 929 | -0.01442 | [-0.04726, +0.02182] |
| NZDUSD | 613 | +0.02072 | [-0.04182, +0.08061] |
| SPX500 | 1385 | +0.02179 | [-0.03591, +0.06339] |
| UK100 | 1312 | +0.04656 | [-0.004675, +0.09598] |
| US2000 | 1322 | -0.03202 | [-0.07305, +0.009162] |
| US30 | 1335 | -0.004207 | [-0.05364, +0.04877] |
| USDCAD | 166 | -0.07617 | [-0.1863, +0.03722] |
| USDCHF | 523 | +0.02344 | [-0.04652, +0.09051] |
| USDJPY | 714 | +0.00768 | [-0.04378, +0.0552] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2016 | 290 | +0.009213 | [-0.3155, +0.2536] |
| 2017 | 1718 | -0.005129 | [-0.07728, +0.06933] |
| 2018 | 2271 | +0.03875 | [-0.007653, +0.08941] |
| 2019 | 2460 | +0.01576 | [-0.02536, +0.05466] |
| 2020 | 2214 | -0.01418 | [-0.1012, +0.05584] |
| 2021 | 1567 | -0.02156 | [-0.05801, +0.02285] |
| 2022 | 2501 | +0.01301 | [-0.04409, +0.07393] |
| 2023 | 2615 | +0.05643 | [+0.01518, +0.09395] |
| 2024 | 1852 | -0.01176 | [-0.06367, +0.04171] |
| 2025 | 2149 | +0.003819 | [-0.04029, +0.04811] |
| 2026 | 1414 | +0.01135 | [-0.08667, +0.09756] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 10528 | +0.005133 | [-0.02133, +0.02966] |
| H2 | 10523 | +0.01749 | [-0.005962, +0.04371] |

Without the largest 1% of rows: +0.009756.
Net of costs: +0.008964.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 2106 | -0.07429 | [-0.1248, -0.02378] |
| D2 | 2105 | -0.01226 | [-0.05908, +0.03456] |
| D3 | 2105 | -0.00971 | [-0.05253, +0.03311] |
| D4 | 2105 | +0.00265 | [-0.03972, +0.04502] |
| D5 | 2105 | -0.01116 | [-0.04984, +0.02753] |
| D6 | 2105 | +0.03952 | [+0.002752, +0.07629] |
| D7 | 2105 | +0.0182 | [-0.01854, +0.05494] |
| D8 | 2105 | +0.02452 | [-0.01178, +0.06082] |
| D9 | 2105 | -0.04529 | [-0.08066, -0.009918] |
| D10 | 2105 | +0.0009841 | [-0.03252, +0.03449] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Outcome = signed move in trailing-60-day daily sigma minus the point-in-time B0 drift; cost = real spread in sigma. Row-level shuffled placebo here; the registered gate uses the 21-session block permutation in RESULTS.md.
