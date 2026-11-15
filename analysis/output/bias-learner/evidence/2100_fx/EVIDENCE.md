# Evidence pack: bias-learner:21:00|fx

Unit: Brier skill vs B0 (fraction). Useful bar: +0.001858. 20031 scored rows, 2236 independent clusters, 9 instruments, 2018-01-02 → 2026-08-20. Prereg verdict: **NULL**.

## Diagnosis: FLAT: the test could see a useful effect (planted control found), and the interval rules it out

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | True |
| pipeline finds planted bar | True |
| same sign both halves | False |
| share instruments same sign | 89% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.0004539 [-0.0002006, +0.001133]. Shuffled-signal 95% band [-0.0004953, +0.000297]; the real estimate sits at the 99th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.0009289) | 100% | +0.001383 |
| 1.0× bar (+0.001858) | 100% | +0.002312 |
| 2.0× bar (+0.003716) | 100% | +0.004169 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean +0.0004539). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 2222 | +0.0001689 | [-0.000989, +0.001279] |
| EURJPY | 2226 | -0.0004638 | [-0.001348, +0.0004452] |
| EURUSD | 2232 | +6.93e-05 | [-0.001505, +0.001089] |
| GBPJPY | 2234 | +0.001506 | [+0.0003146, +0.002603] |
| GBPUSD | 2230 | +0.0004397 | [-0.0004941, +0.001441] |
| NZDUSD | 2226 | +0.0005284 | [-0.0007117, +0.001728] |
| USDCAD | 2233 | +0.0004424 | [-0.0007133, +0.001478] |
| USDCHF | 2199 | +0.0005098 | [-0.000801, +0.002414] |
| USDJPY | 2229 | +0.0008842 | [-0.0003128, +0.00228] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 2322 | +0.0008733 | [-0.001627, +0.003353] |
| 2019 | 2273 | -0.0008743 | [-0.00308, +0.001778] |
| 2020 | 2331 | -0.0002948 | [-0.0007447, +0.0001354] |
| 2021 | 2319 | -0.0001125 | [-0.0004848, +0.0002034] |
| 2022 | 2307 | -0.0001229 | [-0.000531, +0.0002849] |
| 2023 | 2327 | +0.0003703 | [+4.584e-05, +0.0007183] |
| 2024 | 2340 | +0.0004158 | [-9.979e-05, +0.0009485] |
| 2025 | 2330 | -0.0005118 | [-0.002993, +0.002322] |
| 2026 | 1482 | +0.006558 | [+0.001773, +0.01059] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 10019 | -0.0001082 | [-0.0009219, +0.0006535] |
| H2 | 10012 | +0.001019 | [-0.0001093, +0.001996] |

Without the largest 1% of rows: +0.0006383.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 2004 | +0.0004973 | [-9.964e-05, +0.001094] |
| D2 | 2003 | -4.583e-05 | [-0.0002181, +0.0001265] |
| D3 | 2003 | -4.451e-05 | [-0.000112, +2.293e-05] |
| D4 | 2003 | +8.718e-06 | [-2.366e-05, +4.109e-05] |
| D5 | 2003 | -1.973e-06 | [-1.055e-05, +6.607e-06] |
| D6 | 2003 | -1.518e-05 | [-3.981e-05, +9.463e-06] |
| D7 | 2003 | +6.075e-05 | [+5.235e-06, +0.0001163] |
| D8 | 2003 | +4.025e-05 | [-6.551e-05, +0.000146] |
| D9 | 2003 | +0.0001491 | [-0.00012, +0.0004182] |
| D10 | 2003 | +0.0004849 | [-0.0002625, +0.001232] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

OOS predictions rebuilt with the runner's own functions (registered BSS_B0: 21:00|fx +0.045%, +1|fx +0.048%). The pack bootstraps dates iid (runner: 21-date moving blocks, SE floored by 200 block-shuffled-label refits), so the runner's CI is the binding one. Placebo = the model's lean (p - b0) shuffled across dates within instrument (no refit). Buckets: per-row Brier gain over B0 by decile of the lean. Halves at the median row date (runner: 2018-21 vs 2022-26).
