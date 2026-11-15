# Evidence pack: slow-bias-clock:dirp5_fx

Unit: Brier skill vs B0 (test rows). Useful bar: +0.004. 54299 scored rows, 6053 independent clusters, 9 instruments, 2003-04-29 → 2026-08-14. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 56% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.0003936 [-0.001524, +0.0003623]. Shuffled-signal 95% band [-0.0007352, -0.0003641]; the real estimate sits at the 91th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002) | 0% | +0.001606 |
| 1.0× bar (+0.004) | 100% | +0.003609 |
| 2.0× bar (+0.008) | 100% | +0.00761 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.0003936). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 6036 | -0.000464 | [-0.0114, +0.006391] |
| EURJPY | 6047 | -0.004125 | [-0.01143, +0.0005346] |
| EURUSD | 6045 | -0.007121 | [-0.02297, +0.002114] |
| GBPJPY | 6047 | -0.0007707 | [-0.006182, +0.002396] |
| GBPUSD | 6046 | +0.00213 | [-0.004554, +0.006059] |
| NZDUSD | 5947 | +0.006189 | [-0.006658, +0.01149] |
| USDCAD | 6043 | +0.0007759 | [-0.01051, +0.006962] |
| USDCHF | 6042 | -0.004724 | [-0.02026, +0.004021] |
| USDJPY | 6046 | +0.006446 | [-0.001006, +0.01006] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2003 | 1483 | — | [—, —] |
| 2004 | 2342 | — | [—, —] |
| 2005 | 2335 | — | [—, —] |
| 2006 | 2338 | — | [—, —] |
| 2007 | 2349 | — | [—, —] |
| 2008 | 2358 | — | [—, —] |
| 2009 | 2349 | — | [—, —] |
| 2010 | 2348 | — | [—, —] |
| 2011 | 2340 | — | [—, —] |
| 2012 | 2338 | — | [—, —] |
| 2013 | 2331 | — | [—, —] |
| 2014 | 2330 | — | [—, —] |
| 2015 | 2285 | — | [—, —] |
| 2016 | 2331 | +0.001171 | [-0.0003932, +0.002804] |
| 2017 | 2322 | -0.00042 | [-0.002276, +0.001913] |
| 2018 | 2330 | +0.00275 | [+0.0006937, +0.004528] |
| 2019 | 2330 | +0.001221 | [-0.0006953, +0.003293] |
| 2020 | 2341 | -0.001161 | [-0.003253, +0.0008119] |
| 2021 | 2339 | +0.00019 | [-0.002103, +0.002506] |
| 2022 | 2331 | +0.0002311 | [-0.001611, +0.001994] |
| 2023 | 2331 | -0.00248 | [-0.004805, -0.0003778] |
| 2024 | 2340 | -0.002245 | [-0.004875, +0.0004242] |
| 2025 | 2330 | -0.001531 | [-0.003998, +0.000776] |
| 2026 | 1448 | -0.00317 | [-0.00601, -0.0004588] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 27151 | — | [—, —] |
| H2 | 27148 | -0.004843 | [-0.01818, -0.0002488] |

Without the largest 1% of rows: -0.0004041.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 5430 | +0.004031 | [-0.02775, +0.03581] |
| D2 | 5430 | -0.001776 | [-0.03006, +0.0265] |
| D3 | 5430 | -0.003729 | [-0.03082, +0.02336] |
| D4 | 5430 | -0.001027 | [-0.02729, +0.02523] |
| D5 | 5430 | +0.01244 | [-0.01497, +0.03985] |
| D6 | 5429 | +0.01412 | [-0.01315, +0.0414] |
| D7 | 5430 | +0.02108 | [-0.005675, +0.04784] |
| D8 | 5430 | -0.02999 | [-0.05709, -0.00289] |
| D9 | 5430 | -0.006911 | [-0.03449, +0.02067] |
| D10 | 5430 | +0.004624 | [-0.02866, +0.03791] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows: fit (label end < 2016-01-01) and test (2016-01-04 ->) rows of the group. Every estimate refits logit P = logit(B0) + a + b S on its fit rows (registered fit: a -0.0402, b -0.0109) and scores Brier skill vs B0 on its test rows. Outcome = horizon log return in sigma60 units; y = outcome > 0. Plant: a drift in the side direction on all rows, sized by bisection so the skill rises by the planted amount. Per-year and per-half rows with no fit rows use the registered (a, b); the pack halves split on the median date of fit+test rows, so read the RESULTS halves instead.
