# fomc-range-share — how much of an FOMC day's range falls in the statement window and in the press-conference window?

**Pre-registered 2026-11-14, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `fomc-range-share` (one id; cells H1-H4 below) |
| Branch | `main` (small commits) |
| Register row | `plans/RESEARCH_REGISTER.md` → `fomc-range-share` |
| Data | 1-minute OANDA mid bars (local M1 cache, `--price M`): EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD, XAUUSD, NAS100_USD, SPX500. Window 2016-01-04 → 2026-08-21 (lockbox date; M1 ends 2026-08-20). Calendar: `data/calendar/ff_calendar_2007_2025.csv` (dates, press-conference rows) + `calendar_events.csv` (2018+, UTC stamps); the published Fed schedule where the files stop (listed in §3) |
| Seed | `20261114` (every script in this study) |
| Uncertainty | meeting bootstrap (a meeting is the unit; meetings are ≥ 5 weeks apart so independent), B = 2000, percentile 95% interval |
| Scripts / outputs | `scripts/fomc-range-share/` → `analysis/output/fomc-range-share/` |
| Harness | own script (an event-window variance-share study on minute data; `runStudy.mjs` is built for daily trade rules) |

Applied from `education/RESEARCH_METHOD_LESSONS.md`: a scheduled-news baseline is part of the design (the placebo days are
checked for other high-impact US prints near the clock); matched placebo controls exclude only the event's own
neighbourhood (lesson 2026-10-14…18); decide the verdict word from the power table, not the point estimate.

## 1. The claim (required)

An FOMC day concentrates its movement into two known clocks: the statement at 14:00 New York time and, since 2013, a
press conference from 14:30 (all eight meetings from 2019, the four SEP meetings in 2016-18). The question is **how much
of the day's realised movement each window carries**, in plain shares, against the same clock windows on ordinary days:

- **S window:** 14:00-14:30 ET (statement).
- **P window:** 14:30-15:30 ET (the first hour of the press conference).

This is a timing and size description, not a forecast and not a trade. It would let the terminal say "on FOMC days the
statement half hour carries X% of the day's variance and the press conference hour a further Y%" with a banked number.

## 2. Why it is not already settled (required)

Searched 2026-11-14 (grep of `forge/`, `plans/`, `scripts/`, `js/deskEvidence.js`, the register, `analysis/output/`):

- `vol-curve-front` (VALIDATED) and the Event Response Book give the FOMC **day-level** range multiplier (NQ 1.197,
  SPX 1.192 of the no-event day) and the 30-minute spike after a print. Neither splits the statement window from the
  press-conference window, and neither reports the window's share of the day.
- `rate-surprise-events` and `cb-tone-reaction` use one 60-minute (FOMC) or 30-minute window starting at the statement.
  They are direction/surprise questions. `rate-surprise-events` notes "FOMC can also spike at the press conference"
  and does not measure it.
- `release-layer1` (Release Reaction) measures a 30-minute reaction in σ units per release; no share of the day, no
  press-conference window.
- No match for "press conference window" or a variance-share design. This is a miss in a grep, not proof it was never
  done. Nearest entries to cite: `vol-curve-front`, the Event Response Book (`js/eventImpactMap.js`), `rate-surprise-events`.

Different question: the banked work says FOMC days are wide and the 30 minutes after the print are busy; this one says
**which half hour/hour inside the day**, and whether the press conference adds anything beyond the statement.

## 3. Definitions, fixed in advance (required)

**Meetings.** Scheduled FOMC decision days, 2016-01-04 → 2026-08-21: `Federal Funds Rate` / `FOMC Statement` days in the
ForexFactory file to 2025-03-19; `Fed Interest Rate Decision` in `calendar_events.csv` from 2025-04 to 2026-06-17; and
the published Fed 2026 schedule for 2026-07-29 (no file row). Unscheduled meetings (2020-03-03, 2020-03-15) are excluded.
Each meeting is tagged `presser` if the file has an `FOMC Press Conference` row that day (all 2019+; the quarterly
SEP meetings in 2016-18), else `statement-only` (the other 2016-18 meetings). A meeting day with < 95% minute coverage
in the London session for an instrument is dropped for that instrument and the drops are counted.

**Session and day.** London calendar date, window 00:00-22:00 Europe/London (`london22`), weekends excluded.
**Windows** are clock windows in `America/New_York`: S = 14:00-14:30 ET, P = 14:30-15:30 ET (minute bars with start
times in [start, end)). The conversion is done per date, so the US/UK daylight-saving mismatch weeks are handled.

**Measures (per meeting, per instrument).**
- **RV share (primary):** Σ over the window of squared 1-minute log returns ÷ Σ over the London session. Additive, in [0, 1].
- **Range share (secondary):** (high − low within the window) ÷ (high − low of the session). In [0, 1].

**Placebo.** For each meeting day d, up to 6 ordinary same-weekday days nearest in time within ±8 weeks, excluding:
any FOMC day, the day after an FOMC day, any day with a high-impact USD print between 13:00 and 16:30 ET in either
calendar file, US market holidays (< 95% coverage), and any day already used as a placebo for another meeting in the
same window (greedy nearest-first). The placebo share for d is the mean over its placebo days, **same instrument, same
clock windows**. A meeting with < 3 placebo days is dropped (counted).

**Pooling.** Per meeting, average the share across the instruments that have data (instruments are strongly correlated
on a news day, so the meeting, not the instrument, is the unit). Per-instrument results are reported as disaggregation.

**Excess** = meeting share − its placebo share.

