# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **a repeatable shape exists (see importance table for which)**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    195 |  0.0115 |  0.0005 |   -0.0111 | -0.0433 |  0.0202 | 0.49972221585528875 |   0.5007 |   0.7550 |
| dir_8    | OOS     |    165 | -0.0113 |  0.0399 |    0.0512 |  0.0121 |  0.0903 | 0.48339384979764033 |   0.5243 |   0.0045 |
| dir_8    | VAL+OOS |    360 |  0.0011 |  0.0186 |    0.0175 | -0.0074 |  0.0434 | 0.4939955733841583  |   0.5131 |   0.0860 |
| dir_16   | VAL     |    194 |  0.0353 |  0.0825 |    0.0472 | -0.0004 |  0.0952 | 0.5045027142822011  |   0.5346 |   0.0275 |
| dir_16   | OOS     |    164 |  0.0671 |  0.0506 |   -0.0165 | -0.0652 |  0.0333 | 0.49224280782162555 |   0.5217 |   0.7330 |
| dir_16   | VAL+OOS |    358 |  0.0499 |  0.0679 |    0.0180 | -0.0175 |  0.0542 | 0.4983879876969521  |   0.5288 |   0.1655 |
| dir_32   | VAL     |    194 |  0.1303 |  0.0643 |   -0.0661 | -0.1319 | -0.0029 | 0.5099591646852384  |   0.5359 |   0.9825 |
| dir_32   | OOS     |    165 |  0.1633 |  0.0295 |   -0.1338 | -0.2046 | -0.0644 | 0.4982606372420747  |   0.5315 |   1.0000 |
| dir_32   | VAL+OOS |    359 |  0.1455 |  0.0483 |   -0.0972 | -0.1438 | -0.0512 | 0.5037315056258407  |   0.5337 |   1.0000 |
| vol_8    | VAL     |    195 |  0.3473 |  0.3539 |    0.0066 |  0.0003 |  0.0131 | (nan, nan)          |   0.8452 |   0.0225 |
| vol_8    | OOS     |    165 |  0.3424 |  0.3481 |    0.0057 |  0.0011 |  0.0101 | (nan, nan)          |   0.8283 |   0.0095 |
| vol_8    | VAL+OOS |    360 |  0.3451 |  0.3512 |    0.0062 |  0.0021 |  0.0101 | (nan, nan)          |   0.8356 |   0.0025 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0175 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0271%     | False         |
| dir_16   | False                       | False             |              0.0180 |        -0.0091 |        0.0070 | net lower bound at 1.0 bp: -0.1623%     | False         |
| dir_32   | False                       |                   |             -0.0972 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | True                        | True              |              0.0062 |         0.0000 |        0.0014 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0506 |              0.0405 |    0.0100 |
| dir_16   | curvature            |    0.0506 |              0.0275 |    0.0231 |
| dir_16   | position             |    0.0506 |              0.0395 |    0.0111 |
| dir_16   | time-since high/low  |    0.0506 |              0.0364 |    0.0142 |
| dir_16   | zig-zag / confluence |    0.0506 |              0.0493 |    0.0013 |
| dir_16   | variability          |    0.0506 |              0.0484 |    0.0021 |
| dir_16   | divergence           |    0.0506 |              0.0431 |    0.0075 |
| vol_8    | momentum             |    0.3481 |              0.3480 |    0.0001 |
| vol_8    | curvature            |    0.3481 |              0.3462 |    0.0020 |
| vol_8    | position             |    0.3481 |              0.3487 |   -0.0005 |
| vol_8    | time-since high/low  |    0.3481 |              0.3471 |    0.0010 |
| vol_8    | zig-zag / confluence |    0.3481 |              0.3487 |   -0.0005 |
| vol_8    | variability          |    0.3481 |              0.3448 |    0.0033 |
| vol_8    | divergence           |    0.3481 |              0.3479 |    0.0002 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 714 |     -0.0696 |    0.5000 |   -0.0746 |  -0.1573 |   0.0053 |
| dir_16   | M1 (with line)   | 714 |     -0.0696 |    1.0000 |   -0.0796 |  -0.1623 |   0.0003 |
| dir_16   | M1 (with line)   | 714 |     -0.0696 |    2.0000 |   -0.0896 |  -0.1723 |  -0.0097 |
| dir_16   | M0 (Nasdaq only) | 718 |     -0.0547 |    0.5000 |   -0.0597 |  -0.1426 |   0.0200 |
| dir_16   | M0 (Nasdaq only) | 718 |     -0.0547 |    1.0000 |   -0.0647 |  -0.1476 |   0.0150 |
| dir_16   | M0 (Nasdaq only) | 718 |     -0.0547 |    2.0000 |   -0.0747 |  -0.1576 |   0.0050 |
| dir_8    | M1 (with line)   | 728 |      0.0338 |    0.5000 |    0.0288 |  -0.0221 |   0.0760 |
| dir_8    | M1 (with line)   | 728 |      0.0338 |    1.0000 |    0.0238 |  -0.0271 |   0.0710 |
| dir_8    | M1 (with line)   | 728 |      0.0338 |    2.0000 |    0.0138 |  -0.0371 |   0.0610 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0195 |    0.5000 |    0.0145 |  -0.0235 |   0.0483 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0195 |    1.0000 |    0.0095 |  -0.0285 |   0.0433 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0195 |    2.0000 |   -0.0005 |  -0.0385 |   0.0333 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.