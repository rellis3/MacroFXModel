# Evidence pack: day-type-expansion:idx_k0.75

Unit: Brier skill vs sigma-only (fraction). Useful bar: +0.02. 1894 scored rows, 949 independent clusters, 2 instruments, 2022-09-06 → 2026-07-02. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: INCONCLUSIVE: the interval includes both zero and the useful size

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | False |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.01362 [-0.00331, +0.0315]. Shuffled-signal 95% band [-0.03315, -0.007119]; the real estimate sits at the 100th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.01) | 100% | +0.02362 |
| 1.0× bar (+0.02) | 100% | +0.03362 |
| 2.0× bar (+0.04) | 100% | +0.05362 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean +0.01362). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| NQ | 948 | +0.02035 | [+0.005476, +0.04122] |
| SPX500 | 946 | +0.006746 | [-0.01615, +0.02777] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 162 | +0.0004949 | [-0.05085, +0.06161] |
| 2023 | 495 | -0.02473 | [-0.05447, +0.008473] |
| 2024 | 494 | +0.03408 | [+0.001778, +0.07243] |
| 2025 | 494 | +0.03947 | [+0.005268, +0.07273] |
| 2026 | 249 | +0.02383 | [-0.04202, +0.08727] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 949 | -0.01086 | [-0.0291, +0.01123] |
| H2 | 945 | +0.04284 | [+0.01453, +0.06742] |

Without the largest 1% of rows: +0.01658.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 190 | -0.1457 | [-0.2026, -0.08878] |
| D2 | 189 | -0.07259 | [-0.1361, -0.009137] |
| D3 | 189 | -0.08523 | [-0.1476, -0.02291] |
| D4 | 190 | -0.04452 | [-0.1103, +0.02127] |
| D5 | 189 | +0.005636 | [-0.06326, +0.07454] |
| D6 | 189 | -0.02574 | [-0.09327, +0.04179] |
| D7 | 190 | -0.004062 | [-0.07215, +0.06402] |
| D8 | 189 | -0.04187 | [-0.1084, +0.02469] |
| D9 | 189 | +0.1051 | [+0.03441, +0.1758] |
| D10 | 190 | +0.01285 | [-0.05633, +0.08204] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

OOS predictions rebuilt with the runner's own functions (same seed/folds); the registered BSS_B1 for this cell was +0.0136. The pack bootstraps dates iid (the runner used 21-day moving blocks), so its CI can be a little narrower. Placebo = the model's lift (pm - p1) shuffled across dates within instrument.
