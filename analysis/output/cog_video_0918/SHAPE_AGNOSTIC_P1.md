# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **statistical signal without economic significance: context only, no trade (dir_16)**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 60.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |    ci_lo |    ci_hi | AUC_M0              |   AUC_M1 |
|:---------|:--------|-------:|--------:|--------:|----------:|---------:|---------:|:--------------------|---------:|
| dir_8    | VAL     |    195 | -0.0187 | -0.0104 |    0.0083 |  -0.0317 |   0.0495 | 0.5001498311513142  |   0.5016 |
| dir_8    | OOS     |    195 | -0.0533 |  0.0197 |    0.0730 |   0.0332 |   0.1146 | 0.4751019846569853  |   0.4941 |
| dir_8    | VAL+OOS |    390 | -0.0360 |  0.0046 |    0.0406 |   0.0133 |   0.0707 | 0.48816115328450604 |   0.4984 |
| dir_16   | VAL     |    194 | -0.0244 |  0.0354 |    0.0599 |   0.0085 |   0.1096 | 0.49789332118304286 |   0.5050 |
| dir_16   | OOS     |    194 | -0.0152 |  0.0326 |    0.0478 |   0.0043 |   0.0937 | 0.4827072586312984  |   0.4913 |
| dir_16   | VAL+OOS |    388 | -0.0198 |  0.0340 |    0.0538 |   0.0201 |   0.0886 | 0.4896058670558554  |   0.4987 |
| dir_32   | VAL     |    194 |  0.0845 |  0.0510 |  nan      | nan      | nan      | 0.5124967278887158  |   0.5214 |
| dir_32   | OOS     |    194 |  0.1106 |  0.1222 |    0.0116 |  -0.0428 |   0.0664 | 0.5006355720928182  |   0.5053 |
| dir_32   | VAL+OOS |    388 |  0.0976 |  0.0866 |  nan      | nan      | nan      | 0.5065028580389823  |   0.5146 |
| vol_8    | VAL     |    195 |  0.2979 |  0.3091 |    0.0112 |   0.0028 |   0.0196 | (nan, nan)          |   0.8916 |
| vol_8    | OOS     |    195 |  0.2267 |  0.2358 |    0.0090 |   0.0006 |   0.0170 | (nan, nan)          |   0.8309 |
| vol_8    | VAL+OOS |    390 |  0.2623 |  0.2725 |    0.0101 |   0.0043 |   0.0160 | (nan, nan)          |   0.8641 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0406 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0581%     | False         |
| dir_16   | True                        | True              |              0.0538 |         0.0310 |        0.0505 | net lower bound at 1.0 bp: -0.1552%     | False         |
| dir_32   | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | True                        | False             |              0.0101 |         0.0045 |        0.0103 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0326 |              0.0240 |    0.0086 |
| dir_16   | curvature            |    0.0326 |              0.0313 |    0.0013 |
| dir_16   | position             |    0.0326 |              0.0298 |    0.0028 |
| dir_16   | time-since high/low  |    0.0326 |              0.0453 |   -0.0127 |
| dir_16   | zig-zag / confluence |    0.0326 |              0.0308 |    0.0017 |
| dir_16   | variability          |    0.0326 |              0.0296 |    0.0030 |
| dir_16   | divergence           |    0.0326 |              0.0262 |    0.0064 |
| vol_8    | momentum             |    0.2358 |              0.2316 |    0.0042 |
| vol_8    | curvature            |    0.2358 |              0.2269 |    0.0089 |
| vol_8    | position             |    0.2358 |              0.2358 |    0.0000 |
| vol_8    | time-since high/low  |    0.2358 |              0.2333 |    0.0025 |
| vol_8    | zig-zag / confluence |    0.2358 |              0.2361 |   -0.0003 |
| vol_8    | variability          |    0.2358 |              0.2348 |    0.0010 |
| vol_8    | divergence           |    0.2358 |              0.2251 |    0.0107 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 835 |     -0.0226 |    0.5000 |   -0.0276 |  -0.1502 |   0.0790 |
| dir_16   | M1 (with line)   | 835 |     -0.0226 |    1.0000 |   -0.0326 |  -0.1552 |   0.0740 |
| dir_16   | M1 (with line)   | 835 |     -0.0226 |    2.0000 |   -0.0426 |  -0.1652 |   0.0640 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    0.5000 |   -0.0533 |  -0.1240 |   0.0145 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    1.0000 |   -0.0583 |  -0.1290 |   0.0095 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    2.0000 |   -0.0683 |  -0.1390 |  -0.0005 |
| dir_8    | M1 (with line)   | 852 |      0.0290 |    0.5000 |    0.0240 |  -0.0531 |   0.1002 |
| dir_8    | M1 (with line)   | 852 |      0.0290 |    1.0000 |    0.0190 |  -0.0581 |   0.0952 |
| dir_8    | M1 (with line)   | 852 |      0.0290 |    2.0000 |    0.0090 |  -0.0681 |   0.0852 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    0.5000 |    0.0113 |  -0.0401 |   0.0715 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    1.0000 |    0.0063 |  -0.0451 |   0.0665 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    2.0000 |   -0.0037 |  -0.0551 |   0.0565 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.