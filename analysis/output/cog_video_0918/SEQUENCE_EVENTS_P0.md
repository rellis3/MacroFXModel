# COG-SEQUENCE-EVENTS results

Run once per forge/COG_SEQUENCE_EVENTS_PREREG.md. Sequence = direction change (occurrence time), trigger, confirmation (the only time a signal exists), then Nasdaq. Chronological: in-sample 2024-04-15 to 2025-03-31 (selection), validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-10-09. Video week excluded from every pooled statistic.

## Verdict (registered rule, interpretable events): **no repeatable sequence (direction / turn / response)**

- Specs in the grid: 36; in-sample FDR cells passing: 0 of 572. Frozen for evaluation: ['k1=0.5 continue(0.5) W=16'].
- Selection-aware placebo (best of 36 specs in-sample, then scored on validation + out-of-sample): real in-sample best t = +0.56 (k1=0.5 retest(0.3) W=16), its validation+OOS t = -0.56; placebo (n = 0): in-sample best-of-36 t averages +nan (95th pct +nan), and their validation+OOS t averages +nan (95th pct +nan). Share of placebo picks scoring at least as well as the real pick out of sample: nan.
- Plain placebo, primary spec (n = 200): mean matched effect on the 2 h signed return -0.0013 (5-95%: -0.0336 to +0.0375); move to favourable share +0.0055; response share -0.0035.

## Volatility verdict (separate, same gates against its own matched baseline): **volatility effect not validated**

| matched_VAL_and_OOS   |   real_val_oos |   plain_placebo_mean |   plain_placebo_p95 | beats_placebo95   |   regression_t_VAL |   regression_t_OOS | oos_R2_rises   |   no_release_effect | passes   |
|:----------------------|---------------:|---------------------:|--------------------:|:------------------|-------------------:|-------------------:|:---------------|--------------------:|:---------|
| True                  |         0.1407 |              -0.0067 |              0.0823 | True              |            -0.7663 |            -1.2882 | True           |              0.1189 | False    |

Volatility regression (log |next 2 h move| on Nasdaq-only features plus the sequence signal):

| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |    0.001 |  0.032 | 14793 |    217 |
| VAL                       |   -0.029 | -0.766 | 12238 |    182 |
| OOS                       |   -0.047 | -1.288 | 12018 |    178 |
| OOS R2 without s / with s |    0.137 |  0.137 | 12018 |    178 |

### Gates for each frozen spec
| spec                      | ret_ok   | race_ok   | beats_plain_placebo95   |   placebo_mean_ret8 | selection_aware_p   | incremental_ok   |   no_release_effect |   real_val_oos_effect | passes   |
|:--------------------------|:---------|:----------|:------------------------|--------------------:|:--------------------|:-----------------|--------------------:|----------------------:|:---------|
| k1=0.5 continue(0.5) W=16 | False    | False     | False                   |              -0.001 |                     | False            |               0.004 |                -0.005 | False    |

