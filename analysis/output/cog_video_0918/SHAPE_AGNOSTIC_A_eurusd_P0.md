# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **a repeatable shape exists (see importance table for which)**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0             |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:-------------------|---------:|---------:|
| dir_8    | VAL     |    196 |  0.0807 |  0.0899 |    0.0093 | -0.0165 |  0.0337 | 0.5118932479194868 |   0.5097 |   0.2660 |
| dir_8    | OOS     |    165 |  0.0664 |  0.0833 |    0.0169 | -0.0116 |  0.0457 | 0.5198969723862475 |   0.5228 |   0.1140 |
| dir_8    | VAL+OOS |    361 |  0.0741 |  0.0869 |    0.0128 | -0.0058 |  0.0325 | 0.5148814583177295 |   0.5143 |   0.0925 |
| dir_16   | VAL     |    196 |  0.1094 |  0.0934 |   -0.0160 | -0.0547 |  0.0247 | 0.5195741134712502 |   0.5102 |   0.7900 |
| dir_16   | OOS     |    165 |  0.0673 |  0.1026 |    0.0354 | -0.0084 |  0.0784 | 0.5052982725136671 |   0.5224 |   0.0590 |
| dir_16   | VAL+OOS |    361 |  0.0901 |  0.0976 |    0.0075 | -0.0234 |  0.0371 | 0.5149028266912076 |   0.5148 |   0.3185 |
| dir_32   | VAL     |    196 |  0.1344 |  0.1009 |   -0.0335 | -0.0855 |  0.0196 | 0.5031181728833004 |   0.4900 |   0.8925 |
| dir_32   | OOS     |    165 |  0.1533 |  0.1638 |    0.0106 | -0.0397 |  0.0614 | 0.5306282243064654 |   0.5259 |   0.3325 |
| dir_32   | VAL+OOS |    361 |  0.1430 |  0.1297 |   -0.0134 | -0.0491 |  0.0244 | 0.5135588344415596 |   0.5046 |   0.7575 |
| vol_8    | VAL     |    196 |  0.2493 |  0.2707 |    0.0214 |  0.0129 |  0.0299 | (nan, nan)         |   0.8288 |   0.0000 |
| vol_8    | OOS     |    165 |  0.2622 |  0.2797 |    0.0175 |  0.0087 |  0.0268 | (nan, nan)         |   0.9831 |   0.0000 |
| vol_8    | VAL+OOS |    361 |  0.2552 |  0.2748 |    0.0196 |  0.0130 |  0.0254 | (nan, nan)         |   0.8694 |   0.0000 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0128 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0332%     | False         |
| dir_16   | False                       | False             |              0.0075 |        -0.0083 |        0.0159 | net lower bound at 1.0 bp: -0.0421%     | False         |
| dir_32   | False                       |                   |             -0.0134 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | True                        | True              |              0.0196 |         0.0063 |        0.0126 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.1026 |              0.0977 |    0.0050 |
| dir_16   | curvature            |    0.1026 |              0.0969 |    0.0058 |
| dir_16   | position             |    0.1026 |              0.1060 |   -0.0033 |
| dir_16   | time-since high/low  |    0.1026 |              0.1086 |   -0.0060 |
| dir_16   | zig-zag / confluence |    0.1026 |              0.0794 |    0.0232 |
| dir_16   | variability          |    0.1026 |              0.1033 |   -0.0007 |
| dir_16   | divergence           |    0.1026 |              0.0972 |    0.0054 |
| vol_8    | momentum             |    0.2797 |              0.2653 |    0.0144 |
| vol_8    | curvature            |    0.2797 |              0.2593 |    0.0204 |
| vol_8    | position             |    0.2797 |              0.2799 |   -0.0002 |
| vol_8    | time-since high/low  |    0.2797 |              0.2773 |    0.0025 |
| vol_8    | zig-zag / confluence |    0.2797 |              0.2796 |    0.0002 |
| vol_8    | variability          |    0.2797 |              0.2785 |    0.0013 |
| vol_8    | divergence           |    0.2797 |              0.2769 |    0.0028 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 766 |      0.0016 |    0.5000 |   -0.0034 |  -0.0371 |   0.0269 |
| dir_16   | M1 (with line)   | 766 |      0.0016 |    1.0000 |   -0.0084 |  -0.0421 |   0.0219 |
| dir_16   | M1 (with line)   | 766 |      0.0016 |    2.0000 |   -0.0184 |  -0.0521 |   0.0119 |
| dir_16   | M0 (Nasdaq only) | 766 |      0.0002 |    0.5000 |   -0.0048 |  -0.0333 |   0.0234 |
| dir_16   | M0 (Nasdaq only) | 766 |      0.0002 |    1.0000 |   -0.0098 |  -0.0383 |   0.0184 |
| dir_16   | M0 (Nasdaq only) | 766 |      0.0002 |    2.0000 |   -0.0198 |  -0.0483 |   0.0084 |
| dir_8    | M1 (with line)   | 779 |     -0.0039 |    0.5000 |   -0.0089 |  -0.0282 |   0.0102 |
| dir_8    | M1 (with line)   | 779 |     -0.0039 |    1.0000 |   -0.0139 |  -0.0332 |   0.0052 |
| dir_8    | M1 (with line)   | 779 |     -0.0039 |    2.0000 |   -0.0239 |  -0.0432 |  -0.0048 |
| dir_8    | M0 (Nasdaq only) | 780 |     -0.0060 |    0.5000 |   -0.0110 |  -0.0280 |   0.0039 |
| dir_8    | M0 (Nasdaq only) | 780 |     -0.0060 |    1.0000 |   -0.0160 |  -0.0330 |  -0.0011 |
| dir_8    | M0 (Nasdaq only) | 780 |     -0.0060 |    2.0000 |   -0.0260 |  -0.0430 |  -0.0111 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.