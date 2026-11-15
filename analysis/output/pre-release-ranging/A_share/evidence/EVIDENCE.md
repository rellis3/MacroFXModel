# Evidence pack: pre-release-ranging/A_share

Unit: share of day range. Useful bar: +0.05. 7023 scored rows, 1229 independent clusters, 6 instruments, 2017-01-06 → 2026-08-13. Prereg verdict: **VALIDATED**.

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

**Headline:** +0.1472 [+0.1296, +0.1664]. Shuffled-signal 95% band [-0.01049, +0.01051]; the real estimate sits at the 100th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.025) | 100% | +0.1722 |
| 1.0× bar (+0.05) | 100% | +0.1972 |
| 2.0× bar (+0.1) | 100% | +0.2472 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.2401 (clean +0.1472). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| eurusd | 1220 | +0.1763 | [+0.1448, +0.2069] |
| gbpusd | 1222 | +0.1539 | [+0.1327, +0.1818] |
| gold | 1200 | +0.146 | [+0.1184, +0.1707] |
| nq | 1183 | +0.1063 | [+0.0841, +0.1336] |
| spx500 | 976 | +0.113 | [+0.08487, +0.1379] |
| usdjpy | 1222 | +0.181 | [+0.1519, +0.2098] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2017 | 644 | +0.1774 | [+0.1238, +0.224] |
| 2018 | 768 | +0.1157 | [+0.06932, +0.1693] |
| 2019 | 692 | +0.1218 | [+0.06573, +0.186] |
| 2020 | 707 | +0.0702 | [+0.02439, +0.1155] |
| 2021 | 834 | +0.1242 | [+0.07133, +0.1728] |
| 2022 | 731 | +0.1826 | [+0.1195, +0.2377] |
| 2023 | 770 | +0.1688 | [+0.1252, +0.2245] |
| 2024 | 637 | +0.1954 | [+0.1252, +0.2522] |
| 2025 | 768 | +0.1865 | [+0.1189, +0.2382] |
| 2026 | 472 | +0.1197 | [+0.03941, +0.2065] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3513 | +0.1199 | [+0.09659, +0.1446] |
| H2 | 3510 | +0.1733 | [+0.1487, +0.1997] |

Without the largest 1% of rows: +0.1346.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| -1 | 4664 | +0.003603 | [-0.002385, +0.009592] |
| 1 | 2359 | +0.1508 | [+0.1414, +0.1602] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows: event days (side +1) and pseudo-event non-release days (side -1); outcome = compression vs the row's own matched controls (control - row; positive = narrower / fewer breaks). Estimate = event mean - pseudo mean. Placebo = event/pseudo labels shuffled across dates. Leak canary: labels reassigned by the realised post-release range excess (top half = +1).
