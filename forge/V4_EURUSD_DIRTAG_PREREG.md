# today.html direction tag — 6-year EURUSD replay (pre-registration)

Committed 2026-09-29 before any number was computed.

## What is replayed
`js/directionTag.js` — the ▲/▼/◆ tag on today.html's pair cards — with its three
DRIVERS and the range-used cap, fed exactly as the live page feeds them:

- **HMM regime:** `hmm.js` `fitHMM` on log returns of the last 201 daily closes
  (17:00-New-York days, `fetchDailyCandles` in production). Mapped as today.html's
  `directionFor` does: label, trendDir, trendProb, trendConfident, reliable.
- **Structural travel:** `js/travelRead.js` on the same closes.
- **Today's tape:** `computeSessionMetrics`' bias rule (js/volForecastScheduler.js)
  from London midnight, with O-H/O-L measured against the day's fitted ladder O-H/O-L
  p50 (js/voteAtlasV4Lines.js ladder), and `dir` = |O-C| ÷ H-L × 100.
- **Range used:** H-L so far ÷ ladder H-L p50.

The MODIFIERS (COT, macro, carry, OI) are NOT replayed. They can only downgrade the
tag and cannot be rebuilt cleanly point-in-time. So this tests the tag's direction
engine, not every downgrade the live card applies.

Causality: daily closes used are only those whose NY day had closed before the
London-midnight open; tape and range-used use only M1 bars completed before the moment
evaluated. The builder self-checks the tag against a future-scrambled series.

## Period
EURUSD London days 2020-09-29 → 2026-09-28. Halves: **H1 < 2024-09-29 ≤ H2**
(the same split as Stage 1). No parameter is fitted; both halves are out-of-sample for
a rule that is fixed here.

## Test A — does the tag call the day?
Evaluate the tag at **08:00 London** (first M1 bar at or after 08:00 Europe/London),
using bars before it. If the direction is up/down, score the move from that bar's open
to the London day's last close: hit if the sign matches. Report the hit rate on all
directional days and on `strong` days, per half, with a two-sided binomial test vs 50%.

**Pass A:** hit rate > 50% with p < 0.05 in BOTH halves.

## Test B — does trading the forecast lines in the tag's direction make money?
Every first touch of every export line (Stage 1's 6,243 touches), with the tag
evaluated at the touch (bars before the touch bar). If the tag is up or down, take the
trade in the TAG'S direction: follow if the line is on the tag's side (an up-line with
tag up), fade if it is on the other side (an up-line with tag down). Skip if the tag is
flat or mixed. Outcome and cost are as Stage 1 (±0.5σ barriers, from the next bar).
Also reported: `strong`-only, and the opposite rule (against the tag).

**Pass B:** the with-tag rule has net R > 0 in BOTH halves AND t ≥ 2 on H2.
