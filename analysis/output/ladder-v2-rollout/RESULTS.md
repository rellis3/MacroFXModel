# ladder-v2-rollout — sigma race + exhaustion for every instrument with data

Pre-registered: `forge/LADDER_V2_ROLLOUT_PREREG.md` (A1: a test year needs an earlier year to fit on; affects US2000 F exhaustion only). Generated 2026-11-20 by `scripts/ladder-v2/bank_rollout.py`. Per-instrument detail: `analysis/output/ladder-v2-<sym>/report.txt`, `analysis/output/exhaustion-v2-<sym>/report.txt`.

## Summary

- 45 instruments, 63 instrument-tracks scored.
- **Sigma race:** 52 VALIDATED, 11 UNDERPOWERED, 0 NULL.
- **Exhaustion:** 59 VALIDATED, 3 UNDERPOWERED, 0 NULL.
- **Multiplicity:** 63 independent tries would give about 3.2 VALIDATED by chance under the 90% CI rule. BH q = 0.10 over approximate one-sided p-values (normal approximation from each 90% CI; conservative where the re-selected CI is clipped at 0) keeps 63/63 sigma races and 62/63 exhaustion races. Errors are correlated across instruments (about 0.47 for sigma), so the effective number of tries is smaller.
- Not scored: SUGAR (CFD fails inventory: 100% thin, A2).
- **Inventory (amendment A2, post-hoc, demote-only):** the commodity CFDs were downloaded for this study and skipped the 0.1 inventory screen. Applied afterwards with the harness's own session floor (600 London bars), NATGAS CFD 22%, SOYBEAN CFD 23%, WHEAT CFD 34%, CORN CFD 76%, SUGAR CFD 100% of present sessions are thin, so their scored sessions are the busy days only. Their CFD verdicts are demoted to UNDERPOWERED and stay off the exports; their futures (NG, ZW, ZC) passed the 0.1 screen and stand. Read literally, 0.1's futures threshold (1,000 of 1,320 bars) would also flag SPX500 (21% thin), DE30 (28%), SILVER (26%), PLATINUM (25%) and PALLADIUM (54%) CFDs; under the harness floor they drop at most 2% of sessions, so their samples are not activity-selected and they stand, flagged here.

## Sigma race (regime miss, pp; lower is better)