### The primary spec: matched effects by context, half and metric (matched_diff = event minus Nasdaq-only matched bars; ret in %, share metrics in probability units; vol8 = log |next 2 h move|)
| context   | half   | metric   |   n |   days |   event_mean |   matched_diff |   ci_lo |   ci_hi |   p_one_sided |
|:----------|:-------|:---------|----:|-------:|-------------:|---------------:|--------:|--------:|--------------:|
| all       | IS     | ret8     | 786 |    224 |       -0.035 |         -0.034 |  -0.071 |   0.004 |         0.960 |
| all       | IS     | ret4     | 786 |    224 |       -0.011 |        nan     | nan     | nan     |         0.119 |
| all       | IS     | ret16    | 786 |    224 |       -0.033 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | ret32    | 786 |    224 |       -0.032 |        nan     | nan     | nan     |         0.000 |
| all       | IS     | fav16    | 786 |    224 |        0.319 |          0.002 |  -0.034 |   0.038 |         0.457 |
| all       | IS     | adv16    | 786 |    224 |        0.374 |          0.055 |   0.019 |   0.092 |         0.000 |
| all       | IS     | resp64   | 786 |    224 |        0.550 |         -0.018 |  -0.061 |   0.021 |         0.809 |
| all       | IS     | vol8     | 786 |    224 |       -1.709 |          0.113 |   0.023 |   0.203 |         0.003 |
| all       | VAL    | ret8     | 502 |    166 |       -0.007 |         -0.003 |  -0.067 |   0.062 |         0.527 |
| all       | VAL    | ret4     | 502 |    166 |       -0.003 |         -0.004 |  -0.055 |   0.043 |         0.536 |
| all       | VAL    | ret16    | 502 |    166 |       -0.086 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | ret32    | 502 |    166 |       -0.097 |        nan     | nan     | nan     |         0.000 |
| all       | VAL    | fav16    | 502 |    166 |        0.367 |          0.043 |  -0.002 |   0.088 |         0.030 |
| all       | VAL    | adv16    | 502 |    166 |        0.353 |          0.030 |  -0.014 |   0.072 |         0.101 |
| all       | VAL    | resp64   | 502 |    166 |        0.598 |          0.029 |  -0.018 |   0.075 |         0.118 |
| all       | VAL    | vol8     | 502 |    166 |       -1.586 |          0.168 |   0.009 |   0.306 |         0.023 |
| all       | OOS    | ret8     | 547 |    180 |       -0.000 |         -0.006 |  -0.052 |   0.039 |         0.612 |
| all       | OOS    | ret4     | 547 |    180 |        0.012 |        nan     | nan     | nan     |         0.082 |
| all       | OOS    | ret16    | 547 |    180 |       -0.002 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | ret32    | 547 |    180 |        0.003 |        nan     | nan     | nan     |         0.000 |
| all       | OOS    | fav16    | 547 |    180 |        0.369 |          0.029 |  -0.009 |   0.067 |         0.063 |
| all       | OOS    | adv16    | 547 |    180 |        0.342 |          0.024 |  -0.017 |   0.067 |         0.146 |
| all       | OOS    | resp64   | 547 |    180 |        0.578 |         -0.021 |  -0.067 |   0.025 |         0.840 |
| all       | OOS    | vol8     | 547 |    180 |       -1.606 |          0.116 |   0.005 |   0.212 |         0.020 |

### Lag profile of the primary spec: Nasdaq signed return minus matched, by window after confirmation
| half   | bucket   |   n |   diff_pct |   ci_lo |   ci_hi |   p_one_sided |
|:-------|:---------|----:|-----------:|--------:|--------:|--------------:|
| IS     | 0-1 h    | 786 |    nan     | nan     | nan     |         0.104 |
| IS     | 1-2 h    | 786 |    nan     | nan     | nan     |         0.131 |
| IS     | 2-4 h    | 786 |    nan     | nan     | nan     |         0.000 |
| IS     | 4-8 h    | 786 |    nan     | nan     | nan     |         0.000 |
| IS     | 8-16 h   | 786 |    nan     | nan     | nan     |         0.000 |
| VAL    | 0-1 h    | 502 |     -0.004 |  -0.056 |   0.042 |         0.542 |
| VAL    | 1-2 h    | 502 |      0.001 |  -0.045 |   0.044 |         0.481 |
| VAL    | 2-4 h    | 502 |    nan     | nan     | nan     |         0.000 |
| VAL    | 4-8 h    | 502 |    nan     | nan     | nan     |         0.000 |
| VAL    | 8-16 h   | 502 |    nan     | nan     | nan     |         0.000 |
| OOS    | 0-1 h    | 547 |    nan     | nan     | nan     |         0.096 |
| OOS    | 1-2 h    | 547 |    nan     | nan     | nan     |         0.296 |
| OOS    | 2-4 h    | 547 |    nan     | nan     | nan     |         0.000 |
| OOS    | 4-8 h    | 547 |    nan     | nan     | nan     |         0.000 |
| OOS    | 8-16 h   | 547 |    nan     | nan     | nan     |         0.000 |

### Nasdaq-only regression with the sequence signal (primary spec, 8 bars from confirmation)
| half                      |   coef_s |    t_s |     n |   days |
|:--------------------------|---------:|-------:|------:|-------:|
| IS                        |   -0.019 | -1.115 | 15177 |    234 |
| VAL                       |   -0.026 | -0.909 | 12563 |    191 |
| OOS                       |   -0.005 | -0.225 | 12447 |    190 |
| OOS R2 without s / with s |   -0.016 | -0.016 | 12447 |    190 |

