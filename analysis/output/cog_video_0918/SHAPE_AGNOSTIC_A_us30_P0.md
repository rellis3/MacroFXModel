# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **a repeatable shape exists (see importance table for which)**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |    ci_lo |    ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|---------:|---------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    195 |  0.0115 |  0.0129 |  nan      | nan      | nan      | 0.49972221585528875 |   0.4961 |   0.1865 |
| dir_8    | OOS     |    165 | -0.0113 |  0.0254 |  nan      | nan      | nan      | 0.48339384979764033 |   0.5044 |   0.0020 |
| dir_8    | VAL+OOS |    360 |  0.0011 |  0.0186 |  nan      | nan      | nan      | 0.4939955733841583  |   0.4998 |   0.0010 |
| dir_16   | VAL     |    193 |  0.0345 |  0.0158 |   -0.0187 |  -0.0639 |   0.0250 | 0.5045027142822011  |   0.5073 |   0.8070 |
| dir_16   | OOS     |    164 |  0.0684 |  0.0643 |  nan      | nan      | nan      | 0.49224280782162555 |   0.5217 |   0.0620 |
| dir_16   | VAL+OOS |    357 |  0.0501 |  0.0379 |  nan      | nan      | nan      | 0.4983879876969521  |   0.5138 |   0.1020 |
| dir_32   | VAL     |    193 |  0.1305 |  0.0207 |   -0.1098 |  -0.1734 |  -0.0476 | 0.5099591646852384  |   0.5221 |   1.0000 |
| dir_32   | OOS     |    163 |  0.1557 |  0.0878 |  nan      | nan      | nan      | 0.4982606372420747  |   0.5618 |   0.3640 |
| dir_32   | VAL+OOS |    356 |  0.1421 |  0.0513 |  nan      | nan      | nan      | 0.5037315056258407  |   0.5381 |   0.3750 |
| vol_8    | VAL     |    195 |  0.3473 |  0.3733 |    0.0260 |   0.0172 |   0.0357 | (nan, nan)          |   0.8311 |   0.0000 |
| vol_8    | OOS     |    165 |  0.3424 |  0.3641 |    0.0217 |   0.0127 |   0.0306 | (nan, nan)          |   0.8367 |   0.0000 |
| vol_8    | VAL+OOS |    360 |  0.3451 |  0.3691 |    0.0240 |   0.0178 |   0.0306 | (nan, nan)          |   0.8257 |   0.0000 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: -0.0274%     | False         |
| dir_16   | False                       | False             |            nan      |        -0.0176 |       -0.0011 | net lower bound at 1.0 bp: -0.0906%     | False         |
| dir_32   | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | True                        | True              |              0.0240 |         0.0077 |        0.0154 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0643 |              0.0554 |    0.0088 |
| dir_16   | curvature            |    0.0643 |              0.0724 |   -0.0081 |
| dir_16   | position             |    0.0643 |              0.0566 |    0.0077 |
| dir_16   | time-since high/low  |    0.0643 |              0.0285 |    0.0358 |
| dir_16   | zig-zag / confluence |    0.0643 |              0.0554 |    0.0089 |
| dir_16   | variability          |    0.0643 |              0.0522 |    0.0121 |
| dir_16   | divergence           |    0.0643 |              0.0544 |    0.0099 |
| vol_8    | momentum             |    0.3641 |              0.3600 |    0.0041 |
| vol_8    | curvature            |    0.3641 |              0.3050 |    0.0591 |
| vol_8    | position             |    0.3641 |              0.3621 |    0.0020 |
| vol_8    | time-since high/low  |    0.3641 |              0.3586 |    0.0055 |
| vol_8    | zig-zag / confluence |    0.3641 |              0.3635 |    0.0007 |
| vol_8    | variability          |    0.3641 |              0.3645 |   -0.0004 |
| vol_8    | divergence           |    0.3641 |              0.3579 |    0.0062 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 715 |     -0.0020 |    0.5000 |   -0.0070 |  -0.0856 |   0.0714 |
| dir_16   | M1 (with line)   | 715 |     -0.0020 |    1.0000 |   -0.0120 |  -0.0906 |   0.0664 |
| dir_16   | M1 (with line)   | 715 |     -0.0020 |    2.0000 |   -0.0220 |  -0.1006 |   0.0564 |
| dir_16   | M0 (Nasdaq only) | 718 |     -0.0547 |    0.5000 |   -0.0597 |  -0.1427 |   0.0194 |
| dir_16   | M0 (Nasdaq only) | 718 |     -0.0547 |    1.0000 |   -0.0647 |  -0.1477 |   0.0144 |
| dir_16   | M0 (Nasdaq only) | 718 |     -0.0547 |    2.0000 |   -0.0747 |  -0.1577 |   0.0044 |
| dir_8    | M1 (with line)   | 728 |      0.0274 |    0.5000 |    0.0224 |  -0.0224 |   0.0610 |
| dir_8    | M1 (with line)   | 728 |      0.0274 |    1.0000 |    0.0174 |  -0.0274 |   0.0560 |
| dir_8    | M1 (with line)   | 728 |      0.0274 |    2.0000 |    0.0074 |  -0.0374 |   0.0460 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0195 |    0.5000 |    0.0145 |  -0.0231 |   0.0473 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0195 |    1.0000 |    0.0095 |  -0.0281 |   0.0423 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0195 |    2.0000 |   -0.0005 |  -0.0381 |   0.0323 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.