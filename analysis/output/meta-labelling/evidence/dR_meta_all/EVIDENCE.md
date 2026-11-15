# Evidence pack: meta-labelling:dR_meta_all

Unit: R per traded day minus R per day (act-all). Useful bar: +0.05. 24826 scored rows, 1952 independent clusters, 13 instruments, 2019-01-02 → 2026-08-20. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 23% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** +0.002896 [-0.01134, +0.01752]. Shuffled-signal 95% band [+0.0004803, +0.02043]; the real estimate sits at the 7th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 100% | +0.025 |
| 1.0× bar (+0.05) | 100% | +0.05 |
| 2.0× bar (+0.1) | 100% | +0.1 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.7236 (clean +0.002896). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1936 | -0.01428 | [-0.05377, +0.03354] |
| EURJPY | 1940 | +0.006889 | [-0.03057, +0.049] |
| EURUSD | 1945 | -0.008158 | [-0.04929, +0.0391] |
| GBPJPY | 1948 | -0.01036 | [-0.05023, +0.03691] |
| GBPUSD | 1943 | -0.04522 | [-0.09011, -0.004487] |
| GOLD | 1805 | -0.04011 | [-0.08371, +0.007512] |
| NAS100 | 1860 | -0.0003949 | [-0.01272, +0.01734] |
| NZDUSD | 1940 | -0.01408 | [-0.04979, +0.02481] |
| SPX500 | 1839 | -0.001098 | [-0.01462, +0.01524] |
| US30 | 1862 | +0.009427 | [-0.004539, +0.02371] |
| USDCAD | 1947 | -0.01779 | [-0.062, +0.02361] |
| USDCHF | 1915 | -0.02527 | [-0.07185, +0.02094] |
| USDJPY | 1946 | +0.03178 | [-0.008005, +0.06991] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2019 | 3198 | -0.05398 | [-0.09595, -0.01167] |
| 2020 | 3255 | +0.01975 | [-0.01242, +0.05468] |
| 2021 | 3281 | -0.007304 | [-0.04464, +0.0248] |
| 2022 | 3239 | -0.01718 | [-0.0537, +0.02921] |
| 2023 | 3267 | +0.005676 | [-0.0301, +0.04955] |
| 2024 | 3268 | +0.01954 | [-0.0244, +0.0673] |
| 2025 | 3252 | +0.0284 | [-0.007733, +0.06597] |
| 2026 | 2066 | +0.02445 | [-0.01537, +0.07028] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 12426 | -0.01543 | [-0.03528, +0.003336] |
| H2 | 12400 | +0.02084 | [+0.001826, +0.04231] |

Without the largest 1% of rows: -0.02053.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 2483 | +0.03997 | [+0.0004878, +0.07945] |
| D2 | 2483 | -0.02325 | [-0.05909, +0.01258] |
| D3 | 2482 | -0.004393 | [-0.04012, +0.03133] |
| D4 | 2483 | -0.02215 | [-0.05548, +0.01119] |
| D5 | 2482 | -0.05312 | [-0.08494, -0.0213] |
| D6 | 2483 | -0.03077 | [-0.06232, +0.0007718] |
| D7 | 2482 | -0.02469 | [-0.05676, +0.007385] |
| D8 | 2483 | +0.02448 | [-0.00971, +0.05866] |
| D9 | 2482 | -0.007946 | [-0.04041, +0.02452] |
| D10 | 2483 | +0.04202 | [+0.01083, +0.07321] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows = every bias-learner call 2019-01 -> 2026-08-21 (test years of the walk-forward meta-model). side = act (1 acted, 0 stood aside); signal = the meta probability. The pack placebo shuffles act across dates within instrument = a random stand-aside of the same fraction (the runner's own placebo permutes within instrument x year, 1000 draws, and is the binding one). Plants remove the real estimate first, then add the effect on acted rows. Buckets = R (or hit) by decile of the meta probability: a working filter is a rising staircase. Canary: act = 1{outcome > 0}. The pack bootstraps dates iid; the runner's 21-day block CI is the binding one. Runner: est +0.0029 [-0.0105, +0.0162], placebo pct 20, word NULL.
