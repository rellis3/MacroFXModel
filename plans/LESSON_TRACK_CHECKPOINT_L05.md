# Lessons track: checkpoint after Lesson 05 (locked 2026-10-19)

**Return here when Lesson 06 is released.**
- **Git tag:** `lesson-track-L05` on commit `182206d6` (the Forecast Line Backtest with Lessons 04–05 folded in).
- **Branching rule:** anything built after this point for the decision layer (the "decision lab") is a separate branch of work. It does **not** change this record, the page's rules A/B/C, or the build script's outputs.

## Where the lessons track stands
- **Lessons transcribed:** 01–05 (`education/forecaster-portfolio-case-study/`). 17 in the series.
- **Plan steps done:** A–E (`plans/LESSON_TARGET_REBUILD_PLAN.md`): chosen forecast, how-much layer, meta-labelling (closed, failed), sealed holdout (opens once 2027-01-04), Daily Plan page. Step F, folding in each new lesson, is the current step.
- **Compliance actions done:** A1–A9 (`plans/LESSON_COMPLIANCE_REVIEW.md`).
- **Tracker:** per lesson section, `plans/FORECASTER_SYSTEM_BLUEPRINT.md` (lesson log, series map, tracker rows L01–L05).

## The record (Forecast Line Backtest, `forecast-line-backtest.html`)
- **Build:**
  - `scripts/backtest/build_line_backtest.py`, then `scripts/backtest/summarise_line_backtest.py`.
  - Data in `backtest-data/line-backtest/` (34 instruments, `*.json.gz`, `index.json`, `summary.json`).
  - Line file sha256 `9eacecdb7eac4ccd05bdde90a17ec10a0b7b9db355661dada00a26574abec4bf`.
  - Each instrument file carries its 1-minute file hash and the build script hash.
- **Lines:** the Vol Forecast v3 chosen forecast (persistence + IV), point-in-time, 2020-08-24 → 2026-08-20.
  - Calibration on EURUSD is within 2 points on every line.
  - The holdout after 2026-08-20 is not in the record.
- **Trades:** checked on 1-minute bars; a stop and a target in the same minute count as the stop; costs at 2× the spread table.

**Results** (pooled over the instruments that trade each rule, costs on):

| Setting | Trades | Net R / trade | Years + | Sharpe ± SE | z | z after allowance |
|---|---|---|---|---|---|---|
| A 0.2σ / 5R (registered) | 2,057 | +0.162 | 6/7 | 0.87 ± 0.41 | 2.13 | **1.75** (best of 4 registered) / −0.03 (best of 60) |
| A 0.2σ / 10R (registered) | 2,057 | +0.167 | 5/7 | 0.79 ± 0.41 | 1.94 | 1.55 / −0.22 |
| A 0.1σ / 10R (registered) | 2,057 | +0.104 | 4/7 | 0.46 ± 0.41 | 1.13 | 0.74 / −1.03 |
| A 0.1σ / 5R (registered) | 2,057 | +0.004 | 5/7 | 0.03 ± 0.41 | 0.06 | −0.33 / −2.10 |
| B fade p75, 0.6σ / 1R | 25,476 | −0.109 | 0/7 | — | −10.5 | — |
| C continue p50, 0.6σ / 1R | 51,577 | −0.092 | 0/7 | — | −11.5 | — |

**Reading:**
- **Rule A (the rich-day break) is the only positive rule.** It is suggestive (1.75 SE on its registered setting), not proven. It has one independent pass so far: the original registered test.
- **Its forward evidence will come from** the paper record (`paper-record.html`, since 2026-10-02) and the holdout.
- **Search:** the 60 settings correlate 0.13, about 6.8 effective tries, and the best-of-60 allowance is 2.16 SE.
- **Decay:** none detectable (EURUSD −0.03 R / yr [−0.22, +0.17]).
- **Regimes:** EURUSD 2020–26 contains 5 high-volatility spells.

## Open items on the lessons track (pick up here)
1. Add the data fingerprint to the general prereg results template (L05 §06).
2. Add a decay read to the forward scorecard (L04 §01).
3. Build the validation card module (L01 §03, open since Lesson 01). The ρ-aware best-of-N goes in it.
4. Live Range hourly moving lines in the backtest. Not yet built.
5. A walk-forward view of rule A: judge it only on years after its threshold was fitted (2023+).

## Lesson 06 intake (when released)
Follow the blueprint's intake steps:
1. Transcribe the lesson.
2. Add a lesson-log row with the layers it touches.
3. Write a dated prereg amendment for each new test.
4. Re-run.
5. Add the lesson's check to `forecast-line-backtest.html` (lessons table + a panel).

Lesson 01 §05 says Lesson 06 covers dependence and regimes (card 09).
