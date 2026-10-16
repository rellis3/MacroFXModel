# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 564. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.95 (k1=0.5 retest(0.3) W=8), its validation+OOS t = -0.13; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return -0.0051 (5-95%: -0.0479 to +0.0297); move to favourable share +0.0080; response share -0.0129.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.1654 |               0.0017 |              0.0786 | True              |            -0.9444 |            -0.2379 | False          |              0.1207 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.027 |  0.895 | 14693 |    217 |
| VAL                       |   -0.037 | -0.944 | 12167 |    182 |
| OOS                       |   -0.009 | -0.238 | 10295 |    154 |
| OOS R2 without s / with s |    0.209 |  0.209 | 10295 |    154 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | True      | False                   |              -0.005 |                     | False            |               0.007 |                -0.002 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 787 |    225 |       -0.015 |         -0.015 |  -0.060 |   0.028 |         0.752 |
| all       | IS     | ret4     | 787 |    225 |        0.003 |        nan     | nan     | nan     |         0.057 |
| all       | IS     | ret16    | 787 |    225 |       -0.011 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 787 |    225 |       -0.005 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 787 |    225 |        0.352 |          0.032 |  -0.001 |   0.068 |         0.028 |
| all       | IS     | adv16    | 787 |    225 |        0.353 |          0.027 |  -0.012 |   0.067 |         0.087 |
| all       | IS     | resp64   | 787 |    225 |        0.554 |          0.006 |  -0.035 |   0.045 |         0.385 |
| all       | IS     | vol8     | 787 |    225 |       -1.555 |        nan     | nan     | nan     |         0.033 |
| all       | VAL    | ret8     | 501 |    166 |       -0.019 |         -0.012 |  -0.090 |   0.063 |         0.604 |
| all       | VAL    | ret4     | 501 |    166 |       -0.013 |         -0.005 |  -0.082 |   0.053 |         0.501 |
| all       | VAL    | ret16    | 501 |    166 |       -0.093 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 501 |    166 |       -0.066 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 501 |    166 |        0.371 |          0.050 |   0.005 |   0.095 |         0.017 |
| all       | VAL    | adv16    | 501 |    166 |        0.353 |          0.016 |  -0.028 |   0.061 |         0.244 |
| all       | VAL    | resp64   | 501 |    166 |        0.579 |          0.038 |  -0.011 |   0.090 |         0.059 |
| all       | VAL    | vol8     | 501 |    166 |       -1.433 |        nan     | nan     | nan     |         0.006 |
| all       | OOS    | ret8     | 476 |    154 |        0.001 |          0.008 |  -0.039 |   0.056 |         0.348 |
| all       | OOS    | ret4     | 476 |    154 |        0.012 |        nan     | nan     | nan     |         0.114 |
| all       | OOS    | ret16    | 476 |    154 |        0.003 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 476 |    154 |        0.056 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 476 |    154 |        0.397 |          0.068 |   0.023 |   0.112 |         0.002 |
| all       | OOS    | adv16    | 476 |    154 |        0.353 |          0.026 |  -0.022 |   0.073 |         0.165 |
| all       | OOS    | resp64   | 476 |    154 |        0.603 |          0.031 |  -0.013 |   0.077 |         0.083 |
| all       | OOS    | vol8     | 476 |    154 |       -1.429 |          0.192 |   0.067 |   0.302 |         0.002 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 787 |    nan     | nan     | nan     |         0.068 |
| IS     | 1-2 h    | 787 |    nan     | nan     | nan     |         0.117 |
| IS     | 2-4 h    | 787 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 787 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 787 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 501 |     -0.005 |  -0.077 |   0.050 |         0.530 |
| VAL    | 1-2 h    | 501 |     -0.006 |  -0.059 |   0.044 |         0.584 |
| VAL    | 2-4 h    | 501 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 501 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 501 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 476 |    nan     | nan     | nan     |         0.098 |
| OOS    | 1-2 h    | 476 |    nan     | nan     | nan     |         0.175 |
| OOS    | 2-4 h    | 476 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 476 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 476 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.009 | -0.430 | 15076 |    228 |
| VAL                       |   -0.022 | -0.676 | 12474 |    187 |
| OOS                       |   -0.000 | -0.011 | 10512 |    156 |
| OOS R2 without s / with s |   -0.005 | -0.005 | 10512 |    156 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|----:|------------:|----------:|----------:|---------:|---------:|
| VAL     | 501 |     -0.0186 |    0.5000 |   -0.0236 |  -0.1019 |   0.0496 |
| VAL     | 501 |     -0.0186 |    1.0000 |   -0.0286 |  -0.1069 |   0.0446 |
| VAL     | 501 |     -0.0186 |    2.0000 |   -0.0386 |  -0.1169 |   0.0346 |
| OOS     | 476 |      0.0014 |    0.5000 |   -0.0036 |  -0.0529 |   0.0437 |
| OOS     | 476 |      0.0014 |    1.0000 |   -0.0086 |  -0.0579 |   0.0387 |
| OOS     | 476 |      0.0014 |    2.0000 |   -0.0186 |  -0.0679 |   0.0287 |
| VAL+OOS | 977 |     -0.0088 |    0.5000 |   -0.0138 |  -0.0620 |   0.0309 |
| VAL+OOS | 977 |     -0.0088 |    1.0000 |   -0.0188 |  -0.0670 |   0.0259 |
| VAL+OOS | 977 |     -0.0088 |    2.0000 |   -0.0288 |  -0.0770 |   0.0159 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |     t |
|:-----------------------------|-----:|-------:|------:|
| k1=0.5 retest(0.3) W=8       |  444 |  0.048 | 2.004 |
| k1=0.5 accelerate(0.5) W=32  | 1417 |  0.022 | 1.828 |
| k1=0.5 retest(0.5) W=8       |  233 |  0.056 | 1.543 |
| k1=0.5 accelerate(0.5) W=8   | 1330 |  0.019 | 1.479 |
| k1=0.5 accelerate(0.5) W=16  | 1369 |  0.018 | 1.422 |
| k1=0.5 retest(0.5) W=16      |  349 |  0.039 | 1.338 |
| k1=0.25 accelerate(0.5) W=32 | 2024 |  0.013 | 1.228 |
| k1=0.5 retest(0.5) W=32      |  465 |  0.026 | 1.019 |
| k1=0.5 retest(0.3) W=16      |  622 |  0.021 | 0.895 |
| k1=0.5 retest(0.3) W=32      |  756 |  0.015 | 0.695 |
| k1=0.25 retest(0.3) W=8      |  677 |  0.010 | 0.500 |
| k1=0.25 accelerate(0.5) W=8  | 1885 |  0.005 | 0.485 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     2616 |     2516 |
| k1=0.25 continue(0.5) W=16   |     3151 |     3014 |
| k1=0.25 continue(0.5) W=32   |     3550 |     3402 |
| k1=0.25 continue(1.0) W=8    |      944 |      915 |
| k1=0.25 continue(1.0) W=16   |     1464 |     1414 |
| k1=0.25 continue(1.0) W=32   |     1927 |     1853 |
| k1=0.25 retest(0.3) W=8      |     1476 |     1415 |
| k1=0.25 retest(0.3) W=16     |     2156 |     2060 |
| k1=0.25 retest(0.3) W=32     |     2639 |     2520 |
| k1=0.25 retest(0.5) W=8      |      889 |      848 |
| k1=0.25 retest(0.5) W=16     |     1344 |     1280 |
| k1=0.25 retest(0.5) W=32     |     1755 |     1675 |
| k1=0.25 accelerate(0.5) W=8  |     4706 |     4485 |
| k1=0.25 accelerate(0.5) W=16 |     4894 |     4665 |
| k1=0.25 accelerate(0.5) W=32 |     5096 |     4865 |
| k1=0.25 accelerate(1.0) W=8  |     1529 |     1474 |
| k1=0.25 accelerate(1.0) W=16 |     1750 |     1683 |
| k1=0.25 accelerate(1.0) W=32 |     1960 |     1885 |
| k1=0.5 continue(0.5) W=8     |     1454 |     1402 |
| k1=0.5 continue(0.5) W=16    |     1838 |     1764 |
| k1=0.5 continue(0.5) W=32    |     2154 |     2067 |
| k1=0.5 continue(1.0) W=8     |      547 |      533 |
| k1=0.5 continue(1.0) W=16    |      882 |      859 |
| k1=0.5 continue(1.0) W=32    |     1195 |     1156 |
| k1=0.5 retest(0.3) W=8       |      983 |      935 |
| k1=0.5 retest(0.3) W=16      |     1437 |     1365 |
| k1=0.5 retest(0.3) W=32      |     1793 |     1703 |
| k1=0.5 retest(0.5) W=8       |      532 |      505 |
| k1=0.5 retest(0.5) W=16      |      835 |      794 |
| k1=0.5 retest(0.5) W=32      |     1132 |     1078 |
| k1=0.5 accelerate(0.5) W=8   |     3371 |     3204 |
| k1=0.5 accelerate(0.5) W=16  |     3480 |     3310 |
| k1=0.5 accelerate(0.5) W=32  |     3614 |     3443 |
| k1=0.5 accelerate(1.0) W=8   |     1158 |     1117 |
| k1=0.5 accelerate(1.0) W=16  |     1320 |     1269 |
| k1=0.5 accelerate(1.0) W=32  |     1471 |     1414 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0138% inside the 32 bars after any confirmed sequence (n = 11,991) versus +0.0103% outside; difference +0.0035% (95% day-block CI -0.0368 to +0.0418). Mean |M1 - M0| inside 0.0447 versus outside 0.0146. Correlation of (M1 - M0) with the primary sequence signal: +0.008.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared +0.059. Rules:
```
|--- L_pos256 <= 0.20
|   |--- L_var <= 0.19
|   |   |--- L_curv64 <= -0.15
|   |   |   |--- value: [-0.03]
|   |   |--- L_curv64 >  -0.15
|   |   |   |--- value: [-0.06]
|   |--- L_var >  0.19
|   |   |--- value: [-0.10]
|--- L_pos256 >  0.20
|   |--- L_pos256 <= 0.69
|   |   |--- D_32 <= -2.17
|   |   |   |--- value: [-0.02]
|   |   |--- D_32 >  -2.17
|   |   |   |--- value: [0.01]
|   |--- L_pos256 >  0.69
|   |   |--- L_blo128 <= 0.95
|   |   |   |--- value: [-0.00]
|   |   |--- L_blo128 >  0.95
|   |   |   |--- value: [-0.05]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |   0.017 |   0.015 |    -0.003 |
| 2025-04-01 | vol_8    |     64 |   0.279 |   0.328 |     0.049 |
| 2025-07-01 | dir_16   |     66 |  -0.021 |   0.009 |     0.030 |
| 2025-07-01 | vol_8    |     66 |   0.156 |   0.203 |     0.047 |
| 2025-10-01 | dir_16   |     64 |   0.040 |   0.022 |    -0.017 |
| 2025-10-01 | vol_8    |     64 |   0.333 |   0.318 |    -0.015 |
| 2026-01-01 | dir_16   |     63 |   0.027 |  -0.023 |    -0.050 |
| 2026-01-01 | vol_8    |     63 |   0.406 |   0.453 |     0.047 |
| 2026-04-01 | dir_16   |     65 |   0.149 |   0.046 |    -0.103 |
| 2026-04-01 | vol_8    |     65 |   0.340 |   0.330 |    -0.010 |
| 2026-07-01 | dir_16   |     37 |   0.087 |   0.021 |    -0.065 |
| 2026-07-01 | vol_8    |     37 |   0.448 |   0.480 |     0.032 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |   0.047 |   0.015 |    -0.032 |  -0.063 |  -0.001 |
| trees depth 3 (registered)                        | vol_8    |   0.368 |   0.381 |     0.013 |   0.006 |   0.020 |
| ridge, all features                               | dir_16   |   0.050 |   0.061 |     0.011 |  -0.017 |   0.039 |
| ridge, all features                               | vol_8    |   0.394 |   0.394 |    -0.000 |  -0.002 |   0.002 |
| trees depth 2, 30 iterations                      | dir_16   |   0.034 |  -0.004 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.285 |   0.345 |     0.059 |   0.049 |   0.069 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |   0.047 |   0.026 |    -0.021 |  -0.051 |   0.010 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.368 |   0.378 |     0.010 |   0.004 |   0.017 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.