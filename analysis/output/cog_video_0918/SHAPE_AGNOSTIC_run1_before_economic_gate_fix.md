# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **a repeatable shape exists (see importance table for which)**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 60.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |    ci_lo |    ci_hi | AUC_M0              |   AUC_M1 |
|:---------|:--------|-------:|--------:|--------:|----------:|---------:|---------:|:--------------------|---------:|
| dir_8    | VAL     |    195 | -0.0187 |  0.0105 |  nan      | nan      | nan      | 0.5001498311513142  |   0.4998 |
| dir_8    | OOS     |    195 | -0.0533 |  0.0235 |    0.0768 |   0.0375 |   0.1127 | 0.4751019846569853  |   0.4958 |
| dir_8    | VAL+OOS |    390 | -0.0360 |  0.0170 |  nan      | nan      | nan      | 0.48816115328450604 |   0.4985 |
| dir_16   | VAL     |    194 | -0.0244 |  0.0244 |    0.0488 |   0.0002 |   0.0961 | 0.49789332118304286 |   0.4980 |
| dir_16   | OOS     |    194 | -0.0152 |  0.0565 |    0.0717 |   0.0256 |   0.1200 | 0.4827072586312984  |   0.4949 |
| dir_16   | VAL+OOS |    388 | -0.0198 |  0.0404 |    0.0602 |   0.0263 |   0.0940 | 0.4896058670558554  |   0.4963 |
| dir_32   | VAL     |    194 |  0.0845 |  0.0527 |  nan      | nan      | nan      | 0.5124967278887158  |   0.5272 |
| dir_32   | OOS     |    194 |  0.1106 |  0.1148 |    0.0042 |  -0.0476 |   0.0604 | 0.5006355720928182  |   0.5204 |
| dir_32   | VAL+OOS |    388 |  0.0976 |  0.0838 |  nan      | nan      | nan      | 0.5065028580389823  |   0.5240 |
| vol_8    | VAL     |    195 |  0.2979 |  0.3095 |    0.0116 |   0.0038 |   0.0198 | (nan, nan)          |   0.8903 |
| vol_8    | OOS     |    195 |  0.2267 |  0.2349 |    0.0082 |  -0.0008 |   0.0168 | (nan, nan)          |   0.8307 |
| vol_8    | VAL+OOS |    390 |  0.2623 |  0.2722 |    0.0099 |   0.0041 |   0.0156 | (nan, nan)          |   0.8628 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|
| dir_8    | False                       |                   |            nan      |       nan      |      nan      |
| dir_16   | True                        | True              |              0.0602 |         0.0302 |        0.0457 |
| dir_32   | False                       |                   |            nan      |       nan      |      nan      |
| vol_8    | False                       | False             |              0.0099 |         0.0049 |        0.0110 |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0565 |              0.0439 |    0.0125 |
| dir_16   | curvature            |    0.0565 |              0.0594 |   -0.0029 |
| dir_16   | position             |    0.0565 |              0.0551 |    0.0013 |
| dir_16   | time-since high/low  |    0.0565 |              0.0635 |   -0.0070 |
| dir_16   | zig-zag / confluence |    0.0565 |              0.0546 |    0.0018 |
| dir_16   | variability          |    0.0565 |              0.0539 |    0.0025 |
| dir_16   | divergence           |    0.0565 |              0.0657 |   -0.0093 |
| vol_8    | momentum             |    0.2349 |              0.2327 |    0.0022 |
| vol_8    | curvature            |    0.2349 |              0.2245 |    0.0104 |
| vol_8    | position             |    0.2349 |              0.2349 |    0.0000 |
| vol_8    | time-since high/low  |    0.2349 |              0.2346 |    0.0004 |
| vol_8    | zig-zag / confluence |    0.2349 |              0.2351 |   -0.0002 |
| vol_8    | variability          |    0.2349 |              0.2358 |   -0.0009 |
| vol_8    | divergence           |    0.2349 |              0.2246 |    0.0104 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 836 |      0.0001 |    0.5000 |   -0.0049 |  -0.1014 |   0.1035 |
| dir_16   | M1 (with line)   | 836 |      0.0001 |    1.0000 |   -0.0099 |  -0.1064 |   0.0985 |
| dir_16   | M1 (with line)   | 836 |      0.0001 |    2.0000 |   -0.0199 |  -0.1164 |   0.0885 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    0.5000 |   -0.0533 |  -0.1233 |   0.0133 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    1.0000 |   -0.0583 |  -0.1283 |   0.0083 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    2.0000 |   -0.0683 |  -0.1383 |  -0.0017 |
| dir_8    | M1 (with line)   | 852 |      0.0084 |    0.5000 |    0.0034 |  -0.0568 |   0.0713 |
| dir_8    | M1 (with line)   | 852 |      0.0084 |    1.0000 |   -0.0016 |  -0.0618 |   0.0663 |
| dir_8    | M1 (with line)   | 852 |      0.0084 |    2.0000 |   -0.0116 |  -0.0718 |   0.0563 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    0.5000 |    0.0113 |  -0.0402 |   0.0677 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    1.0000 |    0.0063 |  -0.0452 |   0.0627 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    2.0000 |   -0.0037 |  -0.0552 |   0.0527 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.