# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    190 | -0.0223 | -0.0065 |    0.0158 | -0.0146 |  0.0450 | 0.5115879046284364  |   0.5007 |   0.1305 |
| dir_8    | OOS     |    162 | -0.0412 | -0.0579 |   -0.0168 | -0.0512 |  0.0152 | 0.5065368416487082  |   0.4954 |   0.8255 |
| dir_8    | VAL+OOS |    352 | -0.0310 | -0.0302 |    0.0008 | -0.0224 |  0.0246 | 0.5091284733380969  |   0.4979 |   0.4735 |
| dir_16   | VAL     |    190 | -0.0790 | -0.0463 |    0.0327 | -0.0162 |  0.0809 | 0.49102850785817537 |   0.4849 |   0.1040 |
| dir_16   | OOS     |    162 | -0.0208 | -0.0532 |   -0.0325 | -0.0746 |  0.0096 | 0.5067782444007561  |   0.5014 |   0.9360 |
| dir_16   | VAL+OOS |    352 | -0.0522 | -0.0495 |    0.0027 | -0.0295 |  0.0349 | 0.4980464752852124  |   0.4912 |   0.4560 |
| dir_32   | VAL     |    190 | -0.1289 | -0.0626 |    0.0663 | -0.0035 |  0.1328 | 0.4882058092892958  |   0.4776 |   0.0310 |
| dir_32   | OOS     |    162 | -0.0326 | -0.0270 |    0.0055 | -0.0608 |  0.0696 | 0.5158705762712492  |   0.5162 |   0.4460 |
| dir_32   | VAL+OOS |    352 | -0.0846 | -0.0462 |    0.0383 | -0.0110 |  0.0847 | 0.5008432259807121  |   0.4932 |   0.0575 |
| vol_8    | VAL     |    190 |  0.2783 |  0.2776 |   -0.0007 | -0.0061 |  0.0045 | (nan, nan)          |   0.8650 |   0.6195 |
| vol_8    | OOS     |    162 |  0.2457 |  0.2478 |    0.0021 | -0.0045 |  0.0091 | (nan, nan)          |   0.7510 |   0.2845 |
| vol_8    | VAL+OOS |    352 |  0.2633 |  0.2639 |    0.0006 | -0.0036 |  0.0048 | (nan, nan)          |   0.8131 |   0.4045 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0008 |       nan      |      nan      | net lower bound at 1.0 bp: -0.1370%     | False         |
| dir_16   | False                       | False             |              0.0027 |         0.0180 |        0.0439 | net lower bound at 1.0 bp: -0.2041%     | False         |
| dir_32   | False                       |                   |              0.0383 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | False             |              0.0006 |        -0.0014 |        0.0022 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |   -0.0532 |             -0.0330 |   -0.0202 |
| dir_16   | curvature            |   -0.0532 |             -0.0548 |    0.0016 |
| dir_16   | position             |   -0.0532 |             -0.0664 |    0.0132 |
| dir_16   | time-since high/low  |   -0.0532 |             -0.0182 |   -0.0351 |
| dir_16   | zig-zag / confluence |   -0.0532 |             -0.0572 |    0.0039 |
| dir_16   | variability          |   -0.0532 |             -0.0427 |   -0.0106 |
| dir_16   | divergence           |   -0.0532 |             -0.0510 |   -0.0023 |
| vol_8    | momentum             |    0.2478 |              0.2476 |    0.0003 |
| vol_8    | curvature            |    0.2478 |              0.2461 |    0.0017 |
| vol_8    | position             |    0.2478 |              0.2474 |    0.0004 |
| vol_8    | time-since high/low  |    0.2478 |              0.2453 |    0.0025 |
| vol_8    | zig-zag / confluence |    0.2478 |              0.2456 |    0.0023 |
| vol_8    | variability          |    0.2478 |              0.2501 |   -0.0022 |
| vol_8    | divergence           |    0.2478 |              0.2375 |    0.0104 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 540 |     -0.0609 |    0.5000 |   -0.0659 |  -0.1991 |   0.0599 |
| dir_16   | M1 (with line)   | 540 |     -0.0609 |    1.0000 |   -0.0709 |  -0.2041 |   0.0549 |
| dir_16   | M1 (with line)   | 540 |     -0.0609 |    2.0000 |   -0.0809 |  -0.2141 |   0.0449 |
| dir_16   | M0 (Nasdaq only) | 539 |      0.0331 |    0.5000 |    0.0281 |  -0.0919 |   0.1609 |
| dir_16   | M0 (Nasdaq only) | 539 |      0.0331 |    1.0000 |    0.0231 |  -0.0969 |   0.1559 |
| dir_16   | M0 (Nasdaq only) | 539 |      0.0331 |    2.0000 |    0.0131 |  -0.1069 |   0.1459 |
| dir_8    | M1 (with line)   | 595 |     -0.0502 |    0.5000 |   -0.0552 |  -0.1320 |   0.0190 |
| dir_8    | M1 (with line)   | 595 |     -0.0502 |    1.0000 |   -0.0602 |  -0.1370 |   0.0140 |
| dir_8    | M1 (with line)   | 595 |     -0.0502 |    2.0000 |   -0.0702 |  -0.1470 |   0.0040 |
| dir_8    | M0 (Nasdaq only) | 595 |     -0.0187 |    0.5000 |   -0.0237 |  -0.1109 |   0.0754 |
| dir_8    | M0 (Nasdaq only) | 595 |     -0.0187 |    1.0000 |   -0.0287 |  -0.1159 |   0.0704 |
| dir_8    | M0 (Nasdaq only) | 595 |     -0.0187 |    2.0000 |   -0.0387 |  -0.1259 |   0.0604 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.