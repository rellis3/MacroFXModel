# Pre-registration — LADDER CALIBRATION scorecard: live ladder vs side-by-side candidates

Written 2026-10-05, after scoring the live ladder and **before** any candidate's results were seen
(the HAR-v2 run was in progress, unread). Frozen; changes only by dated amendment below, before results.

## Why

The "Forecast p50/75/90" export (vol-forecast-v3.html → `/api/vol-forecast/ladder/export`,
`js/forecastLadder.js` + `js/forecastLadderParams.js`) was checked against every London day, 34 instruments,
2016 → 2026-08 (`scripts/rangebook/ladder_calibration.mjs`, `analysis/surfaces/ladder_calibration.py`):

- **Unconditionally calibrated OOS** (after trained_through 2025-08-19, 225 dates, date-clustered SEs):
  every OH/OL/HL/OC rung within ~2.5pp of 50/25/10; fx, gold and indices alike.
- **Conditionally miscalibrated by σ regime, in-sample and OOS alike.** Quintiles of σ ÷ its own trailing
  250-day median: quietest fifth HL > p75 on 32–34% of days and > p90 on 14–15%; busiest fifth 19% and 7–8%.
  Within-instrument slope of log(realised HL) on log(σ_used) ≈ 0.6. The σ over-reacts; lines are too tight
  after quiet spells and too wide after busy ones.

This scorecard is the single test every σ / ladder candidate has to pass before it goes onto the
side-by-side shadow screen. **Nothing here changes any live calculation**: candidates are scored offline
through `buildLadder`'s read-only `ladderParams` override, and promotion to live is the user's decision.

## Protocol

- Days: every London day v4Days produces (the page's own calculation: London-midnight open, NY-close daily
  bars before it, calendar-proxy event tag; tag unknown → ×1.0 after 2026-07-02, identically for both
  ladders). Days with < 600 M1 bars dropped. Realised OH/OL/HL/|OC| from that day's M1.
- Head-to-head rows: inner join of live and candidate on (instrument, date), so both are scored on
  exactly the same days.
- **Window: 2025-09-05 → end of M1 data**, the first day after the latest `trained_through` in either
  params file (live 2025-08-19, `forecastLadderParamsV2.js` up to 2025-09-04). Out-of-sample for both.
- σ regime: quintile of the **live** ladder's σ_daily ÷ its own trailing 250-day median (shifted one day),
  so both ladders are bucketed on the same days. Quintile edges taken on the window's pooled rows.
- SEs clustered by date (mean exceedance per date across instruments, SE across dates).

## Pass rule (candidate vs live)

- **PRIMARY — conditional calibration.** Mean |exceedance − target| over 5 σ-quintiles × {p75, p90} ×
  {HL, OH, OL} (30 cells) is **lower for the candidate** than for live.
- **TARGET BAR — "fixed".** Every σ-quintile within ±3pp of target at HL p75 and HL p90. Reported as met or
  not met; meeting the PRIMARY alone is "better", not "fixed".
- **CALIBRATION GUARD.** Unconditional mean |exceedance − target| over all 12 rungs no more than 1pp worse
  than live. A candidate that fixes the regime split by breaking the average does not pass.
- Reported, no rule: the log-log slope (expect closer to 1), per class (fx / gold / index), per instrument,
  by event tag.

## Variant log (Lesson 2: the breadth of the search enters the evidence)

| # | Candidate | Added | Status |
|---|---|---|---|
| 1 | `forecastLadderParamsV2.js` as-is (har_rv_log σ, its own widths and event multipliers) | 2026-10-05 | running |

Further variants (σ shrunk toward its long-run level, σ-regime-conditional widths, IV blend) are added
here by amendment **before** they are run.

## Outcome handling

Pass or fail, no live file changes. A passing candidate goes onto the side-by-side shadow screen to be
watched on live data; a failing one is recorded here and in the ledger with the cells it failed.
