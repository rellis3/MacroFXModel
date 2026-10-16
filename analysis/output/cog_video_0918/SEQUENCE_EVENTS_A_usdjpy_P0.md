# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 572. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.76 (k1=0.25 retest(0.3) W=16), its validation+OOS t = -1.41; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return -0.0002 (5-95%: -0.0161 to +0.0178); move to favourable share -0.0075; response share -0.0117.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |        -0.0255 |               0.1127 |              0.2004 | False             |            -0.5440 |            -0.9266 | True           |             -0.0447 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.007 | -0.267 | 17589 |    239 |
| VAL                       |   -0.021 | -0.544 | 14600 |    195 |
| OOS                       |   -0.033 | -0.927 | 12264 |    164 |
| OOS R2 without s / with s |    0.257 |  0.257 | 12264 |    164 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |              -0.000 |                     | False            |              -0.006 |                -0.006 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 810 |    225 |        0.008 |          0.009 |  -0.005 |   0.025 |         0.129 |
| all       | IS     | ret4     | 810 |    225 |        0.007 |          0.009 |  -0.003 |   0.021 |         0.075 |
| all       | IS     | ret16    | 810 |    225 |        0.006 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 810 |    225 |        0.009 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 810 |    225 |        0.326 |          0.035 |   0.004 |   0.067 |         0.018 |
| all       | IS     | adv16    | 810 |    225 |        0.281 |         -0.014 |  -0.052 |   0.022 |         0.781 |
| all       | IS     | resp64   | 810 |    225 |        0.564 |          0.027 |  -0.008 |   0.062 |         0.067 |
| all       | IS     | vol8     | 810 |    225 |       -2.447 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret8     | 519 |    167 |       -0.012 |         -0.013 |  -0.030 |   0.007 |         0.911 |
| all       | VAL    | ret4     | 519 |    167 |       -0.005 |         -0.005 |  -0.018 |   0.008 |         0.791 |
| all       | VAL    | ret16    | 519 |    167 |       -0.023 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 519 |    167 |       -0.020 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 519 |    167 |        0.287 |         -0.000 |  -0.043 |   0.037 |         0.517 |
| all       | VAL    | adv16    | 519 |    167 |        0.329 |          0.047 |   0.001 |   0.091 |         0.021 |
| all       | VAL    | resp64   | 519 |    167 |        0.530 |         -0.022 |  -0.069 |   0.025 |         0.846 |
| all       | VAL    | vol8     | 519 |    167 |       -2.446 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret8     | 489 |    154 |        0.001 |          0.001 |  -0.011 |   0.015 |         0.389 |
| all       | OOS    | ret4     | 489 |    154 |       -0.006 |         -0.004 |  -0.014 |   0.006 |         0.805 |
| all       | OOS    | ret16    | 489 |    154 |       -0.018 |        nan     | nan     | nan     |         0.024 |
| all       | OOS    | ret32    | 489 |    154 |       -0.015 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 489 |    154 |        0.276 |          0.023 |  -0.018 |   0.062 |         0.123 |
| all       | OOS    | adv16    | 489 |    154 |        0.290 |          0.020 |  -0.027 |   0.068 |         0.225 |
| all       | OOS    | resp64   | 489 |    154 |        0.505 |          0.002 |  -0.046 |   0.048 |         0.453 |
| all       | OOS    | vol8     | 489 |    154 |       -3.032 |        nan     | nan     | nan     |         0.365 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 810 |      0.009 |  -0.002 |   0.022 |         0.061 |
| IS     | 1-2 h    | 810 |     -0.000 |  -0.010 |   0.010 |         0.512 |
| IS     | 2-4 h    | 810 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 810 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 810 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 519 |     -0.005 |  -0.019 |   0.008 |         0.797 |
| VAL    | 1-2 h    | 519 |     -0.008 |  -0.020 |   0.005 |         0.880 |
| VAL    | 2-4 h    | 519 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 519 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 519 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 489 |     -0.004 |  -0.014 |   0.005 |         0.804 |
| OOS    | 1-2 h    | 489 |      0.006 |  -0.004 |   0.016 |         0.122 |
| OOS    | 2-4 h    | 489 |    nan     | nan     | nan     |         0.020 |
| OOS    | 4-8 h    | 489 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 489 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.004 |  0.619 | 17646 |    239 |
| VAL                       |   -0.014 | -1.914 | 14645 |    195 |
| OOS                       |    0.008 |  0.985 | 12323 |    164 |
| OOS R2 without s / with s |   -0.006 | -0.007 | 12323 |    164 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|-----:|------------:|----------:|----------:|---------:|---------:|
| VAL     |  519 |     -0.0122 |    0.5000 |   -0.0172 |  -0.0349 |   0.0009 |
| VAL     |  519 |     -0.0122 |    1.0000 |   -0.0222 |  -0.0399 |  -0.0041 |
| VAL     |  519 |     -0.0122 |    2.0000 |   -0.0322 |  -0.0499 |  -0.0141 |
| OOS     |  489 |      0.0007 |    0.5000 |   -0.0043 |  -0.0163 |   0.0085 |
| OOS     |  489 |      0.0007 |    1.0000 |   -0.0093 |  -0.0213 |   0.0035 |
| OOS     |  489 |      0.0007 |    2.0000 |   -0.0193 |  -0.0313 |  -0.0065 |
| VAL+OOS | 1008 |     -0.0060 |    0.5000 |   -0.0110 |  -0.0217 |  -0.0000 |
| VAL+OOS | 1008 |     -0.0060 |    1.0000 |   -0.0160 |  -0.0267 |  -0.0050 |
| VAL+OOS | 1008 |     -0.0060 |    2.0000 |   -0.0260 |  -0.0367 |  -0.0150 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                        |    n |   diff |     t |
|:----------------------------|-----:|-------:|------:|
| k1=0.25 retest(0.5) W=16    |  607 |  0.017 | 1.854 |
| k1=0.25 retest(0.5) W=32    |  764 |  0.015 | 1.710 |
| k1=0.25 retest(0.3) W=16    |  984 |  0.012 | 1.612 |
| k1=0.25 retest(0.3) W=32    | 1169 |  0.012 | 1.554 |
| k1=0.25 retest(0.5) W=8     |  418 |  0.015 | 1.360 |
| k1=0.5 accelerate(0.5) W=8  | 1378 |  0.007 | 1.342 |
| k1=0.25 retest(0.3) W=8     |  699 |  0.010 | 1.302 |
| k1=0.5 retest(0.3) W=8      |  459 |  0.012 | 1.199 |
| k1=0.5 accelerate(0.5) W=32 | 1467 |  0.006 | 1.172 |
| k1=0.5 continue(0.5) W=16   |  810 |  0.009 | 1.120 |
| k1=0.5 retest(0.3) W=16     |  643 |  0.011 | 1.086 |
| k1=0.5 continue(0.5) W=8    |  643 |  0.010 | 1.048 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     2616 |     2584 |
| k1=0.25 continue(0.5) W=16   |     3151 |     3108 |
| k1=0.25 continue(0.5) W=32   |     3550 |     3503 |
| k1=0.25 continue(1.0) W=8    |      944 |      934 |
| k1=0.25 continue(1.0) W=16   |     1464 |     1449 |
| k1=0.25 continue(1.0) W=32   |     1927 |     1906 |
| k1=0.25 retest(0.3) W=8      |     1476 |     1458 |
| k1=0.25 retest(0.3) W=16     |     2156 |     2127 |
| k1=0.25 retest(0.3) W=32     |     2639 |     2605 |
| k1=0.25 retest(0.5) W=8      |      889 |      879 |
| k1=0.25 retest(0.5) W=16     |     1344 |     1327 |
| k1=0.25 retest(0.5) W=32     |     1755 |     1733 |
| k1=0.25 accelerate(0.5) W=8  |     4706 |     4651 |
| k1=0.25 accelerate(0.5) W=16 |     4894 |     4835 |
| k1=0.25 accelerate(0.5) W=32 |     5096 |     5037 |
| k1=0.25 accelerate(1.0) W=8  |     1529 |     1509 |
| k1=0.25 accelerate(1.0) W=16 |     1750 |     1727 |
| k1=0.25 accelerate(1.0) W=32 |     1960 |     1934 |
| k1=0.5 continue(0.5) W=8     |     1454 |     1438 |
| k1=0.5 continue(0.5) W=16    |     1838 |     1818 |
| k1=0.5 continue(0.5) W=32    |     2154 |     2128 |
| k1=0.5 continue(1.0) W=8     |      547 |      540 |
| k1=0.5 continue(1.0) W=16    |      882 |      873 |
| k1=0.5 continue(1.0) W=32    |     1195 |     1183 |
| k1=0.5 retest(0.3) W=8       |      983 |      970 |
| k1=0.5 retest(0.3) W=16      |     1437 |     1415 |
| k1=0.5 retest(0.3) W=32      |     1793 |     1767 |
| k1=0.5 retest(0.5) W=8       |      532 |      528 |
| k1=0.5 retest(0.5) W=16      |      835 |      826 |
| k1=0.5 retest(0.5) W=32      |     1132 |     1119 |
| k1=0.5 accelerate(0.5) W=8   |     3371 |     3331 |
| k1=0.5 accelerate(0.5) W=16  |     3480 |     3438 |
| k1=0.5 accelerate(0.5) W=32  |     3614 |     3572 |
| k1=0.5 accelerate(1.0) W=8   |     1158 |     1141 |
| k1=0.5 accelerate(1.0) W=16  |     1320 |     1300 |
| k1=0.5 accelerate(1.0) W=32  |     1471 |     1449 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0024% inside the 32 bars after any confirmed sequence (n = 12,965) versus +0.0015% outside; difference +0.0009% (95% day-block CI -0.0173 to +0.0175). Mean |M1 - M0| inside 0.0155 versus outside 0.0109. Correlation of (M1 - M0) with the primary sequence signal: +0.047.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.215. Rules:
```
|--- L_mom32 <= -2.23
|   |--- value: [0.03]
|--- L_mom32 >  -2.23
|   |--- D_128 <= 1.59
|   |   |--- L_bhi128 <= 0.65
|   |   |   |--- value: [0.00]
|   |   |--- L_bhi128 >  0.65
|   |   |   |--- value: [-0.01]
|   |--- D_128 >  1.59
|   |   |--- L_blo128 <= 0.86
|   |   |   |--- value: [-0.01]
|   |   |--- L_blo128 >  0.86
|   |   |   |--- value: [-0.03]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     65 |  -0.022 |  -0.023 |    -0.001 |
| 2025-04-01 | vol_8    |     65 |   0.102 |   0.105 |     0.003 |
| 2025-07-01 | dir_16   |     66 |   0.019 |  -0.021 |    -0.040 |
| 2025-07-01 | vol_8    |     66 |   0.163 |   0.174 |     0.010 |
| 2025-10-01 | dir_16   |     65 |   0.074 |   0.018 |    -0.055 |
| 2025-10-01 | vol_8    |     65 |   0.150 |   0.156 |     0.006 |
| 2026-01-01 | dir_16   |     63 |  -0.105 |  -0.071 |     0.034 |
| 2026-01-01 | vol_8    |     63 |   0.141 |   0.151 |     0.010 |
| 2026-04-01 | dir_16   |     65 |  -0.087 |   0.011 |     0.098 |
| 2026-04-01 | vol_8    |     65 |   0.196 |   0.196 |     0.000 |
| 2026-07-01 | dir_16   |     37 |   0.073 |  -0.044 |    -0.117 |
| 2026-07-01 | vol_8    |     37 |   0.144 |   0.157 |     0.013 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.014 |  -0.020 |    -0.006 |  -0.034 |   0.020 |
| trees depth 3 (registered)                        | vol_8    |   0.171 |   0.177 |     0.007 |   0.001 |   0.012 |
| ridge, all features                               | dir_16   |  -0.047 |  -0.035 |     0.012 |  -0.006 |   0.031 |
| ridge, all features                               | vol_8    |   0.205 |   0.201 |    -0.003 |  -0.007 |  -0.000 |
| trees depth 2, 30 iterations                      | dir_16   |  -0.074 |  -0.091 |    -0.017 |  -0.037 |   0.004 |
| trees depth 2, 30 iterations                      | vol_8    |   0.079 |   0.088 |     0.009 |   0.004 |   0.014 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.014 |  -0.023 |    -0.009 |  -0.031 |   0.012 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.171 |   0.177 |     0.006 |   0.001 |   0.010 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.