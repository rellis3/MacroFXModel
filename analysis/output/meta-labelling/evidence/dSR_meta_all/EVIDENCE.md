# Evidence pack: meta-labelling:dSR_meta_all

Unit: annualised Sharpe of the acted book minus act-all. Useful bar: +0.3. 24826 scored rows, 1952 independent clusters, 13 instruments, 2019-01-02 → 2026-08-20. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | False |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 46% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** +0.1771 [-0.2569, +0.6134]. Shuffled-signal 95% band [+0.1046, +0.7886]; the real estimate sits at the 9th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.15) | 0% | +0.15 |
| 1.0× bar (+0.3) | 0% | +0.3 |
| 2.0× bar (+0.6) | 100% | +0.6 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +22.8 (clean +0.1771). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1936 | +0.0357 | [-0.4599, +0.5709] |
| EURJPY | 1940 | +0.1091 | [-0.3511, +0.5047] |
| EURUSD | 1945 | +0.01085 | [-0.432, +0.6029] |
| GBPJPY | 1948 | -0.1713 | [-0.6727, +0.286] |
| GBPUSD | 1943 | -0.4468 | [-0.9145, +0.05488] |
| GOLD | 1805 | -0.4198 | [-0.9115, +0.03156] |
| NAS100 | 1860 | -0.0757 | [-0.2675, +0.1072] |
| NZDUSD | 1940 | +0.1524 | [-0.3664, +0.6488] |
| SPX500 | 1839 | -0.0772 | [-0.2494, +0.1282] |
| US30 | 1862 | +0.104 | [-0.0719, +0.2759] |
| USDCAD | 1947 | -0.1262 | [-0.5746, +0.4041] |
| USDCHF | 1915 | -0.09713 | [-0.5895, +0.4819] |
| USDJPY | 1946 | +0.3484 | [-0.1415, +0.8088] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2019 | 3198 | -1.771 | [-2.981, -0.4567] |
| 2020 | 3255 | +1.017 | [+0.1993, +1.833] |
| 2021 | 3281 | +0.2138 | [-1.118, +1.45] |
| 2022 | 3239 | -0.0938 | [-1.424, +1.37] |
| 2023 | 3267 | +0.1777 | [-1.08, +1.373] |
| 2024 | 3268 | +0.7372 | [-0.5989, +1.946] |
| 2025 | 3252 | +0.9141 | [-0.2063, +1.978] |
| 2026 | 2066 | +0.4388 | [-1.046, +1.938] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 12426 | -0.233 | [-0.8262, +0.2383] |
| H2 | 12400 | +0.6883 | [+0.1625, +1.282] |

Without the largest 1% of rows: -0.4745.

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

Rows = every bias-learner call 2019-01 -> 2026-08-21 (test years of the walk-forward meta-model). side = act (1 acted, 0 stood aside); signal = the meta probability. The pack placebo shuffles act across dates within instrument = a random stand-aside of the same fraction (the runner's own placebo permutes within instrument x year, 1000 draws, and is the binding one). Plants remove the real estimate first, then add the effect on acted rows. Buckets = R (or hit) by decile of the meta probability: a working filter is a rising staircase. Canary: act = 1{outcome > 0}. The pack bootstraps dates iid; the runner's 21-day block CI is the binding one. Runner: est +0.1772 [-0.3360, +0.6841], placebo pct 21, word UNDERPOWERED.
