# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 524. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +1.18 (k1=0.25 retest(0.3) W=16), its validation+OOS t = -1.15; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 100): mean matched effect on the 2 h signed return +0.0007 (5-95%: -0.0164 to +0.0173); move to favourable share +0.0016; response share +0.0102.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| False                 |         0.0501 |               0.0875 |              0.1764 | False             |            -1.7974 |            -0.4460 | False          |              0.0094 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.041 | -0.963 | 17589 |    239 |
| VAL                       |   -0.063 | -1.797 | 14600 |    195 |
| OOS                       |   -0.018 | -0.446 | 12264 |    164 |
| OOS R2 without s / with s |    0.257 |  0.257 | 12264 |    164 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |               0.001 |                     | False            |               0.005 |                 0.006 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 271 |     81 |       -0.031 |         -0.030 |  -0.061 |   0.000 |         0.974 |
| all       | IS     | ret4     | 271 |     81 |       -0.010 |         -0.009 |  -0.033 |   0.014 |         0.759 |
| all       | IS     | ret16    | 271 |     81 |       -0.038 |        nan     | nan     | nan     |         0.002 |
| all       | IS     | ret32    | 271 |     81 |       -0.051 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 271 |     81 |        0.284 |         -0.011 |  -0.070 |   0.054 |         0.646 |
| all       | IS     | adv16    | 271 |     81 |        0.380 |          0.085 |   0.020 |   0.148 |         0.006 |
| all       | IS     | resp64   | 271 |     81 |        0.528 |         -0.025 |  -0.083 |   0.029 |         0.833 |
| all       | IS     | vol8     | 271 |     81 |       -2.422 |        nan     | nan     | nan     |         0.028 |
| all       | VAL    | ret8     | 550 |    178 |        0.001 |          0.008 |  -0.012 |   0.029 |         0.218 |
| all       | VAL    | ret4     | 550 |    178 |        0.001 |          0.003 |  -0.014 |   0.020 |         0.356 |
| all       | VAL    | ret16    | 550 |    178 |       -0.001 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 550 |    178 |       -0.008 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 550 |    178 |        0.304 |          0.025 |  -0.018 |   0.069 |         0.133 |
| all       | VAL    | adv16    | 550 |    178 |        0.340 |          0.050 |   0.006 |   0.095 |         0.015 |
| all       | VAL    | resp64   | 550 |    178 |        0.551 |          0.018 |  -0.028 |   0.062 |         0.244 |
| all       | VAL    | vol8     | 550 |    178 |       -2.428 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret8     | 501 |    152 |        0.003 |          0.003 |  -0.021 |   0.027 |         0.401 |
| all       | OOS    | ret4     | 501 |    152 |        0.001 |          0.001 |  -0.014 |   0.015 |         0.421 |
| all       | OOS    | ret16    | 501 |    152 |        0.002 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 501 |    152 |        0.002 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 501 |    152 |        0.283 |          0.021 |  -0.019 |   0.061 |         0.181 |
| all       | OOS    | adv16    | 501 |    152 |        0.289 |          0.031 |  -0.009 |   0.072 |         0.060 |
| all       | OOS    | resp64   | 501 |    152 |        0.507 |         -0.003 |  -0.053 |   0.040 |         0.559 |
| all       | OOS    | vol8     | 501 |    152 |       -2.913 |        nan     | nan     | nan     |         0.326 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 271 |     -0.009 |  -0.031 |   0.014 |         0.789 |
| IS     | 1-2 h    | 271 |     -0.020 |  -0.038 |  -0.001 |         0.983 |
| IS     | 2-4 h    | 271 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 271 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 271 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 550 |      0.003 |  -0.014 |   0.020 |         0.338 |
| VAL    | 1-2 h    | 550 |      0.006 |  -0.005 |   0.017 |         0.133 |
| VAL    | 2-4 h    | 550 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 550 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 550 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 501 |      0.001 |  -0.012 |   0.015 |         0.407 |
| OOS    | 1-2 h    | 501 |      0.002 |  -0.010 |   0.015 |         0.407 |
| OOS    | 2-4 h    | 501 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 501 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 501 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.019 | -1.859 | 17646 |    239 |
| VAL                       |   -0.005 | -0.627 | 14645 |    195 |
| OOS                       |    0.008 |  0.945 | 12323 |    164 |
| OOS R2 without s / with s |   -0.006 | -0.009 | 12323 |    164 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|-----:|------------:|----------:|----------:|---------:|---------:|
| VAL     |  550 |      0.0009 |    0.5000 |   -0.0041 |  -0.0237 |   0.0146 |
| VAL     |  550 |      0.0009 |    1.0000 |   -0.0091 |  -0.0287 |   0.0096 |
| VAL     |  550 |      0.0009 |    2.0000 |   -0.0191 |  -0.0387 |  -0.0004 |
| OOS     |  501 |      0.0033 |    0.5000 |   -0.0017 |  -0.0244 |   0.0224 |
| OOS     |  501 |      0.0033 |    1.0000 |   -0.0067 |  -0.0294 |   0.0174 |
| OOS     |  501 |      0.0033 |    2.0000 |   -0.0167 |  -0.0394 |   0.0074 |
| VAL+OOS | 1051 |      0.0020 |    0.5000 |   -0.0030 |  -0.0174 |   0.0113 |
| VAL+OOS | 1051 |      0.0020 |    1.0000 |   -0.0080 |  -0.0224 |   0.0063 |
| VAL+OOS | 1051 |      0.0020 |    2.0000 |   -0.0180 |  -0.0324 |  -0.0037 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                         |   n |   diff |     t |
|:-----------------------------|----:|-------:|------:|
| k1=0.25 retest(0.3) W=8      | 308 |  0.013 | 1.138 |
| k1=0.25 retest(0.3) W=16     | 410 |  0.010 | 1.019 |
| k1=0.5 accelerate(0.5) W=32  | 445 |  0.009 | 0.930 |
| k1=0.5 retest(0.5) W=8       |  84 |  0.016 | 0.806 |
| k1=0.5 accelerate(0.5) W=16  | 427 |  0.006 | 0.657 |
| k1=0.25 retest(0.3) W=32     | 468 |  0.006 | 0.627 |
| k1=0.25 accelerate(0.5) W=32 | 646 |  0.005 | 0.610 |
| k1=0.25 accelerate(0.5) W=8  | 584 |  0.004 | 0.546 |
| k1=0.5 retest(0.5) W=16      | 115 |  0.008 | 0.477 |
| k1=0.25 accelerate(0.5) W=16 | 616 |  0.003 | 0.357 |
| k1=0.5 retest(0.3) W=16      | 222 |  0.004 | 0.276 |
| k1=0.5 retest(0.5) W=32      | 161 |  0.004 | 0.239 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     1824 |     1800 |
| k1=0.25 continue(0.5) W=16   |     2258 |     2229 |
| k1=0.25 continue(0.5) W=32   |     2587 |     2557 |
| k1=0.25 continue(1.0) W=8    |      646 |      639 |
| k1=0.25 continue(1.0) W=16   |     1042 |     1029 |
| k1=0.25 continue(1.0) W=32   |     1420 |     1403 |
| k1=0.25 retest(0.3) W=8      |     1482 |     1464 |
| k1=0.25 retest(0.3) W=16     |     2029 |     2009 |
| k1=0.25 retest(0.3) W=32     |     2368 |     2345 |
| k1=0.25 retest(0.5) W=8      |      936 |      926 |
| k1=0.25 retest(0.5) W=16     |     1351 |     1339 |
| k1=0.25 retest(0.5) W=32     |     1645 |     1631 |
| k1=0.25 accelerate(0.5) W=8  |     3284 |     3252 |
| k1=0.25 accelerate(0.5) W=16 |     3475 |     3442 |
| k1=0.25 accelerate(0.5) W=32 |     3632 |     3599 |
| k1=0.25 accelerate(1.0) W=8  |     1076 |     1068 |
| k1=0.25 accelerate(1.0) W=16 |     1249 |     1241 |
| k1=0.25 accelerate(1.0) W=32 |     1425 |     1417 |
| k1=0.5 continue(0.5) W=8     |     1041 |     1024 |
| k1=0.5 continue(0.5) W=16    |     1344 |     1322 |
| k1=0.5 continue(0.5) W=32    |     1590 |     1567 |
| k1=0.5 continue(1.0) W=8     |      391 |      389 |
| k1=0.5 continue(1.0) W=16    |      631 |      626 |
| k1=0.5 continue(1.0) W=32    |      888 |      882 |
| k1=0.5 retest(0.3) W=8       |      757 |      751 |
| k1=0.5 retest(0.3) W=16      |     1116 |     1108 |
| k1=0.5 retest(0.3) W=32      |     1395 |     1383 |
| k1=0.5 retest(0.5) W=8       |      441 |      437 |
| k1=0.5 retest(0.5) W=16      |      685 |      680 |
| k1=0.5 retest(0.5) W=32      |      900 |      893 |
| k1=0.5 accelerate(0.5) W=8   |     2383 |     2360 |
| k1=0.5 accelerate(0.5) W=16  |     2477 |     2454 |
| k1=0.5 accelerate(0.5) W=32  |     2587 |     2564 |
| k1=0.5 accelerate(1.0) W=8   |      867 |      859 |
| k1=0.5 accelerate(1.0) W=16  |      980 |      972 |
| k1=0.5 accelerate(1.0) W=32  |     1105 |     1097 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0012% inside the 32 bars after any confirmed sequence (n = 13,679) versus +0.0213% outside; difference -0.0201% (95% day-block CI -0.0449 to +0.0023). Mean |M1 - M0| inside 0.0184 versus outside 0.0086. Correlation of (M1 - M0) with the primary sequence signal: +0.062.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared +0.015. Rules:
```
|--- L_var <= -0.33
|   |--- L_pos256 <= 0.59
|   |   |--- L_legratio <= 1.35
|   |   |   |--- value: [0.00]
|   |   |--- L_legratio >  1.35
|   |   |   |--- value: [0.01]
|   |--- L_pos256 >  0.59
|   |   |--- value: [0.02]
|--- L_var >  -0.33
|   |--- D_32 <= -1.29
|   |   |--- L_pos64 <= 0.29
|   |   |   |--- value: [-0.02]
|   |   |--- L_pos64 >  0.29
|   |   |   |--- value: [-0.01]
|   |--- D_32 >  -1.29
|   |   |--- L_mom128 <= 2.88
|   |   |   |--- value: [-0.00]
|   |   |--- L_mom128 >  2.88
|   |   |   |--- value: [0.02]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     65 |  -0.022 |  -0.026 |    -0.004 |
| 2025-04-01 | vol_8    |     65 |   0.102 |   0.122 |     0.021 |
| 2025-07-01 | dir_16   |     66 |   0.019 |   0.021 |     0.002 |
| 2025-07-01 | vol_8    |     66 |   0.163 |   0.167 |     0.004 |
| 2025-10-01 | dir_16   |     65 |   0.074 |   0.082 |     0.009 |
| 2025-10-01 | vol_8    |     65 |   0.150 |   0.154 |     0.003 |
| 2026-01-01 | dir_16   |     63 |  -0.105 |  -0.057 |     0.048 |
| 2026-01-01 | vol_8    |     63 |   0.141 |   0.155 |     0.014 |
| 2026-04-01 | dir_16   |     65 |  -0.087 |  -0.023 |     0.064 |
| 2026-04-01 | vol_8    |     65 |   0.196 |   0.205 |     0.009 |
| 2026-07-01 | dir_16   |     37 |   0.073 |   0.023 |    -0.050 |
| 2026-07-01 | vol_8    |     37 |   0.144 |   0.150 |     0.006 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.014 |   0.002 |     0.016 |  -0.012 |   0.044 |
| trees depth 3 (registered)                        | vol_8    |   0.171 |   0.181 |     0.010 |   0.005 |   0.015 |
| ridge, all features                               | dir_16   |  -0.047 |  -0.006 |     0.041 |   0.013 |   0.070 |
| ridge, all features                               | vol_8    |   0.205 |   0.198 |    -0.006 |  -0.011 |  -0.002 |
| trees depth 2, 30 iterations                      | dir_16   |  -0.074 |  -0.098 |    -0.024 |  -0.047 |  -0.001 |
| trees depth 2, 30 iterations                      | vol_8    |   0.079 |   0.080 |     0.001 |  -0.001 |   0.003 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.014 |   0.008 |     0.022 |   0.001 |   0.043 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.171 |   0.173 |     0.002 |  -0.001 |   0.006 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
_none_

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.