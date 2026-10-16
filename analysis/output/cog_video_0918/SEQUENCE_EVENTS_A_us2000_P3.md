# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 520. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.72 (k1=0.25 retest(0.3) W=32), its validation+OOS t = +0.25; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return -0.0026 (5-95%: -0.0522 to +0.0419); move to favourable share -0.0009; response share +0.0043.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.1568 |               0.0472 |              0.1498 | True              |            -0.4633 |             0.3413 | False          |              0.1155 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.001 |  0.015 | 14693 |    217 |
| VAL                       |   -0.018 | -0.463 | 12167 |    182 |
| OOS                       |    0.011 |  0.341 | 10295 |    154 |
| OOS R2 without s / with s |    0.209 |  0.209 | 10295 |    154 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | True      | False                   |              -0.003 |                     | False            |              -0.000 |                 0.003 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 263 |     81 |       -0.013 |         -0.013 |  -0.086 |   0.055 |         0.637 |
| all       | IS     | ret4     | 263 |     81 |       -0.008 |         -0.004 |  -0.064 |   0.057 |         0.549 |
| all       | IS     | ret16    | 263 |     81 |       -0.077 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 263 |     81 |       -0.030 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 263 |     81 |        0.316 |         -0.018 |  -0.080 |   0.041 |         0.726 |
| all       | IS     | adv16    | 263 |     81 |        0.392 |          0.076 |   0.013 |   0.141 |         0.007 |
| all       | IS     | resp64   | 263 |     81 |        0.536 |         -0.014 |  -0.087 |   0.054 |         0.656 |
| all       | IS     | vol8     | 263 |     81 |       -1.492 |          0.136 |  -0.010 |   0.276 |         0.035 |
| all       | VAL    | ret8     | 528 |    177 |        0.014 |          0.018 |  -0.051 |   0.093 |         0.299 |
| all       | VAL    | ret4     | 528 |    177 |       -0.022 |         -0.024 |  -0.089 |   0.042 |         0.745 |
| all       | VAL    | ret16    | 528 |    177 |        0.009 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 528 |    177 |        0.023 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 528 |    177 |        0.367 |          0.045 |  -0.002 |   0.096 |         0.031 |
| all       | VAL    | adv16    | 528 |    177 |        0.337 |          0.012 |  -0.033 |   0.058 |         0.307 |
| all       | VAL    | resp64   | 528 |    177 |        0.572 |          0.026 |  -0.022 |   0.074 |         0.133 |
| all       | VAL    | vol8     | 528 |    177 |       -1.397 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret8     | 481 |    152 |       -0.012 |         -0.012 |  -0.067 |   0.044 |         0.654 |
| all       | OOS    | ret4     | 481 |    152 |        0.002 |        nan     | nan     | nan     |         0.015 |
| all       | OOS    | ret16    | 481 |    152 |       -0.018 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 481 |    152 |        0.026 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 481 |    152 |        0.383 |          0.057 |   0.012 |   0.099 |         0.008 |
| all       | OOS    | adv16    | 481 |    152 |        0.339 |          0.008 |  -0.034 |   0.053 |         0.361 |
| all       | OOS    | resp64   | 481 |    152 |        0.595 |          0.040 |  -0.011 |   0.091 |         0.062 |
| all       | OOS    | vol8     | 481 |    152 |       -1.491 |        nan     | nan     | nan     |         0.008 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 263 |     -0.004 |  -0.058 |   0.052 |         0.566 |
| IS     | 1-2 h    | 263 |     -0.008 |  -0.051 |   0.040 |         0.640 |
| IS     | 2-4 h    | 263 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 263 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 263 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 528 |     -0.024 |  -0.080 |   0.038 |         0.775 |
| VAL    | 1-2 h    | 528 |      0.042 |  -0.002 |   0.078 |         0.033 |
| VAL    | 2-4 h    | 528 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 528 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 528 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 481 |    nan     | nan     | nan     |         0.019 |
| OOS    | 1-2 h    | 481 |    nan     | nan     | nan     |         0.033 |
| OOS    | 2-4 h    | 481 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 481 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 481 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.029 | -0.964 | 15076 |    228 |
| VAL                       |    0.018 |  0.655 | 12474 |    187 |
| OOS                       |   -0.008 | -0.320 | 10512 |    156 |
| OOS R2 without s / with s |   -0.005 | -0.005 | 10512 |    156 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|-----:|------------:|----------:|----------:|---------:|---------:|
| VAL     |  528 |      0.0144 |    0.5000 |    0.0094 |  -0.0623 |   0.0742 |
| VAL     |  528 |      0.0144 |    1.0000 |    0.0044 |  -0.0673 |   0.0692 |
| VAL     |  528 |      0.0144 |    2.0000 |   -0.0056 |  -0.0773 |   0.0592 |
| OOS     |  481 |     -0.0120 |    0.5000 |   -0.0170 |  -0.0724 |   0.0365 |
| OOS     |  481 |     -0.0120 |    1.0000 |   -0.0220 |  -0.0774 |   0.0315 |
| OOS     |  481 |     -0.0120 |    2.0000 |   -0.0320 |  -0.0874 |   0.0215 |
| VAL+OOS | 1009 |      0.0018 |    0.5000 |   -0.0032 |  -0.0494 |   0.0396 |
| VAL+OOS | 1009 |      0.0018 |    1.0000 |   -0.0082 |  -0.0544 |   0.0346 |
| VAL+OOS | 1009 |      0.0018 |    2.0000 |   -0.0182 |  -0.0644 |   0.0246 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |   n |   diff |     t |
|:-----------------------------|----:|-------:|------:|
| k1=0.25 retest(0.3) W=32     | 448 |  0.039 | 1.776 |
| k1=0.25 retest(0.3) W=16     | 394 |  0.039 | 1.756 |
| k1=0.25 retest(0.5) W=16     | 241 |  0.052 | 1.678 |
| k1=0.25 retest(0.3) W=8      | 295 |  0.037 | 1.583 |
| k1=0.25 retest(0.5) W=32     | 298 |  0.038 | 1.406 |
| k1=0.25 accelerate(0.5) W=8  | 561 |  0.033 | 1.401 |
| k1=0.5 accelerate(0.5) W=32  | 428 |  0.029 | 1.339 |
| k1=0.25 continue(0.5) W=8    | 354 |  0.039 | 1.270 |
| k1=0.25 accelerate(0.5) W=32 | 621 |  0.026 | 1.149 |
| k1=0.5 accelerate(0.5) W=16  | 411 |  0.022 | 0.960 |
| k1=0.25 accelerate(0.5) W=16 | 592 |  0.022 | 0.947 |
| k1=0.5 accelerate(0.5) W=8   | 393 |  0.023 | 0.910 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1824 |     1750 |
| k1=0.25 continue(0.5) W=16   |     2258 |     2153 |
| k1=0.25 continue(0.5) W=32   |     2587 |     2473 |
| k1=0.25 continue(1.0) W=8    |      646 |      622 |
| k1=0.25 continue(1.0) W=16   |     1042 |      998 |
| k1=0.25 continue(1.0) W=32   |     1420 |     1359 |
| k1=0.25 retest(0.3) W=8      |     1482 |     1423 |
| k1=0.25 retest(0.3) W=16     |     2029 |     1947 |
| k1=0.25 retest(0.3) W=32     |     2368 |     2266 |
| k1=0.25 retest(0.5) W=8      |      936 |      903 |
| k1=0.25 retest(0.5) W=16     |     1351 |     1303 |
| k1=0.25 retest(0.5) W=32     |     1645 |     1584 |
| k1=0.25 accelerate(0.5) W=8  |     3284 |     3164 |
| k1=0.25 accelerate(0.5) W=16 |     3475 |     3343 |
| k1=0.25 accelerate(0.5) W=32 |     3632 |     3495 |
| k1=0.25 accelerate(1.0) W=8  |     1076 |     1040 |
| k1=0.25 accelerate(1.0) W=16 |     1249 |     1206 |
| k1=0.25 accelerate(1.0) W=32 |     1425 |     1378 |
| k1=0.5 continue(0.5) W=8     |     1041 |      989 |
| k1=0.5 continue(0.5) W=16    |     1344 |     1272 |
| k1=0.5 continue(0.5) W=32    |     1590 |     1509 |
| k1=0.5 continue(1.0) W=8     |      391 |      378 |
| k1=0.5 continue(1.0) W=16    |      631 |      607 |
| k1=0.5 continue(1.0) W=32    |      888 |      853 |
| k1=0.5 retest(0.3) W=8       |      757 |      727 |
| k1=0.5 retest(0.3) W=16      |     1116 |     1072 |
| k1=0.5 retest(0.3) W=32      |     1395 |     1332 |
| k1=0.5 retest(0.5) W=8       |      441 |      426 |
| k1=0.5 retest(0.5) W=16      |      685 |      664 |
| k1=0.5 retest(0.5) W=32      |      900 |      868 |
| k1=0.5 accelerate(0.5) W=8   |     2383 |     2295 |
| k1=0.5 accelerate(0.5) W=16  |     2477 |     2383 |
| k1=0.5 accelerate(0.5) W=32  |     2587 |     2490 |
| k1=0.5 accelerate(1.0) W=8   |      867 |      833 |
| k1=0.5 accelerate(1.0) W=16  |      980 |      942 |
| k1=0.5 accelerate(1.0) W=32  |     1105 |     1063 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0155% inside the 32 bars after any confirmed sequence (n = 12,703) versus -0.0284% outside; difference +0.0439% (95% day-block CI -0.0034 to +0.0921). Mean |M1 - M0| inside 0.0561 versus outside 0.0181. Correlation of (M1 - M0) with the primary sequence signal: +0.015.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared -0.016. Rules:
```
|--- L_mom128 <= 0.34
|   |--- D_128 <= -0.32
|   |   |--- L_blo128 <= 0.08
|   |   |   |--- value: [0.00]
|   |   |--- L_blo128 >  0.08
|   |   |   |--- value: [-0.05]
|   |--- D_128 >  -0.32
|   |   |--- L_blo128 <= 0.06
|   |   |   |--- value: [0.05]
|   |   |--- L_blo128 >  0.06
|   |   |   |--- value: [-0.00]
|--- L_mom128 >  0.34
|   |--- L_mom16 <= 0.56
|   |   |--- D_128 <= 1.91
|   |   |   |--- value: [-0.08]
|   |   |--- D_128 >  1.91
|   |   |   |--- value: [-0.01]
|   |--- L_mom16 >  0.56
|   |   |--- value: [-0.14]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |   0.017 |   0.077 |     0.059 |
| 2025-04-01 | vol_8    |     64 |   0.279 |   0.290 |     0.011 |
| 2025-07-01 | dir_16   |     66 |  -0.021 |   0.040 |     0.061 |
| 2025-07-01 | vol_8    |     66 |   0.156 |   0.183 |     0.027 |
| 2025-10-01 | dir_16   |     64 |   0.040 |   0.104 |     0.064 |
| 2025-10-01 | vol_8    |     64 |   0.333 |   0.345 |     0.012 |
| 2026-01-01 | dir_16   |     63 |   0.027 |   0.034 |     0.008 |
| 2026-01-01 | vol_8    |     63 |   0.406 |   0.424 |     0.018 |
| 2026-04-01 | dir_16   |     65 |   0.149 |   0.019 |    -0.130 |
| 2026-04-01 | vol_8    |     65 |   0.340 |   0.351 |     0.011 |
| 2026-07-01 | dir_16   |     37 |   0.087 |   0.103 |     0.016 |
| 2026-07-01 | vol_8    |     37 |   0.448 |   0.467 |     0.018 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |   0.047 |   0.060 |     0.013 |  -0.022 |   0.046 |
| trees depth 3 (registered)                        | vol_8    |   0.368 |   0.375 |     0.007 |   0.004 |   0.011 |
| ridge, all features                               | dir_16   |   0.050 |   0.069 |     0.020 |  -0.011 |   0.051 |
| ridge, all features                               | vol_8    |   0.394 |   0.394 |    -0.000 |  -0.003 |   0.003 |
| trees depth 2, 30 iterations                      | dir_16   |   0.035 |   0.028 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.285 |   0.314 |     0.028 |   0.023 |   0.034 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |   0.047 |   0.040 |    -0.007 |  -0.039 |   0.025 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.368 |   0.373 |     0.006 |   0.002 |   0.009 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.