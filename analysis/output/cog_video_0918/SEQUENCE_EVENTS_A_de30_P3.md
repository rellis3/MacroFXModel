# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 496. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.28 (k1=0.25 retest(0.3) W=32), its validation+OOS t = +0.18; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return +0.0023 (5-95%: -0.0345 to +0.0349); move to favourable share +0.0067; response share +0.0002.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| True                  |         0.1642 |               0.0232 |              0.1150 | True              |            -1.5950 |             0.5555 | False          |              0.1560 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.082 | -1.432 | 10170 |    178 |
| VAL                       |   -0.061 | -1.595 |  8490 |    150 |
| OOS                       |    0.020 |  0.555 |  7027 |    123 |
| OOS R2 without s / with s |    0.122 |  0.120 |  7027 |    123 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |               0.002 |                     | False            |               0.011 |                 0.002 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 222 |     73 |       -0.039 |         -0.044 |  -0.098 |   0.014 |         0.945 |
| all       | IS     | ret4     | 222 |     73 |       -0.024 |         -0.027 |  -0.066 |   0.007 |         0.937 |
| all       | IS     | ret16    | 222 |     73 |       -0.053 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 222 |     73 |       -0.123 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 222 |     73 |        0.252 |         -0.033 |  -0.092 |   0.027 |         0.829 |
| all       | IS     | adv16    | 222 |     73 |        0.351 |          0.073 |   0.012 |   0.140 |         0.013 |
| all       | IS     | resp64   | 222 |     73 |        0.441 |         -0.047 |  -0.133 |   0.033 |         0.886 |
| all       | IS     | vol8     | 222 |     73 |       -2.118 |        nan     | nan     | nan     |         0.135 |
| all       | VAL    | ret8     | 482 |    172 |        0.001 |         -0.002 |  -0.055 |   0.049 |         0.534 |
| all       | VAL    | ret4     | 482 |    172 |       -0.002 |         -0.007 |  -0.049 |   0.032 |         0.617 |
| all       | VAL    | ret16    | 482 |    172 |       -0.008 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 482 |    172 |       -0.037 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 482 |    172 |        0.326 |          0.032 |  -0.015 |   0.078 |         0.089 |
| all       | VAL    | adv16    | 482 |    172 |        0.295 |          0.002 |  -0.043 |   0.049 |         0.463 |
| all       | VAL    | resp64   | 482 |    172 |        0.512 |          0.015 |  -0.037 |   0.063 |         0.296 |
| all       | VAL    | vol8     | 482 |    172 |       -1.835 |          0.141 |   0.010 |   0.279 |         0.017 |
| all       | OOS    | ret8     | 432 |    144 |        0.008 |          0.007 |  -0.035 |   0.052 |         0.360 |
| all       | OOS    | ret4     | 432 |    144 |        0.007 |          0.005 |  -0.033 |   0.040 |         0.398 |
| all       | OOS    | ret16    | 432 |    144 |       -0.007 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 432 |    144 |        0.043 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 432 |    144 |        0.352 |          0.031 |  -0.020 |   0.084 |         0.110 |
| all       | OOS    | adv16    | 432 |    144 |        0.343 |          0.037 |  -0.016 |   0.087 |         0.077 |
| all       | OOS    | resp64   | 432 |    144 |        0.549 |          0.025 |  -0.026 |   0.078 |         0.175 |
| all       | OOS    | vol8     | 432 |    144 |       -1.664 |          0.190 |   0.074 |   0.300 |         0.001 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 222 |     -0.027 |  -0.061 |   0.010 |         0.924 |
| IS     | 1-2 h    | 222 |     -0.018 |  -0.049 |   0.014 |         0.880 |
| IS     | 2-4 h    | 222 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 222 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 222 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 482 |     -0.007 |  -0.046 |   0.031 |         0.605 |
| VAL    | 1-2 h    | 482 |      0.007 |  -0.026 |   0.035 |         0.326 |
| VAL    | 2-4 h    | 482 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 482 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 482 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 432 |      0.005 |  -0.032 |   0.039 |         0.431 |
| OOS    | 1-2 h    | 432 |      0.003 |  -0.023 |   0.034 |         0.424 |
| OOS    | 2-4 h    | 432 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 432 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 432 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.013 | -0.607 | 10221 |    178 |
| VAL                       |   -0.009 | -0.421 |  8509 |    150 |
| OOS                       |    0.007 |  0.326 |  7041 |    123 |
| OOS R2 without s / with s |   -0.011 | -0.012 |  7041 |    123 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|----:|------------:|----------:|----------:|---------:|---------:|
| VAL     | 482 |      0.0009 |    0.5000 |   -0.0041 |  -0.0538 |   0.0433 |
| VAL     | 482 |      0.0009 |    1.0000 |   -0.0091 |  -0.0588 |   0.0383 |
| VAL     | 482 |      0.0009 |    2.0000 |   -0.0191 |  -0.0688 |   0.0283 |
| OOS     | 432 |      0.0083 |    0.5000 |    0.0033 |  -0.0404 |   0.0459 |
| OOS     | 432 |      0.0083 |    1.0000 |   -0.0017 |  -0.0454 |   0.0409 |
| OOS     | 432 |      0.0083 |    2.0000 |   -0.0117 |  -0.0554 |   0.0309 |
| VAL+OOS | 914 |      0.0044 |    0.5000 |   -0.0006 |  -0.0317 |   0.0320 |
| VAL+OOS | 914 |      0.0044 |    1.0000 |   -0.0056 |  -0.0367 |   0.0270 |
| VAL+OOS | 914 |      0.0044 |    2.0000 |   -0.0156 |  -0.0467 |   0.0170 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |   n |   diff |      t |
|:-----------------------------|----:|-------:|-------:|
| k1=0.25 retest(0.3) W=8      | 249 |  0.025 |  1.313 |
| k1=0.25 retest(0.3) W=16     | 328 |  0.021 |  1.302 |
| k1=0.25 retest(0.3) W=32     | 363 |  0.021 |  1.125 |
| k1=0.25 retest(0.5) W=16     | 203 |  0.021 |  0.949 |
| k1=0.25 retest(0.5) W=8      | 145 |  0.022 |  0.789 |
| k1=0.25 retest(0.5) W=32     | 245 |  0.014 |  0.690 |
| k1=0.5 accelerate(0.5) W=8   | 326 |  0.011 |  0.674 |
| k1=0.25 accelerate(0.5) W=8  | 468 |  0.009 |  0.564 |
| k1=0.25 accelerate(0.5) W=32 | 523 |  0.008 |  0.475 |
| k1=0.25 accelerate(0.5) W=16 | 495 |  0.006 |  0.336 |
| k1=0.5 accelerate(0.5) W=16  | 342 |  0.001 |  0.057 |
| k1=0.5 accelerate(0.5) W=32  | 358 | -0.001 | -0.041 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1824 |     1567 |
| k1=0.25 continue(0.5) W=16   |     2258 |     1931 |
| k1=0.25 continue(0.5) W=32   |     2587 |     2117 |
| k1=0.25 continue(1.0) W=8    |      646 |      562 |
| k1=0.25 continue(1.0) W=16   |     1042 |      898 |
| k1=0.25 continue(1.0) W=32   |     1420 |     1180 |
| k1=0.25 retest(0.3) W=8      |     1482 |     1268 |
| k1=0.25 retest(0.3) W=16     |     2029 |     1723 |
| k1=0.25 retest(0.3) W=32     |     2368 |     1942 |
| k1=0.25 retest(0.5) W=8      |      936 |      801 |
| k1=0.25 retest(0.5) W=16     |     1351 |     1153 |
| k1=0.25 retest(0.5) W=32     |     1645 |     1371 |
| k1=0.25 accelerate(0.5) W=8  |     3284 |     2785 |
| k1=0.25 accelerate(0.5) W=16 |     3475 |     2950 |
| k1=0.25 accelerate(0.5) W=32 |     3632 |     3090 |
| k1=0.25 accelerate(1.0) W=8  |     1076 |      930 |
| k1=0.25 accelerate(1.0) W=16 |     1249 |     1086 |
| k1=0.25 accelerate(1.0) W=32 |     1425 |     1246 |
| k1=0.5 continue(0.5) W=8     |     1041 |      884 |
| k1=0.5 continue(0.5) W=16    |     1344 |     1136 |
| k1=0.5 continue(0.5) W=32    |     1590 |     1302 |
| k1=0.5 continue(1.0) W=8     |      391 |      343 |
| k1=0.5 continue(1.0) W=16    |      631 |      547 |
| k1=0.5 continue(1.0) W=32    |      888 |      737 |
| k1=0.5 retest(0.3) W=8       |      757 |      656 |
| k1=0.5 retest(0.3) W=16      |     1116 |      962 |
| k1=0.5 retest(0.3) W=32      |     1395 |     1157 |
| k1=0.5 retest(0.5) W=8       |      441 |      388 |
| k1=0.5 retest(0.5) W=16      |      685 |      602 |
| k1=0.5 retest(0.5) W=32      |      900 |      761 |
| k1=0.5 accelerate(0.5) W=8   |     2383 |     2018 |
| k1=0.5 accelerate(0.5) W=16  |     2477 |     2100 |
| k1=0.5 accelerate(0.5) W=32  |     2587 |     2199 |
| k1=0.5 accelerate(1.0) W=8   |      867 |      745 |
| k1=0.5 accelerate(1.0) W=16  |      980 |      844 |
| k1=0.5 accelerate(1.0) W=32  |     1105 |      957 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = -0.0010% inside the 32 bars after any confirmed sequence (n = 9,814) versus -0.0354% outside; difference +0.0345% (95% day-block CI -0.0260 to +0.0972). Mean |M1 - M0| inside 0.0487 versus outside 0.0269. Correlation of (M1 - M0) with the primary sequence signal: +0.065.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared +0.026. Rules:
```
|--- L_var <= 0.55
|   |--- L_var <= -0.42
|   |   |--- L_legratio <= 0.54
|   |   |   |--- value: [0.06]
|   |   |--- L_legratio >  0.54
|   |   |   |--- value: [0.03]
|   |--- L_var >  -0.42
|   |   |--- D_16 <= 1.54
|   |   |   |--- value: [0.01]
|   |   |--- D_16 >  1.54
|   |   |   |--- value: [-0.03]
|--- L_var >  0.55
|   |--- value: [0.07]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     62 |   0.014 |  -0.058 |    -0.072 |
| 2025-04-01 | vol_8    |     62 |   0.279 |   0.284 |     0.004 |
| 2025-07-01 | dir_16   |     66 |  -0.112 |  -0.075 |     0.037 |
| 2025-07-01 | vol_8    |     66 |   0.257 |   0.249 |    -0.008 |
| 2025-10-01 | dir_16   |     62 |  -0.137 |  -0.082 |     0.055 |
| 2025-10-01 | vol_8    |     62 |   0.280 |   0.276 |    -0.005 |
| 2026-01-01 | dir_16   |     63 |   0.046 |   0.017 |    -0.029 |
| 2026-01-01 | vol_8    |     63 |   0.197 |   0.192 |    -0.005 |
| 2026-04-01 | dir_16   |     62 |  -0.028 |  -0.100 |    -0.071 |
| 2026-04-01 | vol_8    |     62 |   0.206 |   0.207 |     0.001 |
| 2026-07-01 | dir_16   |     37 |  -0.122 |  -0.081 |     0.041 |
| 2026-07-01 | vol_8    |     37 |   0.274 |   0.277 |     0.003 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.052 |  -0.062 |    -0.010 |  -0.043 |   0.026 |
| trees depth 3 (registered)                        | vol_8    |   0.263 |   0.266 |     0.003 |  -0.002 |   0.007 |
| ridge, all features                               | dir_16   |  -0.065 |  -0.065 |     0.000 |  -0.026 |   0.027 |
| ridge, all features                               | vol_8    |   0.286 |   0.280 |    -0.006 |  -0.011 |  -0.000 |
| trees depth 2, 30 iterations                      | dir_16   |  -0.076 |  -0.098 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.199 |   0.203 |     0.004 |   0.002 |   0.006 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.052 |  -0.051 |     0.001 |  -0.029 |   0.030 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.263 |   0.263 |    -0.000 |  -0.003 |   0.002 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.