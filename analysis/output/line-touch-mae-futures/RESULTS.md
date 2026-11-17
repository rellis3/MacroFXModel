# MAE / MFE at every touch of the vol lines — CME futures (NQ, 6E, GC)

Register row `line-touch-mae-futures`. EXPLORATORY, descriptive. Owner question 2026-11-17, prompted by Jordan asking
"how do you set your SL/TP — share your MAE analysis (futures)". Nothing here is scored or pre-registered.

Scripts: `scripts/line-touch-mae-futures/build.py` (per-touch rows → `touches.parquet`, gitignored, ~3 min) and
`summarize.py` (→ `tables/by_touch.csv`, `by_weekday.csv`, `by_hour.csv`, all horizons, p25/p50/p75/p90).

## Setup

- **Lines:** production OH / OL p50, p75, p90 (% of open) per London day, point-in-time from the day-reconstruction
  archive, applied to the futures contract's own 00:00 London open. NQ ← NQ, EURUSD ← 6E, GOLD ← GC (NT8 continuous,
  unadjusted, stamps moved back one minute because NT8 bars are end-stamped).
- **Window:** London 00:00 → 22:00 weekdays, 2016-03 → 2026-08-20 (lockbox untouched). Days with < 90% of bars
  skipped: NQ 164 of 2,687, 6E 462 of 2,697, GC 841 of 2,684 (GC/6E files still have the NT8 download holes,
  DATA_SPEC #24; GC numbers rest on ~69% of days).
- **Touch n:** first bar reaching the line while armed; the line re-arms once price trades 0.1σ back on the open side.
  Touch 2 = price came back to the line after pulling away at least 0.1σ.
- **Each touch is measured on its own,** from the line price at its own touch bar (no spread, no slippage):
  - *through* = furthest move beyond the line (touch direction), *back* = furthest move back toward the open.
  - Fade: MFE = back, MAE = through. Continue: the same two numbers swapped.
  - Horizons: 30 / 60 / 240 min and to 22:00 (MFE/MAE keep growing with time, so they need an end point).
- **Units:** NQ index points, 6E pips, GC dollars. Typical day σ (median): NQ 146 pts, EURUSD 48 pips, gold $14.6.
- **Placebo:** the same ladder ×0.85 and ×1.15 (arbitrary prices at a similar distance).
- 118,664 touch rows in all, of which forecast-line touches: NQ 14,724, EURUSD 12,541, GOLD 11,590 (rest placebo).

## What it shows

**1. Back vs through is a coin flip at every touch number.** Share of touches where the move back toward the open beat
the move through the line, 60 min:

| | touch 1 | touch 2 | touch 3 | touch 4+ |
|---|---|---|---|---|
| NQ p50 | 48.6% | 50.4% | 50.9% | 50.8% |
| NQ p75 | 47.0% | 49.2% | 52.0% | 50.2% |
| NQ p90 | 44.2% | 44.0% | 41.5% | 43.9% |
| EURUSD p50 | 50.3% | 49.4% | 48.4% | 49.2% |
| EURUSD p75 | 51.0% | 48.5% | 47.7% | 52.2% |
| GOLD p50 | 51.4% | 48.2% | 49.8% | 49.8% |
| GOLD p75 | 52.2% | 50.6% | 49.0% | 47.9% |

Point-in-time era only (2020-08-21 on): NQ 49.3%, EURUSD 49.3%, GOLD 50.2%. NQ p90 leans *through* (41-44%): the
up-drift, the same asymmetry every earlier NQ fade test found.

**2. Typical excursions after a touch (60 min, median / 75th / 90th):**

| touch 1 | fade MFE (back) | fade MAE (through) |
|---|---|---|
| NQ p50 (n 2,576) | 18 / 44 / 91 pts | 20 / 48 / 96 pts |
| NQ p75 (n 1,290) | 22 / 52 / 97 pts | 25 / 57 / 107 pts |
| NQ p90 (n 495) | 22 / 53 / 93 pts | 26 / 56 / 100 pts |
| EURUSD p50 (n 2,251) | 8.2 / 14.4 / 24.2 pips | 8.3 / 16.1 / 28.8 pips |
| EURUSD p75 (n 1,131) | 9.3 / 17.4 / 28.5 pips | 9.2 / 17.4 / 30.2 pips |
| GOLD p50 (n 1,944) | $2.4 / 5.1 / 10.0 | $2.4 / 5.4 / 10.9 |
| GOLD p75 (n 985) | $3.2 / 6.5 / 12.3 | $3.1 / 6.2 / 13.2 |

To 22:00, touch 1 p50: NQ 55 / 135 / 246 pts back vs 58 / 136 / 248 through; EURUSD 21 / 43 / 71 vs 24 / 43 / 67 pips;
gold $7.4 / 15 / 28 vs $7.1 / 16 / 29. MFE and MAE are the same size: the distribution is symmetric about the line.

**3. Later touches look like first touches.** Medians move by a few points or pips between touch 1 and touch 4+ (NQ p50
60 min: 18 → 26 pts back, 20 → 25 through, both growing together).

**4. Line ≈ placebo.** Touch 1, 60 min, median back / through in σ: NQ p75 0.172 / 0.205 at the line vs 0.171 / 0.201
(×0.85) and 0.187 / 0.215 (×1.15). Every instrument and rung sits between its two placebo ladders.

**5. Weekday and hour change size, not direction.** Back-wins share 48-53% on every weekday. By London hour the size
roughly doubles into 13:00-15:00 (NQ 14:00 median 34 / 36 pts vs 13-20 pts in the morning; EURUSD 13:00 11 / 12 pips vs
7 off-peak). A few thin hour cells drift to 55-59% (NQ 09-11 London, gold 04:00, n 160-320 each); with ~60 hour cells,
±5pp at n 300 is what noise gives, so these are not findings.

## Reading

On futures, the forecast lines are a ruler for how far price travels after a touch, not a signal for which way. That
matches the CFD work (day-reconstruction M7, nq-futures-line-race: futures = CFD). For setting stops and targets the
useful part is the size table: e.g. a NQ p75 fade with a 57-pt stop (75th pct MAE) is hit by about a quarter of touches
within the hour, and the 75th pct MFE (52 pts) is about the same distance, so the stop and target are reached about
equally often.

Not done here: spread/commission, a stop-and-target race (which is hit first), touch-to-next-event horizons.
