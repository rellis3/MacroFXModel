# Confirmed break on the Close median — pre-registered confirmation on unseen indices

Committed 2026-09-30 before any number on these instruments was computed.

## Background
An outside analysis (Gold + Nasdaq, ~25 cases per cell) found that after the first touch of
the Close median, a push of 0.25 × the Close-median distance beyond the line (before a
0.25× pullback) is followed by the Close 75th far more often. Our exploratory check
(scripts/rangebook/confirmed_break_check.mjs, commit 4da7f08) replicated the split on
EURUSD, GOLD and NQ, and found the TRADE positive only on NQ (+0.06 to +0.09R in both
2016–22 and 2023–26, t 1.2–1.8). NQ's whole history has therefore been seen; 3 instruments
× 2 stops were looked at. NQ cannot confirm itself.

## The rule (fixed; the NQ-exploratory version with the stop that held on all three)
- London-midnight days, js/voteAtlasV4Lines.js lines. First touch of Close p50 (up or
  down), not resolved on its own bar.
- D = |Close p50 − open|. From the bar after the touch: whichever comes first of
  PUSH (line + 0.25·D beyond) or PULLBACK (line − 0.25·D inside).
- On PUSH: enter (follow) at the push level; target = Close p75; stop = the pullback level
  (line − 0.25·D). The fill bar may stop out but cannot hit the target; a bar hitting both
  is a stop; unresolved closes at the London day's last close. Net of `costForPair`;
  R = stop distance.

## Instruments
**Confirmation set (never examined for this rule):** SPX, DOW (2021-06 → 2026-06), US2000,
DE30, UK100 (2016 → 2026-08). All have fitted ladder params. SPX and DOW are closely tied to
NQ, so they are reported as a group separate from US2000/DE30/UK100.
**Reported, not counted:** NQ, EURUSD, GOLD (already seen).

## Pass
Pooled over the five confirmation indices: net R > 0 with t ≥ 2.0, AND net R > 0 on at
least 3 of the 5 individually. Also reported: the reach-75th split (push-first vs
pull-first) per instrument, win rate vs break-even, and each instrument's 2016–22 / 2023–26
halves where it has them.
