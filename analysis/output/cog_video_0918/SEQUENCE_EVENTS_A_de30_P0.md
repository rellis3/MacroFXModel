# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 572. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.38 (k1=0.5 retest(0.5) W=32), its validation+OOS t = +0.29; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return +0.0028 (5-95%: -0.0254 to +0.0316); move to favourable share +0.0102; response share +0.0068.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.1332 |              -0.0695 |              0.0183 | True              |            -0.4977 |            -0.3001 | True           |              0.1323 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.031 | -1.010 | 10170 |    178 |
| VAL                       |   -0.020 | -0.498 |  8490 |    150 |
| OOS                       |   -0.012 | -0.300 |  7027 |    123 |
| OOS R2 without s / with s |    0.122 |  0.122 |  7027 |    123 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |               0.003 |                     | False            |               0.006 |                -0.005 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 690 |    215 |       -0.011 |         -0.005 |  -0.030 |   0.022 |         0.643 |
| all       | IS     | ret4     | 690 |    215 |        0.008 |          0.013 |  -0.005 |   0.032 |         0.085 |
| all       | IS     | ret16    | 690 |    215 |       -0.014 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 690 |    215 |       -0.044 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 690 |    215 |        0.320 |          0.026 |  -0.009 |   0.063 |         0.080 |
| all       | IS     | adv16    | 690 |    215 |        0.328 |          0.027 |  -0.007 |   0.064 |         0.070 |
| all       | IS     | resp64   | 690 |    215 |        0.504 |          0.004 |  -0.038 |   0.044 |         0.420 |
| all       | IS     | vol8     | 690 |    215 |       -2.016 |        nan     | nan     | nan     |         0.015 |
| all       | VAL    | ret8     | 460 |    166 |       -0.032 |         -0.034 |  -0.092 |   0.018 |         0.886 |
| all       | VAL    | ret4     | 460 |    166 |       -0.015 |         -0.019 |  -0.053 |   0.011 |         0.895 |
| all       | VAL    | ret16    | 460 |    166 |       -0.114 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 460 |    166 |       -0.095 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 460 |    166 |        0.317 |          0.015 |  -0.029 |   0.064 |         0.244 |
| all       | VAL    | adv16    | 460 |    166 |        0.322 |          0.026 |  -0.018 |   0.070 |         0.132 |
| all       | VAL    | resp64   | 460 |    166 |        0.493 |         -0.009 |  -0.060 |   0.042 |         0.653 |
| all       | VAL    | vol8     | 460 |    166 |       -1.805 |        nan     | nan     | nan     |         0.014 |
| all       | OOS    | ret8     | 439 |    146 |        0.023 |          0.026 |  -0.016 |   0.067 |         0.116 |
| all       | OOS    | ret4     | 439 |    146 |        0.029 |          0.033 |  -0.000 |   0.065 |         0.026 |
| all       | OOS    | ret16    | 439 |    146 |        0.008 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 439 |    146 |        0.019 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 439 |    146 |        0.374 |          0.054 |   0.005 |   0.107 |         0.014 |
| all       | OOS    | adv16    | 439 |    146 |        0.308 |         -0.016 |  -0.067 |   0.028 |         0.765 |
| all       | OOS    | resp64   | 439 |    146 |        0.572 |          0.044 |  -0.006 |   0.095 |         0.047 |
| all       | OOS    | vol8     | 439 |    146 |       -1.709 |        nan     | nan     | nan     |         0.010 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 690 |      0.013 |  -0.006 |   0.032 |         0.081 |
| IS     | 1-2 h    | 690 |     -0.017 |  -0.035 |   0.002 |         0.964 |
| IS     | 2-4 h    | 690 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 690 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 690 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 460 |     -0.019 |  -0.050 |   0.009 |         0.911 |
| VAL    | 1-2 h    | 460 |     -0.013 |  -0.056 |   0.023 |         0.736 |
| VAL    | 2-4 h    | 460 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 460 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 460 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 439 |      0.033 |   0.000 |   0.067 |         0.024 |
| OOS    | 1-2 h    | 439 |     -0.006 |  -0.036 |   0.022 |         0.701 |
| OOS    | 2-4 h    | 439 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 439 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 439 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.004 | -0.305 | 10221 |    178 |
| VAL                       |   -0.044 | -1.439 |  8509 |    150 |
| OOS                       |   -0.017 | -0.927 |  7041 |    123 |
| OOS R2 without s / with s |   -0.011 | -0.010 |  7041 |    123 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |   n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|----:|------------:|----------:|----------:|---------:|---------:|
| VAL     | 460 |     -0.0316 |    0.5000 |   -0.0366 |  -0.0883 |   0.0155 |
| VAL     | 460 |     -0.0316 |    1.0000 |   -0.0416 |  -0.0933 |   0.0105 |
| VAL     | 460 |     -0.0316 |    2.0000 |   -0.0516 |  -0.1033 |   0.0005 |
| OOS     | 439 |      0.0233 |    0.5000 |    0.0183 |  -0.0236 |   0.0616 |
| OOS     | 439 |      0.0233 |    1.0000 |    0.0133 |  -0.0286 |   0.0566 |
| OOS     | 439 |      0.0233 |    2.0000 |    0.0033 |  -0.0386 |   0.0466 |
| VAL+OOS | 899 |     -0.0048 |    0.5000 |   -0.0098 |  -0.0457 |   0.0235 |
| VAL+OOS | 899 |     -0.0048 |    1.0000 |   -0.0148 |  -0.0507 |   0.0185 |
| VAL+OOS | 899 |     -0.0048 |    2.0000 |   -0.0248 |  -0.0607 |   0.0085 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |    n |   diff |     t |
|:-----------------------------|-----:|-------:|------:|
| k1=0.5 retest(0.5) W=32      |  392 |  0.029 | 1.529 |
| k1=0.5 retest(0.5) W=16      |  308 |  0.028 | 1.288 |
| k1=0.5 accelerate(0.5) W=32  | 1237 |  0.010 | 1.244 |
| k1=0.5 retest(0.5) W=8       |  208 |  0.022 | 0.753 |
| k1=0.25 accelerate(1.0) W=8  |  554 |  0.012 | 0.706 |
| k1=0.25 accelerate(0.5) W=32 | 1781 |  0.004 | 0.574 |
| k1=0.5 accelerate(0.5) W=8   | 1158 |  0.003 | 0.400 |
| k1=0.5 accelerate(0.5) W=16  | 1195 |  0.002 | 0.289 |
| k1=0.25 accelerate(0.5) W=8  | 1656 |  0.001 | 0.217 |
| k1=0.5 retest(0.3) W=8       |  395 |  0.004 | 0.211 |
| k1=0.25 accelerate(1.0) W=16 |  639 |  0.002 | 0.107 |
| k1=0.5 retest(0.3) W=32      |  641 |  0.000 | 0.019 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     2616 |     2251 |
| k1=0.25 continue(0.5) W=16   |     3151 |     2704 |
| k1=0.25 continue(0.5) W=32   |     3550 |     2948 |
| k1=0.25 continue(1.0) W=8    |      944 |      830 |
| k1=0.25 continue(1.0) W=16   |     1464 |     1284 |
| k1=0.25 continue(1.0) W=32   |     1927 |     1628 |
| k1=0.25 retest(0.3) W=8      |     1476 |     1296 |
| k1=0.25 retest(0.3) W=16     |     2156 |     1885 |
| k1=0.25 retest(0.3) W=32     |     2639 |     2196 |
| k1=0.25 retest(0.5) W=8      |      889 |      784 |
| k1=0.25 retest(0.5) W=16     |     1344 |     1174 |
| k1=0.25 retest(0.5) W=32     |     1755 |     1470 |
| k1=0.25 accelerate(0.5) W=8  |     4706 |     3996 |
| k1=0.25 accelerate(0.5) W=16 |     4894 |     4164 |
| k1=0.25 accelerate(0.5) W=32 |     5096 |     4337 |
| k1=0.25 accelerate(1.0) W=8  |     1529 |     1331 |
| k1=0.25 accelerate(1.0) W=16 |     1750 |     1519 |
| k1=0.25 accelerate(1.0) W=32 |     1960 |     1709 |
| k1=0.5 continue(0.5) W=8     |     1454 |     1262 |
| k1=0.5 continue(0.5) W=16    |     1838 |     1589 |
| k1=0.5 continue(0.5) W=32    |     2154 |     1787 |
| k1=0.5 continue(1.0) W=8     |      547 |      487 |
| k1=0.5 continue(1.0) W=16    |      882 |      787 |
| k1=0.5 continue(1.0) W=32    |     1195 |     1024 |
| k1=0.5 retest(0.3) W=8       |      983 |      851 |
| k1=0.5 retest(0.3) W=16      |     1437 |     1246 |
| k1=0.5 retest(0.3) W=32      |     1793 |     1485 |
| k1=0.5 retest(0.5) W=8       |      532 |      465 |
| k1=0.5 retest(0.5) W=16      |      835 |      725 |
| k1=0.5 retest(0.5) W=32      |     1132 |      948 |
| k1=0.5 accelerate(0.5) W=8   |     3371 |     2847 |
| k1=0.5 accelerate(0.5) W=16  |     3480 |     2946 |
| k1=0.5 accelerate(0.5) W=32  |     3614 |     3063 |
| k1=0.5 accelerate(1.0) W=8   |     1158 |     1007 |
| k1=0.5 accelerate(1.0) W=16  |     1320 |     1141 |
| k1=0.5 accelerate(1.0) W=32  |     1471 |     1280 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = -0.0134% inside the 32 bars after any confirmed sequence (n = 9,107) versus -0.0077% outside; difference -0.0056% (95% day-block CI -0.0735 to +0.0588). Mean |M1 - M0| inside 0.0403 versus outside 0.0278. Correlation of (M1 - M0) with the primary sequence signal: +0.015.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.043. Rules:
```
|--- L_legratio <= 1.42
|   |--- L_mom64 <= -1.64
|   |   |--- value: [-0.04]
|   |--- L_mom64 >  -1.64
|   |   |--- D_64 <= -0.11
|   |   |   |--- value: [0.01]
|   |   |--- D_64 >  -0.11
|   |   |   |--- value: [-0.01]
|--- L_legratio >  1.42
|   |--- L_bhi128 <= 0.10
|   |   |--- value: [-0.03]
|   |--- L_bhi128 >  0.10
|   |   |--- L_leg <= 2.94
|   |   |   |--- value: [0.05]
|   |   |--- L_leg >  2.94
|   |   |   |--- value: [0.03]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     62 |   0.014 |  -0.060 |    -0.074 |
| 2025-04-01 | vol_8    |     62 |   0.279 |   0.304 |     0.025 |
| 2025-07-01 | dir_16   |     66 |  -0.112 |  -0.098 |     0.014 |
| 2025-07-01 | vol_8    |     66 |   0.257 |   0.265 |     0.008 |
| 2025-10-01 | dir_16   |     62 |  -0.137 |  -0.105 |     0.032 |
| 2025-10-01 | vol_8    |     62 |   0.280 |   0.297 |     0.017 |
| 2026-01-01 | dir_16   |     63 |   0.046 |  -0.064 |    -0.111 |
| 2026-01-01 | vol_8    |     63 |   0.197 |   0.201 |     0.004 |
| 2026-04-01 | dir_16   |     62 |  -0.028 |  -0.090 |    -0.061 |
| 2026-04-01 | vol_8    |     62 |   0.206 |   0.206 |     0.000 |
| 2026-07-01 | dir_16   |     37 |  -0.122 |  -0.010 |     0.112 |
| 2026-07-01 | vol_8    |     37 |   0.274 |   0.272 |    -0.002 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.052 |  -0.076 |    -0.024 |  -0.053 |   0.010 |
| trees depth 3 (registered)                        | vol_8    |   0.263 |   0.276 |     0.012 |   0.006 |   0.020 |
| ridge, all features                               | dir_16   |  -0.065 |  -0.026 |     0.039 |   0.011 |   0.068 |
| ridge, all features                               | vol_8    |   0.286 |   0.286 |     0.000 |  -0.003 |   0.004 |
| trees depth 2, 30 iterations                      | dir_16   |  -0.076 |  -0.094 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.199 |   0.216 |     0.018 |   0.011 |   0.025 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.052 |  -0.063 |    -0.011 |  -0.039 |   0.018 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.263 |   0.267 |     0.003 |  -0.001 |   0.008 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.