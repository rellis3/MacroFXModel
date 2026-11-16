# Evidence pack: positioning-flow-inputs:monthend|fx|alone|+5

Unit: Brier skill vs B0 (fraction). Useful bar: +0.005593. 2162 scored rows, 309 independent clusters, 7 instruments, 2018-01-29 → 2026-07-31. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | False |
| beats placebo 97 5 | True |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 71% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +0.01877 [-0.008282, +0.04877]. Shuffled-signal 95% band [-0.05304, -0.02061]; the real estimate sits at the 100th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002797) | 0% | +0.02182 |
| 1.0× bar (+0.005593) | 5% | +0.02459 |
| 2.0× bar (+0.01119) | 70% | +0.03014 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean +0.01877). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 309 | +0.02825 | [-0.007875, +0.07082] |
| EURUSD | 309 | +0.04188 | [+0.003645, +0.09113] |
| GBPUSD | 309 | +0.0395 | [-0.0005428, +0.07808] |
| NZDUSD | 309 | +0.01905 | [-0.02598, +0.05574] |
| USDCAD | 309 | +0.01265 | [-0.02721, +0.04773] |
| USDCHF | 309 | -0.0001894 | [-0.03916, +0.0376] |
| USDJPY | 308 | -0.009859 | [-0.0611, +0.02758] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 252 | +0.01179 | [+0.002063, +0.021] |
| 2019 | 252 | +0.03401 | [-0.001235, +0.07208] |
| 2020 | 252 | +0.09479 | [-0.03385, +0.2217] |
| 2021 | 252 | +0.05055 | [-0.01539, +0.1146] |
| 2022 | 252 | +0.01051 | [-0.1251, +0.1598] |
| 2023 | 252 | -0.02516 | [-0.09384, +0.06801] |
| 2024 | 251 | +0.002809 | [-0.02232, +0.03051] |
| 2025 | 252 | +0.02121 | [+0.001351, +0.04681] |
| 2026 | 147 | -0.06623 | [-0.2541, +0.109] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 1085 | +0.05267 | [+0.01222, +0.09479] |
| H2 | 1077 | -0.01529 | [-0.05219, +0.01907] |

Without the largest 1% of rows: +0.03257.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 217 | -0.002126 | [-0.02569, +0.02143] |
| D2 | 216 | +0.009794 | [-0.001982, +0.02157] |
| D3 | 216 | +0.009573 | [+0.003734, +0.01541] |
| D4 | 216 | +0.005511 | [+0.002631, +0.00839] |
| D5 | 216 | -9.293e-05 | [-0.001079, +0.0008934] |
| D6 | 216 | -0.0003409 | [-0.001214, +0.0005326] |
| D7 | 216 | +0.006252 | [+0.003365, +0.009138] |
| D8 | 216 | +0.005449 | [-0.0006946, +0.01159] |
| D9 | 216 | +0.01075 | [-0.001496, +0.023] |
| D10 | 217 | +0.002442 | [-0.02146, +0.02634] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est +0.01877 [-0.01315, +0.04837] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00240. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
