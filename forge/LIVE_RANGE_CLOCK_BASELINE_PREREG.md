# LIVE-RANGE-CLOCK: do the moving exhaustion lines forecast anything beyond the clock of the day?

*Pre-registered 2026-10-07, before any result. Owner's framing: Live Range is a volatility EXHAUSTION forecaster: as the day moves, the
next exhaustion line closes toward price. `forge/EXHAUSTION_SCHEDULE_PREREG.md` found exhaustion at the static export levels is a
CLOCK effect. INTRADAY_RANGE_PREREG compared the 3×3 (range used × last-hour pace, by hour) re-forecast only against the MORNING
lines. The missing comparison is against the clock alone. Research only.*

## Question
At each hourly checkpoint h (01..21 London), is the 3×3 re-forecast of the remaining range R_h = (final high − running high) +
(running low − final low) better than forecasts that use less information?

## Arms (all fitted on each class's first 60% of dates, scored on the last 40%; same frame as the intraday prereg, page σ units)
- **B (the page):** quantiles of R by hour × 3×3 (used × pace terciles), MIN_CELL 30 fallback.
- **C (clock only):** quantiles of R by hour alone. (The reference "is it just time of day".)
- **D (hour × used terciles)**, **E (hour × pace terciles)**: each ingredient alone.

## Score and rule
Pinball loss summed over q ∈ {0.50, 0.75, 0.90} on R, per instrument per checkpoint (equals final H−L pinball, as used cancels).
- **B beats the clock** at a checkpoint if the median B÷C over the class's instruments is **< 0.99** and B beats C on **≥ 60%** of instruments.
- **The moving lines add information beyond the clock** for a class if B beats C at **≥ 14 of 21** checkpoints. Otherwise: **"the moving
  line is a clock"**.
- Reported by hour group (01-07 / 08-14 / 15-21) with date-block 95% intervals of the pooled B÷C; D and E vs C show which ingredient
  (used or pace) carries the gain; B vs D/E shows whether the 3×3 beats either alone.

## Variant log
| # | Variant | Added | Status |
|---|---|---|---|
| 1 | as above | 2026-10-07 | pending |

Output `analysis/output/live_range_clock/RESULTS.md`; banked in `js/deskEvidence.js`.
