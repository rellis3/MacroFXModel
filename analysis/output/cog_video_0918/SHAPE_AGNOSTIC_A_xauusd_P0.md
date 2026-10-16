# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    195 | -0.0509 | -0.0111 |    0.0398 |  0.0033 |  0.0758 | 0.48407773439429136 |   0.4984 |   0.0155 |
| dir_8    | OOS     |    164 | -0.0489 |  0.0055 |    0.0543 |  0.0159 |  0.0924 | 0.49558499592374017 |   0.4985 |   0.0055 |
| dir_8    | VAL+OOS |    359 | -0.0500 | -0.0035 |    0.0464 |  0.0215 |  0.0712 | 0.4901704276875978  |   0.4983 |   0.0005 |
| dir_16   | VAL     |    195 | -0.0500 | -0.0619 |   -0.0118 | -0.0555 |  0.0302 | 0.47460066713374843 |   0.4927 |   0.6940 |
| dir_16   | OOS     |    164 | -0.0296 | -0.0670 |   -0.0374 | -0.0885 |  0.0126 | 0.49233432640577623 |   0.4734 |   0.9235 |
| dir_16   | VAL+OOS |    359 | -0.0407 | -0.0642 |   -0.0235 | -0.0592 |  0.0102 | 0.4834325861744747  |   0.4844 |   0.9165 |
| dir_32   | VAL     |    195 | -0.0176 | -0.0534 |   -0.0358 | -0.0979 |  0.0232 | 0.4717467366879673  |   0.4873 |   0.8760 |
| dir_32   | OOS     |    164 | -0.0532 | -0.1132 |   -0.0600 | -0.1175 | -0.0025 | 0.4884048727590313  |   0.4603 |   0.9795 |
| dir_32   | VAL+OOS |    359 | -0.0339 | -0.0807 |   -0.0469 | -0.0882 | -0.0053 | 0.4833533205901659  |   0.4779 |   0.9845 |
| vol_8    | VAL     |    195 |  0.1632 |  0.1721 |    0.0089 | -0.0033 |  0.0208 | (nan, nan)          |   0.7319 |   0.0715 |
| vol_8    | OOS     |    164 |  0.1449 |  0.1430 |   -0.0019 | -0.0094 |  0.0055 | (nan, nan)          |   0.7143 |   0.7000 |
| vol_8    | VAL+OOS |    359 |  0.1548 |  0.1588 |    0.0040 | -0.0031 |  0.0112 | (nan, nan)          |   0.7510 |   0.1495 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | True                        |                   |              0.0464 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0943%     | False         |
| dir_16   | False                       | False             |             -0.0235 |        -0.0098 |        0.0108 | net lower bound at 1.0 bp: -0.2234%     | False         |
| dir_32   | False                       |                   |             -0.0469 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | False             |              0.0040 |        -0.0002 |        0.0050 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |   -0.0670 |             -0.0579 |   -0.0091 |
| dir_16   | curvature            |   -0.0670 |             -0.0660 |   -0.0010 |
| dir_16   | position             |   -0.0670 |             -0.0643 |   -0.0026 |
| dir_16   | time-since high/low  |   -0.0670 |             -0.0606 |   -0.0064 |
| dir_16   | zig-zag / confluence |   -0.0670 |             -0.0529 |   -0.0140 |
| dir_16   | variability          |   -0.0670 |             -0.0660 |   -0.0009 |
| dir_16   | divergence           |   -0.0670 |             -0.0622 |   -0.0048 |
| vol_8    | momentum             |    0.1430 |              0.1435 |   -0.0005 |
| vol_8    | curvature            |    0.1430 |              0.1392 |    0.0038 |
| vol_8    | position             |    0.1430 |              0.1434 |   -0.0004 |
| vol_8    | time-since high/low  |    0.1430 |              0.1409 |    0.0021 |
| vol_8    | zig-zag / confluence |    0.1430 |              0.1444 |   -0.0014 |
| vol_8    | variability          |    0.1430 |              0.1401 |    0.0029 |
| vol_8    | divergence           |    0.1430 |              0.1394 |    0.0037 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 698 |     -0.0444 |    0.5000 |   -0.0494 |  -0.2184 |   0.1104 |
| dir_16   | M1 (with line)   | 698 |     -0.0444 |    1.0000 |   -0.0544 |  -0.2234 |   0.1054 |
| dir_16   | M1 (with line)   | 698 |     -0.0444 |    2.0000 |   -0.0644 |  -0.2334 |   0.0954 |
| dir_16   | M0 (Nasdaq only) | 700 |     -0.0346 |    0.5000 |   -0.0396 |  -0.2289 |   0.1970 |
| dir_16   | M0 (Nasdaq only) | 700 |     -0.0346 |    1.0000 |   -0.0446 |  -0.2339 |   0.1920 |
| dir_16   | M0 (Nasdaq only) | 700 |     -0.0346 |    2.0000 |   -0.0546 |  -0.2439 |   0.1820 |
| dir_8    | M1 (with line)   | 712 |     -0.0127 |    0.5000 |   -0.0177 |  -0.0893 |   0.0488 |
| dir_8    | M1 (with line)   | 712 |     -0.0127 |    1.0000 |   -0.0227 |  -0.0943 |   0.0438 |
| dir_8    | M1 (with line)   | 712 |     -0.0127 |    2.0000 |   -0.0327 |  -0.1043 |   0.0338 |
| dir_8    | M0 (Nasdaq only) | 712 |     -0.0345 |    0.5000 |   -0.0395 |  -0.1369 |   0.0669 |
| dir_8    | M0 (Nasdaq only) | 712 |     -0.0345 |    1.0000 |   -0.0445 |  -0.1419 |   0.0619 |
| dir_8    | M0 (Nasdaq only) | 712 |     -0.0345 |    2.0000 |   -0.0545 |  -0.1519 |   0.0519 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.