The last row: out-of-sample R-squared without (coef_s column) and with (t_s column) the signal.

### Economic check, primary spec, 2 h signed return per event net of round-trip cost
| half    |    n |   gross_pct |   cost_bp |   net_pct |   net_lo |   net_hi |
|:--------|-----:|------------:|----------:|----------:|---------:|---------:|
| VAL     |  502 |     -0.0072 |    0.5000 |   -0.0122 |  -0.0730 |   0.0534 |
| VAL     |  502 |     -0.0072 |    1.0000 |   -0.0172 |  -0.0780 |   0.0484 |
| VAL     |  502 |     -0.0072 |    2.0000 |   -0.0272 |  -0.0880 |   0.0384 |
| OOS     |  547 |     -0.0001 |    0.5000 |   -0.0051 |  -0.0493 |   0.0373 |
| OOS     |  547 |     -0.0001 |    1.0000 |   -0.0101 |  -0.0543 |   0.0323 |
| OOS     |  547 |     -0.0001 |    2.0000 |   -0.0201 |  -0.0643 |   0.0223 |
| VAL+OOS | 1049 |     -0.0035 |    0.5000 |   -0.0085 |  -0.0457 |   0.0284 |
| VAL+OOS | 1049 |     -0.0035 |    1.0000 |   -0.0135 |  -0.0507 |   0.0234 |
| VAL+OOS | 1049 |     -0.0035 |    2.0000 |   -0.0235 |  -0.0607 |   0.0134 |

### In-sample grid (all contexts, H = 8): top 12 by t
| spec                        |    n |   diff |      t |
|:----------------------------|-----:|-------:|-------:|
| k1=0.5 retest(0.5) W=16     |  350 |  0.022 |  0.870 |
| k1=0.5 retest(0.3) W=8      |  446 |  0.015 |  0.750 |
| k1=0.5 retest(0.3) W=16     |  624 |  0.010 |  0.532 |
| k1=0.5 retest(0.5) W=32     |  465 |  0.011 |  0.531 |
| k1=0.5 retest(0.3) W=32     |  757 |  0.005 |  0.319 |
| k1=0.5 accelerate(0.5) W=32 | 1418 |  0.002 |  0.246 |
| k1=0.25 retest(0.3) W=32    | 1134 |  0.002 |  0.162 |
| k1=0.5 accelerate(0.5) W=16 | 1370 | -0.001 | -0.102 |
| k1=0.25 retest(0.3) W=16    |  955 | -0.002 | -0.120 |
| k1=0.25 retest(0.5) W=16    |  587 | -0.003 | -0.144 |
| k1=0.5 accelerate(0.5) W=8  | 1331 | -0.002 | -0.241 |
| k1=0.5 retest(0.5) W=8      |  234 | -0.011 | -0.376 |

