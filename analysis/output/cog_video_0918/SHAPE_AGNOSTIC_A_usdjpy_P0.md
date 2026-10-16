# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0             |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:-------------------|---------:|---------:|
| dir_8    | VAL     |    196 | -0.0261 | -0.0198 |    0.0063 | -0.0187 |  0.0307 | 0.4946101761608688 |   0.5007 |   0.3035 |
| dir_8    | OOS     |    165 | -0.0576 | -0.0212 |    0.0364 |  0.0053 |  0.0663 | 0.4911396741783689 |   0.4906 |   0.0100 |
| dir_8    | VAL+OOS |    361 | -0.0405 | -0.0204 |    0.0201 |  0.0006 |  0.0393 | 0.4936293166499581 |   0.4974 |   0.0215 |
| dir_16   | VAL     |    196 |  0.0234 | -0.0088 |   -0.0322 | -0.0717 |  0.0057 | 0.5162978795597263 |   0.4972 |   0.9480 |
| dir_16   | OOS     |    165 | -0.0581 | -0.0328 |    0.0254 | -0.0143 |  0.0676 | 0.4944886781591863 |   0.4966 |   0.1175 |
| dir_16   | VAL+OOS |    361 | -0.0139 | -0.0198 |   -0.0059 | -0.0351 |  0.0244 | 0.5084517372769863 |   0.4985 |   0.6565 |
| dir_32   | VAL     |    196 |  0.1106 |  0.0427 |   -0.0679 | -0.1155 | -0.0175 | 0.508079404578244  |   0.5061 |   0.9940 |
| dir_32   | OOS     |    165 |  0.0154 |  0.0278 |    0.0124 | -0.0357 |  0.0604 | 0.5235035207325252 |   0.5058 |   0.2975 |
| dir_32   | VAL+OOS |    361 |  0.0671 |  0.0359 |   -0.0312 | -0.0675 |  0.0028 | 0.5177977977499132 |   0.5071 |   0.9645 |
| vol_8    | VAL     |    196 |  0.1588 |  0.1668 |    0.0080 | -0.0004 |  0.0164 | (nan, nan)         |   0.6596 |   0.0335 |
| vol_8    | OOS     |    165 |  0.1847 |  0.1896 |    0.0048 | -0.0036 |  0.0132 | (nan, nan)         |   0.8583 |   0.1490 |
| vol_8    | VAL+OOS |    361 |  0.1707 |  0.1772 |    0.0065 |  0.0005 |  0.0121 | (nan, nan)         |   0.7479 |   0.0165 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0201 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0348%     | False         |
| dir_16   | False                       | False             |             -0.0059 |         0.0031 |        0.0172 | net lower bound at 1.0 bp: -0.0555%     | False         |
| dir_32   | False                       |                   |             -0.0312 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | False             |              0.0065 |         0.0019 |        0.0098 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |   -0.0328 |             -0.0254 |   -0.0074 |
| dir_16   | curvature            |   -0.0328 |             -0.0403 |    0.0076 |
| dir_16   | position             |   -0.0328 |             -0.0235 |   -0.0093 |
| dir_16   | time-since high/low  |   -0.0328 |             -0.0230 |   -0.0098 |
| dir_16   | zig-zag / confluence |   -0.0328 |             -0.0411 |    0.0083 |
| dir_16   | variability          |   -0.0328 |             -0.0280 |   -0.0047 |
| dir_16   | divergence           |   -0.0328 |             -0.0347 |    0.0020 |
| vol_8    | momentum             |    0.1896 |              0.1873 |    0.0023 |
| vol_8    | curvature            |    0.1896 |              0.1769 |    0.0127 |
| vol_8    | position             |    0.1896 |              0.1888 |    0.0007 |
| vol_8    | time-since high/low  |    0.1896 |              0.1895 |    0.0000 |
| vol_8    | zig-zag / confluence |    0.1896 |              0.1894 |    0.0001 |
| vol_8    | variability          |    0.1896 |              0.1896 |   -0.0000 |
| vol_8    | divergence           |    0.1896 |              0.1904 |   -0.0009 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 766 |     -0.0041 |    0.5000 |   -0.0091 |  -0.0505 |   0.0367 |
| dir_16   | M1 (with line)   | 766 |     -0.0041 |    1.0000 |   -0.0141 |  -0.0555 |   0.0317 |
| dir_16   | M1 (with line)   | 766 |     -0.0041 |    2.0000 |   -0.0241 |  -0.0655 |   0.0217 |
| dir_16   | M0 (Nasdaq only) | 770 |      0.0215 |    0.5000 |    0.0165 |  -0.0163 |   0.0490 |
| dir_16   | M0 (Nasdaq only) | 770 |      0.0215 |    1.0000 |    0.0115 |  -0.0213 |   0.0440 |
| dir_16   | M0 (Nasdaq only) | 770 |      0.0215 |    2.0000 |    0.0015 |  -0.0313 |   0.0340 |
| dir_8    | M1 (with line)   | 779 |      0.0087 |    0.5000 |    0.0037 |  -0.0298 |   0.0402 |
| dir_8    | M1 (with line)   | 779 |      0.0087 |    1.0000 |   -0.0013 |  -0.0348 |   0.0352 |
| dir_8    | M1 (with line)   | 779 |      0.0087 |    2.0000 |   -0.0113 |  -0.0448 |   0.0252 |
| dir_8    | M0 (Nasdaq only) | 779 |      0.0098 |    0.5000 |    0.0048 |  -0.0324 |   0.0433 |
| dir_8    | M0 (Nasdaq only) | 779 |      0.0098 |    1.0000 |   -0.0002 |  -0.0374 |   0.0383 |
| dir_8    | M0 (Nasdaq only) | 779 |      0.0098 |    2.0000 |   -0.0102 |  -0.0474 |   0.0283 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.