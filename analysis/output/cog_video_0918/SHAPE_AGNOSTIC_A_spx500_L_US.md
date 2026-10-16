# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **a repeatable shape exists (see importance table for which)**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |    ci_lo |    ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|---------:|---------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    194 | -0.0198 |  0.0349 |  nan      | nan      | nan      | 0.4974780139029324  |   0.4974 |   0.0005 |
| dir_8    | OOS     |    165 | -0.0372 |  0.0408 |    0.0780 |   0.0372 |   0.1167 | 0.486257248284428   |   0.5192 |   0.0005 |
| dir_8    | VAL+OOS |    359 | -0.0278 |  0.0376 |  nan      | nan      | nan      | 0.4933347907418849  |   0.5073 |   0.0000 |
| dir_16   | VAL     |    194 |  0.0312 |  0.0573 |  nan      | nan      | nan      | 0.49102921580528974 |   0.4972 |   0.0005 |
| dir_16   | OOS     |    165 |  0.0506 |  0.0924 |    0.0419 |  -0.0157 |   0.0953 | 0.49368666891949686 |   0.5318 |   0.0725 |
| dir_16   | VAL+OOS |    359 |  0.0402 |  0.0734 |  nan      | nan      | nan      | 0.493383630319167   |   0.5125 |   0.0005 |
| dir_32   | VAL     |    194 |  0.1374 |  0.0845 |  nan      | nan      | nan      | 0.5042316142802978  |   0.5119 |   0.3680 |
| dir_32   | OOS     |    165 |  0.1910 |  0.1218 |   -0.0692 |  -0.1268 |  -0.0058 | 0.529834518628315   |   0.5336 |   0.9860 |
| dir_32   | VAL+OOS |    359 |  0.1621 |  0.1016 |  nan      | nan      | nan      | 0.5145991301206299  |   0.5209 |   0.3835 |
| vol_8    | VAL     |    195 |  0.2919 |  0.2977 |    0.0058 |   0.0001 |   0.0114 | (nan, nan)          |   0.8798 |   0.0240 |
| vol_8    | OOS     |    165 |  0.2680 |  0.2738 |    0.0058 |   0.0000 |   0.0113 | (nan, nan)          |   0.8244 |   0.0240 |
| vol_8    | VAL+OOS |    360 |  0.2810 |  0.2868 |    0.0058 |   0.0019 |   0.0098 | (nan, nan)          |   0.8655 |   0.0010 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: -0.0447%     | False         |
| dir_16   | False                       | False             |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: -0.0536%     | False         |
| dir_32   | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | True                        | True              |              0.0058 |         0.0001 |        0.0016 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0924 |              0.0894 |    0.0030 |
| dir_16   | curvature            |    0.0924 |              0.0751 |    0.0173 |
| dir_16   | position             |    0.0924 |              0.0938 |   -0.0013 |
| dir_16   | time-since high/low  |    0.0924 |              0.0666 |    0.0258 |
| dir_16   | zig-zag / confluence |    0.0924 |              0.0930 |   -0.0006 |
| dir_16   | variability          |    0.0924 |              0.0847 |    0.0077 |
| dir_16   | divergence           |    0.0924 |              0.0835 |    0.0089 |
| vol_8    | momentum             |    0.2738 |              0.2747 |   -0.0009 |
| vol_8    | curvature            |    0.2738 |              0.2723 |    0.0015 |
| vol_8    | position             |    0.2738 |              0.2738 |   -0.0000 |
| vol_8    | time-since high/low  |    0.2738 |              0.2740 |   -0.0002 |
| vol_8    | zig-zag / confluence |    0.2738 |              0.2738 |    0.0000 |
| vol_8    | variability          |    0.2738 |              0.2702 |    0.0036 |
| vol_8    | divergence           |    0.2738 |              0.2726 |    0.0012 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 714 |      0.0220 |    0.5000 |    0.0170 |  -0.0486 |   0.0721 |
| dir_16   | M1 (with line)   | 714 |      0.0220 |    1.0000 |    0.0120 |  -0.0536 |   0.0671 |
| dir_16   | M1 (with line)   | 714 |      0.0220 |    2.0000 |    0.0020 |  -0.0636 |   0.0571 |
| dir_16   | M0 (Nasdaq only) | 715 |     -0.0308 |    0.5000 |   -0.0358 |  -0.1071 |   0.0264 |
| dir_16   | M0 (Nasdaq only) | 715 |     -0.0308 |    1.0000 |   -0.0408 |  -0.1121 |   0.0214 |
| dir_16   | M0 (Nasdaq only) | 715 |     -0.0308 |    2.0000 |   -0.0508 |  -0.1221 |   0.0114 |
| dir_8    | M1 (with line)   | 728 |      0.0164 |    0.5000 |    0.0114 |  -0.0397 |   0.0554 |
| dir_8    | M1 (with line)   | 728 |      0.0164 |    1.0000 |    0.0064 |  -0.0447 |   0.0504 |
| dir_8    | M1 (with line)   | 728 |      0.0164 |    2.0000 |   -0.0036 |  -0.0547 |   0.0404 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0051 |    0.5000 |    0.0001 |  -0.0510 |   0.0494 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0051 |    1.0000 |   -0.0049 |  -0.0560 |   0.0444 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0051 |    2.0000 |   -0.0149 |  -0.0660 |   0.0344 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.