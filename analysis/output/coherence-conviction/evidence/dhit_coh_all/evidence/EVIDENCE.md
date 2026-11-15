# Evidence pack: coherence-conviction:dhit_coh_all

Unit: hit rate of the 4h lean (R > 0). Useful bar: +0.05. 30571 scored rows, 2385 independent clusters, 13 instruments, 2016-11-21 → 2026-08-21. Prereg verdict: **—**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 62% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.002069 [-0.01427, +0.01231]. Shuffled-signal 95% band [-0.008418, +0.008392]; the real estimate sits at the 35th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 100% | +0.02314 |
| 1.0× bar (+0.05) | 100% | +0.04718 |
| 2.0× bar (+0.1) | 100% | +0.09771 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.5385 (clean -0.002069). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 2383 | +0.005965 | [-0.02054, +0.04536] |
| EURJPY | 2383 | -0.00377 | [-0.03527, +0.0233] |
| EURUSD | 2383 | -0.0005795 | [-0.0327, +0.02683] |
| GBPJPY | 2383 | -0.02466 | [-0.05524, +0.005574] |
| GBPUSD | 2383 | -0.01753 | [-0.04785, +0.009922] |
| GOLD | 2236 | +0.003833 | [-0.02499, +0.03155] |
| NAS100 | 2294 | -0.01432 | [-0.04571, +0.01242] |
| NZDUSD | 2383 | +0.01738 | [-0.01391, +0.05026] |
| SPX500 | 2295 | -0.0111 | [-0.04506, +0.01773] |
| US30 | 2296 | -0.01642 | [-0.04771, +0.01657] |
| USDCAD | 2384 | +0.03368 | [+0.007066, +0.06021] |
| USDCHF | 2383 | +0.007646 | [-0.01839, +0.03651] |
| USDJPY | 2385 | -0.008002 | [-0.03467, +0.0258] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2016 | 348 | -0.1501 | [-0.3789, -0.008991] |
| 2017 | 3165 | +0.004818 | [-0.03397, +0.04667] |
| 2018 | 3139 | -0.01768 | [-0.04613, +0.01931] |
| 2019 | 3143 | +0.005428 | [-0.03593, +0.04444] |
| 2020 | 3137 | +0.01796 | [-0.02292, +0.06335] |
| 2021 | 3166 | +0.004165 | [-0.02808, +0.03651] |
| 2022 | 3128 | +0.05507 | [+0.01656, +0.1025] |
| 2023 | 3134 | -0.02656 | [-0.06731, +0.02098] |
| 2024 | 3117 | -0.01217 | [-0.0441, +0.01794] |
| 2025 | 3102 | -0.03328 | [-0.08325, +0.02222] |
| 2026 | 1992 | -0.01418 | [-0.06765, +0.03684] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 15287 | -0.0008016 | [-0.02083, +0.01759] |
| H2 | 15284 | -0.003184 | [-0.02541, +0.01706] |

Without the largest 1% of rows: -0.002069.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| 0.0 | 21585 | +0.4623 | [+0.4557, +0.469] |
| 1.0 | 8986 | +0.4594 | [+0.4491, +0.4697] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = every labelled entry of the 4h lean; signal = +1 on COH rows, -1 on ALL rows (else 0); estimate = mean outcome on COH rows minus mean on all labelled days. Placebo shuffles the label across dates within instrument (outcome fixed). Plant: a lift of the planted size on the +1 rows. Leak: label = sign of the scored outcome. "side" mirrors the label so the pack shuffles the label only; the lean side is in column "lean".
