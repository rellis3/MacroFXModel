# EURUSD model step — results

Rule: forge/EURUSD_MODEL_PREREG.md. Walk-forward by year 2023–2026 (to 2026-08-20), 5-day embargo, fixed gradient-boosting settings. 943 test days. Skill = 1 − loss ÷ reference loss, with a 95% day-bootstrap interval; ✔ = interval entirely above 0.

## 1. Day size and direction, at the London open (Brier skill)

| target | base rate (test) | M3 vs your lines (M0) | M3 vs EWMA (M1) | IV added: M3 vs M2 | M2 vs M0 |
|---|---|---|---|---|---|
| day range ≥ hl p50 | 47% | +0.026 (-0.016 to +0.063) | +0.013 (-0.025 to +0.050) | +0.004 (-0.024 to +0.031) | +0.022 (-0.020 to +0.059) |
| day range ≥ hl p75 | 23% | +0.020 (-0.028 to +0.070) | +0.006 (-0.047 to +0.052) | -0.016 (-0.050 to +0.018) | +0.035 (-0.009 to +0.080) |
| day range ≥ hl p90 | 10% | +0.006 (-0.041 to +0.053) | -0.003 (-0.052 to +0.041) | +0.013 (-0.026 to +0.050) | -0.007 (-0.047 to +0.030) |
| close above open | 49% | -0.058 (-0.086 to -0.030) | -0.057 (-0.084 to -0.030) | -0.011 (-0.033 to +0.009) | -0.046 (-0.076 to -0.020) |
| OH p50 reached (up side) | 49% | -0.046 (-0.079 to -0.014) | -0.041 (-0.073 to -0.009) | +0.006 (-0.016 to +0.027) | -0.052 (-0.085 to -0.019) |
| OL p50 reached (down side) | 49% | -0.026 (-0.052 to +0.004) | -0.031 (-0.062 to -0.001) | -0.000 (-0.021 to +0.018) | -0.026 (-0.057 to +0.004) |

## 2. Day size as a continuous forecast (pinball-loss skill on log range)

| quantile | M3 vs your lines as drawn | M3 vs EWMA (M1) | IV added: M3 vs M2 |
|---|---|---|---|
| 0.50 (p50 line) | +0.019 (-0.008 to +0.045) | +0.011 (-0.013 to +0.035) | -0.003 (-0.023 to +0.017) |
| 0.75 (p75 line) | +0.038 (+0.012 to +0.063) ✔ | +0.036 (+0.013 to +0.058) ✔ | +0.008 (-0.011 to +0.028) |
| 0.90 (p90 line) | +0.059 (+0.031 to +0.089) ✔ | +0.048 (+0.018 to +0.075) ✔ | +0.031 (+0.007 to +0.055) ✔ |

## 3. Touch trading from the model (walk-forward)

Take a touch in whichever direction the model predicts positive net R (skip if neither).

| year | touches | taken | follows / fades | win % | net R per trade | t |
|---|---|---|---|---|---|---|
| 2023 | 1001 | 749 | 255 / 494 | 49% | -0.057 | -1.8 |
| 2024 | 958 | 739 | 428 / 311 | 53% | -0.017 | -0.5 |
| 2025 | 961 | 767 | 415 / 352 | 51% | +0.023 | +0.7 |
| 2026 | 588 | 396 | 214 / 182 | 50% | +0.038 | +0.9 |
| all | 3508 | 2651 | 1312 / 1339 | 51% | -0.009 | -0.5 |

For reference, every touch followed: -0.046R; every touch faded: -0.033R.

## Verdicts (pre-registered)

1. Day size beyond your lines (M3 > M0 on p50, p75, p90): **FAIL**
2. Implied vol adds information (M3 > M2): **FAIL**
3. Beyond the simple average (M3 > M1): **FAIL**
4. Direction (close > open, M3 > M0): **FAIL**
5. Touch trading: **FAIL** (net R -0.009, t -0.5, n 2651)
