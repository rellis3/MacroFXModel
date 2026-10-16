# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 572. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +0.07 (k1=0.25 accelerate(0.5) W=32), its validation+OOS t = -0.29; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 200): mean matched effect on the 2 h signed return -0.0008 (5-95%: -0.0343 to +0.0372); move to favourable share +0.0081; response share -0.0016.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.1438 |              -0.0089 |              0.1151 | True              |            -1.3049 |            -1.7238 | True           |              0.1101 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.027 |  0.930 | 14793 |    217 |
| VAL                       |   -0.045 | -1.305 | 12238 |    182 |
| OOS                       |   -0.055 | -1.724 | 12018 |    178 |
| OOS R2 without s / with s |    0.137 |  0.137 | 12018 |    178 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |              -0.001 |                     | False            |              -0.019 |                -0.015 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 773 |    225 |       -0.034 |         -0.029 |  -0.061 |   0.004 |         0.958 |
| all       | IS     | ret4     | 773 |    225 |       -0.018 |        nan     | nan     | nan     |         0.121 |
| all       | IS     | ret16    | 773 |    225 |       -0.065 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 773 |    225 |       -0.100 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 773 |    225 |        0.310 |         -0.007 |  -0.041 |   0.028 |         0.669 |
| all       | IS     | adv16    | 773 |    225 |        0.380 |          0.063 |   0.023 |   0.100 |         0.000 |
| all       | IS     | resp64   | 773 |    225 |        0.543 |         -0.024 |  -0.065 |   0.017 |         0.871 |
| all       | IS     | vol8     | 773 |    225 |       -1.709 |        nan     | nan     | nan     |         0.007 |
| all       | VAL    | ret8     | 562 |    175 |       -0.029 |         -0.032 |  -0.087 |   0.027 |         0.826 |
| all       | VAL    | ret4     | 562 |    175 |       -0.039 |         -0.042 |  -0.101 |   0.008 |         0.949 |
| all       | VAL    | ret16    | 562 |    175 |       -0.059 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 562 |    175 |       -0.056 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 562 |    175 |        0.336 |          0.016 |  -0.025 |   0.056 |         0.244 |
| all       | VAL    | adv16    | 562 |    175 |        0.354 |          0.034 |  -0.008 |   0.073 |         0.058 |
| all       | VAL    | resp64   | 562 |    175 |        0.582 |          0.020 |  -0.027 |   0.067 |         0.199 |
| all       | VAL    | vol8     | 562 |    175 |       -1.639 |        nan     | nan     | nan     |         0.001 |
| all       | OOS    | ret8     | 634 |    175 |       -0.003 |          0.000 |  -0.033 |   0.038 |         0.490 |
| all       | OOS    | ret4     | 634 |    175 |       -0.005 |        nan     | nan     | nan     |         0.187 |
| all       | OOS    | ret16    | 634 |    175 |       -0.036 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 634 |    175 |       -0.081 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 634 |    175 |        0.330 |          0.000 |  -0.035 |   0.037 |         0.504 |
| all       | OOS    | adv16    | 634 |    175 |        0.361 |          0.036 |  -0.001 |   0.073 |         0.030 |
| all       | OOS    | resp64   | 634 |    175 |        0.560 |         -0.030 |  -0.074 |   0.011 |         0.919 |
| all       | OOS    | vol8     | 634 |    175 |       -1.604 |          0.138 |   0.042 |   0.236 |         0.005 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 773 |    nan     | nan     | nan     |         0.144 |
| IS     | 1-2 h    | 773 |    nan     | nan     | nan     |         0.119 |
| IS     | 2-4 h    | 773 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 773 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 773 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 562 |     -0.042 |  -0.102 |   0.005 |         0.949 |
| VAL    | 1-2 h    | 562 |      0.010 |  -0.025 |   0.047 |         0.297 |
| VAL    | 2-4 h    | 562 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 562 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 562 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 634 |    nan     | nan     | nan     |         0.164 |
| OOS    | 1-2 h    | 634 |    nan     | nan     | nan     |         0.217 |
| OOS    | 2-4 h    | 634 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 634 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 634 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.044 | -2.834 | 15177 |    234 |
| VAL                       |   -0.014 | -0.604 | 12563 |    191 |
| OOS                       |   -0.011 | -0.634 | 12447 |    190 |
| OOS R2 without s / with s |   -0.016 | -0.016 | 12447 |    190 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|-----:|------------:|----------:|----------:|---------:|---------:|
| VAL     |  562 |     -0.0286 |    0.5000 |   -0.0336 |  -0.0919 |   0.0216 |
| VAL     |  562 |     -0.0286 |    1.0000 |   -0.0386 |  -0.0969 |   0.0166 |
| VAL     |  562 |     -0.0286 |    2.0000 |   -0.0486 |  -0.1069 |   0.0066 |
| OOS     |  634 |     -0.0035 |    0.5000 |   -0.0085 |  -0.0423 |   0.0247 |
| OOS     |  634 |     -0.0035 |    1.0000 |   -0.0135 |  -0.0473 |   0.0197 |
| OOS     |  634 |     -0.0035 |    2.0000 |   -0.0235 |  -0.0573 |   0.0097 |
| VAL+OOS | 1196 |     -0.0153 |    0.5000 |   -0.0203 |  -0.0560 |   0.0122 |
| VAL+OOS | 1196 |     -0.0153 |    1.0000 |   -0.0253 |  -0.0610 |   0.0072 |
| VAL+OOS | 1196 |     -0.0153 |    2.0000 |   -0.0353 |  -0.0710 |  -0.0028 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |      t |
|:-----------------------------|-----:|-------:|-------:|
| k1=0.5 retest(0.3) W=32      |  777 | -0.001 | -0.053 |
| k1=0.25 accelerate(0.5) W=8  | 1930 | -0.001 | -0.058 |
| k1=0.25 accelerate(0.5) W=32 | 2074 | -0.001 | -0.151 |
| k1=0.25 accelerate(0.5) W=16 | 2002 | -0.002 | -0.251 |
| k1=0.25 retest(0.5) W=32     |  769 | -0.008 | -0.447 |
| k1=0.25 retest(0.5) W=16     |  594 | -0.009 | -0.448 |
| k1=0.5 retest(0.5) W=8       |  244 | -0.015 | -0.512 |
| k1=0.25 retest(0.3) W=32     | 1158 | -0.008 | -0.520 |
| k1=0.25 retest(0.5) W=8      |  423 | -0.013 | -0.530 |
| k1=0.5 retest(0.3) W=16      |  613 | -0.012 | -0.666 |
| k1=0.25 accelerate(1.0) W=32 |  872 | -0.018 | -0.753 |
| k1=0.25 continue(0.5) W=32   | 1493 | -0.011 | -0.824 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     3001 |     2863 |
| k1=0.25 continue(0.5) W=16   |     3574 |     3397 |
| k1=0.25 continue(0.5) W=32   |     3994 |     3797 |
| k1=0.25 continue(1.0) W=8    |     1073 |     1042 |
| k1=0.25 continue(1.0) W=16   |     1703 |     1637 |
| k1=0.25 continue(1.0) W=32   |     2195 |     2102 |
| k1=0.25 retest(0.3) W=8      |     1705 |     1615 |
| k1=0.25 retest(0.3) W=16     |     2422 |     2291 |
| k1=0.25 retest(0.3) W=32     |     2969 |     2797 |
| k1=0.25 retest(0.5) W=8      |     1010 |      956 |
| k1=0.25 retest(0.5) W=16     |     1515 |     1431 |
| k1=0.25 retest(0.5) W=32     |     1952 |     1841 |
| k1=0.25 accelerate(0.5) W=8  |     5371 |     5098 |
| k1=0.25 accelerate(0.5) W=16 |     5559 |     5274 |
| k1=0.25 accelerate(0.5) W=32 |     5736 |     5447 |
| k1=0.25 accelerate(1.0) W=8  |     1770 |     1686 |
| k1=0.25 accelerate(1.0) W=16 |     2024 |     1931 |
| k1=0.25 accelerate(1.0) W=32 |     2259 |     2154 |
| k1=0.5 continue(0.5) W=8     |     1648 |     1569 |
| k1=0.5 continue(0.5) W=16    |     2083 |     1969 |
| k1=0.5 continue(0.5) W=32    |     2417 |     2282 |
| k1=0.5 continue(1.0) W=8     |      625 |      607 |
| k1=0.5 continue(1.0) W=16    |     1020 |      978 |
| k1=0.5 continue(1.0) W=32    |     1374 |     1315 |
| k1=0.5 retest(0.3) W=8       |     1154 |     1098 |
| k1=0.5 retest(0.3) W=16      |     1636 |     1543 |
| k1=0.5 retest(0.3) W=32      |     2054 |     1928 |
| k1=0.5 retest(0.5) W=8       |      634 |      602 |
| k1=0.5 retest(0.5) W=16      |      964 |      908 |
| k1=0.5 retest(0.5) W=32      |     1287 |     1208 |
| k1=0.5 accelerate(0.5) W=8   |     3777 |     3581 |
| k1=0.5 accelerate(0.5) W=16  |     3878 |     3677 |
| k1=0.5 accelerate(0.5) W=32  |     4005 |     3803 |
| k1=0.5 accelerate(1.0) W=8   |     1369 |     1303 |
| k1=0.5 accelerate(1.0) W=16  |     1549 |     1477 |
| k1=0.5 accelerate(1.0) W=32  |     1717 |     1639 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0059% inside the 32 bars after any confirmed sequence (n = 14,717) versus +0.0304% outside; difference -0.0245% (95% day-block CI -0.0819 to +0.0351). Mean |M1 - M0| inside 0.0350 versus outside 0.0143. Correlation of (M1 - M0) with the primary sequence signal: +0.030.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared +0.045. Rules:
```
|--- L_bhi128 <= 0.70
|   |--- L_blo128 <= 0.50
|   |   |--- L_pos256 <= 0.42
|   |   |   |--- value: [0.01]
|   |   |--- L_pos256 >  0.42
|   |   |   |--- value: [0.03]
|   |--- L_blo128 >  0.50
|   |   |--- L_pos64 <= 0.48
|   |   |   |--- value: [0.02]
|   |   |--- L_pos64 >  0.48
|   |   |   |--- value: [0.00]
|--- L_bhi128 >  0.70
|   |--- L_mom128 <= -3.23
|   |   |--- value: [-0.10]
|   |--- L_mom128 >  -3.23
|   |   |--- D_32 <= -0.05
|   |   |   |--- value: [-0.03]
|   |   |--- D_32 >  -0.05
|   |   |   |--- value: [-0.02]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |  -0.062 |   0.007 |     0.068 |
| 2025-04-01 | vol_8    |     64 |   0.247 |   0.247 |    -0.000 |
| 2025-07-01 | dir_16   |     66 |  -0.045 |   0.084 |     0.128 |
| 2025-07-01 | vol_8    |     66 |   0.257 |   0.281 |     0.024 |
| 2025-10-01 | dir_16   |     64 |   0.033 |   0.014 |    -0.019 |
| 2025-10-01 | vol_8    |     64 |   0.307 |   0.309 |     0.002 |
| 2026-01-01 | dir_16   |     63 |  -0.006 |   0.061 |     0.067 |
| 2026-01-01 | vol_8    |     63 |   0.199 |   0.237 |     0.038 |
| 2026-04-01 | dir_16   |     65 |  -0.002 |  -0.028 |    -0.026 |
| 2026-04-01 | vol_8    |     65 |   0.171 |   0.161 |    -0.010 |
| 2026-07-01 | dir_16   |     66 |  -0.037 |   0.065 |     0.102 |
| 2026-07-01 | vol_8    |     66 |   0.182 |   0.167 |    -0.015 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.020 |   0.034 |     0.054 |   0.021 |   0.089 |
| trees depth 3 (registered)                        | vol_8    |   0.262 |   0.272 |     0.010 |   0.004 |   0.016 |
| ridge, all features                               | dir_16   |  -0.040 |  -0.007 |     0.033 |   0.010 |   0.057 |
| ridge, all features                               | vol_8    |   0.290 |   0.290 |     0.000 |  -0.003 |   0.003 |
| trees depth 2, 30 iterations                      | dir_16   |   0.019 |   0.049 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.169 |   0.216 |     0.046 |   0.036 |   0.055 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.020 |   0.022 |     0.042 |   0.018 |   0.070 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.262 |   0.274 |     0.011 |   0.006 |   0.017 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
| direction_change   | trigger          | confirmed        |   d |   minutes_to_confirm |   nasdaq_state |   ret_1h |   ret_2h |   ret_4h | nasdaq_responded_within_16h   |   minutes_to_response | result_4h_race   |
|:-------------------|:-----------------|:-----------------|----:|---------------------:|---------------:|---------:|---------:|---------:|:------------------------------|----------------------:|:-----------------|
| 2026-09-16 16:45   | 2026-09-16 18:00 | 2026-09-16 18:15 |   1 |                   90 |              1 |   -1.096 |   -0.648 |  nan     | True                          |               795.000 | adverse          |
| 2026-09-17 11:45   | 2026-09-17 13:45 | 2026-09-17 17:45 |  -1 |                  360 |              1 |    0.061 |   -0.074 |  nan     | False                         |               nan     | neither          |
| 2026-09-17 19:45   | 2026-09-18 05:30 | 2026-09-18 09:15 |   1 |                  810 |              1 |   -0.085 |   -0.121 |   -0.338 | True                          |               660.000 | adverse          |
| 2026-09-18 13:15   | 2026-09-18 13:45 | 2026-09-18 15:15 |  -1 |                  120 |             -1 |    0.084 |   -0.055 |   -0.347 | False                         |               nan     | adverse          |
| 2026-09-18 15:15   | 2026-09-18 15:30 | 2026-09-18 17:15 |   1 |                  120 |             -1 |    0.025 |    0.292 |  nan     | True                          |               105.000 | favourable       |
| 2026-09-21 01:45   | 2026-09-21 04:45 | 2026-09-21 07:00 |   1 |                  315 |              1 |    0.172 |    0.306 |    0.334 | True                          |               105.000 | favourable       |
| 2026-09-21 12:00   | 2026-09-21 12:15 | 2026-09-21 13:00 |   1 |                   60 |              1 |    0.646 |    1.097 |    1.511 | True                          |                45.000 | favourable       |
| 2026-09-23 04:15   | 2026-09-23 04:45 | 2026-09-23 07:00 |  -1 |                  165 |              1 |    0.029 |    0.083 |    0.082 | True                          |               270.000 | neither          |
| 2026-09-23 11:00   | 2026-09-23 13:30 | 2026-09-23 14:15 |   1 |                  195 |             -1 |    0.177 |    0.041 |    0.037 | False                         |               nan     | neither          |
| 2026-09-23 13:45   | 2026-09-23 14:00 | 2026-09-23 14:15 |   1 |                   30 |             -1 |    0.177 |    0.041 |    0.037 | False                         |               nan     | neither          |
| 2026-09-23 17:00   | 2026-09-23 17:15 | 2026-09-23 18:00 |   1 |                   60 |             -1 |   -0.014 |   -0.001 |  nan     | False                         |               nan     | neither          |

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.