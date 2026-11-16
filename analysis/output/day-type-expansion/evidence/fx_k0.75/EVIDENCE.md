# Evidence pack: day-type-expansion:fx_k0.75

Unit: Brier skill vs sigma-only (fraction). Useful bar: +0.02. 5940 scored rows, 991 independent clusters, 6 instruments, 2022-09-05 → 2026-07-02. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 67% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.0017 [-0.004806, +0.008324]. Shuffled-signal 95% band [-0.009891, -0.001719]; the real estimate sits at the 100th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.01) | 100% | +0.0117 |
| 1.0× bar (+0.02) | 100% | +0.0217 |
| 2.0× bar (+0.04) | 100% | +0.0417 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean +0.0017). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 988 | -0.008212 | [-0.0193, +0.001808] |
| EURUSD | 991 | +0.007105 | [-0.003844, +0.01784] |
| GBPUSD | 991 | +0.0001997 | [-0.009247, +0.01024] |
| USDCAD | 989 | -0.0001072 | [-0.01077, +0.00952] |
| USDCHF | 990 | +0.002141 | [-0.009429, +0.01339] |
| USDJPY | 991 | +0.009704 | [-0.0008121, +0.02245] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 504 | +0.004054 | [-0.02325, +0.03592] |
| 2023 | 1551 | +0.002377 | [-0.0125, +0.02084] |
| 2024 | 1551 | +0.00405 | [-0.006978, +0.01733] |
| 2025 | 1554 | +0.001707 | [-0.00851, +0.01054] |
| 2026 | 780 | -0.00622 | [-0.01902, +0.00681] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 2976 | +0.007645 | [-0.003834, +0.01988] |
| H2 | 2964 | -0.004491 | [-0.0107, +0.002489] |

Without the largest 1% of rows: +0.001851.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 594 | -0.05158 | [-0.08623, -0.01692] |
| D2 | 594 | -0.05036 | [-0.08429, -0.01642] |
| D3 | 594 | -0.05322 | [-0.08697, -0.01947] |
| D4 | 594 | -0.04056 | [-0.07498, -0.006134] |
| D5 | 594 | -0.02704 | [-0.06188, +0.007795] |
| D6 | 594 | -0.04986 | [-0.08349, -0.01622] |
| D7 | 594 | -0.01789 | [-0.05331, +0.01752] |
| D8 | 594 | -0.01576 | [-0.05124, +0.01973] |
| D9 | 594 | -0.02672 | [-0.06187, +0.008441] |
| D10 | 594 | +0.02545 | [-0.01256, +0.06346] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

OOS predictions rebuilt with the runner's own functions (same seed/folds); the registered BSS_B1 for this cell was +0.0017. The pack bootstraps dates iid (the runner used 21-day moving blocks), so its CI can be a little narrower. Placebo = the model's lift (pm - p1) shuffled across dates within instrument.
