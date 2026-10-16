# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 540. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +0.94 (k1=0.25 continue(0.5) W=32), its validation+OOS t = +0.91; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return +0.0010 (5-95%: -0.0143 to +0.0195); move to favourable share +0.0004; response share +0.0026.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.0140 |               0.1370 |              0.2117 | False             |            -1.3518 |            -0.6370 | True           |             -0.0031 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.027 |  0.833 | 17589 |    239 |
| VAL                       |   -0.046 | -1.352 | 14600 |    195 |
| OOS                       |   -0.025 | -0.637 | 12264 |    164 |
| OOS R2 without s / with s |    0.257 |  0.257 | 12264 |    164 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |               0.001 |                     | False            |               0.014 |                 0.010 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 619 |    216 |        0.003 |          0.007 |  -0.012 |   0.026 |         0.245 |
| all       | IS     | ret4     | 619 |    216 |        0.008 |          0.010 |  -0.006 |   0.025 |         0.091 |
| all       | IS     | ret16    | 619 |    216 |       -0.001 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 619 |    216 |        0.004 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 619 |    216 |        0.317 |          0.022 |  -0.016 |   0.064 |         0.149 |
| all       | IS     | adv16    | 619 |    216 |        0.315 |          0.019 |  -0.019 |   0.057 |         0.177 |
| all       | IS     | resp64   | 619 |    216 |        0.578 |          0.022 |  -0.021 |   0.064 |         0.153 |
| all       | IS     | vol8     | 619 |    216 |       -2.308 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret8     | 513 |    178 |        0.016 |          0.020 |   0.001 |   0.042 |         0.022 |
| all       | VAL    | ret4     | 513 |    178 |        0.006 |          0.009 |  -0.005 |   0.024 |         0.113 |
| all       | VAL    | ret16    | 513 |    178 |        0.018 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 513 |    178 |        0.029 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 513 |    178 |        0.310 |          0.024 |  -0.020 |   0.066 |         0.145 |
| all       | VAL    | adv16    | 513 |    178 |        0.333 |          0.047 |   0.006 |   0.090 |         0.016 |
| all       | VAL    | resp64   | 513 |    178 |        0.552 |          0.014 |  -0.035 |   0.060 |         0.279 |
| all       | VAL    | vol8     | 513 |    178 |       -2.461 |          0.114 |  -0.006 |   0.230 |         0.031 |
| all       | OOS    | ret8     | 416 |    137 |       -0.003 |         -0.002 |  -0.018 |   0.014 |         0.614 |
| all       | OOS    | ret4     | 416 |    137 |       -0.006 |         -0.007 |  -0.017 |   0.007 |         0.835 |
| all       | OOS    | ret16    | 416 |    137 |       -0.001 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 416 |    137 |        0.003 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 416 |    137 |        0.250 |         -0.009 |  -0.052 |   0.038 |         0.663 |
| all       | OOS    | adv16    | 416 |    137 |        0.284 |          0.026 |  -0.018 |   0.074 |         0.134 |
| all       | OOS    | resp64   | 416 |    137 |        0.462 |         -0.048 |  -0.107 |   0.013 |         0.952 |
| all       | OOS    | vol8     | 416 |    137 |       -2.890 |        nan     | nan     | nan     |         0.340 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 619 |      0.010 |  -0.006 |   0.024 |         0.092 |
| IS     | 1-2 h    | 619 |     -0.003 |  -0.018 |   0.012 |         0.682 |
| IS     | 2-4 h    | 619 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 619 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 619 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 513 |      0.009 |  -0.005 |   0.025 |         0.124 |
| VAL    | 1-2 h    | 513 |      0.012 |  -0.001 |   0.024 |         0.035 |
| VAL    | 2-4 h    | 513 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 513 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 513 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 416 |     -0.007 |  -0.018 |   0.006 |         0.863 |
| OOS    | 1-2 h    | 416 |      0.005 |  -0.004 |   0.014 |         0.149 |
| OOS    | 2-4 h    | 416 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 416 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 416 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.000 | -0.035 | 17646 |    239 |
| VAL                       |    0.001 |  0.078 | 14645 |    195 |
| OOS                       |    0.004 |  0.604 | 12323 |    164 |
| OOS R2 without s / with s |   -0.006 | -0.006 | 12323 |    164 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|----:|------------:|----------:|----------:|---------:|---------:|
| VAL     | 513 |      0.0159 |    0.5000 |    0.0109 |  -0.0079 |   0.0309 |
| VAL     | 513 |      0.0159 |    1.0000 |    0.0059 |  -0.0129 |   0.0259 |
| VAL     | 513 |      0.0159 |    2.0000 |   -0.0041 |  -0.0229 |   0.0159 |
| OOS     | 416 |     -0.0032 |    0.5000 |   -0.0082 |  -0.0237 |   0.0079 |
| OOS     | 416 |     -0.0032 |    1.0000 |   -0.0132 |  -0.0287 |   0.0029 |
| OOS     | 416 |     -0.0032 |    2.0000 |   -0.0232 |  -0.0387 |  -0.0071 |
| VAL+OOS | 929 |      0.0074 |    0.5000 |    0.0024 |  -0.0104 |   0.0161 |
| VAL+OOS | 929 |      0.0074 |    1.0000 |   -0.0026 |  -0.0154 |   0.0111 |
| VAL+OOS | 929 |      0.0074 |    2.0000 |   -0.0126 |  -0.0254 |   0.0011 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |     t |
|:-----------------------------|-----:|-------:|------:|
| k1=0.25 accelerate(0.5) W=16 | 1473 |  0.008 | 1.603 |
| k1=0.25 continue(0.5) W=32   | 1061 |  0.010 | 1.523 |
| k1=0.25 continue(0.5) W=8    |  743 |  0.009 | 1.159 |
| k1=0.25 accelerate(0.5) W=8  | 1380 |  0.005 | 1.019 |
| k1=0.25 continue(0.5) W=16   |  927 |  0.006 | 0.872 |
| k1=0.25 accelerate(0.5) W=32 | 1525 |  0.004 | 0.763 |
| k1=0.5 continue(0.5) W=32    |  707 |  0.007 | 0.751 |
| k1=0.5 continue(0.5) W=16    |  619 |  0.007 | 0.709 |
| k1=0.5 accelerate(1.0) W=8   |  392 |  0.007 | 0.511 |
| k1=0.5 accelerate(0.5) W=16  | 1079 |  0.003 | 0.452 |
| k1=0.5 retest(0.3) W=8       |  228 |  0.006 | 0.426 |
| k1=0.5 accelerate(1.0) W=16  |  442 |  0.005 | 0.406 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1983 |     1953 |
| k1=0.25 continue(0.5) W=16   |     2460 |     2411 |
| k1=0.25 continue(0.5) W=32   |     2772 |     2720 |
| k1=0.25 continue(1.0) W=8    |      774 |      762 |
| k1=0.25 continue(1.0) W=16   |     1177 |     1159 |
| k1=0.25 continue(1.0) W=32   |     1543 |     1521 |
| k1=0.25 retest(0.3) W=8      |      745 |      730 |
| k1=0.25 retest(0.3) W=16     |     1231 |     1208 |
| k1=0.25 retest(0.3) W=32     |     1648 |     1617 |
| k1=0.25 retest(0.5) W=8      |      422 |      414 |
| k1=0.25 retest(0.5) W=16     |      704 |      692 |
| k1=0.25 retest(0.5) W=32     |      977 |      958 |
| k1=0.25 accelerate(0.5) W=8  |     3746 |     3681 |
| k1=0.25 accelerate(0.5) W=16 |     3939 |     3866 |
| k1=0.25 accelerate(0.5) W=32 |     4079 |     4005 |
| k1=0.25 accelerate(1.0) W=8  |     1224 |     1206 |
| k1=0.25 accelerate(1.0) W=16 |     1369 |     1349 |
| k1=0.25 accelerate(1.0) W=32 |     1526 |     1504 |
| k1=0.5 continue(0.5) W=8     |     1238 |     1216 |
| k1=0.5 continue(0.5) W=16    |     1578 |     1548 |
| k1=0.5 continue(0.5) W=32    |     1800 |     1769 |
| k1=0.5 continue(1.0) W=8     |      510 |      505 |
| k1=0.5 continue(1.0) W=16    |      802 |      791 |
| k1=0.5 continue(1.0) W=32    |     1029 |     1014 |
| k1=0.5 retest(0.3) W=8       |      518 |      507 |
| k1=0.5 retest(0.3) W=16      |      843 |      827 |
| k1=0.5 retest(0.3) W=32      |     1140 |     1118 |
| k1=0.5 retest(0.5) W=8       |      269 |      263 |
| k1=0.5 retest(0.5) W=16      |      461 |      453 |
| k1=0.5 retest(0.5) W=32      |      658 |      645 |
| k1=0.5 accelerate(0.5) W=8   |     2883 |     2826 |
| k1=0.5 accelerate(0.5) W=16  |     2993 |     2933 |
| k1=0.5 accelerate(0.5) W=32  |     3079 |     3018 |
| k1=0.5 accelerate(1.0) W=8   |     1000 |      984 |
| k1=0.5 accelerate(1.0) W=16  |     1115 |     1099 |
| k1=0.5 accelerate(1.0) W=32  |     1212 |     1195 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = -0.0013% inside the 32 bars after any confirmed sequence (n = 12,703) versus -0.0122% outside; difference +0.0109% (95% day-block CI -0.0046 to +0.0279). Mean |M1 - M0| inside 0.0155 versus outside 0.0131. Correlation of (M1 - M0) with the primary sequence signal: -0.015.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.067. Rules:
```
|--- L_leg <= 1.71
|   |--- L_bhi128 <= 0.64
|   |   |--- L_legratio <= 0.31
|   |   |   |--- value: [0.01]
|   |   |--- L_legratio >  0.31
|   |   |   |--- value: [-0.00]
|   |--- L_bhi128 >  0.64
|   |   |--- L_mom32 <= -0.75
|   |   |   |--- value: [-0.03]
|   |   |--- L_mom32 >  -0.75
|   |   |   |--- value: [-0.01]
|--- L_leg >  1.71
|   |--- L_var <= 0.35
|   |   |--- L_legratio <= 2.10
|   |   |   |--- value: [0.00]
|   |   |--- L_legratio >  2.10
|   |   |   |--- value: [0.01]
|   |--- L_var >  0.35
|   |   |--- L_var <= 0.77
|   |   |   |--- value: [0.01]
|   |   |--- L_var >  0.77
|   |   |   |--- value: [0.02]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     65 |  -0.022 |  -0.017 |     0.006 |
| 2025-04-01 | vol_8    |     65 |   0.102 |   0.101 |    -0.001 |
| 2025-07-01 | dir_16   |     66 |   0.019 |  -0.014 |    -0.033 |
| 2025-07-01 | vol_8    |     66 |   0.163 |   0.167 |     0.004 |
| 2025-10-01 | dir_16   |     65 |   0.074 |   0.027 |    -0.047 |
| 2025-10-01 | vol_8    |     65 |   0.150 |   0.146 |    -0.005 |
| 2026-01-01 | dir_16   |     63 |  -0.105 |  -0.075 |     0.030 |
| 2026-01-01 | vol_8    |     63 |   0.141 |   0.154 |     0.013 |
| 2026-04-01 | dir_16   |     65 |  -0.087 |  -0.042 |     0.046 |
| 2026-04-01 | vol_8    |     65 |   0.196 |   0.184 |    -0.012 |
| 2026-07-01 | dir_16   |     37 |   0.073 |   0.048 |    -0.025 |
| 2026-07-01 | vol_8    |     37 |   0.144 |   0.138 |    -0.006 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.014 |  -0.016 |    -0.002 |  -0.030 |   0.024 |
| trees depth 3 (registered)                        | vol_8    |   0.171 |   0.169 |    -0.001 |  -0.006 |   0.004 |
| ridge, all features                               | dir_16   |  -0.047 |  -0.048 |    -0.001 |  -0.016 |   0.015 |
| ridge, all features                               | vol_8    |   0.205 |   0.204 |    -0.001 |  -0.004 |   0.003 |
| trees depth 2, 30 iterations                      | dir_16   |  -0.074 |  -0.094 |    -0.021 |  -0.044 |   0.003 |
| trees depth 2, 30 iterations                      | vol_8    |   0.079 |   0.079 |    -0.000 |  -0.002 |   0.001 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.014 |  -0.019 |    -0.005 |  -0.028 |   0.017 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.171 |   0.170 |    -0.000 |  -0.004 |   0.004 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.