| Instrument | Track | Verdict | Chosen | Chosen | Live | CI (chosen − live) | Fails | BH |
|---|---|---|---|---|---|---|---|---|
| SPX500 | C | VALIDATED | GARCH-t | 1.69 | 2.50 | [-1.55, -0.36] | — | kept |
| SPX500 | F | VALIDATED | HAR + GARCH-t | 1.69 | 2.26 | [-1.45, -0.29] | — | kept |
| US30 | C | VALIDATED | har rv log | 1.76 | 2.53 | [-1.53, -0.39] | — | kept |
| US30 | F | VALIDATED | har rv log | 1.81 | 2.64 | [-1.58, -0.48] | — | kept |
| US2000 | C | UNDERPOWERED | ewma 090 | 1.45 | 2.76 | [-2.06, -0.48] | half 2018-22 | kept |
| US2000 | F | VALIDATED | ewma 090 | 1.60 | 3.15 | [-2.35, -0.93] | — | kept |
| GBPUSD | C | VALIDATED | HAR-CJ | 1.45 | 2.64 | [-2.16, -0.71] | — | kept |
| GBPUSD | F | VALIDATED | HAR-CJ | 1.83 | 3.02 | [-2.17, -0.73] | — | kept |
| AUDUSD | C | VALIDATED | HAR-RV 15-min | 1.42 | 3.13 | [-2.20, -0.95] | — | kept |
| AUDUSD | F | VALIDATED | HAR-RV 15-min | 1.46 | 3.23 | [-2.25, -1.08] | — | kept |
| NZDUSD | C | VALIDATED | yz 20 | 1.40 | 2.60 | [-1.98, -0.48] | — | kept |
| NZDUSD | F | VALIDATED | HAR-CJ | 1.88 | 3.19 | [-2.08, -0.69] | — | kept |
| USDJPY | C | UNDERPOWERED | yz 20 | 1.61 | 1.89 | [-1.37, +0.00] | half 2023-26, without 2018Q4, without covid, without tariff2025, without hi1_202210, without hi2_202407, without hi3_202503, without hi4_202301, fault flags out | kept |
| USDJPY | F | UNDERPOWERED | GARCH-t | 1.81 | 2.24 | [-1.41, +0.00] | without 2018Q4, without covid, without tariff2025, without hi1_202210, without hi3_202503 | kept |
| USDCAD | C | VALIDATED | HAR + GARCH-t | 1.49 | 3.21 | [-2.17, -0.94] | — | kept |
| USDCAD | F | VALIDATED | HAR + GARCH-t | 1.69 | 2.98 | [-1.82, -0.88] | — | kept |
| USDCHF | C | VALIDATED | HAR-CJ | 1.47 | 3.01 | [-2.04, -0.90] | — | kept |
| USDCHF | F | VALIDATED | HAR-CJ | 1.29 | 3.06 | [-2.15, -0.94] | — | kept |
| AUDCAD | C | VALIDATED | HAR-RV 5-min | 1.31 | 3.67 | [-2.95, -1.49] | — | kept |
| AUDCHF | C | VALIDATED | HAR-RV 5-min | 1.33 | 3.24 | [-2.87, -1.14] | — | kept |
| AUDJPY | C | VALIDATED | HAR-RV 5-min | 1.44 | 3.72 | [-3.07, -1.47] | — | kept |
| AUDNZD | C | VALIDATED | har rv log | 1.17 | 3.21 | [-2.43, -1.23] | — | kept |
| CADCHF | C | VALIDATED | HAR + GARCH-t | 1.42 | 3.78 | [-2.84, -1.47] | — | kept |
| CADJPY | C | VALIDATED | HAR-CJ | 1.35 | 2.36 | [-1.71, -0.28] | — | kept |
| CHFJPY | C | UNDERPOWERED | HAR-CJ | 1.49 | 2.23 | [-1.73, -0.13] | without tariff2025, without hi4_202302 | kept |
| EURAUD | C | VALIDATED | SHAR | 1.07 | 2.47 | [-2.00, -0.56] | — | kept |
| EURCAD | C | VALIDATED | HAR-CJ | 1.53 | 2.46 | [-1.88, -0.39] | — | kept |
| EURCHF | C | VALIDATED | yz 10 | 1.39 | 2.47 | [-2.09, -0.29] | — | kept |
| EURGBP | C | VALIDATED | EGARCH | 1.72 | 2.75 | [-1.69, -0.57] | — | kept |
| EURJPY | C | VALIDATED | SHAR | 1.14 | 2.44 | [-1.69, -0.47] | — | kept |
| EURNZD | C | VALIDATED | HAR-CJ | 0.93 | 2.85 | [-2.40, -1.00] | — | kept |
| GBPAUD | C | VALIDATED | HAR-RV 5-min | 1.66 | 3.17 | [-2.39, -0.99] | — | kept |
| GBPCAD | C | VALIDATED | SHAR | 1.58 | 3.24 | [-2.89, -0.96] | — | kept |
| GBPCHF | C | VALIDATED | yz 10 | 1.31 | 2.86 | [-2.35, -0.84] | — | kept |
| GBPJPY | C | UNDERPOWERED | SHAR | 1.20 | 1.77 | [-1.37, -0.06] | half 2023-26 | kept |
| GBPNZD | C | VALIDATED | HAR-CJ | 1.41 | 3.52 | [-2.58, -1.39] | — | kept |
| NZDCAD | C | VALIDATED | SHAR | 1.53 | 2.69 | [-1.82, -0.60] | — | kept |
| NZDJPY | C | VALIDATED | ewma 094 | 1.52 | 3.40 | [-2.50, -1.02] | — | kept |
| DE30 | C | VALIDATED | HAR-CJ | 1.15 | 2.65 | [-1.98, -0.66] | — | kept |
| DE30 | F | VALIDATED | HAR-RV 5-min | 1.60 | 2.80 | [-2.00, -0.76] | — | kept |
| UK100 | C | UNDERPOWERED | ewma 094 | 1.73 | 2.46 | [-1.65, -0.13] | half 2018-22 | kept |
| SILVER | C | VALIDATED | HAR-CJ | 1.41 | 2.61 | [-2.16, -0.70] | — | kept |
| SILVER | F | VALIDATED | GJR-GARCH | 1.51 | 2.57 | [-2.04, -0.60] | — | kept |
| COPPER | C | VALIDATED | har rv log | 1.53 | 2.92 | [-1.92, -0.80] | — | kept |
| COPPER | F | VALIDATED | har rv log | 1.34 | 3.00 | [-2.47, -1.04] | — | kept |
| PLATINUM | C | VALIDATED | ewma 094 | 1.85 | 3.99 | [-2.58, -1.33] | — | kept |
| PLATINUM | F | VALIDATED | har rv log | 1.67 | 4.14 | [-3.23, -1.52] | — | kept |
| PALLADIUM | C | VALIDATED | yz 20 | 1.70 | 3.42 | [-2.41, -1.17] | — | kept |
| WTI | C | VALIDATED | HAR + GARCH-t | 1.04 | 3.39 | [-2.72, -1.23] | — | kept |
| WTI | F | VALIDATED | GARCH | 0.99 | 3.05 | [-2.48, -1.07] | — | kept |
| BRENT | C | VALIDATED | HAR + GARCH-t | 1.40 | 3.08 | [-2.23, -0.69] | — | kept |
| BRENT | F | VALIDATED | HAR-800 | 1.21 | 2.97 | [-2.37, -0.92] | — | kept |
| NATGAS | C | UNDERPOWERED | HAR-RV 15-min | 1.86 | 3.20 | [-2.10, -0.62] | inventory: 22% of sessions thin (A2) | kept |
| NATGAS | F | VALIDATED | har rv log | 1.19 | 2.17 | [-1.92, -0.43] | — | kept |
| SOYBEAN | C | UNDERPOWERED | HAR-RV 5-min | 1.36 | 2.92 | [-2.02, -0.79] | inventory: 23% of sessions thin (A2) | kept |
| WHEAT | C | UNDERPOWERED | HAR-RV 15-min | 1.51 | 3.21 | [-2.05, -0.79] | inventory: 34% of sessions thin (A2) | kept |
| WHEAT | F | VALIDATED | HAR-RV 15-min | 1.23 | 3.00 | [-2.53, -0.92] | — | kept |
| CORN | C | UNDERPOWERED | HAR-RV 5-min | 3.25 | 4.58 | [-1.67, -0.01] | without bear2022, without tariff2025, without hi1_202104, without hi3_202205, without hi4_202201, inventory: 76% of sessions thin (A2) | kept |
| CORN | F | VALIDATED | har rv log | 2.02 | 3.00 | [-2.14, -0.75] | — | kept |
| ZN | F | VALIDATED | HAR-800 | 1.39 | 3.13 | [-2.53, -0.80] | — | kept |
| ZB | F | VALIDATED | HAR-CJ | 1.36 | 3.46 | [-2.59, -1.20] | — | kept |
| ZT | F | UNDERPOWERED | HAR-800 | 1.58 | 2.63 | [-2.22, -0.12] | half 2018-22 | kept |
| ZF | F | VALIDATED | HAR-800 | 1.22 | 2.72 | [-2.36, -0.49] | — | kept |

