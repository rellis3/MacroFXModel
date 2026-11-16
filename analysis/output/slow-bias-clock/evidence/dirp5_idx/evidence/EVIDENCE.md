# Evidence pack: slow-bias-clock:dirp5_idx

Unit: Brier skill vs B0 (test rows). Useful bar: +0.004. 13836 scored rows, 5786 independent clusters, 3 instruments, 2004-03-16 → 2026-08-14. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 33% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.0007506 [-0.006575, +0.0006532]. Shuffled-signal 95% band [-0.001255, +0.0003681]; the real estimate sits at the 9th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002) | 0% | +0.00126 |
| 1.0× bar (+0.004) | 10% | +0.003255 |
| 2.0× bar (+0.008) | 100% | +0.007294 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.0007506). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| NAS100 | 5784 | +0.0004099 | [-0.004183, +0.002535] |
| SPX500 | 5771 | -0.005386 | [-0.0177, +0.001054] |
| US30 | 2281 | +0.0006349 | [-0.001193, +0.002548] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2004 | 407 | — | [—, —] |
| 2005 | 516 | — | [—, —] |
| 2006 | 512 | — | [—, —] |
| 2007 | 518 | — | [—, —] |
| 2008 | 517 | — | [—, —] |
| 2009 | 515 | — | [—, —] |
| 2010 | 518 | — | [—, —] |
| 2011 | 516 | — | [—, —] |
| 2012 | 518 | — | [—, —] |
| 2013 | 516 | — | [—, —] |
| 2014 | 518 | — | [—, —] |
| 2015 | 507 | — | [—, —] |
| 2016 | 515 | +0.004017 | [+7e-05, +0.008345] |
| 2017 | 564 | -0.01445 | [-0.02143, -0.005894] |
| 2018 | 774 | -0.0006394 | [-0.006401, +0.004464] |
| 2019 | 772 | -0.0006114 | [-0.004651, +0.003667] |
| 2020 | 776 | -0.0004126 | [-0.005876, +0.005421] |
| 2021 | 777 | +0.002516 | [-0.001746, +0.006786] |
| 2022 | 774 | -0.007225 | [-0.01289, -0.002184] |
| 2023 | 774 | +0.002747 | [-0.001545, +0.006587] |
| 2024 | 776 | +0.001569 | [-0.003002, +0.005088] |
| 2025 | 773 | +0.002422 | [-0.001676, +0.006522] |
| 2026 | 483 | +7.254e-05 | [-0.003979, +0.004463] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 6919 | +0.000412 | [-0.01238, +0.007725] |
| H2 | 6917 | -0.0008906 | [-0.002724, +0.0005596] |

Without the largest 1% of rows: -0.0007443.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 1384 | +0.1622 | [+0.09659, +0.2277] |
| D2 | 1384 | +0.07266 | [+0.01154, +0.1338] |
| D3 | 1383 | +0.1217 | [+0.06536, +0.178] |
| D4 | 1384 | +0.1528 | [+0.1043, +0.2013] |
| D5 | 1383 | +0.1014 | [+0.05295, +0.1499] |
| D6 | 1384 | -0.0213 | [-0.07364, +0.03105] |
| D7 | 1383 | +0.04352 | [-0.006182, +0.09322] |
| D8 | 1384 | +0.1246 | [+0.07074, +0.1784] |
| D9 | 1383 | +0.1018 | [+0.04852, +0.1551] |
| D10 | 1384 | +0.05361 | [-0.01204, +0.1193] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows: fit (label end < 2016-01-01) and test (2016-01-04 ->) rows of the group. Every estimate refits logit P = logit(B0) + a + b S on its fit rows (registered fit: a +0.0349, b -0.0609) and scores Brier skill vs B0 on its test rows. Outcome = horizon log return in sigma60 units; y = outcome > 0. Plant: a drift in the side direction on all rows, sized by bisection so the skill rises by the planted amount. Per-year and per-half rows with no fit rows use the registered (a, b); the pack halves split on the median date of fit+test rows, so read the RESULTS halves instead.
