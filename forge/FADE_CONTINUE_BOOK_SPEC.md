# The Fade / Continue Book — specification

Committed 2026-09-30 before the book's numbers were computed. This is the owner's original goal: a
reference, built on the Vol Forecast v3 lines, that says what price did when it hit a line in a given
situation — continue, fade or stall — with honest odds. It is descriptive, not a trading rule.

## Data
- Lines: every export line (OH/OL p50/p75/p90, Close p50/p75, dynamic Proj H/L p50/p75),
  js/voteAtlasV4Lines.js, London-midnight days.
- Rows: every pass of every line (forge/SEQUENCE_BOOK_EURUSD_PREREG.md rules: re-arm after a close 0.1σ
  back inside; same-bar passes excluded), with the touch book's race (continue = the next line out first;
  fade = the line behind first; stall = neither by the London day end) and excursions.
- Instruments: the 16 of the cross-pair book (7 USD pairs, 8 crosses, gold), POOLED in σ units (the
  cross-pair test showed one book serves all), with EURUSD also shown on its own. 2016 → 2026-08.
- Every feature from bars before the pass bar only; every builder runs its future-scramble check.

## Dimensions
- **Main table:** line family × session (Asia 00–07, London 07–13, NY 13–17, Late 17+ London) × range
  used before the touch (< 0.5, 0.5–0.8, 0.8–1.0, > 1.0 of hl p50).
- **Modifiers** (each shown within line family): pass number (1, 2, 3+); multi-timeframe WaveTrend stretch
  (9/12/3, M15 AND H1 wt1 beyond ±53 in the touch direction); relative tick volume over the last 15 min vs
  the same clock minutes over 20 days (thirds); the 60-minute move into the line in σ (thirds); and, where
  available (7 CVOL instruments, 2023–2026 walk-forward), the day-size forecast (big day expected or not).

## What each row shows
touches · continue % · fade % · stall % · break-even continue % for the spacing · follow and fade net R ·
typical pullback before continuing and overshoot before fading (median / 90th, σ; pips for EURUSD) ·
2016–22 vs 2023–26.

## Reliability flags (fixed)
- **Stable:** n ≥ 100 in each half and the continue % differs by ≤ 5 points between halves.
- **Edge vs spacing:** follow or fade net R > 0 in BOTH halves, with the pooled test surviving a
  Benjamini–Hochberg false-discovery control at 10% across every row × direction in the book.
  Rows without it are read as "fair odds": the situation changes what happens, but not by more than
  the line spacing already pays for.

## Extensible
Each pass row is kept with its features, so a new idea is a new column tested under the same flags.
