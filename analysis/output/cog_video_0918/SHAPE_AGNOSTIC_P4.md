# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **a repeatable shape exists (see importance table for which)**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 60.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |    ci_lo |    ci_hi | AUC_M0              |   AUC_M1 |
|:---------|:--------|-------:|--------:|--------:|----------:|---------:|---------:|:--------------------|---------:|
| dir_8    | VAL     |    195 | -0.0187 | -0.0075 |    0.0112 |  -0.0253 |   0.0489 | 0.5001498311513142  |   0.4976 |
| dir_8    | OOS     |    195 | -0.0533 |  0.0507 |    0.1041 |   0.0630 |   0.1451 | 0.4751019846569853  |   0.5025 |
| dir_8    | VAL+OOS |    390 | -0.0360 |  0.0216 |    0.0576 |   0.0312 |   0.0853 | 0.48816115328450604 |   0.5005 |
| dir_16   | VAL     |    194 | -0.0244 |  0.0411 |    0.0656 |   0.0205 |   0.1107 | 0.49789332118304286 |   0.4953 |
| dir_16   | OOS     |    194 | -0.0152 |  0.0703 |    0.0855 |   0.0448 |   0.1290 | 0.4827072586312984  |   0.4996 |
| dir_16   | VAL+OOS |    388 | -0.0198 |  0.0557 |    0.0755 |   0.0463 |   0.1054 | 0.4896058670558554  |   0.4979 |
| dir_32   | VAL     |    194 |  0.0845 |  0.1015 |  nan      | nan      | nan      | 0.5124967278887158  |   0.5196 |
| dir_32   | OOS     |    194 |  0.1106 |  0.1236 |    0.0130 |  -0.0387 |   0.0634 | 0.5006355720928182  |   0.5032 |
| dir_32   | VAL+OOS |    388 |  0.0976 |  0.1125 |  nan      | nan      | nan      | 0.5065028580389823  |   0.5127 |
| vol_8    | VAL     |    195 |  0.2979 |  0.3064 |    0.0085 |   0.0038 |   0.0137 | (nan, nan)          |   0.8915 |
| vol_8    | OOS     |    195 |  0.2267 |  0.2347 |    0.0079 |   0.0025 |   0.0132 | (nan, nan)          |   0.8355 |
| vol_8    | VAL+OOS |    390 |  0.2623 |  0.2705 |    0.0082 |   0.0046 |   0.0119 | (nan, nan)          |   0.8668 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |              0.0576 |       nan      |      nan      | net lower bound at 1.0 bp: -0.0659%     | False         |
| dir_16   | True                        | True              |              0.0755 |         0.0349 |        0.0699 | net lower bound at 1.0 bp: -0.1011%     | False         |
| dir_32   | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | True                        | True              |              0.0082 |         0.0025 |        0.0060 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0703 |              0.0767 |   -0.0064 |
| dir_16   | curvature            |    0.0703 |              0.0756 |   -0.0053 |
| dir_16   | position             |    0.0703 |              0.0704 |   -0.0001 |
| dir_16   | time-since high/low  |    0.0703 |              0.0625 |    0.0078 |
| dir_16   | zig-zag / confluence |    0.0703 |              0.0578 |    0.0125 |
| dir_16   | variability          |    0.0703 |              0.0502 |    0.0201 |
| dir_16   | divergence           |    0.0703 |              0.0310 |    0.0393 |
| vol_8    | momentum             |    0.2347 |              0.2350 |   -0.0004 |
| vol_8    | curvature            |    0.2347 |              0.2316 |    0.0030 |
| vol_8    | position             |    0.2347 |              0.2348 |   -0.0002 |
| vol_8    | time-since high/low  |    0.2347 |              0.2334 |    0.0013 |
| vol_8    | zig-zag / confluence |    0.2347 |              0.2345 |    0.0002 |
| vol_8    | variability          |    0.2347 |              0.2341 |    0.0006 |
| vol_8    | divergence           |    0.2347 |              0.2309 |    0.0038 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 835 |      0.0021 |    0.5000 |   -0.0029 |  -0.0961 |   0.0955 |
| dir_16   | M1 (with line)   | 835 |      0.0021 |    1.0000 |   -0.0079 |  -0.1011 |   0.0905 |
| dir_16   | M1 (with line)   | 835 |      0.0021 |    2.0000 |   -0.0179 |  -0.1111 |   0.0805 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    0.5000 |   -0.0533 |  -0.1218 |   0.0138 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    1.0000 |   -0.0583 |  -0.1268 |   0.0088 |
| dir_16   | M0 (Nasdaq only) | 835 |     -0.0483 |    2.0000 |   -0.0683 |  -0.1368 |  -0.0012 |
| dir_8    | M1 (with line)   | 852 |      0.0257 |    0.5000 |    0.0207 |  -0.0609 |   0.0984 |
| dir_8    | M1 (with line)   | 852 |      0.0257 |    1.0000 |    0.0157 |  -0.0659 |   0.0934 |
| dir_8    | M1 (with line)   | 852 |      0.0257 |    2.0000 |    0.0057 |  -0.0759 |   0.0834 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    0.5000 |    0.0113 |  -0.0408 |   0.0684 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    1.0000 |    0.0063 |  -0.0458 |   0.0634 |
| dir_8    | M0 (Nasdaq only) | 855 |      0.0163 |    2.0000 |   -0.0037 |  -0.0558 |   0.0534 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.