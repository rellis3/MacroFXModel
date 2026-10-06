# IV-adjusted daily ladder — calibration on live-type inputs

Re-check of COMBINED-RANGE / CROSS-IV with the inputs the live export uses (OANDA D1 σ; VIX/VXN close; CME constant-maturity 30d ATM IV; GVZ; crosses from the legs). First 60% fit, last 40% scored; pass rule as pre-registered (median H-L p50+p75 pinball B÷A < 0.98 and B better on ≥ 60%).

## indices — PASS

Split 2022-08-23. Elasticity k: 0.655 (train) / 0.676 (all data, exported). Median B÷A **0.9223**, B better on **100%**.

| DE30 | DOW | NQ | SPX | UK100 | US2000 |
|---|---|---|---|---|---|
| 0.934 | 0.8953 | 0.9197 | 0.9137 | 0.9345 | 0.9248 |

| rung | target | A exceed | B exceed |
|---|---|---|---|
| hl_p50 | 50% | 53.2% | 51.0% |
| hl_p75 | 25% | 25.8% | 24.7% |
| hl_p90 | 10% | 9.3% | 8.8% |
| oc_p50 | 50% | 51.2% | 51.7% |
| oc_p75 | 25% | 26.5% | 25.3% |
| oc_p90 | 10% | 10.0% | 9.7% |
| oh_p50 | 50% | 50.2% | 50.2% |
| oh_p75 | 25% | 26.7% | 26.5% |
| oh_p90 | 10% | 12.2% | 11.1% |
| ol_p50 | 50% | 51.6% | 51.0% |
| ol_p75 | 25% | 24.9% | 24.5% |
| ol_p90 | 10% | 8.6% | 8.3% |

## fx_major — PASS

Split 2024-01-15. Elasticity k: 0.784 (train) / 0.76 (all data, exported). Median B÷A **0.9527**, B better on **100%**.

| AUDUSD | EURUSD | GBPUSD | GOLD | USDCAD | USDCHF | USDJPY |
|---|---|---|---|---|---|---|
| 0.9359 | 0.9574 | 0.9594 | 0.9208 | 0.927 | 0.9527 | 0.9668 |

| rung | target | A exceed | B exceed |
|---|---|---|---|
| hl_p50 | 50% | 45.7% | 44.7% |
| hl_p75 | 25% | 23.4% | 22.8% |
| hl_p90 | 10% | 10.1% | 9.8% |
| oc_p50 | 50% | 49.0% | 48.5% |
| oc_p75 | 25% | 23.4% | 23.4% |
| oc_p90 | 10% | 9.4% | 9.5% |
| oh_p50 | 50% | 48.9% | 48.4% |
| oh_p75 | 25% | 24.8% | 24.6% |
| oh_p90 | 10% | 10.4% | 9.9% |
| ol_p50 | 50% | 46.2% | 45.5% |
| ol_p75 | 25% | 23.7% | 23.5% |
| ol_p90 | 10% | 9.5% | 9.6% |

## crosses — PASS

Split 2024-04-03. Elasticity k: 0.641 (train) / 0.648 (all data, exported). Median B÷A **0.9692**, B better on **100%**.

| AUDCAD | AUDCHF | AUDJPY | CADCHF | CADJPY | CHFJPY | EURAUD | EURCAD | EURCHF | EURGBP | EURJPY | GBPAUD | GBPCAD | GBPCHF | GBPJPY |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.9365 | 0.9523 | 0.9692 | 0.92 | 0.9631 | 0.9743 | 0.9752 | 0.9648 | 0.9806 | 0.9758 | 0.9806 | 0.944 | 0.9712 | 0.9522 | 0.9764 |

| rung | target | A exceed | B exceed |
|---|---|---|---|
| hl_p50 | 50% | 47.0% | 46.0% |
| hl_p75 | 25% | 24.5% | 23.6% |
| hl_p90 | 10% | 10.9% | 10.9% |
| oc_p50 | 50% | 48.4% | 48.2% |
| oc_p75 | 25% | 24.4% | 24.0% |
| oc_p90 | 10% | 9.6% | 9.6% |
| oh_p50 | 50% | 50.5% | 50.6% |
| oh_p75 | 25% | 24.0% | 23.3% |
| oh_p90 | 10% | 9.5% | 9.5% |
| ol_p50 | 50% | 47.4% | 47.2% |
| ol_p75 | 25% | 23.8% | 24.0% |
| ol_p90 | 10% | 10.2% | 9.9% |

## us_extras — PASS

Split 2022-08-23. Elasticity k: None (train) / None (all data, exported). Median B÷A **0.9675**, B better on **75%**.

| DOW | NQ | SPX | US2000 |
|---|---|---|---|
| 0.9837 | 0.9512 | 0.9362 | 1.013 |

| rung | target | A exceed | B exceed |
|---|---|---|---|

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