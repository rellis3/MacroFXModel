# GAMMA REGIME TRADES: does the dealer-gamma state tell us when to fade and when to follow, on NQ?

*Pre-registered 2026-10-19, before any number in this file was computed. Build on the dealer-hedging work; the trade
logic is the textbook dynamic-hedging playbook (ours), checked against the shape of C.OG's 2026-10-16 ES example.*

## Why this is new (prior work checked)

- ~20 fade/direction-at-line tests are null (`plans/DATA_AND_INTEGRATION_TRACKER.md` §4), but **none conditioned on
  the gamma regime**. G2 (real): long gamma = quieter next day. ONE_RANGE_FORECAST: the gamma sign adds nothing to the
  *size* of the day beyond the chosen lines. Size is not behaviour: this test asks about behaviour at the lines.
- Walls/flips as levels: null (placebo). Here the levels are the forecast lines and the textbook zero gamma, scored
  against placebo levels.
- C.OG's example (observed, `education/cog-snippets.md` §2): price chopped around the 7,800 wall (pinned), then broke
  down through zero gamma (~7,725) and accelerated to ~7,680. That is the textbook pattern: **fade inside long gamma,
  follow a break into short gamma.** His exact rules are unknown; these are ours.

## Data (all local)

- NQ CFD 1-minute bars (`VolRangeForecaster/data/m1/nas100_usd_m1.parquet`), London sessions 00:00–22:00 London.
- Lines: the live ladder in `analysis/output/forecast_history/NQ.csv` — session open ± `live_oh_*` / `live_ol_*` %
  (p50, p75, p90). Complete sessions only.
- Regime: NQ net GEX sign, `oi_research_book/data/daily_master_near_nas100_usd.parquet` `net_gex_sum` (G2's primary).
- Zero gamma Z: the whole ≤45-DTE book re-priced at hypothetical prices (`oi_research_book/scripts/26_zero_gamma_distance.py`
  `build_z`), futures terms, moved onto the CFD by that day's basis (front future − CFD New York close).
- **Point in time:** regime and Z come from options data dated ≤ two business days before the session (the D−1 book
  is not reliably published before the London open). Window 2020-09 → 2026-08-21 (lockbox).
- **Costs:** 0.01% of price per round trip (~3 NQ points at 29,000). Same-minute stop-and-target = stop.
  Entries 08:00–20:00 London; anything open is closed at 22:00 London. One trade per rule per session.

## Test A — fade or follow at the p75 line, by regime (primary)

On the first touch of the up p75 line or the down p75 line (whichever comes first):
- **FADE:** enter against the touch at the line; stop at that side's p90; target that side's p50.
- **FOLLOW:** enter with the touch at the line; stop at that side's p50; target that side's p90.

Result in R (net of cost ÷ distance to stop). Regime-switch strategy **SW** = FADE on long-gamma days, FOLLOW on
short-gamma days.

**Primary statistic:** the regime interaction I = [FADE(long) − FADE(short)] + [FOLLOW(short) − FOLLOW(long)] in
mean R per trade (positive = the regime tells you which to do). 95% interval by stationary block bootstrap over
sessions (mean block 10, 5,000 reps).

**PASS (all):** I > 0 with interval above 0; SW mean net R > 0 with interval above 0; SW beats both always-FADE and
always-FOLLOW; I > 0 in both halves (≤ 2022-12-31, ≥ 2023-01-01); the placebo regime (GEX sign shifted 125 sessions)
gives |I| below half the real I.
**NULL:** I's interval includes 0 and |I| < 0.10 R. **Otherwise:** MIXED (reported with what failed).

## Test B — follow a break through zero gamma into short gamma (secondary)

Only sessions where Z (on the CFD) is within the day's p90 lines. Which side of Z is short gamma is read off the
re-priced book. On the first 1-minute close that crosses Z from the long-gamma side into the short-gamma side,
enter in the direction of the cross; stop 0.25 σ back on the other side of Z; target 1.0 σ beyond entry
(σ = the session's live daily σ in price). Exit at 22:00 otherwise.

**Placebo:** the identical rule at fake levels Z ± 1 σ (same side structure, same days).
**PASS:** mean net R > 0 with interval above 0, and real − placebo > 0 with interval above 0, n ≥ 60.
**NULL** otherwise if the interval includes 0.

## Decision

- A passes → a shadow forward test (no orders) of SW on NQ first, then a costed bot proposal. The hedging map gets a
  tested "fade / follow today" line.
- B passes → the same, for the zero-gamma break.
- Null → recorded; the map keeps the regime as range context only. A pass would still need re-confirmation on the
  Cboe index + ETF book (the CME book here is ~5% of Nasdaq dealer gamma), which our capture builds from 2026-10-19.

Script `scripts/forecast_history/gamma_regime_trades.py`; output `analysis/output/gamma_regime_trades/`.

## Variant log

| # | Variant | Why | Run? |
|---|---|---|---|
| 0 | as above | registered | run 2026-10-19: A NULL (I +0.092 [−0.18, +0.37]), B NULL (+0.03 R, n 109) |
| 1 | regime and Z must be dated within 4 days of the D−2 cutoff | **audit after variant 0's results**: the ≤45-DTE surface exists only ~132 days a year, and the as-of join carried a regime forward up to 53 days on about half the sessions. A data bug, not a new spec; reported beside variant 0, both kept | yes |

## Results (2026-10-19). Both tests NULL in both variants.

Full tables: `analysis/output/gamma_regime_trades/RESULTS.md` (variant 1) and `RESULTS_v0_stale_regime.md` (variant 0).

| | variant 0 (regime carried forward) | variant 1 (fresh regime only) |
|---|---|---|
| sessions / trades A | 1,483 / 647 | 813 / 353 |
| A: regime interaction I (R) | +0.092 [−0.184, +0.373] | +0.060 [−0.301, +0.439] |
| A: switch strategy, mean R per trade | −0.013 [−0.079, +0.055] | −0.027 [−0.114, +0.064] |
| A: fade / follow on long-gamma days | −0.041 / −0.021 | −0.028 / −0.066 |
| A: fade / follow on short-gamma days | −0.082 / +0.030 | −0.048 / −0.025 |
| A: placebo regime I | +0.208 | +0.017 |
| B: zero-gamma break, mean R (n) | +0.031 (109) | −0.014 (61) |
| B: placebo levels Z ± 1σ | −0.028 | +0.005 |

Every arm loses after costs. The regime tilts the right way in both halves (variant 1: +0.07 / +0.14) but the
interval is ±0.35 R wide: no evidence, and effects up to about ±0.3 R per trade cannot be ruled out. Checks: the
CFD open matches the ladder's open exactly; futures − CFD basis median 34 pts (the ripple study found 33.5).
The book used is CME NQ's ≤45-DTE surface: monthly/quarterly expiries only, ~5% of Nasdaq dealer gamma. A rerun on
the Cboe index + ETF capture is the next fair test, after ~400 days.
