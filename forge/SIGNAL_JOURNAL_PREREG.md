# Signal Journal — live alerts with stated odds, tracked forward (Lesson 01 card 10, Lesson 16)

*Pre-registered 2026-10-07, before the journal was built or any alert sent. Owner's ask: "alert me to potential entries
… if we know price is going to fade or continue at a line, tell me, track it, monitor it, see what happens, day by
day." Owner's choice: Telegram + page. Line content: "whatever the analysis says we should do when price touches the
line".*

## What the analysis says at a line, and so what each alert says

- **No fade / continue entry edge exists at the lines** (≈160k historical touches, several designs; Evidence Book:
  v4-stage0/1, path map, live-range-book, live-range-walkforward). So line alerts state **odds and management guidance**,
  never "enter".
- What *is* supported, and goes in every line alert:
  1. **Reach odds:** the historical share of first touches of a chosen-forecast rung that went on to the next rung
     before 22:00 London (p50 → p75, p75 → p90), by instrument class and London-hour bucket. From the chosen forecast's
     walk-forward lines, 2020-08 → 2026-08.
  2. **Exhaustion odds:** the historical share of new day extremes made in that London hour that stayed the day's
     final extreme (the time-of-day exhaustion schedule), by class and hour.
  3. **Guidance from those numbers, fixed now:**
     - final-odds ≥ 50% → "late extreme, usually the last: a place to take profit, not to add";
     - reach-odds ≥ 45% → "more often goes on than not";
     - otherwise → "no lean".
- **Direction alerts only from the yield-spread book** (confirmed twice; forge/YS_LONG_CONFIRM_PREREG.md):
  - **Entry:** the live plan's |z| ≥ 2.0 for a pair with no open journal position.
  - **Exit:** |z| ≤ 1.5, or 20 trading days held.
  - Each comes with the Daily Plan's stop and size: the chosen forecast's σ plus the how-much rules (forge/HOW_MUCH_SPEC.md).

## Delivery

- **Telegram (server, `state.tg`, respects server-alerts off):**
  - yield-spread entries and exits immediately;
  - line touches as an **hourly digest**, main instruments only (6 USD majors, gold, 6 indices);
  - an end-of-day summary after 22:15 London.
- **Page:** the Journal panel on daily-plan.html shows every instrument, touch, odds and outcome.

## Forward scoring (the point)

- **Each line touch is scored at the session close:**
  - did it reach the next rung?
  - was it the day's final extreme? (for the exhaustion odds of new extremes)
- **Calibration verdict per statement type**, after ≥ 100 scored touches and ≥ 20 sessions:
  - CALIBRATED if the realised share is within ±5 pp of the stated average **and** its date-block interval contains
    the stated average;
  - otherwise MISCALIBRATED, and the odds table is flagged (not silently refitted).
- **Yield-spread trades** (direction, entry / exit prices, net of spread):
  - after ≥ 30 closed trades, compare to the history's +0.24% per trade and 55% wins;
  - "decaying" if the mean is below 0 with the interval wholly below +0.24%.
- No verdict on anything before those counts.

## Not done

- No orders and no bots: alerts and a journal only.
- No odds refitting from the forward record before the sealed holdout opens (2027-01-04).
