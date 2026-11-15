# Evidence pack: positioning-flow-inputs:vrp|idx|alone|+5

Unit: Brier skill vs B0 (fraction). Useful bar: +0.005775. 6655 scored rows, 2221 independent clusters, 3 instruments, 2018-01-02 → 2026-08-13. Prereg verdict: **NULL**.

## Diagnosis: WRONG SIGN: there is an effect, and it is the opposite of the claim

| Check | Result |
|---|---|
| ci excludes zero | True |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | True |
| same sign both halves | True |
| share instruments same sign | 67% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.002631 [-0.004078, -0.001314]. Shuffled-signal 95% band [-0.001532, +8.688e-05]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.002888) | 0% | +0.0002732 |
| 1.0× bar (+0.005775) | 100% | +0.003155 |
| 2.0× bar (+0.01155) | 100% | +0.008934 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +1 (clean -0.002631). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| NAS100 | 2221 | -0.005636 | [-0.007671, -0.003889] |
| SPX500 | 2213 | -0.002668 | [-0.004447, -0.00113] |
| US30 | 2221 | +0.0003709 | [-0.0007742, +0.001608] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2018 | 771 | -0.0001047 | [-0.0001812, -4.408e-05] |
| 2019 | 770 | -1.934e-05 | [-2.945e-05, -5.091e-06] |
| 2020 | 765 | +1.79e-05 | [-4.264e-05, +7.218e-05] |
| 2021 | 777 | +0.000782 | [+0.000154, +0.001316] |
| 2022 | 770 | -0.02368 | [-0.03059, -0.01523] |
| 2023 | 774 | +1.23e-05 | [-1.034e-05, +3.291e-05] |
| 2024 | 777 | -6.034e-06 | [-4.671e-05, +4.002e-05] |
| 2025 | 771 | +0.002384 | [-0.001363, +0.005848] |
| 2026 | 480 | +0.002185 | [-0.002115, +0.006371] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 3329 | -0.001631 | [-0.00295, -0.0002924] |
| H2 | 3326 | -0.003625 | [-0.005572, -0.001377] |

Without the largest 1% of rows: -0.0005201.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 666 | +0.0009719 | [+0.0002184, +0.001725] |
| D2 | 665 | +0.0001262 | [+4.236e-05, +0.0002101] |
| D3 | 666 | -5.294e-07 | [-6.432e-06, +5.374e-06] |
| D4 | 665 | -5.638e-07 | [-2.398e-06, +1.27e-06] |
| D5 | 666 | -4.742e-07 | [-1.131e-06, +1.822e-07] |
| D6 | 665 | -3.434e-06 | [-6.326e-06, -5.414e-07] |
| D7 | 665 | +4.962e-07 | [-7.13e-06, +8.122e-06] |
| D8 | 666 | -1.068e-05 | [-3.97e-05, +1.834e-05] |
| D9 | 665 | -0.0004296 | [-0.0008322, -2.698e-05] |
| D10 | 666 | -0.007037 | [-0.009017, -0.005057] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est -0.00263 [-0.00527, -0.00018] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00118. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
