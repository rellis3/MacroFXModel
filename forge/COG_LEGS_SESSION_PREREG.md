# COG-LEGS-SESSION: does what each leg does in the European morning say anything about Nasdaq's US session?

*Pre-registered 2026-10-15 before any of this was computed. Prompted by the 16-23 Sep video: Monday's move came from the euro leg, in the European morning, while Nasdaq sat flat; the US session followed. Everything earlier tested the combined line over rolling windows (COG-VIDEO-CLAIMS, COG-PINNED-HISTORY, COG-TREND-STATE: all no forward price effect). Not yet tested: the two legs separately, and timing by session.*

## Data
Pinned pair, 1-minute IBKR history resampled to 15 minutes: SOFR Sep26 (SR3U6) and Euribor Mar27 (IH7), rates = 100 - price, **bp changes**. Same day screen as the pinned-history study (at least 3 distinct prices per leg per day). Nasdaq = the series of `scripts/rates_line/build_cog_history.py` (OANDA CFD cache to 2026-08-20, CME NQ futures moves after). Days = Monday-Friday UTC calendar days with all needed bars. 2024-04-15 to 2026-10-14.

## Variables (UTC, fixed; the US cash open is 13:30 or 14:30 UTC depending on season, so outcomes start 14:30)
Predictors, all changes of the 15-minute close:
- **P_asia**: 22:00 (previous day) -> 07:00
- **P_eu**: 07:00 -> 13:00 (the European morning, before US data)

for each of three series: **D_us** (SOFR leg, bp), **D_eu** (Euribor leg, bp), **D_sp** (SOFR minus Euribor, bp).
Outcomes (Nasdaq log return, percent):
- **O1**: 14:30 -> 20:00 (primary, the US session)
- **O2**: 14:30 -> 16:00
- **O3**: 13:00 -> 14:30 is NOT used (contains the 13:30 releases).
For P_asia the outcomes are **O0**: 07:00 -> 13:00 (the European session itself) and O1.

Cells: P_eu x 3 series x {O1, O2} = 6 primary cells; P_asia x 3 series x {O0, O1} = 6 secondary cells. 12 cells total, one test each (Spearman rho and OLS t, standard errors from day-block bootstrap = days are the unit already, so plain SE).

## Split
Explore: 2024-04-15 to 2025-10-31. Confirm: 2025-11-03 to 2026-10-14. Models and thresholds fitted in explore only (none are fitted; the split exists to count a pass).

## Pass rule (registered)
A cell is a result only if: explore |rho| t-stat passes BH-FDR 10% across the 12 cells **and** confirm has the same sign with one-sided p < 0.05. Overall verdict "legs/session carry a forward signal" requires at least one primary cell to pass. Minimum detectable rho at about 250 days per half is ~0.18 (2.8 SE); anything smaller cannot be seen and is reported as underpowered, not as zero.

## Controls
1. **Placebo**: shuffle the Nasdaq outcome across days within the same calendar month, 2000 times; report where the real |rho| sits.
2. **Same-window check**: rho of each predictor with Nasdaq over the SAME window (the known same-bar link), to show the legs are measured correctly and that any forward cell is not just that link persisting.
3. **Control for Asia**: P_eu cells re-run with Nasdaq's P_eu return partialled out (residualised on Nasdaq's own move over the predictor window), because Nasdaq's own morning move is the cheapest predictor of its afternoon.

## What would change what we build
Pass: a session-timed leg read goes on the Rates card as a pre-US-open note and into the evidence ledger, then a forward paper record. Null: closes the session angle and the ledger says so; the line stays a same-hour context line.
