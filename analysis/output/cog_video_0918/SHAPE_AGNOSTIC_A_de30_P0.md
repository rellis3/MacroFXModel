# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    190 | -0.0223 | -0.0279 |   -0.0056 | -0.0403 |  0.0272 | 0.5115879046284364  |   0.5012 |   0.6365 |
| dir_8    | OOS     |    162 | -0.0412 | -0.0458 |   -0.0047 | -0.0389 |  0.0314 | 0.5065368416487082  |   0.4960 |   0.5990 |
| dir_8    | VAL+OOS |    352 | -0.0310 | -0.0361 |   -0.0052 | -0.0290 |  0.0206 | 0.5091284733380969  |   0.4988 |   0.6665 |
| dir_16   | VAL     |    190 | -0.0790 | -0.0878 |   -0.0088 | -0.0534 |  0.0352 | 0.49102850785817537 |   0.4959 |   0.6620 |
| dir_16   | OOS     |    162 | -0.0208 | -0.0616 |   -0.0408 | -0.0907 |  0.0086 | 0.5067782444007561  |   0.4946 |   0.9495 |
| dir_16   | VAL+OOS |    352 | -0.0522 | -0.0758 |   -0.0236 | -0.0577 |  0.0073 | 0.4980464752852124  |   0.4939 |   0.9275 |
| dir_32   | VAL     |    190 | -0.1289 | -0.0753 |    0.0536 | -0.0066 |  0.1161 | 0.4882058092892958  |   0.4772 |   0.0385 |
| dir_32   | OOS     |    162 | -0.0326 | -0.0125 |    0.0201 | -0.0489 |  0.0953 | 0.5158705762712492  |   0.5238 |   0.2755 |
| dir_32   | VAL+OOS |    352 | -0.0846 | -0.0464 |    0.0382 | -0.0109 |  0.0823 | 0.5008432259807121  |   0.4995 |   0.0630 |
| vol_8    | VAL     |    190 |  0.2783 |  0.2942 |    0.0160 |  0.0088 |  0.0233 | (nan, nan)          |   0.8754 |   0.0000 |
| vol_8    | OOS     |    162 |  0.2457 |  0.2537 |    0.0080 | -0.0026 |  0.0193 | (nan, nan)          |   0.7586 |   0.0715 |
| vol_8    | VAL+OOS |    352 |  0.2633 |  0.2756 |    0.0123 |  0.0060 |  0.0193 | (nan, nan)          |   0.8223 |   0.0000 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |             -0.0052 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0972%     | False         |
| dir_16   | False                       | False             |             -0.0236 |         0.0081 |        0.0336 | net lower bound at 1.0 bp: -0.1610%     | False         |
| dir_32   | False                       |                   |              0.0382 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | True              |              0.0123 |         0.0017 |        0.0075 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |   -0.0616 |             -0.0462 |   -0.0154 |
| dir_16   | curvature            |   -0.0616 |             -0.0628 |    0.0012 |
| dir_16   | position             |   -0.0616 |             -0.0618 |    0.0002 |
| dir_16   | time-since high/low  |   -0.0616 |             -0.0592 |   -0.0023 |
| dir_16   | zig-zag / confluence |   -0.0616 |             -0.0563 |   -0.0052 |
| dir_16   | variability          |   -0.0616 |             -0.0567 |   -0.0049 |
| dir_16   | divergence           |   -0.0616 |             -0.0608 |   -0.0008 |
| vol_8    | momentum             |    0.2537 |              0.2441 |    0.0096 |
| vol_8    | curvature            |    0.2537 |              0.2440 |    0.0097 |
| vol_8    | position             |    0.2537 |              0.2543 |   -0.0006 |
| vol_8    | time-since high/low  |    0.2537 |              0.2256 |    0.0282 |
| vol_8    | zig-zag / confluence |    0.2537 |              0.2540 |   -0.0003 |
| vol_8    | variability          |    0.2537 |              0.2561 |   -0.0024 |
| vol_8    | divergence           |    0.2537 |              0.2506 |    0.0032 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 541 |     -0.0487 |    0.5000 |   -0.0537 |  -0.1560 |   0.0461 |
| dir_16   | M1 (with line)   | 541 |     -0.0487 |    1.0000 |   -0.0587 |  -0.1610 |   0.0411 |
| dir_16   | M1 (with line)   | 541 |     -0.0487 |    2.0000 |   -0.0687 |  -0.1710 |   0.0311 |
| dir_16   | M0 (Nasdaq only) | 539 |      0.0331 |    0.5000 |    0.0281 |  -0.0900 |   0.1671 |
| dir_16   | M0 (Nasdaq only) | 539 |      0.0331 |    1.0000 |    0.0231 |  -0.0950 |   0.1621 |
| dir_16   | M0 (Nasdaq only) | 539 |      0.0331 |    2.0000 |    0.0131 |  -0.1050 |   0.1521 |
| dir_8    | M1 (with line)   | 596 |     -0.0182 |    0.5000 |   -0.0232 |  -0.0922 |   0.0487 |
| dir_8    | M1 (with line)   | 596 |     -0.0182 |    1.0000 |   -0.0282 |  -0.0972 |   0.0437 |
| dir_8    | M1 (with line)   | 596 |     -0.0182 |    2.0000 |   -0.0382 |  -0.1072 |   0.0337 |
| dir_8    | M0 (Nasdaq only) | 595 |     -0.0187 |    0.5000 |   -0.0237 |  -0.1078 |   0.0711 |
| dir_8    | M0 (Nasdaq only) | 595 |     -0.0187 |    1.0000 |   -0.0287 |  -0.1128 |   0.0661 |
| dir_8    | M0 (Nasdaq only) | 595 |     -0.0187 |    2.0000 |   -0.0387 |  -0.1228 |   0.0561 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.