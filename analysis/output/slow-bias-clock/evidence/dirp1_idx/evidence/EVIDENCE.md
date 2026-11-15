# Evidence pack: slow-bias-clock:dirp1_idx

Unit: Brier skill vs B0 (test rows). Useful bar: +0.004. 13838 scored rows, 5794 independent clusters, 3 instruments, 2004-03-16 → 2026-08-20. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 33% |
| survives top1pct removed | False |
| survives costs | None |

**Headline:** -4.086e-05 [-0.002929, +0.0009897]. Shuffled-signal 95% band [-0.001224, +0.0002006]; the real estimate sits at the 58th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002) | 0% | +0.001962 |
| 1.0× bar (+0.004) | 0% | +0.003988 |
| 2.0× bar (+0.008) | 70% | +0.007963 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -4.086e-05). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| NAS100 | 5778 | +0.0001332 | [-0.003926, +0.001506] |
| SPX500 | 5775 | -0.0005048 | [-0.007221, +0.00172] |
| US30 | 2285 | +2.097e-05 | [-0.0001333, +0.000131] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2004 | 403 | — | [—, —] |
| 2005 | 515 | — | [—, —] |
| 2006 | 512 | — | [—, —] |
| 2007 | 518 | — | [—, —] |
| 2008 | 518 | — | [—, —] |
| 2009 | 513 | — | [—, —] |
| 2010 | 517 | — | [—, —] |
| 2011 | 514 | — | [—, —] |
| 2012 | 516 | — | [—, —] |
| 2013 | 515 | — | [—, —] |
| 2014 | 516 | — | [—, —] |
| 2015 | 516 | — | [—, —] |
| 2016 | 513 | -8.083e-05 | [-0.0003542, +0.0001688] |
| 2017 | 564 | -0.000384 | [-0.001023, +0.0001987] |
| 2018 | 774 | -8.188e-05 | [-0.0005408, +0.0003419] |
| 2019 | 772 | +3.935e-05 | [-0.0003069, +0.0003445] |
| 2020 | 776 | -6.423e-05 | [-0.0004459, +0.0003561] |
| 2021 | 776 | +0.0001294 | [-0.0001801, +0.0004412] |
| 2022 | 772 | -0.000498 | [-0.0008905, -2.28e-05] |
| 2023 | 774 | +6.897e-05 | [-0.0002282, +0.00036] |
| 2024 | 775 | +0.0001438 | [-0.0002488, +0.0004908] |
| 2025 | 774 | +0.0002004 | [-0.0001406, +0.0004765] |
| 2026 | 495 | +2.029e-06 | [-0.0003266, +0.0003097] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 6920 | -0.0001236 | [-0.00891, +0.00333] |
| H2 | 6918 | -3.074e-05 | [-0.0001753, +8.799e-05] |

Without the largest 1% of rows: +1.089e-05.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 1384 | +0.06438 | [-0.01358, +0.1423] |
| D2 | 1384 | +0.05785 | [-0.002393, +0.1181] |
| D3 | 1384 | +0.05394 | [-0.002217, +0.1101] |
| D4 | 1383 | +0.06247 | [+0.009583, +0.1154] |
| D5 | 1384 | +0.02638 | [-0.02407, +0.07683] |
| D6 | 1384 | +0.009929 | [-0.04013, +0.05999] |
| D7 | 1383 | +0.04533 | [-0.007404, +0.09807] |
| D8 | 1384 | +0.04745 | [-0.003015, +0.09792] |
| D9 | 1384 | +0.02215 | [-0.03624, +0.08053] |
| D10 | 1384 | +0.01589 | [-0.04216, +0.07395] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows: fit (label end < 2016-01-01) and test (2016-01-04 ->) rows of the group. Every estimate refits logit P = logit(B0) + a + b S on its fit rows (registered fit: a +0.0024, b -0.0046) and scores Brier skill vs B0 on its test rows. Outcome = horizon log return in sigma60 units; y = outcome > 0. Plant: a drift in the side direction on all rows, sized by bisection so the skill rises by the planted amount. Per-year and per-half rows with no fit rows use the registered (a, b); the pack halves split on the median date of fit+test rows, so read the RESULTS halves instead.
