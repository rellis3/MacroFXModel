# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 60.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |    ci_lo |    ci_hi | AUC_M0              |   AUC_M1 |
|:---------|:--------|-------:|--------:|--------:|----------:|---------:|---------:|:--------------------|---------:|
| dir_8    | VAL     |    195 | -0.0187 |  0.0047 |    0.0234 |  -0.0115 |   0.0571 | 0.5001498311513142  |   0.4985 |
| dir_8    | OOS     |    195 | -0.0533 | -0.0031 |    0.0502 |   0.0144 |   0.0873 | 0.4751019846569853  |   0.4848 |
| dir_8    | VAL+OOS |    390 | -0.0360 |  0.0008 |    0.0368 |   0.0126 |   0.0618 | 0.48816115328450604 |   0.4923 |
| dir_16   | VAL     |    194 | -0.0244 |  0.0124 |    0.0368 |  -0.0135 |   0.0860 | 0.49789332118304286 |   0.4983 |
| dir_16   | OOS     |    194 | -0.0152 |  0.0271 |    0.0423 |  -0.0059 |   0.0909 | 0.4827072586312984  |   0.4933 |
| dir_16   | VAL+OOS |    388 | -0.0198 |  0.0197 |    0.0395 |   0.0043 |   0.0739 | 0.4896058670558554  |   0.4961 |
| dir_32   | VAL     |    194 |  0.0845 |  0.0247 |  nan      | nan      | nan      | 0.5124967278887158  |   0.5093 |
| dir_32   | OOS     |    194 |  0.1106 |  0.0625 |   -0.0481 |  -0.0972 |   0.0005 | 0.5006355720928182  |   0.5126 |
| dir_32   | VAL+OOS |    388 |  0.0976 |  0.0436 |  nan      | nan      | nan      | 0.5065028580389823  |   0.5110 |
| vol_8    | VAL     |    195 |  0.2979 |  0.3075 |    0.0096 |   0.0010 |   0.0187 | (nan, nan)          |   0.8869 |
| vol_8    | OOS     |    195 |  0.2267 |  0.2357 |    0.0090 |   0.0005 |   0.0168 | (nan, nan)          |   0.8257 |
| vol_8    | VAL+OOS |    390 |  0.2623 |  0.2716 |    0.0093 |   0.0035 |   0.0150 | (nan, nan)          |   0.8587 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0368 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0847%     | False         |
| dir_16   | False                       | False             |              0.0395 |         0.0288 |        0.0552 | net lower bound at 1.0 bp: -0.0818%     | False         |
| dir_32   | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | True                        | False             |              0.0093 |         0.0047 |        0.0119 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0271 |              0.0307 |   -0.0037 |
| dir_16   | curvature            |    0.0271 |              0.0260 |    0.0011 |
| dir_16   | position             |    0.0271 |              0.0341 |   -0.0070 |
| dir_16   | time-since high/low  |    0.0271 |              0.0230 |    0.0040 |
| dir_16   | zig-zag / confluence |    0.0271 |              0.0276 |   -0.0005 |
| dir_16   | variability          |    0.0271 |              0.0222 |    0.0049 |
| dir_16   | divergence           |    0.0271 |              0.0161 |    0.0109 |
| vol_8    | momentum             |    0.2357 |              0.2342 |    0.0016 |
| vol_8    | curvature            |    0.2357 |              0.2217 |    0.0141 |
| vol_8    | position             |    0.2357 |              0.2349 |    0.0008 |
| vol_8    | time-since high/low  |    0.2357 |              0.2344 |    0.0013 |
| vol_8    | zig-zag / confluence |    0.2357 |              0.2346 |    0.0011 |
| vol_8    | variability          |    0.2357 |              0.2355 |    0.0002 |
| vol_8    | divergence           |    0.2357 |              0.2310 |    0.0047 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 835 |      0.0009 |    0.5000 |   -0.0041 |  -0.0768 |   0.0677 |
| dir_16   | M1 (with line)   | 835 |      0.0009 |    1.0000 |   -0.0091 |  -0.0818 |   0.0627 |
| dir_16   | M1 (with line)   | 835 |      0.0009 |    2.0000 |   -0.0191 |  -0.0918 |   0.0527 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    0.5000 |   -0.0533 |  -0.1227 |   0.0156 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    1.0000 |   -0.0583 |  -0.1277 |   0.0106 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    2.0000 |   -0.0683 |  -0.1377 |   0.0006 |
| dir_8    | M1 (with line)   | 852 |     -0.0024 |    0.5000 |   -0.0074 |  -0.0797 |   0.0601 |
| dir_8    | M1 (with line)   | 852 |     -0.0024 |    1.0000 |   -0.0124 |  -0.0847 |   0.0551 |
| dir_8    | M1 (with line)   | 852 |     -0.0024 |    2.0000 |   -0.0224 |  -0.0947 |   0.0451 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    0.5000 |    0.0113 |  -0.0454 |   0.0684 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    1.0000 |    0.0063 |  -0.0504 |   0.0634 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    2.0000 |   -0.0037 |  -0.0604 |   0.0534 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.