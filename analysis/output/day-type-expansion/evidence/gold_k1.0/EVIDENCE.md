# Evidence pack: day-type-expansion:gold_k1.0

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

**Headline:** -0.0069 [-0.01927, +0.005235]. Shuffled-signal 95% band [-0.01769, +0.003694]; the real estimate sits at the 49th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.01) | 0% | +0.0031 |
| 1.0× bar (+0.02) | 93% | +0.0131 |
| 2.0× bar (+0.04) | 100% | +0.0331 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.0069). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| GOLD | 953 | -0.0069 | [-0.01729, +0.004073] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 81 | +0.01744 | [-0.02894, +0.05519] |
| 2023 | 249 | -0.003274 | [-0.02883, +0.02125] |
| 2024 | 249 | -0.02379 | [-0.04985, +0.002353] |
| 2025 | 249 | -0.0005871 | [-0.0187, +0.01555] |
| 2026 | 125 | -0.01278 | [-0.03944, +0.01279] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 477 | -0.003985 | [-0.02422, +0.01451] |
| H2 | 476 | -0.01039 | [-0.02582, +0.00103] |

Without the largest 1% of rows: -0.006313.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 96 | +0.02244 | [-0.06446, +0.1093] |
| D2 | 95 | -0.01894 | [-0.09448, +0.05659] |
| D3 | 95 | +0.007197 | [-0.07299, +0.08739] |
| D4 | 95 | -0.0205 | [-0.09276, +0.05176] |
| D5 | 96 | +0.01085 | [-0.06655, +0.08825] |
| D6 | 95 | -0.003475 | [-0.07854, +0.07159] |
| D7 | 95 | +0.03871 | [-0.046, +0.1234] |
| D8 | 95 | +0.008629 | [-0.0725, +0.08976] |
| D9 | 95 | -0.01566 | [-0.09259, +0.06126] |
| D10 | 96 | +0.0332 | [-0.05634, +0.1228] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

OOS predictions rebuilt with the runner's own functions (same seed/folds); the registered BSS_B1 for this cell was -0.0069. The pack bootstraps dates iid (the runner used 21-day moving blocks), so its CI can be a little narrower. Placebo = the model's lift (pm - p1) shuffled across dates within instrument.
