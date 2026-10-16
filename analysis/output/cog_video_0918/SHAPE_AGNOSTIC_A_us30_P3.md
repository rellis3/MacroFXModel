# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |    ci_lo |    ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|---------:|---------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    195 |  0.0115 |  0.0037 |   -0.0078 |  -0.0461 |   0.0274 | 0.49972221585528875 |   0.4969 |   0.6855 |
| dir_8    | OOS     |    165 | -0.0113 |  0.0217 |  nan      | nan      | nan      | 0.48339384979764033 |   0.5070 |   0.0270 |
| dir_8    | VAL+OOS |    360 |  0.0011 |  0.0119 |  nan      | nan      | nan      | 0.4939955733841583  |   0.5003 |   0.0930 |
| dir_16   | VAL     |    194 |  0.0353 |  0.0251 |  nan      | nan      | nan      | 0.5045027142822011  |   0.4962 |   0.2450 |
| dir_16   | OOS     |    165 |  0.0688 | -0.0024 |   -0.0711 |  -0.1233 |  -0.0236 | 0.49224280782162555 |   0.4965 |   0.9960 |
| dir_16   | VAL+OOS |    359 |  0.0507 |  0.0124 |  nan      | nan      | nan      | 0.4983879876969521  |   0.4952 |   0.3545 |
| dir_32   | VAL     |    194 |  0.1303 |  0.0844 |   -0.0459 |  -0.1101 |   0.0188 | 0.5099591646852384  |   0.5117 |   0.9195 |
| dir_32   | OOS     |    165 |  0.1633 |  0.0660 |  nan      | nan      | nan      | 0.4982606372420747  |   0.5091 |   0.3565 |
| dir_32   | VAL+OOS |    359 |  0.1455 |  0.0760 |  nan      | nan      | nan      | 0.5037315056258407  |   0.5100 |   0.3815 |
| vol_8    | VAL     |    195 |  0.3473 |  0.3588 |    0.0115 |   0.0055 |   0.0181 | (nan, nan)          |   0.8386 |   0.0000 |
| vol_8    | OOS     |    165 |  0.3424 |  0.3611 |    0.0186 |   0.0131 |   0.0243 | (nan, nan)          |   0.8466 |   0.0000 |
| vol_8    | VAL+OOS |    360 |  0.3451 |  0.3598 |    0.0148 |   0.0104 |   0.0191 | (nan, nan)          |   0.8360 |   0.0000 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: -0.0586%     | False         |
| dir_16   | False                       | False             |            nan      |        -0.0261 |       -0.0119 | net lower bound at 1.0 bp: -0.0855%     | False         |
| dir_32   | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | True                        | False             |              0.0148 |         0.0098 |        0.0170 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |   -0.0024 |             -0.0006 |   -0.0017 |
| dir_16   | curvature            |   -0.0024 |             -0.0033 |    0.0009 |
| dir_16   | position             |   -0.0024 |              0.0144 |   -0.0168 |
| dir_16   | time-since high/low  |   -0.0024 |             -0.0130 |    0.0106 |
| dir_16   | zig-zag / confluence |   -0.0024 |             -0.0167 |    0.0144 |
| dir_16   | variability          |   -0.0024 |             -0.0077 |    0.0053 |
| dir_16   | divergence           |   -0.0024 |              0.0062 |   -0.0086 |
| vol_8    | momentum             |    0.3611 |              0.3603 |    0.0008 |
| vol_8    | curvature            |    0.3611 |              0.3356 |    0.0255 |
| vol_8    | position             |    0.3611 |              0.3604 |    0.0007 |
| vol_8    | time-since high/low  |    0.3611 |              0.3582 |    0.0029 |
| vol_8    | zig-zag / confluence |    0.3611 |              0.3611 |   -0.0001 |
| vol_8    | variability          |    0.3611 |              0.3590 |    0.0020 |
| vol_8    | divergence           |    0.3611 |              0.3603 |    0.0008 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 714 |     -0.0112 |    0.5000 |   -0.0162 |  -0.0805 |   0.0519 |
| dir_16   | M1 (with line)   | 714 |     -0.0112 |    1.0000 |   -0.0212 |  -0.0855 |   0.0469 |
| dir_16   | M1 (with line)   | 714 |     -0.0112 |    2.0000 |   -0.0312 |  -0.0955 |   0.0369 |
| dir_16   | M0 (Nasdaq only) | 718 |     -0.0547 |    0.5000 |   -0.0597 |  -0.1450 |   0.0194 |
| dir_16   | M0 (Nasdaq only) | 718 |     -0.0547 |    1.0000 |   -0.0647 |  -0.1500 |   0.0144 |
| dir_16   | M0 (Nasdaq only) | 718 |     -0.0547 |    2.0000 |   -0.0747 |  -0.1600 |   0.0044 |
| dir_8    | M1 (with line)   | 728 |      0.0036 |    0.5000 |   -0.0014 |  -0.0536 |   0.0476 |
| dir_8    | M1 (with line)   | 728 |      0.0036 |    1.0000 |   -0.0064 |  -0.0586 |   0.0426 |
| dir_8    | M1 (with line)   | 728 |      0.0036 |    2.0000 |   -0.0164 |  -0.0686 |   0.0326 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0195 |    0.5000 |    0.0145 |  -0.0231 |   0.0479 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0195 |    1.0000 |    0.0095 |  -0.0281 |   0.0429 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0195 |    2.0000 |   -0.0005 |  -0.0381 |   0.0329 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.