### Events per spec
| spec                         |   events |   scored |
|:-----------------------------|---------:|---------:|
| k1=0.25 continue(0.5) W=8    |     2731 |     2618 |
| k1=0.25 continue(0.5) W=16   |     3302 |     3144 |
| k1=0.25 continue(0.5) W=32   |     3730 |     3557 |
| k1=0.25 continue(1.0) W=8    |      985 |      954 |
| k1=0.25 continue(1.0) W=16   |     1535 |     1473 |
| k1=0.25 continue(1.0) W=32   |     2025 |     1935 |
| k1=0.25 retest(0.3) W=8      |     1551 |     1476 |
| k1=0.25 retest(0.3) W=16     |     2261 |     2152 |
| k1=0.25 retest(0.3) W=32     |     2773 |     2642 |
| k1=0.25 retest(0.5) W=8      |      940 |      886 |
| k1=0.25 retest(0.5) W=16     |     1415 |     1338 |
| k1=0.25 retest(0.5) W=32     |     1846 |     1753 |
| k1=0.25 accelerate(0.5) W=8  |     4915 |     4674 |
| k1=0.25 accelerate(0.5) W=16 |     5117 |     4865 |
| k1=0.25 accelerate(0.5) W=32 |     5330 |     5076 |
| k1=0.25 accelerate(1.0) W=8  |     1592 |     1533 |
| k1=0.25 accelerate(1.0) W=16 |     1826 |     1751 |
| k1=0.25 accelerate(1.0) W=32 |     2045 |     1960 |
| k1=0.5 continue(0.5) W=8     |     1518 |     1461 |
| k1=0.5 continue(0.5) W=16    |     1916 |     1835 |
| k1=0.5 continue(0.5) W=32    |     2248 |     2151 |
| k1=0.5 continue(1.0) W=8     |      572 |      557 |
| k1=0.5 continue(1.0) W=16    |      925 |      896 |
| k1=0.5 continue(1.0) W=32    |     1252 |     1205 |
| k1=0.5 retest(0.3) W=8       |     1019 |      969 |
| k1=0.5 retest(0.3) W=16      |     1488 |     1412 |
| k1=0.5 retest(0.3) W=32      |     1861 |     1767 |
| k1=0.5 retest(0.5) W=8       |      552 |      524 |
| k1=0.5 retest(0.5) W=16      |      868 |      825 |
| k1=0.5 retest(0.5) W=32      |     1175 |     1117 |
| k1=0.5 accelerate(0.5) W=8   |     3511 |     3334 |
| k1=0.5 accelerate(0.5) W=16  |     3625 |     3443 |
| k1=0.5 accelerate(0.5) W=32  |     3763 |     3579 |
| k1=0.5 accelerate(1.0) W=8   |     1208 |     1165 |
| k1=0.5 accelerate(1.0) W=16  |     1376 |     1322 |
| k1=0.5 accelerate(1.0) W=32  |     1533 |     1472 |

## The flexible model beside the events (COG-SHAPE-AGNOSTIC predictions, re-run with identical code)

- **C1, where the model's edge sits (4 h direction, out of sample):** mean sign(M1 - M0) x forward return = +0.0040% inside the 32 bars after any confirmed sequence (n = 14,148) versus +0.0422% outside; difference -0.0382% (95% day-block CI -0.0887 to +0.0145). Mean |M1 - M0| inside 0.0406 versus outside 0.0161. Correlation of (M1 - M0) with the primary sequence signal: +0.025.
- **C2, surrogate tree** (depth 3, fitted on validation (M1 - M0), scored on out-of-sample): fidelity R-squared +0.005. Rules:
```
|--- L_bhi128 <= 0.85
|   |--- L_pos256 <= 0.21
|   |   |--- L_curv64 <= -0.53
|   |   |   |--- value: [0.01]
|   |   |--- L_curv64 >  -0.53
|   |   |   |--- value: [-0.04]
|   |--- L_pos256 >  0.21
|   |   |--- L_mom8 <= -0.82
|   |   |   |--- value: [0.04]
|   |   |--- L_mom8 >  -0.82
|   |   |   |--- value: [0.00]
|--- L_bhi128 >  0.85
|   |--- L_pos256 <= 0.24
|   |   |--- value: [-0.07]
|   |--- L_pos256 >  0.24
|   |   |--- L_mom32 <= 0.37
|   |   |   |--- value: [-0.03]
|   |   |--- L_mom32 >  0.37
|   |   |   |--- value: [-0.01]

```
- **C3, stability by quarter**
| quarter    | target   |   days |   IC_M0 |   IC_M1 |   IC_gain |
|:-----------|:---------|-------:|--------:|--------:|----------:|
| 2025-04-01 | dir_16   |     64 |  -0.062 |  -0.005 |     0.057 |
| 2025-04-01 | vol_8    |     64 |   0.247 |   0.260 |     0.013 |
| 2025-07-01 | dir_16   |     66 |  -0.045 |   0.071 |     0.116 |
| 2025-07-01 | vol_8    |     66 |   0.257 |   0.280 |     0.023 |
| 2025-10-01 | dir_16   |     64 |   0.033 |   0.005 |    -0.028 |
| 2025-10-01 | vol_8    |     64 |   0.307 |   0.302 |    -0.005 |
| 2026-01-01 | dir_16   |     63 |  -0.006 |   0.046 |     0.052 |
| 2026-01-01 | vol_8    |     63 |   0.199 |   0.231 |     0.031 |
| 2026-04-01 | dir_16   |     65 |  -0.002 |   0.053 |     0.055 |
| 2026-04-01 | vol_8    |     65 |   0.171 |   0.165 |    -0.006 |
| 2026-07-01 | dir_16   |     66 |  -0.037 |   0.070 |     0.107 |
| 2026-07-01 | vol_8    |     66 |   0.182 |   0.171 |    -0.011 |

