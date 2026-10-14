# COG-VIDEO-CLAIMS results

Run once per forge/COG_VIDEO_CLAIMS_PREREG.md. Line = identified formula; explore to Jul 17, confirm from Jul 20.

## Power (planted lead into explore, F1 direction; detected = any cell |t| >= 2.5)

| planted rho | max abs t | detected |
|---|---|---|
| 0.03 | 2.99 | yes |
| 0.05 | 3.88 | yes |
| 0.08 | 4.79 | yes |
| 0.12 | 5.49 | yes |

## F1 continuous lead

**Direction** (line change over W vs Nasdaq return over H): 0 of 24 cells pass FDR 10% in explore; confirmed 0.

explore correlation (rows W, cols H):

| W   |   15m |   30m |     1h |     2h |    4h |    8h |    24h |    48h |
|:----|------:|------:|-------:|-------:|------:|------:|-------:|-------:|
| 15m | 0.01  | 0.017 |  0.004 |  0.01  | 0.015 | 0.016 |  0.008 | -0.027 |
| 1h  | 0.002 | 0.004 |  0.004 | -0.003 | 0.013 | 0.018 |  0.014 | -0.057 |
| 4h  | 0.008 | 0.009 | -0.001 | -0.013 | 0.008 | 0.028 | -0.021 | -0.146 |

confirm correlation:

| W   |   15m |   30m |    1h |    2h |    4h |    8h |   24h |    48h |
|:----|------:|------:|------:|------:|------:|------:|------:|-------:|
| 15m | 0.038 | 0.023 | 0.029 | 0.063 | 0.062 | 0.058 | 0.038 | -0.01  |
| 1h  | 0.025 | 0.034 | 0.073 | 0.104 | 0.105 | 0.095 | 0.05  | -0.028 |
| 4h  | 0.073 | 0.099 | 0.13  | 0.12  | 0.116 | 0.144 | 0.093 | -0.044 |

confirm t:

| W   |   15m |   30m |   1h |   2h |   4h |   8h |   24h |   48h |
|:----|------:|------:|-----:|-----:|-----:|-----:|------:|------:|
| 15m |  1.79 |  1.07 | 1.19 | 1.29 | 1.74 | 1.67 |  1.62 | -0.37 |
| 1h  |  1.06 |  0.91 | 0.99 | 1.25 | 1.39 | 1.52 |  1.27 | -0.62 |
| 4h  |  1.5  |  1.44 | 1.43 | 1.47 | 1.29 | 1.52 |  1.23 | -0.51 |

**Volatility** (|line change| vs log forward realised vol): 0 of 21 pass FDR in explore; confirmed 0.

explore correlation:

| W   |   30m |    1h |    2h |     4h |     8h |    24h |    48h |
|:----|------:|------:|------:|-------:|-------:|-------:|-------:|
| 15m | 0.038 | 0.051 | 0.067 |  0.031 |  0.036 | -0.002 | -0.051 |
| 1h  | 0.036 | 0.062 | 0.056 |  0.008 |  0.012 | -0.048 | -0.101 |
| 4h  | 0.037 | 0.052 | 0.032 | -0.008 | -0.002 | -0.038 | -0.151 |

confirm correlation:

| W   |   30m |    1h |    2h |    4h |    8h |   24h |   48h |
|:----|------:|------:|------:|------:|------:|------:|------:|
| 15m | 0.057 | 0.087 | 0.101 | 0.056 | 0.064 | 0.038 | 0.039 |
| 1h  | 0.112 | 0.151 | 0.145 | 0.079 | 0.107 | 0.059 | 0.068 |
| 4h  | 0.086 | 0.128 | 0.114 | 0.037 | 0.125 | 0.078 | 0.022 |

IC (rank correlation), explore max |rho| 0.128, confirm max |rho| 0.124.

same-window link (line change over W vs Nasdaq return over the SAME W): W=15m: explore rho +0.175 (t +4.2), confirm +0.167 (t +4.9); W=1h: explore rho +0.202 (t +3.6), confirm +0.182 (t +4.0); W=4h: explore rho +0.228 (t +3.4), confirm +0.164 (t +2.4)

