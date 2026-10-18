# ONE RANGE FORECAST (results)

Pre-registration: `forge/ONE_RANGE_FORECAST_PREREG.md`. Folds 0–5, OOS 2020-08 → 2026-08, live-type inputs, pinball over 12 rungs ÷ plain σ, 95% date-block intervals.

**Decision: SI/S.** Q1 FAIL, Q2 FAIL.

| test | rows | ratio [95%] | by instrument | HL p75 regime miss |
|---|---|---|---|---|
| Q1 SIX ÷ SI (US4) | 5,972 | 0.9926 [0.9874, 0.9978] | DOW 0.993, NQ 0.989, SPX500 0.984, US2000 1.005 | SIX 2.4pp vs SI 2.7pp |
| diag SIX ÷ SI-US | 5,972 | 0.9910 [0.9855, 0.9963] | DOW 0.994, NQ 0.988, SPX500 0.982, US2000 1.000 | SIX 2.4pp vs SIUS 4.7pp |
| Q2 NQ_SIG ÷ NQ_SI (NQ) | 994 | 1.0019 [0.9972, 1.0075] | NQ 1.002 | NQ_SIG 11.1pp vs NQ_SI 10.6pp |
| descriptive: NQ gamma at D−1 lag | 994 | 1.0036 [0.9985, 1.0094] | NQ 1.004 | NQ_SIG1 11.4pp vs NQ_SI 10.6pp |

Feature coverage: vix_inv 9,926/9,926 US-index rows; front_dear 9,926/9,926 US-index rows; front_calm 9,926/9,926 US-index rows; all_down 9,926/9,926 US-index rows; nq_dw 9,926/9,926 US-index rows; gex_short 1,483/2,481 NQ rows

Sign agreement with the ledger, by fold: {"SIX": {"vix_inv": "6/6", "front_dear": "6/6", "front_calm": "6/6", "all_down": "6/6", "nq_dw": "6/6"}, "NQ_SIG": {"gex_short": "4/4"}, "NQ_SIX": {"vix_inv": "1/4", "front_dear": "4/4", "front_calm": "4/4", "all_down": "1/4", "nq_dw": "4/4"}, "NQ_SIXG": {"vix_inv": "2/4", "front_dear": "4/4", "front_calm": "4/4", "all_down": "2/4", "nq_dw": "4/4", "gex_short": "4/4"}}

