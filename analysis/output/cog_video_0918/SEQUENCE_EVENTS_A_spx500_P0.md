# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 572. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.22 (k1=0.5 retest(0.3) W=8), its validation+OOS t = -0.51; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return -0.0004 (5-95%: -0.0242 to +0.0275); move to favourable share +0.0178; response share +0.0145.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.1351 |              -0.0238 |              0.0923 | True              |            -0.4281 |            -1.0244 | False          |              0.1061 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.029 |  1.077 | 14608 |    217 |
| VAL                       |   -0.017 | -0.428 | 12153 |    182 |
| OOS                       |   -0.042 | -1.024 | 10374 |    154 |
| OOS R2 without s / with s |    0.167 |  0.167 | 10374 |    154 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |              -0.000 |                     | False            |               0.001 |                -0.008 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 786 |    224 |       -0.022 |         -0.025 |  -0.054 |   0.003 |         0.960 |
| all       | IS     | ret4     | 786 |    224 |       -0.007 |        nan     | nan     | nan     |         0.122 |
| all       | IS     | ret16    | 786 |    224 |       -0.023 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 786 |    224 |       -0.026 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 786 |    224 |        0.328 |          0.010 |  -0.025 |   0.045 |         0.282 |
| all       | IS     | adv16    | 786 |    224 |        0.379 |          0.060 |   0.022 |   0.094 |         0.000 |
| all       | IS     | resp64   | 786 |    224 |        0.560 |         -0.000 |  -0.041 |   0.041 |         0.524 |
| all       | IS     | vol8     | 786 |    224 |       -2.098 |        nan     | nan     | nan     |         0.006 |
| all       | VAL    | ret8     | 502 |    166 |       -0.016 |         -0.015 |  -0.073 |   0.041 |         0.697 |
| all       | VAL    | ret4     | 502 |    166 |       -0.008 |         -0.006 |  -0.053 |   0.036 |         0.569 |
| all       | VAL    | ret16    | 502 |    166 |       -0.075 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 502 |    166 |       -0.080 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 502 |    166 |        0.355 |          0.019 |  -0.027 |   0.066 |         0.233 |
| all       | VAL    | adv16    | 502 |    166 |        0.349 |          0.016 |  -0.035 |   0.064 |         0.258 |
| all       | VAL    | resp64   | 502 |    166 |        0.602 |          0.032 |  -0.018 |   0.078 |         0.111 |
| all       | VAL    | vol8     | 502 |    166 |       -1.806 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret8     | 477 |    154 |       -0.001 |         -0.000 |  -0.031 |   0.033 |         0.499 |
| all       | OOS    | ret4     | 477 |    154 |        0.006 |        nan     | nan     | nan     |         0.102 |
| all       | OOS    | ret16    | 477 |    154 |       -0.003 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 477 |    154 |        0.022 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 477 |    154 |        0.386 |          0.060 |   0.017 |   0.101 |         0.002 |
| all       | OOS    | adv16    | 477 |    154 |        0.363 |          0.040 |  -0.010 |   0.085 |         0.048 |
| all       | OOS    | resp64   | 477 |    154 |        0.604 |          0.019 |  -0.027 |   0.062 |         0.214 |
| all       | OOS    | vol8     | 477 |    154 |       -1.974 |        nan     | nan     | nan     |         0.016 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 786 |    nan     | nan     | nan     |         0.109 |
| IS     | 1-2 h    | 786 |    nan     | nan     | nan     |         0.146 |
| IS     | 2-4 h    | 786 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 786 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 786 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 502 |     -0.006 |  -0.049 |   0.033 |         0.584 |
| VAL    | 1-2 h    | 502 |     -0.008 |  -0.050 |   0.027 |         0.664 |
| VAL    | 2-4 h    | 502 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 502 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 502 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 477 |    nan     | nan     | nan     |         0.098 |
| OOS    | 1-2 h    | 477 |    nan     | nan     | nan     |         0.217 |
| OOS    | 2-4 h    | 477 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 477 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 477 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.011 | -0.885 | 15173 |    235 |
| VAL                       |   -0.024 | -1.000 | 12568 |    191 |
| OOS                       |   -0.003 | -0.181 | 10708 |    161 |
| OOS R2 without s / with s |   -0.016 | -0.016 | 10708 |    161 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|----:|------------:|----------:|----------:|---------:|---------:|
| VAL     | 502 |     -0.0163 |    0.5000 |   -0.0213 |  -0.0809 |   0.0297 |
| VAL     | 502 |     -0.0163 |    1.0000 |   -0.0263 |  -0.0859 |   0.0247 |
| VAL     | 502 |     -0.0163 |    2.0000 |   -0.0363 |  -0.0959 |   0.0147 |
| OOS     | 477 |     -0.0009 |    0.5000 |   -0.0059 |  -0.0377 |   0.0254 |
| OOS     | 477 |     -0.0009 |    1.0000 |   -0.0109 |  -0.0427 |   0.0204 |
| OOS     | 477 |     -0.0009 |    2.0000 |   -0.0209 |  -0.0527 |   0.0104 |
| VAL+OOS | 979 |     -0.0088 |    0.5000 |   -0.0138 |  -0.0488 |   0.0186 |
| VAL+OOS | 979 |     -0.0088 |    1.0000 |   -0.0188 |  -0.0538 |   0.0136 |
| VAL+OOS | 979 |     -0.0088 |    2.0000 |   -0.0288 |  -0.0638 |   0.0036 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                        |    n |   diff |      t |
|:----------------------------|-----:|-------:|-------:|
| k1=0.5 retest(0.3) W=8      |  446 |  0.022 |  1.327 |
| k1=0.5 retest(0.3) W=16     |  624 |  0.016 |  1.176 |
| k1=0.5 retest(0.5) W=16     |  350 |  0.019 |  0.996 |
| k1=0.5 accelerate(0.5) W=32 | 1417 |  0.006 |  0.858 |
| k1=0.5 accelerate(0.5) W=16 | 1369 |  0.005 |  0.740 |
| k1=0.5 retest(0.3) W=32     |  757 |  0.008 |  0.637 |
| k1=0.5 retest(0.5) W=8      |  234 |  0.012 |  0.542 |
| k1=0.5 retest(0.5) W=32     |  465 |  0.008 |  0.475 |
| k1=0.25 retest(0.3) W=16    |  955 |  0.003 |  0.275 |
| k1=0.25 retest(0.5) W=16    |  587 | -0.000 | -0.015 |
| k1=0.25 retest(0.3) W=8     |  678 | -0.003 | -0.208 |
| k1=0.5 accelerate(0.5) W=8  | 1330 | -0.002 | -0.230 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     2616 |     2514 |
| k1=0.25 continue(0.5) W=16   |     3151 |     3011 |
| k1=0.25 continue(0.5) W=32   |     3550 |     3399 |
| k1=0.25 continue(1.0) W=8    |      944 |      915 |
| k1=0.25 continue(1.0) W=16   |     1464 |     1412 |
| k1=0.25 continue(1.0) W=32   |     1927 |     1850 |
| k1=0.25 retest(0.3) W=8      |     1476 |     1415 |
| k1=0.25 retest(0.3) W=16     |     2156 |     2062 |
| k1=0.25 retest(0.3) W=32     |     2639 |     2524 |
| k1=0.25 retest(0.5) W=8      |      889 |      848 |
| k1=0.25 retest(0.5) W=16     |     1344 |     1282 |
| k1=0.25 retest(0.5) W=32     |     1755 |     1678 |
| k1=0.25 accelerate(0.5) W=8  |     4706 |     4492 |
| k1=0.25 accelerate(0.5) W=16 |     4894 |     4673 |
| k1=0.25 accelerate(0.5) W=32 |     5096 |     4874 |
| k1=0.25 accelerate(1.0) W=8  |     1529 |     1473 |
| k1=0.25 accelerate(1.0) W=16 |     1750 |     1680 |
| k1=0.25 accelerate(1.0) W=32 |     1960 |     1881 |
| k1=0.5 continue(0.5) W=8     |     1454 |     1404 |
| k1=0.5 continue(0.5) W=16    |     1838 |     1765 |
| k1=0.5 continue(0.5) W=32    |     2154 |     2065 |
| k1=0.5 continue(1.0) W=8     |      547 |      533 |
| k1=0.5 continue(1.0) W=16    |      882 |      858 |
| k1=0.5 continue(1.0) W=32    |     1195 |     1154 |
| k1=0.5 retest(0.3) W=8       |      983 |      937 |
| k1=0.5 retest(0.3) W=16      |     1437 |     1367 |
| k1=0.5 retest(0.3) W=32      |     1793 |     1705 |
| k1=0.5 retest(0.5) W=8       |      532 |      506 |
| k1=0.5 retest(0.5) W=16      |      835 |      795 |
| k1=0.5 retest(0.5) W=32      |     1132 |     1078 |
| k1=0.5 accelerate(0.5) W=8   |     3371 |     3212 |
| k1=0.5 accelerate(0.5) W=16  |     3480 |     3318 |
| k1=0.5 accelerate(0.5) W=32  |     3614 |     3451 |
| k1=0.5 accelerate(1.0) W=8   |     1158 |     1117 |
| k1=0.5 accelerate(1.0) W=16  |     1320 |     1268 |
| k1=0.5 accelerate(1.0) W=32  |     1471 |     1412 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0189% inside the 32 bars after any confirmed sequence (n = 12,079) versus +0.0118% outside; difference +0.0071% (95% day-block CI -0.0258 to +0.0400). Mean |M1 - M0| inside 0.0250 versus outside 0.0096. Correlation of (M1 - M0) with the primary sequence signal: +0.017.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.023. Rules:
```
|--- L_pos256 <= 0.24
|   |--- L_curv64 <= -1.51
|   |   |--- value: [-0.00]
|   |--- L_curv64 >  -1.51
|   |   |--- L_mom32 <= -1.04
|   |   |   |--- value: [-0.06]
|   |   |--- L_mom32 >  -1.04
|   |   |   |--- value: [-0.03]
|--- L_pos256 >  0.24
|   |--- L_legratio <= 1.21
|   |   |--- L_curv16 <= -0.15
|   |   |   |--- value: [0.01]
|   |   |--- L_curv16 >  -0.15
|   |   |   |--- value: [-0.01]
|   |--- L_legratio >  1.21
|   |   |--- L_pos16 <= 0.72
|   |   |   |--- value: [0.01]
|   |   |--- L_pos16 >  0.72
|   |   |   |--- value: [0.00]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |  -0.019 |   0.024 |     0.043 |
| 2025-04-01 | vol_8    |     64 |   0.196 |   0.227 |     0.031 |
| 2025-07-01 | dir_16   |     66 |   0.033 |   0.068 |     0.036 |
| 2025-07-01 | vol_8    |     66 |   0.145 |   0.176 |     0.031 |
| 2025-10-01 | dir_16   |     64 |   0.084 |   0.037 |    -0.045 |
| 2025-10-01 | vol_8    |     64 |   0.243 |   0.234 |    -0.009 |
| 2026-01-01 | dir_16   |     63 |   0.009 |   0.089 |     0.080 |
| 2026-01-01 | vol_8    |     63 |   0.281 |   0.313 |     0.032 |
| 2026-04-01 | dir_16   |     65 |   0.064 |   0.070 |     0.006 |
| 2026-04-01 | vol_8    |     65 |  -0.070 |  -0.100 |    -0.030 |
| 2026-07-01 | dir_16   |     37 |   0.098 |   0.041 |    -0.057 |
| 2026-07-01 | vol_8    |     37 |   0.240 |   0.264 |     0.024 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |   0.040 |   0.056 |   nan     | nan     | nan     |
| trees depth 3 (registered)                        | vol_8    |   0.281 |   0.296 |     0.015 |   0.008 |   0.022 |
| ridge, all features                               | dir_16   |   0.011 |   0.033 |     0.022 |  -0.004 |   0.049 |
| ridge, all features                               | vol_8    |   0.321 |   0.320 |    -0.001 |  -0.004 |   0.002 |
| trees depth 2, 30 iterations                      | dir_16   |   0.108 |   0.051 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.187 |   0.233 |     0.046 |   0.035 |   0.057 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |   0.040 |   0.054 |   nan     | nan     | nan     |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.281 |   0.295 |     0.014 |   0.009 |   0.021 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.