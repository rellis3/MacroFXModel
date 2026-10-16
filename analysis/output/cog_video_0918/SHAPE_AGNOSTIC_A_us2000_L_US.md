# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    195 |  0.0212 |  0.0138 |   -0.0073 | -0.0462 |  0.0309 | 0.4922031794108627  |   0.4949 |   0.6550 |
| dir_8    | OOS     |    165 |  0.0159 |  0.0584 |    0.0425 |  0.0086 |  0.0773 | 0.49315435183259243 |   0.5189 |   0.0075 |
| dir_8    | VAL+OOS |    360 |  0.0187 |  0.0343 |    0.0155 | -0.0103 |  0.0414 | 0.49249905007026074 |   0.5058 |   0.1325 |
| dir_16   | VAL     |    194 |  0.0117 |  0.0793 |    0.0676 |  0.0193 |  0.1129 | 0.4885993775116426  |   0.5271 |   0.0020 |
| dir_16   | OOS     |    165 |  0.0883 |  0.0986 |    0.0103 | -0.0418 |  0.0637 | 0.5023239576768215  |   0.5339 |   0.3510 |
| dir_16   | VAL+OOS |    359 |  0.0469 |  0.0882 |    0.0413 |  0.0046 |  0.0783 | 0.4951362182336675  |   0.5301 |   0.0155 |
| dir_32   | VAL     |    194 |  0.0397 |  0.0553 |    0.0156 | -0.0400 |  0.0748 | 0.5057200873603298  |   0.5196 |   0.2985 |
| dir_32   | OOS     |    165 |  0.1335 |  0.0903 |   -0.0431 | -0.1074 |  0.0238 | 0.52886237153209    |   0.5272 |   0.9020 |
| dir_32   | VAL+OOS |    359 |  0.0828 |  0.0714 |   -0.0114 | -0.0531 |  0.0300 | 0.5181213300816677  |   0.5236 |   0.7050 |
| vol_8    | VAL     |    195 |  0.3782 |  0.3814 |    0.0032 | -0.0021 |  0.0081 | (nan, nan)          |   0.8448 |   0.1145 |
| vol_8    | OOS     |    165 |  0.3556 |  0.3574 |    0.0018 | -0.0020 |  0.0057 | (nan, nan)          |   0.8359 |   0.1935 |
| vol_8    | VAL+OOS |    360 |  0.3678 |  0.3704 |    0.0026 | -0.0009 |  0.0059 | (nan, nan)          |   0.8407 |   0.0705 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0155 |       nan      |      nan      | net lower bound at 1.0 bp: -0.1106%     | False         |
| dir_16   | False                       | True              |              0.0413 |        -0.0014 |        0.0320 | net lower bound at 1.0 bp: -0.1087%     | False         |
| dir_32   | False                       |                   |             -0.0114 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | True              |              0.0026 |        -0.0006 |        0.0003 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0986 |              0.0996 |   -0.0010 |
| dir_16   | curvature            |    0.0986 |              0.0838 |    0.0148 |
| dir_16   | position             |    0.0986 |              0.0926 |    0.0059 |
| dir_16   | time-since high/low  |    0.0986 |              0.0723 |    0.0263 |
| dir_16   | zig-zag / confluence |    0.0986 |              0.1041 |   -0.0055 |
| dir_16   | variability          |    0.0986 |              0.1002 |   -0.0016 |
| dir_16   | divergence           |    0.0986 |              0.0545 |    0.0441 |
| vol_8    | momentum             |    0.3574 |              0.3577 |   -0.0004 |
| vol_8    | curvature            |    0.3574 |              0.3559 |    0.0015 |
| vol_8    | position             |    0.3574 |              0.3571 |    0.0002 |
| vol_8    | time-since high/low  |    0.3574 |              0.3570 |    0.0003 |
| vol_8    | zig-zag / confluence |    0.3574 |              0.3579 |   -0.0005 |
| vol_8    | variability          |    0.3574 |              0.3542 |    0.0031 |
| vol_8    | divergence           |    0.3574 |              0.3568 |    0.0006 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 708 |      0.0310 |    0.5000 |    0.0260 |  -0.1037 |   0.1440 |
| dir_16   | M1 (with line)   | 708 |      0.0310 |    1.0000 |    0.0210 |  -0.1087 |   0.1390 |
| dir_16   | M1 (with line)   | 708 |      0.0310 |    2.0000 |    0.0110 |  -0.1187 |   0.1290 |
| dir_16   | M0 (Nasdaq only) | 712 |     -0.0829 |    0.5000 |   -0.0879 |  -0.2010 |   0.0256 |
| dir_16   | M0 (Nasdaq only) | 712 |     -0.0829 |    1.0000 |   -0.0929 |  -0.2060 |   0.0206 |
| dir_16   | M0 (Nasdaq only) | 712 |     -0.0829 |    2.0000 |   -0.1029 |  -0.2160 |   0.0106 |
| dir_8    | M1 (with line)   | 723 |     -0.0242 |    0.5000 |   -0.0292 |  -0.1056 |   0.0488 |
| dir_8    | M1 (with line)   | 723 |     -0.0242 |    1.0000 |   -0.0342 |  -0.1106 |   0.0438 |
| dir_8    | M1 (with line)   | 723 |     -0.0242 |    2.0000 |   -0.0442 |  -0.1206 |   0.0338 |
| dir_8    | M0 (Nasdaq only) | 724 |     -0.0262 |    0.5000 |   -0.0312 |  -0.0983 |   0.0440 |
| dir_8    | M0 (Nasdaq only) | 724 |     -0.0262 |    1.0000 |   -0.0362 |  -0.1033 |   0.0390 |
| dir_8    | M0 (Nasdaq only) | 724 |     -0.0262 |    2.0000 |   -0.0462 |  -0.1133 |   0.0290 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.