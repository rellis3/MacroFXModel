# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 516. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +0.74 (k1=0.5 retest(0.3) W=8), its validation+OOS t = +1.66; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return +0.0041 (5-95%: -0.0322 to +0.0466); move to favourable share +0.0071; response share -0.0011.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.1216 |               0.0701 |              0.1739 | False             |            -0.0040 |            -0.9261 | False          |              0.0609 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.054 |  1.743 | 14693 |    217 |
| VAL                       |   -0.000 | -0.004 | 12167 |    182 |
| OOS                       |   -0.041 | -0.926 | 10295 |    154 |
| OOS R2 without s / with s |    0.209 |  0.208 | 10295 |    154 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |               0.004 |                     | False            |               0.045 |                 0.034 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 583 |    214 |       -0.022 |         -0.022 |  -0.071 |   0.020 |         0.850 |
| all       | IS     | ret4     | 583 |    214 |       -0.016 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret16    | 583 |    214 |       -0.070 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 583 |    214 |       -0.102 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 583 |    214 |        0.328 |          0.005 |  -0.033 |   0.043 |         0.396 |
| all       | IS     | adv16    | 583 |    214 |        0.383 |          0.052 |   0.014 |   0.091 |         0.007 |
| all       | IS     | resp64   | 583 |    214 |        0.533 |         -0.005 |  -0.048 |   0.039 |         0.591 |
| all       | IS     | vol8     | 583 |    214 |       -1.441 |        nan     | nan     | nan     |         0.019 |
| all       | VAL    | ret8     | 481 |    175 |        0.070 |          0.077 |   0.015 |   0.145 |         0.010 |
| all       | VAL    | ret4     | 481 |    175 |        0.018 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret16    | 481 |    175 |        0.076 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 481 |    175 |        0.078 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 481 |    175 |        0.395 |          0.077 |   0.031 |   0.121 |         0.001 |
| all       | VAL    | adv16    | 481 |    175 |        0.353 |          0.025 |  -0.021 |   0.068 |         0.131 |
| all       | VAL    | resp64   | 481 |    175 |        0.605 |          0.079 |   0.028 |   0.126 |         0.001 |
| all       | VAL    | vol8     | 481 |    175 |       -1.364 |        nan     | nan     | nan     |         0.001 |
| all       | OOS    | ret8     | 400 |    135 |       -0.013 |         -0.016 |  -0.070 |   0.034 |         0.709 |
| all       | OOS    | ret4     | 400 |    135 |        0.015 |        nan     | nan     | nan     |         0.001 |
| all       | OOS    | ret16    | 400 |    135 |       -0.000 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 400 |    135 |        0.013 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 400 |    135 |        0.323 |         -0.006 |  -0.051 |   0.036 |         0.583 |
| all       | OOS    | adv16    | 400 |    135 |        0.412 |          0.092 |   0.047 |   0.134 |         0.000 |
| all       | OOS    | resp64   | 400 |    135 |        0.547 |         -0.011 |  -0.066 |   0.044 |         0.645 |
| all       | OOS    | vol8     | 400 |    135 |       -1.542 |          0.006 |  -0.122 |   0.129 |         0.478 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 583 |        nan |     nan |     nan |         0.000 |
| IS     | 1-2 h    | 583 |        nan |     nan |     nan |         0.000 |
| IS     | 2-4 h    | 583 |        nan |     nan |     nan |         0.000 |
| IS     | 4-8 h    | 583 |        nan |     nan |     nan |         0.000 |
| IS     | 8-16 h   | 583 |        nan |     nan |     nan |         0.000 |
| VAL    | 0-1 h    | 481 |        nan |     nan |     nan |         0.000 |
| VAL    | 1-2 h    | 481 |        nan |     nan |     nan |         0.000 |
| VAL    | 2-4 h    | 481 |        nan |     nan |     nan |         0.000 |
| VAL    | 4-8 h    | 481 |        nan |     nan |     nan |         0.000 |
| VAL    | 8-16 h   | 481 |        nan |     nan |     nan |         0.000 |
| OOS    | 0-1 h    | 400 |        nan |     nan |     nan |         0.000 |
| OOS    | 1-2 h    | 400 |        nan |     nan |     nan |         0.000 |
| OOS    | 2-4 h    | 400 |        nan |     nan |     nan |         0.000 |
| OOS    | 4-8 h    | 400 |        nan |     nan |     nan |         0.000 |
| OOS    | 8-16 h   | 400 |        nan |     nan |     nan |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.021 | -0.971 | 15076 |    228 |
| VAL                       |    0.055 |  2.323 | 12474 |    187 |
| OOS                       |   -0.012 | -0.455 | 10512 |    156 |
| OOS R2 without s / with s |   -0.005 | -0.005 | 10512 |    156 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|----:|------------:|----------:|----------:|---------:|---------:|
| VAL     | 481 |      0.0697 |    0.5000 |    0.0647 |  -0.0022 |   0.1258 |
| VAL     | 481 |      0.0697 |    1.0000 |    0.0597 |  -0.0072 |   0.1208 |
| VAL     | 481 |      0.0697 |    2.0000 |    0.0497 |  -0.0172 |   0.1108 |
| OOS     | 400 |     -0.0131 |    0.5000 |   -0.0181 |  -0.0701 |   0.0314 |
| OOS     | 400 |     -0.0131 |    1.0000 |   -0.0231 |  -0.0751 |   0.0264 |
| OOS     | 400 |     -0.0131 |    2.0000 |   -0.0331 |  -0.0851 |   0.0164 |
| VAL+OOS | 881 |      0.0321 |    0.5000 |    0.0271 |  -0.0180 |   0.0707 |
| VAL+OOS | 881 |      0.0321 |    1.0000 |    0.0221 |  -0.0230 |   0.0657 |
| VAL+OOS | 881 |      0.0321 |    2.0000 |    0.0121 |  -0.0330 |   0.0557 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |      t |
|:-----------------------------|-----:|-------:|-------:|
| k1=0.25 retest(0.3) W=8      |  343 |  0.025 |  0.931 |
| k1=0.5 retest(0.3) W=8       |  222 |  0.025 |  0.684 |
| k1=0.25 continue(0.5) W=8    |  712 |  0.010 |  0.493 |
| k1=0.25 accelerate(1.0) W=8  |  477 |  0.013 |  0.431 |
| k1=0.5 retest(0.5) W=8       |  105 |  0.022 |  0.418 |
| k1=0.25 continue(0.5) W=32   |  993 |  0.007 |  0.388 |
| k1=0.5 accelerate(0.5) W=32  | 1067 |  0.005 |  0.328 |
| k1=0.5 accelerate(0.5) W=16  | 1037 |  0.003 |  0.237 |
| k1=0.25 continue(0.5) W=16   |  872 |  0.001 |  0.035 |
| k1=0.25 accelerate(0.5) W=16 | 1412 | -0.000 | -0.009 |
| k1=0.25 accelerate(1.0) W=16 |  529 | -0.000 | -0.014 |
| k1=0.5 accelerate(0.5) W=8   |  985 | -0.001 | -0.085 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1983 |     1853 |
| k1=0.25 continue(0.5) W=16   |     2460 |     2265 |
| k1=0.25 continue(0.5) W=32   |     2772 |     2547 |
| k1=0.25 continue(1.0) W=8    |      774 |      728 |
| k1=0.25 continue(1.0) W=16   |     1177 |     1087 |
| k1=0.25 continue(1.0) W=32   |     1543 |     1416 |
| k1=0.25 retest(0.3) W=8      |      745 |      699 |
| k1=0.25 retest(0.3) W=16     |     1231 |     1136 |
| k1=0.25 retest(0.3) W=32     |     1648 |     1498 |
| k1=0.25 retest(0.5) W=8      |      422 |      396 |
| k1=0.25 retest(0.5) W=16     |      704 |      656 |
| k1=0.25 retest(0.5) W=32     |      977 |      888 |
| k1=0.25 accelerate(0.5) W=8  |     3746 |     3505 |
| k1=0.25 accelerate(0.5) W=16 |     3939 |     3677 |
| k1=0.25 accelerate(0.5) W=32 |     4079 |     3811 |
| k1=0.25 accelerate(1.0) W=8  |     1224 |     1161 |
| k1=0.25 accelerate(1.0) W=16 |     1369 |     1295 |
| k1=0.25 accelerate(1.0) W=32 |     1526 |     1442 |
| k1=0.5 continue(0.5) W=8     |     1238 |     1161 |
| k1=0.5 continue(0.5) W=16    |     1578 |     1464 |
| k1=0.5 continue(0.5) W=32    |     1800 |     1668 |
| k1=0.5 continue(1.0) W=8     |      510 |      484 |
| k1=0.5 continue(1.0) W=16    |      802 |      744 |
| k1=0.5 continue(1.0) W=32    |     1029 |      944 |
| k1=0.5 retest(0.3) W=8       |      518 |      490 |
| k1=0.5 retest(0.3) W=16      |      843 |      784 |
| k1=0.5 retest(0.3) W=32      |     1140 |     1038 |
| k1=0.5 retest(0.5) W=8       |      269 |      252 |
| k1=0.5 retest(0.5) W=16      |      461 |      428 |
| k1=0.5 retest(0.5) W=32      |      658 |      591 |
| k1=0.5 accelerate(0.5) W=8   |     2883 |     2695 |
| k1=0.5 accelerate(0.5) W=16  |     2993 |     2800 |
| k1=0.5 accelerate(0.5) W=32  |     3079 |     2881 |
| k1=0.5 accelerate(1.0) W=8   |     1000 |      946 |
| k1=0.5 accelerate(1.0) W=16  |     1115 |     1056 |
| k1=0.5 accelerate(1.0) W=32  |     1212 |     1148 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0454% inside the 32 bars after any confirmed sequence (n = 11,723) versus +0.0455% outside; difference -0.0001% (95% day-block CI -0.0523 to +0.0490). Mean |M1 - M0| inside 0.0495 versus outside 0.0219. Correlation of (M1 - M0) with the primary sequence signal: -0.042.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared +0.140. Rules:
```
|--- L_bhi128 <= 0.07
|   |--- L_curv128 <= 0.69
|   |   |--- value: [-0.07]
|   |--- L_curv128 >  0.69
|   |   |--- value: [-0.04]
|--- L_bhi128 >  0.07
|   |--- D_128 <= 3.37
|   |   |--- L_mom128 <= -4.32
|   |   |   |--- value: [-0.06]
|   |   |--- L_mom128 >  -4.32
|   |   |   |--- value: [0.00]
|   |--- D_128 >  3.37
|   |   |--- L_bhi128 <= 0.40
|   |   |   |--- value: [0.01]
|   |   |--- L_bhi128 >  0.40
|   |   |   |--- value: [0.14]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |   0.017 |   0.115 |     0.098 |
| 2025-04-01 | vol_8    |     64 |   0.279 |   0.280 |     0.001 |
| 2025-07-01 | dir_16   |     66 |  -0.021 |   0.024 |     0.045 |
| 2025-07-01 | vol_8    |     66 |   0.156 |   0.171 |     0.015 |
| 2025-10-01 | dir_16   |     64 |   0.040 |   0.101 |     0.061 |
| 2025-10-01 | vol_8    |     64 |   0.333 |   0.332 |    -0.001 |
| 2026-01-01 | dir_16   |     63 |   0.027 |   0.064 |     0.038 |
| 2026-01-01 | vol_8    |     63 |   0.406 |   0.416 |     0.010 |
| 2026-04-01 | dir_16   |     65 |   0.149 |   0.126 |    -0.023 |
| 2026-04-01 | vol_8    |     65 |   0.340 |   0.342 |     0.001 |
| 2026-07-01 | dir_16   |     37 |   0.087 |   0.108 |     0.022 |
| 2026-07-01 | vol_8    |     37 |   0.448 |   0.452 |     0.004 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |   0.047 |   0.088 |     0.041 |   0.008 |   0.076 |
| trees depth 3 (registered)                        | vol_8    |   0.368 |   0.370 |     0.003 |  -0.001 |   0.006 |
| ridge, all features                               | dir_16   |   0.050 |   0.080 |     0.030 |   0.003 |   0.058 |
| ridge, all features                               | vol_8    |   0.394 |   0.397 |     0.003 |   0.000 |   0.005 |
| trees depth 2, 30 iterations                      | dir_16   |   0.037 |   0.061 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.285 |   0.290 |     0.005 |   0.001 |   0.008 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |   0.047 |   0.057 |     0.010 |  -0.018 |   0.038 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.368 |   0.368 |     0.000 |  -0.002 |   0.003 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.