## F2 his Friday event: swing in the line, confirmed 45 min later, then Nasdaq

**Direction** (mean signed return after the event; t vs hour-matched random bars): 1 of 18 pass FDR in explore; confirmed 0.

explore mean return (%) / t / n:

|   K | 1h                  | 2h                 | 4h                | 8h                  | 24h               | 48h               |
|----:|:--------------------|:-------------------|:------------------|:--------------------|:------------------|:------------------|
|  16 | -0.007 / -0.5 / 366 | 0.002 / -0.0 / 348 | 0.01 / 0.3 / 332  | -0.054 / -1.3 / 308 | 0.004 / 0.0 / 294 | 0.166 / 1.1 / 213 |
|  32 | 0.001 / -0.1 / 203  | 0.004 / 0.2 / 192  | 0.015 / 0.2 / 178 | -0.066 / -1.0 / 162 | 0.063 / 0.6 / 165 | 0.486 / 2.8 / 120 |
|  96 | nan                 | nan                | nan               | nan                 | nan               | nan               |

confirm mean return (%) / t / n:

|   K | 1h                 | 2h                  | 4h                 | 8h                  | 24h                 | 48h                 |
|----:|:-------------------|:--------------------|:-------------------|:--------------------|:--------------------|:--------------------|
|  16 | 0.001 / 0.1 / 288  | -0.001 / 0.0 / 275  | 0.019 / 0.7 / 257  | -0.015 / -0.3 / 249 | -0.044 / -0.5 / 229 | -0.011 / -0.1 / 169 |
|  32 | -0.001 / 0.1 / 164 | -0.001 / -0.0 / 153 | -0.001 / 0.1 / 146 | -0.093 / -1.5 / 138 | -0.116 / -1.1 / 125 | 0.098 / 0.7 / 89    |
|  96 | nan                | nan                 | nan                | nan                 | nan                 | nan                 |

**Volatility** (mean |return| after the event vs matched bars): 0 of 18 pass FDR in explore; confirmed 0.

## F3 his Monday event: line moves, Nasdaq does not (divergence)

0 of 18 pass FDR in explore; confirmed 0.

explore correlation (rows L, cols H):

| W   |    1h |    2h |    4h |    8h |    24h |    48h |
|:----|------:|------:|------:|------:|-------:|-------:|
| 12h | 0.007 | 0.025 | 0.053 | 0.06  | -0.004 |  0.053 |
| 4h  | 0.02  | 0.033 | 0.067 | 0.115 |  0.037 | -0.015 |
| 8h  | 0.025 | 0.039 | 0.056 | 0.095 |  0.026 | -0.01  |

confirm correlation:

| W   |    1h |    2h |    4h |    8h |    24h |    48h |
|:----|------:|------:|------:|------:|-------:|-------:|
| 12h | 0.079 | 0.08  | 0.104 | 0.098 | -0.037 | -0.029 |
| 4h  | 0.107 | 0.089 | 0.083 | 0.131 |  0.062 | -0.032 |
| 8h  | 0.085 | 0.096 | 0.13  | 0.125 |  0.061 | -0.025 |

## Case studies from the video (descriptive)

Friday 18 Sep (UTC): line low at **15:00** (his "key low" 15:00 UTC, confirmation 15:45 UTC); confirmation 45 min after the low = **15:45**; Nasdaq futures low that afternoon at **16:00** (his "priced in" ~16:15 UTC). Line low to Nasdaq low: **60 min**.
Monday 21 Sep 01:15 → 13:15 UTC: line 7.99 → 8.52 (+0.52 units = +5.2 bp spread widening); Nasdaq +0.39%; Nasdaq 13:15 → 16:00: +1.24%.

## Summary

| family | cells | pass FDR (explore) | confirmed |
|---|---|---|---|
| F1_direction | 24 | 0 | 0 |
| F1_volatility | 21 | 0 | 0 |
| F2_direction | 18 | 1 | 0 |
| F2_volatility | 18 | 0 | 0 |
| F3 | 18 | 0 | 0 |