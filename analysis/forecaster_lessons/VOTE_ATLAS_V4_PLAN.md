# Vote Atlas v4 plan: WITHDRAWN (2026-10-05)

This file held a 2026-10-04 plan for a "Vote Atlas v4" that kept the vote and the ladder
and rebuilt the layers around them. **It is withdrawn.** Two pull requests merged on
2026-09-30, both already in this checkout, make it moot:

- **PR #1497: look-ahead in the atlas engines.**
  - `prevOutcomeSameDay` handed a re-armed retest the previous touch's *eventual*
    outcome, before that touch had resolved. It is one of the vote's core dimensions.
  - After the fix, the honest Vote Atlas vote at m≥3 goes from PF 1.06 to **PF 0.95**
    (losing). The Asia and Monday Fib Atlas go to 0/16 and 1/16 pairs positive.
  - The touch-motif book goes from PF 1.25 to 0.95.
- **PR #1498: a real Vote Atlas v4 already exists** (`js/voteAtlasV4Lines.js`).
  - It reproduces the forecaster v3 export lines exactly, which was the "Phase 1.1" of
    the withdrawn plan.
  - Its pre-registered tests (`forge/V4_*_PREREG.md`, `analysis/output/v4_stage0/`) find
    the lines **indistinguishable from random levels**: 0/28 pass, gross 0.000R, net −0.03
    to −0.12R.
  - The EURUSD context-feature stage and the direction-tag replay both FAIL.

The withdrawn plan's premise, "the vote has an edge, so build layers around it", came from
`vp2.json`. That file was saved on 2026-09-18, **before** the #1497 fix. Every
Vote-Atlas-specific number derived from it in `FINDINGS.md` §2–3 is therefore invalid
(see the banner there).

## What still stands

- **The forecaster v3 ladder is a good *range* forecaster** (calibrated p50/75/90 OOS),
  and the exhaustion surface's IV/σ effect on range size holds out of sample.
- **Its lines carry no *direction* edge.** #1498 Stage 0 measured this directly: gross
  0.000R vs random levels. This is exactly Lesson 03 §02's claim: volatility is
  forecastable, direction is not, and volatility structure "bears on how much to hold
  rather than on which way to bet."

## The direction the lessons point to

Not a v5 of a directional line strategy. The fade/follow family is at its kill threshold
(`FINDINGS.md` §3.7), and the programme's honest pass rate is now 1/38. Instead, use the
part that works, the range forecast, for what it is good at:

1. **As the risk/sizing layer of a return stream that has its own edge.** The only
   candidate left in the verdict register is yield-spread z-reversion (paper, OOS Sharpe
   about 1.1). It still needs its own independent confirmation (`FINDINGS.md` §3.7).
2. **As a volatility product in its own right**: trading the *size* of the day, not its
   direction, where the forecast's calibration is the edge.
   - Instruments: options or range structures where available.
   - Pre-register the test before any build (L02 §05).
3. **As a decision aid for discretionary trading**: expected range, exhaustion state,
   event days. Its calibration is already verified, so no edge claim is needed.

Any of these starts with a pre-registration in `forge/`, as #1498 did, not with a build plan.
