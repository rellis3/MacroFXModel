# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    195 |  0.0212 |  0.0243 |    0.0032 | -0.0330 |  0.0359 | 0.4922031794108627  |   0.4991 |   0.4435 |
| dir_8    | OOS     |    165 |  0.0159 |  0.0452 |    0.0293 | -0.0108 |  0.0694 | 0.49315435183259243 |   0.5058 |   0.0790 |
| dir_8    | VAL+OOS |    360 |  0.0187 |  0.0339 |    0.0151 | -0.0112 |  0.0414 | 0.49249905007026074 |   0.5008 |   0.1235 |
| dir_16   | VAL     |    194 |  0.0117 |  0.0155 |    0.0038 | -0.0358 |  0.0438 | 0.4885993775116426  |   0.5041 |   0.4430 |
| dir_16   | OOS     |    165 |  0.0883 |  0.0140 |   -0.0742 | -0.1246 | -0.0224 | 0.5023239576768215  |   0.5070 |   0.9975 |
| dir_16   | VAL+OOS |    359 |  0.0469 |  0.0148 |   -0.0321 | -0.0640 |  0.0000 | 0.4951362182336675  |   0.5052 |   0.9745 |
| dir_32   | VAL     |    193 |  0.0371 |  0.0226 |   -0.0145 | -0.0723 |  0.0424 | 0.5057200873603298  |   0.5169 |   0.6910 |
| dir_32   | OOS     |    165 |  0.1335 |  0.0579 |   -0.0755 | -0.1374 | -0.0104 | 0.52886237153209    |   0.5279 |   0.9895 |
| dir_32   | VAL+OOS |    358 |  0.0815 |  0.0389 |   -0.0426 | -0.0875 |  0.0011 | 0.5181213300816677  |   0.5221 |   0.9720 |
| vol_8    | VAL     |    195 |  0.3782 |  0.3958 |    0.0176 |  0.0089 |  0.0262 | (nan, nan)          |   0.8456 |   0.0000 |
| vol_8    | OOS     |    165 |  0.3556 |  0.3633 |    0.0077 | -0.0020 |  0.0173 | (nan, nan)          |   0.8408 |   0.0670 |
| vol_8    | VAL+OOS |    360 |  0.3678 |  0.3809 |    0.0130 |  0.0062 |  0.0195 | (nan, nan)          |   0.8431 |   0.0005 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0151 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0494%     | False         |
| dir_16   | False                       | False             |             -0.0321 |        -0.0090 |        0.0060 | net lower bound at 1.0 bp: -0.1236%     | False         |
| dir_32   | False                       |                   |             -0.0426 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | True              |              0.0130 |         0.0032 |        0.0091 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0140 |              0.0108 |    0.0032 |
| dir_16   | curvature            |    0.0140 |              0.0140 |   -0.0000 |
| dir_16   | position             |    0.0140 |              0.0111 |    0.0030 |
| dir_16   | time-since high/low  |    0.0140 |              0.0246 |   -0.0106 |
| dir_16   | zig-zag / confluence |    0.0140 |              0.0245 |   -0.0105 |
| dir_16   | variability          |    0.0140 |              0.0135 |    0.0006 |
| dir_16   | divergence           |    0.0140 |              0.0121 |    0.0019 |
| vol_8    | momentum             |    0.3633 |              0.3587 |    0.0046 |
| vol_8    | curvature            |    0.3633 |              0.3423 |    0.0210 |
| vol_8    | position             |    0.3633 |              0.3611 |    0.0021 |
| vol_8    | time-since high/low  |    0.3633 |              0.3600 |    0.0033 |
| vol_8    | zig-zag / confluence |    0.3633 |              0.3630 |    0.0002 |
| vol_8    | variability          |    0.3633 |              0.3623 |    0.0010 |
| vol_8    | divergence           |    0.3633 |              0.3502 |    0.0131 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 708 |      0.0267 |    0.5000 |    0.0217 |  -0.1186 |   0.1698 |
| dir_16   | M1 (with line)   | 708 |      0.0267 |    1.0000 |    0.0167 |  -0.1236 |   0.1648 |
| dir_16   | M1 (with line)   | 708 |      0.0267 |    2.0000 |    0.0067 |  -0.1336 |   0.1548 |
| dir_16   | M0 (Nasdaq only) | 712 |     -0.0829 |    0.5000 |   -0.0879 |  -0.2066 |   0.0250 |
| dir_16   | M0 (Nasdaq only) | 712 |     -0.0829 |    1.0000 |   -0.0929 |  -0.2116 |   0.0200 |
| dir_16   | M0 (Nasdaq only) | 712 |     -0.0829 |    2.0000 |   -0.1029 |  -0.2216 |   0.0100 |
| dir_8    | M1 (with line)   | 723 |      0.0326 |    0.5000 |    0.0276 |  -0.0444 |   0.1104 |
| dir_8    | M1 (with line)   | 723 |      0.0326 |    1.0000 |    0.0226 |  -0.0494 |   0.1054 |
| dir_8    | M1 (with line)   | 723 |      0.0326 |    2.0000 |    0.0126 |  -0.0594 |   0.0954 |
| dir_8    | M0 (Nasdaq only) | 724 |     -0.0262 |    0.5000 |   -0.0312 |  -0.0976 |   0.0436 |
| dir_8    | M0 (Nasdaq only) | 724 |     -0.0262 |    1.0000 |   -0.0362 |  -0.1026 |   0.0386 |
| dir_8    | M0 (Nasdaq only) | 724 |     -0.0262 |    2.0000 |   -0.0462 |  -0.1126 |   0.0286 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.