# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **a repeatable shape exists (see importance table for which)**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0             |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:-------------------|---------:|---------:|
| dir_8    | VAL     |    196 |  0.0807 |  0.0702 |   -0.0104 | -0.0375 |  0.0168 | 0.5118932479194868 |   0.5046 |   0.7880 |
| dir_8    | OOS     |    165 |  0.0664 |  0.0308 |   -0.0356 | -0.0636 | -0.0084 | 0.5198969723862475 |   0.5023 |   0.9965 |
| dir_8    | VAL+OOS |    361 |  0.0741 |  0.0522 |   -0.0219 | -0.0409 | -0.0028 | 0.5148814583177295 |   0.5028 |   0.9885 |
| dir_16   | VAL     |    196 |  0.1094 |  0.0929 |   -0.0165 | -0.0514 |  0.0184 | 0.5195741134712502 |   0.5086 |   0.8095 |
| dir_16   | OOS     |    165 |  0.0673 |  0.0312 |   -0.0361 | -0.0735 |  0.0004 | 0.5052982725136671 |   0.5140 |   0.9740 |
| dir_16   | VAL+OOS |    361 |  0.0901 |  0.0647 |   -0.0254 | -0.0516 |  0.0010 | 0.5149028266912076 |   0.5095 |   0.9715 |
| dir_32   | VAL     |    196 |  0.1344 |  0.0977 |   -0.0368 | -0.0858 |  0.0136 | 0.5031181728833004 |   0.4930 |   0.9280 |
| dir_32   | OOS     |    165 |  0.1533 |  0.0486 |   -0.1047 | -0.1629 | -0.0456 | 0.5306282243064654 |   0.5136 |   1.0000 |
| dir_32   | VAL+OOS |    361 |  0.1430 |  0.0752 |   -0.0678 | -0.1070 | -0.0291 | 0.5135588344415596 |   0.5003 |   1.0000 |
| vol_8    | VAL     |    196 |  0.2493 |  0.2571 |    0.0077 |  0.0028 |  0.0127 | (nan, nan)         |   0.8096 |   0.0015 |
| vol_8    | OOS     |    165 |  0.2622 |  0.2678 |    0.0056 |  0.0011 |  0.0098 | (nan, nan)         |   0.9835 |   0.0055 |
| vol_8    | VAL+OOS |    361 |  0.2552 |  0.2620 |    0.0068 |  0.0032 |  0.0100 | (nan, nan)         |   0.8557 |   0.0000 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |             -0.0219 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0486%     | False         |
| dir_16   | False                       | False             |             -0.0254 |        -0.0100 |        0.0069 | net lower bound at 1.0 bp: -0.0474%     | False         |
| dir_32   | False                       |                   |             -0.0678 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | True                        | True              |              0.0068 |         0.0002 |        0.0016 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0312 |              0.0374 |   -0.0062 |
| dir_16   | curvature            |    0.0312 |              0.0301 |    0.0011 |
| dir_16   | position             |    0.0312 |              0.0308 |    0.0005 |
| dir_16   | time-since high/low  |    0.0312 |              0.0164 |    0.0148 |
| dir_16   | zig-zag / confluence |    0.0312 |              0.0383 |   -0.0071 |
| dir_16   | variability          |    0.0312 |              0.0309 |    0.0003 |
| dir_16   | divergence           |    0.0312 |              0.0669 |   -0.0357 |
| vol_8    | momentum             |    0.2678 |              0.2657 |    0.0021 |
| vol_8    | curvature            |    0.2678 |              0.2620 |    0.0058 |
| vol_8    | position             |    0.2678 |              0.2677 |    0.0001 |
| vol_8    | time-since high/low  |    0.2678 |              0.2680 |   -0.0002 |
| vol_8    | zig-zag / confluence |    0.2678 |              0.2671 |    0.0007 |
| vol_8    | variability          |    0.2678 |              0.2674 |    0.0004 |
| vol_8    | divergence           |    0.2678 |              0.2631 |    0.0048 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 768 |     -0.0072 |    0.5000 |   -0.0122 |  -0.0424 |   0.0161 |
| dir_16   | M1 (with line)   | 768 |     -0.0072 |    1.0000 |   -0.0172 |  -0.0474 |   0.0111 |
| dir_16   | M1 (with line)   | 768 |     -0.0072 |    2.0000 |   -0.0272 |  -0.0574 |   0.0011 |
| dir_16   | M0 (Nasdaq only) | 766 |      0.0002 |    0.5000 |   -0.0048 |  -0.0356 |   0.0231 |
| dir_16   | M0 (Nasdaq only) | 766 |      0.0002 |    1.0000 |   -0.0098 |  -0.0406 |   0.0181 |
| dir_16   | M0 (Nasdaq only) | 766 |      0.0002 |    2.0000 |   -0.0198 |  -0.0506 |   0.0081 |
| dir_8    | M1 (with line)   | 779 |     -0.0186 |    0.5000 |   -0.0236 |  -0.0436 |  -0.0029 |
| dir_8    | M1 (with line)   | 779 |     -0.0186 |    1.0000 |   -0.0286 |  -0.0486 |  -0.0079 |
| dir_8    | M1 (with line)   | 779 |     -0.0186 |    2.0000 |   -0.0386 |  -0.0586 |  -0.0179 |
| dir_8    | M0 (Nasdaq only) | 780 |     -0.0060 |    0.5000 |   -0.0110 |  -0.0278 |   0.0041 |
| dir_8    | M0 (Nasdaq only) | 780 |     -0.0060 |    1.0000 |   -0.0160 |  -0.0328 |  -0.0009 |
| dir_8    | M0 (Nasdaq only) | 780 |     -0.0060 |    2.0000 |   -0.0260 |  -0.0428 |  -0.0109 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.