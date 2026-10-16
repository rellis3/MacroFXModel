# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 536. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.18 (k1=0.25 continue(1.0) W=32), its validation+OOS t = +0.31; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return +0.0006 (5-95%: -0.0115 to +0.0129); move to favourable share +0.0071; response share -0.0045.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.0866 |              -0.0118 |              0.0804 | True              |             1.4093 |            -0.1508 | False          |              0.0445 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.066 |  2.367 | 17533 |    239 |
| VAL                       |    0.053 |  1.409 | 14565 |    195 |
| OOS                       |   -0.005 | -0.151 | 12238 |    164 |
| OOS R2 without s / with s |    0.126 |  0.125 | 12238 |    164 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |               0.001 |                     | False            |               0.001 |                -0.000 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 810 |    225 |        0.005 |          0.002 |  -0.009 |   0.013 |         0.325 |
| all       | IS     | ret4     | 810 |    225 |        0.003 |          0.002 |  -0.006 |   0.011 |         0.293 |
| all       | IS     | ret16    | 810 |    225 |        0.002 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 810 |    225 |        0.001 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 810 |    225 |        0.356 |          0.020 |  -0.014 |   0.052 |         0.112 |
| all       | IS     | adv16    | 810 |    225 |        0.342 |          0.022 |  -0.008 |   0.056 |         0.071 |
| all       | IS     | resp64   | 810 |    225 |        0.577 |          0.014 |  -0.022 |   0.052 |         0.230 |
| all       | IS     | vol8     | 810 |    225 |       -2.737 |        nan     | nan     | nan     |         0.015 |
| all       | VAL    | ret8     | 518 |    167 |       -0.001 |         -0.000 |  -0.024 |   0.022 |         0.490 |
| all       | VAL    | ret4     | 518 |    167 |       -0.006 |         -0.007 |  -0.022 |   0.009 |         0.767 |
| all       | VAL    | ret16    | 518 |    167 |        0.010 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 518 |    167 |       -0.004 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 518 |    167 |        0.347 |          0.026 |  -0.022 |   0.074 |         0.148 |
| all       | VAL    | adv16    | 518 |    167 |        0.390 |          0.059 |   0.017 |   0.106 |         0.010 |
| all       | VAL    | resp64   | 518 |    167 |        0.589 |          0.041 |  -0.006 |   0.088 |         0.041 |
| all       | VAL    | vol8     | 518 |    167 |       -2.522 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret8     | 489 |    154 |        0.000 |         -0.001 |  -0.013 |   0.011 |         0.559 |
| all       | OOS    | ret4     | 489 |    154 |       -0.000 |         -0.002 |  -0.012 |   0.008 |         0.655 |
| all       | OOS    | ret16    | 489 |    154 |        0.005 |        nan     | nan     | nan     |         0.007 |
| all       | OOS    | ret32    | 489 |    154 |        0.008 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 489 |    154 |        0.329 |         -0.005 |  -0.054 |   0.040 |         0.585 |
| all       | OOS    | adv16    | 489 |    154 |        0.337 |          0.012 |  -0.030 |   0.054 |         0.294 |
| all       | OOS    | resp64   | 489 |    154 |        0.550 |         -0.009 |  -0.057 |   0.039 |         0.630 |
| all       | OOS    | vol8     | 489 |    154 |       -2.853 |        nan     | nan     | nan     |         0.041 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 810 |      0.002 |  -0.006 |   0.011 |         0.311 |
| IS     | 1-2 h    | 810 |      0.000 |  -0.007 |   0.008 |         0.472 |
| IS     | 2-4 h    | 810 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 810 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 810 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 518 |     -0.007 |  -0.023 |   0.009 |         0.779 |
| VAL    | 1-2 h    | 518 |      0.007 |  -0.005 |   0.019 |         0.151 |
| VAL    | 2-4 h    | 518 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 518 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 518 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 489 |     -0.002 |  -0.011 |   0.007 |         0.649 |
| OOS    | 1-2 h    | 489 |      0.001 |  -0.007 |   0.009 |         0.400 |
| OOS    | 2-4 h    | 489 |    nan     | nan     | nan     |         0.003 |
| OOS    | 4-8 h    | 489 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 489 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.001 | -0.240 | 17647 |    239 |
| VAL                       |    0.007 |  0.790 | 14645 |    195 |
| OOS                       |   -0.008 | -1.638 | 12323 |    164 |
| OOS R2 without s / with s |   -0.007 | -0.007 | 12323 |    164 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|-----:|------------:|----------:|----------:|---------:|---------:|
| VAL     |  518 |     -0.0013 |    0.5000 |   -0.0063 |  -0.0280 |   0.0149 |
| VAL     |  518 |     -0.0013 |    1.0000 |   -0.0113 |  -0.0330 |   0.0099 |
| VAL     |  518 |     -0.0013 |    2.0000 |   -0.0213 |  -0.0430 |  -0.0001 |
| OOS     |  489 |      0.0003 |    0.5000 |   -0.0047 |  -0.0168 |   0.0061 |
| OOS     |  489 |      0.0003 |    1.0000 |   -0.0097 |  -0.0218 |   0.0011 |
| OOS     |  489 |      0.0003 |    2.0000 |   -0.0197 |  -0.0318 |  -0.0089 |
| VAL+OOS | 1007 |     -0.0006 |    0.5000 |   -0.0056 |  -0.0191 |   0.0059 |
| VAL+OOS | 1007 |     -0.0006 |    1.0000 |   -0.0106 |  -0.0241 |   0.0009 |
| VAL+OOS | 1007 |     -0.0006 |    2.0000 |   -0.0206 |  -0.0341 |  -0.0091 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |     t |
|:-----------------------------|-----:|-------:|------:|
| k1=0.5 retest(0.5) W=32      |  481 |  0.006 | 0.802 |
| k1=0.25 continue(1.0) W=32   |  823 |  0.005 | 0.725 |
| k1=0.5 retest(0.5) W=16      |  362 |  0.006 | 0.719 |
| k1=0.25 continue(1.0) W=16   |  637 |  0.006 | 0.658 |
| k1=0.5 retest(0.5) W=8       |  242 |  0.005 | 0.547 |
| k1=0.25 continue(0.5) W=32   | 1488 |  0.002 | 0.534 |
| k1=0.5 continue(0.5) W=16    |  810 |  0.002 | 0.386 |
| k1=0.5 retest(0.3) W=16      |  643 |  0.002 | 0.260 |
| k1=0.5 retest(0.3) W=8       |  459 |  0.002 | 0.241 |
| k1=0.25 retest(0.5) W=32     |  764 |  0.001 | 0.225 |
| k1=0.25 accelerate(1.0) W=32 |  824 |  0.002 | 0.214 |
| k1=0.25 retest(0.5) W=16     |  607 |  0.001 | 0.183 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     2616 |     2583 |
| k1=0.25 continue(0.5) W=16   |     3151 |     3106 |
| k1=0.25 continue(0.5) W=32   |     3550 |     3501 |
| k1=0.25 continue(1.0) W=8    |      944 |      934 |
| k1=0.25 continue(1.0) W=16   |     1464 |     1449 |
| k1=0.25 continue(1.0) W=32   |     1927 |     1906 |
| k1=0.25 retest(0.3) W=8      |     1476 |     1458 |
| k1=0.25 retest(0.3) W=16     |     2156 |     2127 |
| k1=0.25 retest(0.3) W=32     |     2639 |     2604 |
| k1=0.25 retest(0.5) W=8      |      889 |      879 |
| k1=0.25 retest(0.5) W=16     |     1344 |     1327 |
| k1=0.25 retest(0.5) W=32     |     1755 |     1732 |
| k1=0.25 accelerate(0.5) W=8  |     4706 |     4651 |
| k1=0.25 accelerate(0.5) W=16 |     4894 |     4835 |
| k1=0.25 accelerate(0.5) W=32 |     5096 |     5037 |
| k1=0.25 accelerate(1.0) W=8  |     1529 |     1509 |
| k1=0.25 accelerate(1.0) W=16 |     1750 |     1727 |
| k1=0.25 accelerate(1.0) W=32 |     1960 |     1934 |
| k1=0.5 continue(0.5) W=8     |     1454 |     1438 |
| k1=0.5 continue(0.5) W=16    |     1838 |     1817 |
| k1=0.5 continue(0.5) W=32    |     2154 |     2127 |
| k1=0.5 continue(1.0) W=8     |      547 |      540 |
| k1=0.5 continue(1.0) W=16    |      882 |      873 |
| k1=0.5 continue(1.0) W=32    |     1195 |     1183 |
| k1=0.5 retest(0.3) W=8       |      983 |      970 |
| k1=0.5 retest(0.3) W=16      |     1437 |     1414 |
| k1=0.5 retest(0.3) W=32      |     1793 |     1766 |
| k1=0.5 retest(0.5) W=8       |      532 |      528 |
| k1=0.5 retest(0.5) W=16      |      835 |      825 |
| k1=0.5 retest(0.5) W=32      |     1132 |     1118 |
| k1=0.5 accelerate(0.5) W=8   |     3371 |     3331 |
| k1=0.5 accelerate(0.5) W=16  |     3480 |     3438 |
| k1=0.5 accelerate(0.5) W=32  |     3614 |     3572 |
| k1=0.5 accelerate(1.0) W=8   |     1158 |     1141 |
| k1=0.5 accelerate(1.0) W=16  |     1320 |     1300 |
| k1=0.5 accelerate(1.0) W=32  |     1471 |     1449 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0002% inside the 32 bars after any confirmed sequence (n = 12,965) versus +0.0093% outside; difference -0.0091% (95% day-block CI -0.0225 to +0.0069). Mean |M1 - M0| inside 0.0091 versus outside 0.0046. Correlation of (M1 - M0) with the primary sequence signal: +0.042.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.087. Rules:
```
|--- L_mom16 <= -1.69
|   |--- value: [-0.02]
|--- L_mom16 >  -1.69
|   |--- L_var <= 0.13
|   |   |--- L_leg <= 3.79
|   |   |   |--- value: [-0.00]
|   |   |--- L_leg >  3.79
|   |   |   |--- value: [-0.01]
|   |--- L_var >  0.13
|   |   |--- D_64 <= -0.74
|   |   |   |--- value: [0.03]
|   |   |--- D_64 >  -0.74
|   |   |   |--- value: [0.01]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     65 |   0.190 |   0.147 |    -0.043 |
| 2025-04-01 | vol_8    |     65 |   0.205 |   0.215 |     0.010 |
| 2025-07-01 | dir_16   |     66 |   0.098 |   0.104 |     0.006 |
| 2025-07-01 | vol_8    |     66 |   0.257 |   0.286 |     0.028 |
| 2025-10-01 | dir_16   |     65 |   0.040 |   0.028 |    -0.012 |
| 2025-10-01 | vol_8    |     65 |   0.271 |   0.290 |     0.019 |
| 2026-01-01 | dir_16   |     63 |   0.165 |   0.084 |    -0.081 |
| 2026-01-01 | vol_8    |     63 |   0.198 |   0.222 |     0.024 |
| 2026-04-01 | dir_16   |     65 |   0.036 |   0.151 |     0.115 |
| 2026-04-01 | vol_8    |     65 |   0.285 |   0.291 |     0.006 |
| 2026-07-01 | dir_16   |     37 |  -0.044 |   0.050 |     0.094 |
| 2026-07-01 | vol_8    |     37 |   0.334 |   0.325 |    -0.009 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |   0.090 |   0.098 |     0.007 |  -0.025 |   0.035 |
| trees depth 3 (registered)                        | vol_8    |   0.255 |   0.275 |     0.020 |   0.014 |   0.026 |
| ridge, all features                               | dir_16   |   0.061 |   0.075 |     0.014 |  -0.014 |   0.041 |
| ridge, all features                               | vol_8    |   0.291 |   0.290 |    -0.001 |  -0.004 |   0.003 |
| trees depth 2, 30 iterations                      | dir_16   |   0.085 |   0.072 |    -0.013 |  -0.039 |   0.012 |
| trees depth 2, 30 iterations                      | vol_8    |   0.155 |   0.211 |     0.056 |   0.047 |   0.064 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |   0.090 |   0.082 |    -0.008 |  -0.032 |   0.014 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.255 |   0.271 |     0.016 |   0.011 |   0.022 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.