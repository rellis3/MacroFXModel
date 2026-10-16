# COG-CROSS-ASSET Addendum B results: scheduled-news control for the 2 h volatility finding

Registered in forge/COG_CROSS_ASSET_ADDENDUM_B.md after the stage-2 results were read; it can only demote a finding. Gain = IC(with line) - IC(without), day-level Spearman, 95% day-block CI.

## Verdict per candidate (survives only if V2 AND V3 have CI above zero in BOTH halves)

| candidate   | survives_scheduled_news_control   | classification                                                              |
|:------------|:----------------------------------|:----------------------------------------------------------------------------|
| eurusd_L_US | False                             | explained by scheduled-news timing (not shown to add information beyond it) |
| eurusd_P0   | False                             | explained by scheduled-news timing (not shown to add information beyond it) |
| eurusd_P3   | False                             | explained by scheduled-news timing (not shown to add information beyond it) |
| spx500_L_US | False                             | explained by scheduled-news timing (not shown to add information beyond it) |
| us2000_P3   | False                             | explained by scheduled-news timing (not shown to add information beyond it) |
| us30_L_US   | False                             | explained by scheduled-news timing (not shown to add information beyond it) |
| us30_P0     | False                             | explained by scheduled-news timing (not shown to add information beyond it) |
| usdjpy_P3   | False                             | explained by scheduled-news timing (not shown to add information beyond it) |

## IC gains

