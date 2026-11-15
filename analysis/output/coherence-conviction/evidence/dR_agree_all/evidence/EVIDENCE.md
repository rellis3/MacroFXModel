# Evidence pack: coherence-conviction:dR_agree_all

Unit: R per entry (4h lean). Useful bar: +0.05. 30571 scored rows, 2385 independent clusters, 13 instruments, 2016-11-21 → 2026-08-21. Prereg verdict: **—**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 46% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** +0.0008869 [-0.03847, +0.03478]. Shuffled-signal 95% band [-0.01837, +0.01816]; the real estimate sits at the 55th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 0% | +0.02589 |
| 1.0× bar (+0.05) | 100% | +0.05089 |
| 2.0× bar (+0.1) | 100% | +0.1009 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.7466 (clean +0.0008869). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 2383 | +0.00557 | [-0.05351, +0.06183] |
| EURJPY | 2383 | -0.01214 | [-0.08234, +0.0513] |
| EURUSD | 2383 | +0.04317 | [-0.04103, +0.1066] |
| GBPJPY | 2383 | -0.04236 | [-0.1105, +0.03705] |
| GBPUSD | 2383 | -0.008977 | [-0.0878, +0.06598] |
| GOLD | 2236 | +0.0595 | [-0.003123, +0.1491] |
| NAS100 | 2294 | -0.07275 | [-0.1283, -0.01333] |
| NZDUSD | 2383 | +0.01022 | [-0.04012, +0.06579] |
| SPX500 | 2295 | -0.0365 | [-0.1051, +0.02555] |
| US30 | 2296 | -0.004809 | [-0.07477, +0.063] |
| USDCAD | 2384 | +0.04469 | [-0.01924, +0.1017] |
| USDCHF | 2383 | +0.06216 | [-0.01013, +0.1277] |
| USDJPY | 2385 | -0.02219 | [-0.08834, +0.0609] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2016 | 348 | -0.2668 | [-0.4761, -0.1168] |
| 2017 | 3165 | -0.01391 | [-0.1147, +0.07329] |
| 2018 | 3139 | -0.05037 | [-0.1565, +0.04961] |
| 2019 | 3143 | +0.05154 | [-0.06021, +0.1584] |
| 2020 | 3137 | +0.01069 | [-0.08816, +0.1176] |
| 2021 | 3166 | +0.0403 | [-0.05897, +0.1391] |
| 2022 | 3128 | +0.1235 | [+0.008546, +0.2336] |
| 2023 | 3134 | -0.07259 | [-0.1989, +0.0775] |
| 2024 | 3117 | -0.02034 | [-0.137, +0.09409] |
| 2025 | 3102 | -0.002356 | [-0.1108, +0.1252] |
| 2026 | 1992 | -0.06791 | [-0.2002, +0.08729] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 15287 | +0.0006921 | [-0.04564, +0.04769] |
| H2 | 15284 | +0.001095 | [-0.05393, +0.04723] |

Without the largest 1% of rows: -0.08689.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| 0.0 | 24267 | -0.02905 | [-0.03995, -0.01816] |
| 1.0 | 6304 | -0.02793 | [-0.0489, -0.006966] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = every labelled entry of the 4h lean; signal = +1 on AGREE rows, -1 on ALL rows (else 0); estimate = mean outcome on AGREE rows minus mean on all labelled days. Placebo shuffles the label across dates within instrument (outcome fixed). Plant: a lift of the planted size on the +1 rows. Leak: label = sign of the scored outcome. "side" mirrors the label so the pack shuffles the label only; the lean side is in column "lean".
