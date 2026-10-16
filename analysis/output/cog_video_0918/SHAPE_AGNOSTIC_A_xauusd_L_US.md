# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    195 | -0.0509 | -0.0280 |    0.0229 | -0.0100 |  0.0574 | 0.48407773439429136 |   0.4965 |   0.0795 |
| dir_8    | OOS     |    164 | -0.0489 | -0.0445 |    0.0043 | -0.0345 |  0.0461 | 0.49558499592374017 |   0.4946 |   0.4255 |
| dir_8    | VAL+OOS |    359 | -0.0500 | -0.0355 |    0.0144 | -0.0113 |  0.0398 | 0.4901704276875978  |   0.4947 |   0.1295 |
| dir_16   | VAL     |    195 | -0.0500 | -0.0580 |   -0.0080 | -0.0559 |  0.0418 | 0.47460066713374843 |   0.4870 |   0.6160 |
| dir_16   | OOS     |    164 | -0.0296 | -0.0781 |   -0.0486 | -0.0960 | -0.0018 | 0.49233432640577623 |   0.4837 |   0.9790 |
| dir_16   | VAL+OOS |    359 | -0.0407 | -0.0672 |   -0.0265 | -0.0620 |  0.0081 | 0.4834325861744747  |   0.4852 |   0.9370 |
| dir_32   | VAL     |    195 | -0.0176 | -0.0821 |   -0.0645 | -0.1254 | -0.0034 | 0.4717467366879673  |   0.4885 |   0.9780 |
| dir_32   | OOS     |    164 | -0.0532 | -0.0601 |   -0.0069 | -0.0604 |  0.0469 | 0.4884048727590313  |   0.4941 |   0.6040 |
| dir_32   | VAL+OOS |    359 | -0.0339 | -0.0721 |   -0.0382 | -0.0797 |  0.0032 | 0.4833533205901659  |   0.4928 |   0.9590 |
| vol_8    | VAL     |    195 |  0.1632 |  0.1580 |   -0.0052 | -0.0111 |  0.0009 | (nan, nan)          |   0.7285 |   0.9500 |
| vol_8    | OOS     |    164 |  0.1449 |  0.1414 |   -0.0035 | -0.0101 |  0.0027 | (nan, nan)          |   0.7138 |   0.8685 |
| vol_8    | VAL+OOS |    359 |  0.1548 |  0.1504 |   -0.0044 | -0.0091 |  0.0001 | (nan, nan)          |   0.7501 |   0.9715 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0144 |       nan      |      nan      | net lower bound at 1.0 bp: -0.1772%     | False         |
| dir_16   | False                       | False             |             -0.0265 |        -0.0049 |        0.0286 | net lower bound at 1.0 bp: -0.1816%     | False         |
| dir_32   | False                       |                   |             -0.0382 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | False             |             -0.0044 |        -0.0008 |        0.0017 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |   -0.0781 |             -0.0573 |   -0.0208 |
| dir_16   | curvature            |   -0.0781 |             -0.0843 |    0.0062 |
| dir_16   | position             |   -0.0781 |             -0.0861 |    0.0080 |
| dir_16   | time-since high/low  |   -0.0781 |             -0.0671 |   -0.0110 |
| dir_16   | zig-zag / confluence |   -0.0781 |             -0.0612 |   -0.0169 |
| dir_16   | variability          |   -0.0781 |             -0.0677 |   -0.0104 |
| dir_16   | divergence           |   -0.0781 |             -0.0570 |   -0.0211 |
| vol_8    | momentum             |    0.1414 |              0.1381 |    0.0033 |
| vol_8    | curvature            |    0.1414 |              0.1405 |    0.0009 |
| vol_8    | position             |    0.1414 |              0.1413 |    0.0001 |
| vol_8    | time-since high/low  |    0.1414 |              0.1422 |   -0.0008 |
| vol_8    | zig-zag / confluence |    0.1414 |              0.1436 |   -0.0021 |
| vol_8    | variability          |    0.1414 |              0.1394 |    0.0020 |
| vol_8    | divergence           |    0.1414 |              0.1428 |   -0.0014 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 698 |     -0.0059 |    0.5000 |   -0.0109 |  -0.1766 |   0.1530 |
| dir_16   | M1 (with line)   | 698 |     -0.0059 |    1.0000 |   -0.0159 |  -0.1816 |   0.1480 |
| dir_16   | M1 (with line)   | 698 |     -0.0059 |    2.0000 |   -0.0259 |  -0.1916 |   0.1380 |
| dir_16   | M0 (Nasdaq only) | 700 |     -0.0346 |    0.5000 |   -0.0396 |  -0.2375 |   0.2011 |
| dir_16   | M0 (Nasdaq only) | 700 |     -0.0346 |    1.0000 |   -0.0446 |  -0.2425 |   0.1961 |
| dir_16   | M0 (Nasdaq only) | 700 |     -0.0346 |    2.0000 |   -0.0546 |  -0.2525 |   0.1861 |
| dir_8    | M1 (with line)   | 712 |     -0.0641 |    0.5000 |   -0.0691 |  -0.1722 |   0.0260 |
| dir_8    | M1 (with line)   | 712 |     -0.0641 |    1.0000 |   -0.0741 |  -0.1772 |   0.0210 |
| dir_8    | M1 (with line)   | 712 |     -0.0641 |    2.0000 |   -0.0841 |  -0.1872 |   0.0110 |
| dir_8    | M0 (Nasdaq only) | 712 |     -0.0345 |    0.5000 |   -0.0395 |  -0.1332 |   0.0662 |
| dir_8    | M0 (Nasdaq only) | 712 |     -0.0345 |    1.0000 |   -0.0445 |  -0.1382 |   0.0612 |
| dir_8    | M0 (Nasdaq only) | 712 |     -0.0345 |    2.0000 |   -0.0545 |  -0.1482 |   0.0512 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.