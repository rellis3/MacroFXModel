# Evidence pack: bias-engine-backtest-20d

Unit: sigma (drift-adjusted, per call). Useful bar: +0.56. 35280 scored rows, 206 independent clusters, 35 instruments, 2010-01-04 → 2026-07-24. Prereg verdict: **—**.

## Diagnosis: WRONG SIGN: there is an effect, and it is the opposite of the claim

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 77% |
| survives top1pct removed | True |
| survives costs | False |

**Headline:** -0.3401 [-0.5892, -0.07549]. Shuffled-signal 95% band [-0.1193, -0.03691]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.28) | 90% | +0.28 |
| 1.0× bar (+0.56) | 100% | +0.56 |
| 2.0× bar (+1.12) | 100% | +1.12 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +3.516 (clean -0.3401). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDCAD | 398 | +0.847 | [-0.5105, +2.058] |
| AUDCHF | 1218 | -0.8268 | [-1.519, -0.06637] |
| AUDJPY | 1152 | -0.4309 | [-1.144, +0.252] |
| AUDNZD | 628 | -0.7466 | [-2.196, +0.3448] |
| AUDUSD | 767 | -0.5296 | [-1.27, +0.07935] |
| CADCHF | 1198 | -0.3863 | [-0.9529, +0.2353] |
| CADJPY | 1208 | -0.08917 | [-0.8057, +0.6196] |
| CHFJPY | 645 | +0.4327 | [-0.666, +1.436] |
| DE30 | 1547 | -0.4072 | [-1.072, +0.3501] |
| EURAUD | 460 | -1.682 | [-2.62, -0.5905] |
| EURCAD | 574 | -0.5807 | [-1.395, +0.2417] |
| EURCHF | 611 | +0.5017 | [-0.6148, +1.533] |
| EURGBP | 412 | -0.9069 | [-1.805, +0.1751] |
| EURJPY | 668 | -0.26 | [-1.114, +0.5726] |
| EURNZD | 949 | -1.044 | [-2.013, +0.1391] |
| EURUSD | 866 | +0.167 | [-0.837, +0.9479] |
| GBPAUD | 404 | -0.17 | [-0.9105, +0.625] |
| GBPCAD | 267 | -0.08658 | [-1.01, +0.9692] |
| GBPCHF | 1002 | +0.3024 | [-0.3083, +0.9092] |
| GBPJPY | 864 | -0.2982 | [-0.9908, +0.5372] |
| GBPNZD | 834 | -0.4911 | [-1.497, +0.4047] |
| GBPUSD | 485 | -0.3074 | [-1.215, +0.5333] |
| GOLD | 1613 | +0.08415 | [-0.5231, +0.7985] |
| NQ | 2290 | -0.1571 | [-0.7674, +0.2964] |
| NZDCAD | 861 | -0.1589 | [-0.9456, +0.6365] |
| NZDCHF | 1366 | -0.8436 | [-1.68, -0.1196] |
| NZDJPY | 1525 | -0.636 | [-1.191, -0.03129] |
| NZDUSD | 1036 | -1.025 | [-1.703, -0.4024] |
| SPX500 | 2391 | -0.3513 | [-0.9448, +0.2021] |
| UK100 | 1419 | +0.00993 | [-0.5229, +0.4472] |
| US2000 | 1481 | -0.6022 | [-1.373, +0.06717] |
| US30 | 1464 | -0.5325 | [-1.197, +0.2759] |
| USDCAD | 735 | -0.2002 | [-1.186, +0.8193] |
| USDCHF | 919 | +0.08948 | [-0.5385, +0.7491] |
| USDJPY | 1023 | -0.1265 | [-0.7772, +0.7284] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2010 | 1975 | -0.00362 | [-1.09, +0.8821] |
| 2011 | 2202 | -1.155 | [-2.143, -0.07806] |
| 2012 | 1712 | -0.3824 | [-1.6, +0.715] |
| 2013 | 1934 | -1.05 | [-1.831, -0.1993] |
| 2014 | 1384 | +0.01916 | [-0.7372, +0.6053] |
| 2015 | 2826 | -0.1911 | [-1.439, +1.245] |
| 2016 | 1899 | -0.7124 | [-1.393, +0.07147] |
| 2017 | 1768 | -0.3374 | [-1.273, +0.3687] |
| 2018 | 2321 | -0.2219 | [-1.14, +0.7794] |
| 2019 | 2550 | +0.2339 | [-0.6345, +0.8897] |
| 2020 | 2395 | -0.4481 | [-1.274, +0.6032] |
| 2021 | 1624 | -0.6948 | [-1.814, +0.3607] |
| 2022 | 2573 | -0.2728 | [-1.169, +0.7085] |
| 2023 | 2686 | +0.193 | [-0.4627, +0.8727] |
| 2024 | 2022 | -1.04 | [-2.293, -0.02027] |
| 2025 | 2180 | +0.0723 | [-0.5765, +0.6976] |
| 2026 | 1229 | -0.04094 | [-1.046, +0.9803] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 17645 | -0.4494 | [-0.8017, -0.04564] |
| H2 | 17635 | -0.2307 | [-0.5865, +0.1282] |

Without the largest 1% of rows: -0.265.
Net of costs: -0.345.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 3528 | +0.5673 | [+0.4, +0.7346] |
| D2 | 3528 | +0.4068 | [+0.2498, +0.5639] |
| D3 | 3528 | +0.5355 | [+0.3747, +0.6963] |
| D4 | 3528 | +0.5671 | [+0.4073, +0.7268] |
| D5 | 3528 | -0.1196 | [-0.2894, +0.05026] |
| D6 | 3528 | -0.1734 | [-0.3236, -0.02309] |
| D7 | 3528 | -0.3536 | [-0.5366, -0.1707] |
| D8 | 3528 | -0.2141 | [-0.3759, -0.05233] |
| D9 | 3528 | -0.2034 | [-0.3489, -0.05792] |
| D10 | 3528 | -0.2704 | [-0.4002, -0.1407] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Outcome = signed move in trailing-60-day daily sigma minus the point-in-time B0 drift; cost = real spread in sigma. Row-level shuffled placebo here; the registered gate uses the 21-session block permutation in RESULTS.md.
