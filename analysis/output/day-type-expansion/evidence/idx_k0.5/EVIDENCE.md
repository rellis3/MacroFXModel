# Evidence pack: day-type-expansion:idx_k0.5

Unit: Brier skill vs sigma-only (fraction). Useful bar: +0.02. 1894 scored rows, 949 independent clusters, 2 instruments, 2022-09-06 → 2026-07-02. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.003529 [-0.0184, +0.01301]. Shuffled-signal 95% band [-0.027, -0.004642]; the real estimate sits at the 98th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.01) | 0% | +0.006471 |
| 1.0× bar (+0.02) | 87% | +0.01647 |
| 2.0× bar (+0.04) | 100% | +0.03647 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.003529). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| NQ | 948 | -0.002227 | [-0.01644, +0.01642] |
| SPX500 | 946 | -0.004853 | [-0.02307, +0.01195] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 162 | -0.01701 | [-0.0764, +0.04938] |
| 2023 | 495 | -0.03636 | [-0.06769, -0.002693] |
| 2024 | 494 | +0.01604 | [-0.01403, +0.04996] |
| 2025 | 494 | +0.01146 | [-0.01608, +0.03823] |
| 2026 | 249 | +0.009302 | [-0.03632, +0.05328] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 949 | -0.02324 | [-0.04357, -0.0005586] |
| H2 | 945 | +0.01789 | [-0.005303, +0.03956] |

Without the largest 1% of rows: -0.001842.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 190 | -0.06495 | [-0.1338, +0.003915] |
| D2 | 189 | -0.1027 | [-0.1689, -0.03654] |
| D3 | 189 | -0.03904 | [-0.1086, +0.03053] |
| D4 | 190 | -0.03347 | [-0.1028, +0.03581] |
| D5 | 189 | -0.01036 | [-0.08144, +0.06073] |
| D6 | 189 | -0.009362 | [-0.08075, +0.06203] |
| D7 | 190 | -0.02247 | [-0.09286, +0.04791] |
| D8 | 189 | -0.01883 | [-0.08977, +0.05212] |
| D9 | 189 | +0.007988 | [-0.06291, +0.07889] |
| D10 | 190 | -0.003996 | [-0.07464, +0.06665] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

OOS predictions rebuilt with the runner's own functions (same seed/folds); the registered BSS_B1 for this cell was -0.0035. The pack bootstraps dates iid (the runner used 21-day moving blocks), so its CI can be a little narrower. Placebo = the model's lift (pm - p1) shuffled across dates within instrument.
