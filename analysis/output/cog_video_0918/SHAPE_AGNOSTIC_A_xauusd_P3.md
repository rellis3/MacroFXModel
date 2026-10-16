# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    195 | -0.0509 | -0.0294 |    0.0215 | -0.0145 |  0.0589 | 0.48407773439429136 |   0.4920 |   0.1160 |
| dir_8    | OOS     |    164 | -0.0489 | -0.0085 |    0.0404 | -0.0035 |  0.0825 | 0.49558499592374017 |   0.4919 |   0.0400 |
| dir_8    | VAL+OOS |    359 | -0.0500 | -0.0198 |    0.0301 |  0.0032 |  0.0589 | 0.4901704276875978  |   0.4912 |   0.0165 |
| dir_16   | VAL     |    195 | -0.0500 | -0.0136 |    0.0364 | -0.0102 |  0.0796 | 0.47460066713374843 |   0.4867 |   0.0595 |
| dir_16   | OOS     |    164 | -0.0296 | -0.1025 |   -0.0730 | -0.1273 | -0.0192 | 0.49233432640577623 |   0.4695 |   0.9940 |
| dir_16   | VAL+OOS |    359 | -0.0407 | -0.0542 |   -0.0135 | -0.0509 |  0.0222 | 0.4834325861744747  |   0.4786 |   0.7805 |
| dir_32   | VAL     |    195 | -0.0176 | -0.0014 |    0.0162 | -0.0387 |  0.0734 | 0.4717467366879673  |   0.4966 |   0.2905 |
| dir_32   | OOS     |    164 | -0.0532 | -0.0528 |    0.0003 | -0.0561 |  0.0574 | 0.4884048727590313  |   0.4759 |   0.4935 |
| dir_32   | VAL+OOS |    359 | -0.0339 | -0.0249 |    0.0089 | -0.0293 |  0.0488 | 0.4833533205901659  |   0.4861 |   0.3260 |
| vol_8    | VAL     |    195 |  0.1632 |  0.1650 |    0.0019 | -0.0046 |  0.0085 | (nan, nan)          |   0.7300 |   0.2900 |
| vol_8    | OOS     |    164 |  0.1449 |  0.1403 |   -0.0047 | -0.0110 |  0.0016 | (nan, nan)          |   0.7125 |   0.9265 |
| vol_8    | VAL+OOS |    359 |  0.1548 |  0.1537 |   -0.0011 | -0.0056 |  0.0036 | (nan, nan)          |   0.7511 |   0.6890 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0301 |       nan      |      nan      | net lower bound at 1.0 bp: -0.1102%     | False         |
| dir_16   | False                       | False             |             -0.0135 |         0.0020 |        0.0377 | net lower bound at 1.0 bp: -0.1214%     | False         |
| dir_32   | False                       |                   |              0.0089 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | False             |             -0.0011 |        -0.0014 |        0.0031 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |   -0.1025 |             -0.0683 |   -0.0342 |
| dir_16   | curvature            |   -0.1025 |             -0.0975 |   -0.0050 |
| dir_16   | position             |   -0.1025 |             -0.0960 |   -0.0065 |
| dir_16   | time-since high/low  |   -0.1025 |             -0.0700 |   -0.0325 |
| dir_16   | zig-zag / confluence |   -0.1025 |             -0.0719 |   -0.0306 |
| dir_16   | variability          |   -0.1025 |             -0.0924 |   -0.0101 |
| dir_16   | divergence           |   -0.1025 |             -0.0896 |   -0.0129 |
| vol_8    | momentum             |    0.1403 |              0.1396 |    0.0006 |
| vol_8    | curvature            |    0.1403 |              0.1390 |    0.0013 |
| vol_8    | position             |    0.1403 |              0.1395 |    0.0008 |
| vol_8    | time-since high/low  |    0.1403 |              0.1404 |   -0.0001 |
| vol_8    | zig-zag / confluence |    0.1403 |              0.1409 |   -0.0007 |
| vol_8    | variability          |    0.1403 |              0.1405 |   -0.0002 |
| vol_8    | divergence           |    0.1403 |              0.1391 |    0.0012 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 697 |      0.0158 |    0.5000 |    0.0108 |  -0.1164 |   0.1372 |
| dir_16   | M1 (with line)   | 697 |      0.0158 |    1.0000 |    0.0058 |  -0.1214 |   0.1322 |
| dir_16   | M1 (with line)   | 697 |      0.0158 |    2.0000 |   -0.0042 |  -0.1314 |   0.1222 |
| dir_16   | M0 (Nasdaq only) | 700 |     -0.0346 |    0.5000 |   -0.0396 |  -0.2302 |   0.1969 |
| dir_16   | M0 (Nasdaq only) | 700 |     -0.0346 |    1.0000 |   -0.0446 |  -0.2352 |   0.1919 |
| dir_16   | M0 (Nasdaq only) | 700 |     -0.0346 |    2.0000 |   -0.0546 |  -0.2452 |   0.1819 |
| dir_8    | M1 (with line)   | 713 |      0.0001 |    0.5000 |   -0.0049 |  -0.1052 |   0.1053 |
| dir_8    | M1 (with line)   | 713 |      0.0001 |    1.0000 |   -0.0099 |  -0.1102 |   0.1003 |
| dir_8    | M1 (with line)   | 713 |      0.0001 |    2.0000 |   -0.0199 |  -0.1202 |   0.0903 |
| dir_8    | M0 (Nasdaq only) | 712 |     -0.0345 |    0.5000 |   -0.0395 |  -0.1302 |   0.0641 |
| dir_8    | M0 (Nasdaq only) | 712 |     -0.0345 |    1.0000 |   -0.0445 |  -0.1352 |   0.0591 |
| dir_8    | M0 (Nasdaq only) | 712 |     -0.0345 |    2.0000 |   -0.0545 |  -0.1452 |   0.0491 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.