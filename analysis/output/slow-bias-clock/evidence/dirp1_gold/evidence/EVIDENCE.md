# Evidence pack: slow-bias-clock:dirp1_gold

Unit: Brier skill vs B0 (test rows). Useful bar: +0.004. 5034 scored rows, 5034 independent clusters, 1 instruments, 2007-03-08 → 2026-08-20. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.00299 [-0.01119, +6.017e-05]. Shuffled-signal 95% band [-0.006232, -0.002615]; the real estimate sits at the 94th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002) | 0% | -0.000951 |
| 1.0× bar (+0.004) | 0% | +0.001054 |
| 2.0× bar (+0.008) | 0% | +0.005091 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.00299). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| GOLD | 5034 | -0.00299 | [-0.011, +0.0004447] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2007 | 212 | — | [—, —] |
| 2008 | 261 | — | [—, —] |
| 2009 | 261 | — | [—, —] |
| 2010 | 260 | — | [—, —] |
| 2011 | 260 | — | [—, —] |
| 2012 | 259 | — | [—, —] |
| 2013 | 259 | — | [—, —] |
| 2014 | 259 | — | [—, —] |
| 2015 | 258 | — | [—, —] |
| 2016 | 258 | +0.002293 | [-0.007859, +0.01097] |
| 2017 | 257 | -0.01168 | [-0.02129, +0.001033] |
| 2018 | 259 | +0.003061 | [-0.009006, +0.0153] |
| 2019 | 258 | -0.005853 | [-0.01696, +0.002621] |
| 2020 | 259 | -0.008024 | [-0.01525, -0.0004083] |
| 2021 | 258 | -0.0001504 | [-0.01341, +0.009759] |
| 2022 | 258 | -0.000753 | [-0.01493, +0.01047] |
| 2023 | 257 | +0.002043 | [-0.006381, +0.0117] |
| 2024 | 259 | -0.006678 | [-0.01347, +0.000961] |
| 2025 | 258 | -0.00562 | [-0.01133, -1.779e-05] |
| 2026 | 164 | -0.001207 | [-0.01568, +0.01109] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 2518 | -0.0003842 | [-0.0184, +0.01092] |
| H2 | 2516 | -0.003229 | [-0.007195, -0.00016] |

Without the largest 1% of rows: -0.002452.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 504 | +0.0429 | [-0.06517, +0.151] |
| D2 | 503 | +0.0256 | [-0.06332, +0.1145] |
| D3 | 503 | +0.02776 | [-0.05424, +0.1098] |
| D4 | 504 | -0.008537 | [-0.08527, +0.0682] |
| D5 | 503 | +0.0271 | [-0.05875, +0.113] |
| D6 | 503 | +0.06358 | [-0.01551, +0.1427] |
| D7 | 504 | -0.02844 | [-0.1147, +0.05782] |
| D8 | 503 | +0.04471 | [-0.03527, +0.1247] |
| D9 | 503 | +0.1409 | [+0.04335, +0.2385] |
| D10 | 504 | +0.1085 | [-0.02352, +0.2406] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows: fit (label end < 2016-01-01) and test (2016-01-04 ->) rows of the group. Every estimate refits logit P = logit(B0) + a + b S on its fit rows (registered fit: a -0.0971, b +0.0388) and scores Brier skill vs B0 on its test rows. Outcome = horizon log return in sigma60 units; y = outcome > 0. Plant: a drift in the side direction on all rows, sized by bisection so the skill rises by the planted amount. Per-year and per-half rows with no fit rows use the registered (a, b); the pack halves split on the median date of fit+test rows, so read the RESULTS halves instead.
