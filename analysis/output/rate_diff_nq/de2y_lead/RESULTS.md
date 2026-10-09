# DE2Y-NQ-15M-LEAD — result

Pre-registration: `forge/DE2Y_NQ_15M_LEAD_PREREG.md`. Window 2025-09-01 → 2026-03-31, Schatz contracts EUREX_FGBS_20251208_M, EUREX_FGBS_20260306_M, EUREX_FGBS_20260608_M.

## FAIL

| sample | corr (German 2y move bar t−1, Nasdaq bar t) | t | 95% | bars | days |
|---|---|---|---|---|---|
| primary (stocks & yields move opposite) | -0.0064 | -0.19 | [-0.0711, 0.0584] | 1,306 | 16 |
| full window | -0.0075 | -0.54 | [-0.0349, 0.0199] | 11,903 | 147 |
| opposite regime (move together) | -0.0067 | -0.43 | [-0.0374, 0.0241] | 8,240 | 101 |
| same-bar check, primary regime | -0.5884 | -2.54 | [-1.0419, -0.1348] | 1,320 | 16 |
| same-bar check, move-together regime | +0.0442 | +0.79 | [-0.0651, 0.1534] | 8,251 | 101 |

Share of bars in the primary regime: 11%. Effect in the primary regime: -0.28 Nasdaq points per 1 bp German 2y move in the previous 15 minutes.
