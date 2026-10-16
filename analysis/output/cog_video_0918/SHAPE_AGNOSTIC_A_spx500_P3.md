# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |    ci_lo |    ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|---------:|---------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    194 | -0.0198 | -0.0034 |  nan      | nan      | nan      | 0.4974780139029324  |   0.4909 |   0.0060 |
| dir_8    | OOS     |    165 | -0.0372 |  0.0430 |  nan      | nan      | nan      | 0.486257248284428   |   0.4965 |   0.0000 |
| dir_8    | VAL+OOS |    359 | -0.0278 |  0.0179 |  nan      | nan      | nan      | 0.4933347907418849  |   0.4929 |   0.0000 |
| dir_16   | VAL     |    194 |  0.0312 |  0.0284 |  nan      | nan      | nan      | 0.49102921580528974 |   0.4913 |   0.0015 |
| dir_16   | OOS     |    165 |  0.0506 |  0.0419 |   -0.0087 |  -0.0608 |   0.0476 | 0.49368666891949686 |   0.4895 |   0.6205 |
| dir_16   | VAL+OOS |    359 |  0.0402 |  0.0346 |  nan      | nan      | nan      | 0.493383630319167   |   0.4915 |   0.0015 |
| dir_32   | VAL     |    194 |  0.1374 |  0.1065 |  nan      | nan      | nan      | 0.5042316142802978  |   0.5078 |   0.3105 |
| dir_32   | OOS     |    165 |  0.1910 |  0.1286 |   -0.0624 |  -0.1273 |   0.0019 | 0.529834518628315   |   0.5271 |   0.9725 |
| dir_32   | VAL+OOS |    359 |  0.1621 |  0.1167 |  nan      | nan      | nan      | 0.5145991301206299  |   0.5151 |   0.3730 |
| vol_8    | VAL     |    195 |  0.2919 |  0.2951 |    0.0032 |  -0.0015 |   0.0078 | (nan, nan)          |   0.8844 |   0.0915 |
| vol_8    | OOS     |    165 |  0.2680 |  0.2784 |    0.0104 |   0.0055 |   0.0150 | (nan, nan)          |   0.8468 |   0.0000 |
| vol_8    | VAL+OOS |    360 |  0.2810 |  0.2875 |    0.0065 |   0.0031 |   0.0100 | (nan, nan)          |   0.8744 |   0.0000 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: -0.0130%     | False         |
| dir_16   | False                       | False             |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: -0.0484%     | False         |
| dir_32   | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | False             |              0.0065 |         0.0048 |        0.0121 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0419 |              0.0527 |   -0.0108 |
| dir_16   | curvature            |    0.0419 |              0.0388 |    0.0031 |
| dir_16   | position             |    0.0419 |              0.0479 |   -0.0060 |
| dir_16   | time-since high/low  |    0.0419 |              0.0320 |    0.0099 |
| dir_16   | zig-zag / confluence |    0.0419 |              0.0497 |   -0.0078 |
| dir_16   | variability          |    0.0419 |              0.0427 |   -0.0008 |
| dir_16   | divergence           |    0.0419 |              0.0315 |    0.0104 |
| vol_8    | momentum             |    0.2784 |              0.2769 |    0.0016 |
| vol_8    | curvature            |    0.2784 |              0.2682 |    0.0102 |
| vol_8    | position             |    0.2784 |              0.2785 |   -0.0001 |
| vol_8    | time-since high/low  |    0.2784 |              0.2771 |    0.0013 |
| vol_8    | zig-zag / confluence |    0.2784 |              0.2777 |    0.0007 |
| vol_8    | variability          |    0.2784 |              0.2765 |    0.0019 |
| vol_8    | divergence           |    0.2784 |              0.2783 |    0.0001 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 724 |      0.0287 |    0.5000 |    0.0237 |  -0.0434 |   0.0950 |
| dir_16   | M1 (with line)   | 724 |      0.0287 |    1.0000 |    0.0187 |  -0.0484 |   0.0900 |
| dir_16   | M1 (with line)   | 724 |      0.0287 |    2.0000 |    0.0087 |  -0.0584 |   0.0800 |
| dir_16   | M0 (Nasdaq only) | 715 |     -0.0308 |    0.5000 |   -0.0358 |  -0.1045 |   0.0289 |
| dir_16   | M0 (Nasdaq only) | 715 |     -0.0308 |    1.0000 |   -0.0408 |  -0.1095 |   0.0239 |
| dir_16   | M0 (Nasdaq only) | 715 |     -0.0308 |    2.0000 |   -0.0508 |  -0.1195 |   0.0139 |
| dir_8    | M1 (with line)   | 728 |      0.0480 |    0.5000 |    0.0430 |  -0.0080 |   0.1042 |
| dir_8    | M1 (with line)   | 728 |      0.0480 |    1.0000 |    0.0380 |  -0.0130 |   0.0992 |
| dir_8    | M1 (with line)   | 728 |      0.0480 |    2.0000 |    0.0280 |  -0.0230 |   0.0892 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0051 |    0.5000 |    0.0001 |  -0.0526 |   0.0553 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0051 |    1.0000 |   -0.0049 |  -0.0576 |   0.0503 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0051 |    2.0000 |   -0.0149 |  -0.0676 |   0.0403 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.