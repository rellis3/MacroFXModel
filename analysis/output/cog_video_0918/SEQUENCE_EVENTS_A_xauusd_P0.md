# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 572. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.12 (k1=0.25 continue(1.0) W=32), its validation+OOS t = -0.34; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return -0.0006 (5-95%: -0.0302 to +0.0296); move to favourable share +0.0108; response share -0.0044.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| True                  |         0.1300 |              -0.1282 |             -0.0461 | True              |             1.3685 |            -1.1701 | False          |              0.1022 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.049 |  1.866 | 14490 |    217 |
| VAL                       |    0.053 |  1.369 | 11985 |    183 |
| OOS                       |   -0.044 | -1.170 | 10068 |    153 |
| OOS R2 without s / with s |    0.205 |  0.204 | 10068 |    153 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |              -0.001 |                     | False            |               0.000 |                -0.006 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 781 |    225 |        0.004 |          0.005 |  -0.017 |   0.028 |         0.334 |
| all       | IS     | ret4     | 781 |    225 |        0.007 |        nan     | nan     | nan     |         0.035 |
| all       | IS     | ret16    | 781 |    225 |        0.004 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 781 |    225 |       -0.000 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 781 |    225 |        0.332 |          0.031 |   0.001 |   0.063 |         0.021 |
| all       | IS     | adv16    | 781 |    225 |        0.348 |          0.041 |   0.004 |   0.078 |         0.018 |
| all       | IS     | resp64   | 781 |    225 |        0.557 |          0.015 |  -0.019 |   0.052 |         0.198 |
| all       | IS     | vol8     | 781 |    225 |       -2.017 |         -0.114 |  -0.200 |  -0.019 |         0.994 |
| all       | VAL    | ret8     | 501 |    167 |       -0.014 |         -0.016 |  -0.058 |   0.026 |         0.771 |
| all       | VAL    | ret4     | 501 |    167 |       -0.024 |         -0.026 |  -0.059 |   0.008 |         0.934 |
| all       | VAL    | ret16    | 501 |    167 |       -0.003 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 501 |    167 |       -0.011 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 501 |    167 |        0.343 |          0.038 |  -0.009 |   0.078 |         0.058 |
| all       | VAL    | adv16    | 501 |    167 |        0.351 |          0.049 |   0.003 |   0.092 |         0.016 |
| all       | VAL    | resp64   | 501 |    167 |        0.577 |          0.031 |  -0.013 |   0.081 |         0.104 |
| all       | VAL    | vol8     | 501 |    167 |       -1.707 |          0.120 |   0.005 |   0.227 |         0.022 |
| all       | OOS    | ret8     | 474 |    154 |        0.002 |          0.004 |  -0.052 |   0.058 |         0.429 |
| all       | OOS    | ret4     | 474 |    154 |       -0.003 |        nan     | nan     | nan     |         0.158 |
| all       | OOS    | ret16    | 474 |    154 |       -0.022 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 474 |    154 |       -0.018 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 474 |    154 |        0.306 |         -0.006 |  -0.056 |   0.043 |         0.592 |
| all       | OOS    | adv16    | 474 |    154 |        0.310 |         -0.003 |  -0.046 |   0.038 |         0.598 |
| all       | OOS    | resp64   | 474 |    154 |        0.551 |         -0.013 |  -0.067 |   0.038 |         0.690 |
| all       | OOS    | vol8     | 474 |    154 |       -1.592 |          0.140 |   0.029 |   0.254 |         0.008 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 781 |    nan     | nan     | nan     |         0.034 |
| IS     | 1-2 h    | 781 |    nan     | nan     | nan     |         0.086 |
| IS     | 2-4 h    | 781 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 781 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 781 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 501 |     -0.026 |  -0.060 |   0.007 |         0.943 |
| VAL    | 1-2 h    | 501 |      0.011 |  -0.021 |   0.038 |         0.282 |
| VAL    | 2-4 h    | 501 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 501 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 501 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 474 |    nan     | nan     | nan     |         0.129 |
| OOS    | 1-2 h    | 474 |    nan     | nan     | nan     |         0.205 |
| OOS    | 2-4 h    | 474 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 474 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 474 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.000 |  0.026 | 14680 |    217 |
| VAL                       |    0.005 |  0.264 | 12145 |    183 |
| OOS                       |   -0.037 | -1.488 | 10195 |    153 |
| OOS R2 without s / with s |    0.001 |  0.000 | 10195 |    153 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|----:|------------:|----------:|----------:|---------:|---------:|
| VAL     | 501 |     -0.0135 |    0.5000 |   -0.0185 |  -0.0627 |   0.0211 |
| VAL     | 501 |     -0.0135 |    1.0000 |   -0.0235 |  -0.0677 |   0.0161 |
| VAL     | 501 |     -0.0135 |    2.0000 |   -0.0335 |  -0.0777 |   0.0061 |
| OOS     | 474 |      0.0016 |    0.5000 |   -0.0034 |  -0.0641 |   0.0504 |
| OOS     | 474 |      0.0016 |    1.0000 |   -0.0084 |  -0.0691 |   0.0454 |
| OOS     | 474 |      0.0016 |    2.0000 |   -0.0184 |  -0.0791 |   0.0354 |
| VAL+OOS | 975 |     -0.0062 |    0.5000 |   -0.0112 |  -0.0456 |   0.0252 |
| VAL+OOS | 975 |     -0.0062 |    1.0000 |   -0.0162 |  -0.0506 |   0.0202 |
| VAL+OOS | 975 |     -0.0062 |    2.0000 |   -0.0262 |  -0.0606 |   0.0102 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |     t |
|:-----------------------------|-----:|-------:|------:|
| k1=0.5 accelerate(0.5) W=8   | 1329 |  0.009 | 1.165 |
| k1=0.25 accelerate(1.0) W=32 |  803 |  0.018 | 1.069 |
| k1=0.25 continue(1.0) W=16   |  620 |  0.018 | 1.029 |
| k1=0.25 accelerate(1.0) W=16 |  725 |  0.014 | 0.916 |
| k1=0.5 accelerate(0.5) W=16  | 1369 |  0.007 | 0.895 |
| k1=0.5 continue(1.0) W=16    |  386 |  0.017 | 0.814 |
| k1=0.25 continue(1.0) W=32   |  798 |  0.013 | 0.772 |
| k1=0.5 retest(0.3) W=8       |  443 |  0.010 | 0.684 |
| k1=0.5 continue(1.0) W=8     |  242 |  0.015 | 0.586 |
| k1=0.25 continue(0.5) W=16   | 1297 |  0.006 | 0.564 |
| k1=0.5 retest(0.5) W=8       |  233 |  0.012 | 0.546 |
| k1=0.25 continue(0.5) W=8    | 1085 |  0.005 | 0.500 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     2616 |     2507 |
| k1=0.25 continue(0.5) W=16   |     3151 |     3001 |
| k1=0.25 continue(0.5) W=32   |     3550 |     3390 |
| k1=0.25 continue(1.0) W=8    |      944 |      911 |
| k1=0.25 continue(1.0) W=16   |     1464 |     1406 |
| k1=0.25 continue(1.0) W=32   |     1927 |     1845 |
| k1=0.25 retest(0.3) W=8      |     1476 |     1412 |
| k1=0.25 retest(0.3) W=16     |     2156 |     2050 |
| k1=0.25 retest(0.3) W=32     |     2639 |     2508 |
| k1=0.25 retest(0.5) W=8      |      889 |      846 |
| k1=0.25 retest(0.5) W=16     |     1344 |     1273 |
| k1=0.25 retest(0.5) W=32     |     1755 |     1668 |
| k1=0.25 accelerate(0.5) W=8  |     4706 |     4478 |
| k1=0.25 accelerate(0.5) W=16 |     4894 |     4658 |
| k1=0.25 accelerate(0.5) W=32 |     5096 |     4859 |
| k1=0.25 accelerate(1.0) W=8  |     1529 |     1472 |
| k1=0.25 accelerate(1.0) W=16 |     1750 |     1679 |
| k1=0.25 accelerate(1.0) W=32 |     1960 |     1881 |
| k1=0.5 continue(0.5) W=8     |     1454 |     1399 |
| k1=0.5 continue(0.5) W=16    |     1838 |     1756 |
| k1=0.5 continue(0.5) W=32    |     2154 |     2057 |
| k1=0.5 continue(1.0) W=8     |      547 |      531 |
| k1=0.5 continue(1.0) W=16    |      882 |      853 |
| k1=0.5 continue(1.0) W=32    |     1195 |     1151 |
| k1=0.5 retest(0.3) W=8       |      983 |      932 |
| k1=0.5 retest(0.3) W=16      |     1437 |     1359 |
| k1=0.5 retest(0.3) W=32      |     1793 |     1694 |
| k1=0.5 retest(0.5) W=8       |      532 |      505 |
| k1=0.5 retest(0.5) W=16      |      835 |      792 |
| k1=0.5 retest(0.5) W=32      |     1132 |     1076 |
| k1=0.5 accelerate(0.5) W=8   |     3371 |     3196 |
| k1=0.5 accelerate(0.5) W=16  |     3480 |     3303 |
| k1=0.5 accelerate(0.5) W=32  |     3614 |     3436 |
| k1=0.5 accelerate(1.0) W=8   |     1158 |     1115 |
| k1=0.5 accelerate(1.0) W=16  |     1320 |     1266 |
| k1=0.5 accelerate(1.0) W=32  |     1471 |     1411 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = -0.0187% inside the 32 bars after any confirmed sequence (n = 11,823) versus -0.0394% outside; difference +0.0207% (95% day-block CI -0.0670 to +0.1050). Mean |M1 - M0| inside 0.0561 versus outside 0.0458. Correlation of (M1 - M0) with the primary sequence signal: +0.010.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared +0.101. Rules:
```
|--- L_blo128 <= 0.81
|   |--- L_legratio <= 0.37
|   |   |--- value: [-0.08]
|   |--- L_legratio >  0.37
|   |   |--- L_leg <= 4.44
|   |   |   |--- value: [0.01]
|   |   |--- L_leg >  4.44
|   |   |   |--- value: [-0.08]
|--- L_blo128 >  0.81
|   |--- L_curv64 <= -1.74
|   |   |--- value: [0.12]
|   |--- L_curv64 >  -1.74
|   |   |--- D_32 <= 0.59
|   |   |   |--- value: [0.05]
|   |   |--- D_32 >  0.59
|   |   |   |--- value: [0.02]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |   0.079 |  -0.044 |    -0.122 |
| 2025-04-01 | vol_8    |     64 |   0.127 |   0.116 |    -0.011 |
| 2025-07-01 | dir_16   |     66 |  -0.170 |  -0.075 |     0.095 |
| 2025-07-01 | vol_8    |     66 |   0.144 |   0.156 |     0.012 |
| 2025-10-01 | dir_16   |     65 |  -0.055 |  -0.066 |    -0.012 |
| 2025-10-01 | vol_8    |     65 |   0.180 |   0.155 |    -0.025 |
| 2026-01-01 | dir_16   |     63 |   0.111 |  -0.024 |    -0.135 |
| 2026-01-01 | vol_8    |     63 |   0.203 |   0.182 |    -0.021 |
| 2026-04-01 | dir_16   |     64 |  -0.115 |  -0.093 |     0.022 |
| 2026-04-01 | vol_8    |     64 |   0.054 |   0.080 |     0.026 |
| 2026-07-01 | dir_16   |     37 |  -0.121 |  -0.094 |     0.027 |
| 2026-07-01 | vol_8    |     37 |  -0.029 |  -0.013 |     0.016 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.041 |  -0.064 |    -0.024 |  -0.057 |   0.012 |
| trees depth 3 (registered)                        | vol_8    |   0.155 |   0.159 |     0.004 |  -0.004 |   0.011 |
| ridge, all features                               | dir_16   |  -0.146 |  -0.078 |     0.068 |   0.042 |   0.094 |
| ridge, all features                               | vol_8    |   0.188 |   0.190 |     0.002 |  -0.002 |   0.006 |
| trees depth 2, 30 iterations                      | dir_16   |  -0.158 |  -0.087 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.075 |   0.070 |    -0.006 |  -0.013 |   0.002 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.041 |  -0.057 |    -0.017 |  -0.047 |   0.012 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.155 |   0.153 |    -0.001 |  -0.007 |   0.004 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.