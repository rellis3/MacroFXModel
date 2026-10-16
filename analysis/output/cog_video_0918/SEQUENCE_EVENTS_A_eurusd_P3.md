# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 496. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +2.09 (k1=0.5 continue(0.5) W=16), its validation+OOS t = +0.41; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return -0.0004 (5-95%: -0.0107 to +0.0149); move to favourable share -0.0131; response share -0.0072.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.0697 |               0.1294 |              0.2237 | False             |            -0.9755 |            -0.9742 | True           |              0.0165 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.014 |  0.244 | 17533 |    239 |
| VAL                       |   -0.035 | -0.976 | 14565 |    195 |
| OOS                       |   -0.035 | -0.974 | 12238 |    164 |
| OOS R2 without s / with s |    0.126 |  0.126 | 12238 |    164 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | True      | False                   |              -0.000 |                     | False            |               0.004 |                 0.002 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 271 |     81 |        0.026 |          0.022 |  -0.004 |   0.045 |         0.048 |
| all       | IS     | ret4     | 271 |     81 |        0.023 |          0.019 |  -0.001 |   0.039 |         0.035 |
| all       | IS     | ret16    | 271 |     81 |        0.031 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 271 |     81 |        0.045 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 271 |     81 |        0.399 |          0.062 |  -0.002 |   0.128 |         0.029 |
| all       | IS     | adv16    | 271 |     81 |        0.280 |         -0.059 |  -0.123 |   0.006 |         0.963 |
| all       | IS     | resp64   | 271 |     81 |        0.627 |          0.074 |  -0.000 |   0.147 |         0.026 |
| all       | IS     | vol8     | 271 |     81 |       -2.554 |        nan     | nan     | nan     |         0.042 |
| all       | VAL    | ret8     | 550 |    178 |       -0.002 |         -0.004 |  -0.022 |   0.015 |         0.644 |
| all       | VAL    | ret4     | 550 |    178 |       -0.003 |         -0.003 |  -0.022 |   0.013 |         0.663 |
| all       | VAL    | ret16    | 550 |    178 |        0.006 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 550 |    178 |        0.002 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 550 |    178 |        0.365 |          0.047 |   0.000 |   0.094 |         0.024 |
| all       | VAL    | adv16    | 550 |    178 |        0.338 |          0.011 |  -0.037 |   0.061 |         0.331 |
| all       | VAL    | resp64   | 550 |    178 |        0.600 |          0.053 |   0.011 |   0.100 |         0.008 |
| all       | VAL    | vol8     | 550 |    178 |       -2.599 |        nan     | nan     | nan     |         0.001 |
| all       | OOS    | ret8     | 501 |    152 |        0.007 |          0.007 |  -0.005 |   0.019 |         0.122 |
| all       | OOS    | ret4     | 501 |    152 |        0.003 |          0.001 |  -0.007 |   0.009 |         0.373 |
| all       | OOS    | ret16    | 501 |    152 |       -0.001 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 501 |    152 |       -0.000 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 501 |    152 |        0.403 |          0.081 |   0.040 |   0.123 |         0.000 |
| all       | OOS    | adv16    | 501 |    152 |        0.325 |          0.007 |  -0.033 |   0.049 |         0.358 |
| all       | OOS    | resp64   | 501 |    152 |        0.603 |          0.052 |   0.006 |   0.099 |         0.012 |
| all       | OOS    | vol8     | 501 |    152 |       -2.829 |        nan     | nan     | nan     |         0.006 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 271 |      0.019 |  -0.001 |   0.040 |         0.035 |
| IS     | 1-2 h    | 271 |      0.003 |  -0.014 |   0.019 |         0.378 |
| IS     | 2-4 h    | 271 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 271 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 271 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 550 |     -0.003 |  -0.020 |   0.013 |         0.679 |
| VAL    | 1-2 h    | 550 |     -0.000 |  -0.010 |   0.010 |         0.504 |
| VAL    | 2-4 h    | 550 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 550 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 550 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 501 |      0.001 |  -0.007 |   0.010 |         0.384 |
| OOS    | 1-2 h    | 501 |      0.006 |  -0.003 |   0.015 |         0.107 |
| OOS    | 2-4 h    | 501 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 501 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 501 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.014 |  1.278 | 17647 |    239 |
| VAL                       |    0.001 |  0.201 | 14645 |    195 |
| OOS                       |   -0.001 | -0.213 | 12323 |    164 |
| OOS R2 without s / with s |   -0.007 | -0.007 | 12323 |    164 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|-----:|------------:|----------:|----------:|---------:|---------:|
| VAL     |  550 |     -0.0018 |    0.5000 |   -0.0068 |  -0.0251 |   0.0131 |
| VAL     |  550 |     -0.0018 |    1.0000 |   -0.0118 |  -0.0301 |   0.0081 |
| VAL     |  550 |     -0.0018 |    2.0000 |   -0.0218 |  -0.0401 |  -0.0019 |
| OOS     |  501 |      0.0073 |    0.5000 |    0.0023 |  -0.0087 |   0.0132 |
| OOS     |  501 |      0.0073 |    1.0000 |   -0.0027 |  -0.0137 |   0.0082 |
| OOS     |  501 |      0.0073 |    2.0000 |   -0.0127 |  -0.0237 |  -0.0018 |
| VAL+OOS | 1051 |      0.0025 |    0.5000 |   -0.0025 |  -0.0144 |   0.0094 |
| VAL+OOS | 1051 |      0.0025 |    1.0000 |   -0.0075 |  -0.0194 |   0.0044 |
| VAL+OOS | 1051 |      0.0025 |    2.0000 |   -0.0175 |  -0.0294 |  -0.0056 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                        |   n |   diff |     t |
|:----------------------------|----:|-------:|------:|
| k1=0.5 continue(0.5) W=32   | 314 |  0.020 | 1.728 |
| k1=0.5 continue(0.5) W=16   | 271 |  0.022 | 1.699 |
| k1=0.5 continue(0.5) W=8    | 219 |  0.021 | 1.495 |
| k1=0.25 continue(1.0) W=16  | 226 |  0.014 | 1.273 |
| k1=0.5 continue(1.0) W=8    |  80 |  0.022 | 1.259 |
| k1=0.5 continue(1.0) W=32   | 186 |  0.014 | 1.201 |
| k1=0.25 continue(0.5) W=8   | 366 |  0.011 | 1.120 |
| k1=0.5 continue(1.0) W=16   | 141 |  0.014 | 1.062 |
| k1=0.5 retest(0.3) W=32     | 278 |  0.011 | 1.016 |
| k1=0.25 accelerate(1.0) W=8 | 232 |  0.014 | 1.002 |
| k1=0.5 accelerate(1.0) W=8  | 181 |  0.014 | 0.957 |
| k1=0.5 accelerate(1.0) W=32 | 235 |  0.013 | 0.893 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1824 |     1800 |
| k1=0.25 continue(0.5) W=16   |     2258 |     2229 |
| k1=0.25 continue(0.5) W=32   |     2587 |     2556 |
| k1=0.25 continue(1.0) W=8    |      646 |      639 |
| k1=0.25 continue(1.0) W=16   |     1042 |     1029 |
| k1=0.25 continue(1.0) W=32   |     1420 |     1403 |
| k1=0.25 retest(0.3) W=8      |     1482 |     1464 |
| k1=0.25 retest(0.3) W=16     |     2029 |     2009 |
| k1=0.25 retest(0.3) W=32     |     2368 |     2345 |
| k1=0.25 retest(0.5) W=8      |      936 |      926 |
| k1=0.25 retest(0.5) W=16     |     1351 |     1339 |
| k1=0.25 retest(0.5) W=32     |     1645 |     1631 |
| k1=0.25 accelerate(0.5) W=8  |     3284 |     3251 |
| k1=0.25 accelerate(0.5) W=16 |     3475 |     3441 |
| k1=0.25 accelerate(0.5) W=32 |     3632 |     3598 |
| k1=0.25 accelerate(1.0) W=8  |     1076 |     1068 |
| k1=0.25 accelerate(1.0) W=16 |     1249 |     1241 |
| k1=0.25 accelerate(1.0) W=32 |     1425 |     1417 |
| k1=0.5 continue(0.5) W=8     |     1041 |     1024 |
| k1=0.5 continue(0.5) W=16    |     1344 |     1322 |
| k1=0.5 continue(0.5) W=32    |     1590 |     1566 |
| k1=0.5 continue(1.0) W=8     |      391 |      389 |
| k1=0.5 continue(1.0) W=16    |      631 |      626 |
| k1=0.5 continue(1.0) W=32    |      888 |      882 |
| k1=0.5 retest(0.3) W=8       |      757 |      751 |
| k1=0.5 retest(0.3) W=16      |     1116 |     1108 |
| k1=0.5 retest(0.3) W=32      |     1395 |     1383 |
| k1=0.5 retest(0.5) W=8       |      441 |      437 |
| k1=0.5 retest(0.5) W=16      |      685 |      680 |
| k1=0.5 retest(0.5) W=32      |      900 |      893 |
| k1=0.5 accelerate(0.5) W=8   |     2383 |     2359 |
| k1=0.5 accelerate(0.5) W=16  |     2477 |     2453 |
| k1=0.5 accelerate(0.5) W=32  |     2587 |     2563 |
| k1=0.5 accelerate(1.0) W=8   |      867 |      859 |
| k1=0.5 accelerate(1.0) W=16  |      980 |      972 |
| k1=0.5 accelerate(1.0) W=32  |     1105 |     1097 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = -0.0071% inside the 32 bars after any confirmed sequence (n = 13,679) versus +0.0061% outside; difference -0.0132% (95% day-block CI -0.0319 to +0.0030). Mean |M1 - M0| inside 0.0096 versus outside 0.0050. Correlation of (M1 - M0) with the primary sequence signal: -0.005.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.001. Rules:
```
|--- D_64 <= -4.88
|   |--- value: [0.05]
|--- D_64 >  -4.88
|   |--- L_blo128 <= 0.48
|   |   |--- L_bhi128 <= 0.94
|   |   |   |--- value: [0.01]
|   |   |--- L_bhi128 >  0.94
|   |   |   |--- value: [-0.01]
|   |--- L_blo128 >  0.48
|   |   |--- L_bhi128 <= 0.89
|   |   |   |--- value: [0.00]
|   |   |--- L_bhi128 >  0.89
|   |   |   |--- value: [-0.03]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     65 |   0.190 |   0.147 |    -0.044 |
| 2025-04-01 | vol_8    |     65 |   0.205 |   0.222 |     0.017 |
| 2025-07-01 | dir_16   |     66 |   0.098 |   0.046 |    -0.052 |
| 2025-07-01 | vol_8    |     66 |   0.257 |   0.285 |     0.028 |
| 2025-10-01 | dir_16   |     65 |   0.040 |   0.015 |    -0.024 |
| 2025-10-01 | vol_8    |     65 |   0.271 |   0.308 |     0.037 |
| 2026-01-01 | dir_16   |     63 |   0.165 |   0.048 |    -0.117 |
| 2026-01-01 | vol_8    |     63 |   0.198 |   0.226 |     0.028 |
| 2026-04-01 | dir_16   |     65 |   0.036 |   0.060 |     0.023 |
| 2026-04-01 | vol_8    |     65 |   0.285 |   0.295 |     0.010 |
| 2026-07-01 | dir_16   |     37 |  -0.044 |   0.049 |     0.093 |
| 2026-07-01 | vol_8    |     37 |   0.334 |   0.330 |    -0.004 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |   0.090 |   0.062 |    -0.028 |  -0.057 |  -0.000 |
| trees depth 3 (registered)                        | vol_8    |   0.255 |   0.276 |     0.021 |   0.015 |   0.027 |
| ridge, all features                               | dir_16   |   0.061 |   0.041 |    -0.021 |  -0.047 |   0.008 |
| ridge, all features                               | vol_8    |   0.291 |   0.286 |    -0.005 |  -0.009 |  -0.001 |
| trees depth 2, 30 iterations                      | dir_16   |   0.085 |   0.089 |     0.004 |  -0.024 |   0.032 |
| trees depth 2, 30 iterations                      | vol_8    |   0.155 |   0.212 |     0.056 |   0.049 |   0.065 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |   0.090 |   0.067 |    -0.023 |  -0.048 |   0.002 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.255 |   0.274 |     0.019 |   0.014 |   0.024 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.