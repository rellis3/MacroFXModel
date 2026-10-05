# IV-adjusted daily ladder — calibration on live-type inputs

Re-check of COMBINED-RANGE / CROSS-IV with the inputs the live export uses (OANDA D1 σ; VIX/VXN close; CME constant-maturity 30d ATM IV; GVZ; crosses from the legs). First 60% fit, last 40% scored; pass rule as pre-registered (median H-L p50+p75 pinball B÷A < 0.98 and B better on ≥ 60%).

## indices — PASS

Split 2022-08-23. Elasticity k: 0.616 (train) / 0.634 (all data, exported). Median B÷A **0.9317**, B better on **100%**.

| DE30 | DOW | NQ | SPX | UK100 | US2000 |
|---|---|---|---|---|---|
| 0.9327 | 0.911 | 0.9301 | 0.9308 | 0.9336 | 0.9416 |

| rung | target | A exceed | B exceed |
|---|---|---|---|
| hl_p50 | 50% | 52.4% | 51.1% |
| hl_p75 | 25% | 25.2% | 24.8% |
| hl_p90 | 10% | 8.9% | 8.9% |
| oc_p50 | 50% | 51.2% | 51.6% |
| oc_p75 | 25% | 26.4% | 25.7% |
| oc_p90 | 10% | 9.8% | 9.6% |
| oh_p50 | 50% | 50.3% | 49.9% |
| oh_p75 | 25% | 26.4% | 26.6% |
| oh_p90 | 10% | 12.3% | 11.2% |
| ol_p50 | 50% | 51.3% | 50.8% |
| ol_p75 | 25% | 25.3% | 24.7% |
| ol_p90 | 10% | 8.3% | 8.2% |

## fx_major — PASS

Split 2024-01-15. Elasticity k: 0.791 (train) / 0.762 (all data, exported). Median B÷A **0.9382**, B better on **100%**.

| AUDUSD | EURUSD | GBPUSD | GOLD | USDCAD | USDCHF | USDJPY |
|---|---|---|---|---|---|---|
| 0.9243 | 0.9508 | 0.9382 | 0.9188 | 0.9221 | 0.9385 | 0.9746 |

| rung | target | A exceed | B exceed |
|---|---|---|---|
| hl_p50 | 50% | 46.3% | 44.9% |
| hl_p75 | 25% | 23.7% | 22.9% |
| hl_p90 | 10% | 9.9% | 9.7% |
| oc_p50 | 50% | 48.8% | 48.5% |
| oc_p75 | 25% | 24.0% | 23.4% |
| oc_p90 | 10% | 9.9% | 9.5% |
| oh_p50 | 50% | 48.9% | 48.5% |
| oh_p75 | 25% | 24.8% | 24.8% |
| oh_p90 | 10% | 10.3% | 10.1% |
| ol_p50 | 50% | 46.2% | 45.4% |
| ol_p75 | 25% | 23.5% | 23.4% |
| ol_p90 | 10% | 9.7% | 9.5% |

## crosses — PASS

Split 2024-04-03. Elasticity k: 0.64 (train) / 0.645 (all data, exported). Median B÷A **0.9649**, B better on **100%**.

| AUDCAD | AUDCHF | AUDJPY | CADCHF | CADJPY | CHFJPY | EURAUD | EURCAD | EURCHF | EURGBP | EURJPY | GBPAUD | GBPCAD | GBPCHF | GBPJPY |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.9329 | 0.957 | 0.9623 | 0.9142 | 0.9649 | 0.9803 | 0.9785 | 0.9655 | 0.9839 | 0.9765 | 0.9829 | 0.9368 | 0.9628 | 0.9508 | 0.9731 |

| rung | target | A exceed | B exceed |
|---|---|---|---|
| hl_p50 | 50% | 46.7% | 45.9% |
| hl_p75 | 25% | 24.5% | 24.2% |
| hl_p90 | 10% | 10.4% | 10.9% |
| oc_p50 | 50% | 48.1% | 48.7% |
| oc_p75 | 25% | 24.2% | 24.2% |
| oc_p90 | 10% | 9.5% | 9.9% |
| oh_p50 | 50% | 50.4% | 50.7% |
| oh_p75 | 25% | 24.1% | 23.6% |
| oh_p90 | 10% | 9.4% | 9.5% |
| ol_p50 | 50% | 47.3% | 47.6% |
| ol_p75 | 25% | 23.6% | 24.0% |
| ol_p90 | 10% | 10.0% | 9.9% |

## Data

- NQ: indices, 2584 sessions, 2016-08-22 to 2026-08-21
- SPX: indices, 2584 sessions, 2016-08-22 to 2026-08-21
- DOW: indices, 2584 sessions, 2016-08-22 to 2026-08-21
- US2000: indices, 2584 sessions, 2016-08-22 to 2026-08-21
- DE30: indices, 2540 sessions, 2016-08-22 to 2026-08-20
- UK100: indices, 2526 sessions, 2016-08-22 to 2026-08-20
- EURUSD: fx_major, 1565 sessions, 2020-09-09 to 2026-08-21
- GBPUSD: fx_major, 1565 sessions, 2020-09-09 to 2026-08-21
- AUDUSD: fx_major, 1565 sessions, 2020-09-09 to 2026-08-21
- USDJPY: fx_major, 1565 sessions, 2020-09-09 to 2026-08-21
- USDCAD: fx_major, 1565 sessions, 2020-09-09 to 2026-08-21
- USDCHF: fx_major, 1565 sessions, 2020-09-09 to 2026-08-21
- GOLD: fx_major, 2581 sessions, 2016-08-22 to 2026-08-21
- AUDCAD: crosses, 1565 sessions, 2020-09-09 to 2026-08-21
- AUDCHF: crosses, 1565 sessions, 2020-09-09 to 2026-08-21
- AUDJPY: crosses, 1569 sessions, 2020-09-09 to 2026-08-21
- CADCHF: crosses, 1564 sessions, 2020-09-09 to 2026-08-21
- CADJPY: crosses, 1565 sessions, 2020-09-09 to 2026-08-21
- CHFJPY: crosses, 1565 sessions, 2020-09-09 to 2026-08-21
- EURAUD: crosses, 1565 sessions, 2020-09-09 to 2026-08-21
- EURCAD: crosses, 1565 sessions, 2020-09-09 to 2026-08-21
- EURCHF: crosses, 1565 sessions, 2020-09-09 to 2026-08-21
- EURGBP: crosses, 1565 sessions, 2020-09-09 to 2026-08-21
- EURJPY: crosses, 1565 sessions, 2020-09-09 to 2026-08-21
- GBPAUD: crosses, 1565 sessions, 2020-09-09 to 2026-08-21
- GBPCAD: crosses, 1565 sessions, 2020-09-09 to 2026-08-21
- GBPCHF: crosses, 1565 sessions, 2020-09-09 to 2026-08-21
- GBPJPY: crosses, 1565 sessions, 2020-09-09 to 2026-08-21