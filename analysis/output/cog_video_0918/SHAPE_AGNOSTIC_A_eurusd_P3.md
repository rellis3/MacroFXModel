# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **a repeatable shape exists (see importance table for which)**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0             |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:-------------------|---------:|---------:|
| dir_8    | VAL     |    196 |  0.0807 |  0.0668 |   -0.0138 | -0.0474 |  0.0191 | 0.5118932479194868 |   0.5028 |   0.8100 |
| dir_8    | OOS     |    165 |  0.0664 |  0.0431 |   -0.0233 | -0.0554 |  0.0072 | 0.5198969723862475 |   0.5076 |   0.9270 |
| dir_8    | VAL+OOS |    361 |  0.0741 |  0.0560 |   -0.0182 | -0.0409 |  0.0047 | 0.5148814583177295 |   0.5041 |   0.9355 |
| dir_16   | VAL     |    196 |  0.1094 |  0.0692 |   -0.0401 | -0.0811 | -0.0007 | 0.5195741134712502 |   0.4976 |   0.9775 |
| dir_16   | OOS     |    165 |  0.0673 |  0.0528 |   -0.0145 | -0.0577 |  0.0250 | 0.5052982725136671 |   0.5047 |   0.7630 |
| dir_16   | VAL+OOS |    361 |  0.0901 |  0.0617 |   -0.0284 | -0.0574 |  0.0003 | 0.5149028266912076 |   0.5012 |   0.9725 |
| dir_32   | VAL     |    196 |  0.1344 |  0.0275 |   -0.1069 | -0.1615 | -0.0521 | 0.5031181728833004 |   0.4846 |   1.0000 |
| dir_32   | OOS     |    165 |  0.1533 |  0.0749 |   -0.0784 | -0.1295 | -0.0277 | 0.5306282243064654 |   0.4991 |   0.9995 |
| dir_32   | VAL+OOS |    361 |  0.1430 |  0.0491 |   -0.0939 | -0.1321 | -0.0547 | 0.5135588344415596 |   0.4931 |   1.0000 |
| vol_8    | VAL     |    196 |  0.2493 |  0.2750 |    0.0256 |  0.0171 |  0.0343 | (nan, nan)         |   0.8395 |   0.0000 |
| vol_8    | OOS     |    165 |  0.2622 |  0.2782 |    0.0160 |  0.0085 |  0.0237 | (nan, nan)         |   0.9844 |   0.0000 |
| vol_8    | VAL+OOS |    361 |  0.2552 |  0.2765 |    0.0212 |  0.0149 |  0.0273 | (nan, nan)         |   0.8829 |   0.0000 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |             -0.0182 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0299%     | False         |
| dir_16   | False                       | False             |             -0.0284 |        -0.0249 |        0.0052 | net lower bound at 1.0 bp: -0.0313%     | False         |
| dir_32   | False                       |                   |             -0.0939 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | True                        | True              |              0.0212 |         0.0081 |        0.0121 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0528 |              0.0304 |    0.0224 |
| dir_16   | curvature            |    0.0528 |              0.0432 |    0.0096 |
| dir_16   | position             |    0.0528 |              0.0531 |   -0.0003 |
| dir_16   | time-since high/low  |    0.0528 |              0.0559 |   -0.0031 |
| dir_16   | zig-zag / confluence |    0.0528 |              0.0551 |   -0.0023 |
| dir_16   | variability          |    0.0528 |              0.0525 |    0.0003 |
| dir_16   | divergence           |    0.0528 |              0.0488 |    0.0040 |
| vol_8    | momentum             |    0.2782 |              0.2757 |    0.0026 |
| vol_8    | curvature            |    0.2782 |              0.2728 |    0.0055 |
| vol_8    | position             |    0.2782 |              0.2789 |   -0.0006 |
| vol_8    | time-since high/low  |    0.2782 |              0.2756 |    0.0026 |
| vol_8    | zig-zag / confluence |    0.2782 |              0.2787 |   -0.0005 |
| vol_8    | variability          |    0.2782 |              0.2778 |    0.0004 |
| vol_8    | divergence           |    0.2782 |              0.2664 |    0.0118 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 766 |      0.0135 |    0.5000 |    0.0085 |  -0.0263 |   0.0434 |
| dir_16   | M1 (with line)   | 766 |      0.0135 |    1.0000 |    0.0035 |  -0.0313 |   0.0384 |
| dir_16   | M1 (with line)   | 766 |      0.0135 |    2.0000 |   -0.0065 |  -0.0413 |   0.0284 |
| dir_16   | M0 (Nasdaq only) | 766 |      0.0002 |    0.5000 |   -0.0048 |  -0.0359 |   0.0230 |
| dir_16   | M0 (Nasdaq only) | 766 |      0.0002 |    1.0000 |   -0.0098 |  -0.0409 |   0.0180 |
| dir_16   | M0 (Nasdaq only) | 766 |      0.0002 |    2.0000 |   -0.0198 |  -0.0509 |   0.0080 |
| dir_8    | M1 (with line)   | 779 |     -0.0037 |    0.5000 |   -0.0087 |  -0.0249 |   0.0078 |
| dir_8    | M1 (with line)   | 779 |     -0.0037 |    1.0000 |   -0.0137 |  -0.0299 |   0.0028 |
| dir_8    | M1 (with line)   | 779 |     -0.0037 |    2.0000 |   -0.0237 |  -0.0399 |  -0.0072 |
| dir_8    | M0 (Nasdaq only) | 780 |     -0.0060 |    0.5000 |   -0.0110 |  -0.0289 |   0.0047 |
| dir_8    | M0 (Nasdaq only) | 780 |     -0.0060 |    1.0000 |   -0.0160 |  -0.0339 |  -0.0003 |
| dir_8    | M0 (Nasdaq only) | 780 |     -0.0060 |    2.0000 |   -0.0260 |  -0.0439 |  -0.0103 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.