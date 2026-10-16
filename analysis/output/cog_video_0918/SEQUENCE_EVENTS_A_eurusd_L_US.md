# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 524. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.03 (k1=0.5 accelerate(0.5) W=8), its validation+OOS t = -0.16; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return -0.0006 (5-95%: -0.0138 to +0.0108); move to favourable share +0.0035; response share +0.0021.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.0616 |               0.0499 |              0.1596 | False             |            -0.5438 |             0.0839 | False          |              0.0258 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.066 |  2.156 | 17533 |    239 |
| VAL                       |   -0.019 | -0.544 | 14565 |    195 |
| OOS                       |    0.003 |  0.084 | 12238 |    164 |
| OOS R2 without s / with s |    0.126 |  0.125 | 12238 |    164 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | True      | False                   |              -0.001 |                     | False            |              -0.005 |                -0.005 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 618 |    216 |       -0.003 |         -0.003 |  -0.014 |   0.008 |         0.699 |
| all       | IS     | ret4     | 618 |    216 |       -0.008 |         -0.009 |  -0.019 |   0.001 |         0.963 |
| all       | IS     | ret16    | 618 |    216 |       -0.009 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 618 |    216 |       -0.002 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 618 |    216 |        0.316 |          0.011 |  -0.023 |   0.044 |         0.271 |
| all       | IS     | adv16    | 618 |    216 |        0.354 |          0.038 |  -0.001 |   0.076 |         0.030 |
| all       | IS     | resp64   | 618 |    216 |        0.536 |         -0.002 |  -0.044 |   0.038 |         0.540 |
| all       | IS     | vol8     | 618 |    216 |       -2.736 |        nan     | nan     | nan     |         0.003 |
| all       | VAL    | ret8     | 513 |    178 |       -0.009 |         -0.010 |  -0.027 |   0.007 |         0.869 |
| all       | VAL    | ret4     | 513 |    178 |       -0.005 |         -0.005 |  -0.017 |   0.006 |         0.825 |
| all       | VAL    | ret16    | 513 |    178 |       -0.014 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 513 |    178 |       -0.025 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 513 |    178 |        0.361 |          0.050 |   0.002 |   0.098 |         0.021 |
| all       | VAL    | adv16    | 513 |    178 |        0.343 |          0.030 |  -0.010 |   0.073 |         0.084 |
| all       | VAL    | resp64   | 513 |    178 |        0.575 |          0.025 |  -0.025 |   0.075 |         0.150 |
| all       | VAL    | vol8     | 513 |    178 |       -2.645 |        nan     | nan     | nan     |         0.011 |
| all       | OOS    | ret8     | 416 |    137 |        0.005 |          0.001 |  -0.011 |   0.013 |         0.450 |
| all       | OOS    | ret4     | 416 |    137 |        0.013 |          0.009 |   0.000 |   0.018 |         0.025 |
| all       | OOS    | ret16    | 416 |    137 |        0.004 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 416 |    137 |       -0.009 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 416 |    137 |        0.365 |          0.044 |  -0.006 |   0.095 |         0.041 |
| all       | OOS    | adv16    | 416 |    137 |        0.341 |          0.039 |  -0.013 |   0.085 |         0.070 |
| all       | OOS    | resp64   | 416 |    137 |        0.582 |          0.033 |  -0.018 |   0.084 |         0.113 |
| all       | OOS    | vol8     | 416 |    137 |       -2.859 |        nan     | nan     | nan     |         0.212 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 618 |     -0.009 |  -0.019 |   0.001 |         0.966 |
| IS     | 1-2 h    | 618 |      0.006 |  -0.002 |   0.014 |         0.085 |
| IS     | 2-4 h    | 618 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 618 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 618 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 513 |     -0.005 |  -0.017 |   0.006 |         0.818 |
| VAL    | 1-2 h    | 513 |     -0.004 |  -0.017 |   0.008 |         0.713 |
| VAL    | 2-4 h    | 513 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 513 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 513 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 416 |      0.009 |   0.000 |   0.018 |         0.024 |
| OOS    | 1-2 h    | 416 |     -0.008 |  -0.018 |   0.002 |         0.959 |
| OOS    | 2-4 h    | 416 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 416 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 416 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.000 |  0.014 | 17647 |    239 |
| VAL                       |   -0.013 | -1.694 | 14645 |    195 |
| OOS                       |   -0.001 | -0.254 | 12323 |    164 |
| OOS R2 without s / with s |   -0.007 | -0.007 | 12323 |    164 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|----:|------------:|----------:|----------:|---------:|---------:|
| VAL     | 513 |     -0.0090 |    0.5000 |   -0.0140 |  -0.0311 |   0.0027 |
| VAL     | 513 |     -0.0090 |    1.0000 |   -0.0190 |  -0.0361 |  -0.0023 |
| VAL     | 513 |     -0.0090 |    2.0000 |   -0.0290 |  -0.0461 |  -0.0123 |
| OOS     | 416 |      0.0048 |    0.5000 |   -0.0002 |  -0.0126 |   0.0124 |
| OOS     | 416 |      0.0048 |    1.0000 |   -0.0052 |  -0.0176 |   0.0074 |
| OOS     | 416 |      0.0048 |    2.0000 |   -0.0152 |  -0.0276 |  -0.0026 |
| VAL+OOS | 929 |     -0.0028 |    0.5000 |   -0.0078 |  -0.0195 |   0.0026 |
| VAL+OOS | 929 |     -0.0028 |    1.0000 |   -0.0128 |  -0.0245 |  -0.0024 |
| VAL+OOS | 929 |     -0.0028 |    2.0000 |   -0.0228 |  -0.0345 |  -0.0124 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |      t |
|:-----------------------------|-----:|-------:|-------:|
| k1=0.5 accelerate(0.5) W=16  | 1079 |  0.003 |  0.688 |
| k1=0.25 continue(0.5) W=8    |  743 |  0.004 |  0.686 |
| k1=0.5 accelerate(0.5) W=8   | 1026 |  0.003 |  0.653 |
| k1=0.25 accelerate(1.0) W=8  |  493 |  0.005 |  0.633 |
| k1=0.5 continue(1.0) W=8     |  212 |  0.002 |  0.217 |
| k1=0.25 continue(1.0) W=8    |  314 |  0.002 |  0.171 |
| k1=0.5 accelerate(1.0) W=8   |  392 |  0.000 |  0.013 |
| k1=0.5 accelerate(0.5) W=32  | 1111 |  0.000 |  0.002 |
| k1=0.25 accelerate(1.0) W=16 |  548 | -0.000 | -0.024 |
| k1=0.25 continue(0.5) W=32   | 1061 | -0.001 | -0.164 |
| k1=0.25 accelerate(1.0) W=32 |  614 | -0.002 | -0.220 |
| k1=0.5 retest(0.3) W=8       |  228 | -0.004 | -0.328 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1983 |     1953 |
| k1=0.25 continue(0.5) W=16   |     2460 |     2410 |
| k1=0.25 continue(0.5) W=32   |     2772 |     2719 |
| k1=0.25 continue(1.0) W=8    |      774 |      762 |
| k1=0.25 continue(1.0) W=16   |     1177 |     1158 |
| k1=0.25 continue(1.0) W=32   |     1543 |     1520 |
| k1=0.25 retest(0.3) W=8      |      745 |      730 |
| k1=0.25 retest(0.3) W=16     |     1231 |     1208 |
| k1=0.25 retest(0.3) W=32     |     1648 |     1617 |
| k1=0.25 retest(0.5) W=8      |      422 |      414 |
| k1=0.25 retest(0.5) W=16     |      704 |      692 |
| k1=0.25 retest(0.5) W=32     |      977 |      958 |
| k1=0.25 accelerate(0.5) W=8  |     3746 |     3680 |
| k1=0.25 accelerate(0.5) W=16 |     3939 |     3864 |
| k1=0.25 accelerate(0.5) W=32 |     4079 |     4003 |
| k1=0.25 accelerate(1.0) W=8  |     1224 |     1206 |
| k1=0.25 accelerate(1.0) W=16 |     1369 |     1349 |
| k1=0.25 accelerate(1.0) W=32 |     1526 |     1503 |
| k1=0.5 continue(0.5) W=8     |     1238 |     1215 |
| k1=0.5 continue(0.5) W=16    |     1578 |     1547 |
| k1=0.5 continue(0.5) W=32    |     1800 |     1768 |
| k1=0.5 continue(1.0) W=8     |      510 |      505 |
| k1=0.5 continue(1.0) W=16    |      802 |      791 |
| k1=0.5 continue(1.0) W=32    |     1029 |     1013 |
| k1=0.5 retest(0.3) W=8       |      518 |      507 |
| k1=0.5 retest(0.3) W=16      |      843 |      827 |
| k1=0.5 retest(0.3) W=32      |     1140 |     1118 |
| k1=0.5 retest(0.5) W=8       |      269 |      263 |
| k1=0.5 retest(0.5) W=16      |      461 |      453 |
| k1=0.5 retest(0.5) W=32      |      658 |      645 |
| k1=0.5 accelerate(0.5) W=8   |     2883 |     2825 |
| k1=0.5 accelerate(0.5) W=16  |     2993 |     2932 |
| k1=0.5 accelerate(0.5) W=32  |     3079 |     3017 |
| k1=0.5 accelerate(1.0) W=8   |     1000 |      984 |
| k1=0.5 accelerate(1.0) W=16  |     1115 |     1099 |
| k1=0.5 accelerate(1.0) W=32  |     1212 |     1194 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = -0.0026% inside the 32 bars after any confirmed sequence (n = 12,703) versus -0.0083% outside; difference +0.0058% (95% day-block CI -0.0101 to +0.0229). Mean |M1 - M0| inside 0.0075 versus outside 0.0058. Correlation of (M1 - M0) with the primary sequence signal: -0.062.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.025. Rules:
```
|--- L_mom16 <= -1.75
|   |--- value: [-0.01]
|--- L_mom16 >  -1.75
|   |--- D_64 <= -1.00
|   |   |--- L_blo128 <= 0.50
|   |   |   |--- value: [0.01]
|   |   |--- L_blo128 >  0.50
|   |   |   |--- value: [0.00]
|   |--- D_64 >  -1.00
|   |   |--- L_leg <= 2.50
|   |   |   |--- value: [0.00]
|   |   |--- L_leg >  2.50
|   |   |   |--- value: [-0.01]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     65 |   0.190 |   0.185 |    -0.005 |
| 2025-04-01 | vol_8    |     65 |   0.205 |   0.219 |     0.014 |
| 2025-07-01 | dir_16   |     66 |   0.098 |   0.046 |    -0.053 |
| 2025-07-01 | vol_8    |     66 |   0.257 |   0.263 |     0.006 |
| 2025-10-01 | dir_16   |     65 |   0.040 |   0.049 |     0.009 |
| 2025-10-01 | vol_8    |     65 |   0.271 |   0.283 |     0.012 |
| 2026-01-01 | dir_16   |     63 |   0.165 |   0.051 |    -0.114 |
| 2026-01-01 | vol_8    |     63 |   0.198 |   0.205 |     0.007 |
| 2026-04-01 | dir_16   |     65 |   0.036 |   0.071 |     0.035 |
| 2026-04-01 | vol_8    |     65 |   0.285 |   0.285 |     0.001 |
| 2026-07-01 | dir_16   |     37 |  -0.044 |  -0.072 |    -0.027 |
| 2026-07-01 | vol_8    |     37 |   0.334 |   0.335 |     0.001 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |   0.090 |   0.065 |    -0.025 |  -0.052 |   0.001 |
| trees depth 3 (registered)                        | vol_8    |   0.255 |   0.262 |     0.007 |   0.003 |   0.010 |
| ridge, all features                               | dir_16   |   0.061 |   0.045 |    -0.016 |  -0.036 |   0.005 |
| ridge, all features                               | vol_8    |   0.291 |   0.292 |     0.001 |  -0.002 |   0.005 |
| trees depth 2, 30 iterations                      | dir_16   |   0.085 |   0.071 |    -0.014 |  -0.037 |   0.009 |
| trees depth 2, 30 iterations                      | vol_8    |   0.155 |   0.156 |     0.001 |  -0.000 |   0.002 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |   0.090 |   0.059 |    -0.031 |  -0.054 |  -0.006 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.255 |   0.261 |     0.006 |   0.003 |   0.009 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.