# Evidence pack: coherence-conviction:dR_coh_all

Unit: R per entry (4h lean). Useful bar: +0.05. 30571 scored rows, 2385 independent clusters, 13 instruments, 2016-11-21 → 2026-08-21. Prereg verdict: **—**.

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

**Headline:** -0.001043 [-0.02533, +0.02403]. Shuffled-signal 95% band [-0.01479, +0.01478]; the real estimate sits at the 41th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 35% | +0.02396 |
| 1.0× bar (+0.05) | 100% | +0.04896 |
| 2.0× bar (+0.1) | 100% | +0.09896 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.7466 (clean -0.001043). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 2383 | +0.001975 | [-0.04773, +0.0556] |
| EURJPY | 2383 | -0.0175 | [-0.06332, +0.03339] |
| EURUSD | 2383 | +0.03157 | [-0.02994, +0.09411] |
| GBPJPY | 2383 | -0.02776 | [-0.07752, +0.02167] |
| GBPUSD | 2383 | -0.00454 | [-0.06526, +0.0561] |
| GOLD | 2236 | +0.02141 | [-0.03697, +0.07775] |
| NAS100 | 2294 | -0.05104 | [-0.1048, -0.0003637] |
| NZDUSD | 2383 | +0.03866 | [-0.01695, +0.09016] |
| SPX500 | 2295 | -0.04353 | [-0.1075, +0.01948] |
| US30 | 2296 | -0.02167 | [-0.07997, +0.04763] |
| USDCAD | 2384 | +0.03588 | [-0.009662, +0.08249] |
| USDCHF | 2383 | +0.03767 | [-0.01927, +0.1015] |
| USDJPY | 2385 | -0.01778 | [-0.06174, +0.03656] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2016 | 348 | -0.2947 | [-0.575, -0.1224] |
| 2017 | 3165 | +0.01054 | [-0.06829, +0.09291] |
| 2018 | 3139 | -0.04311 | [-0.1184, +0.02242] |
| 2019 | 3143 | +0.03341 | [-0.06217, +0.1067] |
| 2020 | 3137 | +0.05269 | [-0.0341, +0.1235] |
| 2021 | 3166 | +0.001003 | [-0.05558, +0.05456] |
| 2022 | 3128 | +0.06866 | [-0.02006, +0.1591] |
| 2023 | 3134 | -0.03402 | [-0.1227, +0.05578] |
| 2024 | 3117 | -0.01969 | [-0.09689, +0.05503] |
| 2025 | 3102 | -0.04899 | [-0.1281, +0.03259] |
| 2026 | 1992 | -0.001721 | [-0.0958, +0.1128] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 15287 | +0.0027 | [-0.03097, +0.03187] |
| H2 | 15284 | -0.005045 | [-0.04129, +0.0294] |

Without the largest 1% of rows: -0.0606.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| 0.0 | 21585 | -0.02839 | [-0.03993, -0.01684] |
| 1.0 | 8986 | -0.02986 | [-0.04755, -0.01218] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = every labelled entry of the 4h lean; signal = +1 on COH rows, -1 on ALL rows (else 0); estimate = mean outcome on COH rows minus mean on all labelled days. Placebo shuffles the label across dates within instrument (outcome fixed). Plant: a lift of the planted size on the +1 rows. Leak: label = sign of the scored outcome. "side" mirrors the label so the pack shuffles the label only; the lean side is in column "lean".
