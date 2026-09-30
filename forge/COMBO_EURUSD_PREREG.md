# EURUSD combination test — pre-registration (approach × day size × further target)

Committed 2026-09-30 before any number was computed. Closes the EURUSD book.

## Why
Two EURUSD findings each fall short of the spread alone:
- **Approach** (forge/APPROACH_BOOK_EURUSD_PREREG.md, test 2a): a walk-forward model of
  how price arrives predicts continuation (Brier skill +0.046), but following on it lost.
- **Day size** (forge/EURUSD_MODEL_PREREG.md, secondary): the P+IV model forecasts the
  upper tail of the day's range better than the lines (p75 pinball skill +0.038).
Hypothesis: follow a pass only when BOTH say "more to come", and aim at the range the
day is forecast to reach instead of the next line.

## Inputs (all walk-forward by year 2023–2026, fitted only on data before 1 January,
5-day embargo, fixed settings as in the two prereg files — no tuning)
- **p_cont**, **p_base** per pass: the approach book's continuation classifier and its
  line × pass × London-hour base rate.
- **q75** per day: the model step's M3 (price/calendar + CME CVOL) 0.75-quantile forecast
  of log(day range ÷ hl p50), made at the London open.

## Signals (thresholds fixed here)
- **Approach says go:** p_cont − p_base ≥ 0.05.
- **Big day:** q75 > log(hl p75 ÷ hl p50), i.e. the model's 75th-percentile day is bigger
  than your p75 range line.

## Trades (every non-same-bar pass of every line, test years only; follow direction)
Entry at the line; stop at the line behind (touch book fade target); race from the bar
after the pass; unresolved closes at the London day's last close; net of spread; R = the
stop distance.
- **Forecast target:** the level at which the day's range would equal exp(q75) × hl p50,
  measured from the running opposite extreme before the pass (a Proj-style line). Skipped
  if it is not beyond the entry.
- **Next-line target:** the touch book's continue target.

Rules scored:
| rule | condition | target |
|---|---|---|
| A | all passes | next line |
| B | approach says go | next line |
| C | big day | forecast |
| **D** | **approach says go AND big day** | **forecast** |
| E | approach says go AND big day | next line |

**Pass:** rule D's net R > 0 with t ≥ 2.0 over 2023–2026, and positive in at least 3 of
the 4 years. A–C and E are reported for comparison only.
