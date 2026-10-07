# Rates residual book: is price "out of line with rates", and does it catch up? (S1–S3)

*Pre-registered 2026-10-07 evening, before any residual was computed. Owner (going to sleep): "continue with research /
analysis / study book style review ... run theories ... find trends". Source of the idea: C.OG's live stream 2026-10-05
(SOFR futures SR3 vs €STR futures plotted against NQ / EURUSD; "you could model the relative noise between EUR/USD and the
yield spread and then the residual will be the data that is more of an outlier ... then build a conditional directional
bias ... x = y − y1"), and his NQ video (rates turned 16:00, confirmed 16:45, NQ low priced later).*

## What is already known (not re-tested)

- A confirmed turn in the US 2y CFD does NOT lead NQ on M15 (54.1% vs base 54.1%; deskEvidence rates-pivot entry).
- DE−US 10y spread does not lead EURUSD by hours (lead_lag_studies L1); rates and price move in the SAME bar (+0.23 M15).
- Daily: a pair detached from its 10y spread does not tend to be the leg that closes the gap.
Those tested LAGGED RETURNS or daily gaps. Not tested: the INTRADAY GAP between price and its rates-implied path. If price
follows rates with a variable lag, the gap carries the lead without anyone needing to know the lag.

## Data

OANDA M15 mid closes 2018-01 → 2026-10 (`scripts/rates_residual/fetch.py`). Bond CFDs USB02Y, USB05Y, USB10Y, USB30Y,
DE10YB (Bund 10y), UK10YB (Gilt 10y). No short-rate futures (SR3/€STR/Euribor) — not available to us yet; this book uses the
bond legs and says so. A later SR3/€STR export drops into the same harness.

## S1 — natural driver residual (primary)

Targets and their fixed drivers (15-min log returns):

| target | drivers |
|---|---|
| EURUSD | USB02Y, USB10Y, DE10YB |
| GBPUSD | USB02Y, USB10Y, UK10YB |
| USDJPY | USB02Y, USB10Y |
| XAUUSD | USB02Y, USB10Y |
| NAS100 | USB02Y, USB10Y |
| SPX500 | USB02Y, USB10Y |

- Bars: timestamps where target and every driver have a close; a return is used only when both its bars are consecutive
  15-min slots (no gap returns).
- β: OLS of target return on driver returns over the previous 20 trading days, refitted once per UTC day using data strictly
  before that day.
- At each bar t: **implied move** I = Σ over the last K = 16 bars (4 h) of β·x; **own move** O = Σ of the target's returns
  over the same bars. Both divided by σ_K = (target 15-min σ over the previous 20 days) × √K.
- **Forward** F = target log return from close t to close t+16 (4 h) ÷ σ_16. Sampled every 16 bars (non-overlapping).
- **Primary statistic:** b in F = a + b·I + c·O (pooled over the six targets; per target reported). b > 0 means price
  catches up with what rates already did; c is the target's own short-term reversal/momentum, controlled for.
- **Gap trade (reported, not deciding):** when |I − O| > 1.5, position sign(I − O) for 4 h; mean net return after
  `costForPair` round trip.

**PASS S1:** pooled b > 0 with its 95% day-block bootstrap interval above 0; b > 0 in both halves (2018-01 → 2022-04,
2022-05 → 2026-10); b > 0 on at least 4 of 6 targets; and real b above the 95th percentile of 200 placebo runs in which
every driver series is shifted by a random whole number of days (≥ 20) before the β fit.

## S2 — "out of line with everything" (PCA residual)

Same as S1, but the implied move comes from all the OTHER instruments in the set (17, excluding the target): each day,
PCA on their previous-20-day returns, keep 3 components, regress the target on them, implied move = fitted value summed over
K. Same statistic, same PASS rules (placebo shifts all the others by one common random offset).

## S3 — the gap as the direction at C.OG's lines

C.OG setup trades from `analysis/output/cog_yield_dir/trades.csv` (A = fade at his median, C = continue through it;
EURUSD, GOLD, NQ) with fills inside the M15 coverage (2018-01 → 2026-08). At the fill, the gap g = I − O of the last
COMPLETED 15-min bar (S1 drivers; NQ trades use NAS100's). Keep a trade when sign(side) = sign(g) and |g| > 0.5 (price is
behind rates in the trade's direction).

**PASS S3:** kept-trades mean net R > 0 with 95% month-block interval above 0; kept minus all (same setups, same period)
interval above 0; positive in both halves. Reported: A and C separately, per instrument, the opposite filter.

## Stopping rule

One logged variant per study at most (e.g. K = 4 if K = 16 fails only on power). Output
`analysis/output/rates_residual/RESULTS.md`; scripts `scripts/rates_residual/`.