## 4. Hypotheses, expectation first (required)

Expectation: the statement half hour carries by far the largest block (tens of percent of the day's variance against
low single digits on an ordinary day); the press conference hour adds a clearly smaller but real block on `presser`
days and none on `statement-only` days.

- **H1 (gate, statement window).** Mean pooled RV-share excess in S ≥ +0.05 with the lower end of the 95% interval > 0.
- **H2 (gate, press-conference window, presser meetings).** Mean pooled RV-share excess in P on `presser` meetings ≥ +0.03
  with lower end > 0.
- **H3 (mirror/control).** On `statement-only` meetings (2016-18, no press conference) the P-window excess is < +0.03
  or its interval includes 0, i.e. the P effect comes from the press conference and not from the 14:30 clock itself.
  If H3 fails, H2 is demoted to CONTEXT (the clock, not the conference).
- **H4 (descriptive).** P ÷ S ratio of excess shares by era (2016-18, 2019-21, 2022-26) and by instrument group (FX, gold,
  indices); range-share versions of H1/H2; the share of the *day's* high or low printed inside S or P.

**THE GATE.** H1 and H2 pass → `VALIDATED`. H1 or H2 interval upper end below its margin → `NULL`. Neither → `UNDERPOWERED`.
H3 and H4 never promote; H3 can demote H2 as stated.
**THE MIRROR.** Same windows, same measures, on the placebo days alone: the mean placebo share in S and P must sit near the
clock's ordinary share (sanity: not zero, not > 0.15); a placebo that is itself large means the design is biased.

## 5. Power — what this design can and cannot find (required)

n ≈ 85 scheduled meetings (≈ 60 presser, ≈ 25 statement-only after exclusions). The MDE for a mean excess is
2.8 × SD(excess) / √n. SD(excess) is estimated from the placebo days only (permitted control-sample SD; computed before any
FOMC-day outcome and recorded as Amendment A1 PRE-RESULTS). Gates are set at +0.05 (S) and +0.03 (P) because a gap of
that size is what a plain-English banner ("the statement half hour carries about X% of the day") needs. If the MDE for a
gate exceeds its margin, that gate is UNDERPOWERED by design, and the verdict follows.

## 6. Multiplicity — how many cells, and the corrected bar (required)

Two gated cells (H1, H2), Holm α = 0.05 across them (both intervals are re-run at the Holm-adjusted level and must hold).
H3 is a control (one cell). H4 disaggregation (10 instruments × 2 windows × era) uses BH q = 0.10 and is descriptive. No other
variants: the range-share and per-instrument versions are the only registered alternates. Window edges (14:00/14:30/15:30)
are fixed; a sensitivity moving P to 14:30-15:00 and 14:30-16:00 is reported but never scored.

## 7. What this does NOT test (required)

Direction, the surprise, the hawkish/dovish tone, any trade or stop, intraday paths inside a window, FOMC minutes, Fed
speeches, other central banks, and whether the day's range was forecast correctly. It does not say the press-conference hour
is predictable, only how much of the day it carried.

## 8. What each verdict changes (required)

- `VALIDATED`: the terminal's Replay tab and the Event Response Book card may print the banked shares ("statement window ≈ X%
  of the day's variance, press-conference hour ≈ Y%, ordinary day ≈ Z%") as a timing fact. Nothing live changes.
- `NULL` (press conference adds nothing beyond the statement): the Replay strip drops the P-window shading.
- `UNDERPOWERED`: shares are shown as a description of the sample with its interval, not as a rule.
- In every case: no trade rule, no forecast multiplier is changed by this study.

## Amendments

### A1 — 2026-11-14 — PRE-RESULTS (power table, coverage rule, meeting list)
No FOMC-day outcome had been computed. `scripts/fomc-range-share/run.py --stage power` reads ordinary placebo-eligible days only (2,413 days, pooled across the ten instruments).

- **Meeting list fixed:** the 84 scheduled decision days 2016-01-27 to 2026-07-29 are hard-coded in `run.py` (the published Fed calendars) and cross-checked against the two calendar files: every file date matches within one day, except the 2020-03-16 file row (the 2020-03-15 emergency meeting, excluded) and 2026-07-29 (no file row). 72 meetings carry a press conference (all 2019+, and the four SEP meetings in 2016-18), 12 are statement-only.
- **Coverage rule (§3) made concrete:** an instrument-day counts only if its London-session bar count is at least 85% of that instrument's median session count and the S window has at least 29 of 30 minutes and the P window at least 57 of 60.
- **Placebo clock sanity (THE MIRROR):** ordinary-day mean RV share S = 0.0198 (SD 0.0190), P = 0.0359 (SD 0.0213); range share S = 0.139, P = 0.185. Both far below the 0.15 RV bar the mirror sets, and above zero.
- **Power table (MDE = 2.8 x SD(excess)/sqrt(n), SD(excess) = placebo SD x sqrt(1+1/6)):** RV share S: SD 0.0205, n 84 gives **MDE 0.0063** against the +0.05 gate. RV share P (presser meetings): SD 0.0230, n 72 gives **MDE 0.0076** against the +0.03 gate. Range share S/P: MDE 0.019 / 0.022. Every gate is about 4-8 times its MDE, so a cell that fails its gate is NULL or CONTEXT by the rule, not UNDERPOWERED by design; the statement-only control (n = 12) is weak (MDE about 0.020 on RV P) and is read as a control, never promoted.
- **Intervals:** 95% and 97.5% two-sided percentile bootstrap; the gate uses the 97.5% (Holm first step over two gated cells).


## RESULTS