- **C4, complexity ablation** (reporting only; nothing selected from it)
| model                                             | target   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |
|:--------------------------------------------------|:---------|--------:|--------:|----------:|--------:|--------:|
| trees depth 3 (registered)                        | dir_16   |  -0.020 |   0.040 |     0.060 |   0.026 |   0.092 |
| trees depth 3 (registered)                        | vol_8    |   0.262 |   0.272 |     0.010 |   0.004 |   0.015 |
| ridge, all features                               | dir_16   |  -0.040 |  -0.005 |     0.035 |   0.012 |   0.058 |
| ridge, all features                               | vol_8    |   0.290 |   0.290 |    -0.000 |  -0.003 |   0.002 |
| trees depth 2, 30 iterations                      | dir_16   |   0.015 |   0.042 |   nan     | nan     | nan     |
| trees depth 2, 30 iterations                      | vol_8    |   0.169 |   0.215 |     0.045 |   0.037 |   0.054 |
| trees depth 3, only zig-zag/confluence + momentum | dir_16   |  -0.020 |   0.035 |     0.055 |   0.028 |   0.084 |
| trees depth 3, only zig-zag/confluence + momentum | vol_8    |   0.262 |   0.273 |     0.011 |   0.006 |   0.016 |

## The video week, every primary-spec sequence (descriptive, not used in any statistic)
| direction_change   | trigger          | confirmed        |   d |   minutes_to_confirm |   nasdaq_state |   ret_1h |   ret_2h |   ret_4h | nasdaq_responded_within_16h   |   minutes_to_response | result_4h_race   |
|:-------------------|:-----------------|:-----------------|----:|---------------------:|---------------:|---------:|---------:|---------:|:------------------------------|----------------------:|:-----------------|
| 2026-09-16 18:00   | 2026-09-16 18:30 | 2026-09-16 19:15 |  -1 |                   75 |             -1 |   -0.448 |  nan     |   -0.755 | False                         |               nan     | adverse          |
| 2026-09-17 10:30   | 2026-09-17 11:15 | 2026-09-17 13:00 |   1 |                  150 |              1 |   -0.279 |   -0.239 |    0.024 | False                         |               nan     | adverse          |
| 2026-09-17 13:30   | 2026-09-17 16:30 | 2026-09-17 18:30 |  -1 |                  300 |              1 |   -0.056 |    0.051 |    0.102 | False                         |               nan     | neither          |
| 2026-09-18 11:00   | 2026-09-18 11:30 | 2026-09-18 14:30 |  -1 |                  210 |             -1 |   -0.029 |    0.064 |   -0.164 | False                         |               nan     | neither          |
| 2026-09-22 06:15   | 2026-09-22 08:45 | 2026-09-22 10:00 |   1 |                  225 |              1 |   -0.051 |   -0.170 |    0.305 | True                          |               240.000 | favourable       |
| 2026-09-22 11:45   | 2026-09-22 14:00 | 2026-09-22 15:45 |  -1 |                  240 |              1 |   -0.036 |   -0.157 |   -0.433 | False                         |               nan     | adverse          |
| 2026-09-23 04:15   | 2026-09-23 06:15 | 2026-09-23 07:30 |  -1 |                  195 |              1 |    0.031 |    0.067 |    0.355 | True                          |               240.000 | favourable       |

## Figures
`sequence_events_lag.png` (lag profile), `sequence_events_video_week.png`.

## Limits (stated, not hidden)
- Only the pinned pair has deep history: contract-month robustness is untestable until the Dec-2026 roll.
- No untouched sample exists for the combined line; the forward record from 2026-10-15 is the untouched test.
- Stage-2 types are a fixed family chosen before data; other confirmations are possible and untested.
- MFE/MAE style outcomes use 15-minute closes; costs are assumptions.