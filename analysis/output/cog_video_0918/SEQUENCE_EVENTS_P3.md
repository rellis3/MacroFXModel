# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 516. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.31 (k1=0.25 retest(0.5) W=16), its validation+OOS t = -0.41; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 200): mean matched effect on the 2 h signed return -0.0019 (5-95%: -0.0459 to +0.0444); move to favourable share -0.0056; response share -0.0023.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.1121 |               0.0366 |              0.1409 | False             |            -0.9902 |            -0.9673 | True           |              0.0900 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.017 |  0.270 | 14793 |    217 |
| VAL                       |   -0.037 | -0.990 | 12238 |    182 |
| OOS                       |   -0.033 | -0.967 | 12018 |    178 |
| OOS R2 without s / with s |    0.137 |  0.137 | 12018 |    178 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | True      | False                   |              -0.002 |                     | False            |              -0.007 |                -0.011 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 263 |     81 |       -0.054 |         -0.058 |  -0.126 |   0.005 |         0.967 |
| all       | IS     | ret4     | 263 |     81 |       -0.050 |         -0.058 |  -0.113 |  -0.004 |         0.979 |
| all       | IS     | ret16    | 263 |     81 |       -0.081 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 263 |     81 |       -0.096 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 263 |     81 |        0.335 |          0.014 |  -0.060 |   0.082 |         0.364 |
| all       | IS     | adv16    | 263 |     81 |        0.403 |          0.084 |   0.020 |   0.154 |         0.005 |
| all       | IS     | resp64   | 263 |     81 |        0.525 |         -0.036 |  -0.109 |   0.033 |         0.843 |
| all       | IS     | vol8     | 263 |     81 |       -1.618 |          0.148 |  -0.021 |   0.316 |         0.049 |
| all       | VAL    | ret8     | 530 |    177 |        0.014 |          0.013 |  -0.042 |   0.067 |         0.300 |
| all       | VAL    | ret4     | 530 |    177 |       -0.016 |         -0.019 |  -0.065 |   0.029 |         0.755 |
| all       | VAL    | ret16    | 530 |    177 |        0.011 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 530 |    177 |        0.037 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 530 |    177 |        0.364 |          0.041 |  -0.006 |   0.087 |         0.042 |
| all       | VAL    | adv16    | 530 |    177 |        0.317 |          0.000 |  -0.042 |   0.044 |         0.494 |
| all       | VAL    | resp64   | 530 |    177 |        0.600 |          0.034 |  -0.017 |   0.087 |         0.102 |
| all       | VAL    | vol8     | 530 |    177 |       -1.654 |        nan     | nan     | nan     |         0.002 |
| all       | OOS    | ret8     | 566 |    180 |       -0.027 |         -0.034 |  -0.079 |   0.010 |         0.935 |
| all       | OOS    | ret4     | 566 |    180 |        0.004 |        nan     | nan     | nan     |         0.020 |
| all       | OOS    | ret16    | 566 |    180 |       -0.048 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 566 |    180 |       -0.045 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 566 |    180 |        0.382 |          0.045 |   0.007 |   0.083 |         0.010 |
| all       | OOS    | adv16    | 566 |    180 |        0.350 |          0.025 |  -0.015 |   0.070 |         0.127 |
| all       | OOS    | resp64   | 566 |    180 |        0.580 |         -0.011 |  -0.055 |   0.032 |         0.673 |
| all       | OOS    | vol8     | 566 |    180 |       -1.628 |        nan     | nan     | nan     |         0.016 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 263 |     -0.058 |  -0.117 |  -0.007 |         0.986 |
| IS     | 1-2 h    | 263 |     -0.001 |  -0.042 |   0.040 |         0.515 |
| IS     | 2-4 h    | 263 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 263 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 263 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 530 |     -0.019 |  -0.071 |   0.024 |         0.812 |
| VAL    | 1-2 h    | 530 |      0.033 |  -0.000 |   0.072 |         0.026 |
| VAL    | 2-4 h    | 530 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 530 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 530 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 566 |    nan     | nan     | nan     |         0.014 |
| OOS    | 1-2 h    | 566 |    nan     | nan     | nan     |         0.055 |
| OOS    | 2-4 h    | 566 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 566 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 566 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.030 | -1.059 | 15177 |    234 |
| VAL                       |    0.010 |  0.371 | 12563 |    191 |
| OOS                       |   -0.024 | -1.226 | 12447 |    190 |
| OOS R2 without s / with s |   -0.016 | -0.015 | 12447 |    190 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|-----:|------------:|----------:|----------:|---------:|---------:|
| VAL     |  530 |      0.0136 |    0.5000 |    0.0086 |  -0.0432 |   0.0593 |
| VAL     |  530 |      0.0136 |    1.0000 |    0.0036 |  -0.0482 |   0.0543 |
| VAL     |  530 |      0.0136 |    2.0000 |   -0.0064 |  -0.0582 |   0.0443 |
| OOS     |  566 |     -0.0266 |    0.5000 |   -0.0316 |  -0.0784 |   0.0115 |
| OOS     |  566 |     -0.0266 |    1.0000 |   -0.0366 |  -0.0834 |   0.0065 |
| OOS     |  566 |     -0.0266 |    2.0000 |   -0.0466 |  -0.0934 |  -0.0035 |
| VAL+OOS | 1096 |     -0.0071 |    0.5000 |   -0.0121 |  -0.0478 |   0.0208 |
| VAL+OOS | 1096 |     -0.0071 |    1.0000 |   -0.0171 |  -0.0528 |   0.0158 |
| VAL+OOS | 1096 |     -0.0071 |    2.0000 |   -0.0271 |  -0.0628 |   0.0058 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |   n |   diff |      t |
|:-----------------------------|----:|-------:|-------:|
| k1=0.25 retest(0.3) W=32     | 449 |  0.024 |  1.214 |
| k1=0.25 retest(0.5) W=16     | 241 |  0.028 |  1.085 |
| k1=0.25 retest(0.5) W=32     | 298 |  0.023 |  0.896 |
| k1=0.25 retest(0.3) W=16     | 395 |  0.016 |  0.823 |
| k1=0.25 retest(0.3) W=8      | 295 |  0.013 |  0.616 |
| k1=0.5 accelerate(0.5) W=32  | 428 |  0.012 |  0.609 |
| k1=0.25 retest(0.5) W=8      | 171 |  0.015 |  0.535 |
| k1=0.25 accelerate(0.5) W=32 | 622 |  0.007 |  0.312 |
| k1=0.5 retest(0.5) W=32      | 155 |  0.010 |  0.289 |
| k1=0.5 retest(0.5) W=16      | 110 |  0.004 |  0.078 |
| k1=0.5 retest(0.5) W=8       |  80 | -0.002 | -0.035 |
| k1=0.5 accelerate(0.5) W=8   | 393 | -0.002 | -0.072 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1953 |     1862 |
| k1=0.25 continue(0.5) W=16   |     2419 |     2293 |
| k1=0.25 continue(0.5) W=32   |     2768 |     2625 |
| k1=0.25 continue(1.0) W=8    |      697 |      671 |
| k1=0.25 continue(1.0) W=16   |     1128 |     1079 |
| k1=0.25 continue(1.0) W=32   |     1537 |     1468 |
| k1=0.25 retest(0.3) W=8      |     1598 |     1517 |
| k1=0.25 retest(0.3) W=16     |     2187 |     2075 |
| k1=0.25 retest(0.3) W=32     |     2555 |     2416 |
| k1=0.25 retest(0.5) W=8      |     1005 |      957 |
| k1=0.25 retest(0.5) W=16     |     1452 |     1385 |
| k1=0.25 retest(0.5) W=32     |     1772 |     1687 |
| k1=0.25 accelerate(0.5) W=8  |     3533 |     3380 |
| k1=0.25 accelerate(0.5) W=16 |     3738 |     3570 |
| k1=0.25 accelerate(0.5) W=32 |     3914 |     3739 |
| k1=0.25 accelerate(1.0) W=8  |     1163 |     1117 |
| k1=0.25 accelerate(1.0) W=16 |     1349 |     1296 |
| k1=0.25 accelerate(1.0) W=32 |     1543 |     1485 |
| k1=0.5 continue(0.5) W=8     |     1122 |     1059 |
| k1=0.5 continue(0.5) W=16    |     1446 |     1359 |
| k1=0.5 continue(0.5) W=32    |     1708 |     1608 |
| k1=0.5 continue(1.0) W=8     |      420 |      409 |
| k1=0.5 continue(1.0) W=16    |      677 |      653 |
| k1=0.5 continue(1.0) W=32    |      954 |      916 |
| k1=0.5 retest(0.3) W=8       |      814 |      775 |
| k1=0.5 retest(0.3) W=16      |     1201 |     1142 |
| k1=0.5 retest(0.3) W=32      |     1502 |     1419 |
| k1=0.5 retest(0.5) W=8       |      469 |      448 |
| k1=0.5 retest(0.5) W=16      |      734 |      703 |
| k1=0.5 retest(0.5) W=32      |      968 |      922 |
| k1=0.5 accelerate(0.5) W=8   |     2567 |     2448 |
| k1=0.5 accelerate(0.5) W=16  |     2666 |     2541 |
| k1=0.5 accelerate(0.5) W=32  |     2789 |     2660 |
| k1=0.5 accelerate(1.0) W=8   |      928 |      886 |
| k1=0.5 accelerate(1.0) W=16  |     1050 |     1004 |
| k1=0.5 accelerate(1.0) W=32  |     1186 |     1136 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0279% inside the 32 bars after any confirmed sequence (n = 14,935) versus -0.0231% outside; difference +0.0510% (95% day-block CI -0.0110 to +0.1161). Mean |M1 - M0| inside 0.0429 versus outside 0.0174. Correlation of (M1 - M0) with the primary sequence signal: +0.045.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.162. Rules:
```
|--- D_128 <= 3.12
|   |--- L_blo128 <= 0.05
|   |   |--- D_128 <= -2.30
|   |   |   |--- value: [0.01]
|   |   |--- D_128 >  -2.30
|   |   |   |--- value: [0.06]
|   |--- L_blo128 >  0.05
|   |   |--- D_128 <= -2.07
|   |   |   |--- value: [-0.04]
|   |   |--- D_128 >  -2.07
|   |   |   |--- value: [0.00]
|--- D_128 >  3.12
|   |--- value: [0.11]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |  -0.062 |   0.018 |     0.079 |
| 2025-04-01 | vol_8    |     64 |   0.247 |   0.249 |     0.002 |
| 2025-07-01 | dir_16   |     66 |  -0.045 |   0.031 |     0.075 |
| 2025-07-01 | vol_8    |     66 |   0.257 |   0.244 |    -0.013 |
| 2025-10-01 | dir_16   |     64 |   0.033 |   0.046 |     0.013 |
| 2025-10-01 | vol_8    |     64 |   0.307 |   0.309 |     0.002 |
| 2026-01-01 | dir_16   |     63 |  -0.006 |   0.096 |     0.102 |
| 2026-01-01 | vol_8    |     63 |   0.199 |   0.230 |     0.030 |
| 2026-04-01 | dir_16   |     65 |  -0.002 |   0.068 |     0.070 |
| 2026-04-01 | vol_8    |     65 |   0.171 |   0.162 |    -0.009 |
| 2026-07-01 | dir_16   |     66 |  -0.037 |   0.036 |     0.073 |
| 2026-07-01 | vol_8    |     66 |   0.182 |   0.171 |    -0.011 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.020 |   0.049 |     0.069 |   0.032 |   0.100 |
| trees depth 3 (registered)                        | vol_8    |   0.262 |   0.269 |     0.006 |   0.003 |   0.010 |
| ridge, all features                               | dir_16   |  -0.040 |   0.004 |     0.044 |   0.014 |   0.072 |
| ridge, all features                               | vol_8    |   0.290 |   0.291 |     0.001 |  -0.002 |   0.004 |
| trees depth 2, 30 iterations                      | dir_16   |   0.015 |   0.040 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.169 |   0.186 |     0.016 |   0.012 |   0.020 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.020 |   0.037 |     0.057 |   0.029 |   0.086 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.262 |   0.269 |     0.006 |   0.003 |   0.010 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
| direction_change   | trigger          | confirmed        |   d |   minutes_to_confirm |   nasdaq_state |   ret_1h |   ret_2h |   ret_4h | nasdaq_responded_within_16h   |   minutes_to_response | result_4h_race   |
|:-------------------|:-----------------|:-----------------|----:|---------------------:|---------------:|---------:|---------:|---------:|:------------------------------|----------------------:|:-----------------|
| 2026-09-16 17:15   | 2026-09-16 18:00 | 2026-09-16 19:00 |   1 |                  105 |             -1 |   -0.078 |   -0.063 |    0.178 | True                          |               270.000 | adverse          |
| 2026-09-17 10:30   | 2026-09-17 14:00 | 2026-09-17 17:45 |  -1 |                  435 |              1 |    0.061 |   -0.074 |  nan     | False                         |               nan     | neither          |
| 2026-09-18 04:15   | 2026-09-18 05:00 | 2026-09-18 06:00 |   1 |                  105 |              1 |    0.221 |    0.258 |   -0.028 | True                          |                90.000 | favourable       |
| 2026-09-18 12:30   | 2026-09-18 13:30 | 2026-09-18 14:00 |  -1 |                   90 |             -1 |    0.066 |    0.244 |    0.064 | False                         |               nan     | neither          |
| 2026-09-18 15:15   | 2026-09-18 15:45 | 2026-09-18 17:15 |   1 |                  120 |             -1 |    0.025 |    0.292 |  nan     | True                          |               105.000 | favourable       |
| 2026-09-21 11:45   | 2026-09-21 12:15 | 2026-09-21 13:00 |   1 |                   75 |              1 |    0.646 |    1.097 |    1.511 | True                          |                45.000 | favourable       |
| 2026-09-22 00:30   | 2026-09-22 07:15 | 2026-09-22 07:45 |   1 |                  435 |             -1 |   -0.085 |    0.023 |    0.087 | True                          |               360.000 | adverse          |
| 2026-09-22 08:15   | 2026-09-22 08:45 | 2026-09-22 09:00 |  -1 |                   45 |              1 |   -0.157 |   -0.106 |    0.065 | False                         |               nan     | neither          |
| 2026-09-22 09:00   | 2026-09-22 11:15 | 2026-09-22 12:45 |   1 |                  225 |              1 |    0.458 |    0.458 |    0.476 | True                          |                60.000 | favourable       |
| 2026-09-22 12:45   | 2026-09-22 13:30 | 2026-09-22 16:45 |  -1 |                  240 |              1 |   -0.121 |   -0.246 |   -0.272 | False                         |               nan     | adverse          |
| 2026-09-23 04:15   | 2026-09-23 06:15 | 2026-09-23 08:30 |  -1 |                  255 |              1 |    0.035 |    0.037 |    0.296 | True                          |               180.000 | favourable       |
| 2026-09-23 12:45   | 2026-09-23 13:00 | 2026-09-23 13:30 |   1 |                   45 |             -1 |   -0.918 |   -0.633 |   -0.928 | False                         |               nan     | adverse          |
| 2026-09-23 14:45   | 2026-09-23 15:00 | 2026-09-23 17:00 |  -1 |                  135 |             -1 |   -0.216 |   -0.203 |   -0.246 | True                          |               780.000 | neither          |

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.