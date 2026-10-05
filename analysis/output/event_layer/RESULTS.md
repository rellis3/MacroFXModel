# EVENT-LAYER — results

Pre-registration: `forge/EVENT_LAYER_PREREG.md`.

## indices — **FAIL**

Train before 2022-07-29. Test pinball (IV + events) ÷ (IV only): median **1.0015**, better on **33%**. Joint β (std): {'iv_sig': 0.1783, 'ev_size': 0.0452, 'surp_prev': -0.0057}.

| instrument | B÷A |
|---|---|
| DE30 | 1.0027 |
| DOW | 0.9929 |
| NQ | 1.0006 |
| SPX | 0.9941 |
| UK100 | 1.0185 |
| US2000 | 1.0024 |

| test days | n | A p75 exceed | B p75 exceed |
|---|---|---|---|
| top-decile ev_size | 1018 | 0.316 | 0.232 |
| surp_prev>=2 | 327 | 0.235 | 0.239 |
| no release, no surprise | 2222 | 0.222 | 0.228 |
| all | 6050 | 0.246 | 0.244 |

Release types with a non-zero train effect: 26. Widest: {'ism manufacturing pmi': 0.072, 'personal income': 0.073, 'markit manufacturing pmi flash': 0.084, 'markit services pmi flash': 0.084, 'fed chair powell testimony': 0.093, 'fed press conference': 0.113, 'building permits level': 0.142, 'president trump statement on coronavirus': 0.364}. Quietest: {"speech by fed's chair powell": -0.09, 'jolts job openings': -0.09, 'inflation rate year-over-year': -0.032, 'core inflation rate year-over-year': -0.028, 'retail sales month-over-month': -0.026}.

## fx_gold — **PASS**

Train before 2022-12-07. Test pinball (IV + events) ÷ (IV only): median **0.9695**, better on **100%**. Joint β (std): {'iv_sig': 0.1332, 'ev_size': 0.0674, 'surp_prev': -0.0149}.

| instrument | B÷A |
|---|---|
| AUDUSD | 0.9573 |
| EURUSD | 0.9585 |
| GBPUSD | 0.9774 |
| GOLD | 0.9825 |
| USDCAD | 0.9757 |
| USDCHF | 0.9677 |
| USDJPY | 0.9695 |

| test days | n | A p75 exceed | B p75 exceed |
|---|---|---|---|
| top-decile ev_size | 817 | 0.455 | 0.289 |
| surp_prev>=2 | 223 | 0.215 | 0.265 |
| no release, no surprise | 2405 | 0.184 | 0.21 |
| all | 6554 | 0.239 | 0.227 |

Release types with a non-zero train effect: 28. Widest: {'building permits level': 0.079, 'payroll jobs growth': 0.101, 'claimant count change': 0.108, 'ism non-manufacturing pmi': 0.117, 'inflation rate year-over-year': 0.121, 'core inflation rate year-over-year': 0.131, 'fed press conference': 0.239, 'president trump statement on coronavirus': 0.309}. Quietest: {'durable goods orders month-over-month': -0.007, 'gfk consumer confidence index': 0.009, 'fomc meeting minutes': 0.01, 'personal income': 0.019, 'markit manufacturing pmi flash': 0.035}.

## Data

- calendar Major rows (USD/EUR/GBP, to 2026-07-02): 5189
- NQ: 2537 sessions to 2026-07-02
- SPX: 2537 sessions to 2026-07-02
- DOW: 2537 sessions to 2026-07-02
- US2000: 2537 sessions to 2026-07-02
- DE30: 2494 sessions to 2026-07-02
- UK100: 2480 sessions to 2026-07-02
- EURUSD: 2581 sessions to 2026-07-02
- GBPUSD: 2571 sessions to 2026-07-02
- USDJPY: 2571 sessions to 2026-07-02
- GOLD: 2534 sessions to 2026-07-02
- AUDUSD: 2039 sessions to 2026-07-02
- USDCAD: 2039 sessions to 2026-07-02
- USDCHF: 2039 sessions to 2026-07-02