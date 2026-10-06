# Step 0 — forecast history: checks

Spec: `forge/FORECAST_HISTORY_SPEC.md`. Causality (check 2): `node scripts/forecast_history/causality_check.mjs`.

**FAILURES** (reproduction, fold boundaries, sanity) across 34 instruments, 91,517 sessions, 52,776 out-of-sample.

- SPX500: reproduction diff 0.68

SPX500 note: the reference file (`analysis/surfaces/ladder_calibration/SPX500.csv`, 2026-10-05 08:32) predates the SPX500 -> SPX params alias (2026-10-05 evening); sigma matches exactly, widths differ because the table now uses the fitted SPX widths, as the live page does. Not a table fault.

| inst | sessions | first | last | out-of-sample | oos from | calendar unknown | sessions ending before 20:00 | reproduction |
|---|---|---|---|---|---|---|---|---|
| AUDCAD | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| AUDCHF | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| AUDJPY | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| AUDNZD | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| AUDUSD | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| CADCHF | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| CADJPY | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| CHFJPY | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| DE30 | 2641 | 2016-03-30 | 2026-08-19 | 1529 | 2020-08-20 | 34 | 0 | 2641 days, max |diff| 0 |
| DOW | 2687 | 2016-03-29 | 2026-08-20 | 1550 | 2020-08-24 | 35 | 84 | 2687 days, max |diff| 0 |
| EURAUD | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| EURCAD | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| EURCHF | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| EURGBP | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| EURJPY | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| EURNZD | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| EURUSD | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| GBPAUD | 2696 | 2016-03-29 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2696 days, max |diff| 0 |
| GBPCAD | 2696 | 2016-03-29 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2696 days, max |diff| 0 |
| GBPCHF | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| GBPJPY | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| GBPNZD | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 1 | 2697 days, max |diff| 0 |
| GBPUSD | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| GOLD | 2684 | 2016-03-29 | 2026-08-20 | 1547 | 2020-08-24 | 35 | 81 | 2684 days, max |diff| 0 |
| NQ | 2687 | 2016-03-29 | 2026-08-20 | 1550 | 2020-08-24 | 35 | 88 | 2687 days, max |diff| 0 |
| NZDCAD | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| NZDJPY | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| NZDUSD | 2698 | 2016-03-28 | 2026-08-20 | 1556 | 2020-08-24 | 35 | 0 | 2698 days, max |diff| 0 |
| SPX500 | 2687 | 2016-03-29 | 2026-08-20 | 1550 | 2020-08-24 | 35 | 86 | 2687 days, max |diff| 0.68 |
| UK100 | 2626 | 2016-03-30 | 2026-08-19 | 1514 | 2020-08-20 | 34 | 20 | 2626 days, max |diff| 0 |
| US2000 | 2687 | 2016-03-29 | 2026-08-20 | 1550 | 2020-08-24 | 35 | 93 | 2687 days, max |diff| 0 |
| USDCAD | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| USDCHF | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |
| USDJPY | 2697 | 2016-03-28 | 2026-08-20 | 1555 | 2020-08-24 | 35 | 0 | 2697 days, max |diff| 0 |

Causality (check 2): **15/15 unchanged** (EURUSD, GOLD, NQ × 5 dates; rebuilt from M1 cut at each session's open).
