# Evidence pack: day-type-expansion:gold_k0.75

Unit: Brier skill vs sigma-only (fraction). Useful bar: +0.02. 953 scored rows, 953 independent clusters, 1 instruments, 2022-09-06 → 2026-07-02. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.004326 [-0.01117, +0.002773]. Shuffled-signal 95% band [-0.01021, +0.0041]; the real estimate sits at the 35th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.01) | 3% | +0.005674 |
| 1.0× bar (+0.02) | 100% | +0.01567 |
| 2.0× bar (+0.04) | 100% | +0.03567 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.004326). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| GOLD | 953 | -0.004326 | [-0.01045, +0.003672] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 81 | +0.001257 | [-0.01486, +0.02228] |
| 2023 | 249 | -0.00263 | [-0.0151, +0.0103] |
| 2024 | 249 | -0.008705 | [-0.02341, +0.007471] |
| 2025 | 249 | -0.006285 | [-0.01986, +0.005987] |
| 2026 | 125 | +0.002701 | [-0.02104, +0.02415] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 477 | -0.006489 | [-0.01568, +0.002773] |
| H2 | 476 | -0.001927 | [-0.01153, +0.007989] |

Without the largest 1% of rows: -0.005724.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 96 | -0.0336 | [-0.1185, +0.05128] |
| D2 | 95 | +0.02849 | [-0.06323, +0.1202] |
| D3 | 95 | -8.778e-05 | [-0.0881, +0.08793] |
| D4 | 95 | +0.002959 | [-0.08669, +0.0926] |
| D5 | 96 | +0.03609 | [-0.05403, +0.1262] |
| D6 | 95 | -0.015 | [-0.1026, +0.07256] |
| D7 | 95 | -0.007683 | [-0.09586, +0.08049] |
| D8 | 95 | -0.02512 | [-0.1131, +0.06285] |
| D9 | 95 | +0.04868 | [-0.04322, +0.1406] |
| D10 | 96 | -0.03708 | [-0.1262, +0.05206] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

OOS predictions rebuilt with the runner's own functions (same seed/folds); the registered BSS_B1 for this cell was -0.0043. The pack bootstraps dates iid (the runner used 21-day moving blocks), so its CI can be a little narrower. Placebo = the model's lift (pm - p1) shuffled across dates within instrument.
