# orderflow-lead-aggressor — does the exchange's own aggressor flag on 6E and 6J predict the next 5 and 15 minutes, beyond the move already in the bar?

**Pre-registered 2026-11-07, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `orderflow-lead-aggressor` |
| Branch | main |
| Register row | `plans/RESEARCH_REGISTER.md` → `orderflow-lead-aggressor` |
| Data | Databento GLBX.MDP3 raw trades, `6E.v.0` and `6J.v.0` (front month by volume), from `%LOCALAPPDATA%/MacroFXModel/orderflow/raw/GLBX/trades/`. Fixed window, whatever else the pull adds later: 6E 2023-04-03 to 2026-08-21, 6J 2023-08-01 to 2026-08-21. Sessions after 2026-08-21 stay sealed (lockbox) |
| Seed | `20261107` |
| Uncertainty | session-block bootstrap, 5-session blocks, B = 2000 |
| Scripts / outputs | `scripts/orderflow-lead-aggressor/` → `analysis/output/orderflow-lead-aggressor/` |
| Harness | own script (no per-setup trades, so `study.mjs` / `runStudy` do not apply) |

## 1. The claim

`orderflow-lead` (forge/ORDERFLOW_LEAD_PREREG.md, banked NULL) found that NQ 5-minute imbalance did not predict the next 5 or 15 minutes. Its sign came from the tick rule, which is built from price, and its section 7 named true aggressor flow as the follow-up, because a real lead "is more likely" there. The owner approved this test on 2026-11-07 as question Q1 of `.claude/skills/research-director/agendas/volume-footprints.md`.

Mechanism: large parent orders are split and worked aggressively over time, so aggressor imbalance should carry information before price has fully absorbed it.

## 2. Why it is not already settled

- `orderflow-lead` used tick-rule delta on NQ. This uses the exchange's flag, on different instruments, so it is a new information source and not a re-run of the null. A different instrument also means a null here does not close the question for NQ, and a pass here does not transfer to NQ.
- The side field was checked in the Databento pilot (`PILOT_REPORT.md`, 146,981 trades): side B prints at the ask 99.7% of the time, side A at the bid 99.9%, side N is 1.33% of trades.
- No outcome has been computed on these files. The only use so far is that pilot's check of side against quote.

## 3. Definitions, fixed in advance

- **Session:** 03:00 to 16:00 America/New_York (DST-aware), Monday to Friday, covering London and US hours. 156 five-minute bars. Dated by the New York calendar.
- **Dropped sessions:** fewer than 95% of bars with a trade, or more than one `instrument_id` inside the session (a roll: returns are never computed across one). Counted and reported. A bar with no trade keeps the previous close and has no flow.
- **Signed volume:** side B = buyer aggressor, side A = seller aggressor. Side N is left out of the signal and counted.
- **Signal D(t):** (buy - sell) / (buy + sell) over the bar. Known at the bar's close, which is when the outcome window starts.
- **Outcome R(t,h):** log return from the bar's close to h minutes later, divided by the trailing realised 5-minute sigma (60 bars, known at the close) times sqrt(h/5). h in {5, 15} are scored. Bars whose window would pass 16:00 are dropped.
- **Model:** per instrument, pooled OLS of R(t,h) on D(t), with the same-bar return r(t) and the previous bar's return r(t-1) as controls, everything standardised once over the instrument's sample so the slope is in standard-deviation units. **The scored quantity is the slope on D(t).**
- **Control / placebo:** the same regression with D taken from the same bar of the session k = 1..20 sessions later. The real slope must sit outside the 2.5 to 97.5 percent range of the 20 placebo slopes. A placebo mean above 0.01 in size means the design is biased and voids the run.
- **Comparison, not scored:** the same regression with tick-rule D on the same trades, as in `orderflow-lead`. This is what shows whether the true sign adds anything.
- **De-clustering:** none by dropping. Overlapping windows are handled through the design effect and the session-block bootstrap.
- **Sample:** first-half / second-half split by chronological session count, per instrument, at the midpoint of usable sessions.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Slope on D(t), 6E, h = 5 and h = 15, above the bar in both halves? | **Probably small and positive**, and below the bar. FX futures are liquid and short-horizon predictability is usually gone once the bar's own return is controlled |
| b | Same for 6J | Same |
| c | **THE GATE, per cell** | Holm at alpha 0.05 over 4 cells, \|slope\| >= 0.05, same sign in both halves, and outside the placebo range. **Validated if a cell passes in both 6E and 6J at the same horizon.** A pass in one instrument only is `CONTEXT`, a candidate for its own prereg. |
| d | **THE MIRROR** | A negative slope (flow that reverses) is reported with the same gate. The test is two-sided and the direction is recorded either way. |

