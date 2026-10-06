# STEP A — pick ONE forecast (results) — VARIANT 1, live-type implied vol

Pre-registration: `forge/FORECAST_PICK_PREREG.md`. Walk-forward folds 0–5, out-of-sample 2020-08 → 2026-08; widths refit per fold for every candidate; pinball over 12 rungs ÷ plain σ; 95% date-block intervals. Eligible = beats plain (interval below 1), regime miss no worse, no class worse by > 0.5%.

**Decision (fixed in advance): SI for the IV instruments, S elsewhere.** SI eligible: True; SI better than S by 1.57% (needs > 0.5%).

SI ÷ S by instrument: AUDUSD 0.988, DE30 0.992, DOW 0.965, EURUSD 0.993, GBPUSD 0.989, GOLD 0.984, NQ 0.975, SPX500 0.972, UK100 1.001, US2000 0.981, USDCAD 0.980, USDCHF 0.981, USDJPY 0.997

## The 13 instruments with implied vol (18,283 instrument-sessions, 1,555 dates)

| candidate | pinball ÷ plain [95%] | HL p75 quiet / normal / busy % | regime miss pp | worst class | eligible |
|---|---|---|---|---|---|
| plain export | 1.0000 [1.0000, 1.0000] | 30.0 / 22.9 / 18.8 | 6.2 | 1.0000 | — |
| persistence | 0.9794 [0.9722, 0.9857] | 24.0 / 22.1 / 23.2 | 2.9 | 0.9879 | yes |
| persistence + IV | 0.9640 [0.9540, 0.9730] | 23.8 / 23.1 / 26.2 | 1.9 | 0.9763 | yes |

**Pick: persistence + IV**

