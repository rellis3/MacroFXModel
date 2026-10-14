# COG-VIDEO-CLAIMS: C.OG's two described setups on his identified line, 15 min to 48 h

*Pre-registered 2026-10-14, before these events or the 8 h / 48 h horizons were computed on the identified line. Source: the
transcript of "Macro Variable Context Relevance" (16–23 Sep 2026) and the frames of the video. The line is identified and reproduced
(`analysis/output/cog_video_0918/RECONSTRUCTION.md` §10–12): (SOFR Sep26 − Euribor Mar27) in bp × 0.1 + 1.445, 15-min close, EMA 2,
value drawn at bar-open time. Earlier lead tests used 1–24 h and other event definitions; this uses his own, with 8 h and 48 h added.*

## What he describes (his words, ours in brackets)
1. **Friday 18 Sep, swing low.** "Key low … at 4" (16:00 UK = 15:00 UTC), "at 4:45 we could confidently say that is an inflection
   point", NASDAQ "turning point priced in" at ~5:15 UK (16:15 UTC). The confirmation lag (45 min) must not be looked past.
2. **Monday 21 Sep, divergence.** The line rises for hours while Nasdaq "is consolidating and mean reverting" (02:15 → 14:15 UK);
   "at 215 … when this has stopped … we then see big upward growth on the NASDAQ".
3. Targets he names: **direction and volatility**; "R squared, t-stats, p-values, then IC".

## Data
Legs 1-min MIDPOINT (SR3U6, IH7), 2026-04-13 → 10-09, 15-min bars, bar-open labels; Nasdaq = stitched CME NQ (rolls 7 days before expiry).
Explore 2026-04-13 → 07-17, confirm 07-20 → 10-09. Day-clustered inference. Bars with a missing leg or Nasdaq are dropped.

## Family F1: continuous lead (direction and volatility)
- x = change of the line over W ∈ {15 min, 1 h, 4 h}, standardised by prior-day-only RMS; |x| for volatility.
- y = Nasdaq log return over H ∈ {15 m, 30 m, 1 h, 2 h, 4 h, 8 h, 24 h, 48 h} (direction); log of forward realised vol ÷ trailing same-hour
  average (volatility; vs |x|). 3 × 8 = 24 direction cells, 24 volatility cells.
- Statistic: correlation, day-clustered t; also **IC** (rank correlation). Explore |t| ≥ 2.5 carried; confirm sign fixed, one-sided 5 %.

## Family F2: his Friday event (swing, confirmed, then act)
- Swing low (high) at bar t: line(t) is the lowest (highest) of the last K bars, K ∈ {16, 32, 96} (4 h, 8 h, 24 h), and the next 3 bars all
  close above (below) it. **The signal fires at t + 3** (45 min), never earlier.
- y = Nasdaq signed return from the fire bar over H ∈ {1, 2, 4, 8, 24, 48 h} (+ after a low, − after a high); and |return| for volatility.
- Baseline: 1,000 draws of the same number of fire bars matched on hour of day, within the half. 3 × 6 = 18 direction, 18 volatility cells.

## Family F3: his Monday event (line moves, Nasdaq doesn't)
- D = z(line change over L) − z(Nasdaq change over L), L ∈ {4 h, 8 h, 12 h}; y = Nasdaq return over H ∈ {1, 2, 4, 8, 24, 48 h}. 18 cells,
  correlation as F1; plus the conditional mean after |D| ≥ 2 vs matched random bars.

## Descriptive case studies (no pass weight)
Friday: time of the line's low, of its 45-min confirmation, and of Nasdaq's low that afternoon. Monday: line vs Nasdaq change 01:15 → 13:15 UTC.

## Reading rule
Per family: BH-FDR 10 % within the family in explore; confirm sign-fixed one-sided p < 0.05 (and for F2, mean after 1.5 NQ-point cost > 0).
A family PASSES if a cell survives both. Power first: planted leads of ρ = 0.03 / 0.05 / 0.08 / 0.12 in F1 (explore); a null with detection ≥ 50 %
at ρ = 0.08 is "genuinely nothing"; otherwise "insufficient data". No cells added after the first number.

Script `scripts/rate_diff_nq/cog_video_claims.py`; output `analysis/output/cog_video_0918/VIDEO_CLAIMS.md`; ledger `cog-video-claims`.
