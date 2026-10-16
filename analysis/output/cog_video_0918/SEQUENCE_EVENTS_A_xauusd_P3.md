# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 536. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +2.77 (k1=0.25 accelerate(0.5) W=8), its validation+OOS t = +0.92; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return +0.0013 (5-95%: -0.0308 to +0.0269); move to favourable share +0.0114; response share +0.0262.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| True                  |         0.2028 |              -0.0853 |              0.0417 | True              |            -0.9104 |            -0.5560 | True           |              0.1773 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.019 |  0.422 | 14490 |    217 |
| VAL                       |   -0.035 | -0.910 | 11985 |    183 |
| OOS                       |   -0.022 | -0.556 | 10068 |    153 |
| OOS R2 without s / with s |    0.205 |  0.206 | 10068 |    153 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |               0.001 |                     | False            |               0.039 |                 0.022 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 264 |     81 |        0.041 |          0.036 |  -0.006 |   0.080 |         0.051 |
| all       | IS     | ret4     | 264 |     81 |        0.022 |          0.024 |  -0.009 |   0.055 |         0.075 |
| all       | IS     | ret16    | 264 |     81 |        0.056 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 264 |     81 |        0.098 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 264 |     81 |        0.379 |          0.078 |   0.016 |   0.142 |         0.010 |
| all       | IS     | adv16    | 264 |     81 |        0.277 |         -0.018 |  -0.087 |   0.052 |         0.677 |
| all       | IS     | resp64   | 264 |     81 |        0.580 |          0.041 |  -0.026 |   0.115 |         0.119 |
| all       | IS     | vol8     | 264 |     81 |       -1.979 |        nan     | nan     | nan     |         0.128 |
| all       | VAL    | ret8     | 528 |    177 |       -0.031 |         -0.024 |  -0.073 |   0.020 |         0.847 |
| all       | VAL    | ret4     | 528 |    177 |       -0.036 |         -0.036 |  -0.065 |  -0.005 |         0.987 |
| all       | VAL    | ret16    | 528 |    177 |       -0.038 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 528 |    177 |       -0.057 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 528 |    177 |        0.331 |          0.029 |  -0.017 |   0.072 |         0.107 |
| all       | VAL    | adv16    | 528 |    177 |        0.362 |          0.048 |   0.003 |   0.090 |         0.023 |
| all       | VAL    | resp64   | 528 |    177 |        0.542 |         -0.001 |  -0.044 |   0.040 |         0.503 |
| all       | VAL    | vol8     | 528 |    177 |       -1.709 |          0.118 |  -0.006 |   0.231 |         0.029 |
| all       | OOS    | ret8     | 480 |    152 |        0.060 |          0.071 |   0.018 |   0.128 |         0.005 |
| all       | OOS    | ret4     | 480 |    152 |        0.033 |        nan     | nan     | nan     |         0.001 |
| all       | OOS    | ret16    | 480 |    152 |        0.051 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 480 |    152 |        0.080 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 480 |    152 |        0.346 |          0.038 |  -0.004 |   0.080 |         0.039 |
| all       | OOS    | adv16    | 480 |    152 |        0.281 |         -0.037 |  -0.081 |   0.007 |         0.945 |
| all       | OOS    | resp64   | 480 |    152 |        0.600 |          0.048 |  -0.005 |   0.097 |         0.035 |
| all       | OOS    | vol8     | 480 |    152 |       -1.437 |          0.296 |   0.185 |   0.407 |         0.000 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 264 |      0.024 |  -0.005 |   0.052 |         0.071 |
| IS     | 1-2 h    | 264 |      0.013 |  -0.016 |   0.042 |         0.204 |
| IS     | 2-4 h    | 264 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 264 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 264 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 528 |     -0.036 |  -0.064 |  -0.006 |         0.989 |
| VAL    | 1-2 h    | 528 |      0.011 |  -0.020 |   0.044 |         0.242 |
| VAL    | 2-4 h    | 528 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 528 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 528 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 480 |    nan     | nan     | nan     |         0.000 |
| OOS    | 1-2 h    | 480 |    nan     | nan     | nan     |         0.006 |
| OOS    | 2-4 h    | 480 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 480 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 480 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.029 |  1.917 | 14680 |    217 |
| VAL                       |   -0.006 | -0.358 | 12145 |    183 |
| OOS                       |    0.010 |  0.451 | 10195 |    153 |
| OOS R2 without s / with s |    0.001 |  0.001 | 10195 |    153 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|-----:|------------:|----------:|----------:|---------:|---------:|
| VAL     |  528 |     -0.0306 |    0.5000 |   -0.0356 |  -0.0778 |   0.0086 |
| VAL     |  528 |     -0.0306 |    1.0000 |   -0.0406 |  -0.0828 |   0.0036 |
| VAL     |  528 |     -0.0306 |    2.0000 |   -0.0506 |  -0.0928 |  -0.0064 |
| OOS     |  480 |      0.0599 |    0.5000 |    0.0549 |   0.0034 |   0.1111 |
| OOS     |  480 |      0.0599 |    1.0000 |    0.0499 |  -0.0016 |   0.1061 |
| OOS     |  480 |      0.0599 |    2.0000 |    0.0399 |  -0.0116 |   0.0961 |
| VAL+OOS | 1008 |      0.0125 |    0.5000 |    0.0075 |  -0.0279 |   0.0420 |
| VAL+OOS | 1008 |      0.0125 |    1.0000 |    0.0025 |  -0.0329 |   0.0370 |
| VAL+OOS | 1008 |      0.0125 |    2.0000 |   -0.0075 |  -0.0429 |   0.0270 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |   n |   diff |     t |
|:-----------------------------|----:|-------:|------:|
| k1=0.25 accelerate(0.5) W=16 | 598 |  0.033 | 2.583 |
| k1=0.25 accelerate(0.5) W=8  | 566 |  0.031 | 2.564 |
| k1=0.5 accelerate(0.5) W=8   | 394 |  0.032 | 2.521 |
| k1=0.25 continue(1.0) W=32   | 292 |  0.055 | 2.398 |
| k1=0.25 accelerate(1.0) W=16 | 265 |  0.061 | 2.364 |
| k1=0.5 accelerate(0.5) W=32  | 430 |  0.027 | 2.205 |
| k1=0.25 accelerate(0.5) W=32 | 627 |  0.026 | 2.116 |
| k1=0.25 accelerate(1.0) W=32 | 304 |  0.059 | 2.099 |
| k1=0.5 continue(1.0) W=8     |  80 |  0.075 | 2.011 |
| k1=0.5 continue(1.0) W=16    | 136 |  0.068 | 1.922 |
| k1=0.25 continue(1.0) W=16   | 219 |  0.055 | 1.914 |
| k1=0.5 retest(0.3) W=8       | 155 |  0.048 | 1.887 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1824 |     1752 |
| k1=0.25 continue(0.5) W=16   |     2258 |     2153 |
| k1=0.25 continue(0.5) W=32   |     2587 |     2469 |
| k1=0.25 continue(1.0) W=8    |      646 |      621 |
| k1=0.25 continue(1.0) W=16   |     1042 |      995 |
| k1=0.25 continue(1.0) W=32   |     1420 |     1352 |
| k1=0.25 retest(0.3) W=8      |     1482 |     1412 |
| k1=0.25 retest(0.3) W=16     |     2029 |     1931 |
| k1=0.25 retest(0.3) W=32     |     2368 |     2252 |
| k1=0.25 retest(0.5) W=8      |      936 |      895 |
| k1=0.25 retest(0.5) W=16     |     1351 |     1293 |
| k1=0.25 retest(0.5) W=32     |     1645 |     1574 |
| k1=0.25 accelerate(0.5) W=8  |     3284 |     3161 |
| k1=0.25 accelerate(0.5) W=16 |     3475 |     3342 |
| k1=0.25 accelerate(0.5) W=32 |     3632 |     3494 |
| k1=0.25 accelerate(1.0) W=8  |     1076 |     1043 |
| k1=0.25 accelerate(1.0) W=16 |     1249 |     1211 |
| k1=0.25 accelerate(1.0) W=32 |     1425 |     1384 |
| k1=0.5 continue(0.5) W=8     |     1041 |      992 |
| k1=0.5 continue(0.5) W=16    |     1344 |     1272 |
| k1=0.5 continue(0.5) W=32    |     1590 |     1506 |
| k1=0.5 continue(1.0) W=8     |      391 |      377 |
| k1=0.5 continue(1.0) W=16    |      631 |      605 |
| k1=0.5 continue(1.0) W=32    |      888 |      849 |
| k1=0.5 retest(0.3) W=8       |      757 |      722 |
| k1=0.5 retest(0.3) W=16      |     1116 |     1065 |
| k1=0.5 retest(0.3) W=32      |     1395 |     1328 |
| k1=0.5 retest(0.5) W=8       |      441 |      423 |
| k1=0.5 retest(0.5) W=16      |      685 |      662 |
| k1=0.5 retest(0.5) W=32      |      900 |      867 |
| k1=0.5 accelerate(0.5) W=8   |     2383 |     2292 |
| k1=0.5 accelerate(0.5) W=16  |     2477 |     2382 |
| k1=0.5 accelerate(0.5) W=32  |     2587 |     2489 |
| k1=0.5 accelerate(1.0) W=8   |      867 |      834 |
| k1=0.5 accelerate(1.0) W=16  |      980 |      944 |
| k1=0.5 accelerate(1.0) W=32  |     1105 |     1066 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0012% inside the 32 bars after any confirmed sequence (n = 12,546) versus +0.0009% outside; difference +0.0002% (95% day-block CI -0.0899 to +0.0902). Mean |M1 - M0| inside 0.0536 versus outside 0.0423. Correlation of (M1 - M0) with the primary sequence signal: +0.041.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared +0.024. Rules:
```
|--- L_mom128 <= -0.32
|   |--- L_mom128 <= -3.09
|   |   |--- value: [-0.09]
|   |--- L_mom128 >  -3.09
|   |   |--- D_64 <= -0.81
|   |   |   |--- value: [-0.05]
|   |   |--- D_64 >  -0.81
|   |   |   |--- value: [-0.02]
|--- L_mom128 >  -0.32
|   |--- L_pos256 <= 0.70
|   |   |--- L_leg <= 1.68
|   |   |   |--- value: [-0.01]
|   |   |--- L_leg >  1.68
|   |   |   |--- value: [0.01]
|   |--- L_pos256 >  0.70
|   |   |--- D_32 <= 1.56
|   |   |   |--- value: [0.07]
|   |   |--- D_32 >  1.56
|   |   |   |--- value: [-0.01]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |   0.079 |   0.039 |    -0.040 |
| 2025-04-01 | vol_8    |     64 |   0.127 |   0.135 |     0.008 |
| 2025-07-01 | dir_16   |     66 |  -0.170 |  -0.058 |     0.112 |
| 2025-07-01 | vol_8    |     66 |   0.144 |   0.159 |     0.015 |
| 2025-10-01 | dir_16   |     65 |  -0.055 |  -0.020 |     0.035 |
| 2025-10-01 | vol_8    |     65 |   0.180 |   0.168 |    -0.012 |
| 2026-01-01 | dir_16   |     63 |   0.111 |  -0.017 |    -0.128 |
| 2026-01-01 | vol_8    |     63 |   0.203 |   0.184 |    -0.019 |
| 2026-04-01 | dir_16   |     64 |  -0.115 |  -0.178 |    -0.063 |
| 2026-04-01 | vol_8    |     64 |   0.054 |   0.048 |    -0.006 |
| 2026-07-01 | dir_16   |     37 |  -0.121 |  -0.118 |     0.003 |
| 2026-07-01 | vol_8    |     37 |  -0.029 |  -0.021 |     0.008 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.041 |  -0.054 |    -0.014 |  -0.047 |   0.022 |
| trees depth 3 (registered)                        | vol_8    |   0.155 |   0.154 |    -0.001 |  -0.006 |   0.003 |
| ridge, all features                               | dir_16   |  -0.146 |  -0.078 |     0.069 |   0.039 |   0.098 |
| ridge, all features                               | vol_8    |   0.188 |   0.185 |    -0.003 |  -0.007 |   0.001 |
| trees depth 2, 30 iterations                      | dir_16   |  -0.158 |  -0.081 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.075 |   0.076 |     0.001 |  -0.001 |   0.003 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.041 |  -0.056 |    -0.016 |  -0.044 |   0.014 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.155 |   0.158 |     0.003 |  -0.000 |   0.007 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.