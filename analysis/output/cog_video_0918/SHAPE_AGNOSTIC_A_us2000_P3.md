# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **a repeatable shape exists (see importance table for which)**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|--------:|--------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    195 |  0.0212 |  0.0573 |    0.0361 |  0.0011 |  0.0735 | 0.4922031794108627  |   0.5074 |   0.0230 |
| dir_8    | OOS     |    165 |  0.0159 |  0.0278 |    0.0119 | -0.0299 |  0.0537 | 0.49315435183259243 |   0.4969 |   0.2955 |
| dir_8    | VAL+OOS |    360 |  0.0187 |  0.0438 |    0.0250 | -0.0026 |  0.0530 | 0.49249905007026074 |   0.5027 |   0.0375 |
| dir_16   | VAL     |    194 |  0.0117 |  0.0731 |    0.0615 |  0.0163 |  0.1083 | 0.4885993775116426  |   0.5048 |   0.0025 |
| dir_16   | OOS     |    165 |  0.0883 |  0.0438 |   -0.0445 | -0.0981 |  0.0071 | 0.5023239576768215  |   0.5099 |   0.9530 |
| dir_16   | VAL+OOS |    359 |  0.0469 |  0.0596 |    0.0127 | -0.0226 |  0.0490 | 0.4951362182336675  |   0.5068 |   0.2480 |
| dir_32   | VAL     |    194 |  0.0397 |  0.0375 |   -0.0022 | -0.0644 |  0.0621 | 0.5057200873603298  |   0.5049 |   0.5100 |
| dir_32   | OOS     |    165 |  0.1335 |  0.0303 |   -0.1031 | -0.1618 | -0.0434 | 0.52886237153209    |   0.5127 |   1.0000 |
| dir_32   | VAL+OOS |    359 |  0.0828 |  0.0342 |   -0.0486 | -0.0908 | -0.0055 | 0.5181213300816677  |   0.5094 |   0.9890 |
| vol_8    | VAL     |    195 |  0.3782 |  0.3849 |    0.0067 |  0.0019 |  0.0114 | (nan, nan)          |   0.8407 |   0.0030 |
| vol_8    | OOS     |    165 |  0.3556 |  0.3638 |    0.0083 |  0.0022 |  0.0141 | (nan, nan)          |   0.8438 |   0.0025 |
| vol_8    | VAL+OOS |    360 |  0.3678 |  0.3753 |    0.0074 |  0.0035 |  0.0114 | (nan, nan)          |   0.8419 |   0.0005 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0250 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0462%     | False         |
| dir_16   | False                       | True              |              0.0127 |        -0.0060 |        0.0066 | net lower bound at 1.0 bp: -0.0161%     | False         |
| dir_32   | False                       |                   |             -0.0486 |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | True                        | True              |              0.0074 |         0.0027 |        0.0056 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0438 |              0.0344 |    0.0094 |
| dir_16   | curvature            |    0.0438 |              0.0391 |    0.0047 |
| dir_16   | position             |    0.0438 |              0.0445 |   -0.0008 |
| dir_16   | time-since high/low  |    0.0438 |              0.0267 |    0.0171 |
| dir_16   | zig-zag / confluence |    0.0438 |              0.0335 |    0.0102 |
| dir_16   | variability          |    0.0438 |              0.0319 |    0.0118 |
| dir_16   | divergence           |    0.0438 |              0.0113 |    0.0325 |
| vol_8    | momentum             |    0.3638 |              0.3621 |    0.0017 |
| vol_8    | curvature            |    0.3638 |              0.3496 |    0.0143 |
| vol_8    | position             |    0.3638 |              0.3633 |    0.0005 |
| vol_8    | time-since high/low  |    0.3638 |              0.3625 |    0.0013 |
| vol_8    | zig-zag / confluence |    0.3638 |              0.3632 |    0.0007 |
| vol_8    | variability          |    0.3638 |              0.3630 |    0.0009 |
| vol_8    | divergence           |    0.3638 |              0.3539 |    0.0099 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 709 |      0.1223 |    0.5000 |    0.1173 |  -0.0111 |   0.2475 |
| dir_16   | M1 (with line)   | 709 |      0.1223 |    1.0000 |    0.1123 |  -0.0161 |   0.2425 |
| dir_16   | M1 (with line)   | 709 |      0.1223 |    2.0000 |    0.1023 |  -0.0261 |   0.2325 |
| dir_16   | M0 (Nasdaq only) | 712 |     -0.0829 |    0.5000 |   -0.0879 |  -0.2036 |   0.0321 |
| dir_16   | M0 (Nasdaq only) | 712 |     -0.0829 |    1.0000 |   -0.0929 |  -0.2086 |   0.0271 |
| dir_16   | M0 (Nasdaq only) | 712 |     -0.0829 |    2.0000 |   -0.1029 |  -0.2186 |   0.0171 |
| dir_8    | M1 (with line)   | 726 |      0.0474 |    0.5000 |    0.0424 |  -0.0412 |   0.1336 |
| dir_8    | M1 (with line)   | 726 |      0.0474 |    1.0000 |    0.0374 |  -0.0462 |   0.1286 |
| dir_8    | M1 (with line)   | 726 |      0.0474 |    2.0000 |    0.0274 |  -0.0562 |   0.1186 |
| dir_8    | M0 (Nasdaq only) | 724 |     -0.0262 |    0.5000 |   -0.0312 |  -0.0995 |   0.0459 |
| dir_8    | M0 (Nasdaq only) | 724 |     -0.0262 |    1.0000 |   -0.0362 |  -0.1045 |   0.0409 |
| dir_8    | M0 (Nasdaq only) | 724 |     -0.0262 |    2.0000 |   -0.0462 |  -0.1145 |   0.0309 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.