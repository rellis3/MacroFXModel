# Macro state, H1/H4 trend state and weekday at the vol lines — pre-registration

Committed 2026-10-02 before any number below was computed. From the outside question bank (Q1, Q6, Q7, Q10). All on the
Fade/Continue Book passes (16 FX/gold + 6 indices), same races and net R.

## A — macro state (free daily series, all read with a publication lag)
Series (analysis/output/rangebook/macro/, pulled 2026-10-02): FRED DFII10 (10y real yield), DGS10, DGS2, BAMLH0A0HYM2 (HY
credit spread), DTWEXBGS (broad dollar), VIXCLS; Yahoo DX-Y.NYB daily close (DXY). For a London day D, FRED series use the
latest observation dated ≤ D−2 (H.15 publishes next business day); DXY and VIX closes dated ≤ D−1. Signal = 5-observation
change at that reference date; a change counts only if |change| ≥ the median |5-obs change| of the prior 252 observations.
Bullish sign per instrument (fixed): gold ← real yield DOWN, DXY DOWN; USD-quote FX pairs (EURUSD, GBPUSD, AUDUSD, NZDUSD)
← DXY DOWN, USD-base pairs (USDJPY, USDCAD, USDCHF) ← DXY UP; indices ← DGS10 DOWN, HY spread DOWN, VIX DOWN.
"Macro with the touch" = the qualifying change points the way the touch is heading; "against" = the other way.
Tests per (set × series): T1 within-cell (line family × London hour × range used) continue difference with − against,
day-bootstrap 95% CI, same sign in 2016–22 and 2023–26. T2: follow R when with, fade R when against, > 0 both halves,
Benjamini–Hochberg 10% across all A + C rows. Sets: gold; 4 US indices (NQ, SPX, DOW, US2000); 7 USD pairs.

## B — H1 / H4 trend state (Q1)
From clock-aligned H1 and H4 bars completed before the pass bar: EMA20 and EMA50 of closes. Trend up = close > EMA20 >
EMA50; down = close < EMA20 < EMA50; else neutral. States for a touch of an UP line: H4 up → "with-trend break candidate";
H4 down → "counter-trend touch" (fading it is a with-trend pullback entry); mirror for down lines. Reported for H4 and H1
separately. T1: continue difference, H4-with vs H4-against. T2: FADE R when the touch is counter to the H4 trend (the
with-trend pullback), FOLLOW R when with it; > 0 both halves; BH with A. The 5-day-trend version of this was null
(forge/CONFLUENCE_LEVELS_PREREG.md); this is the intraday-timeframe version.

## C — weekday (Q10)
Continue rate and follow/fade R by weekday; Tue–Wed vs other days as the test row (post-COT-release window). Same T1/T2.