## C vs F (H3)

| Instrument | Futures | Same? | F/C ratios | Futures lines use |
|---|---|---|---|---|
| SPX500 | ES | same | 0.999–1.011 | GARCH-t |
| US30 | YM | same | 1.000–1.012 | har rv log |
| US2000 | RTY | same | 0.998–1.011 | ewma 090 |
| GBPUSD | 6B | same | 1.006–1.016 | HAR-CJ |
| AUDUSD | 6A | same | 1.001–1.011 | HAR-RV 15-min |
| NZDUSD | 6N | same | 0.988–1.004 | yz 20 |
| USDJPY | 6J | same | 1.005–1.022 | yz 20 |
| USDCAD | 6C | same | 1.003–1.011 | HAR + GARCH-t |
| USDCHF | 6S | same | 1.002–1.017 | HAR-CJ |
| DE30 | FDAX | different | 0.953–0.970 | HAR-RV 5-min |
| SILVER | SI | different | 1.030–1.054 | GJR-GARCH |
| COPPER | HG | same | 1.004–1.010 | har rv log |
| PLATINUM | PL | same | 1.009–1.020 | ewma 094 |
| WTI | CL | same | 1.000–1.019 | HAR + GARCH-t |
| BRENT | BZ | different | 0.996–1.031 | HAR-800 |
| NATGAS | NG | different | 1.014–1.077 | har rv log |
| WHEAT | ZW | different | 0.992–1.055 | HAR-RV 15-min |
| CORN | ZC | different | 0.990–1.051 | har rv log |

## Exhaustion (calibration miss, pp)

