# Study 1 — Exits driven by the range book (pre-registration)

Committed 2026-09-30 before any number was computed.

## Question
Every entry test at the lines came out near break-even with a fixed bracket (next line /
line behind). Can the range book's reliable parts — how much range is left, whether the
day's extreme is probably in, how far price overshoots — turn those entries profitable by
deciding when to EXIT?

## Look-ahead guards
1. Entry, stop and target are fixed from data before the entry bar (touchSetups).
2. The extreme-in probability is a table fitted ONLY on 2016–2022 range-book rows (all 16
   instruments pooled — forge/CROSSPAIR_RANGE_BOOK_PREREG.md showed one book serves all),
   frozen, and read at a checkpoint using only bars BEFORE the checkpoint bar. An exit
   decided at a checkpoint fills at that checkpoint bar's OPEN.
3. Selection uses 2016–2022 only; confirmation uses 2023–2026-08 only.
4. The builder aborts unless, for sampled trades, the checkpoint probability is identical
   when the checkpoint bar and everything after it are replaced with a different random walk.

## Entries (fixed)
First touch of OH/OL p50 (either side), not resolved on its own bar, all 16 instruments of
the cross-pair book. Two directions: FOLLOW (with the touch) and FADE (against it). Entry
at the line. R = the initial stop distance; net of `costForPair`.

## Exits (the grid — fixed)
Follow (initial stop = the open, target as listed):
- **X0** target next line (OH/OL p75) — the touch-book bracket, baseline.
- **X1** no target, exit at the London day's last close.
- **X2** exit when the day's running range reaches hl p75 (range complete).
- **X3** no target; at 07/10/13/16 London checkpoints after entry, exit if the chance the
  running extreme IN THE TRADE'S DIRECTION gets exceeded later is < 0.35 (the move is
  probably done); else day end.
- **X5** as X1 but the stop moves to the entry once the trade is 0.3σ in profit.
- **X6** as X1 but exit at 16:00 London (or day end if later).
Fade (target = the open, initial stop as listed):
- **F0** stop at OH/OL p75 — baseline bracket.
- **F4** stop 0.4σ beyond the line (≈ the 90th-percentile overshoot before a fade).
- **F3** stop at p75; at checkpoints exit if the chance the running extreme AGAINST the
  trade gets exceeded later is > 0.65; else target / day end.
- **F5** as F0 with the stop moved to the entry once 0.3σ in profit.
- **F6** as F0 with a 16:00 London time exit.
Intrabar rule: a bar that reaches both stop and target is a stop; the entry bar can do neither.

## Selection and pass
On 2016–2022, pooled across the 16 instruments, pick the single best exit for FOLLOW and
for FADE by mean net R (must have t ≥ 2.5 and mean > 0 to be selected at all).
**Confirmed** if the selected exit, on 2023–2026-08 pooled: mean net R > 0 with t ≥ 2.0 AND
positive on at least 10 of 16 instruments. The full grid is reported on both periods.
