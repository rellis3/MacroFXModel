# Evidence pack: day-type-expansion:fx_k0.5

Unit: Brier skill vs sigma-only (fraction). Useful bar: +0.02. 5940 scored rows, 991 independent clusters, 6 instruments, 2022-09-05 → 2026-07-02. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 50% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.0006361 [-0.005514, +0.007517]. Shuffled-signal 95% band [-0.009191, -0.001838]; the real estimate sits at the 100th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.01) | 100% | +0.01064 |
| 1.0× bar (+0.02) | 100% | +0.02064 |
| 2.0× bar (+0.04) | 100% | +0.04064 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean +0.0006361). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 988 | -0.002542 | [-0.01208, +0.006364] |
| EURUSD | 991 | +7.507e-05 | [-0.01109, +0.01072] |
| GBPUSD | 991 | -0.002891 | [-0.01234, +0.00916] |
| USDCAD | 989 | -0.002005 | [-0.0129, +0.009147] |
| USDCHF | 990 | +0.005934 | [-0.005442, +0.01639] |
| USDJPY | 991 | +0.005357 | [-0.004686, +0.01491] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 504 | +0.006339 | [-0.01866, +0.03421] |
| 2023 | 1551 | -0.0003535 | [-0.01471, +0.01663] |
| 2024 | 1551 | +0.002851 | [-0.009454, +0.0169] |
| 2025 | 1554 | -0.0006332 | [-0.01129, +0.009442] |
| 2026 | 780 | -0.003162 | [-0.01757, +0.01149] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 2976 | +0.00424 | [-0.007344, +0.01563] |
| H2 | 2964 | -0.003096 | [-0.01111, +0.003931] |

Without the largest 1% of rows: +0.0001774.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 594 | -0.03211 | [-0.07046, +0.006251] |
| D2 | 594 | -0.06058 | [-0.09769, -0.02348] |
| D3 | 594 | -0.03434 | [-0.07202, +0.003337] |
| D4 | 594 | -0.02084 | [-0.05885, +0.01716] |
| D5 | 594 | -0.06619 | [-0.1027, -0.0297] |
| D6 | 594 | -0.02824 | [-0.06562, +0.009131] |
| D7 | 594 | +0.002984 | [-0.03541, +0.04138] |
| D8 | 594 | -0.01571 | [-0.05362, +0.02221] |
| D9 | 594 | -0.0004788 | [-0.03886, +0.0379] |
| D10 | 594 | +0.02237 | [-0.01755, +0.06229] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

OOS predictions rebuilt with the runner's own functions (same seed/folds); the registered BSS_B1 for this cell was +0.0006. The pack bootstraps dates iid (the runner used 21-day moving blocks), so its CI can be a little narrower. Placebo = the model's lift (pm - p1) shuffled across dates within instrument.
