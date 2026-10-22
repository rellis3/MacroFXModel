# EURUSD Touch Book, part 2 — entry timing (pre-registration)

Committed 2026-09-30 before any number was computed.

## Why
Part 1 (forge/TOUCH_BOOK_EURUSD_PREREG.md) found that entering AT the touch never
beats the line spacing, but that excursions around the lines are very stable
(overshoot before fading: median ≈0.13σ, 90th ≈0.37σ; pullback before continuing:
median ≈0.15σ, 90th ≈0.45σ). Question: does waiting for part of that excursion —
a better entry price — produce an edge after spread?

## Touches
The same 10,672 first touches as part 1 (same lines, ladders, targets, same-bar
exclusion, London-midnight days). All orders are placed AT the touch and can only
fill from the bar AFTER the touch bar.

## Variants (grid fixed here, in σ of the day)
**Fade limit.** Limit order x beyond the line (sell above an up-line, buy below a
down-line), x ∈ {0, 0.1, 0.2, 0.3}. Stop s beyond the ENTRY, s ∈ {0.25, 0.5}.
Target = the line behind (part 1's fade target). Cancelled unfilled if the fade target
is reached first, or at the London day end.

**Follow after pullback.** Limit order y back from the line toward the fade side,
y ∈ {0, 0.1, 0.2, 0.3}; stop s beyond the entry on the fade side, s ∈ {0.25, 0.5}.
Target = the next line out (part 1's continue target). Cancelled unfilled if the
continue target is reached first, or at the day end.

Fills at the limit price (never better, even on a gap). After a fill: a bar reaching
both stop and target is a stop; open trades close at the London day's last close.
R = move ÷ s; net R subtracts `costForPair('eurusd')` in R. The fill bar itself can
stop out (conservative) but cannot hit the target.

16 variants × 7 line families = 112 cells. Train 2016-03 → 2022-12, test
2023-01 → 2026-08.

## Selection and pass
SELECTED if on TRAIN: filled trades n ≥ 100, mean net R > 0, t ≥ 3.0 (a stricter bar
than part 1's 2.5, because 112 cells are searched).
**Confirmed** if on TEST: mean net R > 0 with t ≥ 2.0.
**Pass** if at least one selected cell is confirmed AND the confirmed cells are not all
from one period-specific effect (reported: its train and test halves separately).

Reported regardless: the full grid on train and test (fill rate, trades, win %,
net R, t), pooled across line families and per family.
