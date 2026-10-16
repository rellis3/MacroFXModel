# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **statistical signal without economic significance: context only, no trade (dir_16)**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 60.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |    ci_lo |    ci_hi | AUC_M0              |   AUC_M1 |
|:---------|:--------|-------:|--------:|--------:|----------:|---------:|---------:|:--------------------|---------:|
| dir_8    | VAL     |    195 | -0.0187 | -0.0046 |    0.0141 |  -0.0193 |   0.0477 | 0.5001498311513142  |   0.4944 |
| dir_8    | OOS     |    195 | -0.0533 |  0.0315 |    0.0848 |   0.0398 |   0.1309 | 0.4751019846569853  |   0.4929 |
| dir_8    | VAL+OOS |    390 | -0.0360 |  0.0134 |    0.0495 |   0.0224 |   0.0781 | 0.48816115328450604 |   0.4949 |
| dir_16   | VAL     |    194 | -0.0244 |  0.0315 |    0.0559 |   0.0072 |   0.1030 | 0.49789332118304286 |   0.4913 |
| dir_16   | OOS     |    194 | -0.0152 |  0.0659 |    0.0811 |   0.0351 |   0.1265 | 0.4827072586312984  |   0.4940 |
| dir_16   | VAL+OOS |    388 | -0.0198 |  0.0487 |    0.0685 |   0.0358 |   0.1016 | 0.4896058670558554  |   0.4937 |
| dir_32   | VAL     |    194 |  0.0845 |  0.1139 |  nan      | nan      | nan      | 0.5124967278887158  |   0.5263 |
| dir_32   | OOS     |    194 |  0.1106 |  0.1410 |    0.0304 |  -0.0205 |   0.0802 | 0.5006355720928182  |   0.5087 |
| dir_32   | VAL+OOS |    388 |  0.0976 |  0.1274 |  nan      | nan      | nan      | 0.5065028580389823  |   0.5185 |
| vol_8    | VAL     |    195 |  0.2979 |  0.3053 |    0.0074 |   0.0030 |   0.0126 | (nan, nan)          |   0.8872 |
| vol_8    | OOS     |    195 |  0.2267 |  0.2320 |    0.0052 |  -0.0002 |   0.0102 | (nan, nan)          |   0.8347 |
| vol_8    | VAL+OOS |    390 |  0.2623 |  0.2686 |    0.0063 |   0.0027 |   0.0098 | (nan, nan)          |   0.8634 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0495 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0236%     | False         |
| dir_16   | True                        | True              |              0.0685 |         0.0363 |        0.0664 | net lower bound at 1.0 bp: -0.1561%     | False         |
| dir_32   | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | False             |              0.0063 |         0.0030 |        0.0072 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0659 |              0.0653 |    0.0006 |
| dir_16   | curvature            |    0.0659 |              0.0610 |    0.0049 |
| dir_16   | position             |    0.0659 |              0.0704 |   -0.0045 |
| dir_16   | time-since high/low  |    0.0659 |              0.0584 |    0.0075 |
| dir_16   | zig-zag / confluence |    0.0659 |              0.0632 |    0.0027 |
| dir_16   | variability          |    0.0659 |              0.0530 |    0.0129 |
| dir_16   | divergence           |    0.0659 |              0.0388 |    0.0271 |
| vol_8    | momentum             |    0.2320 |              0.2306 |    0.0014 |
| vol_8    | curvature            |    0.2320 |              0.2289 |    0.0030 |
| vol_8    | position             |    0.2320 |              0.2319 |    0.0001 |
| vol_8    | time-since high/low  |    0.2320 |              0.2325 |   -0.0006 |
| vol_8    | zig-zag / confluence |    0.2320 |              0.2313 |    0.0006 |
| vol_8    | variability          |    0.2320 |              0.2318 |    0.0001 |
| vol_8    | divergence           |    0.2320 |              0.2278 |    0.0041 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 836 |     -0.0272 |    0.5000 |   -0.0322 |  -0.1511 |   0.0943 |
| dir_16   | M1 (with line)   | 836 |     -0.0272 |    1.0000 |   -0.0372 |  -0.1561 |   0.0893 |
| dir_16   | M1 (with line)   | 836 |     -0.0272 |    2.0000 |   -0.0472 |  -0.1661 |   0.0793 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    0.5000 |   -0.0533 |  -0.1239 |   0.0129 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    1.0000 |   -0.0583 |  -0.1289 |   0.0079 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    2.0000 |   -0.0683 |  -0.1389 |  -0.0021 |
| dir_8    | M1 (with line)   | 852 |      0.0644 |    0.5000 |    0.0594 |  -0.0186 |   0.1425 |
| dir_8    | M1 (with line)   | 852 |      0.0644 |    1.0000 |    0.0544 |  -0.0236 |   0.1375 |
| dir_8    | M1 (with line)   | 852 |      0.0644 |    2.0000 |    0.0444 |  -0.0336 |   0.1275 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    0.5000 |    0.0113 |  -0.0430 |   0.0695 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    1.0000 |    0.0063 |  -0.0480 |   0.0645 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    2.0000 |   -0.0037 |  -0.0580 |   0.0545 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.