Descriptive, no pass weight: h = 30 and h = 60; the tick-rule comparison; raw delta (not the ratio) z-scored; the 30-minute running delta as the signal; London hours (03:00 to 08:00 New York) against US hours (08:00 to 16:00); hour-of-day slices. These count as 4 variants beyond the primary for best-of-N.

## 5. Power

About 850 sessions for 6E and 760 for 6J, at about 154 usable bars each. Unit-variance standardised outcome. alpha 0.0125 two-sided (Holm over 4), 80% power, z sum 3.34. `orderflow-lead` measured MDEs about 1.6 times the textbook figure for its bars, and the same factor is applied here. Sample counts are checked before any slope is read.

| Cell | Planned n (bars) | Design effect | MDE including the 1.6 factor | Pass bar | Verdict |
|---|---|---|---|---|---|
| 6E, h = 5 | 131,000 | 1 | 0.015 | 0.05 | POWERED |
| 6E, h = 15 | 131,000 | 3 (overlap) | 0.026 | 0.05 | POWERED |
| 6J, h = 5 | 117,000 | 1 | 0.016 | 0.05 | POWERED |
| 6J, h = 15 | 117,000 | 3 (overlap) | 0.027 | 0.05 | POWERED |

If the measured interval half-width on a cell is at or above the 0.05 bar, that cell is `UNDERPOWERED`, not `NULL`.

## 6. Multiplicity

- Scored cells: 4. Holm at alpha 0.05, with p-values from the bootstrap intervals by normal approximation (`pFromCI`).
- The gate also needs both halves and, for `VALIDATED`, both instruments.
- Disaggregation (hour of day, London or US, year): BH at q = 0.10 with `chanceBaseline`. A surviving slice is only a candidate for its own prereg.
- Promotion to any live use needs |t| >= 3 on the scored cell and a forward record.

## 7. What this does NOT test

- **Tradability.** A slope of 0.05 standard deviations can be far below costs. A pass means "there is a lead", not "there is a trade".
- **Footprint structure.** This tests a bar total. Stacked imbalances, absorption and volume at price are separate questions (Q3 and Q4 on the agenda).
- **NQ, ES or other markets.** Only 6E and 6J have this flag on disk. Nothing here transfers to them.
- **The order book.** Trades only; there is no resting liquidity, cancellation or spoofing information.
- **Live use.** The Lucid feed is about 10 minutes late, and a lead of minutes could not be used live on it even if it exists.

## 8. What each verdict changes

- **Validated** → ledger entry `validated` (research-only). Footprint delta may be labelled as a tested short-horizon read on 6E and 6J only. Buying NQ or ES aggressor history becomes worth pricing as its own prereg. No bot reads it.
- **Null** → ledger entry `null`. Stop saying delta leads on FX futures, by any sign method. Q2 (range) and Q3 (absorption) stay open because they do not ask this question. The NQ and ES history stays unbought unless Q3 gives a reason.
- **Underpowered** → record the measured interval and what more history would fix it.
- **Context (one instrument only)** → record it, and register the instrument-specific follow-up with a stated reason for the difference, or leave it.

## Amendments

*(none yet)*
