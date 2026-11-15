# Evidence pack: meta-labelling:dhit_meta_all

Unit: hit rate on acted days minus all days. Useful bar: +0.03. 24826 scored rows, 1952 independent clusters, 13 instruments, 2019-01-02 → 2026-08-20. Prereg verdict: **NULL**.

## Diagnosis: SMALL BUT REAL: above zero, below the useful size

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 54% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.008102 [+0.0005619, +0.01625]. Shuffled-signal 95% band [+0.001268, +0.01154]; the real estimate sits at the 71th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.015) | 100% | +0.015 |
| 1.0× bar (+0.03) | 100% | +0.03 |
| 2.0× bar (+0.06) | 100% | +0.06 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.5197 (clean +0.008102). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1936 | -0.002196 | [-0.03261, +0.02536] |
| EURJPY | 1940 | +0.02215 | [-0.0009726, +0.04868] |
| EURUSD | 1945 | +0.01216 | [-0.01202, +0.03949] |
| GBPJPY | 1948 | +0.007131 | [-0.01701, +0.0371] |
| GBPUSD | 1943 | -0.004724 | [-0.02755, +0.01982] |
| GOLD | 1805 | -0.04404 | [-0.06943, -0.01829] |
| NAS100 | 1860 | -0.0006718 | [-0.008985, +0.01012] |
| NZDUSD | 1940 | -0.001206 | [-0.02603, +0.0227] |
| SPX500 | 1839 | -0.002671 | [-0.009901, +0.006178] |
| US30 | 1862 | +0.004752 | [-0.003267, +0.0123] |
| USDCAD | 1947 | +0.0002464 | [-0.02684, +0.02736] |
| USDCHF | 1915 | +7.507e-05 | [-0.02229, +0.02475] |
| USDJPY | 1946 | +0.03079 | [+0.006497, +0.05614] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2019 | 3198 | -0.009989 | [-0.03192, +0.01436] |
| 2020 | 3255 | +0.008929 | [-0.00886, +0.02964] |
| 2021 | 3281 | +0.006002 | [-0.01196, +0.02374] |
| 2022 | 3239 | -0.005869 | [-0.02576, +0.01754] |
| 2023 | 3267 | +0.01448 | [-0.003137, +0.03545] |
| 2024 | 3268 | +0.01948 | [-0.003335, +0.0429] |
| 2025 | 3252 | +0.01602 | [-0.001851, +0.03913] |
| 2026 | 2066 | +0.01203 | [-0.009994, +0.03881] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 12426 | -0.0009595 | [-0.01026, +0.009564] |
| H2 | 12400 | +0.0169 | [+0.00689, +0.02934] |

Without the largest 1% of rows: +0.008102.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 2483 | +0.4776 | [+0.458, +0.4973] |
| D2 | 2483 | +0.4535 | [+0.4339, +0.4731] |
| D3 | 2482 | +0.477 | [+0.4574, +0.4967] |
| D4 | 2483 | +0.4748 | [+0.4552, +0.4945] |
| D5 | 2482 | +0.4621 | [+0.4425, +0.4817] |
| D6 | 2483 | +0.4841 | [+0.4644, +0.5038] |
| D7 | 2482 | +0.4662 | [+0.4465, +0.4858] |
| D8 | 2483 | +0.4921 | [+0.4725, +0.5118] |
| D9 | 2482 | +0.4968 | [+0.4771, +0.5165] |
| D10 | 2483 | +0.5191 | [+0.4995, +0.5388] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = every bias-learner call 2019-01 -> 2026-08-21 (test years of the walk-forward meta-model). side = act (1 acted, 0 stood aside); signal = the meta probability. The pack placebo shuffles act across dates within instrument = a random stand-aside of the same fraction (the runner's own placebo permutes within instrument x year, 1000 draws, and is the binding one). Plants remove the real estimate first, then add the effect on acted rows. Buckets = R (or hit) by decile of the meta probability: a working filter is a rising staircase. Canary: act = 1{outcome > 0}. The pack bootstraps dates iid; the runner's 21-day block CI is the binding one. Runner: est +0.0081 [+0.0009, +0.0151], placebo pct 94, word NULL.
