# COG-INDICATOR-OPTIONS: do the settings in C.OG's indicator hide a forecasting read?

*Pre-registered 2026-10-15 before computing. Source: `pine/C.OG — Euribor vs SOFR Rate Spread.txt` (his indicator).*

## Which options can carry information
- **Cannot** (linear or cosmetic, so every correlation, lead-lag and turn test is unchanged by them): invert sign, basis points, scale, offset, manual mapping, price source (open/high/low/hl2/ohlc4 only moves the sample point inside a bar), convert price to rate.
- **Already tested**: contract choice (pinned pair, same-expiry pairs, strips, 2y; STIR-COMPOSITE, RATE-CURVE-STRUCTURE), and the **Lead** option (it draws the line N days to the right; "line leads Nasdaq by N days" is exactly the lead grid 15 min to 48 h in COG-VIDEO-CLAIMS and COG-PINNED-HISTORY: null).
- **Can** (nonlinear or windowed, so they change what the eye sees): **Smoothing (EMA length)** and its slope; **Auto-fit mapping** (rescales the line to the chart's high-low over a lookback, which is the line's *position inside its own recent range*, a stochastic); the same idea as a z-score. These are the only options not yet tested. This study tests them.

## Features (causal, 15-minute bars, bp, close-labelled; pinned pair SR3U6 - IH7, 2024-04-15 to 2026-10-14, same day screen as before)
- **pos_L**: (x - min over L bars) / (max - min), L in {96, 480, 1920} (1, 5, 20 days)  [his Auto-fit]
- **z_L**: (x - rolling mean) / rolling std, same L
- **slope_(f,s)**: (EMA_f - EMA_s) of x divided by the rolling std of 15-minute changes over 480 bars, (f,s) in {(8,32), (32,128)}  [his Smoothing, read as slope]
Total 8 features. Bars need the whole window with at least 60% of bars present.

## Outcomes
Nasdaq (CFD cache, then futures moves: as in COG-LEGS-SESSION) log return from the feature bar's close over the next H bars, H in {4, 16, 32, 96} (1 h, 4 h, 8 h, 24 h), in percent. 32 cells.

## Test
One OLS per cell of the outcome on the feature (both standardised), with controls for Nasdaq's own previous 4-bar and 16-bar returns (the cheapest competing predictor), standard errors clustered by UTC date. Explore 2024-04-15 to 2025-10-31; confirm 2025-11-03 to 2026-10-14. BH-FDR 10% across the 32 explore p-values.

## Pass rule
Result only if it passes FDR in explore **and** the confirm coefficient has the same sign with one-sided p < 0.05. An overall "the options hide a forecast" needs at least one result. With about 40 000 / 20 000 bars but only ~400 / ~230 days, minimum detectable standardised coefficient is about 0.03 per feature-sd (2.8 SE of day-clustered); smaller is underpowered, not zero.

## What changes
Pass: feature goes on the Rates card with a forward paper record. Null: the indicator's options are closed, ledger entry says so.
