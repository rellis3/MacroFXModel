# COG-SHAPE-AGNOSTIC results

Run once per forge/COG_SHAPE_AGNOSTIC_PREREG.md. Gradient-boosted trees, fixed hyper-parameters, walk-forward by quarter (validation 2025-04 to 2025-12, out-of-sample 2026-01 to 2026-10-09), purged. M0 = Nasdaq-only; M1 = M0 + the line's multi-scale shape + divergence.

## Verdict (registered rule): **no shape-agnostic evidence**

Features: M0 45, M1 79 (line shape: 27, divergence: 7). Placebo draws: 30.

### Information coefficient and AUC, by target and half (IC = mean day-level Spearman; IC_gain = M1 minus M0 with 95% day-block CI)
| target   | half    |   days |   IC_M0 |   IC_M1 |   IC_gain |    ci_lo |    ci_hi | AUC_M0              |   AUC_M1 |   p_boot |
|:---------|:--------|-------:|--------:|--------:|----------:|---------:|---------:|:--------------------|---------:|---------:|
| dir_8    | VAL     |    193 | -0.0208 |  0.0133 |  nan      | nan      | nan      | 0.4974780139029324  |   0.4973 |   0.0015 |
| dir_8    | OOS     |    165 | -0.0372 |  0.0396 |  nan      | nan      | nan      | 0.486257248284428   |   0.4954 |   0.0000 |
| dir_8    | VAL+OOS |    358 | -0.0284 |  0.0254 |  nan      | nan      | nan      | 0.4933347907418849  |   0.4962 |   0.0000 |
| dir_16   | VAL     |    194 |  0.0312 |  0.0436 |  nan      | nan      | nan      | 0.49102921580528974 |   0.4984 |   0.0015 |
| dir_16   | OOS     |    165 |  0.0506 |  0.0710 |    0.0205 |  -0.0302 |   0.0764 | 0.49368666891949686 |   0.5185 |   0.2355 |
| dir_16   | VAL+OOS |    359 |  0.0402 |  0.0562 |  nan      | nan      | nan      | 0.493383630319167   |   0.5076 |   0.0015 |
| dir_32   | VAL     |    194 |  0.1374 |  0.0701 |  nan      | nan      | nan      | 0.5042316142802978  |   0.5178 |   0.1295 |
| dir_32   | OOS     |    165 |  0.1910 |  0.1320 |   -0.0590 |  -0.1122 |  -0.0085 | 0.529834518628315   |   0.5329 |   0.9870 |
| dir_32   | VAL+OOS |    359 |  0.1621 |  0.0986 |  nan      | nan      | nan      | 0.5145991301206299  |   0.5240 |   0.1350 |
| vol_8    | VAL     |    195 |  0.2919 |  0.3122 |    0.0203 |   0.0127 |   0.0282 | (nan, nan)          |   0.8856 |   0.0000 |
| vol_8    | OOS     |    165 |  0.2680 |  0.2768 |    0.0088 |  -0.0024 |   0.0194 | (nan, nan)          |   0.8318 |   0.0615 |
| vol_8    | VAL+OOS |    360 |  0.2810 |  0.2960 |    0.0150 |   0.0083 |   0.0215 | (nan, nan)          |   0.8711 |   0.0000 |

### Gates per target
| target   | both_halves_CI_above_zero   | beats_placebo95   |   real_gain_val_oos |   placebo_mean |   placebo_p95 | economic_gate                           | economic_ok   |
|:---------|:----------------------------|:------------------|--------------------:|---------------:|--------------:|:----------------------------------------|:--------------|
| dir_8    | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: -0.0309%     | False         |
| dir_16   | False                       | False             |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: -0.0688%     | False         |
| dir_32   | False                       |                   |            nan      |       nan      |      nan      | net lower bound at 1.0 bp: not computed | False         |
| vol_8    | False                       | True              |              0.0150 |         0.0063 |        0.0131 | volatility context (no trade)           | True          |

