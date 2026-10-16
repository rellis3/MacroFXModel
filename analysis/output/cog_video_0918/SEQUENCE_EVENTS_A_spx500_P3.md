# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 528. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.28 (k1=0.25 retest(0.3) W=32), its validation+OOS t = +0.08; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return +0.0005 (5-95%: -0.0329 to +0.0320); move to favourable share -0.0092; response share -0.0032.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.1516 |               0.0697 |              0.1568 | False             |            -0.1266 |            -0.1327 | False          |              0.1406 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.050 |  0.847 | 14608 |    217 |
| VAL                       |   -0.005 | -0.127 | 12153 |    182 |
| OOS                       |   -0.005 | -0.133 | 10374 |    154 |
| OOS R2 without s / with s |    0.167 |  0.167 | 10374 |    154 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |               0.001 |                     | False            |               0.011 |                 0.002 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 263 |     81 |       -0.037 |         -0.031 |  -0.081 |   0.016 |         0.899 |
| all       | IS     | ret4     | 263 |     81 |       -0.026 |         -0.026 |  -0.069 |   0.015 |         0.905 |
| all       | IS     | ret16    | 263 |     81 |       -0.058 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 263 |     81 |       -0.069 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 263 |     81 |        0.331 |          0.012 |  -0.051 |   0.074 |         0.346 |
| all       | IS     | adv16    | 263 |     81 |        0.403 |          0.081 |   0.021 |   0.147 |         0.007 |
| all       | IS     | resp64   | 263 |     81 |        0.532 |         -0.021 |  -0.091 |   0.046 |         0.735 |
| all       | IS     | vol8     | 263 |     81 |       -1.939 |          0.079 |  -0.100 |   0.249 |         0.172 |
| all       | VAL    | ret8     | 531 |    177 |        0.010 |          0.011 |  -0.036 |   0.061 |         0.302 |
| all       | VAL    | ret4     | 531 |    177 |       -0.012 |         -0.009 |  -0.053 |   0.035 |         0.608 |
| all       | VAL    | ret16    | 531 |    177 |        0.012 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 531 |    177 |        0.040 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 531 |    177 |        0.354 |          0.034 |  -0.011 |   0.079 |         0.068 |
| all       | VAL    | adv16    | 531 |    177 |        0.320 |         -0.004 |  -0.046 |   0.042 |         0.568 |
| all       | VAL    | resp64   | 531 |    177 |        0.584 |          0.024 |  -0.027 |   0.073 |         0.174 |
| all       | VAL    | vol8     | 531 |    177 |       -1.885 |        nan     | nan     | nan     |         0.001 |
| all       | OOS    | ret8     | 483 |    152 |       -0.016 |         -0.008 |  -0.045 |   0.031 |         0.651 |
| all       | OOS    | ret4     | 483 |    152 |       -0.003 |        nan     | nan     | nan     |         0.019 |
| all       | OOS    | ret16    | 483 |    152 |       -0.022 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 483 |    152 |       -0.008 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 483 |    152 |        0.398 |          0.072 |   0.026 |   0.119 |         0.000 |
| all       | OOS    | adv16    | 483 |    152 |        0.340 |          0.010 |  -0.039 |   0.058 |         0.361 |
| all       | OOS    | resp64   | 483 |    152 |        0.611 |          0.040 |  -0.006 |   0.088 |         0.046 |
| all       | OOS    | vol8     | 483 |    152 |       -1.897 |        nan     | nan     | nan     |         0.000 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 263 |     -0.026 |  -0.072 |   0.012 |         0.920 |
| IS     | 1-2 h    | 263 |     -0.006 |  -0.036 |   0.026 |         0.623 |
| IS     | 2-4 h    | 263 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 263 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 263 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 531 |     -0.009 |  -0.052 |   0.032 |         0.627 |
| VAL    | 1-2 h    | 531 |      0.021 |  -0.011 |   0.052 |         0.100 |
| VAL    | 2-4 h    | 531 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 531 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 531 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 483 |    nan     | nan     | nan     |         0.025 |
| OOS    | 1-2 h    | 483 |    nan     | nan     | nan     |         0.029 |
| OOS    | 2-4 h    | 483 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 483 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 483 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.021 | -0.943 | 15173 |    235 |
| VAL                       |    0.007 |  0.323 | 12568 |    191 |
| OOS                       |   -0.011 | -0.728 | 10708 |    161 |
| OOS R2 without s / with s |   -0.016 | -0.016 | 10708 |    161 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|-----:|------------:|----------:|----------:|---------:|---------:|
| VAL     |  531 |      0.0104 |    0.5000 |    0.0054 |  -0.0405 |   0.0493 |
| VAL     |  531 |      0.0104 |    1.0000 |    0.0004 |  -0.0455 |   0.0443 |
| VAL     |  531 |      0.0104 |    2.0000 |   -0.0096 |  -0.0555 |   0.0343 |
| OOS     |  483 |     -0.0164 |    0.5000 |   -0.0214 |  -0.0572 |   0.0152 |
| OOS     |  483 |     -0.0164 |    1.0000 |   -0.0264 |  -0.0622 |   0.0102 |
| OOS     |  483 |     -0.0164 |    2.0000 |   -0.0364 |  -0.0722 |   0.0002 |
| VAL+OOS | 1014 |     -0.0024 |    0.5000 |   -0.0074 |  -0.0350 |   0.0218 |
| VAL+OOS | 1014 |     -0.0024 |    1.0000 |   -0.0124 |  -0.0400 |   0.0168 |
| VAL+OOS | 1014 |     -0.0024 |    2.0000 |   -0.0224 |  -0.0500 |   0.0068 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |   n |   diff |      t |
|:-----------------------------|----:|-------:|-------:|
| k1=0.25 retest(0.5) W=16     | 241 |  0.032 |  1.671 |
| k1=0.25 retest(0.3) W=32     | 449 |  0.018 |  1.251 |
| k1=0.25 retest(0.3) W=16     | 395 |  0.018 |  1.245 |
| k1=0.25 retest(0.5) W=32     | 298 |  0.019 |  0.984 |
| k1=0.5 accelerate(0.5) W=16  | 411 |  0.006 |  0.322 |
| k1=0.25 retest(0.3) W=8      | 295 |  0.005 |  0.299 |
| k1=0.5 accelerate(0.5) W=32  | 428 |  0.004 |  0.241 |
| k1=0.25 retest(0.5) W=8      | 171 |  0.005 |  0.234 |
| k1=0.5 retest(0.5) W=16      | 110 |  0.003 |  0.083 |
| k1=0.5 retest(0.3) W=32      | 266 |  0.001 |  0.025 |
| k1=0.5 accelerate(0.5) W=8   | 393 |  0.000 |  0.009 |
| k1=0.25 accelerate(0.5) W=32 | 622 | -0.002 | -0.092 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1824 |     1754 |
| k1=0.25 continue(0.5) W=16   |     2258 |     2161 |
| k1=0.25 continue(0.5) W=32   |     2587 |     2481 |
| k1=0.25 continue(1.0) W=8    |      646 |      624 |
| k1=0.25 continue(1.0) W=16   |     1042 |     1002 |
| k1=0.25 continue(1.0) W=32   |     1420 |     1363 |
| k1=0.25 retest(0.3) W=8      |     1482 |     1423 |
| k1=0.25 retest(0.3) W=16     |     2029 |     1952 |
| k1=0.25 retest(0.3) W=32     |     2368 |     2272 |
| k1=0.25 retest(0.5) W=8      |      936 |      902 |
| k1=0.25 retest(0.5) W=16     |     1351 |     1305 |
| k1=0.25 retest(0.5) W=32     |     1645 |     1586 |
| k1=0.25 accelerate(0.5) W=8  |     3284 |     3172 |
| k1=0.25 accelerate(0.5) W=16 |     3475 |     3352 |
| k1=0.25 accelerate(0.5) W=32 |     3632 |     3504 |
| k1=0.25 accelerate(1.0) W=8  |     1076 |     1041 |
| k1=0.25 accelerate(1.0) W=16 |     1249 |     1207 |
| k1=0.25 accelerate(1.0) W=32 |     1425 |     1379 |
| k1=0.5 continue(0.5) W=8     |     1041 |      992 |
| k1=0.5 continue(0.5) W=16    |     1344 |     1277 |
| k1=0.5 continue(0.5) W=32    |     1590 |     1514 |
| k1=0.5 continue(1.0) W=8     |      391 |      382 |
| k1=0.5 continue(1.0) W=16    |      631 |      611 |
| k1=0.5 continue(1.0) W=32    |      888 |      857 |
| k1=0.5 retest(0.3) W=8       |      757 |      727 |
| k1=0.5 retest(0.3) W=16      |     1116 |     1075 |
| k1=0.5 retest(0.3) W=32      |     1395 |     1336 |
| k1=0.5 retest(0.5) W=8       |      441 |      425 |
| k1=0.5 retest(0.5) W=16      |      685 |      664 |
| k1=0.5 retest(0.5) W=32      |      900 |      868 |
| k1=0.5 accelerate(0.5) W=8   |     2383 |     2300 |
| k1=0.5 accelerate(0.5) W=16  |     2477 |     2389 |
| k1=0.5 accelerate(0.5) W=32  |     2587 |     2496 |
| k1=0.5 accelerate(1.0) W=8   |      867 |      834 |
| k1=0.5 accelerate(1.0) W=16  |      980 |      943 |
| k1=0.5 accelerate(1.0) W=32  |     1105 |     1064 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0078% inside the 32 bars after any confirmed sequence (n = 12,790) versus -0.0084% outside; difference +0.0162% (95% day-block CI -0.0229 to +0.0532). Mean |M1 - M0| inside 0.0337 versus outside 0.0084. Correlation of (M1 - M0) with the primary sequence signal: +0.013.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.133. Rules:
```
|--- L_mom16 <= 0.58
|   |--- D_128 <= 3.30
|   |   |--- L_blo128 <= 0.05
|   |   |   |--- value: [0.03]
|   |   |--- L_blo128 >  0.05
|   |   |   |--- value: [-0.01]
|   |--- D_128 >  3.30
|   |   |--- value: [0.07]
|--- L_mom16 >  0.58
|   |--- L_curv16 <= 1.30
|   |   |--- L_blo128 <= 0.57
|   |   |   |--- value: [-0.02]
|   |   |--- L_blo128 >  0.57
|   |   |   |--- value: [-0.05]
|   |--- L_curv16 >  1.30
|   |   |--- value: [-0.07]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |  -0.019 |   0.029 |     0.048 |
| 2025-04-01 | vol_8    |     64 |   0.196 |   0.185 |    -0.010 |
| 2025-07-01 | dir_16   |     66 |   0.033 |   0.012 |    -0.020 |
| 2025-07-01 | vol_8    |     66 |   0.145 |   0.143 |    -0.002 |
| 2025-10-01 | dir_16   |     64 |   0.084 |   0.044 |    -0.028 |
| 2025-10-01 | vol_8    |     64 |   0.243 |   0.237 |    -0.005 |
| 2026-01-01 | dir_16   |     63 |   0.009 |   0.071 |     0.062 |
| 2026-01-01 | vol_8    |     63 |   0.281 |   0.298 |     0.017 |
| 2026-04-01 | dir_16   |     65 |   0.064 |   0.034 |    -0.030 |
| 2026-04-01 | vol_8    |     65 |  -0.070 |  -0.078 |    -0.008 |
| 2026-07-01 | dir_16   |     37 |   0.098 |   0.007 |    -0.091 |
| 2026-07-01 | vol_8    |     37 |   0.240 |   0.272 |     0.032 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |   0.040 |   0.035 |   nan     | nan     | nan     |
| trees depth 3 (registered)                        | vol_8    |   0.281 |   0.287 |     0.006 |   0.003 |   0.010 |
| ridge, all features                               | dir_16   |   0.011 |   0.003 |    -0.008 |  -0.042 |   0.025 |
| ridge, all features                               | vol_8    |   0.321 |   0.322 |     0.000 |  -0.002 |   0.004 |
| trees depth 2, 30 iterations                      | dir_16   |   0.104 |   0.072 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.187 |   0.200 |     0.013 |   0.009 |   0.017 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |   0.040 |   0.029 |   nan     | nan     | nan     |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.281 |   0.287 |     0.006 |   0.003 |   0.009 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.