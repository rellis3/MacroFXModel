# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0             |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:-------------------|---------:|---------:|
| dir_8    | VAL     |    196 | -0.0261 | -0.0223 |    0.0038 | -0.0201 |  0.0288 | 0.4946101761608688 |   0.4922 |   0.3905 |
| dir_8    | OOS     |    165 | -0.0576 | -0.0669 |   -0.0093 | -0.0343 |  0.0173 | 0.4911396741783689 |   0.4924 |   0.7380 |
| dir_8    | VAL+OOS |    361 | -0.0405 | -0.0427 |   -0.0022 | -0.0193 |  0.0161 | 0.4936293166499581 |   0.4943 |   0.6070 |
| dir_16   | VAL     |    196 |  0.0234 | -0.0012 |   -0.0246 | -0.0596 |  0.0087 | 0.5162978795597263 |   0.4975 |   0.9215 |
| dir_16   | OOS     |    165 | -0.0581 | -0.0342 |    0.0239 | -0.0156 |  0.0629 | 0.4944886781591863 |   0.4916 |   0.1175 |
| dir_16   | VAL+OOS |    361 | -0.0139 | -0.0163 |   -0.0024 | -0.0278 |  0.0248 | 0.5084517372769863 |   0.4980 |   0.5700 |
| dir_32   | VAL     |    196 |  0.1106 |  0.0589 |   -0.0517 | -0.1082 |  0.0023 | 0.508079404578244  |   0.4853 |   0.9690 |
| dir_32   | OOS     |    165 |  0.0154 | -0.0236 |   -0.0390 | -0.0909 |  0.0118 | 0.5235035207325252 |   0.4970 |   0.9315 |
| dir_32   | VAL+OOS |    361 |  0.0671 |  0.0212 |   -0.0459 | -0.0836 | -0.0109 | 0.5177977977499132 |   0.4943 |   0.9935 |
| vol_8    | VAL     |    196 |  0.1588 |  0.1584 |   -0.0005 | -0.0061 |  0.0052 | (nan, nan)         |   0.6554 |   0.5605 |
| vol_8    | OOS     |    165 |  0.1847 |  0.1821 |   -0.0026 | -0.0101 |  0.0046 | (nan, nan)         |   0.8588 |   0.7580 |
| vol_8    | VAL+OOS |    361 |  0.1707 |  0.1692 |   -0.0015 | -0.0059 |  0.0030 | (nan, nan)         |   0.7451 |   0.7375 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |             -0.0022 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0606%     | False         |
| dir_16   | False                       | False             |             -0.0024 |         0.0031 |        0.0289 | net lower bound at 1.0 bp: -0.0702%     | False         |
| dir_32   | False                       |                   |             -0.0459 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | False             |             -0.0015 |        -0.0031 |        0.0019 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |   -0.0342 |             -0.0401 |    0.0059 |
| dir_16   | curvature            |   -0.0342 |             -0.0318 |   -0.0024 |
| dir_16   | position             |   -0.0342 |             -0.0400 |    0.0058 |
| dir_16   | time-since high/low  |   -0.0342 |             -0.0526 |    0.0184 |
| dir_16   | zig-zag / confluence |   -0.0342 |             -0.0345 |    0.0003 |
| dir_16   | variability          |   -0.0342 |             -0.0338 |   -0.0004 |
| dir_16   | divergence           |   -0.0342 |             -0.0338 |   -0.0004 |
| vol_8    | momentum             |    0.1821 |              0.1775 |    0.0046 |
| vol_8    | curvature            |    0.1821 |              0.1776 |    0.0045 |
| vol_8    | position             |    0.1821 |              0.1801 |    0.0020 |
| vol_8    | time-since high/low  |    0.1821 |              0.1816 |    0.0005 |
| vol_8    | zig-zag / confluence |    0.1821 |              0.1829 |   -0.0008 |
| vol_8    | variability          |    0.1821 |              0.1828 |   -0.0007 |
| vol_8    | divergence           |    0.1821 |              0.1819 |    0.0002 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 766 |     -0.0211 |    0.5000 |   -0.0261 |  -0.0652 |   0.0156 |
| dir_16   | M1 (with line)   | 766 |     -0.0211 |    1.0000 |   -0.0311 |  -0.0702 |   0.0106 |
| dir_16   | M1 (with line)   | 766 |     -0.0211 |    2.0000 |   -0.0411 |  -0.0802 |   0.0006 |
| dir_16   | M0 (Nasdaq only) | 770 |      0.0215 |    0.5000 |    0.0165 |  -0.0181 |   0.0505 |
| dir_16   | M0 (Nasdaq only) | 770 |      0.0215 |    1.0000 |    0.0115 |  -0.0231 |   0.0455 |
| dir_16   | M0 (Nasdaq only) | 770 |      0.0215 |    2.0000 |    0.0015 |  -0.0331 |   0.0355 |
| dir_8    | M1 (with line)   | 779 |     -0.0062 |    0.5000 |   -0.0112 |  -0.0556 |   0.0337 |
| dir_8    | M1 (with line)   | 779 |     -0.0062 |    1.0000 |   -0.0162 |  -0.0606 |   0.0287 |
| dir_8    | M1 (with line)   | 779 |     -0.0062 |    2.0000 |   -0.0262 |  -0.0706 |   0.0187 |
| dir_8    | M0 (Nasdaq only) | 779 |      0.0098 |    0.5000 |    0.0048 |  -0.0314 |   0.0415 |
| dir_8    | M0 (Nasdaq only) | 779 |      0.0098 |    1.0000 |   -0.0002 |  -0.0364 |   0.0365 |
| dir_8    | M0 (Nasdaq only) | 779 |      0.0098 |    2.0000 |   -0.0102 |  -0.0464 |   0.0265 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.