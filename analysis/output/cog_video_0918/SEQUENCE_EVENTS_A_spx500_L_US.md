# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 536. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +0.30 (k1=0.5 retest(0.5) W=8), its validation+OOS t = +1.81; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return +0.0003 (5-95%: -0.0342 to +0.0332); move to favourable share +0.0022; response share -0.0046.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.1268 |               0.0459 |              0.1523 | False             |             0.1420 |            -1.8428 | False          |              0.1000 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.055 |  1.652 | 14608 |    217 |
| VAL                       |    0.006 |  0.142 | 12153 |    182 |
| OOS                       |   -0.077 | -1.843 | 10374 |    154 |
| OOS R2 without s / with s |    0.167 |  0.167 | 10374 |    154 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | True      | True                    |               0.000 |                     | False            |               0.051 |                 0.037 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 585 |    213 |       -0.017 |         -0.023 |  -0.057 |   0.008 |         0.923 |
| all       | IS     | ret4     | 585 |    213 |       -0.008 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret16    | 585 |    213 |       -0.035 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 585 |    213 |       -0.064 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 585 |    213 |        0.345 |          0.017 |  -0.018 |   0.053 |         0.181 |
| all       | IS     | adv16    | 585 |    213 |        0.376 |          0.056 |   0.015 |   0.093 |         0.002 |
| all       | IS     | resp64   | 585 |    213 |        0.566 |          0.007 |  -0.038 |   0.049 |         0.385 |
| all       | IS     | vol8     | 585 |    213 |       -1.889 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret8     | 485 |    175 |        0.064 |          0.064 |   0.010 |   0.121 |         0.009 |
| all       | VAL    | ret4     | 485 |    175 |        0.021 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret16    | 485 |    175 |        0.064 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 485 |    175 |        0.107 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 485 |    175 |        0.396 |          0.067 |   0.016 |   0.115 |         0.003 |
| all       | VAL    | adv16    | 485 |    175 |        0.332 |         -0.002 |  -0.047 |   0.043 |         0.562 |
| all       | VAL    | resp64   | 485 |    175 |        0.606 |          0.048 |  -0.004 |   0.095 |         0.036 |
| all       | VAL    | vol8     | 485 |    175 |       -1.794 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret8     | 402 |    135 |        0.006 |          0.004 |  -0.029 |   0.037 |         0.402 |
| all       | OOS    | ret4     | 402 |    135 |        0.011 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret16    | 402 |    135 |        0.012 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 402 |    135 |        0.005 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 402 |    135 |        0.408 |          0.078 |   0.032 |   0.125 |         0.001 |
| all       | OOS    | adv16    | 402 |    135 |        0.358 |          0.028 |  -0.019 |   0.073 |         0.118 |
| all       | OOS    | resp64   | 402 |    135 |        0.604 |          0.034 |  -0.019 |   0.086 |         0.097 |
| all       | OOS    | vol8     | 402 |    135 |       -1.966 |        nan     | nan     | nan     |         0.031 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 585 |        nan |     nan |     nan |         0.000 |
| IS     | 1-2 h    | 585 |        nan |     nan |     nan |         0.000 |
| IS     | 2-4 h    | 585 |        nan |     nan |     nan |         0.000 |
| IS     | 4-8 h    | 585 |        nan |     nan |     nan |         0.000 |
| IS     | 8-16 h   | 585 |        nan |     nan |     nan |         0.000 |
| VAL    | 0-1 h    | 485 |        nan |     nan |     nan |         0.000 |
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
| IS                        |   -0.020 | -1.408 | 15173 |    235 |
| VAL                       |    0.037 |  2.366 | 12568 |    191 |
| OOS                       |    0.002 |  0.136 | 10708 |    161 |
| OOS R2 without s / with s |   -0.016 | -0.016 | 10708 |    161 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|----:|------------:|----------:|----------:|---------:|---------:|
| VAL     | 485 |      0.0642 |    0.5000 |    0.0592 |   0.0060 |   0.1175 |
| VAL     | 485 |      0.0642 |    1.0000 |    0.0542 |   0.0010 |   0.1125 |
| VAL     | 485 |      0.0642 |    2.0000 |    0.0442 |  -0.0090 |   0.1025 |
| OOS     | 402 |      0.0061 |    0.5000 |    0.0011 |  -0.0322 |   0.0357 |
| OOS     | 402 |      0.0061 |    1.0000 |   -0.0039 |  -0.0372 |   0.0307 |
| OOS     | 402 |      0.0061 |    2.0000 |   -0.0139 |  -0.0472 |   0.0207 |
| VAL+OOS | 887 |      0.0379 |    0.5000 |    0.0329 |   0.0013 |   0.0658 |
| VAL+OOS | 887 |      0.0379 |    1.0000 |    0.0279 |  -0.0037 |   0.0608 |
| VAL+OOS | 887 |      0.0379 |    2.0000 |    0.0179 |  -0.0137 |   0.0508 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |      t |
|:-----------------------------|-----:|-------:|-------:|
| k1=0.25 retest(0.3) W=8      |  343 |  0.008 |  0.429 |
| k1=0.25 accelerate(0.5) W=8  | 1327 |  0.002 |  0.252 |
| k1=0.5 retest(0.5) W=8       |  105 |  0.004 |  0.135 |
| k1=0.25 accelerate(1.0) W=16 |  530 |  0.002 |  0.097 |
| k1=0.25 continue(0.5) W=16   |  874 |  0.000 |  0.034 |
| k1=0.5 retest(0.3) W=8       |  221 | -0.005 | -0.216 |
| k1=0.5 accelerate(0.5) W=8   |  985 | -0.002 | -0.250 |
| k1=0.25 continue(0.5) W=8    |  715 | -0.004 | -0.301 |
| k1=0.25 retest(0.3) W=16     |  532 | -0.006 | -0.360 |
| k1=0.25 accelerate(0.5) W=16 | 1416 | -0.004 | -0.475 |
| k1=0.25 accelerate(1.0) W=8  |  478 | -0.010 | -0.476 |
| k1=0.5 retest(0.5) W=32      |  233 | -0.015 | -0.499 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1983 |     1863 |
| k1=0.25 continue(0.5) W=16   |     2460 |     2276 |
| k1=0.25 continue(0.5) W=32   |     2772 |     2558 |
| k1=0.25 continue(1.0) W=8    |      774 |      731 |
| k1=0.25 continue(1.0) W=16   |     1177 |     1090 |
| k1=0.25 continue(1.0) W=32   |     1543 |     1421 |
| k1=0.25 retest(0.3) W=8      |      745 |      701 |
| k1=0.25 retest(0.3) W=16     |     1231 |     1139 |
| k1=0.25 retest(0.3) W=32     |     1648 |     1501 |
| k1=0.25 retest(0.5) W=8      |      422 |      397 |
| k1=0.25 retest(0.5) W=16     |      704 |      657 |
| k1=0.25 retest(0.5) W=32     |      977 |      888 |
| k1=0.25 accelerate(0.5) W=8  |     3746 |     3521 |
| k1=0.25 accelerate(0.5) W=16 |     3939 |     3694 |
| k1=0.25 accelerate(0.5) W=32 |     4079 |     3828 |
| k1=0.25 accelerate(1.0) W=8  |     1224 |     1167 |
| k1=0.25 accelerate(1.0) W=16 |     1369 |     1301 |
| k1=0.25 accelerate(1.0) W=32 |     1526 |     1450 |
| k1=0.5 continue(0.5) W=8     |     1238 |     1166 |
| k1=0.5 continue(0.5) W=16    |     1578 |     1472 |
| k1=0.5 continue(0.5) W=32    |     1800 |     1676 |
| k1=0.5 continue(1.0) W=8     |      510 |      486 |
| k1=0.5 continue(1.0) W=16    |      802 |      748 |
| k1=0.5 continue(1.0) W=32    |     1029 |      949 |
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

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0242% inside the 32 bars after any confirmed sequence (n = 11,810) versus +0.0307% outside; difference -0.0065% (95% day-block CI -0.0364 to +0.0226). Mean |M1 - M0| inside 0.0257 versus outside 0.0122. Correlation of (M1 - M0) with the primary sequence signal: -0.010.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.048. Rules:
```
|--- L_mom32 <= -2.29
|   |--- value: [0.04]
|--- L_mom32 >  -2.29
|   |--- L_bhi128 <= 0.17
|   |   |--- L_legratio <= 1.07
|   |   |   |--- value: [-0.01]
|   |   |--- L_legratio >  1.07
|   |   |   |--- value: [-0.03]
|   |--- L_bhi128 >  0.17
|   |   |--- L_curv64 <= -0.53
|   |   |   |--- value: [0.01]
|   |   |--- L_curv64 >  -0.53
|   |   |   |--- value: [-0.01]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |  -0.019 |   0.096 |     0.115 |
| 2025-04-01 | vol_8    |     64 |   0.196 |   0.201 |     0.006 |
| 2025-07-01 | dir_16   |     66 |   0.033 |  -0.006 |    -0.038 |
| 2025-07-01 | vol_8    |     66 |   0.145 |   0.156 |     0.011 |
| 2025-10-01 | dir_16   |     64 |   0.084 |   0.083 |    -0.002 |
| 2025-10-01 | vol_8    |     64 |   0.243 |   0.234 |    -0.009 |
| 2026-01-01 | dir_16   |     63 |   0.009 |   0.080 |     0.071 |
| 2026-01-01 | vol_8    |     63 |   0.281 |   0.306 |     0.025 |
| 2026-04-01 | dir_16   |     65 |   0.064 |   0.089 |     0.025 |
| 2026-04-01 | vol_8    |     65 |  -0.070 |  -0.064 |     0.006 |
| 2026-07-01 | dir_16   |     37 |   0.098 |   0.121 |     0.023 |
| 2026-07-01 | vol_8    |     37 |   0.240 |   0.259 |     0.019 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |   0.040 |   0.073 |   nan     | nan     | nan     |
| trees depth 3 (registered)                        | vol_8    |   0.281 |   0.287 |     0.006 |   0.002 |   0.009 |
| ridge, all features                               | dir_16   |   0.011 |   0.045 |     0.034 |   0.008 |   0.061 |
| ridge, all features                               | vol_8    |   0.321 |   0.320 |    -0.001 |  -0.005 |   0.002 |
| trees depth 2, 30 iterations                      | dir_16   |   0.104 |   0.061 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.187 |   0.192 |     0.005 |   0.000 |   0.009 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |   0.040 |   0.041 |   nan     | nan     | nan     |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.281 |   0.279 |    -0.002 |  -0.004 |  -0.000 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.