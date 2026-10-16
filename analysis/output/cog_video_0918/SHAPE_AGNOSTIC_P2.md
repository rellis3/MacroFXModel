# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **statistical signal without economic significance: context only, no trade (dir_16)**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 60.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |    ci_lo |    ci_hi | AUC_M0              |   AUC_M1 |
|:---------|:--------|-------:|--------:|--------:|----------:|---------:|---------:|:--------------------|---------:|
| dir_8    | VAL     |    195 | -0.0187 |  0.0253 |    0.0440 |   0.0077 |   0.0814 | 0.5001498311513142  |   0.5057 |
| dir_8    | OOS     |    194 | -0.0525 |  0.0246 |  nan      | nan      | nan      | 0.4751019846569853  |   0.4935 |
| dir_8    | VAL+OOS |    389 | -0.0356 |  0.0250 |  nan      | nan      | nan      | 0.48816115328450604 |   0.5008 |
| dir_16   | VAL     |    194 | -0.0244 |  0.0470 |    0.0714 |   0.0250 |   0.1168 | 0.49789332118304286 |   0.5081 |
| dir_16   | OOS     |    194 | -0.0152 |  0.0386 |    0.0538 |   0.0104 |   0.0979 | 0.4827072586312984  |   0.4883 |
| dir_16   | VAL+OOS |    388 | -0.0198 |  0.0428 |    0.0626 |   0.0314 |   0.0962 | 0.4896058670558554  |   0.4991 |
| dir_32   | VAL     |    194 |  0.0845 |  0.0609 |  nan      | nan      | nan      | 0.5124967278887158  |   0.5195 |
| dir_32   | OOS     |    194 |  0.1106 |  0.1184 |    0.0078 |  -0.0414 |   0.0547 | 0.5006355720928182  |   0.5053 |
| dir_32   | VAL+OOS |    388 |  0.0976 |  0.0897 |  nan      | nan      | nan      | 0.5065028580389823  |   0.5133 |
| vol_8    | VAL     |    195 |  0.2979 |  0.3089 |    0.0110 |   0.0024 |   0.0195 | (nan, nan)          |   0.8926 |
| vol_8    | OOS     |    195 |  0.2267 |  0.2336 |    0.0069 |  -0.0017 |   0.0151 | (nan, nan)          |   0.8242 |
| vol_8    | VAL+OOS |    390 |  0.2623 |  0.2712 |    0.0089 |   0.0033 |   0.0147 | (nan, nan)          |   0.8623 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: -0.0332%     | False         |
| dir_16   | True                        | True              |              0.0626 |         0.0279 |        0.0536 | net lower bound at 1.0 bp: -0.1951%     | False         |
| dir_32   | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | False             |              0.0089 |         0.0050 |        0.0109 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0386 |              0.0257 |    0.0129 |
| dir_16   | curvature            |    0.0386 |              0.0371 |    0.0015 |
| dir_16   | position             |    0.0386 |              0.0400 |   -0.0014 |
| dir_16   | time-since high/low  |    0.0386 |              0.0534 |   -0.0148 |
| dir_16   | zig-zag / confluence |    0.0386 |              0.0258 |    0.0128 |
| dir_16   | variability          |    0.0386 |              0.0245 |    0.0141 |
| dir_16   | divergence           |    0.0386 |              0.0409 |   -0.0023 |
| vol_8    | momentum             |    0.2336 |              0.2323 |    0.0013 |
| vol_8    | curvature            |    0.2336 |              0.2195 |    0.0141 |
| vol_8    | position             |    0.2336 |              0.2334 |    0.0002 |
| vol_8    | time-since high/low  |    0.2336 |              0.2321 |    0.0015 |
| vol_8    | zig-zag / confluence |    0.2336 |              0.2343 |   -0.0006 |
| vol_8    | variability          |    0.2336 |              0.2339 |   -0.0003 |
| vol_8    | divergence           |    0.2336 |              0.2253 |    0.0084 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 837 |     -0.0581 |    0.5000 |   -0.0631 |  -0.1901 |   0.0428 |
| dir_16   | M1 (with line)   | 837 |     -0.0581 |    1.0000 |   -0.0681 |  -0.1951 |   0.0378 |
| dir_16   | M1 (with line)   | 837 |     -0.0581 |    2.0000 |   -0.0781 |  -0.2051 |   0.0278 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    0.5000 |   -0.0533 |  -0.1241 |   0.0128 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    1.0000 |   -0.0583 |  -0.1291 |   0.0078 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    2.0000 |   -0.0683 |  -0.1391 |  -0.0022 |
| dir_8    | M1 (with line)   | 854 |      0.0338 |    0.5000 |    0.0288 |  -0.0282 |   0.0965 |
| dir_8    | M1 (with line)   | 854 |      0.0338 |    1.0000 |    0.0238 |  -0.0332 |   0.0915 |
| dir_8    | M1 (with line)   | 854 |      0.0338 |    2.0000 |    0.0138 |  -0.0432 |   0.0815 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    0.5000 |    0.0113 |  -0.0407 |   0.0705 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    1.0000 |    0.0063 |  -0.0457 |   0.0655 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    2.0000 |   -0.0037 |  -0.0557 |   0.0555 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.