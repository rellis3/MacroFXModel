# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    190 | -0.0223 | -0.0112 |    0.0110 | -0.0281 |  0.0506 | 0.5115879046284364  |   0.5086 |   0.2875 |
| dir_8    | OOS     |    162 | -0.0412 | -0.0504 |   -0.0092 | -0.0476 |  0.0281 | 0.5065368416487082  |   0.4931 |   0.6775 |
| dir_8    | VAL+OOS |    352 | -0.0310 | -0.0293 |    0.0017 | -0.0263 |  0.0281 | 0.5091284733380969  |   0.5020 |   0.4525 |
| dir_16   | VAL     |    190 | -0.0790 | -0.0718 |    0.0072 | -0.0407 |  0.0588 | 0.49102850785817537 |   0.4850 |   0.3715 |
| dir_16   | OOS     |    162 | -0.0208 | -0.0500 |   -0.0292 | -0.0757 |  0.0171 | 0.5067782444007561  |   0.5038 |   0.8840 |
| dir_16   | VAL+OOS |    352 | -0.0522 | -0.0618 |   -0.0096 | -0.0436 |  0.0252 | 0.4980464752852124  |   0.4925 |   0.6855 |
| dir_32   | VAL     |    190 | -0.1289 | -0.0727 |    0.0561 | -0.0075 |  0.1205 | 0.4882058092892958  |   0.4635 |   0.0455 |
| dir_32   | OOS     |    162 | -0.0326 | -0.0308 |    0.0017 | -0.0566 |  0.0605 | 0.5158705762712492  |   0.5153 |   0.4765 |
| dir_32   | VAL+OOS |    352 | -0.0846 | -0.0535 |    0.0311 | -0.0142 |  0.0734 | 0.5008432259807121  |   0.4856 |   0.0860 |
| vol_8    | VAL     |    190 |  0.2783 |  0.2804 |    0.0022 | -0.0029 |  0.0077 | (nan, nan)          |   0.8575 |   0.2290 |
| vol_8    | OOS     |    162 |  0.2457 |  0.2492 |    0.0035 | -0.0031 |  0.0101 | (nan, nan)          |   0.7539 |   0.1500 |
| vol_8    | VAL+OOS |    352 |  0.2633 |  0.2661 |    0.0028 | -0.0014 |  0.0070 | (nan, nan)          |   0.8114 |   0.1050 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0017 |       nan      |      nan      | net lower bound at 1.0 bp: -0.1143%     | False         |
| dir_16   | False                       | False             |             -0.0096 |         0.0116 |        0.0361 | net lower bound at 1.0 bp: -0.1154%     | False         |
| dir_32   | False                       |                   |              0.0311 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | False             |              0.0028 |         0.0005 |        0.0044 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |   -0.0500 |             -0.0319 |   -0.0181 |
| dir_16   | curvature            |   -0.0500 |             -0.0503 |    0.0003 |
| dir_16   | position             |   -0.0500 |             -0.0338 |   -0.0162 |
| dir_16   | time-since high/low  |   -0.0500 |             -0.0399 |   -0.0101 |
| dir_16   | zig-zag / confluence |   -0.0500 |             -0.0444 |   -0.0056 |
| dir_16   | variability          |   -0.0500 |             -0.0449 |   -0.0051 |
| dir_16   | divergence           |   -0.0500 |             -0.0328 |   -0.0172 |
| vol_8    | momentum             |    0.2492 |              0.2492 |   -0.0000 |
| vol_8    | curvature            |    0.2492 |              0.2490 |    0.0002 |
| vol_8    | position             |    0.2492 |              0.2507 |   -0.0015 |
| vol_8    | time-since high/low  |    0.2492 |              0.2409 |    0.0083 |
| vol_8    | zig-zag / confluence |    0.2492 |              0.2497 |   -0.0004 |
| vol_8    | variability          |    0.2492 |              0.2484 |    0.0008 |
| vol_8    | divergence           |    0.2492 |              0.2494 |   -0.0002 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 539 |      0.0049 |    0.5000 |   -0.0001 |  -0.1104 |   0.1429 |
| dir_16   | M1 (with line)   | 539 |      0.0049 |    1.0000 |   -0.0051 |  -0.1154 |   0.1379 |
| dir_16   | M1 (with line)   | 539 |      0.0049 |    2.0000 |   -0.0151 |  -0.1254 |   0.1279 |
| dir_16   | M0 (Nasdaq only) | 539 |      0.0331 |    0.5000 |    0.0281 |  -0.0908 |   0.1619 |
| dir_16   | M0 (Nasdaq only) | 539 |      0.0331 |    1.0000 |    0.0231 |  -0.0958 |   0.1569 |
| dir_16   | M0 (Nasdaq only) | 539 |      0.0331 |    2.0000 |    0.0131 |  -0.1058 |   0.1469 |
| dir_8    | M1 (with line)   | 595 |     -0.0436 |    0.5000 |   -0.0486 |  -0.1093 |   0.0082 |
| dir_8    | M1 (with line)   | 595 |     -0.0436 |    1.0000 |   -0.0536 |  -0.1143 |   0.0032 |
| dir_8    | M1 (with line)   | 595 |     -0.0436 |    2.0000 |   -0.0636 |  -0.1243 |  -0.0068 |
| dir_8    | M0 (Nasdaq only) | 595 |     -0.0187 |    0.5000 |   -0.0237 |  -0.1090 |   0.0684 |
| dir_8    | M0 (Nasdaq only) | 595 |     -0.0187 |    1.0000 |   -0.0287 |  -0.1140 |   0.0634 |
| dir_8    | M0 (Nasdaq only) | 595 |     -0.0187 |    2.0000 |   -0.0387 |  -0.1240 |   0.0534 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.