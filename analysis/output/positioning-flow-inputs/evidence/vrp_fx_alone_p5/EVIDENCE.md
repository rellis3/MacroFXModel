# Evidence pack: positioning-flow-inputs:vrp|fx|alone|+5

Unit: Brier skill vs B0 (fraction). Useful bar: +0.006135. 7172 scored rows, 1196 independent clusters, 6 instruments, 2022-01-03 → 2026-08-13. Prereg verdict: **NULL**.

## Diagnosis: WRONG SIGN: there is an effect, and it is the opposite of the claim

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.003139 [-0.005384, -0.0006366]. Shuffled-signal 95% band [-0.002497, +0.0007394]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.003068) | 0% | -4.937e-05 |
| 1.0× bar (+0.006135) | 100% | +0.00302 |
| 2.0× bar (+0.01227) | 100% | +0.009152 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.003139). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 1195 | -0.002212 | [-0.006751, +0.001644] |
| EURUSD | 1195 | -0.005448 | [-0.009761, -0.001697] |
| GBPUSD | 1196 | -0.002535 | [-0.005877, +0.0004215] |
| USDCAD | 1196 | -0.0009298 | [-0.003867, +0.002223] |
| USDCHF | 1195 | -0.004283 | [-0.007863, -0.001055] |
| USDJPY | 1195 | -0.003441 | [-0.008036, +0.0008117] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2022 | 1548 | -0.003805 | [-0.006279, -0.001633] |
| 2023 | 1553 | +1.614e-05 | [+4.335e-08, +2.965e-05] |
| 2024 | 1559 | +0.0001584 | [+8.965e-05, +0.0002387] |
| 2025 | 1552 | -0.007235 | [-0.01599, +0.002329] |
| 2026 | 960 | -0.00589 | [-0.01426, +0.00263] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3587 | -0.001609 | [-0.002507, -0.0007083] |
| H2 | 3585 | -0.004669 | [-0.008732, +0.0001065] |

Without the largest 1% of rows: -0.002914.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 718 | -0.006279 | [-0.008981, -0.003578] |
| D2 | 717 | -0.001367 | [-0.002229, -0.0005061] |
| D3 | 717 | -0.0002062 | [-0.0004381, +2.567e-05] |
| D4 | 717 | +4.663e-05 | [+3.103e-05, +6.223e-05] |
| D5 | 717 | -1.148e-06 | [-4.231e-06, +1.936e-06] |
| D6 | 717 | +7.54e-07 | [-6.177e-07, +2.126e-06] |
| D7 | 717 | +1.393e-05 | [+6.905e-06, +2.096e-05] |
| D8 | 717 | +6.778e-07 | [-0.000192, +0.0001934] |
| D9 | 717 | -0.0006658 | [-0.001424, +9.263e-05] |
| D10 | 718 | +0.0006362 | [-0.002049, +0.003322] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00314 [-0.00687, +0.00046] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00105. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
