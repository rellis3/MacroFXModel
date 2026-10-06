# STEP C — meta-labelling the yield-spread book (results)

Pre-registration: `forge/META_LABEL_YS_PREREG.md`. Walk-forward by year 2019–2026: **221 test trades.** Sizes 0.5 / 1.0 / 1.5 by the training terciles, rescaled to mean 1 per year (same average risk as flat). 95% intervals: block bootstrap over entry months.

## Verdict: **FAIL**

| | flat | meta-sized | skip bottom tercile (reported only) |
|---|---|---|---|
| per-trade Sharpe | 0.165 | 0.100 | 0.061 |
| mean net return per trade | 0.321% | 0.232% | |

Sharpe difference (meta − flat): **-0.065** [-0.117, +0.006]. Mean return difference -0.090% [-0.252, +0.052].

| predicted tercile | trades | win rate | mean net return |
|---|---|---|---|
| bottom | 82 | 62.2% | 0.380% |
| middle | 67 | 62.7% | 0.570% |
| top | 72 | 52.8% | 0.020% |

| year | trades | flat total % | meta total % |
|---|---|---|---|
| 2019 | 18 | +2.94 | +5.92 |
| 2020 | 31 | -31.68 | -49.30 |
| 2021 | 34 | +3.14 | +6.17 |
| 2022 | 39 | +34.72 | +45.06 |
| 2023 | 25 | +12.64 | +9.88 |
| 2024 | 31 | +26.38 | +22.18 |
| 2025 | 15 | +2.39 | -4.56 |
| 2026 | 28 | +20.49 | +15.80 |

Last year's coefficients (standardised): regime +0.343, res5 -0.016, today -0.025, jumps5 +0.292, absz +0.148