| Instrument | Track | Verdict | Chosen | Chosen | Plain odds | CI | Log loss ratio | BH |
|---|---|---|---|---|---|---|---|---|
| SPX500 | C | VALIDATED | X7 | 3.86 | 8.90 | [-5.69, -3.35] | 0.930 | kept |
| SPX500 | F | VALIDATED | X7 | 4.13 | 9.27 | [-6.01, -3.47] | 0.933 | kept |
| US30 | C | VALIDATED | X4 | 4.39 | 10.23 | [-7.07, -4.30] | 0.922 | kept |
| US30 | F | VALIDATED | X4 | 4.58 | 10.57 | [-7.20, -4.48] | 0.925 | kept |
| US2000 | C | VALIDATED | X4 | 3.28 | 12.17 | [-9.74, -6.47] | 0.916 | kept |
| US2000 | F | VALIDATED | X7 | 3.57 | 13.44 | [-10.52, -7.04] | 0.920 | kept |
| GBPUSD | C | VALIDATED | X6 | 2.87 | 12.23 | [-10.13, -7.51] | 0.936 | kept |
| GBPUSD | F | VALIDATED | X6 | 4.03 | 12.00 | [-9.15, -6.52] | 0.943 | kept |
| AUDUSD | C | VALIDATED | X7 | 3.36 | 11.58 | [-9.01, -7.02] | 0.936 | kept |
| AUDUSD | F | VALIDATED | X4 | 2.82 | 11.61 | [-9.04, -6.99] | 0.937 | kept |
| NZDUSD | C | VALIDATED | X4 | 3.02 | 11.80 | [-9.59, -7.08] | 0.932 | kept |
| NZDUSD | F | VALIDATED | X5 | 3.07 | 12.10 | [-9.52, -7.17] | 0.933 | kept |
| USDJPY | C | VALIDATED | X7 | 3.21 | 12.08 | [-9.05, -7.12] | 0.932 | kept |
| USDJPY | F | VALIDATED | X8 | 3.77 | 11.81 | [-8.61, -6.59] | 0.933 | kept |
| USDCAD | C | VALIDATED | X7 | 3.09 | 10.69 | [-8.59, -5.73] | 0.930 | kept |
| USDCAD | F | VALIDATED | X8 | 2.48 | 11.12 | [-9.20, -5.76] | 0.932 | kept |
| USDCHF | C | VALIDATED | X5 | 3.89 | 11.65 | [-8.83, -6.03] | 0.941 | kept |
| USDCHF | F | VALIDATED | X6 | 2.81 | 11.40 | [-9.17, -6.13] | 0.941 | kept |
| AUDCAD | C | VALIDATED | X2 | 3.07 | 12.45 | [-9.67, -7.47] | 0.937 | kept |
| AUDCHF | C | VALIDATED | X7 | 3.96 | 14.38 | [-10.84, -8.45] | 0.924 | kept |
| AUDJPY | C | VALIDATED | X4 | 2.72 | 13.43 | [-10.98, -8.71] | 0.939 | kept |
| AUDNZD | C | VALIDATED | X2 | 4.02 | 14.56 | [-10.87, -8.99] | 0.941 | kept |
| CADCHF | C | VALIDATED | X2 | 3.84 | 12.44 | [-9.56, -5.93] | 0.931 | kept |
| CADJPY | C | VALIDATED | X4 | 2.94 | 13.45 | [-10.86, -8.81] | 0.923 | kept |
| CHFJPY | C | VALIDATED | X2 | 2.99 | 14.08 | [-11.92, -9.09] | 0.931 | kept |
| EURAUD | C | VALIDATED | X7 | 3.23 | 14.17 | [-11.45, -8.87] | 0.920 | kept |
| EURCAD | C | VALIDATED | X4 | 3.88 | 13.25 | [-10.86, -7.58] | 0.922 | kept |
| EURCHF | C | VALIDATED | X6 | 3.53 | 11.88 | [-9.02, -6.67] | 0.929 | kept |
| EURGBP | C | VALIDATED | X7 | 3.66 | 14.11 | [-11.64, -8.58] | 0.922 | kept |
| EURJPY | C | VALIDATED | X2 | 3.25 | 14.44 | [-11.74, -9.30] | 0.938 | kept |
| EURNZD | C | VALIDATED | X4 | 2.87 | 13.08 | [-10.57, -8.24] | 0.929 | kept |
| GBPAUD | C | VALIDATED | X4 | 2.65 | 12.78 | [-10.53, -8.18] | 0.932 | kept |
| GBPCAD | C | VALIDATED | X7 | 2.80 | 14.08 | [-11.50, -7.91] | 0.921 | kept |
| GBPCHF | C | VALIDATED | X4 | 3.62 | 13.56 | [-11.18, -8.37] | 0.910 | kept |
| GBPJPY | C | VALIDATED | X6 | 3.30 | 13.02 | [-10.97, -8.21] | 0.940 | kept |
| GBPNZD | C | VALIDATED | X7 | 3.14 | 13.54 | [-10.66, -8.41] | 0.935 | kept |
| NZDCAD | C | VALIDATED | X2 | 4.47 | 13.54 | [-9.63, -7.61] | 0.922 | kept |
| NZDJPY | C | VALIDATED | X4 | 2.63 | 12.47 | [-10.26, -7.68] | 0.931 | kept |
| DE30 | C | VALIDATED | X7 | 4.15 | 12.85 | [-9.47, -7.28] | 0.931 | kept |
| DE30 | F | VALIDATED | X4 | 2.75 | 12.26 | [-10.45, -8.12] | 0.934 | kept |
| UK100 | C | VALIDATED | X1 | 4.75 | 12.82 | [-8.75, -6.87] | 0.927 | kept |
| SILVER | C | VALIDATED | X6 | 3.77 | 10.91 | [-8.50, -6.21] | 0.942 | kept |
| SILVER | F | VALIDATED | X7 | 3.53 | 11.98 | [-9.38, -6.69] | 0.936 | kept |
| COPPER | C | VALIDATED | X4 | 3.31 | 11.91 | [-9.33, -7.11] | 0.937 | kept |
| COPPER | F | VALIDATED | X4 | 2.85 | 11.61 | [-9.16, -6.83] | 0.935 | kept |
| PLATINUM | C | VALIDATED | X5 | 3.34 | 13.27 | [-10.44, -8.08] | 0.933 | kept |
| PLATINUM | F | VALIDATED | X8 | 4.30 | 14.42 | [-10.85, -8.44] | 0.920 | kept |
| PALLADIUM | C | VALIDATED | X5 | 3.59 | 11.25 | [-8.64, -5.68] | 0.947 | kept |
| WTI | C | VALIDATED | X4 | 3.51 | 12.01 | [-9.21, -6.51] | 0.929 | kept |
| WTI | F | VALIDATED | X8 | 4.19 | 12.21 | [-8.67, -6.14] | 0.931 | kept |
| BRENT | C | VALIDATED | X7 | 3.65 | 11.32 | [-8.11, -5.28] | 0.936 | kept |
| BRENT | F | VALIDATED | X8 | 3.85 | 11.55 | [-8.58, -5.78] | 0.932 | kept |
| NATGAS | C | UNDERPOWERED | X7 | 4.23 | 12.53 | [-9.35, -5.42] | 0.939 | kept |
| NATGAS | F | VALIDATED | X6 | 3.41 | 11.59 | [-9.18, -5.18] | 0.941 | kept |
| SOYBEAN | C | UNDERPOWERED | X7 | 2.99 | 8.93 | [-6.72, -3.75] | 0.928 | kept |
| WHEAT | C | UNDERPOWERED | X2 | 3.82 | 10.19 | [-7.26, -4.06] | 0.921 | kept |
| WHEAT | F | VALIDATED | X8 | 3.71 | 11.66 | [-8.26, -5.40] | 0.926 | kept |
| CORN | F | VALIDATED | X4 | 3.49 | 9.63 | [-6.76, -3.97] | 0.929 | kept |
| ZN | F | VALIDATED | X5 | 3.49 | 10.89 | [-8.32, -5.52] | 0.933 | kept |
| ZB | F | VALIDATED | X5 | 3.92 | 13.57 | [-10.50, -6.92] | 0.924 | kept |
| ZT | F | VALIDATED | X7 | 3.95 | 11.42 | [-7.88, -5.32] | 0.941 | kept |
| ZF | F | VALIDATED | X4 | 4.34 | 12.16 | [-8.84, -5.95] | 0.929 | kept |

## What it changes

VALIDATED instruments go onto the shadow exports (forecast and exhaustion, CFD and futures) and the forecast-reversion page. UNDERPOWERED sigma races keep the live ladder (v2 shown alongside); their exhaustion odds still apply where exhaustion VALIDATED. Event multipliers, the per-class lockbox and the FX-major IV races are not part of this study.