| candidate   | variant                                     | half   |   days |   IC_base |   IC_with_line |   IC_gain |   ci_lo |   ci_hi |
|:------------|:--------------------------------------------|:-------|-------:|----------:|---------------:|----------:|--------:|--------:|
| eurusd_L_US | V1 replicate (registered models)            | VAL    |    196 |    0.2493 |         0.2571 |    0.0077 |  0.0027 |  0.0129 |
| eurusd_L_US | V1 replicate (registered models)            | OOS    |    165 |    0.2622 |         0.2678 |    0.0056 |  0.0013 |  0.0099 |
| eurusd_L_US | V2 news-calendar baseline                   | VAL    |    196 |    0.2978 |         0.3028 |    0.0050 |  0.0005 |  0.0092 |
| eurusd_L_US | V2 news-calendar baseline                   | OOS    |    165 |    0.3050 |         0.3045 |   -0.0005 | -0.0041 |  0.0031 |
| eurusd_L_US | V3 quiet of scheduled news (V1 predictions) | VAL    |    196 |    0.1848 |         0.1922 |    0.0074 |  0.0010 |  0.0132 |
| eurusd_L_US | V3 quiet of scheduled news (V1 predictions) | OOS    |    165 |    0.2026 |         0.2091 |    0.0065 |  0.0017 |  0.0120 |
| eurusd_P0   | V1 replicate (registered models)            | VAL    |    196 |    0.2493 |         0.2707 |    0.0214 |  0.0134 |  0.0301 |
| eurusd_P0   | V1 replicate (registered models)            | OOS    |    165 |    0.2622 |         0.2797 |    0.0175 |  0.0086 |  0.0265 |
| eurusd_P0   | V2 news-calendar baseline                   | VAL    |    196 |    0.2978 |         0.2971 |   -0.0007 | -0.0053 |  0.0037 |
| eurusd_P0   | V2 news-calendar baseline                   | OOS    |    165 |    0.3050 |         0.3053 |    0.0003 | -0.0029 |  0.0035 |
| eurusd_P0   | V3 quiet of scheduled news (V1 predictions) | VAL    |    196 |    0.1848 |         0.2085 |    0.0237 |  0.0127 |  0.0352 |
| eurusd_P0   | V3 quiet of scheduled news (V1 predictions) | OOS    |    165 |    0.2026 |         0.2228 |    0.0202 |  0.0074 |  0.0329 |
| eurusd_P3   | V1 replicate (registered models)            | VAL    |    196 |    0.2493 |         0.2750 |    0.0256 |  0.0171 |  0.0347 |
| eurusd_P3   | V1 replicate (registered models)            | OOS    |    165 |    0.2622 |         0.2782 |    0.0160 |  0.0083 |  0.0234 |
| eurusd_P3   | V2 news-calendar baseline                   | VAL    |    196 |    0.2978 |         0.3031 |    0.0053 |  0.0008 |  0.0101 |
| eurusd_P3   | V2 news-calendar baseline                   | OOS    |    165 |    0.3050 |         0.3058 |    0.0008 | -0.0022 |  0.0041 |
| eurusd_P3   | V3 quiet of scheduled news (V1 predictions) | VAL    |    196 |    0.1848 |         0.2154 |    0.0306 |  0.0200 |  0.0420 |
| eurusd_P3   | V3 quiet of scheduled news (V1 predictions) | OOS    |    165 |    0.2026 |         0.2193 |    0.0167 |  0.0058 |  0.0275 |
| spx500_L_US | V1 replicate (registered models)            | VAL    |    195 |    0.2919 |         0.2977 |    0.0058 |  0.0002 |  0.0115 |
| spx500_L_US | V1 replicate (registered models)            | OOS    |    165 |    0.2680 |         0.2738 |    0.0058 |  0.0001 |  0.0113 |
| spx500_L_US | V2 news-calendar baseline                   | VAL    |    195 |    0.3411 |         0.3420 |    0.0008 | -0.0019 |  0.0036 |
| spx500_L_US | V2 news-calendar baseline                   | OOS    |    165 |    0.3068 |         0.3077 |    0.0009 | -0.0024 |  0.0039 |
| spx500_L_US | V3 quiet of scheduled news (V1 predictions) | VAL    |    194 |    0.1442 |         0.1499 |    0.0057 | -0.0018 |  0.0135 |
| spx500_L_US | V3 quiet of scheduled news (V1 predictions) | OOS    |    165 |    0.1398 |         0.1456 |    0.0058 | -0.0025 |  0.0134 |
| us2000_P3   | V1 replicate (registered models)            | VAL    |    195 |    0.3782 |         0.3849 |    0.0067 |  0.0019 |  0.0113 |
| us2000_P3   | V1 replicate (registered models)            | OOS    |    165 |    0.3556 |         0.3638 |    0.0083 |  0.0022 |  0.0143 |
| us2000_P3   | V2 news-calendar baseline                   | VAL    |    195 |    0.4124 |         0.4096 |   -0.0028 | -0.0054 | -0.0004 |
| us2000_P3   | V2 news-calendar baseline                   | OOS    |    165 |    0.3865 |         0.3869 |    0.0004 | -0.0017 |  0.0025 |
| us2000_P3   | V3 quiet of scheduled news (V1 predictions) | VAL    |    194 |    0.2271 |         0.2372 |    0.0101 |  0.0028 |  0.0174 |
| us2000_P3   | V3 quiet of scheduled news (V1 predictions) | OOS    |    165 |    0.1942 |         0.2026 |    0.0084 | -0.0015 |  0.0181 |
| us30_L_US   | V1 replicate (registered models)            | VAL    |    195 |    0.3473 |         0.3539 |    0.0066 |  0.0004 |  0.0131 |
| us30_L_US   | V1 replicate (registered models)            | OOS    |    165 |    0.3424 |         0.3481 |    0.0057 |  0.0011 |  0.0103 |
| us30_L_US   | V2 news-calendar baseline                   | VAL    |    195 |    0.4038 |         0.4039 |    0.0002 | -0.0022 |  0.0025 |
| us30_L_US   | V2 news-calendar baseline                   | OOS    |    165 |    0.3878 |         0.3893 |    0.0015 | -0.0017 |  0.0049 |
| us30_L_US   | V3 quiet of scheduled news (V1 predictions) | VAL    |    194 |    0.2022 |         0.2057 |    0.0034 | -0.0039 |  0.0105 |
| us30_L_US   | V3 quiet of scheduled news (V1 predictions) | OOS    |    165 |    0.2109 |         0.2189 |    0.0080 |  0.0013 |  0.0142 |
| us30_P0     | V1 replicate (registered models)            | VAL    |    195 |    0.3473 |         0.3733 |    0.0260 |  0.0172 |  0.0351 |
| us30_P0     | V1 replicate (registered models)            | OOS    |    165 |    0.3424 |         0.3641 |    0.0217 |  0.0128 |  0.0301 |
| us30_P0     | V2 news-calendar baseline                   | VAL    |    195 |    0.4038 |         0.4009 |   -0.0028 | -0.0052 | -0.0007 |
| us30_P0     | V2 news-calendar baseline                   | OOS    |    165 |    0.3878 |         0.3862 |   -0.0016 | -0.0037 |  0.0003 |
| us30_P0     | V3 quiet of scheduled news (V1 predictions) | VAL    |    194 |    0.2022 |         0.2325 |    0.0303 |  0.0178 |  0.0431 |
| us30_P0     | V3 quiet of scheduled news (V1 predictions) | OOS    |    165 |    0.2109 |         0.2465 |    0.0356 |  0.0213 |  0.0495 |
| usdjpy_P3   | V1 replicate (registered models)            | VAL    |    196 |    0.1588 |         0.1698 |    0.0110 |  0.0039 |  0.0187 |
| usdjpy_P3   | V1 replicate (registered models)            | OOS    |    165 |    0.1847 |         0.1933 |    0.0086 |  0.0015 |  0.0156 |
| usdjpy_P3   | V2 news-calendar baseline                   | VAL    |    196 |    0.2017 |         0.2074 |    0.0057 |  0.0005 |  0.0109 |
| usdjpy_P3   | V2 news-calendar baseline                   | OOS    |    165 |    0.1909 |         0.1964 |    0.0055 | -0.0010 |  0.0119 |
| usdjpy_P3   | V3 quiet of scheduled news (V1 predictions) | VAL    |    196 |    0.1429 |         0.1599 |    0.0169 |  0.0073 |  0.0262 |
| usdjpy_P3   | V3 quiet of scheduled news (V1 predictions) | OOS    |    165 |    0.1592 |         0.1685 |    0.0093 | -0.0008 |  0.0191 |

## Reading
V1 reproduces the stage-2 gains. V3 (scoring only bars away from scheduled releases) keeps the gain, so the effect is not concentrated in the release windows themselves. V2 (a baseline that knows the scheduled-release calendar, minutes since/until releases, FOMC days, weekday and minutes since the US open) removes the gain for every candidate: it falls to about zero, with the out-of-sample CI including zero. The rate line therefore tells the model, in effect, where it is relative to scheduled US news and the US session; once the baseline knows that, the line adds nothing measurable.

Limits: the calendar omits ECB/BoE/BoJ decision dates and unscheduled news; this is a demotion test, not proof of absence.