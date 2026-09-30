# EURUSD Sequence Book — pre-registration (passes, pullbacks, timing)

Committed 2026-09-30 before any number was computed.

## Why
The touch book recorded only the FIRST touch of each line per day. The owner trades a
path: price touches a line, pulls back a little, then breaks through on a later pass,
runs to the 75th, and often reverses there later in the day — and early, fast pushes
mark big days (descriptive check: a first 75th touch in Asia/London went on to the 90th
53–66% of the time vs 24–34% for NY/late). This book records every pass and asks
whether the path so far predicts what happens next.

## Passes
Lines: every export line (OH/OL p50/p75/p90, Close p50/p75, Proj H/L p50/p75), EURUSD,
London-midnight days, js/voteAtlasV4Lines.js. Proj levels move with the running extreme
(from bars before the current one).
- A line starts **armed**. A **pass** = an armed line touched (high ≥ line for up lines,
  low ≤ line for down lines). The line then disarms.
- It **re-arms** when a bar CLOSES at least 0.1σ back on the inside of the line.
- Per pass: pass number (1, 2, 3+), London time, session (Asia 00–07, London 07–13,
  NY 13–17, late 17+), **pullback** before this pass (deepest move back inside since the
  previous pass, σ; pass 1 = none), **previous overshoot** (furthest beyond the line on the
  previous pass before it re-armed, σ), and the touch book's situation variables.
- Outcome: the touch book's race from the bar after the pass (continue to the next line
  out vs fade to the line behind), with follow/fade net R exactly as in
  forge/TOUCH_BOOK_EURUSD_PREREG.md. Pass 1 must reproduce the touch book's first touches
  (the builder checks this).

## Question 1 — does a later pass behave differently? (trading)
Cells: line family × pass (1, 2, 3+), and line family × pass × session.
SELECTED on train (2016 → 2022): n ≥ 100, mean net R > 0, t ≥ 2.5, follow or fade.
Chance benchmark: the same selection with outcomes shuffled across passes (20 runs).
**Confirmed** on test (2023 → 2026-08): net R > 0, t ≥ 2.0.
**Pass:** confirmed cells > the chance benchmark's 95th percentile.

## Question 2 — does the path so far sharpen the reach odds? (forecast)
At 07:00, 10:00, 13:00 and 16:00 London, the range book's Book A rows (does price reach
each not-yet-touched line today) get three path variables for the line's own side
(for range lines: the side that has travelled further):
- **top**: furthest OH/OL line reached on that side so far (none / p50 / p75 / p90);
- **when**: session in which that side first reached its p50 (not yet / Asia / London / NY);
- **passes**: passes made at that top line so far (0, 1, 2, 3+).
Scored exactly as the range book (forge/RANGE_BOOK_EURUSD_PREREG.md): base cells
checkpoint × line × distance × range used, cell back-off at n < 50, Brier skill on test
with a 1,000× day bootstrap. **A path variable counts only if its test interval is
entirely above 0**; all three together are also reported.

## Reported regardless (the descriptive book)
Per line family: continue / fade / neither by pass and by session; pullback and overshoot
between passes; the reversal-at-the-75th rate by the session the 75th was first reached.

## Causality
Pass records use only bars up to the pass bar; the checkpoint path variables only bars
before the checkpoint. The builder aborts unless sampled passes and checkpoint rows are
identical when the data after them is replaced with a different random walk.
