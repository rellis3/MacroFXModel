# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 516. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.21 (k1=0.5 retest(0.3) W=8), its validation+OOS t = -1.52; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 200): mean matched effect on the 2 h signed return +0.0016 (5-95%: -0.0467 to +0.0475); move to favourable share -0.0048; response share +0.0012.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.1094 |               0.0375 |              0.1402 | False             |            -0.8207 |            -1.3197 | True           |              0.0787 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.042 | -0.790 | 14793 |    217 |
| VAL                       |   -0.027 | -0.821 | 12238 |    182 |
| OOS                       |   -0.045 | -1.320 | 12018 |    178 |
| OOS R2 without s / with s |    0.137 |  0.137 | 12018 |    178 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |               0.002 |                     | False            |              -0.022 |                -0.016 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 243 |     80 |       -0.013 |         -0.019 |  -0.076 |   0.042 |         0.740 |
| all       | IS     | ret4     | 243 |     80 |       -0.004 |        nan     | nan     | nan     |         0.249 |
| all       | IS     | ret16    | 243 |     80 |       -0.022 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 243 |     80 |       -0.076 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 243 |     80 |        0.383 |          0.057 |  -0.014 |   0.121 |         0.049 |
| all       | IS     | adv16    | 243 |     80 |        0.358 |          0.052 |  -0.004 |   0.114 |         0.035 |
| all       | IS     | resp64   | 243 |     80 |        0.601 |          0.034 |  -0.034 |   0.096 |         0.172 |
| all       | IS     | vol8     | 243 |     80 |       -1.575 |          0.184 |   0.011 |   0.344 |         0.019 |
| all       | VAL    | ret8     | 596 |    180 |       -0.024 |         -0.026 |  -0.098 |   0.037 |         0.754 |
| all       | VAL    | ret4     | 596 |    180 |       -0.032 |         -0.038 |  -0.097 |   0.014 |         0.900 |
| all       | VAL    | ret16    | 596 |    180 |       -0.015 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 596 |    180 |       -0.040 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 596 |    180 |        0.337 |          0.020 |  -0.023 |   0.064 |         0.168 |
| all       | VAL    | adv16    | 596 |    180 |        0.337 |          0.020 |  -0.019 |   0.059 |         0.160 |
| all       | VAL    | resp64   | 596 |    180 |        0.579 |          0.018 |  -0.028 |   0.071 |         0.219 |
| all       | VAL    | vol8     | 596 |    180 |       -1.684 |        nan     | nan     | nan     |         0.023 |
| all       | OOS    | ret8     | 619 |    185 |       -0.010 |         -0.006 |  -0.044 |   0.029 |         0.608 |
| all       | OOS    | ret4     | 619 |    185 |       -0.003 |         -0.003 |  -0.032 |   0.025 |         0.581 |
| all       | OOS    | ret16    | 619 |    185 |       -0.023 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 619 |    185 |       -0.037 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 619 |    185 |        0.363 |          0.036 |  -0.003 |   0.078 |         0.040 |
| all       | OOS    | adv16    | 619 |    185 |        0.355 |          0.029 |  -0.008 |   0.066 |         0.081 |
| all       | OOS    | resp64   | 619 |    185 |        0.578 |         -0.005 |  -0.047 |   0.037 |         0.630 |
| all       | OOS    | vol8     | 619 |    185 |       -1.630 |          0.102 |  -0.011 |   0.210 |         0.038 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 243 |    nan     | nan     | nan     |         0.235 |
| IS     | 1-2 h    | 243 |    nan     | nan     | nan     |         0.236 |
| IS     | 2-4 h    | 243 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 243 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 243 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 596 |     -0.038 |  -0.107 |   0.015 |         0.909 |
| VAL    | 1-2 h    | 596 |      0.012 |  -0.021 |   0.045 |         0.209 |
| VAL    | 2-4 h    | 596 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 596 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 596 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 619 |     -0.003 |  -0.032 |   0.023 |         0.583 |
| OOS    | 1-2 h    | 619 |     -0.004 |  -0.032 |   0.030 |         0.605 |
| OOS    | 2-4 h    | 619 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 619 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 619 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.040 | -1.310 | 15177 |    234 |
| VAL                       |    0.008 |  0.388 | 12563 |    191 |
| OOS                       |    0.003 |  0.187 | 12447 |    190 |
| OOS R2 without s / with s |   -0.016 | -0.016 | 12447 |    190 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|-----:|------------:|----------:|----------:|---------:|---------:|
| VAL     |  596 |     -0.0238 |    0.5000 |   -0.0288 |  -0.0960 |   0.0358 |
| VAL     |  596 |     -0.0238 |    1.0000 |   -0.0338 |  -0.1010 |   0.0308 |
| VAL     |  596 |     -0.0238 |    2.0000 |   -0.0438 |  -0.1110 |   0.0208 |
| OOS     |  619 |     -0.0102 |    0.5000 |   -0.0152 |  -0.0531 |   0.0232 |
| OOS     |  619 |     -0.0102 |    1.0000 |   -0.0202 |  -0.0581 |   0.0182 |
| OOS     |  619 |     -0.0102 |    2.0000 |   -0.0302 |  -0.0681 |   0.0082 |
| VAL+OOS | 1215 |     -0.0168 |    0.5000 |   -0.0218 |  -0.0595 |   0.0149 |
| VAL+OOS | 1215 |     -0.0168 |    1.0000 |   -0.0268 |  -0.0645 |   0.0099 |
| VAL+OOS | 1215 |     -0.0168 |    2.0000 |   -0.0368 |  -0.0745 |  -0.0001 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                        |   n |   diff |     t |
|:----------------------------|----:|-------:|------:|
| k1=0.5 retest(0.3) W=16     | 191 |  0.049 | 1.778 |
| k1=0.5 retest(0.3) W=8      | 136 |  0.044 | 1.326 |
| k1=0.5 retest(0.3) W=32     | 250 |  0.027 | 1.103 |
| k1=0.5 retest(0.5) W=32     | 163 |  0.031 | 0.854 |
| k1=0.5 retest(0.5) W=16     | 123 |  0.035 | 0.787 |
| k1=0.5 retest(0.5) W=8      |  83 |  0.034 | 0.634 |
| k1=0.25 retest(0.3) W=32    | 461 |  0.012 | 0.565 |
| k1=0.25 retest(0.3) W=16    | 385 |  0.010 | 0.404 |
| k1=0.25 retest(0.5) W=32    | 306 |  0.008 | 0.293 |
| k1=0.5 accelerate(0.5) W=16 | 407 |  0.005 | 0.279 |
| k1=0.25 accelerate(0.5) W=8 | 570 |  0.006 | 0.260 |
| k1=0.5 accelerate(0.5) W=32 | 428 |  0.005 | 0.253 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     2088 |     1974 |
| k1=0.25 continue(0.5) W=16   |     2581 |     2433 |
| k1=0.25 continue(0.5) W=32   |     2960 |     2795 |
| k1=0.25 continue(1.0) W=8    |      759 |      727 |
| k1=0.25 continue(1.0) W=16   |     1225 |     1171 |
| k1=0.25 continue(1.0) W=32   |     1654 |     1572 |
| k1=0.25 retest(0.3) W=8      |     1742 |     1646 |
| k1=0.25 retest(0.3) W=16     |     2302 |     2169 |
| k1=0.25 retest(0.3) W=32     |     2709 |     2547 |
| k1=0.25 retest(0.5) W=8      |     1089 |     1031 |
| k1=0.25 retest(0.5) W=16     |     1529 |     1439 |
| k1=0.25 retest(0.5) W=32     |     1884 |     1772 |
| k1=0.25 accelerate(0.5) W=8  |     3709 |     3519 |
| k1=0.25 accelerate(0.5) W=16 |     3907 |     3706 |
| k1=0.25 accelerate(0.5) W=32 |     4076 |     3868 |
| k1=0.25 accelerate(1.0) W=8  |     1211 |     1153 |
| k1=0.25 accelerate(1.0) W=16 |     1426 |     1358 |
| k1=0.25 accelerate(1.0) W=32 |     1633 |     1555 |
| k1=0.5 continue(0.5) W=8     |     1193 |     1137 |
| k1=0.5 continue(0.5) W=16    |     1540 |     1458 |
| k1=0.5 continue(0.5) W=32    |     1816 |     1719 |
| k1=0.5 continue(1.0) W=8     |      462 |      445 |
| k1=0.5 continue(1.0) W=16    |      742 |      714 |
| k1=0.5 continue(1.0) W=32    |     1036 |      991 |
| k1=0.5 retest(0.3) W=8       |      878 |      833 |
| k1=0.5 retest(0.3) W=16      |     1271 |     1198 |
| k1=0.5 retest(0.3) W=32      |     1590 |     1492 |
| k1=0.5 retest(0.5) W=8       |      519 |      494 |
| k1=0.5 retest(0.5) W=16      |      801 |      753 |
| k1=0.5 retest(0.5) W=32      |     1054 |      990 |
| k1=0.5 accelerate(0.5) W=8   |     2660 |     2532 |
| k1=0.5 accelerate(0.5) W=16  |     2766 |     2631 |
| k1=0.5 accelerate(0.5) W=32  |     2875 |     2738 |
| k1=0.5 accelerate(1.0) W=8   |      967 |      918 |
| k1=0.5 accelerate(1.0) W=16  |     1106 |     1051 |
| k1=0.5 accelerate(1.0) W=32  |     1259 |     1196 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0194% inside the 32 bars after any confirmed sequence (n = 15,035) versus +0.0185% outside; difference +0.0009% (95% day-block CI -0.0648 to +0.0716). Mean |M1 - M0| inside 0.0426 versus outside 0.0178. Correlation of (M1 - M0) with the primary sequence signal: +0.003.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.125. Rules:
```
|--- D_128 <= 3.20
|   |--- L_curv16 <= 1.10
|   |   |--- L_bhi128 <= 0.72
|   |   |   |--- value: [0.01]
|   |   |--- L_bhi128 >  0.72
|   |   |   |--- value: [-0.02]
|   |--- L_curv16 >  1.10
|   |   |--- L_blo128 <= 0.47
|   |   |   |--- value: [-0.03]
|   |   |--- L_blo128 >  0.47
|   |   |   |--- value: [-0.08]
|--- D_128 >  3.20
|   |--- value: [0.11]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |  -0.062 |   0.005 |     0.067 |
| 2025-04-01 | vol_8    |     64 |   0.247 |   0.247 |     0.000 |
| 2025-07-01 | dir_16   |     66 |  -0.045 |   0.053 |     0.098 |
| 2025-07-01 | vol_8    |     66 |   0.257 |   0.253 |    -0.004 |
| 2025-10-01 | dir_16   |     64 |   0.033 |   0.064 |     0.031 |
| 2025-10-01 | vol_8    |     64 |   0.307 |   0.309 |     0.002 |
| 2026-01-01 | dir_16   |     63 |  -0.006 |   0.071 |     0.077 |
| 2026-01-01 | vol_8    |     63 |   0.199 |   0.226 |     0.026 |
| 2026-04-01 | dir_16   |     65 |  -0.002 |   0.052 |     0.054 |
| 2026-04-01 | vol_8    |     65 |   0.171 |   0.173 |     0.002 |
| 2026-07-01 | dir_16   |     66 |  -0.037 |   0.088 |     0.125 |
| 2026-07-01 | vol_8    |     66 |   0.182 |   0.178 |    -0.004 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.020 |   0.056 |     0.076 |   0.044 |   0.106 |
| trees depth 3 (registered)                        | vol_8    |   0.262 |   0.271 |     0.008 |   0.005 |   0.012 |
| ridge, all features                               | dir_16   |  -0.040 |   0.010 |     0.050 |   0.019 |   0.080 |
| ridge, all features                               | vol_8    |   0.290 |   0.290 |    -0.001 |  -0.004 |   0.003 |
| trees depth 2, 30 iterations                      | dir_16   |   0.014 |   0.064 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.169 |   0.185 |     0.015 |   0.011 |   0.019 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.020 |   0.032 |     0.052 |   0.025 |   0.081 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.262 |   0.269 |     0.007 |   0.004 |   0.011 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
| direction_change   | trigger          | confirmed        |   d |   minutes_to_confirm |   nasdaq_state |   ret_1h |   ret_2h |   ret_4h | nasdaq_responded_within_16h   |   minutes_to_response | result_4h_race   |
|:-------------------|:-----------------|:-----------------|----:|---------------------:|---------------:|---------:|---------:|---------:|:------------------------------|----------------------:|:-----------------|
| 2026-09-16 17:00   | 2026-09-16 18:00 | 2026-09-16 18:15 |   1 |                   75 |              1 |   -1.096 |   -0.648 |  nan     | True                          |               795.000 | adverse          |
| 2026-09-17 10:00   | 2026-09-17 14:00 | 2026-09-17 16:45 |  -1 |                  405 |              1 |    0.026 |    0.087 |    0.102 | False                         |               nan     | neither          |
| 2026-09-18 15:15   | 2026-09-18 16:00 | 2026-09-18 19:45 |   1 |                  270 |              1 |    0.421 |  nan     |  nan     | True                          |                30.000 | favourable       |
| 2026-09-21 01:15   | 2026-09-21 06:15 | 2026-09-21 10:00 |   1 |                  525 |              1 |    0.020 |    0.048 |    0.605 | True                          |               225.000 | favourable       |
| 2026-09-21 12:00   | 2026-09-21 12:15 | 2026-09-21 13:00 |   1 |                   60 |              1 |    0.646 |    1.097 |    1.511 | True                          |                45.000 | favourable       |
| 2026-09-22 01:00   | 2026-09-22 04:15 | 2026-09-22 08:15 |   1 |                  435 |             -1 |    0.189 |    0.313 |    0.119 | True                          |               105.000 | favourable       |
| 2026-09-23 04:15   | 2026-09-23 04:45 | 2026-09-23 07:00 |  -1 |                  165 |              1 |    0.029 |    0.083 |    0.082 | True                          |               270.000 | neither          |
| 2026-09-23 11:00   | 2026-09-23 13:30 | 2026-09-23 14:15 |   1 |                  195 |             -1 |    0.177 |    0.041 |    0.037 | False                         |               nan     | neither          |
| 2026-09-23 13:45   | 2026-09-23 14:00 | 2026-09-23 14:15 |   1 |                   30 |             -1 |    0.177 |    0.041 |    0.037 | False                         |               nan     | neither          |

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.