# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 516. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +0.92 (k1=0.25 retest(0.5) W=32), its validation+OOS t = +0.08; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return +0.0040 (5-95%: -0.0250 to +0.0317); move to favourable share +0.0013; response share +0.0015.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.1979 |               0.0583 |              0.1551 | True              |            -0.1528 |            -0.9197 | True           |              0.1911 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.002 | -0.029 | 14721 |    217 |
| VAL                       |   -0.006 | -0.153 | 12215 |    182 |
| OOS                       |   -0.037 | -0.920 | 10419 |    154 |
| OOS R2 without s / with s |    0.196 |  0.196 | 10419 |    154 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |               0.004 |                     | False            |               0.010 |                -0.000 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 263 |     81 |       -0.015 |         -0.017 |  -0.063 |   0.027 |         0.749 |
| all       | IS     | ret4     | 263 |     81 |       -0.000 |         -0.007 |  -0.050 |   0.035 |         0.620 |
| all       | IS     | ret16    | 263 |     81 |       -0.035 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 263 |     81 |       -0.041 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 263 |     81 |        0.350 |          0.020 |  -0.047 |   0.080 |         0.271 |
| all       | IS     | adv16    | 263 |     81 |        0.388 |          0.060 |   0.005 |   0.119 |         0.019 |
| all       | IS     | resp64   | 263 |     81 |        0.559 |          0.013 |  -0.060 |   0.081 |         0.363 |
| all       | IS     | vol8     | 263 |     81 |       -1.930 |          0.154 |  -0.033 |   0.309 |         0.041 |
| all       | VAL    | ret8     | 531 |    177 |       -0.004 |         -0.002 |  -0.047 |   0.044 |         0.533 |
| all       | VAL    | ret4     | 531 |    177 |       -0.014 |         -0.012 |  -0.054 |   0.030 |         0.656 |
| all       | VAL    | ret16    | 531 |    177 |        0.005 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 531 |    177 |        0.039 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 531 |    177 |        0.354 |          0.029 |  -0.011 |   0.074 |         0.087 |
| all       | VAL    | adv16    | 531 |    177 |        0.348 |          0.019 |  -0.026 |   0.068 |         0.195 |
| all       | VAL    | resp64   | 531 |    177 |        0.603 |          0.052 |   0.004 |   0.103 |         0.016 |
| all       | VAL    | vol8     | 531 |    177 |       -1.881 |        nan     | nan     | nan     |         0.001 |
| all       | OOS    | ret8     | 482 |    152 |       -0.004 |          0.002 |  -0.033 |   0.042 |         0.448 |
| all       | OOS    | ret4     | 482 |    152 |       -0.004 |        nan     | nan     | nan     |         0.024 |
| all       | OOS    | ret16    | 482 |    152 |        0.006 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 482 |    152 |        0.025 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 482 |    152 |        0.388 |          0.052 |   0.009 |   0.101 |         0.008 |
| all       | OOS    | adv16    | 482 |    152 |        0.344 |          0.011 |  -0.036 |   0.058 |         0.325 |
| all       | OOS    | resp64   | 482 |    152 |        0.612 |          0.035 |  -0.016 |   0.090 |         0.080 |
| all       | OOS    | vol8     | 482 |    152 |       -1.905 |        nan     | nan     | nan     |         0.001 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 263 |     -0.007 |  -0.046 |   0.034 |         0.632 |
| IS     | 1-2 h    | 263 |     -0.010 |  -0.038 |   0.019 |         0.756 |
| IS     | 2-4 h    | 263 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 263 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 263 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 531 |     -0.012 |  -0.056 |   0.030 |         0.709 |
| VAL    | 1-2 h    | 531 |      0.011 |  -0.017 |   0.040 |         0.246 |
| VAL    | 2-4 h    | 531 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 531 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 531 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 482 |    nan     | nan     | nan     |         0.016 |
| OOS    | 1-2 h    | 482 |    nan     | nan     | nan     |         0.019 |
| OOS    | 2-4 h    | 482 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 482 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 482 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.017 | -0.820 | 15153 |    234 |
| VAL                       |    0.004 |  0.183 | 12555 |    190 |
| OOS                       |    0.006 |  0.459 | 10704 |    161 |
| OOS R2 without s / with s |   -0.009 | -0.009 | 10704 |    161 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|-----:|------------:|----------:|----------:|---------:|---------:|
| VAL     |  531 |     -0.0044 |    0.5000 |   -0.0094 |  -0.0549 |   0.0341 |
| VAL     |  531 |     -0.0044 |    1.0000 |   -0.0144 |  -0.0599 |   0.0291 |
| VAL     |  531 |     -0.0044 |    2.0000 |   -0.0244 |  -0.0699 |   0.0191 |
| OOS     |  482 |     -0.0040 |    0.5000 |   -0.0090 |  -0.0442 |   0.0251 |
| OOS     |  482 |     -0.0040 |    1.0000 |   -0.0140 |  -0.0492 |   0.0201 |
| OOS     |  482 |     -0.0040 |    2.0000 |   -0.0240 |  -0.0592 |   0.0101 |
| VAL+OOS | 1013 |     -0.0042 |    0.5000 |   -0.0092 |  -0.0373 |   0.0179 |
| VAL+OOS | 1013 |     -0.0042 |    1.0000 |   -0.0142 |  -0.0423 |   0.0129 |
| VAL+OOS | 1013 |     -0.0042 |    2.0000 |   -0.0242 |  -0.0523 |   0.0029 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |   n |   diff |     t |
|:-----------------------------|----:|-------:|------:|
| k1=0.25 retest(0.5) W=16     | 241 |  0.027 | 1.255 |
| k1=0.25 retest(0.5) W=32     | 298 |  0.020 | 1.100 |
| k1=0.25 retest(0.3) W=32     | 449 |  0.012 | 0.822 |
| k1=0.25 retest(0.3) W=16     | 395 |  0.007 | 0.494 |
| k1=0.25 accelerate(0.5) W=16 | 593 |  0.007 | 0.478 |
| k1=0.25 accelerate(0.5) W=32 | 622 |  0.007 | 0.472 |
| k1=0.25 accelerate(0.5) W=8  | 562 |  0.006 | 0.417 |
| k1=0.25 continue(0.5) W=8    | 354 |  0.004 | 0.166 |
| k1=0.25 continue(0.5) W=32   | 487 |  0.003 | 0.128 |
| k1=0.25 retest(0.5) W=8      | 171 |  0.003 | 0.107 |
| k1=0.5 accelerate(0.5) W=16  | 411 |  0.002 | 0.104 |
| k1=0.5 accelerate(0.5) W=32  | 428 |  0.001 | 0.081 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1824 |     1752 |
| k1=0.25 continue(0.5) W=16   |     2258 |     2159 |
| k1=0.25 continue(0.5) W=32   |     2587 |     2478 |
| k1=0.25 continue(1.0) W=8    |      646 |      624 |
| k1=0.25 continue(1.0) W=16   |     1042 |     1001 |
| k1=0.25 continue(1.0) W=32   |     1420 |     1362 |
| k1=0.25 retest(0.3) W=8      |     1482 |     1423 |
| k1=0.25 retest(0.3) W=16     |     2029 |     1952 |
| k1=0.25 retest(0.3) W=32     |     2368 |     2271 |
| k1=0.25 retest(0.5) W=8      |      936 |      902 |
| k1=0.25 retest(0.5) W=16     |     1351 |     1305 |
| k1=0.25 retest(0.5) W=32     |     1645 |     1585 |
| k1=0.25 accelerate(0.5) W=8  |     3284 |     3170 |
| k1=0.25 accelerate(0.5) W=16 |     3475 |     3350 |
| k1=0.25 accelerate(0.5) W=32 |     3632 |     3502 |
| k1=0.25 accelerate(1.0) W=8  |     1076 |     1041 |
| k1=0.25 accelerate(1.0) W=16 |     1249 |     1207 |
| k1=0.25 accelerate(1.0) W=32 |     1425 |     1379 |
| k1=0.5 continue(0.5) W=8     |     1041 |      991 |
| k1=0.5 continue(0.5) W=16    |     1344 |     1276 |
| k1=0.5 continue(0.5) W=32    |     1590 |     1513 |
| k1=0.5 continue(1.0) W=8     |      391 |      382 |
| k1=0.5 continue(1.0) W=16    |      631 |      610 |
| k1=0.5 continue(1.0) W=32    |      888 |      856 |
| k1=0.5 retest(0.3) W=8       |      757 |      727 |
| k1=0.5 retest(0.3) W=16      |     1116 |     1075 |
| k1=0.5 retest(0.3) W=32      |     1395 |     1336 |
| k1=0.5 retest(0.5) W=8       |      441 |      425 |
| k1=0.5 retest(0.5) W=16      |      685 |      664 |
| k1=0.5 retest(0.5) W=32      |      900 |      868 |
| k1=0.5 accelerate(0.5) W=8   |     2383 |     2299 |
| k1=0.5 accelerate(0.5) W=16  |     2477 |     2388 |
| k1=0.5 accelerate(0.5) W=32  |     2587 |     2495 |
| k1=0.5 accelerate(1.0) W=8   |      867 |      834 |
| k1=0.5 accelerate(1.0) W=16  |      980 |      943 |
| k1=0.5 accelerate(1.0) W=32  |     1105 |     1064 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = -0.0033% inside the 32 bars after any confirmed sequence (n = 12,788) versus -0.0244% outside; difference +0.0211% (95% day-block CI -0.0124 to +0.0501). Mean |M1 - M0| inside 0.0281 versus outside 0.0106. Correlation of (M1 - M0) with the primary sequence signal: -0.016.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.226. Rules:
```
|--- L_curv16 <= 1.31
|   |--- L_blo128 <= 0.57
|   |   |--- L_mom32 <= -1.76
|   |   |   |--- value: [0.03]
|   |   |--- L_mom32 >  -1.76
|   |   |   |--- value: [0.00]
|   |--- L_blo128 >  0.57
|   |   |--- L_mom32 <= 0.83
|   |   |   |--- value: [-0.02]
|   |   |--- L_mom32 >  0.83
|   |   |   |--- value: [-0.07]
|--- L_curv16 >  1.31
|   |--- L_mom32 <= 0.23
|   |   |--- value: [-0.06]
|   |--- L_mom32 >  0.23
|   |   |--- value: [-0.11]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |   0.073 |   0.026 |    -0.048 |
| 2025-04-01 | vol_8    |     64 |   0.357 |   0.359 |     0.002 |
| 2025-07-01 | dir_16   |     66 |   0.006 |  -0.007 |    -0.012 |
| 2025-07-01 | vol_8    |     66 |   0.219 |   0.207 |    -0.011 |
| 2025-10-01 | dir_16   |     64 |   0.028 |   0.058 |     0.033 |
| 2025-10-01 | vol_8    |     64 |   0.322 |   0.327 |     0.005 |
| 2026-01-01 | dir_16   |     63 |   0.054 |   0.020 |    -0.034 |
| 2026-01-01 | vol_8    |     63 |   0.370 |   0.401 |     0.031 |
| 2026-04-01 | dir_16   |     65 |   0.065 |  -0.013 |    -0.077 |
| 2026-04-01 | vol_8    |     65 |   0.186 |   0.183 |    -0.003 |
| 2026-07-01 | dir_16   |     37 |   0.101 |  -0.023 |    -0.124 |
| 2026-07-01 | vol_8    |     37 |   0.265 |   0.255 |    -0.010 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |   0.051 |   0.012 |   nan     | nan     | nan     |
| trees depth 3 (registered)                        | vol_8    |   0.345 |   0.360 |     0.015 |   0.010 |   0.019 |
| ridge, all features                               | dir_16   |   0.005 |  -0.015 |    -0.020 |  -0.056 |   0.015 |
| ridge, all features                               | vol_8    |   0.388 |   0.390 |     0.002 |  -0.000 |   0.005 |
| trees depth 2, 30 iterations                      | dir_16   |   0.003 |  -0.018 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.266 |   0.304 |     0.038 |   0.032 |   0.044 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |   0.051 |   0.018 |    -0.033 |  -0.064 |  -0.002 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.345 |   0.358 |     0.013 |   0.008 |   0.017 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.