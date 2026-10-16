# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 572. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +2.25 (k1=0.5 retest(0.3) W=8), its validation+OOS t = -0.59; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return -0.0000 (5-95%: -0.0228 to +0.0198); move to favourable share +0.0167; response share +0.0076.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.1710 |              -0.0415 |              0.0861 | True              |             0.1275 |            -1.0861 | False          |              0.1521 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.059 |  1.786 | 14721 |    217 |
| VAL                       |    0.006 |  0.127 | 12215 |    182 |
| OOS                       |   -0.043 | -1.086 | 10419 |    154 |
| OOS R2 without s / with s |    0.196 |  0.195 | 10419 |    154 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |              -0.000 |                     | False            |               0.008 |                -0.000 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 785 |    223 |       -0.004 |         -0.004 |  -0.027 |   0.018 |         0.646 |
| all       | IS     | ret4     | 785 |    223 |        0.007 |        nan     | nan     | nan     |         0.025 |
| all       | IS     | ret16    | 785 |    223 |       -0.003 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 785 |    223 |       -0.003 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 785 |    223 |        0.345 |          0.021 |  -0.013 |   0.058 |         0.134 |
| all       | IS     | adv16    | 785 |    223 |        0.348 |          0.025 |  -0.011 |   0.062 |         0.076 |
| all       | IS     | resp64   | 785 |    223 |        0.552 |         -0.006 |  -0.046 |   0.033 |         0.619 |
| all       | IS     | vol8     | 785 |    223 |       -2.167 |        nan     | nan     | nan     |         0.078 |
| all       | VAL    | ret8     | 502 |    166 |       -0.020 |         -0.017 |  -0.072 |   0.033 |         0.726 |
| all       | VAL    | ret4     | 502 |    166 |       -0.011 |         -0.008 |  -0.051 |   0.030 |         0.612 |
| all       | VAL    | ret16    | 502 |    166 |       -0.060 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 502 |    166 |       -0.048 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 502 |    166 |        0.371 |          0.027 |  -0.018 |   0.075 |         0.130 |
| all       | VAL    | adv16    | 502 |    166 |        0.351 |          0.014 |  -0.034 |   0.060 |         0.285 |
| all       | VAL    | resp64   | 502 |    166 |        0.590 |          0.028 |  -0.024 |   0.074 |         0.157 |
| all       | VAL    | vol8     | 502 |    166 |       -1.835 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret8     | 476 |    154 |        0.015 |          0.018 |  -0.019 |   0.054 |         0.167 |
| all       | OOS    | ret4     | 476 |    154 |        0.006 |        nan     | nan     | nan     |         0.071 |
| all       | OOS    | ret16    | 476 |    154 |        0.004 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 476 |    154 |        0.067 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 476 |    154 |        0.389 |          0.051 |   0.004 |   0.098 |         0.016 |
| all       | OOS    | adv16    | 476 |    154 |        0.345 |          0.016 |  -0.032 |   0.067 |         0.252 |
| all       | OOS    | resp64   | 476 |    154 |        0.586 |          0.000 |  -0.045 |   0.043 |         0.499 |
| all       | OOS    | vol8     | 476 |    154 |       -1.959 |        nan     | nan     | nan     |         0.008 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 785 |    nan     | nan     | nan     |         0.033 |
| IS     | 1-2 h    | 785 |    nan     | nan     | nan     |         0.109 |
| IS     | 2-4 h    | 785 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 785 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 785 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 502 |     -0.008 |  -0.055 |   0.028 |         0.606 |
| VAL    | 1-2 h    | 502 |     -0.010 |  -0.046 |   0.023 |         0.691 |
| VAL    | 2-4 h    | 502 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 502 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 502 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 476 |    nan     | nan     | nan     |         0.068 |
| OOS    | 1-2 h    | 476 |    nan     | nan     | nan     |         0.081 |
| OOS    | 2-4 h    | 476 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 476 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 476 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.002 | -0.205 | 15153 |    234 |
| VAL                       |   -0.015 | -0.670 | 12555 |    190 |
| OOS                       |    0.003 |  0.205 | 10704 |    161 |
| OOS R2 without s / with s |   -0.009 | -0.009 | 10704 |    161 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|----:|------------:|----------:|----------:|---------:|---------:|
| VAL     | 502 |     -0.0201 |    0.5000 |   -0.0251 |  -0.0808 |   0.0263 |
| VAL     | 502 |     -0.0201 |    1.0000 |   -0.0301 |  -0.0858 |   0.0213 |
| VAL     | 502 |     -0.0201 |    2.0000 |   -0.0401 |  -0.0958 |   0.0113 |
| OOS     | 476 |      0.0150 |    0.5000 |    0.0100 |  -0.0257 |   0.0437 |
| OOS     | 476 |      0.0150 |    1.0000 |    0.0050 |  -0.0307 |   0.0387 |
| OOS     | 476 |      0.0150 |    2.0000 |   -0.0050 |  -0.0407 |   0.0287 |
| VAL+OOS | 978 |     -0.0031 |    0.5000 |   -0.0081 |  -0.0416 |   0.0239 |
| VAL+OOS | 978 |     -0.0031 |    1.0000 |   -0.0131 |  -0.0466 |   0.0189 |
| VAL+OOS | 978 |     -0.0031 |    2.0000 |   -0.0231 |  -0.0566 |   0.0089 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |     t |
|:-----------------------------|-----:|-------:|------:|
| k1=0.5 retest(0.3) W=8       |  446 |  0.030 | 2.261 |
| k1=0.5 accelerate(0.5) W=16  | 1370 |  0.012 | 1.810 |
| k1=0.5 accelerate(0.5) W=32  | 1418 |  0.011 | 1.727 |
| k1=0.5 retest(0.5) W=16      |  350 |  0.027 | 1.666 |
| k1=0.5 accelerate(0.5) W=8   | 1331 |  0.011 | 1.576 |
| k1=0.5 retest(0.3) W=16      |  624 |  0.018 | 1.459 |
| k1=0.25 accelerate(0.5) W=8  | 1885 |  0.006 | 1.011 |
| k1=0.5 retest(0.5) W=8       |  234 |  0.019 | 0.968 |
| k1=0.25 accelerate(0.5) W=16 | 1951 |  0.006 | 0.917 |
| k1=0.5 retest(0.3) W=32      |  757 |  0.010 | 0.836 |
| k1=0.25 accelerate(1.0) W=16 |  719 |  0.015 | 0.827 |
| k1=0.5 retest(0.5) W=32      |  465 |  0.011 | 0.791 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     2616 |     2514 |
| k1=0.25 continue(0.5) W=16   |     3151 |     3011 |
| k1=0.25 continue(0.5) W=32   |     3550 |     3400 |
| k1=0.25 continue(1.0) W=8    |      944 |      915 |
| k1=0.25 continue(1.0) W=16   |     1464 |     1411 |
| k1=0.25 continue(1.0) W=32   |     1927 |     1849 |
| k1=0.25 retest(0.3) W=8      |     1476 |     1415 |
| k1=0.25 retest(0.3) W=16     |     2156 |     2062 |
| k1=0.25 retest(0.3) W=32     |     2639 |     2524 |
| k1=0.25 retest(0.5) W=8      |      889 |      848 |
| k1=0.25 retest(0.5) W=16     |     1344 |     1282 |
| k1=0.25 retest(0.5) W=32     |     1755 |     1678 |
| k1=0.25 accelerate(0.5) W=8  |     4706 |     4491 |
| k1=0.25 accelerate(0.5) W=16 |     4894 |     4672 |
| k1=0.25 accelerate(0.5) W=32 |     5096 |     4873 |
| k1=0.25 accelerate(1.0) W=8  |     1529 |     1473 |
| k1=0.25 accelerate(1.0) W=16 |     1750 |     1680 |
| k1=0.25 accelerate(1.0) W=32 |     1960 |     1881 |
| k1=0.5 continue(0.5) W=8     |     1454 |     1402 |
| k1=0.5 continue(0.5) W=16    |     1838 |     1763 |
| k1=0.5 continue(0.5) W=32    |     2154 |     2066 |
| k1=0.5 continue(1.0) W=8     |      547 |      533 |
| k1=0.5 continue(1.0) W=16    |      882 |      857 |
| k1=0.5 continue(1.0) W=32    |     1195 |     1152 |
| k1=0.5 retest(0.3) W=8       |      983 |      937 |
| k1=0.5 retest(0.3) W=16      |     1437 |     1367 |
| k1=0.5 retest(0.3) W=32      |     1793 |     1705 |
| k1=0.5 retest(0.5) W=8       |      532 |      506 |
| k1=0.5 retest(0.5) W=16      |      835 |      795 |
| k1=0.5 retest(0.5) W=32      |     1132 |     1078 |
| k1=0.5 accelerate(0.5) W=8   |     3371 |     3213 |
| k1=0.5 accelerate(0.5) W=16  |     3480 |     3319 |
| k1=0.5 accelerate(0.5) W=32  |     3614 |     3452 |
| k1=0.5 accelerate(1.0) W=8   |     1158 |     1117 |
| k1=0.5 accelerate(1.0) W=16  |     1320 |     1268 |
| k1=0.5 accelerate(1.0) W=32  |     1471 |     1412 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0165% inside the 32 bars after any confirmed sequence (n = 12,077) versus +0.0089% outside; difference +0.0076% (95% day-block CI -0.0246 to +0.0367). Mean |M1 - M0| inside 0.0235 versus outside 0.0106. Correlation of (M1 - M0) with the primary sequence signal: +0.041.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.013. Rules:
```
|--- L_pos256 <= 0.21
|   |--- D_64 <= -0.13
|   |   |--- L_pos16 <= 0.35
|   |   |   |--- value: [-0.01]
|   |   |--- L_pos16 >  0.35
|   |   |   |--- value: [-0.02]
|   |--- D_64 >  -0.13
|   |   |--- value: [-0.04]
|--- L_pos256 >  0.21
|   |--- D_32 <= -2.17
|   |   |--- value: [0.02]
|   |--- D_32 >  -2.17
|   |   |--- L_age <= 83.50
|   |   |   |--- value: [-0.00]
|   |   |--- L_age >  83.50
|   |   |   |--- value: [0.01]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |   0.073 |   0.037 |    -0.036 |
| 2025-04-01 | vol_8    |     64 |   0.357 |   0.344 |    -0.013 |
| 2025-07-01 | dir_16   |     66 |   0.006 |  -0.008 |    -0.014 |
| 2025-07-01 | vol_8    |     66 |   0.219 |   0.230 |     0.012 |
| 2025-10-01 | dir_16   |     63 |   0.025 |   0.019 |    -0.006 |
| 2025-10-01 | vol_8    |     64 |   0.322 |   0.344 |     0.022 |
| 2026-01-01 | dir_16   |     63 |   0.054 |   0.057 |     0.003 |
| 2026-01-01 | vol_8    |     63 |   0.370 |   0.404 |     0.034 |
| 2026-04-01 | dir_16   |     64 |   0.064 |   0.091 |     0.039 |
| 2026-04-01 | vol_8    |     65 |   0.186 |   0.188 |     0.003 |
| 2026-07-01 | dir_16   |     37 |   0.101 |   0.031 |    -0.070 |
| 2026-07-01 | vol_8    |     37 |   0.265 |   0.266 |     0.001 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |   0.050 |   0.038 |   nan     | nan     | nan     |
| trees depth 3 (registered)                        | vol_8    |   0.345 |   0.369 |     0.024 |   0.017 |   0.030 |
| ridge, all features                               | dir_16   |   0.005 |   0.039 |     0.034 |   0.003 |   0.068 |
| ridge, all features                               | vol_8    |   0.388 |   0.387 |    -0.000 |  -0.002 |   0.001 |
| trees depth 2, 30 iterations                      | dir_16   |   0.003 |  -0.016 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.266 |   0.338 |     0.072 |   0.063 |   0.081 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |   0.051 |   0.026 |    -0.025 |  -0.052 |   0.004 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.345 |   0.365 |     0.020 |   0.015 |   0.026 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.