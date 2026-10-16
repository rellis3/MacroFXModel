# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 552. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.31 (k1=0.25 accelerate(1.0) W=8), its validation+OOS t = +1.96; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return -0.0007 (5-95%: -0.0350 to +0.0302); move to favourable share -0.0000; response share -0.0044.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| True                  |         0.1429 |              -0.0015 |              0.1131 | True              |            -1.5101 |            -1.1739 | True           |              0.0880 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.029 |  0.791 | 10170 |    178 |
| VAL                       |   -0.061 | -1.510 |  8490 |    150 |
| OOS                       |   -0.056 | -1.174 |  7027 |    123 |
| OOS R2 without s / with s |    0.122 |  0.122 |  7027 |    123 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |              -0.001 |                     | False            |               0.043 |                 0.023 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 483 |    197 |       -0.015 |         -0.016 |  -0.048 |   0.018 |         0.817 |
| all       | IS     | ret4     | 483 |    197 |        0.001 |          0.002 |  -0.022 |   0.028 |         0.436 |
| all       | IS     | ret16    | 483 |    197 |       -0.043 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 483 |    197 |       -0.101 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 483 |    197 |        0.302 |          0.024 |  -0.020 |   0.069 |         0.150 |
| all       | IS     | adv16    | 483 |    197 |        0.333 |          0.050 |   0.008 |   0.093 |         0.006 |
| all       | IS     | resp64   | 483 |    197 |        0.499 |          0.014 |  -0.039 |   0.067 |         0.302 |
| all       | IS     | vol8     | 483 |    197 |       -1.934 |        nan     | nan     | nan     |         0.015 |
| all       | VAL    | ret8     | 410 |    168 |        0.033 |          0.027 |  -0.019 |   0.077 |         0.150 |
| all       | VAL    | ret4     | 410 |    168 |        0.001 |         -0.004 |  -0.037 |   0.036 |         0.598 |
| all       | VAL    | ret16    | 410 |    168 |        0.045 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 410 |    168 |        0.161 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 410 |    168 |        0.315 |          0.015 |  -0.040 |   0.069 |         0.283 |
| all       | VAL    | adv16    | 410 |    168 |        0.315 |          0.033 |  -0.011 |   0.079 |         0.083 |
| all       | VAL    | resp64   | 410 |    168 |        0.495 |         -0.001 |  -0.058 |   0.054 |         0.513 |
| all       | VAL    | vol8     | 410 |    168 |       -1.846 |          0.138 |  -0.015 |   0.291 |         0.035 |
| all       | OOS    | ret8     | 328 |    125 |        0.018 |          0.019 |  -0.029 |   0.070 |         0.218 |
| all       | OOS    | ret4     | 328 |    125 |        0.022 |          0.022 |  -0.019 |   0.063 |         0.140 |
| all       | OOS    | ret16    | 328 |    125 |        0.022 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 328 |    125 |        0.051 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 328 |    125 |        0.311 |          0.007 |  -0.049 |   0.065 |         0.379 |
| all       | OOS    | adv16    | 328 |    125 |        0.345 |          0.040 |  -0.015 |   0.097 |         0.083 |
| all       | OOS    | resp64   | 328 |    125 |        0.488 |         -0.020 |  -0.080 |   0.035 |         0.770 |
| all       | OOS    | vol8     | 328 |    125 |       -1.718 |          0.149 |   0.013 |   0.277 |         0.020 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 483 |      0.002 |  -0.021 |   0.028 |         0.453 |
| IS     | 1-2 h    | 483 |     -0.018 |  -0.044 |   0.008 |         0.922 |
| IS     | 2-4 h    | 483 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 483 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 483 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 410 |     -0.004 |  -0.035 |   0.036 |         0.600 |
| VAL    | 1-2 h    | 410 |      0.030 |   0.008 |   0.057 |         0.004 |
| VAL    | 2-4 h    | 410 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 410 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 410 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 328 |      0.022 |  -0.015 |   0.062 |         0.155 |
| OOS    | 1-2 h    | 328 |     -0.004 |  -0.036 |   0.029 |         0.570 |
| OOS    | 2-4 h    | 328 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 328 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 328 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.023 | -1.538 | 10221 |    178 |
| VAL                       |    0.048 |  2.890 |  8509 |    150 |
| OOS                       |    0.005 |  0.249 |  7041 |    123 |
| OOS R2 without s / with s |   -0.011 | -0.011 |  7041 |    123 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|----:|------------:|----------:|----------:|---------:|---------:|
| VAL     | 410 |      0.0327 |    0.5000 |    0.0277 |  -0.0168 |   0.0757 |
| VAL     | 410 |      0.0327 |    1.0000 |    0.0227 |  -0.0218 |   0.0707 |
| VAL     | 410 |      0.0327 |    2.0000 |    0.0127 |  -0.0318 |   0.0607 |
| OOS     | 328 |      0.0181 |    0.5000 |    0.0131 |  -0.0335 |   0.0619 |
| OOS     | 328 |      0.0181 |    1.0000 |    0.0081 |  -0.0385 |   0.0569 |
| OOS     | 328 |      0.0181 |    2.0000 |   -0.0019 |  -0.0485 |   0.0469 |
| VAL+OOS | 738 |      0.0262 |    0.5000 |    0.0212 |  -0.0109 |   0.0592 |
| VAL+OOS | 738 |      0.0262 |    1.0000 |    0.0162 |  -0.0159 |   0.0542 |
| VAL+OOS | 738 |      0.0262 |    2.0000 |    0.0062 |  -0.0259 |   0.0442 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |     t |
|:-----------------------------|-----:|-------:|------:|
| k1=0.25 accelerate(0.5) W=8  | 1088 |  0.012 | 1.290 |
| k1=0.25 accelerate(1.0) W=8  |  413 |  0.025 | 1.221 |
| k1=0.25 accelerate(1.0) W=16 |  462 |  0.021 | 1.139 |
| k1=0.5 accelerate(0.5) W=8   |  815 |  0.012 | 1.138 |
| k1=0.25 accelerate(0.5) W=16 | 1159 |  0.009 | 1.027 |
| k1=0.25 accelerate(1.0) W=32 |  519 |  0.017 | 0.893 |
| k1=0.5 accelerate(0.5) W=16  |  858 |  0.008 | 0.733 |
| k1=0.5 accelerate(0.5) W=32  |  883 |  0.005 | 0.504 |
| k1=0.5 accelerate(1.0) W=8   |  328 |  0.008 | 0.401 |
| k1=0.25 accelerate(0.5) W=32 | 1198 |  0.003 | 0.369 |
| k1=0.5 accelerate(1.0) W=16  |  371 |  0.007 | 0.336 |
| k1=0.25 continue(0.5) W=8    |  596 |  0.002 | 0.128 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1983 |     1544 |
| k1=0.25 continue(0.5) W=16   |     2460 |     1870 |
| k1=0.25 continue(0.5) W=32   |     2772 |     2068 |
| k1=0.25 continue(1.0) W=8    |      774 |      618 |
| k1=0.25 continue(1.0) W=16   |     1177 |      914 |
| k1=0.25 continue(1.0) W=32   |     1543 |     1178 |
| k1=0.25 retest(0.3) W=8      |      745 |      565 |
| k1=0.25 retest(0.3) W=16     |     1231 |      903 |
| k1=0.25 retest(0.3) W=32     |     1648 |     1171 |
| k1=0.25 retest(0.5) W=8      |      422 |      319 |
| k1=0.25 retest(0.5) W=16     |      704 |      521 |
| k1=0.25 retest(0.5) W=32     |      977 |      702 |
| k1=0.25 accelerate(0.5) W=8  |     3746 |     2854 |
| k1=0.25 accelerate(0.5) W=16 |     3939 |     2994 |
| k1=0.25 accelerate(0.5) W=32 |     4079 |     3104 |
| k1=0.25 accelerate(1.0) W=8  |     1224 |      989 |
| k1=0.25 accelerate(1.0) W=16 |     1369 |     1110 |
| k1=0.25 accelerate(1.0) W=32 |     1526 |     1238 |
| k1=0.5 continue(0.5) W=8     |     1238 |      979 |
| k1=0.5 continue(0.5) W=16    |     1578 |     1221 |
| k1=0.5 continue(0.5) W=32    |     1800 |     1359 |
| k1=0.5 continue(1.0) W=8     |      510 |      412 |
| k1=0.5 continue(1.0) W=16    |      802 |      628 |
| k1=0.5 continue(1.0) W=32    |     1029 |      788 |
| k1=0.5 retest(0.3) W=8       |      518 |      401 |
| k1=0.5 retest(0.3) W=16      |      843 |      636 |
| k1=0.5 retest(0.3) W=32      |     1140 |      824 |
| k1=0.5 retest(0.5) W=8       |      269 |      202 |
| k1=0.5 retest(0.5) W=16      |      461 |      350 |
| k1=0.5 retest(0.5) W=32      |      658 |      476 |
| k1=0.5 accelerate(0.5) W=8   |     2883 |     2206 |
| k1=0.5 accelerate(0.5) W=16  |     2993 |     2292 |
| k1=0.5 accelerate(0.5) W=32  |     3079 |     2355 |
| k1=0.5 accelerate(1.0) W=8   |     1000 |      804 |
| k1=0.5 accelerate(1.0) W=16  |     1115 |      903 |
| k1=0.5 accelerate(1.0) W=32  |     1212 |      984 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0015% inside the 32 bars after any confirmed sequence (n = 8,763) versus +0.0214% outside; difference -0.0198% (95% day-block CI -0.0774 to +0.0362). Mean |M1 - M0| inside 0.0440 versus outside 0.0218. Correlation of (M1 - M0) with the primary sequence signal: -0.065.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.089. Rules:
```
|--- L_curv32 <= 1.71
|   |--- L_age <= 40.50
|   |   |--- L_blo32 <= 0.23
|   |   |   |--- value: [0.02]
|   |   |--- L_blo32 >  0.23
|   |   |   |--- value: [-0.01]
|   |--- L_age >  40.50
|   |   |--- L_mom16 <= -0.34
|   |   |   |--- value: [0.05]
|   |   |--- L_mom16 >  -0.34
|   |   |   |--- value: [0.02]
|--- L_curv32 >  1.71
|   |--- L_blo128 <= 0.29
|   |   |--- value: [-0.09]
|   |--- L_blo128 >  0.29
|   |   |--- value: [-0.03]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     62 |   0.014 |   0.000 |    -0.014 |
| 2025-04-01 | vol_8    |     62 |   0.279 |   0.277 |    -0.002 |
| 2025-07-01 | dir_16   |     66 |  -0.112 |  -0.053 |     0.059 |
| 2025-07-01 | vol_8    |     66 |   0.257 |   0.264 |     0.007 |
| 2025-10-01 | dir_16   |     62 |  -0.137 |  -0.086 |     0.052 |
| 2025-10-01 | vol_8    |     62 |   0.280 |   0.276 |    -0.004 |
| 2026-01-01 | dir_16   |     63 |   0.046 |  -0.002 |    -0.048 |
| 2026-01-01 | vol_8    |     63 |   0.197 |   0.203 |     0.006 |
| 2026-04-01 | dir_16   |     62 |  -0.028 |  -0.062 |    -0.034 |
| 2026-04-01 | vol_8    |     62 |   0.206 |   0.205 |    -0.001 |
| 2026-07-01 | dir_16   |     37 |  -0.122 |  -0.125 |    -0.003 |
| 2026-07-01 | vol_8    |     37 |   0.274 |   0.281 |     0.007 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.052 |  -0.049 |     0.003 |  -0.030 |   0.034 |
| trees depth 3 (registered)                        | vol_8    |   0.263 |   0.264 |     0.001 |  -0.004 |   0.005 |
| ridge, all features                               | dir_16   |  -0.065 |  -0.041 |     0.024 |  -0.000 |   0.047 |
| ridge, all features                               | vol_8    |   0.286 |   0.288 |     0.002 |  -0.003 |   0.007 |
| trees depth 2, 30 iterations                      | dir_16   |  -0.076 |  -0.079 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.199 |   0.201 |     0.002 |  -0.000 |   0.005 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.052 |  -0.057 |    -0.005 |  -0.033 |   0.022 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.263 |   0.263 |     0.000 |  -0.003 |   0.003 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.