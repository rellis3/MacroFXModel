# EURUSD Approach Book — pre-registration (how price arrives at a line)

Committed 2026-09-30 before any number was computed.

## Why
EURUSD Stage 1 (forge/V4_EURUSD_STAGE1_PREREG.md) tested approach speed, WaveTrend,
momentum and a tick-volume surge and found nothing, but (a) against symmetric ±0.5σ
barriers rather than the real neighbouring lines, (b) one feature at a time, and (c)
with raw tick volume, which mostly measures the clock (and here jumps up to 9× between
years as the feed changes). This book fixes all three.

## Rows and outcome
Every non-same-bar pass of every export line — OH/OL, Close and the dynamic Proj H/L —
from the sequence book (forge/SEQUENCE_BOOK_EURUSD_PREREG.md: same passes, same race,
same follow / fade net R). Train 2016-03 → 2022-12, test 2023-01 → 2026-08-20.

## Approach features (only bars BEFORE the pass bar; "+" = in the direction of the line)
- **Speed:** mv5, mv15, mv60 = close-to-close move over the last 5 / 15 / 60 minutes, in σ.
- **Acceleration:** accel = mv5 − mv15 / 3 (last 5 minutes vs the 15-minute pace).
- **Efficiency:** er15, er60 (net move ÷ path length).
- **Bar size:** mean high-low of the last 5 bars ÷ that of the last 60.
- **WaveTrend 1m:** wt1 (oriented), its 5-bar slope, whether wt1 > wt2 is with the move,
  bars since the last wt1/wt2 cross (capped at 120).
- **WaveTrend 15m and 1h:** oriented wt1 of the last CLOSED bar
  (js/confluenceFeatures.js createHtfContext / htfIdxAt).
- **Money flow:** VuManChu's `computeMoneyFlowVMC` on 1m, oriented.
- **Relative volume:** tick volume over the last 5 / 15 / 60 minutes ÷ the mean of the SAME
  London clock minutes over the previous 20 days; volTrend = relVol5 ÷ relVol60.
- **Context:** VWAP distance of the line (London-day VWAP to the bar before, σ, oriented),
  minutes since the previous pass of any line, pass number, line family, London minute,
  range used.

## Test 1 — each feature alone
Bucket = the feature's tercile on TRAIN (fixed). Cells = line family × feature × bucket.
SELECTED on train: n ≥ 100, mean net R > 0, t ≥ 2.5 (follow or fade). Chance benchmark:
the same selection with outcomes shuffled across passes (20 runs). Confirmed on test:
net R > 0, t ≥ 2.0. **Pass:** confirmed cells > the chance benchmark's 95th percentile.

## Test 2 — all together (gradient boosting, fixed settings as forge/EURUSD_MODEL_PREREG.md)
Walk-forward by year 2023–2026 (fit on everything before 1 January, 5-day embargo).
- **2a (does approach predict continuation at all?)** classifier for "continued" on
  approach + context features vs a base of line family × pass × London-hour frequency:
  Brier skill with a 1,000× day bootstrap. Informative if the interval is above 0.
- **2b (does it pay?)** regressors for follow and fade net R; take whichever is predicted
  > 0. **Pass:** taken trades' test net R > 0 with t ≥ 2.0.

## Causality
The builder aborts unless sampled passes' features are identical when everything from the
pass bar onward is replaced with a different random walk (volume included).
