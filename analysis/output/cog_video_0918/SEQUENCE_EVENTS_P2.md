# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 572. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = -0.49 (k1=0.25 accelerate(1.0) W=32), its validation+OOS t = -1.13; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 200): mean matched effect on the 2 h signed return +0.0007 (5-95%: -0.0365 to +0.0380); move to favourable share +0.0053; response share -0.0034.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.0920 |              -0.0198 |              0.0757 | True              |            -1.2059 |            -1.6201 | True           |              0.0873 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.024 |  0.764 | 14793 |    217 |
| VAL                       |   -0.039 | -1.206 | 12238 |    182 |
| OOS                       |   -0.057 | -1.620 | 12018 |    178 |
| OOS R2 without s / with s |    0.137 |  0.137 | 12018 |    178 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | True      | False                   |               0.001 |                     | False            |               0.004 |                 0.012 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 776 |    226 |       -0.028 |         -0.024 |  -0.058 |   0.009 |         0.923 |
| all       | IS     | ret4     | 776 |    226 |       -0.009 |         -0.005 |  -0.031 |   0.019 |         0.670 |
| all       | IS     | ret16    | 776 |    226 |       -0.033 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 776 |    226 |       -0.056 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 776 |    226 |        0.334 |          0.017 |  -0.017 |   0.052 |         0.159 |
| all       | IS     | adv16    | 776 |    226 |        0.362 |          0.044 |   0.006 |   0.078 |         0.010 |
| all       | IS     | resp64   | 776 |    226 |        0.566 |         -0.000 |  -0.040 |   0.039 |         0.488 |
| all       | IS     | vol8     | 776 |    226 |       -1.785 |          0.017 |  -0.093 |   0.129 |         0.389 |
| all       | VAL    | ret8     | 543 |    174 |        0.012 |          0.017 |  -0.052 |   0.077 |         0.322 |
| all       | VAL    | ret4     | 543 |    174 |       -0.013 |         -0.013 |  -0.072 |   0.039 |         0.664 |
| all       | VAL    | ret16    | 543 |    174 |        0.004 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 543 |    174 |        0.025 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 543 |    174 |        0.368 |          0.046 |   0.005 |   0.090 |         0.018 |
| all       | VAL    | adv16    | 543 |    174 |        0.331 |          0.006 |  -0.033 |   0.049 |         0.400 |
| all       | VAL    | resp64   | 543 |    174 |        0.630 |          0.065 |   0.012 |   0.112 |         0.008 |
| all       | VAL    | vol8     | 543 |    174 |       -1.648 |          0.115 |  -0.028 |   0.270 |         0.053 |
| all       | OOS    | ret8     | 539 |    170 |        0.004 |          0.008 |  -0.036 |   0.052 |         0.366 |
| all       | OOS    | ret4     | 539 |    170 |        0.013 |        nan     | nan     | nan     |         0.071 |
| all       | OOS    | ret16    | 539 |    170 |       -0.032 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 539 |    170 |       -0.043 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 539 |    170 |        0.377 |          0.041 |   0.000 |   0.084 |         0.024 |
| all       | OOS    | adv16    | 539 |    170 |        0.354 |          0.036 |  -0.008 |   0.083 |         0.068 |
| all       | OOS    | resp64   | 539 |    170 |        0.592 |          0.010 |  -0.038 |   0.060 |         0.320 |
| all       | OOS    | vol8     | 539 |    170 |       -1.633 |          0.069 |  -0.036 |   0.170 |         0.116 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 776 |     -0.005 |  -0.029 |   0.019 |         0.695 |
| IS     | 1-2 h    | 776 |     -0.018 |  -0.044 |   0.007 |         0.932 |
| IS     | 2-4 h    | 776 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 776 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 776 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 543 |     -0.013 |  -0.073 |   0.040 |         0.659 |
| VAL    | 1-2 h    | 543 |      0.030 |   0.001 |   0.059 |         0.024 |
| VAL    | 2-4 h    | 543 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 543 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 543 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 539 |    nan     | nan     | nan     |         0.075 |
| OOS    | 1-2 h    | 539 |    nan     | nan     | nan     |         0.249 |
| OOS    | 2-4 h    | 539 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 539 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 539 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.027 | -1.622 | 15177 |    234 |
| VAL                       |   -0.005 | -0.169 | 12563 |    191 |
| OOS                       |   -0.026 | -1.267 | 12447 |    190 |
| OOS R2 without s / with s |   -0.016 | -0.015 | 12447 |    190 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|-----:|------------:|----------:|----------:|---------:|---------:|
| VAL     |  543 |      0.0116 |    0.5000 |    0.0066 |  -0.0533 |   0.0674 |
| VAL     |  543 |      0.0116 |    1.0000 |    0.0016 |  -0.0583 |   0.0624 |
| VAL     |  543 |      0.0116 |    2.0000 |   -0.0084 |  -0.0683 |   0.0524 |
| OOS     |  539 |      0.0037 |    0.5000 |   -0.0013 |  -0.0407 |   0.0381 |
| OOS     |  539 |      0.0037 |    1.0000 |   -0.0063 |  -0.0457 |   0.0331 |
| OOS     |  539 |      0.0037 |    2.0000 |   -0.0163 |  -0.0557 |   0.0231 |
| VAL+OOS | 1082 |      0.0076 |    0.5000 |    0.0026 |  -0.0351 |   0.0379 |
| VAL+OOS | 1082 |      0.0076 |    1.0000 |   -0.0024 |  -0.0401 |   0.0329 |
| VAL+OOS | 1082 |      0.0076 |    2.0000 |   -0.0124 |  -0.0501 |   0.0229 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |      t |
|:-----------------------------|-----:|-------:|-------:|
| k1=0.25 continue(0.5) W=16   | 1303 | -0.004 | -0.308 |
| k1=0.25 continue(0.5) W=8    | 1094 | -0.005 | -0.368 |
| k1=0.25 accelerate(1.0) W=32 |  844 | -0.009 | -0.426 |
| k1=0.25 accelerate(0.5) W=32 | 2068 | -0.005 | -0.565 |
| k1=0.25 accelerate(1.0) W=8  |  655 | -0.012 | -0.610 |
| k1=0.25 retest(0.5) W=16     |  605 | -0.012 | -0.612 |
| k1=0.25 accelerate(1.0) W=16 |  759 | -0.014 | -0.680 |
| k1=0.25 continue(0.5) W=32   | 1450 | -0.009 | -0.698 |
| k1=0.5 retest(0.5) W=16      |  382 | -0.015 | -0.724 |
| k1=0.25 retest(0.5) W=8      |  412 | -0.017 | -0.785 |
| k1=0.5 accelerate(0.5) W=16  | 1369 | -0.009 | -0.807 |
| k1=0.5 accelerate(0.5) W=32  | 1422 | -0.009 | -0.823 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     2807 |     2674 |
| k1=0.25 continue(0.5) W=16   |     3334 |     3166 |
| k1=0.25 continue(0.5) W=32   |     3743 |     3557 |
| k1=0.25 continue(1.0) W=8    |     1023 |      990 |
| k1=0.25 continue(1.0) W=16   |     1556 |     1504 |
| k1=0.25 continue(1.0) W=32   |     1995 |     1918 |
| k1=0.25 retest(0.3) W=8      |     1556 |     1490 |
| k1=0.25 retest(0.3) W=16     |     2250 |     2150 |
| k1=0.25 retest(0.3) W=32     |     2742 |     2613 |
| k1=0.25 retest(0.5) W=8      |      893 |      852 |
| k1=0.25 retest(0.5) W=16     |     1379 |     1317 |
| k1=0.25 retest(0.5) W=32     |     1782 |     1698 |
| k1=0.25 accelerate(0.5) W=8  |     5185 |     4920 |
| k1=0.25 accelerate(0.5) W=16 |     5391 |     5118 |
| k1=0.25 accelerate(0.5) W=32 |     5571 |     5292 |
| k1=0.25 accelerate(1.0) W=8  |     1622 |     1564 |
| k1=0.25 accelerate(1.0) W=16 |     1861 |     1799 |
| k1=0.25 accelerate(1.0) W=32 |     2056 |     1990 |
| k1=0.5 continue(0.5) W=8     |     1562 |     1489 |
| k1=0.5 continue(0.5) W=16    |     1953 |     1858 |
| k1=0.5 continue(0.5) W=32    |     2274 |     2162 |
| k1=0.5 continue(1.0) W=8     |      607 |      585 |
| k1=0.5 continue(1.0) W=16    |      934 |      900 |
| k1=0.5 continue(1.0) W=32    |     1255 |     1212 |
| k1=0.5 retest(0.3) W=8       |     1050 |     1011 |
| k1=0.5 retest(0.3) W=16      |     1503 |     1441 |
| k1=0.5 retest(0.3) W=32      |     1873 |     1789 |
| k1=0.5 retest(0.5) W=8       |      558 |      540 |
| k1=0.5 retest(0.5) W=16      |      869 |      835 |
| k1=0.5 retest(0.5) W=32      |     1159 |     1110 |
| k1=0.5 accelerate(0.5) W=8   |     3725 |     3537 |
| k1=0.5 accelerate(0.5) W=16  |     3829 |     3635 |
| k1=0.5 accelerate(0.5) W=32  |     3953 |     3756 |
| k1=0.5 accelerate(1.0) W=8   |     1256 |     1208 |
| k1=0.5 accelerate(1.0) W=16  |     1413 |     1361 |
| k1=0.5 accelerate(1.0) W=32  |     1559 |     1505 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0159% inside the 32 bars after any confirmed sequence (n = 14,412) versus +0.0071% outside; difference +0.0088% (95% day-block CI -0.0404 to +0.0594). Mean |M1 - M0| inside 0.0365 versus outside 0.0181. Correlation of (M1 - M0) with the primary sequence signal: +0.074.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared +0.001. Rules:
```
|--- L_mom128 <= -3.40
|   |--- value: [-0.09]
|--- L_mom128 >  -3.40
|   |--- L_bhi128 <= 0.75
|   |   |--- L_pos64 <= 0.46
|   |   |   |--- value: [0.02]
|   |   |--- L_pos64 >  0.46
|   |   |   |--- value: [-0.00]
|   |--- L_bhi128 >  0.75
|   |   |--- L_pos256 <= 0.28
|   |   |   |--- value: [-0.03]
|   |   |--- L_pos256 >  0.28
|   |   |   |--- value: [-0.01]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |  -0.062 |   0.060 |     0.122 |
| 2025-04-01 | vol_8    |     64 |   0.247 |   0.236 |    -0.011 |
| 2025-07-01 | dir_16   |     66 |  -0.045 |   0.036 |     0.080 |
| 2025-07-01 | vol_8    |     66 |   0.257 |   0.282 |     0.025 |
| 2025-10-01 | dir_16   |     64 |   0.033 |   0.046 |     0.012 |
| 2025-10-01 | vol_8    |     64 |   0.307 |   0.311 |     0.004 |
| 2026-01-01 | dir_16   |     63 |  -0.006 |   0.049 |     0.055 |
| 2026-01-01 | vol_8    |     63 |   0.199 |   0.233 |     0.034 |
| 2026-04-01 | dir_16   |     65 |  -0.002 |  -0.001 |     0.001 |
| 2026-04-01 | vol_8    |     65 |   0.171 |   0.152 |    -0.019 |
| 2026-07-01 | dir_16   |     66 |  -0.037 |   0.067 |     0.104 |
| 2026-07-01 | vol_8    |     66 |   0.182 |   0.175 |    -0.007 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.020 |   0.043 |     0.063 |   0.033 |   0.093 |
| trees depth 3 (registered)                        | vol_8    |   0.262 |   0.271 |     0.009 |   0.003 |   0.015 |
| ridge, all features                               | dir_16   |  -0.040 |  -0.003 |     0.037 |   0.012 |   0.062 |
| ridge, all features                               | vol_8    |   0.290 |   0.291 |     0.001 |  -0.002 |   0.005 |
| trees depth 2, 30 iterations                      | dir_16   |   0.017 |   0.037 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.169 |   0.215 |     0.045 |   0.036 |   0.055 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.020 |   0.041 |     0.060 |   0.036 |   0.087 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.262 |   0.270 |     0.008 |   0.003 |   0.014 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
| direction_change   | trigger          | confirmed        |   d |   minutes_to_confirm |   nasdaq_state |   ret_1h |   ret_2h |   ret_4h | nasdaq_responded_within_16h   |   minutes_to_response | result_4h_race   |
|:-------------------|:-----------------|:-----------------|----:|---------------------:|---------------:|---------:|---------:|---------:|:------------------------------|----------------------:|:-----------------|
| 2026-09-16 12:00   | 2026-09-16 14:30 | 2026-09-16 18:00 |   1 |                  360 |              1 |   -0.589 |   -0.667 |  nan     | True                          |               810.000 | adverse          |
| 2026-09-16 17:15   | 2026-09-16 18:00 | 2026-09-16 19:00 |   1 |                  105 |             -1 |   -0.078 |   -0.063 |    0.178 | True                          |               270.000 | adverse          |
| 2026-09-17 08:30   | 2026-09-17 16:15 | 2026-09-17 19:45 |  -1 |                  675 |              1 |    0.150 |  nan     |    0.148 | True                          |               330.000 | neither          |
| 2026-09-18 04:15   | 2026-09-18 05:00 | 2026-09-18 06:00 |   1 |                  105 |              1 |    0.221 |    0.258 |   -0.028 | True                          |                90.000 | favourable       |
| 2026-09-18 10:45   | 2026-09-18 13:45 | 2026-09-18 15:15 |  -1 |                  270 |             -1 |    0.084 |   -0.055 |   -0.347 | False                         |               nan     | adverse          |
| 2026-09-18 15:15   | 2026-09-18 15:45 | 2026-09-18 17:15 |   1 |                  120 |             -1 |    0.025 |    0.292 |  nan     | True                          |               105.000 | favourable       |
| 2026-09-21 11:45   | 2026-09-21 12:15 | 2026-09-21 13:00 |   1 |                   75 |              1 |    0.646 |    1.097 |    1.511 | True                          |                45.000 | favourable       |
| 2026-09-22 07:45   | 2026-09-22 08:45 | 2026-09-22 09:00 |  -1 |                   75 |              1 |   -0.157 |   -0.106 |    0.065 | False                         |               nan     | neither          |
| 2026-09-22 09:00   | 2026-09-22 09:15 | 2026-09-22 11:45 |   1 |                  165 |              1 |   -0.125 |    0.333 |    0.315 | True                          |               120.000 | favourable       |
| 2026-09-22 11:45   | 2026-09-22 14:00 | 2026-09-22 17:30 |  -1 |                  345 |              1 |   -0.152 |   -0.243 |  nan     | False                         |               nan     | neither          |
| 2026-09-22 18:30   | 2026-09-23 00:15 | 2026-09-23 04:15 |   1 |                  585 |              1 |   -0.003 |    0.064 |    0.025 | False                         |               nan     | neither          |
| 2026-09-23 04:15   | 2026-09-23 05:45 | 2026-09-23 07:30 |  -1 |                  195 |              1 |    0.031 |    0.067 |    0.355 | True                          |               240.000 | favourable       |
| 2026-09-23 11:00   | 2026-09-23 13:00 | 2026-09-23 13:30 |   1 |                  150 |             -1 |   -0.918 |   -0.633 |   -0.928 | False                         |               nan     | adverse          |
| 2026-09-23 13:45   | 2026-09-23 14:00 | 2026-09-23 14:15 |   1 |                   30 |             -1 |    0.177 |    0.041 |    0.037 | False                         |               nan     | neither          |

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.