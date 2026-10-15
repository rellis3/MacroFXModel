# COG-MEETING-PATH: does the near-term priced Fed path (30-day fed funds strip) give notice of Nasdaq moves?

*Pre-registered 2026-10-15 while the ZQ pull was running, before any ZQ series was loaded. Motivation: C.OG's line uses 3-month contracts, which blend several meetings. 30-day fed funds (CBOT ZQ) price a single calendar month's average rate, so differences between adjacent months isolate the market's expected change at one meeting. Euro side is not testable at this resolution: IBKR lists no 1-month €STR and Euribor serial months only serve about 10 weeks of history each.*

## Data
1-minute IBKR MIDPOINT, CBOT ZQ Oct26 (V6), Nov26 (X6), Dec26 (Z6), Jan27 (F7), Mar27 (H7), pulled back to listing (`analysis/output/stir_1m_meeting/`). Rate = 100 - price, in bp. Resampled to 15-minute bars (right-labelled, last midpoint, at least 5 of 15 minutes). Nasdaq as in COG-LEGS-SESSION (OANDA CFD cache, then futures moves). Window starts where all series in a comparison exist. Bars need every series present; weekends and CBOT-closed stretches dropped.

## Series (fixed now)
- **S_nov** = X6 level (the November average = the rate after the late-October meeting; moves = revisions to that meeting)
- **S_dec** = Z6 - X6 (priced move across the 9 Dec meeting)
- **S_jan** = F7 - Z6 (priced move across the late-January meeting)
- **S_far** = H7 - X6 (cumulative priced move over five months)
Outright levels, not bond-style proxies. A contract's own expiry-month fixing drift inside its month is NOT removed (stated limitation: V6 is excluded for this reason; X6 and later are not yet inside their months).

## Test F1: continuous lead (same structure as the earlier lead grids)
Predictor: change of each series over W in {1 h, 4 h, 24 h}, ending at the bar close (bp). Outcome: Nasdaq log return, percent, over the next H in {1 h, 4 h, 8 h, 24 h}. 4 series x 3 W x 4 H = 48 cells. One OLS per cell (standardised), controls = Nasdaq's previous 1 h and 4 h returns, **standard errors clustered by UTC date**. Explore: start to 2025-10-31. Confirm: 2025-11-03 to 2026-10-14. BH-FDR 10% across the 48 explore p-values.

## Test F2: jump bars
A jump bar is a 15-minute bar where |change of S_dec + S_nov| (sum of the two absolute 15-minute changes) is in the top 2% of that series' values in the previous 60 trading days (causal threshold). Predictor: sign of the net change of S_far in that bar. Outcome: Nasdaq signed return over the next 1 h and 4 h after the bar close, mean over events minus the mean over hour-of-day-matched random bars, day-clustered t. 2 cells; explore/confirm as above; pass if explore |t| > 2.5 and confirm same sign with one-sided p < 0.05.

## Pass rule
F1: result only if FDR-passing in explore AND same sign with one-sided p < 0.05 in confirm. Overall verdict "the priced Fed path gives forward notice" needs at least one F1 or F2 result. Power statement printed with the results (minimum detectable standardised coefficient, day-clustered).

## Placebo and guard
Time-shift placebo: every F1 cell rerun with the predictor series shifted by +30 days of bars (breaks timing, keeps the series' own autocorrelation); report the number of cells passing nominal 5% in explore vs the 2.4 expected. A same-window correlation table (predictor over W vs Nasdaq over the same W) is printed so a leg is shown to behave sensibly before its forward result is read.

## What changes
Pass: the strip read goes on the Rates card next to the C.OG line and into the ledger with a forward paper record. Null: closes the policy-path angle on 3-month vs 1-month grounds; the rates work reverts to context only.
