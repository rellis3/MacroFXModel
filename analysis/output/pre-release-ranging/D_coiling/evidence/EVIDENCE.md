# Evidence pack: pre-release-ranging/D_coiling

Unit: Spearman rho. Useful bar: +0.15. 7023 scored rows, 1229 independent clusters, 6 instruments, 2017-01-06 → 2026-08-13. Prereg verdict: **UNDERPOWERED** (registered positive-control clause, prereg A1).

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.2021 [-0.2749, -0.1273]. Shuffled-signal 95% band [-0.0465, +0.049]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.075) | 0% | -0.09911 |
| 1.0× bar (+0.15) | 0% | +0.0005838 |
| 2.0× bar (+0.3) | 100% | +0.1789 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes -0.08463 (clean -0.2021). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| eurusd | 1220 | -0.08411 | [-0.2182, +0.03887] |
| gbpusd | 1222 | -0.1613 | [-0.2673, -0.04673] |
| gold | 1200 | -0.2158 | [-0.3184, -0.08101] |
| nq | 1183 | -0.2712 | [-0.3767, -0.1403] |
| spx500 | 976 | -0.1406 | [-0.2717, -0.01553] |
| usdjpy | 1222 | -0.1075 | [-0.2218, +0.03179] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2017 | 644 | -0.1284 | [-0.3442, +0.05529] |
| 2018 | 768 | -0.1437 | [-0.3504, +0.05716] |
| 2019 | 692 | -0.3621 | [-0.5303, -0.1508] |
| 2020 | 707 | -0.1629 | [-0.3895, +0.05909] |
| 2021 | 834 | -0.1992 | [-0.3951, -0.04283] |
| 2022 | 731 | -0.255 | [-0.4707, -0.04878] |
| 2023 | 770 | -0.1544 | [-0.3691, +0.05089] |
| 2024 | 637 | -0.2485 | [-0.4646, -0.01443] |
| 2025 | 768 | -0.2114 | [-0.4736, +0.02531] |
| 2026 | 472 | -0.3207 | [-0.6035, -0.02496] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3513 | -0.1767 | [-0.2778, -0.09285] |
| H2 | 3510 | -0.2325 | [-0.3226, -0.1302] |

Without the largest 1% of rows: -0.1998.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1 | 4664 | +0.9321 | [+0.9158, +0.9484] |
| 1 | 2359 | +1.35 | [+1.323, +1.376] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows as above; estimate = Spearman(pre, post) on pseudo days - Spearman(pre, post) on event days (positive = coiling: a tight pre-release range goes with a wider post-release range, beyond normal days). Plant adds a negative pre->post rank relation of about the bar on event rows.
