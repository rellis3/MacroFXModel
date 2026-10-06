# Brief for a separate session: Live Range's moving lines across history

*Written 2026-10-06 by the lessons session (plans/LESSON_TARGET_REBUILD_PLAN.md), which stays on the course lessons.
This is a self-contained side study. Paste the section below into a new session.*

---

## The task

Test, across history, how price behaves around the **Live Range** page's moving lines (`live-range.html`), and
how **jumps** affect trading at them. Research only: nothing live changes.

## Why

- **How Live Range works:** every hour from 01:00 to 21:00 London it re-draws the remaining-range lines (↑/↓ p50,
  p75, p90) from two things: range used so far and the last hour's pace (a 3 × 3 cell). The engine is
  `js/intradayRange.js` (`sessionState`, `reforecast`) with params `js/intradayRangeParams.js`.
  Between redraws the lines are flat steps.
- **What's already validated:**
  - forge/INTRADAY_RANGE_PREREG.md: the hourly ranges are better calibrated than the morning lines
    (PASS: FX + gold 21/21 hours, indices 19/21).
  - forge/LINE_TOUCH_REACH_PREREG.md: once a line is touched, the "reach the next line" odds are calibrated
    (about 2 in 5 go from p75 to p90).
- **What has never been tested:**
  - acting at these moving lines: touches, fills, what happens next;
  - how jumps interact with them.
- **Why jumps matter here:** the lessons session (forge/JUMPS_PREREG.md, BNS daily test) found:
  - about 12% of days are jump days, and 3 in 4 jumps are unscheduled;
  - the forecast's p90 breaks about twice as often on jump days (17% vs 9%);
  - one 5-minute bar crosses a 0.5σ stop on about 11% of sessions.

  A jump can run through the nearest line in one bar, and the lines only react at the next hour.
- **PATH MAP** (forge/PATH_MAP_SPEC.md) found random-walk races at the **static** morning lines. Whether the
  **moving** lines behave differently is open.

## Questions, in order

1. **Replay.** Rebuild every session's hourly lines from M1 exactly as the page does (`sessionState` / `reforecast`
   on 5-minute bars). Use point-in-time morning σ, never today's. Check a few recent days against the live page's
   logic before anything else.
2. **Touches and fills.**
   - A touch = a bar crossing a line that existed **before** that bar.
   - A line that moves past price at a redraw is a **"phantom" touch**. Count those separately and exclude them
     from touch statistics.
   - Per line and hour: how often price touches it, and how often it **jumps through** (the touch bar's extreme
     carries more than x σ past the line), with the overshoot distribution.
   - Split by BNS jump day.
3. **What happens after a touch.**
   - Race from the touch bar's close: next line out vs back level.
   - Benchmark: the driftless random-walk share b ÷ (a + b).
   - Splits: hour, cell (used × pace), regime, and "a jump has already happened today by this bar".
   - That last split is the only jump measure known in real time; the BNS day flag is end-of-day, so use it only
     descriptively.
4. **Reach odds after a jump.** Is LINE-TOUCH-REACH still calibrated on jump days and after an intraday jump? Would a
   jump-state adjustment fix it?
5. **Line-shift behaviour.** How far and how often the lines move at each redraw, and whether a big shift (right
   after a jump) predicts anything.
6. **Cost reality.** Any after-touch edge must be scored net of spread/slippage; apply the execution-feasibility
   rule (spread ÷ ATR > 0.15 = dead).

## Data already built (local, gitignored: rebuild if missing)

- `analysis/output/forecast_history/<SYM>.csv`: 34 instruments, one row per London session 2016 → 2026-08-20.
  - The export forecast point-in-time (`pit_*`), with `oos = 1` from 2020-08-21.
  - Realised OH/OL/HL/OC, running OH/OL at each London hour (`oh_h1..22`, `ol_h1..22`).
  - First-touch minutes, gap, RV/BV, `last_min`.
  - Rebuild: `node scripts/forecast_history/build.mjs` (~20 min). Spec: forge/FORECAST_HISTORY_SPEC.md.
- `analysis/output/jumps/flags_seasonal.csv`: per session `jump_bns`/`z_bns` (use this), `jump_lm`, `min_jump_lm`
  (the largest seasonality-adjusted bar's minute). Rebuild: `PYTHONPATH=. python scripts/forecast_history/jump_flags_seasonal.py`.
- M1: FX + gold `VolRangeForecaster/data/m1/`, indices `portfolioBacktest/cache/` (`forge.vol.discover_full_universe`).
  Ends 2026-08-21.
- Session completeness: last bar ≥ 20:00 London (`complete()` in scripts/forecast_history/forecast_record.py).

## Rules (owner's)

- **No Vote Atlas input** of any kind (it carried look-ahead bias).
- **Side by side only:** never edit `live-range.html`, `js/intradayRange*.js`, `js/lineTouchReach.js` or shared engines.
- **Pre-register before results:** `forge/LIVE_RANGE_HISTORY_PREREG.md` with pass rules and a variant log.
  - Every variant is logged before it runs.
  - Date-block bootstrap intervals (all instruments on a date together; the helper is `boot_weights` in
    scripts/forecast_history/forecast_record.py).
- **Point-in-time:**
  - Check whether `js/intradayRangeParams.js` was fitted on more than the first 60% of dates. If so, score only the
    test 40% or refit walk-forward.
  - Lines at hour h use bars before h only.
- **Bank results** in `js/deskEvidence.js` (null entries have no `instruments`; run `node js/deskEvidence.test.mjs`).
- **Commit only your own files.** Other sessions are active; diff-check after `git add`. Run
  `node analysis/deploy_precheck.mjs` before any server.js push.
- **Write results for the owner in plain English:** what it means for using the page, not just numbers.

## Don't touch

The lessons session's files: plans/LESSON_TARGET_REBUILD_PLAN.md, plans/FORECASTER_SYSTEM_BLUEPRINT.md,
forge/FORECAST_RECORD_PREREG.md, forge/JUMPS_PREREG.md, forge/META_LABEL_PREREG.md, scripts/forecast_history/*.
Read them freely.
