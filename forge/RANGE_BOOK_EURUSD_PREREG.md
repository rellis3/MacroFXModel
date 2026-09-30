# EURUSD Range Book — pre-registration

Committed 2026-09-30 before any number was computed.

## Why a range book
Every direction test on these lines (v4 Stage 0, Vote Atlas geometry, EURUSD Stage 1,
the today.html direction tag) came back null. The forecast lines are built to answer
HOW FAR, not WHICH WAY, and prior repo evidence (IV beats realized σ 7/7, COG's range
layer, VIX inversion, surprise size) says range is where conditional information lives.
This book asks range questions and scores them as probabilities.

## Data and lines
- EURUSD M1, local archive 2016-01-04 → 2026-08-20. London-midnight days
  (`js/voteAtlasV4Lines.js` `v4Days`: σ from completed 17:00-NY daily bars, `buildLadder`
  with the day's event tag from `scripts/v4/calendarProxy.mjs`).
- Static lines: Close p50/p75, OH/OL p50/p75/p90 off the open.
- Dynamic lines: Proj H/L = the day's H-L reaching the ladder's hl p50 / p75 / p90.
  A Proj touch == "the forecast day range is complete".
- **Train 2016-01-04 → 2022-12-31. Test 2023-01-01 → 2026-08-20.**
- Caveat stated up front: the ladder's width multipliers were fitted walk-forward with
  folds reaching 2025, so the lines' *nominal* calibration in the test years is partly
  in-sample. Every comparison below is between conditional tables built on the SAME
  lines, so that does not favour any table.

## Causality
Pre-day features read only daily bars closed before the London open. Checkpoint state
reads only M1 bars before the checkpoint bar. The builder aborts unless every sampled
day's features are identical when the checkpoint bar and everything after it are
replaced with a different random walk.

## Pre-day regime variables (fixed buckets)
- **sigmaReg**: day σ ÷ median σ of the prior 20 days: quiet < 0.85 ≤ normal ≤ 1.15 < heavy.
- **hmm**: `hmm.js` `fitHMM` on 200 prior daily closes: RANGE / TREND, with TREND's
  direction oriented to the question's side (with / against); trendDirConfident=false → RANGE.
- **yRange**: yesterday's realized H-L ÷ yesterday's forecast hl p50: small < 0.8 ≤ normal ≤ 1.2 < big.
- **event**: tier1 (FOMC, NFP, CPI) / high / none (unknown → none).

## Book A — reach: "from here, does price reach that line today?"
Checkpoints: 03:00, 07:00, 10:00, 13:00, 16:00 London. For every static line NOT yet
touched at the checkpoint, and every hl range threshold not yet reached:
outcome = touched between the checkpoint and the London day's last bar.
Sides are mirrored (up and down lines pooled; hmm oriented to the line's side).
- **dist**: distance from price to the line in σ: <0.25, 0.25–0.5, 0.5–1.0, >1.0
  (range thresholds: remaining range to go, same buckets).
- **used**: H-L so far ÷ hl p50: <0.4, 0.4–0.7, 0.7–1.0, >1.0.

## Book B — range completion: "the forecast range is done; what next?"
Event = first bar where the day's H-L ≥ hl p50 (a Proj H or Proj L touch). Direction =
which extreme the completing bar extended (down-drive = Proj L, the high set earlier —
the "high, drive to the predicted low" case). Outcomes from the next bar to day end:
ext75 (H-L reaches hl p75), ext90, back-to-open, back-to-mid (50% of the range at
completion), and the NEXT line touched after completion (open, Close p50 either side,
OH/OL p50, or none). Conditions: completion time (<08:00, 08–13, 13–17, ≥17 London),
drive (minutes from the opposite extreme's time to completion: <60, 60–240, >240),
plus the four regime variables.

## Book C — is the extreme in? 
At each checkpoint, per side: outcome = the running high (low) is exceeded later in the
day. Conditions: used, distance from price to the running extreme in σ
(<0.1, 0.1–0.3, 0.3–0.6, >0.6), plus the regime variables.

## Scoring (the same for A, B, C)
Probabilities are cell frequencies on TRAIN with back-off to the parent cell when
n < 50 (and Laplace +1/+2 smoothing), then scored on TEST with the Brier score.
- **Base model** — A: checkpoint × line × dist × used; B: completion direction ×
  completion time; C: checkpoint × used × distance.
- **Each regime variable** is added to the base model on its own, then all four together.
- **Brier skill score** vs the base model on TEST, with a 95% interval from a 1,000×
  bootstrap resampling DAYS.

**A regime variable counts as informative only if its test BSS interval is entirely
above 0.** The base models themselves are also scored against the unconditional rate and,
for Book A from the open, against the ladder's nominal probability, with reliability
(calibration) tables reported.

Nothing here is a trading rule. Whether a calibrated probability is sharp enough to pay
the spread is a separate, later test.
