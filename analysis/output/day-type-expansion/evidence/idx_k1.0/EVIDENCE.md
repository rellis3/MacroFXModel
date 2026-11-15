# Evidence pack: day-type-expansion:idx_k1.0

Unit: Brier skill vs sigma-only (fraction). Useful bar: +0.02. 1894 scored rows, 949 independent clusters, 2 instruments, 2022-09-06 → 2026-07-02. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNSTABLE: significant overall but one half disagrees

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | False |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.01882 [+0.00143, +0.03664]. Shuffled-signal 95% band [-0.03331, -0.007739]; the real estimate sits at the 100th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.01) | 100% | +0.02882 |
| 1.0× bar (+0.02) | 100% | +0.03882 |
| 2.0× bar (+0.04) | 100% | +0.05882 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean +0.01882). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| NQ | 948 | +0.01618 | [+0.001175, +0.03572] |
| SPX500 | 946 | +0.0216 | [-0.001024, +0.0427] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 162 | +0.004947 | [-0.05877, +0.06658] |
| 2023 | 495 | -0.01338 | [-0.04149, +0.01544] |
| 2024 | 494 | +0.03461 | [-0.000777, +0.0734] |
| 2025 | 494 | +0.05267 | [+0.0133, +0.08644] |
| 2026 | 249 | +0.01888 | [-0.04566, +0.08307] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 949 | -0.002763 | [-0.02123, +0.01632] |
| H2 | 945 | +0.04717 | [+0.01819, +0.07843] |

Without the largest 1% of rows: +0.01937.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 190 | -0.1126 | [-0.1623, -0.06292] |
| D2 | 189 | -0.07991 | [-0.1337, -0.02608] |
| D3 | 189 | -0.08112 | [-0.1348, -0.02741] |
| D4 | 190 | -0.04613 | [-0.1045, +0.01221] |
| D5 | 189 | +0.0117 | [-0.05251, +0.07591] |
| D6 | 189 | -0.0292 | [-0.08953, +0.03113] |
| D7 | 190 | -0.01843 | [-0.07956, +0.0427] |
| D8 | 189 | +0.04675 | [-0.01945, +0.1129] |
| D9 | 189 | +0.02113 | [-0.04259, +0.08484] |
| D10 | 190 | +0.09046 | [+0.02242, +0.1585] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

OOS predictions rebuilt with the runner's own functions (same seed/folds); the registered BSS_B1 for this cell was +0.0188. The pack bootstraps dates iid (the runner used 21-day moving blocks), so its CI can be a little narrower. Placebo = the model's lift (pm - p1) shuffled across dates within instrument.
