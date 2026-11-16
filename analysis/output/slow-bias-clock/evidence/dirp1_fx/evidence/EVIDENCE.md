# Evidence pack: slow-bias-clock:dirp1_fx

Unit: Brier skill vs B0 (test rows). Useful bar: +0.004. 54317 scored rows, 6061 independent clusters, 9 instruments, 2003-04-29 → 2026-08-20. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 67% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.0004967 [-0.001756, +4.056e-05]. Shuffled-signal 95% band [-0.0007606, -0.0004063]; the real estimate sits at the 46th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002) | 70% | +0.001505 |
| 1.0× bar (+0.004) | 100% | +0.003507 |
| 2.0× bar (+0.008) | 100% | +0.007509 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.0004967). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 6038 | -0.0003921 | [-0.005446, +0.001495] |
| EURJPY | 6055 | -0.002024 | [-0.008646, +0.0004539] |
| EURUSD | 6046 | -0.0001169 | [-0.00544, +0.002196] |
| GBPJPY | 6055 | -0.0007021 | [-0.00514, +0.001014] |
| GBPUSD | 6053 | -0.00214 | [-0.008828, +0.00082] |
| NZDUSD | 5945 | +0.001089 | [-0.004186, +0.003723] |
| USDCAD | 6037 | +0.00145 | [-0.002912, +0.004342] |
| USDCHF | 6043 | -8.636e-05 | [-0.007698, +0.002937] |
| USDJPY | 6045 | +0.00263 | [-0.001755, +0.005571] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2003 | 1485 | — | [—, —] |
| 2004 | 2338 | — | [—, —] |
| 2005 | 2327 | — | [—, —] |
| 2006 | 2332 | — | [—, —] |
| 2007 | 2344 | — | [—, —] |
| 2008 | 2356 | — | [—, —] |
| 2009 | 2345 | — | [—, —] |
| 2010 | 2346 | — | [—, —] |
| 2011 | 2339 | — | [—, —] |
| 2012 | 2339 | — | [—, —] |
| 2013 | 2327 | — | [—, —] |
| 2014 | 2329 | — | [—, —] |
| 2015 | 2320 | — | [—, —] |
| 2016 | 2330 | -0.0001571 | [-0.001076, +0.0009049] |
| 2017 | 2320 | -0.0004845 | [-0.001873, +0.0007087] |
| 2018 | 2329 | +0.0003955 | [-0.0007668, +0.001618] |
| 2019 | 2328 | +0.0005601 | [-0.0003786, +0.001722] |
| 2020 | 2337 | -0.000378 | [-0.001526, +0.001057] |
| 2021 | 2339 | +1.126e-05 | [-0.001594, +0.001449] |
| 2022 | 2329 | -0.0008223 | [-0.00187, +0.0004706] |
| 2023 | 2328 | -0.0008651 | [-0.002273, +0.0005195] |
| 2024 | 2337 | -0.00176 | [-0.003107, -0.0003477] |
| 2025 | 2328 | -0.0003753 | [-0.001611, +0.00107] |
| 2026 | 1485 | -0.002221 | [-0.004065, -0.0006494] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 27162 | — | [—, —] |
| H2 | 27155 | -0.001199 | [-0.009207, +0.0002284] |

Without the largest 1% of rows: -0.0004882.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 5432 | +0.0041 | [-0.02806, +0.03626] |
| D2 | 5432 | -0.002498 | [-0.03049, +0.0255] |
| D3 | 5431 | -0.01495 | [-0.04188, +0.01198] |
| D4 | 5432 | +0.003899 | [-0.02247, +0.03027] |
| D5 | 5432 | +0.0008521 | [-0.02579, +0.02749] |
| D6 | 5431 | +0.01569 | [-0.01095, +0.04233] |
| D7 | 5432 | +0.009556 | [-0.01693, +0.03605] |
| D8 | 5431 | -0.006155 | [-0.03257, +0.02026] |
| D9 | 5432 | +0.01188 | [-0.01579, +0.03956] |
| D10 | 5432 | -0.01597 | [-0.04936, +0.01742] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows: fit (label end < 2016-01-01) and test (2016-01-04 ->) rows of the group. Every estimate refits logit P = logit(B0) + a + b S on its fit rows (registered fit: a -0.0252, b -0.0069) and scores Brier skill vs B0 on its test rows. Outcome = horizon log return in sigma60 units; y = outcome > 0. Plant: a drift in the side direction on all rows, sized by bisection so the skill rises by the planted amount. Per-year and per-half rows with no fit rows use the registered (a, b); the pack halves split on the median date of fit+test rows, so read the RESULTS halves instead.
