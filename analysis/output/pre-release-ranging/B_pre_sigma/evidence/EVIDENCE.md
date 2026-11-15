# Evidence pack: pre-release-ranging/B_pre_sigma

Unit: daily sigma. Useful bar: +0.085. 7023 scored rows, 1229 independent clusters, 6 instruments, 2017-01-06 → 2026-08-13. Prereg verdict: **VALIDATED**.

## Diagnosis: REAL: check the prereg gate for the formal verdict

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | False |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.1036 [+0.07377, +0.1351]. Shuffled-signal 95% band [-0.02153, +0.01939]; the real estimate sits at the 100th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.0425) | 100% | +0.1461 |
| 1.0× bar (+0.085) | 100% | +0.1886 |
| 2.0× bar (+0.17) | 100% | +0.2736 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes -0.08779 (clean +0.1036). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| eurusd | 1220 | +0.1246 | [+0.07928, +0.1727] |
| gbpusd | 1222 | +0.1184 | [+0.06542, +0.1686] |
| gold | 1200 | +0.08153 | [+0.03589, +0.1153] |
| nq | 1183 | +0.08881 | [+0.05624, +0.1287] |
| spx500 | 976 | +0.08722 | [+0.04096, +0.1276] |
| usdjpy | 1222 | +0.1182 | [+0.06614, +0.1711] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2017 | 644 | +0.1694 | [+0.1012, +0.2269] |
| 2018 | 768 | +0.124 | [+0.05123, +0.2152] |
| 2019 | 692 | +0.06191 | [-0.03717, +0.1443] |
| 2020 | 707 | +0.09688 | [-0.00112, +0.1918] |
| 2021 | 834 | +0.1111 | [+0.04207, +0.1752] |
| 2022 | 731 | +0.09271 | [+0.01346, +0.1807] |
| 2023 | 770 | +0.1025 | [+0.01153, +0.1956] |
| 2024 | 637 | +0.09192 | [+0.01149, +0.1627] |
| 2025 | 768 | +0.09518 | [-0.0229, +0.2107] |
| 2026 | 472 | +0.08422 | [-0.05307, +0.2359] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3513 | +0.1119 | [+0.07076, +0.1461] |
| H2 | 3510 | +0.09522 | [+0.05142, +0.1355] |

Without the largest 1% of rows: +0.0962.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1 | 4664 | -0.000195 | [-0.01291, +0.01252] |
| 1 | 2359 | +0.1034 | [+0.08801, +0.1189] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows: event days (side +1) and pseudo-event non-release days (side -1); outcome = compression vs the row's own matched controls (control - row; positive = narrower / fewer breaks). Estimate = event mean - pseudo mean. Placebo = event/pseudo labels shuffled across dates. Leak canary: labels reassigned by the realised post-release range excess (top half = +1).
