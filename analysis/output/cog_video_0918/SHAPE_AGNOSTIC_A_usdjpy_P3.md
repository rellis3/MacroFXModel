# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **a repeatable shape exists (see importance table for which)**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0             |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:-------------------|---------:|---------:|
| dir_8    | VAL     |    196 | -0.0261 | -0.0072 |    0.0189 | -0.0061 |  0.0448 | 0.4946101761608688 |   0.4926 |   0.0665 |
| dir_8    | OOS     |    165 | -0.0576 | -0.0382 |    0.0193 | -0.0104 |  0.0494 | 0.4911396741783689 |   0.4852 |   0.0965 |
| dir_8    | VAL+OOS |    361 | -0.0405 | -0.0214 |    0.0191 |  0.0008 |  0.0384 | 0.4936293166499581 |   0.4905 |   0.0225 |
| dir_16   | VAL     |    196 |  0.0234 |  0.0259 |    0.0025 | -0.0315 |  0.0374 | 0.5162978795597263 |   0.5058 |   0.4220 |
| dir_16   | OOS     |    165 | -0.0581 | -0.0256 |    0.0325 | -0.0115 |  0.0751 | 0.4944886781591863 |   0.4935 |   0.0740 |
| dir_16   | VAL+OOS |    361 | -0.0139 |  0.0023 |    0.0162 | -0.0104 |  0.0448 | 0.5084517372769863 |   0.5040 |   0.1100 |
| dir_32   | VAL     |    196 |  0.1106 |  0.0725 |   -0.0381 | -0.0829 |  0.0076 | 0.508079404578244  |   0.5165 |   0.9505 |
| dir_32   | OOS     |    165 |  0.0154 |  0.0013 |   -0.0141 | -0.0572 |  0.0287 | 0.5235035207325252 |   0.5040 |   0.7280 |
| dir_32   | VAL+OOS |    361 |  0.0671 |  0.0400 |   -0.0271 | -0.0588 |  0.0035 | 0.5177977977499132 |   0.5152 |   0.9590 |
| vol_8    | VAL     |    196 |  0.1588 |  0.1698 |    0.0110 |  0.0036 |  0.0186 | (nan, nan)         |   0.6800 |   0.0015 |
| vol_8    | OOS     |    165 |  0.1847 |  0.1933 |    0.0086 |  0.0014 |  0.0156 | (nan, nan)         |   0.8510 |   0.0090 |
| vol_8    | VAL+OOS |    361 |  0.1707 |  0.1806 |    0.0099 |  0.0046 |  0.0153 | (nan, nan)         |   0.7534 |   0.0000 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0191 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0440%     | False         |
| dir_16   | False                       | False             |              0.0162 |         0.0092 |        0.0266 | net lower bound at 1.0 bp: -0.0427%     | False         |
| dir_32   | False                       |                   |             -0.0271 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | True                        | True              |              0.0099 |         0.0011 |        0.0062 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |   -0.0256 |             -0.0355 |    0.0099 |
| dir_16   | curvature            |   -0.0256 |             -0.0408 |    0.0151 |
| dir_16   | position             |   -0.0256 |             -0.0249 |   -0.0008 |
| dir_16   | time-since high/low  |   -0.0256 |             -0.0147 |   -0.0110 |
| dir_16   | zig-zag / confluence |   -0.0256 |             -0.0344 |    0.0088 |
| dir_16   | variability          |   -0.0256 |             -0.0228 |   -0.0028 |
| dir_16   | divergence           |   -0.0256 |             -0.0184 |   -0.0073 |
| vol_8    | momentum             |    0.1933 |              0.1942 |   -0.0009 |
| vol_8    | curvature            |    0.1933 |              0.1815 |    0.0118 |
| vol_8    | position             |    0.1933 |              0.1932 |    0.0001 |
| vol_8    | time-since high/low  |    0.1933 |              0.1914 |    0.0019 |
| vol_8    | zig-zag / confluence |    0.1933 |              0.1918 |    0.0015 |
| vol_8    | variability          |    0.1933 |              0.1926 |    0.0007 |
| vol_8    | divergence           |    0.1933 |              0.1929 |    0.0004 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 766 |      0.0285 |    0.5000 |    0.0235 |  -0.0377 |   0.0885 |
| dir_16   | M1 (with line)   | 766 |      0.0285 |    1.0000 |    0.0185 |  -0.0427 |   0.0835 |
| dir_16   | M1 (with line)   | 766 |      0.0285 |    2.0000 |    0.0085 |  -0.0527 |   0.0735 |
| dir_16   | M0 (Nasdaq only) | 770 |      0.0215 |    0.5000 |    0.0165 |  -0.0166 |   0.0503 |
| dir_16   | M0 (Nasdaq only) | 770 |      0.0215 |    1.0000 |    0.0115 |  -0.0216 |   0.0453 |
| dir_16   | M0 (Nasdaq only) | 770 |      0.0215 |    2.0000 |    0.0015 |  -0.0316 |   0.0353 |
| dir_8    | M1 (with line)   | 780 |      0.0009 |    0.5000 |   -0.0041 |  -0.0390 |   0.0326 |
| dir_8    | M1 (with line)   | 780 |      0.0009 |    1.0000 |   -0.0091 |  -0.0440 |   0.0276 |
| dir_8    | M1 (with line)   | 780 |      0.0009 |    2.0000 |   -0.0191 |  -0.0540 |   0.0176 |
| dir_8    | M0 (Nasdaq only) | 779 |      0.0098 |    0.5000 |    0.0048 |  -0.0339 |   0.0456 |
| dir_8    | M0 (Nasdaq only) | 779 |      0.0098 |    1.0000 |   -0.0002 |  -0.0389 |   0.0406 |
| dir_8    | M0 (Nasdaq only) | 779 |      0.0098 |    2.0000 |   -0.0102 |  -0.0489 |   0.0306 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.