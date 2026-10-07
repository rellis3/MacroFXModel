# Lesson 01 validation cards 01, 09, 11 on the built system (week before Lesson 4)

*Pre-registered 2026-10-07, before any of these was run. Part of `plans/WEEK_BEFORE_LESSON_4.md` items 5–7. These
are the checks Lesson 01 §05 describes. Lessons 5, 6 and 4 will take them to depth, and these results are the record
those lessons will examine.*

## Card 01 — the delay check ("delays every input by a further day and confirms the result does not depend on exact alignment")

- **a. Chosen forecast.** Rerun its walk-forward (forge/FORECAST_FIX_PREREG.md variant 1, the persistence form, all
  34) with every input one session older: σ base, regime, res1, res5 (weekday is a calendar fact, not lagged). Score
  against the equally-delayed control.
  **PASS:** ratio < 1 **and** within 1 pp of the undelayed 0.980.
- **b. Yield-spread book.** Rerun the long-history book (forge/YS_LONG_CONFIRM_PREREG.md) with both rate series one
  day later. **PASS:** 1976–2014 mean net per trade stays > 0 **and** within half of the undelayed +0.243%.

## Card 09 — regimes and stress

The chosen forecast (walk-forward lines, `lines_B`) vs the plain forecast (`live_*`), and the stop rule, through:

| Window | Dates |
|---|---|
| COVID | 2020-02-20 → 2020-04-30 |
| UK gilt crisis | 2022-09-20 → 2022-10-31 |
| SVB | 2023-03-08 → 2023-03-31 |
| Yen carry unwind | 2024-07-25 → 2024-08-16 |
| Tariff shock | 2025-04-02 → 2025-04-30 |

**Reported per window:**
- HL p75 exceedance, chosen and plain (target 25%);
- pinball, chosen ÷ plain;
- the share of sessions where one 5-minute bar crosses each class's minimum stop (rule: ≤ 5% in normal times).

**Reading rule:**
- the chosen forecast **holds up in stress** if its pinball ratio < 1 in ≥ 3 of the 5 windows;
- the stop rule **holds up** if crossing ≤ 10% in ≥ 4 of 5 windows. Twice normal is the tolerance in a crisis.

## Card 11 — costs

- **Spreads:** measured live since 2026-09-17 (`/api/spread-profile`, 26 FX pairs + gold, per UTC hour).
- **Expressed against the system's own units:** spread as a share of today's minimum stop distance, per pair, at its
  typical entry hours (07–16 UTC) and at the worst hour.
- **Rule added on the Daily Plan (display, no sealed file changed):**
  - planned loss = stop + worst-case step + **one round-trip spread**;
  - a pair is flagged **"cost-heavy"** when the round-trip spread is > 10% of its minimum stop at the current hour.
- **Indices:** not in the spread profile, so they are reported as unmeasured.

## Output

`analysis/output/card_checks/RESULTS.md`.
