# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 528. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.10 (k1=0.5 accelerate(0.5) W=16), its validation+OOS t = +1.44; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return +0.0041 (5-95%: -0.0273 to +0.0292); move to favourable share +0.0166; response share +0.0065.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.1692 |               0.0515 |              0.1780 | False             |            -0.4593 |            -2.3023 | False          |              0.1139 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.112 |  3.548 | 14721 |    217 |
| VAL                       |   -0.020 | -0.459 | 12215 |    182 |
| OOS                       |   -0.098 | -2.302 | 10419 |    154 |
| OOS R2 without s / with s |    0.196 |  0.194 | 10419 |    154 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | True      | False                   |               0.004 |                     | False            |               0.028 |                 0.019 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 585 |    213 |       -0.014 |         -0.009 |  -0.041 |   0.020 |         0.758 |
| all       | IS     | ret4     | 585 |    213 |        0.001 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret16    | 585 |    213 |       -0.020 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 585 |    213 |       -0.053 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 585 |    213 |        0.342 |          0.022 |  -0.018 |   0.057 |         0.135 |
| all       | IS     | adv16    | 585 |    213 |        0.383 |          0.048 |   0.007 |   0.089 |         0.013 |
| all       | IS     | resp64   | 585 |    213 |        0.559 |          0.019 |  -0.023 |   0.061 |         0.209 |
| all       | IS     | vol8     | 585 |    213 |       -2.013 |        nan     | nan     | nan     |         0.012 |
| all       | VAL    | ret8     | 485 |    175 |        0.044 |          0.039 |  -0.009 |   0.088 |         0.051 |
| all       | VAL    | ret4     | 485 |    175 |        0.010 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret16    | 485 |    175 |        0.045 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 485 |    175 |        0.084 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 485 |    175 |        0.384 |          0.040 |  -0.007 |   0.085 |         0.039 |
| all       | VAL    | adv16    | 485 |    175 |        0.359 |          0.033 |  -0.011 |   0.072 |         0.063 |
| all       | VAL    | resp64   | 485 |    175 |        0.592 |          0.036 |  -0.015 |   0.082 |         0.076 |
| all       | VAL    | vol8     | 485 |    175 |       -1.798 |        nan     | nan     | nan     |         0.001 |
| all       | OOS    | ret8     | 402 |    135 |       -0.003 |         -0.005 |  -0.040 |   0.031 |         0.619 |
| all       | OOS    | ret4     | 402 |    135 |        0.006 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret16    | 402 |    135 |        0.016 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 402 |    135 |        0.011 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 402 |    135 |        0.391 |          0.063 |   0.011 |   0.114 |         0.007 |
| all       | OOS    | adv16    | 402 |    135 |        0.343 |          0.006 |  -0.042 |   0.054 |         0.413 |
| all       | OOS    | resp64   | 402 |    135 |        0.597 |          0.032 |  -0.018 |   0.081 |         0.104 |
| all       | OOS    | vol8     | 402 |    135 |       -1.963 |          0.091 |  -0.044 |   0.224 |         0.084 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 585 |        nan |     nan |     nan |         0.000 |
| IS     | 1-2 h    | 585 |        nan |     nan |     nan |         0.000 |
| IS     | 2-4 h    | 585 |        nan |     nan |     nan |         0.000 |
| IS     | 4-8 h    | 585 |        nan |     nan |     nan |         0.000 |
| IS     | 8-16 h   | 585 |        nan |     nan |     nan |         0.000 |
| VAL    | 0-1 h    | 485 |        nan |     nan |     nan |         0.001 |
| VAL    | 1-2 h    | 485 |        nan |     nan |     nan |         0.000 |
| VAL    | 2-4 h    | 485 |        nan |     nan |     nan |         0.000 |
| VAL    | 4-8 h    | 485 |        nan |     nan |     nan |         0.000 |
| VAL    | 8-16 h   | 485 |        nan |     nan |     nan |         0.000 |
| OOS    | 0-1 h    | 402 |        nan |     nan |     nan |         0.000 |
| OOS    | 1-2 h    | 402 |        nan |     nan |     nan |         0.000 |
| OOS    | 2-4 h    | 402 |        nan |     nan |     nan |         0.000 |
| OOS    | 4-8 h    | 402 |        nan |     nan |     nan |         0.000 |
| OOS    | 8-16 h   | 402 |        nan |     nan |     nan |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.015 | -1.174 | 15153 |    234 |
| VAL                       |    0.033 |  2.174 | 12555 |    190 |
| OOS                       |   -0.008 | -0.521 | 10704 |    161 |
| OOS R2 without s / with s |   -0.009 | -0.009 | 10704 |    161 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|----:|------------:|----------:|----------:|---------:|---------:|
| VAL     | 485 |      0.0441 |    0.5000 |    0.0391 |  -0.0081 |   0.0890 |
| VAL     | 485 |      0.0441 |    1.0000 |    0.0341 |  -0.0131 |   0.0840 |
| VAL     | 485 |      0.0441 |    2.0000 |    0.0241 |  -0.0231 |   0.0740 |
| OOS     | 402 |     -0.0026 |    0.5000 |   -0.0076 |  -0.0414 |   0.0297 |
| OOS     | 402 |     -0.0026 |    1.0000 |   -0.0126 |  -0.0464 |   0.0247 |
| OOS     | 402 |     -0.0026 |    2.0000 |   -0.0226 |  -0.0564 |   0.0147 |
| VAL+OOS | 887 |      0.0229 |    0.5000 |    0.0179 |  -0.0115 |   0.0500 |
| VAL+OOS | 887 |      0.0229 |    1.0000 |    0.0129 |  -0.0165 |   0.0450 |
| VAL+OOS | 887 |      0.0229 |    2.0000 |    0.0029 |  -0.0265 |   0.0350 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |     t |
|:-----------------------------|-----:|-------:|------:|
| k1=0.25 accelerate(0.5) W=32 | 1467 |  0.008 | 1.003 |
| k1=0.5 accelerate(0.5) W=32  | 1068 |  0.008 | 0.912 |
| k1=0.25 accelerate(0.5) W=8  | 1327 |  0.007 | 0.799 |
| k1=0.25 continue(0.5) W=8    |  714 |  0.010 | 0.718 |
| k1=0.25 continue(0.5) W=32   |  993 |  0.008 | 0.686 |
| k1=0.25 accelerate(1.0) W=8  |  478 |  0.010 | 0.553 |
| k1=0.25 continue(0.5) W=16   |  873 |  0.007 | 0.548 |
| k1=0.25 accelerate(0.5) W=16 | 1416 |  0.004 | 0.474 |
| k1=0.5 accelerate(0.5) W=8   |  986 |  0.004 | 0.462 |
| k1=0.5 accelerate(0.5) W=16  | 1038 |  0.004 | 0.429 |
| k1=0.25 retest(0.3) W=8      |  343 |  0.006 | 0.381 |
| k1=0.5 retest(0.5) W=8       |  105 |  0.011 | 0.346 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1983 |     1862 |
| k1=0.25 continue(0.5) W=16   |     2460 |     2275 |
| k1=0.25 continue(0.5) W=32   |     2772 |     2556 |
| k1=0.25 continue(1.0) W=8    |      774 |      730 |
| k1=0.25 continue(1.0) W=16   |     1177 |     1089 |
| k1=0.25 continue(1.0) W=32   |     1543 |     1420 |
| k1=0.25 retest(0.3) W=8      |      745 |      701 |
| k1=0.25 retest(0.3) W=16     |     1231 |     1139 |
| k1=0.25 retest(0.3) W=32     |     1648 |     1501 |
| k1=0.25 retest(0.5) W=8      |      422 |      397 |
| k1=0.25 retest(0.5) W=16     |      704 |      657 |
| k1=0.25 retest(0.5) W=32     |      977 |      888 |
| k1=0.25 accelerate(0.5) W=8  |     3746 |     3520 |
| k1=0.25 accelerate(0.5) W=16 |     3939 |     3693 |
| k1=0.25 accelerate(0.5) W=32 |     4079 |     3827 |
| k1=0.25 accelerate(1.0) W=8  |     1224 |     1167 |
| k1=0.25 accelerate(1.0) W=16 |     1369 |     1301 |
| k1=0.25 accelerate(1.0) W=32 |     1526 |     1450 |
| k1=0.5 continue(0.5) W=8     |     1238 |     1166 |
| k1=0.5 continue(0.5) W=16    |     1578 |     1472 |
| k1=0.5 continue(0.5) W=32    |     1800 |     1676 |
| k1=0.5 continue(1.0) W=8     |      510 |      485 |
| k1=0.5 continue(1.0) W=16    |      802 |      747 |
| k1=0.5 continue(1.0) W=32    |     1029 |      948 |
| k1=0.5 retest(0.3) W=8       |      518 |      489 |
| k1=0.5 retest(0.3) W=16      |      843 |      784 |
| k1=0.5 retest(0.3) W=32      |     1140 |     1039 |
| k1=0.5 retest(0.5) W=8       |      269 |      252 |
| k1=0.5 retest(0.5) W=16      |      461 |      429 |
| k1=0.5 retest(0.5) W=32      |      658 |      592 |
| k1=0.5 accelerate(0.5) W=8   |     2883 |     2701 |
| k1=0.5 accelerate(0.5) W=16  |     2993 |     2806 |
| k1=0.5 accelerate(0.5) W=32  |     3079 |     2887 |
| k1=0.5 accelerate(1.0) W=8   |     1000 |      950 |
| k1=0.5 accelerate(1.0) W=16  |     1115 |     1060 |
| k1=0.5 accelerate(1.0) W=32  |     1212 |     1153 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0152% inside the 32 bars after any confirmed sequence (n = 11,808) versus +0.0309% outside; difference -0.0156% (95% day-block CI -0.0456 to +0.0147). Mean |M1 - M0| inside 0.0290 versus outside 0.0135. Correlation of (M1 - M0) with the primary sequence signal: -0.056.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared +0.070. Rules:
```
|--- L_mom16 <= -1.17
|   |--- L_bhi32 <= 0.80
|   |   |--- value: [0.02]
|   |--- L_bhi32 >  0.80
|   |   |--- value: [0.05]
|--- L_mom16 >  -1.17
|   |--- D_32 <= -0.02
|   |   |--- L_mom32 <= -1.18
|   |   |   |--- value: [0.02]
|   |   |--- L_mom32 >  -1.18
|   |   |   |--- value: [0.00]
|   |--- D_32 >  -0.02
|   |   |--- L_bhi128 <= 0.18
|   |   |   |--- value: [-0.03]
|   |   |--- L_bhi128 >  0.18
|   |   |   |--- value: [-0.01]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |   0.073 |   0.120 |     0.046 |
| 2025-04-01 | vol_8    |     64 |   0.357 |   0.325 |    -0.032 |
| 2025-07-01 | dir_16   |     66 |   0.006 |   0.035 |     0.029 |
| 2025-07-01 | vol_8    |     66 |   0.219 |   0.215 |    -0.003 |
| 2025-10-01 | dir_16   |     64 |   0.028 |   0.095 |     0.067 |
| 2025-10-01 | vol_8    |     64 |   0.322 |   0.322 |    -0.001 |
| 2026-01-01 | dir_16   |     63 |   0.054 |   0.028 |    -0.026 |
| 2026-01-01 | vol_8    |     63 |   0.370 |   0.374 |     0.004 |
| 2026-04-01 | dir_16   |     64 |   0.061 |   0.079 |     0.018 |
| 2026-04-01 | vol_8    |     65 |   0.186 |   0.194 |     0.008 |
| 2026-07-01 | dir_16   |     37 |   0.101 |   0.041 |    -0.060 |
| 2026-07-01 | vol_8    |     37 |   0.265 |   0.255 |    -0.010 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |   0.050 |   0.068 |     0.018 |  -0.018 |   0.052 |
| trees depth 3 (registered)                        | vol_8    |   0.345 |   0.351 |     0.006 |   0.002 |   0.011 |
| ridge, all features                               | dir_16   |   0.005 |   0.053 |     0.047 |   0.019 |   0.075 |
| ridge, all features                               | vol_8    |   0.388 |   0.388 |     0.000 |  -0.004 |   0.003 |
| trees depth 2, 30 iterations                      | dir_16   |   0.003 |   0.024 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.266 |   0.273 |     0.007 |   0.003 |   0.011 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |   0.051 |   0.025 |    -0.026 |  -0.055 |   0.005 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.345 |   0.343 |    -0.002 |  -0.005 |   0.001 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.