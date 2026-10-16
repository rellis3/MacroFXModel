# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 564. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +2.74 (k1=0.25 accelerate(1.0) W=8), its validation+OOS t = -0.11; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return -0.0014 (5-95%: -0.0366 to +0.0220); move to favourable share +0.0157; response share +0.0093.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.2771 |              -0.1192 |             -0.0328 | True              |             0.0428 |            -0.5811 | False          |              0.2445 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.015 |  0.421 | 14490 |    217 |
| VAL                       |    0.002 |  0.043 | 11985 |    183 |
| OOS                       |   -0.026 | -0.581 | 10068 |    153 |
| OOS R2 without s / with s |    0.205 |  0.205 | 10068 |    153 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | True                    |              -0.001 |                     | False            |               0.017 |                 0.027 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 585 |    213 |        0.006 |          0.005 |  -0.023 |   0.031 |         0.388 |
| all       | IS     | ret4     | 585 |    213 |        0.015 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret16    | 585 |    213 |       -0.021 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 585 |    213 |       -0.023 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 585 |    213 |        0.340 |          0.053 |   0.015 |   0.090 |         0.003 |
| all       | IS     | adv16    | 585 |    213 |        0.349 |          0.059 |   0.015 |   0.100 |         0.003 |
| all       | IS     | resp64   | 585 |    213 |        0.545 |          0.016 |  -0.026 |   0.064 |         0.237 |
| all       | IS     | vol8     | 585 |    213 |       -1.992 |        nan     | nan     | nan     |         0.355 |
| all       | VAL    | ret8     | 480 |    175 |        0.010 |          0.013 |  -0.032 |   0.057 |         0.290 |
| all       | VAL    | ret4     | 480 |    175 |       -0.022 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret16    | 480 |    175 |       -0.012 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 480 |    175 |       -0.064 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 480 |    175 |        0.335 |          0.035 |  -0.014 |   0.077 |         0.067 |
| all       | VAL    | adv16    | 480 |    175 |        0.340 |          0.042 |   0.002 |   0.082 |         0.020 |
| all       | VAL    | resp64   | 480 |    175 |        0.527 |         -0.018 |  -0.068 |   0.028 |         0.775 |
| all       | VAL    | vol8     | 480 |    175 |       -1.662 |        nan     | nan     | nan     |         0.003 |
| all       | OOS    | ret8     | 393 |    135 |        0.040 |          0.044 |  -0.012 |   0.101 |         0.062 |
| all       | OOS    | ret4     | 393 |    135 |        0.029 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret16    | 393 |    135 |        0.036 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 393 |    135 |        0.038 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 393 |    135 |        0.313 |         -0.000 |  -0.046 |   0.042 |         0.507 |
| all       | OOS    | adv16    | 393 |    135 |        0.351 |          0.039 |  -0.010 |   0.089 |         0.066 |
| all       | OOS    | resp64   | 393 |    135 |        0.573 |          0.020 |  -0.039 |   0.077 |         0.266 |
| all       | OOS    | vol8     | 393 |    135 |       -1.283 |          0.424 |   0.311 |   0.542 |         0.000 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 585 |        nan |     nan |     nan |         0.000 |
| IS     | 1-2 h    | 585 |        nan |     nan |     nan |         0.000 |
| IS     | 2-4 h    | 585 |        nan |     nan |     nan |         0.000 |
| IS     | 4-8 h    | 585 |        nan |     nan |     nan |         0.000 |
| IS     | 8-16 h   | 585 |        nan |     nan |     nan |         0.000 |
| VAL    | 0-1 h    | 480 |        nan |     nan |     nan |         0.000 |
| VAL    | 1-2 h    | 480 |        nan |     nan |     nan |         0.000 |
| VAL    | 2-4 h    | 480 |        nan |     nan |     nan |         0.000 |
| VAL    | 4-8 h    | 480 |        nan |     nan |     nan |         0.000 |
| VAL    | 8-16 h   | 480 |        nan |     nan |     nan |         0.000 |
| OOS    | 0-1 h    | 393 |        nan |     nan |     nan |         0.000 |
| OOS    | 1-2 h    | 393 |        nan |     nan |     nan |         0.000 |
| OOS    | 2-4 h    | 393 |        nan |     nan |     nan |         0.000 |
| OOS    | 4-8 h    | 393 |        nan |     nan |     nan |         0.000 |
| OOS    | 8-16 h   | 393 |        nan |     nan |     nan |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.012 | -0.977 | 14680 |    217 |
| VAL                       |   -0.001 | -0.080 | 12145 |    183 |
| OOS                       |    0.018 |  0.676 | 10195 |    153 |
| OOS R2 without s / with s |    0.001 |  0.000 | 10195 |    153 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|----:|------------:|----------:|----------:|---------:|---------:|
| VAL     | 480 |      0.0096 |    0.5000 |    0.0046 |  -0.0372 |   0.0452 |
| VAL     | 480 |      0.0096 |    1.0000 |   -0.0004 |  -0.0422 |   0.0402 |
| VAL     | 480 |      0.0096 |    2.0000 |   -0.0104 |  -0.0522 |   0.0302 |
| OOS     | 393 |      0.0400 |    0.5000 |    0.0350 |  -0.0217 |   0.0871 |
| OOS     | 393 |      0.0400 |    1.0000 |    0.0300 |  -0.0267 |   0.0821 |
| OOS     | 393 |      0.0400 |    2.0000 |    0.0200 |  -0.0367 |   0.0721 |
| VAL+OOS | 873 |      0.0233 |    0.5000 |    0.0183 |  -0.0161 |   0.0521 |
| VAL+OOS | 873 |      0.0233 |    1.0000 |    0.0133 |  -0.0211 |   0.0471 |
| VAL+OOS | 873 |      0.0233 |    2.0000 |    0.0033 |  -0.0311 |   0.0371 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |     t |
|:-----------------------------|-----:|-------:|------:|
| k1=0.25 accelerate(1.0) W=8  |  478 |  0.049 | 3.030 |
| k1=0.25 accelerate(0.5) W=32 | 1461 |  0.017 | 2.261 |
| k1=0.25 accelerate(1.0) W=16 |  528 |  0.038 | 2.227 |
| k1=0.5 accelerate(0.5) W=32  | 1063 |  0.018 | 2.191 |
| k1=0.25 accelerate(1.0) W=32 |  593 |  0.038 | 2.162 |
| k1=0.25 accelerate(0.5) W=16 | 1410 |  0.016 | 2.061 |
| k1=0.5 accelerate(1.0) W=8   |  378 |  0.035 | 1.960 |
| k1=0.25 accelerate(0.5) W=8  | 1322 |  0.016 | 1.930 |
| k1=0.5 accelerate(1.0) W=32  |  460 |  0.033 | 1.802 |
| k1=0.5 accelerate(1.0) W=16  |  424 |  0.033 | 1.723 |
| k1=0.5 accelerate(0.5) W=16  | 1033 |  0.014 | 1.722 |
| k1=0.5 accelerate(0.5) W=8   |  983 |  0.015 | 1.702 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1983 |     1844 |
| k1=0.25 continue(0.5) W=16   |     2460 |     2252 |
| k1=0.25 continue(0.5) W=32   |     2772 |     2530 |
| k1=0.25 continue(1.0) W=8    |      774 |      726 |
| k1=0.25 continue(1.0) W=16   |     1177 |     1081 |
| k1=0.25 continue(1.0) W=32   |     1543 |     1410 |
| k1=0.25 retest(0.3) W=8      |      745 |      694 |
| k1=0.25 retest(0.3) W=16     |     1231 |     1129 |
| k1=0.25 retest(0.3) W=32     |     1648 |     1487 |
| k1=0.25 retest(0.5) W=8      |      422 |      392 |
| k1=0.25 retest(0.5) W=16     |      704 |      650 |
| k1=0.25 retest(0.5) W=32     |      977 |      880 |
| k1=0.25 accelerate(0.5) W=8  |     3746 |     3484 |
| k1=0.25 accelerate(0.5) W=16 |     3939 |     3656 |
| k1=0.25 accelerate(0.5) W=32 |     4079 |     3791 |
| k1=0.25 accelerate(1.0) W=8  |     1224 |     1158 |
| k1=0.25 accelerate(1.0) W=16 |     1369 |     1288 |
| k1=0.25 accelerate(1.0) W=32 |     1526 |     1434 |
| k1=0.5 continue(0.5) W=8     |     1238 |     1155 |
| k1=0.5 continue(0.5) W=16    |     1578 |     1458 |
| k1=0.5 continue(0.5) W=32    |     1800 |     1659 |
| k1=0.5 continue(1.0) W=8     |      510 |      482 |
| k1=0.5 continue(1.0) W=16    |      802 |      738 |
| k1=0.5 continue(1.0) W=32    |     1029 |      934 |
| k1=0.5 retest(0.3) W=8       |      518 |      489 |
| k1=0.5 retest(0.3) W=16      |      843 |      782 |
| k1=0.5 retest(0.3) W=32      |     1140 |     1033 |
| k1=0.5 retest(0.5) W=8       |      269 |      251 |
| k1=0.5 retest(0.5) W=16      |      461 |      426 |
| k1=0.5 retest(0.5) W=32      |      658 |      587 |
| k1=0.5 accelerate(0.5) W=8   |     2883 |     2675 |
| k1=0.5 accelerate(0.5) W=16  |     2993 |     2778 |
| k1=0.5 accelerate(0.5) W=32  |     3079 |     2859 |
| k1=0.5 accelerate(1.0) W=8   |     1000 |      942 |
| k1=0.5 accelerate(1.0) W=16  |     1115 |     1048 |
| k1=0.5 accelerate(1.0) W=32  |     1212 |     1139 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = -0.0202% inside the 32 bars after any confirmed sequence (n = 11,546) versus -0.0233% outside; difference +0.0031% (95% day-block CI -0.0626 to +0.0709). Mean |M1 - M0| inside 0.0448 versus outside 0.0290. Correlation of (M1 - M0) with the primary sequence signal: -0.049.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.106. Rules:
```
|--- L_blo128 <= 0.82
|   |--- L_mom128 <= -4.07
|   |   |--- value: [-0.07]
|   |--- L_mom128 >  -4.07
|   |   |--- L_state <= 0.00
|   |   |   |--- value: [0.01]
|   |   |--- L_state >  0.00
|   |   |   |--- value: [-0.01]
|--- L_blo128 >  0.82
|   |--- D_32 <= -0.23
|   |   |--- L_mom128 <= 1.02
|   |   |   |--- value: [0.06]
|   |   |--- L_mom128 >  1.02
|   |   |   |--- value: [0.10]
|   |--- D_32 >  -0.23
|   |   |--- D_64 <= 2.26
|   |   |   |--- value: [0.05]
|   |   |--- D_64 >  2.26
|   |   |   |--- value: [0.02]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |   0.079 |   0.004 |    -0.074 |
| 2025-04-01 | vol_8    |     64 |   0.127 |   0.141 |     0.014 |
| 2025-07-01 | dir_16   |     66 |  -0.170 |  -0.102 |     0.068 |
| 2025-07-01 | vol_8    |     66 |   0.144 |   0.141 |    -0.003 |
| 2025-10-01 | dir_16   |     65 |  -0.055 |  -0.074 |    -0.020 |
| 2025-10-01 | vol_8    |     65 |   0.180 |   0.176 |    -0.004 |
| 2026-01-01 | dir_16   |     63 |   0.111 |  -0.014 |    -0.125 |
| 2026-01-01 | vol_8    |     63 |   0.203 |   0.190 |    -0.013 |
| 2026-04-01 | dir_16   |     64 |  -0.115 |  -0.112 |     0.003 |
| 2026-04-01 | vol_8    |     64 |   0.054 |   0.039 |    -0.015 |
| 2026-07-01 | dir_16   |     37 |  -0.121 |  -0.129 |    -0.008 |
| 2026-07-01 | vol_8    |     37 |  -0.029 |  -0.006 |     0.023 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.041 |  -0.067 |    -0.027 |  -0.060 |   0.009 |
| trees depth 3 (registered)                        | vol_8    |   0.155 |   0.150 |    -0.004 |  -0.009 |  -0.000 |
| ridge, all features                               | dir_16   |  -0.146 |  -0.092 |     0.055 |   0.029 |   0.079 |
| ridge, all features                               | vol_8    |   0.188 |   0.192 |     0.004 |  -0.001 |   0.008 |
| trees depth 2, 30 iterations                      | dir_16   |  -0.158 |  -0.113 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.075 |   0.075 |    -0.001 |  -0.003 |   0.002 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.041 |  -0.051 |    -0.010 |  -0.039 |   0.018 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.155 |   0.153 |    -0.002 |  -0.006 |   0.002 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.