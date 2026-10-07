# Lesson 01 cards 01, 09, 11 on the built system (results)

Pre-registration: `forge/CARD_CHECKS_PREREG.md`.

## Card 01 — the one-day delay check

- Chosen forecast, every input one session older: pinball ratio 0.9802 vs 0.98 undelayed → **PASS**
- Yield-spread book, rates one day later (1976–2014): +0.204% vs +0.243% per trade → **PASS**

## Card 09 — stress windows (forecast holds: **True**, stops hold: **False**)

| window | sessions | HL p75 passed: chosen / plain (target 25%) | pinball chosen ÷ plain | one bar crosses the min stop |
|---|---|---|---|---|
| COVID | 0 | nan% / nan% | nan | nan% |
| UK gilt crisis | 1020 | 33.1% / 29.3% | 0.986 | 9.8% |
| SVB | 612 | 24.5% / 31.1% | 0.943 | 1.1% |
| Yen carry unwind | 578 | 34.8% / 38.2% | 0.939 | 10.2% |
| Tariff shock | 705 | 34.5% / 30.9% | 0.879 | 9.4% |
| all other days (2020-08 → 2026-08 walk-forward span) | 49571 | 22.8% / 23.9% | 0.984 | 4.2% |

## Card 11 — measured spread vs the minimum stop (round trip ≈ 1 spread)

| pair | spread pips, entry hours / worst hour | today's min stop (pips) | cost as % of stop: entry / worst | flag |
|---|---|---|---|---|
| EURNZD | 6.48 / 25.19 | 34.6 | 18.8% / 72.9% | cost-heavy |
| GBPAUD | 4.97 / 26.68 | 40.1 | 12.4% / 66.6% | cost-heavy |
| EURGBP | 1.15 / 6.1 | 9.9 | 11.6% / 61.7% | cost-heavy |
| AUDCAD | 2.35 / 13.47 | 21.0 | 11.2% / 64.0% | cost-heavy |
| GBPCAD | 3.55 / 20.69 | 34.1 | 10.4% / 60.6% | cost-heavy |
| EURAUD | 3.49 / 17.69 | 34.3 | 10.2% / 51.5% | cost-heavy |
| GBPCHF | 2.45 / 25.29 | 24.6 | 10.0% / 102.8% |  |
| EURCHF | 1.97 / 16.2 | 20.0 | 9.8% / 80.8% |  |
| NZDJPY | 2.65 / 14.26 | 28.1 | 9.4% / 50.8% |  |
| EURCAD | 2.71 / 13.32 | 31.9 | 8.5% / 41.8% |  |
| CADJPY | 2.46 / 12.93 | 31.1 | 7.9% / 41.6% |  |
| AUDJPY | 2.27 / 14.03 | 29.9 | 7.6% / 47.0% |  |
| NZDUSD | 1.45 / 6.56 | 19.6 | 7.4% / 33.4% |  |
| USDCAD | 1.76 / 7.21 | 24.0 | 7.3% / 30.1% |  |
| USDCHF | 1.47 / 13.59 | 21.1 | 7.0% / 64.4% |  |
| GBPJPY | 3.82 / 23.61 | 57.2 | 6.7% / 41.2% |  |
| AUDUSD | 1.3 / 5.59 | 19.6 | 6.6% / 28.4% |  |
| EURJPY | 2.79 / 11.87 | 49.0 | 5.7% / 24.2% |  |
| GBPUSD | 1.22 / 8.57 | 31.1 | 3.9% / 27.6% |  |
| USDJPY | 1.6 / 6.81 | 43.9 | 3.6% / 15.5% |  |
| EURUSD | 0.76 / 2.78 | 29.5 | 2.6% / 9.4% |  |
| GOLD | 0.5 / 0.64 | 32.3 | 1.6% / 2.0% |  |

Indices: not in the spread profile (unmeasured). Prices for the cost share are the last cached closes (Aug 2026); σ is today's chosen forecast.
