# Pre-registration: the line-touch fade with a per-instrument cost and a stop sized to it

Committed 2026-10-08 before any number of this phase is computed. Follows `forge/LINE_TOUCH_WIDE_SCAN_PREREG.md`
(results: gross +0.19R holdout, beats a rate-matched placebo 30/30, net -0.008R at a flat 0.02-of-range cost). This phase
asks whether that gross edge survives a realistic per-instrument cost, and whether a wider stop helps. Holdout already
read once for the 0.10 stop; it is NOT a fresh holdout for that stop, so this phase is judged on the new stop widths with
the multiplicity counted, and a forward paper record is required before anything is called tradeable.

## Cost model (fixed now)

- **Round-trip spread in price units**, per instrument: `vmcResearch/ext/feasibility.py` SPREADS where listed (eurusd
  0.00006, gbpusd 0.00009, usdjpy 0.007, audusd 0.00007, usdchf 0.00008, audjpy 0.010, gold 0.25, nq 1.0, spx 0.5, de30
  1.0, uk100 1.0, dow 2.0). Not listed, estimated from the nearest listed pair, flagged as estimates: cadjpy 0.012,
  chfjpy 0.014, euraud 0.00014, eurchf 0.00010, us2000 0.4.
- **Baseline = 2x the table.** `js/spreadProfile.js` records that the table was about 2x light on crosses when measured
  live, and these entries are fast bars (5-minute range up to half a day's range). 1x and 3x are reported alongside, not
  chosen on holdout.
- **Cost in R for a trade** = multiplier x spread / (stop fraction x dayScale). Known before entry, so the score is
  predicted gross R minus that cost, and a trade must clear c on predicted NET R.
- No slippage term beyond the 2x. Stop-outs assumed to fill at the stop.

## Stop width

Stop fraction of the day's expected range: **0.10 (as before), 0.20, 0.30.** Everything else in the structure is
unchanged (lock +0.5R after +1R, trail 1R behind, 3R target, session-end close; trail and target scale with R).
Same population, eligibility (5-minute range <= 0.5, hour < 20 UTC), features, walk-forward, one trade per
instrument-day, 2 trades a week frozen on discovery.

## Selection of the width

On discovery out-of-fold only: the width with the highest mean net R at the 2x cost. That width goes to the holdout.
The other two widths' holdout numbers are reported but not chosen from.

## Pass rule (all required, on holdout, chosen width, 2x cost)

Mean net R > 0 with the day-clustered 95% bootstrap interval excluding zero; both halves (split 2024-06-01) positive;
net beats the rate-matched placebo's 95th percentile (30 shuffled-target reruns, same trade count); at least 10 of 17
instruments net positive; at least 1 trade a week. The Bonferroni count includes 651 earlier fits plus every fit here.

## What a pass means

Only a candidate for the forward paper record with real spreads (the server's `spread_profile_v1`), not a live strategy.
A fail with the gross edge intact means the edge is smaller than this market's cost at these fills, and is reported so.
