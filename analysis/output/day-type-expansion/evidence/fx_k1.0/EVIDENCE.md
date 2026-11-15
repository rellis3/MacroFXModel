# Evidence pack: day-type-expansion:fx_k1.0

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

**Headline:** +0.003148 [-0.005058, +0.0116]. Shuffled-signal 95% band [-0.01467, -0.004351]; the real estimate sits at the 100th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.01) | 100% | +0.01315 |
| 1.0× bar (+0.02) | 100% | +0.02315 |
| 2.0× bar (+0.04) | 100% | +0.04315 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean +0.003148). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 988 | -0.005474 | [-0.01938, +0.007101] |
| EURUSD | 991 | +0.01142 | [-0.001419, +0.0255] |
| GBPUSD | 991 | -0.001098 | [-0.01308, +0.009186] |
| USDCAD | 989 | -0.002763 | [-0.01761, +0.009871] |
| USDCHF | 990 | +0.006996 | [-0.007797, +0.02197] |
| USDJPY | 991 | +0.01053 | [-0.002914, +0.02424] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 504 | +0.004386 | [-0.0217, +0.03371] |
| 2023 | 1551 | +0.009611 | [-0.009282, +0.02693] |
| 2024 | 1551 | +0.003304 | [-0.01546, +0.01938] |
| 2025 | 1554 | +0.00175 | [-0.01406, +0.01398] |
| 2026 | 780 | -0.01023 | [-0.02935, +0.009133] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 2976 | +0.0145 | [+0.0007736, +0.02892] |
| H2 | 2964 | -0.009253 | [-0.01869, -0.0003694] |

Without the largest 1% of rows: +0.003466.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 594 | -0.047 | [-0.07758, -0.01641] |
| D2 | 594 | -0.05126 | [-0.08047, -0.02205] |
| D3 | 594 | -0.04985 | [-0.0793, -0.02039] |
| D4 | 594 | -0.05836 | [-0.08748, -0.02924] |
| D5 | 594 | -0.04858 | [-0.07795, -0.01922] |
| D6 | 594 | -0.0338 | [-0.06413, -0.003479] |
| D7 | 594 | -0.01825 | [-0.04962, +0.01311] |
| D8 | 594 | -0.002613 | [-0.0347, +0.02947] |
| D9 | 594 | -0.02761 | [-0.05914, +0.003926] |
| D10 | 594 | +0.03947 | [+0.003786, +0.07515] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

OOS predictions rebuilt with the runner's own functions (same seed/folds); the registered BSS_B1 for this cell was +0.0031. The pack bootstraps dates iid (the runner used 21-day moving blocks), so its CI can be a little narrower. Placebo = the model's lift (pm - p1) shuffled across dates within instrument.
