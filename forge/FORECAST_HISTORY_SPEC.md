# Step 0 — Forecast history table (spec, written before the build runs)

Part of `plans/LESSON_TARGET_REBUILD_PLAN.md`. A data build, not a test: it has checks, not a pass rule for a
hypothesis. No Vote Atlas data is read; the line maths is the Vol Forecast v3 export calculation
(`js/voteAtlasV4Lines.js` `v4Days` → `forecastSigma` → `buildLadder`, file name historical).

## Rows

One per instrument per London session (weekdays), 34 instruments, from the local M1 history (2016 → 2026-08-21;
the cache is stale after that and `OANDA_KEY` is not set on this machine, so the top-up is a separate job).

## The forecast, two versions

- **`pit_*` (point-in-time, the honest one).** For each session, the walk-forward fold spec that was the newest one
  trained before that session's open (`forge/out_vol_lon/vol_report.json`, 6 annual folds). Each spec is
  estimator + widths + event multipliers. σ = that estimator on New York-close daily bars closed before the open,
  as the page computes it. Sessions before the first fold's `trained_through` (2020-08-20) have no earlier spec:
  they use fold 0 and are flagged **`oos = 0` (burn-in)**. Only `oos = 1` rows may be used to score anything.
- **`live_*`.** Today's live spec (= fold 5, trained through 2025-08-19) applied to every day: what the page would
  have drawn with today's settings. In-sample before 2025-08-20; kept so the in-sample flattery can be measured.

Event tag from the calendar proxy (`scripts/v4/calendarProxy.mjs`); unknown after 2026-07-02 → ×1.0 and
`cal_known = 0`.

## What the candles did (London 00:00–22:00, from M1)

- realised OH, OL, HL, |OC| and signed OC, % of the open; minute of the high and of the low;
- minute of the first touch of each `pit` OH/OL p50/p75/p90 line;
- running OH and OL at the end of each London hour 1–22 (the path at checkpoint resolution);
- jumps: gap from the previous session's 22:00 close to this open; 5-minute realised variance (RV), bipower
  variation (BV = π/2 · Σ|r_i||r_{i−1}|), jump share max(0, RV − BV) ÷ RV; the largest 5-minute move and its minute.

## Checks (must hold before Step 1 reads the table)

1. **Reproduction:** `live_*` rungs equal `scripts/rangebook/ladder_calibration.mjs` output (same calc) on every
   shared day, to 1e-4.
2. **Causality:** truncation test — rebuilding with all M1 after a session's open removed leaves that session's
   `pit_*` and `live_*` unchanged (spot check, 3 instruments × 5 dates).
3. **Fold boundaries:** every `oos = 1` row's spec was trained before the row's date.
4. **Coverage:** rows per instrument, sessions with < 60 bars dropped and counted, gaps listed.
5. **Sanity:** jump share in [0, 1]; RV > 0; realised HL ≥ max(OH, OL).
