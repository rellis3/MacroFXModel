# LIVE-RANGE-BOOK: the Fade/Continue Book on the hourly-moving lines, and a trend-day state from the line path

*Pre-registered 2026-10-06, before any result. Follow-up to `forge/LIVE_RANGE_HISTORY_PREREG.md` (which found the race after a
touch path-neutral against placebo lines, pooled and across 255 cells) at the owner's request: "look at the fade/continue book on
top of a hourly shifting level to see if they fade/continue better for more profit". Research only; no live changes; no Vote Atlas input.
The Book's own record (`forge/FADE_CONTINUE_BOOK_SPEC.md`: 526,570 static-line passes, 0 edge rows of 315; optional-stopping
geometry puts break-even at the line spacing) is the prior: this tests whether MOVING lines change that.*

## Data
Same replay as the history study (34 instruments, 2016-03 → 2026-08, grids refit on each class's first 60% of dates, page σ).
TRAIN = first 60% of dates per class (selection), TEST = last 40% (confirmation). Events and hours tables are rebuilt with two extra
columns: the close at each checkpoint and the session's final 22:00 close, in σ from the open.

## Part A — the Book's trade on moving lines
Event = first touch of a drawn line in its own hour (as before; zero-offset lines excluded). Entry = touch-bar close, as the Book.
- **CONTINUE:** target = next line out (distance a), stop = back level (distance b). **FADE:** target = back level, stop = next line out.
- R = pnl ÷ risk, risk = b for continue, a for fade; cost = default spread ÷ 1σ-daily of the instrument (`pylego.costs`, per
  instrument) ÷ risk, subtracted. Races resolve to 22:00 on fixed levels; pre-resolved (touch bar already past a level), both-in-bar and
  unresolved races are dropped and counted (1.7% unresolved in the history study).
- **Columns (the Book's best, available without new feeds):** session (hour groups 01-07 / 08-14 / 15-21 and London 07-12, NY 13-16 as
  finer cut), touch number (nth first-touch on that side today across lines: 1st / 2nd / 3rd+), range-used × pace cell, a÷b geometry
  tercile, regime, a jump earlier today (real time), big line shift at the redraw, rung, side. Cells = class × rung × one column, and ×
  hour group where n ≥ 300.
- **Selection / confirmation:** a cell is *selected* if TRAIN net mean R > 0 for continue (or fade) with n ≥ 300. A selected cell
  **passes** if on TEST its net mean R > 0 with the 95% date-block bootstrap interval wholly above 0 and the same sign in both halves of
  the test. Number of cells examined and the number selected on train are reported; the chance rate of passes is stated.
- **Verdict:** Part A is *tradeable* only if ≥ 1 cell passes AND passing cells exceed the chance rate (5% of selected cells).
  Otherwise "no better than the static-line Book". Both continue and fade reported side by side, never chosen between after the fact.

## Part B — trend-day state from the line path
At checkpoint h (08..18 London), the **trend state UP** = the up p50 line was touched in each of the previous two hours (a first
touch event existed at h-1 and at h-2) and no down p50 line has been touched earlier today; DOWN mirrors. Forward outcome =
(final 22:00 close − close at h) ÷ σ, signed in the state's direction. Baseline = the mean signed forward outcome of all (instrument,
h) rows of the same class and hour (drift control). Excess = state mean − baseline, per class × hour group, date-block 95% interval.
- Continue-in-state is *tradeable* if excess > the round-trip spread (÷σ) with the interval's lower bound above the spread on TEST and the
  same sign on TRAIN; fade-in-state mirrors. Report n states and distinct dates. Variant B2: three hours instead of two.

## Variant log
| # | Variant | Added | Status |
|---|---|---|---|
| A1 | as above | 2026-10-06 | pending |
| B1 | trend state = 2 consecutive hours | 2026-10-06 | pending |
| B2 | 3 consecutive hours | 2026-10-06 | pending |

Further variants dated and logged before running. Output: `analysis/output/live_range_book/RESULTS.md`; verdict banked in `js/deskEvidence.js`.
