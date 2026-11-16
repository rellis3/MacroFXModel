# Evidence pack: meta-labelling:dR_meta_conf

Unit: R per meta-acted day minus R per strength-only-acted day. Useful bar: +0.05. 24826 scored rows, 1952 independent clusters, 13 instruments, 2019-01-02 → 2026-08-20. Prereg verdict: **NULL**.

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
| survives costs | None |

**Headline:** -0.01758 [-0.03345, -0.002764]. Shuffled-signal 95% band [-0.01999, -4.104e-05]; the real estimate sits at the 7th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 100% | +0.025 |
| 1.0× bar (+0.05) | 100% | +0.05 |
| 2.0× bar (+0.1) | 100% | +0.1 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.7031 (clean -0.01758). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1936 | -0.09201 | [-0.2538, +0.03532] |
| EURJPY | 1940 | -0.01051 | [-0.0751, +0.04148] |
| EURUSD | 1945 | +0.008495 | [-0.0407, +0.05803] |
| GBPJPY | 1948 | -0.01499 | [-0.08029, +0.05783] |
| GBPUSD | 1943 | -0.1057 | [-0.2442, +0.02886] |
| GOLD | 1805 | -0.04247 | [-0.1234, +0.04133] |
| NAS100 | 1860 | -0.0003949 | [-0.01272, +0.01734] |
| NZDUSD | 1940 | -0.03845 | [-0.1099, +0.04952] |
| SPX500 | 1839 | -0.0004033 | [-0.01371, +0.01532] |
| US30 | 1862 | +0.01094 | [-0.004405, +0.02837] |
| USDCAD | 1947 | -0.01248 | [-0.05765, +0.03578] |
| USDCHF | 1915 | -0.02551 | [-0.1013, +0.05242] |
| USDJPY | 1946 | +0.01906 | [-0.02846, +0.06606] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2019 | 3198 | -0.05419 | [-0.09699, -0.005344] |
| 2020 | 3255 | -0.00193 | [-0.05283, +0.04919] |
| 2021 | 3281 | -0.02315 | [-0.07302, +0.0216] |
| 2022 | 3239 | +0.006748 | [-0.03689, +0.05375] |
| 2023 | 3267 | -0.03849 | [-0.06726, -0.003989] |
| 2024 | 3268 | -0.00132 | [-0.04074, +0.03554] |
| 2025 | 3252 | +0.02092 | [-0.008325, +0.05305] |
| 2026 | 2066 | -0.003016 | [-0.04125, +0.03585] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 12426 | -0.02367 | [-0.04723, +0.002014] |
| H2 | 12400 | -0.001289 | [-0.02027, +0.0167] |

Without the largest 1% of rows: -0.03427.

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

Rows = every bias-learner call 2019-01 -> 2026-08-21 (test years of the walk-forward meta-model). side = act (1 acted, 0 stood aside); signal = the meta probability. The pack placebo shuffles act across dates within instrument = a random stand-aside of the same fraction (the runner's own placebo permutes within instrument x year, 1000 draws, and is the binding one). Plants remove the real estimate first, then add the effect on acted rows. Buckets = R (or hit) by decile of the meta probability: a working filter is a rising staircase. Canary: act = 1{outcome > 0}. The pack bootstraps dates iid; the runner's 21-day block CI is the binding one. Runner: est -0.0176 [-0.0309, -0.0033], placebo pct 20, word NULL.
