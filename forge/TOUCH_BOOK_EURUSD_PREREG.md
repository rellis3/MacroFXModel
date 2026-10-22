# EURUSD Touch Book — pre-registration (continue vs fade at the lines, with excursions)

Committed 2026-09-30 before any number was computed.

## The question
When price touches one of the day's forecast lines, does it CONTINUE to the next line
out or FADE to the line behind, how far does it move against itself on the way
(pullback before continuing / overshoot before fading), and in which situations does
either side beat what the line spacing alone implies?

## Lines and ladders (js/voteAtlasV4Lines.js, EURUSD, London-midnight days)
Each touch races its two neighbours on its own family's ladder:

| touched | continue target | fade target |
|---|---|---|
| OH/OL p50 | p75 | open |
| OH/OL p75 | p90 | p50 |
| OH/OL p90 | p90 + (p90 − p75) | p75 |
| Close p50 | Close p75 | open |
| Close p75 | p75 + (p75 − p50) | Close p50 |
| Proj H/L p50 (day range = forecast p50) | Proj p75 | middle of the day range at the touch |
| Proj H/L p75 | Proj p90 | Proj p50 |

Proj levels are frozen at the touch, from the running extreme BEFORE the touch bar.
First touch of each line per London day. Down lines are mirrored.

## Race and excursions (all in σ_day units from the touched line)
Checked from the bar AFTER the touch bar (its intrabar order is unknowable):
- **outcome**: `cont` / `fade` (first target hit) / `both` (same bar: scored as a loss for
  either trade) / `open` (neither by the London day end, marked to the last close).
  Touches whose own bar already reached a target (`sameBar`) are counted and excluded.
- **pullback before continuing** = max move back toward the fade side before `cont`.
- **overshoot before fading** = max move beyond the line before `fade`.
- Also: max beyond / max back to the day end, and minutes to resolution.

## Break-even and trades
d_c = distance to the continue target, d_f = distance to the fade target.
- **Follow**: target d_c, stop d_f; R unit = d_f. Win +d_c/d_f, loss −1.
  Break-even continue rate = d_f / (d_c + d_f).
- **Fade**: target d_f, stop d_c; R unit = d_c. Win +d_f/d_c, loss −1.
- Unresolved: marked to the last close in R, clipped to [−1, win]. Net R subtracts
  `costForPair('eurusd')` in the trade's own R unit.

## Situations (all known before the touch bar)
time (London: 00–07, 07–10, 10–13, 13–17, 17+), range used (H-L before the touch ÷
hl p50: <0.5, 0.5–0.8, 0.8–1.0, >1.0), lines already touched today (0, 1–2, 3–5, 6+),
60-minute momentum into the line in σ (<0.2, 0.2–0.5, >0.5, oriented), event tier,
sigma regime, HMM (oriented), yesterday's range — the last four exactly as in
forge/RANGE_BOOK_EURUSD_PREREG.md.

## Split
Train 2016 → 2022-12-31, test 2023-01-01 → 2026-08-20. The builder aborts unless
every sampled touch's situation, level and targets are identical when everything
after the touch bar is replaced with a different random walk.

## Selection rule (train only) and pass
A cell = touched line × one situation variable's bucket, or touched line × time × used.
SELECTED if on train: n ≥ 100 and mean net R > 0 with t ≥ 2.5, for follow or fade.
- Chance benchmark: the same selection on train with outcomes shuffled across touches
  (20 runs) — how many cells pass by luck.
- **Pass:** a selected cell is confirmed only if TEST mean net R > 0 with t ≥ 2.0.
  The book passes only if confirmed cells > the chance benchmark's 95th percentile.

## Reported regardless of pass/fail (the descriptive book)
Per touched line: continue %, break-even %, edge (continue − break-even), and the
pullback-before-continuing / overshoot-before-fading distributions (median, 75th, 90th,
in σ and pips), train vs test, and the same by time of day.
