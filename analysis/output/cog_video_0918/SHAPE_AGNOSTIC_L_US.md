# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 60.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |    ci_lo |    ci_hi | AUC_M0              |   AUC_M1 |
|:---------|:--------|-------:|--------:|--------:|----------:|---------:|---------:|:--------------------|---------:|
| dir_8    | VAL     |    195 | -0.0187 | -0.0003 |    0.0184 |  -0.0197 |   0.0571 | 0.5001498311513142  |   0.4964 |
| dir_8    | OOS     |    195 | -0.0533 |  0.0121 |    0.0654 |   0.0271 |   0.1013 | 0.4751019846569853  |   0.4926 |
| dir_8    | VAL+OOS |    390 | -0.0360 |  0.0059 |    0.0419 |   0.0166 |   0.0681 | 0.48816115328450604 |   0.4951 |
| dir_16   | VAL     |    194 | -0.0244 |  0.0174 |    0.0419 |  -0.0022 |   0.0888 | 0.49789332118304286 |   0.4917 |
| dir_16   | OOS     |    194 | -0.0152 |  0.0643 |    0.0795 |   0.0361 |   0.1236 | 0.4827072586312984  |   0.5068 |
| dir_16   | VAL+OOS |    388 | -0.0198 |  0.0408 |    0.0607 |   0.0302 |   0.0935 | 0.4896058670558554  |   0.4989 |
| dir_32   | VAL     |    194 |  0.0845 |  0.0781 |  nan      | nan      | nan      | 0.5124967278887158  |   0.5166 |
| dir_32   | OOS     |    194 |  0.1106 |  0.1029 |   -0.0077 |  -0.0620 |   0.0437 | 0.5006355720928182  |   0.5118 |
| dir_32   | VAL+OOS |    388 |  0.0976 |  0.0905 |  nan      | nan      | nan      | 0.5065028580389823  |   0.5147 |
| vol_8    | VAL     |    195 |  0.2979 |  0.3011 |    0.0032 |  -0.0025 |   0.0094 | (nan, nan)          |   0.8880 |
| vol_8    | OOS     |    195 |  0.2267 |  0.2294 |    0.0027 |  -0.0024 |   0.0078 | (nan, nan)          |   0.8263 |
| vol_8    | VAL+OOS |    390 |  0.2623 |  0.2652 |    0.0029 |  -0.0010 |   0.0069 | (nan, nan)          |   0.8607 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0419 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0559%     | False         |
| dir_16   | False                       | True              |              0.0607 |         0.0335 |        0.0572 | net lower bound at 1.0 bp: -0.0322%     | False         |
| dir_32   | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | True              |              0.0029 |         0.0004 |        0.0020 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0643 |              0.0601 |    0.0042 |
| dir_16   | curvature            |    0.0643 |              0.0535 |    0.0108 |
| dir_16   | position             |    0.0643 |              0.0626 |    0.0017 |
| dir_16   | time-since high/low  |    0.0643 |              0.0324 |    0.0319 |
| dir_16   | zig-zag / confluence |    0.0643 |              0.0712 |   -0.0069 |
| dir_16   | variability          |    0.0643 |              0.0631 |    0.0011 |
| dir_16   | divergence           |    0.0643 |              0.0510 |    0.0133 |
| vol_8    | momentum             |    0.2294 |              0.2285 |    0.0009 |
| vol_8    | curvature            |    0.2294 |              0.2281 |    0.0013 |
| vol_8    | position             |    0.2294 |              0.2297 |   -0.0003 |
| vol_8    | time-since high/low  |    0.2294 |              0.2294 |    0.0001 |
| vol_8    | zig-zag / confluence |    0.2294 |              0.2288 |    0.0006 |
| vol_8    | variability          |    0.2294 |              0.2270 |    0.0024 |
| vol_8    | divergence           |    0.2294 |              0.2294 |   -0.0000 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 835 |      0.0591 |    0.5000 |    0.0541 |  -0.0272 |   0.1475 |
| dir_16   | M1 (with line)   | 835 |      0.0591 |    1.0000 |    0.0491 |  -0.0322 |   0.1425 |
| dir_16   | M1 (with line)   | 835 |      0.0591 |    2.0000 |    0.0391 |  -0.0422 |   0.1325 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    0.5000 |   -0.0533 |  -0.1227 |   0.0154 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    1.0000 |   -0.0583 |  -0.1277 |   0.0104 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    2.0000 |   -0.0683 |  -0.1377 |   0.0004 |
| dir_8    | M1 (with line)   | 853 |      0.0207 |    0.5000 |    0.0157 |  -0.0509 |   0.0885 |
| dir_8    | M1 (with line)   | 853 |      0.0207 |    1.0000 |    0.0107 |  -0.0559 |   0.0835 |
| dir_8    | M1 (with line)   | 853 |      0.0207 |    2.0000 |    0.0007 |  -0.0659 |   0.0735 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    0.5000 |    0.0113 |  -0.0415 |   0.0678 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    1.0000 |    0.0063 |  -0.0465 |   0.0628 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    2.0000 |   -0.0037 |  -0.0565 |   0.0528 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.