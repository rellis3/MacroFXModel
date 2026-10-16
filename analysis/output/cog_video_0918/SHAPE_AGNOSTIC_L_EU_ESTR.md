# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 60.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |    ci_lo |    ci_hi | AUC_M0              |   AUC_M1 |
|:---------|:--------|-------:|--------:|--------:|----------:|---------:|---------:|:--------------------|---------:|
| dir_8    | VAL     |    195 | -0.0187 |  0.0017 |    0.0204 |  -0.0156 |   0.0594 | 0.5001498311513142  |   0.5027 |
| dir_8    | OOS     |    195 | -0.0533 |  0.0097 |    0.0631 |   0.0237 |   0.1028 | 0.4751019846569853  |   0.4986 |
| dir_8    | VAL+OOS |    390 | -0.0360 |  0.0057 |    0.0417 |   0.0134 |   0.0691 | 0.48816115328450604 |   0.5012 |
| dir_16   | VAL     |    194 | -0.0244 | -0.0116 |    0.0128 |  -0.0344 |   0.0618 | 0.49789332118304286 |   0.4840 |
| dir_16   | OOS     |    194 | -0.0152 |  0.0387 |    0.0539 |   0.0092 |   0.0972 | 0.4827072586312984  |   0.4941 |
| dir_16   | VAL+OOS |    388 | -0.0198 |  0.0135 |    0.0334 |   0.0012 |   0.0672 | 0.4896058670558554  |   0.4891 |
| dir_32   | VAL     |    194 |  0.0845 |  0.0651 |  nan      | nan      | nan      | 0.5124967278887158  |   0.5119 |
| dir_32   | OOS     |    194 |  0.1106 |  0.0848 |   -0.0258 |  -0.0748 |   0.0229 | 0.5006355720928182  |   0.5049 |
| dir_32   | VAL+OOS |    388 |  0.0976 |  0.0750 |  nan      | nan      | nan      | 0.5065028580389823  |   0.5088 |
| vol_8    | VAL     |    195 |  0.2979 |  0.3022 |    0.0043 |  -0.0007 |   0.0096 | (nan, nan)          |   0.8865 |
| vol_8    | OOS     |    195 |  0.2267 |  0.2333 |    0.0065 |   0.0013 |   0.0116 | (nan, nan)          |   0.8320 |
| vol_8    | VAL+OOS |    390 |  0.2623 |  0.2677 |    0.0054 |   0.0017 |   0.0091 | (nan, nan)          |   0.8624 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0417 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0490%     | False         |
| dir_16   | False                       | False             |              0.0334 |         0.0362 |        0.0530 | net lower bound at 1.0 bp: -0.0726%     | False         |
| dir_32   | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | False             |              0.0054 |         0.0032 |        0.0085 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0387 |              0.0358 |    0.0029 |
| dir_16   | curvature            |    0.0387 |              0.0323 |    0.0064 |
| dir_16   | position             |    0.0387 |              0.0342 |    0.0045 |
| dir_16   | time-since high/low  |    0.0387 |              0.0315 |    0.0072 |
| dir_16   | zig-zag / confluence |    0.0387 |              0.0394 |   -0.0007 |
| dir_16   | variability          |    0.0387 |              0.0395 |   -0.0008 |
| dir_16   | divergence           |    0.0387 |              0.0259 |    0.0127 |
| vol_8    | momentum             |    0.2333 |              0.2328 |    0.0005 |
| vol_8    | curvature            |    0.2333 |              0.2320 |    0.0013 |
| vol_8    | position             |    0.2333 |              0.2335 |   -0.0003 |
| vol_8    | time-since high/low  |    0.2333 |              0.2326 |    0.0007 |
| vol_8    | zig-zag / confluence |    0.2333 |              0.2314 |    0.0019 |
| vol_8    | variability          |    0.2333 |              0.2334 |   -0.0001 |
| vol_8    | divergence           |    0.2333 |              0.2302 |    0.0030 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 835 |      0.0193 |    0.5000 |    0.0143 |  -0.0676 |   0.1110 |
| dir_16   | M1 (with line)   | 835 |      0.0193 |    1.0000 |    0.0093 |  -0.0726 |   0.1060 |
| dir_16   | M1 (with line)   | 835 |      0.0193 |    2.0000 |   -0.0007 |  -0.0826 |   0.0960 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    0.5000 |   -0.0533 |  -0.1233 |   0.0147 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    1.0000 |   -0.0583 |  -0.1283 |   0.0097 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    2.0000 |   -0.0683 |  -0.1383 |  -0.0003 |
| dir_8    | M1 (with line)   | 852 |      0.0149 |    0.5000 |    0.0099 |  -0.0440 |   0.0705 |
| dir_8    | M1 (with line)   | 852 |      0.0149 |    1.0000 |    0.0049 |  -0.0490 |   0.0655 |
| dir_8    | M1 (with line)   | 852 |      0.0149 |    2.0000 |   -0.0051 |  -0.0590 |   0.0555 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    0.5000 |    0.0113 |  -0.0445 |   0.0714 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    1.0000 |    0.0063 |  -0.0495 |   0.0664 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    2.0000 |   -0.0037 |  -0.0595 |   0.0564 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.