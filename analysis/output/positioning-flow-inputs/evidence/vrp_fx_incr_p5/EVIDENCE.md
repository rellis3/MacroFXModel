# Evidence pack: positioning-flow-inputs:vrp|fx|incr|+5

Unit: Brier skill gain over the bias-learner base, as a fraction of B0 error. Useful bar: +0.004454. 7163 scored rows, 1195 independent clusters, 6 instruments, 2022-01-03 → 2026-08-13. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 67% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.001288 [-0.003581, +0.0009533]. Shuffled-signal 95% band [-0.002064, +0.0007622]; the real estimate sits at the 19th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002227) | 0% | +0.0009574 |
| 1.0× bar (+0.004454) | 100% | +0.003188 |
| 2.0× bar (+0.008909) | 100% | +0.007638 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.9993 (clean -0.001288). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1193 | -0.0016 | [-0.005873, +0.003459] |
| EURUSD | 1194 | -0.004052 | [-0.008132, -0.0006521] |
| GBPUSD | 1195 | +0.001587 | [-0.001388, +0.004408] |
| USDCAD | 1195 | +0.001074 | [-0.002041, +0.004277] |
| USDCHF | 1192 | -0.003942 | [-0.007384, -0.0006797] |
| USDJPY | 1194 | -0.0007961 | [-0.004825, +0.002677] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 1540 | -5.243e-05 | [-8.743e-05, -1.918e-05] |
| 2023 | 1552 | +4.238e-05 | [-0.0002805, +0.0003798] |
| 2024 | 1559 | -0.0006006 | [-0.00205, +0.000625] |
| 2025 | 1552 | -0.002621 | [-0.0117, +0.006628] |
| 2026 | 960 | -0.004402 | [-0.01166, +0.004515] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3584 | -0.0002583 | [-0.0006017, +0.0001544] |
| H2 | 3579 | -0.002319 | [-0.006471, +0.00225] |

Without the largest 1% of rows: -0.001139.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 717 | -0.00457 | [-0.007043, -0.002097] |
| D2 | 716 | -0.0001877 | [-0.000763, +0.0003876] |
| D3 | 716 | -0.0001088 | [-0.0002255, +7.981e-06] |
| D4 | 716 | -1.95e-05 | [-3.933e-05, +3.328e-07] |
| D5 | 717 | -9.232e-07 | [-4.195e-06, +2.349e-06] |
| D6 | 716 | -1.049e-05 | [-2.219e-05, +1.221e-06] |
| D7 | 716 | -1.008e-05 | [-7.778e-05, +5.762e-05] |
| D8 | 716 | +0.0003254 | [+0.0001446, +0.0005062] |
| D9 | 716 | -0.0001178 | [-0.0007123, +0.0004767] |
| D10 | 717 | +0.00149 | [-0.001051, +0.00403] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00129 [-0.00533, +0.00298] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00060. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
