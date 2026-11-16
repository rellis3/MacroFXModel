# Evidence pack: pre-release-ranging/C_asia_break

Unit: probability. Useful bar: +0.08. 7023 scored rows, 1229 independent clusters, 6 instruments, 2017-01-06 → 2026-08-13. Prereg verdict: **NULL**.

## Diagnosis: SMALL BUT REAL: above zero, below the useful size

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | True |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 83% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.015 [+0.001035, +0.03016]. Shuffled-signal 95% band [-0.01366, +0.01301]; the real estimate sits at the 99th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.04) | 100% | +0.055 |
| 1.0× bar (+0.08) | 100% | +0.095 |
| 2.0× bar (+0.16) | 100% | +0.175 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.004203 (clean +0.015). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| eurusd | 1220 | -0.01109 | [-0.02829, +0.004659] |
| gbpusd | 1222 | +0.004603 | [-0.007594, +0.01793] |
| gold | 1200 | +0.01686 | [-0.01785, +0.05007] |
| nq | 1183 | +0.03106 | [-0.005217, +0.06835] |
| spx500 | 976 | +0.01834 | [-0.01262, +0.05363] |
| usdjpy | 1222 | +0.03072 | [-0.0135, +0.08646] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2017 | 644 | -0.00509 | [-0.05263, +0.05107] |
| 2018 | 768 | +0.01152 | [-0.03301, +0.05505] |
| 2019 | 692 | +0.04255 | [-0.01063, +0.09184] |
| 2020 | 707 | +0.02572 | [-0.02421, +0.07135] |
| 2021 | 834 | +0.01817 | [-0.02247, +0.0664] |
| 2022 | 731 | -0.0202 | [-0.06136, +0.02372] |
| 2023 | 770 | +0.02083 | [-0.01477, +0.06178] |
| 2024 | 637 | +0.02759 | [-0.01975, +0.06993] |
| 2025 | 768 | +0.01475 | [-0.03176, +0.06905] |
| 2026 | 472 | +0.006081 | [-0.05313, +0.0664] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3513 | +0.022 | [-0.0009313, +0.04706] |
| H2 | 3510 | +0.008203 | [-0.01062, +0.02838] |

Without the largest 1% of rows: +0.015.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1 | 4664 | +0.00461 | [-0.002537, +0.01176] |
| 1 | 2359 | +0.01961 | [+0.008564, +0.03065] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows: event days (side +1) and pseudo-event non-release days (side -1); outcome = compression vs the row's own matched controls (control - row; positive = narrower / fewer breaks). Estimate = event mean - pseudo mean. Placebo = event/pseudo labels shuffled across dates. Leak canary: labels reassigned by the realised post-release range excess (top half = +1).
