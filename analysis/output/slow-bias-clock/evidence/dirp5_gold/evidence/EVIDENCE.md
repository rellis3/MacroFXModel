# Evidence pack: slow-bias-clock:dirp5_gold

Unit: Brier skill vs B0 (test rows). Useful bar: +0.004. 5027 scored rows, 5027 independent clusters, 1 instruments, 2007-03-08 → 2026-08-14. Prereg verdict: **UNDERPOWERED**.

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

**Headline:** -0.01356 [-0.03032, -0.003822]. Shuffled-signal 95% band [-0.01676, -0.0126]; the real estimate sits at the 87th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002) | 0% | -0.01147 |
| 1.0× bar (+0.004) | 0% | -0.009379 |
| 2.0× bar (+0.008) | 0% | -0.005331 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.01356). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| GOLD | 5027 | -0.01356 | [-0.02557, -0.003946] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2007 | 212 | — | [—, —] |
| 2008 | 261 | — | [—, —] |
| 2009 | 261 | — | [—, —] |
| 2010 | 261 | — | [—, —] |
| 2011 | 260 | — | [—, —] |
| 2012 | 259 | — | [—, —] |
| 2013 | 259 | — | [—, —] |
| 2014 | 259 | — | [—, —] |
| 2015 | 254 | — | [—, —] |
| 2016 | 258 | +0.003106 | [-0.01787, +0.02301] |
| 2017 | 257 | -0.01816 | [-0.04023, +0.003787] |
| 2018 | 259 | +0.01077 | [-0.01114, +0.03237] |
| 2019 | 258 | -0.04228 | [-0.05868, -0.02076] |
| 2020 | 259 | -0.02585 | [-0.0467, -0.006986] |
| 2021 | 258 | -0.01165 | [-0.03533, +0.00781] |
| 2022 | 258 | +0.002904 | [-0.01594, +0.02353] |
| 2023 | 257 | +0.008732 | [-0.01343, +0.02698] |
| 2024 | 259 | -0.0291 | [-0.04929, -0.012] |
| 2025 | 258 | -0.05141 | [-0.07627, -0.03442] |
| 2026 | 160 | +0.005959 | [-0.02054, +0.03371] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 2514 | -0.006017 | [-0.03935, +0.01735] |
| H2 | 2513 | -0.01425 | [-0.02141, -0.007726] |

Without the largest 1% of rows: -0.01329.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 503 | +0.1335 | [+0.03419, +0.2327] |
| D2 | 503 | +0.02478 | [-0.07951, +0.1291] |
| D3 | 502 | +0.08575 | [-0.00129, +0.1728] |
| D4 | 503 | -0.0155 | [-0.0987, +0.06771] |
| D5 | 503 | +0.09491 | [+0.01448, +0.1753] |
| D6 | 502 | +0.07991 | [-0.007446, +0.1673] |
| D7 | 503 | -0.0505 | [-0.1367, +0.03575] |
| D8 | 502 | +0.07377 | [-0.01139, +0.1589] |
| D9 | 503 | +0.3009 | [+0.2007, +0.4012] |
| D10 | 503 | +0.2382 | [+0.1066, +0.3699] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows: fit (label end < 2016-01-01) and test (2016-01-04 ->) rows of the group. Every estimate refits logit P = logit(B0) + a + b S on its fit rows (registered fit: a -0.1812, b +0.0156) and scores Brier skill vs B0 on its test rows. Outcome = horizon log return in sigma60 units; y = outcome > 0. Plant: a drift in the side direction on all rows, sized by bisection so the skill rises by the planted amount. Per-year and per-half rows with no fit rows use the registered (a, b); the pack halves split on the median date of fit+test rows, so read the RESULTS halves instead.
