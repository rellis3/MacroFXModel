# Study 2 — the rubber band: fading stretches from fair value

Rule: forge/RUBBER_BAND_PREREG.md. 28 instruments (FX + gold), 2016 → 2026-08. Fade |z| ≥ 2 toward fair value, time exit only, one open trade per instrument per speed. Net return in σ (the day's forecast σ × open), after spread.

## 1. Results by speed

| speed | trades | win % | net 2016–22 (t) | net 2023–26 (t) | instruments positive | verdict |
|---|---|---|---|---|---|---|
| **S1** intraday: London-day VWAP, 2-hour hold | 522 | 46% | -0.003 (-0.1) | -0.116 (-2.2) | 12/28 | FAIL |
| **S2** swing: 5-day mean, hold to the close | 6303 | 48% | -0.045 (-2.8) | +0.020 (+0.8) | 12/28 | FAIL |
| **S3** slow: 20-day mean, 5-day hold | 1739 | 52% | +0.065 (+0.8) | +0.117 (+1.0) | 15/28 | FAIL |

## 2. Does the stretch come back at all? (descriptive, every decision)

Slope of the forward return (σ) on z: negative = the further price is stretched, the more it comes back. Reversion-to-cost = expected pull-back at |z| = 2 ÷ the round-trip spread.

| speed | decisions | slope of forward return on z | expected pull-back at z = 2 (σ) | median spread (σ) | reversion-to-cost |
|---|---|---|---|---|---|
| S1 | 679,527 | +0.001 | -0.003 | 0.034 | -0.1× |
| S2 | 75,363 | -0.011 | +0.022 | 0.034 | 0.6× |
| S3 | 74,859 | -0.047 | +0.094 | 0.034 | 2.7× |

## 3. By instrument (net per trade, full period)

| instrument | S1 | S2 | S3 |
|---|---|---|---|
| EURUSD | +0.05 (n 17) | +0.00 (n 206) | +0.78 (n 70) |
| GBPUSD | +0.26 (n 15) | -0.00 (n 190) | +0.40 (n 51) |
| USDJPY | -0.26 (n 26) | -0.15 (n 248) | +0.10 (n 61) |
| AUDUSD | +0.56 (n 4) | -0.02 (n 266) | +0.31 (n 66) |
| USDCAD | +0.01 (n 15) | +0.03 (n 205) | +0.12 (n 77) |
| USDCHF | +0.08 (n 24) | -0.21 (n 228) | -0.13 (n 61) |
| NZDUSD | +0.05 (n 6) | -0.07 (n 282) | -0.27 (n 72) |
| EURGBP | -0.15 (n 25) | +0.05 (n 175) | +0.36 (n 45) |
| EURJPY | -0.17 (n 28) | +0.04 (n 210) | -0.00 (n 57) |
| GBPJPY | +0.01 (n 25) | -0.04 (n 230) | -0.12 (n 60) |
| EURAUD | +0.07 (n 16) | +0.01 (n 252) | -0.12 (n 59) |
| EURCHF | +0.11 (n 31) | -0.00 (n 169) | -0.50 (n 43) |
| AUDJPY | -0.09 (n 28) | +0.02 (n 291) | +0.08 (n 78) |
| CADJPY | -0.15 (n 18) | +0.04 (n 223) | -0.08 (n 66) |
| CHFJPY | -0.08 (n 28) | -0.01 (n 207) | -0.35 (n 63) |
| GOLD | +0.18 (n 19) | -0.05 (n 291) | -0.29 (n 88) |
| AUDNZD | -0.08 (n 12) | -0.15 (n 253) | -0.05 (n 59) |
| AUDCAD | +0.36 (n 8) | +0.08 (n 217) | +1.06 (n 43) |
| NZDCAD | +0.40 (n 3) | +0.03 (n 230) | +0.22 (n 58) |
| CADCHF | -0.01 (n 22) | -0.03 (n 180) | +0.34 (n 51) |
| EURCAD | -0.00 (n 11) | +0.03 (n 177) | +0.19 (n 51) |
| EURNZD | -0.01 (n 17) | -0.04 (n 265) | -0.37 (n 67) |
| GBPAUD | -0.19 (n 16) | +0.02 (n 212) | +0.38 (n 65) |
| GBPCAD | -0.24 (n 23) | +0.06 (n 167) | +0.42 (n 59) |
| GBPNZD | -0.14 (n 21) | -0.04 (n 230) | +0.29 (n 71) |
| GBPCHF | -0.08 (n 23) | -0.04 (n 183) | -0.13 (n 64) |
| AUDCHF | -0.18 (n 20) | -0.09 (n 240) | +0.36 (n 64) |
| NZDJPY | -0.14 (n 21) | -0.02 (n 276) | -0.28 (n 70) |

## 4. Secondary: S1 split by the big-day forecast (2023–2026, where forecasts exist)

- big day: +0.110 (t +1.1, n 49)
- normal/small day: -0.545 (t -2.2, n 4)

## Verdicts (pre-registered)

- S1: **FAIL**
- S2: **FAIL**
- S3: **FAIL**
