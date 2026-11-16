# Evidence pack: day-type-expansion:gold_k0.5

Unit: Brier skill vs sigma-only (fraction). Useful bar: +0.02. 953 scored rows, 953 independent clusters, 1 instruments, 2022-09-06 → 2026-07-02. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.003608 [-0.01171, +0.004988]. Shuffled-signal 95% band [-0.01261, +0.003975]; the real estimate sits at the 59th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.01) | 0% | +0.006392 |
| 1.0× bar (+0.02) | 100% | +0.01639 |
| 2.0× bar (+0.04) | 100% | +0.03639 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.003608). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| GOLD | 953 | -0.003608 | [-0.01147, +0.00554] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 81 | +0.001527 | [-0.02033, +0.02569] |
| 2023 | 249 | +0.007284 | [-0.0127, +0.02137] |
| 2024 | 249 | -0.02334 | [-0.0407, -0.002221] |
| 2025 | 249 | -0.002066 | [-0.01462, +0.0126] |
| 2026 | 125 | +0.00947 | [-0.01474, +0.03033] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 477 | -0.0077 | [-0.02231, +0.004028] |
| H2 | 476 | +0.0009347 | [-0.008736, +0.01142] |

Without the largest 1% of rows: -0.005001.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 96 | -0.02939 | [-0.1223, +0.06348] |
| D2 | 95 | +0.01445 | [-0.08069, +0.1096] |
| D3 | 95 | +0.00341 | [-0.09228, +0.0991] |
| D4 | 95 | -0.05831 | [-0.1493, +0.03271] |
| D5 | 96 | -0.04288 | [-0.1317, +0.04597] |
| D6 | 95 | +0.02121 | [-0.07411, +0.1165] |
| D7 | 95 | -0.01742 | [-0.1142, +0.07933] |
| D8 | 95 | -0.008207 | [-0.1026, +0.08621] |
| D9 | 95 | -0.01048 | [-0.1064, +0.08542] |
| D10 | 96 | -0.011 | [-0.1076, +0.08564] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

OOS predictions rebuilt with the runner's own functions (same seed/folds); the registered BSS_B1 for this cell was -0.0036. The pack bootstraps dates iid (the runner used 21-day moving blocks), so its CI can be a little narrower. Placebo = the model's lift (pm - p1) shuffled across dates within instrument.
