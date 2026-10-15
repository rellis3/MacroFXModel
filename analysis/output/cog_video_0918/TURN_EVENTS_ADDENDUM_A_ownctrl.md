# COG-TURN-EVENTS Addendum A results

Registered in forge/COG_TURN_EVENTS_ADDENDUM_A.md after the debug table was seen (main run unread at the time). Line turns k = 0.75, 2 h horizon.

## Verdict: **explained by Nasdaq own recent volatility / news clustering (or not shown)**
Gates: (1) vol-matched move-share above zero in VAL and OOS: True; (2) survives release exclusion: False; (3) beats placebo 95th (+0.051; placebo mean +0.015, n 200): False; (4) incremental volatility dummy positive |t|>2 VAL and OOS and OOS R2 rises: False. Direction share beyond matched in VAL and OOS: False.

### Move share (favourable + adverse) and direction share (favourable / (favourable + adverse)): event minus volatility-matched controls
| controls                     | half   |    n |   days |   move_event |   move_diff |   ci_lo |   ci_hi |   p_one_sided |   dir_diff |   dir_ci_lo |   dir_ci_hi |   dir_p |
|:-----------------------------|:-------|-----:|-------:|-------------:|------------:|--------:|--------:|--------------:|-----------:|------------:|------------:|--------:|
| vol-matched                  | IS     | 1125 |    233 |        0.397 |       0.033 |  -0.000 |   0.065 |         0.026 |      0.026 |      -0.018 |       0.068 |   0.102 |
| vol-matched                  | VAL    |  914 |    187 |        0.428 |       0.054 |   0.008 |   0.099 |         0.011 |      0.031 |      -0.013 |       0.076 |   0.096 |
| vol-matched                  | OOS    |  970 |    187 |        0.423 |       0.049 |   0.013 |   0.084 |         0.005 |      0.004 |      -0.035 |       0.043 |   0.421 |
| vol-matched                  | ALL    | 3009 |    607 |        0.415 |       0.044 |   0.023 |   0.066 |         0.000 |      0.020 |      -0.005 |       0.044 |   0.058 |
| vol-matched, no release bars | IS     |  957 |    229 |        0.340 |       0.021 |  -0.014 |   0.055 |         0.122 |      0.023 |      -0.031 |       0.079 |   0.196 |
| vol-matched, no release bars | VAL    |  784 |    182 |        0.388 |       0.055 |   0.009 |   0.099 |         0.009 |      0.049 |      -0.009 |       0.105 |   0.046 |
| vol-matched, no release bars | OOS    |  846 |    187 |        0.369 |       0.027 |  -0.014 |   0.064 |         0.088 |     -0.007 |      -0.056 |       0.042 |   0.617 |
| vol-matched, no release bars | ALL    | 2587 |    598 |        0.364 |       0.033 |   0.010 |   0.055 |         0.003 |      0.022 |      -0.012 |       0.053 |   0.089 |

### Incremental volatility test (log |Nasdaq move| over next 2 h on its own trailing range, trailing move, 20-day RMS, hour dummies, plus the line-turn dummy)
| half                      |   coef_s |     t |     n |   days |
|:--------------------------|---------:|------:|------:|-------:|
| IS                        |    0.086 | 2.777 | 18242 |    239 |
| VAL                       |    0.106 | 2.741 | 14916 |    194 |
| OOS                       |    0.046 | 1.383 | 14770 |    195 |
| OOS R2 without s / with s |    0.122 | 0.121 | 14770 |    195 |

OOS R2 row: coef_s column = without the dummy, t column = with the dummy.