### Grouped permutation importance, out-of-sample (IC_drop = how much IC the model loses when that group of line features is scrambled)
| target   | group                |   IC_with |   IC_group_shuffled |   IC_drop |
|:---------|:---------------------|----------:|--------------------:|----------:|
| dir_16   | momentum             |    0.0710 |              0.0672 |    0.0038 |
| dir_16   | curvature            |    0.0710 |              0.0815 |   -0.0105 |
| dir_16   | position             |    0.0710 |              0.0678 |    0.0032 |
| dir_16   | time-since high/low  |    0.0710 |              0.0532 |    0.0178 |
| dir_16   | zig-zag / confluence |    0.0710 |              0.0694 |    0.0016 |
| dir_16   | variability          |    0.0710 |              0.0710 |   -0.0000 |
| dir_16   | divergence           |    0.0710 |              0.0675 |    0.0035 |
| vol_8    | momentum             |    0.2768 |              0.2744 |    0.0024 |
| vol_8    | curvature            |    0.2768 |              0.2626 |    0.0142 |
| vol_8    | position             |    0.2768 |              0.2773 |   -0.0005 |
| vol_8    | time-since high/low  |    0.2768 |              0.2748 |    0.0020 |
| vol_8    | zig-zag / confluence |    0.2768 |              0.2786 |   -0.0018 |
| vol_8    | variability          |    0.2768 |              0.2758 |    0.0010 |
| vol_8    | divergence           |    0.2768 |              0.2724 |    0.0044 |

### Economic check: top 5% of |prediction| out of sample, net of cost (0.5 / 1.0 / 2.0 bp)
| target   | model            |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:---------|:-----------------|----:|------------:|----------:|----------:|---------:|---------:|
| dir_16   | M1 (with line)   | 714 |      0.0048 |    0.5000 |   -0.0002 |  -0.0638 |   0.0603 |
| dir_16   | M1 (with line)   | 714 |      0.0048 |    1.0000 |   -0.0052 |  -0.0688 |   0.0553 |
| dir_16   | M1 (with line)   | 714 |      0.0048 |    2.0000 |   -0.0152 |  -0.0788 |   0.0453 |
| dir_16   | M0 (Nasdaq only) | 715 |     -0.0308 |    0.5000 |   -0.0358 |  -0.1101 |   0.0253 |
| dir_16   | M0 (Nasdaq only) | 715 |     -0.0308 |    1.0000 |   -0.0408 |  -0.1151 |   0.0203 |
| dir_16   | M0 (Nasdaq only) | 715 |     -0.0308 |    2.0000 |   -0.0508 |  -0.1251 |   0.0103 |
| dir_8    | M1 (with line)   | 728 |      0.0224 |    0.5000 |    0.0174 |  -0.0259 |   0.0556 |
| dir_8    | M1 (with line)   | 728 |      0.0224 |    1.0000 |    0.0124 |  -0.0309 |   0.0506 |
| dir_8    | M1 (with line)   | 728 |      0.0224 |    2.0000 |    0.0024 |  -0.0409 |   0.0406 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0051 |    0.5000 |    0.0001 |  -0.0540 |   0.0514 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0051 |    1.0000 |   -0.0049 |  -0.0590 |   0.0464 |
| dir_8    | M0 (Nasdaq only) | 728 |      0.0051 |    2.0000 |   -0.0149 |  -0.0690 |   0.0364 |

### Reading the table
- IC_gain near zero with a CI straddling it means the line's shape adds nothing a Nasdaq-only model does not already have.
- A positive gain that does not exceed the shifted-line placebo is the model fitting noise it can find in any series with the same statistics.
- Limits: only the pinned pair has deep history; no untouched sample exists for the combined line (the forward record from 2026-10-15 is the untouched test); trees are not tuned, so a better-tuned model could do slightly better, but it cannot turn a zero into a result without a tuning step that would itself need an untouched sample.