# Evidence pack: positioning-flow-inputs:book|fx|incr|21:00

Unit: Brier skill gain over the bias-learner base, as a fraction of B0 error. Useful bar: +0.002449. 5916 scored rows, 1976 independent clusters, 3 instruments, 2019-01-02 → 2026-08-20. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.0005559 [-0.0001907, +0.001283]. Shuffled-signal 95% band [-0.0006313, +0.0005462]; the real estimate sits at the 98th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.001224) | 100% | +0.001788 |
| 1.0× bar (+0.002449) | 100% | +0.003015 |
| 2.0× bar (+0.004897) | 100% | +0.005458 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean +0.0005559). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| EURUSD | 1973 | +0.0001489 | [-0.0006, +0.000866] |
| GBPUSD | 1971 | +6.032e-05 | [-0.0008924, +0.0008784] |
| USDJPY | 1972 | +0.001468 | [+0.0001261, +0.002753] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2019 | 766 | +4.272e-06 | [-0.001595, +0.001568] |
| 2020 | 777 | -4.997e-05 | [-0.0005687, +0.0004628] |
| 2021 | 775 | -8.98e-05 | [-0.0008556, +0.0006743] |
| 2022 | 771 | +0.004453 | [-0.0005314, +0.009174] |
| 2023 | 776 | -0.0001498 | [-0.0003959, +6.028e-05] |
| 2024 | 780 | -6.194e-05 | [-0.000542, +0.0003758] |
| 2025 | 777 | +7.924e-05 | [-0.001014, +0.0009731] |
| 2026 | 494 | +0.0001306 | [-0.0003769, +0.0006241] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 2960 | +0.0006042 | [-0.000622, +0.001911] |
| H2 | 2956 | +0.0005073 | [-0.0002228, +0.001454] |

Without the largest 1% of rows: +2.941e-05.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 592 | +0.0005594 | [-0.0001927, +0.001311] |
| D2 | 592 | -4.469e-05 | [-0.0002806, +0.0001912] |
| D3 | 591 | -3.839e-05 | [-0.0001833, +0.0001065] |
| D4 | 592 | -8.619e-05 | [-0.0001741, +1.717e-06] |
| D5 | 591 | -2.026e-05 | [-6.756e-05, +2.704e-05] |
| D6 | 592 | -1.162e-05 | [-2.727e-05, +4.033e-06] |
| D7 | 591 | +3.874e-05 | [+3.307e-06, +7.418e-05] |
| D8 | 592 | -7.516e-05 | [-0.0001822, +3.184e-05] |
| D9 | 591 | +0.0001163 | [-0.000163, +0.0003956] |
| D10 | 592 | +0.0009468 | [-0.0003511, +0.002245] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est +0.00056 [-0.00015, +0.00134] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00071. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
