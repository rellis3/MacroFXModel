# max-bias-reverse: what the charts showed when Max picked his side

**EXPLORATORY, not pre-registered.** Owner question 2026-11-14. Aggregates only: his signals are a paid
group's content, so no trade list or prices are stored here.

- Unit: his first signal per instrument per London day, crypto excluded: **57 instrument-days over 21 days** (2026-10-07 to 2026-11-12); gold 10, FX 23, indices 24. Buys 37%.
- Every reading uses only OANDA H1 bars that had closed before he posted (dashboard feed).
- "Agree" = the reading points the same way as his side. 50% = a coin. Above 50% = he follows it; below = he fades it.
- Days are not independent (one view runs across several instruments on a day), so the intervals are too narrow.

| Reading | All: agree (n) [95% CI] | Gold | FX | Indices | R when agree / disagree (all) |
|---|---|---|---|---|---|
| h4_slope (EMA20 rising/falling, 4h) | 84% (57) [73–91] | 90% (10) | 87% (23) | 79% (24) | +0.09 (40) / +0.79 (9) |
| desk_ccy (base bias - quote bias) | 83% (12) [55–95] | 50% (2) | 90% (10) | — (0) | +0.04 (5) / +2.48 (2) |
| h4_trend (close vs EMA20, 4h) | 81% (57) [69–89] | 80% (10) | 87% (23) | 75% (24) | +0.05 (38) / +0.77 (11) |
| ret_24h | 81% (57) [69–89] | 90% (10) | 74% (23) | 83% (24) | +0.39 (40) / -0.58 (9) |
| h1_trend (close vs EMA20, 1h) | 79% (57) [67–88] | 70% (10) | 78% (23) | 83% (24) | +0.14 (39) / +0.51 (10) |
| h4_ema50 (close vs EMA50, 4h) | 77% (57) [65–86] | 70% (10) | 87% (23) | 71% (24) | +0.11 (38) / +0.56 (11) |
| usd_5d (basket, mapped) | 76% (25) [57–89] | 50% (10) | 93% (15) | — (0) | +0.28 (16) / +0.08 (6) |
| prev_day (21:00 UTC to 21:00 UTC) | 72% (57) [59–82] | 80% (10) | 74% (23) | 67% (24) | +0.29 (34) / +0.05 (15) |
| overnight (since 21:00 UTC to post) | 70% (57) [57–80] | 60% (10) | 65% (23) | 79% (24) | +0.24 (34) / +0.17 (15) |
| desk_rating (LONG/SHORT; FLAT = none) | 69% (16) [44–86] | 0% (1) | 71% (7) | 75% (8) | -0.43 (9) / +1.83 (4) |
| ret_20d (480h) | 67% (57) [54–78] | 60% (10) | 70% (23) | 67% (24) | -0.09 (34) / +0.91 (15) |
| usd_overnight (basket, mapped) | 64% (25) [45–80] | 70% (10) | 60% (15) | — (0) | +0.54 (13) / -0.23 (9) |
| ret_5d (120h) | 54% (57) [42–67] | 70% (10) | 57% (23) | 46% (24) | -0.24 (27) / +0.78 (22) |

**Simple chart reader** (majority vote of all the price readings above): agrees with his side 81% of 57 instrument-days [69–89].

**Day-clustered check** (each day weighted once, day bootstrap, 5,000 draws, seed 20261114): his side agrees with the
4h EMA20 slope on **88% of an average day's instruments [80–95%]**, 21 days.

## Reading (exploratory)

- **His daily side is, to a first approximation, the 4-hour trend.** The direction of the 4h EMA20 (rising/falling), the
  4h close vs EMA20, the last 24 hours and the 1h trend each agree with him on 79–84% of instrument-days; a majority
  vote of plain price readings agrees 81%. The 5-day return agrees only 54%, so the trend he follows is the last
  one to two days on H4, not the week.
- **Our desk agrees less**: the desk rating 69% (16 days, since 2026-11-03), the desk's currency view 83% (12).
  The desk is a daily macro view; his side moves with the short-term trend.
- **Where he goes against the 4h trend (9 of 57)** his scored R averaged +0.79 against +0.09 when he went with it.
  That is 9 trades, so it is a lead to watch, not a finding.
- **Self-description vs record**: on stream he says "bias is completely and utterly fundamental… zero price action".
  The record says that whatever he reads, it lands on the 4h trend's side roughly 5 times in 6.
- Limits: 21 days, one regime, all after the 2026-08-21 lockbox date (unavoidable, his signals start 2026-10-07),
  crypto excluded, readings chosen after the owner's hint about the 4h chart. Not a validated result; the
  bias-scoreboard forward record is where an "h4-trend" forecaster would be judged against him.
