# COG-MATCHED-PAIRS: do better-matched SOFR and euro legs (same reference period, SOFR vs ESTR) carry what C.OG's pair did not?

*Pre-registered 2026-10-16 while the deep 1-minute pull of the extra contracts was running, before any of those series was loaded. Motivation: C.OG's line is SOFR Sep26 (reference period Sep-Dec 2026) minus Euribor Mar27 (Mar-Jun 2027), two different periods, so it mixes "the next three months in the US" with "a year ahead in euro". His own Discord note said the euro leg was ESTR. Every earlier study used his pair only (the only pair with deep history). This study tests pairs that compare like with like, plus each leg alone, with the same registered tests as before and a family-wise correction across pairs.*

## Pairs (fixed now; each is rate = 100 - price, bp, 15-minute bars, close-labelled, same day screen of at least 3 distinct prices per leg per day)
| id | pair | why |
|---|---|---|
| P0 | SR3U6 - IH7 (SOFR Sep26 minus Euribor Mar27) | reference: C.OG's pair, results already known |
| P1 | SR3H7 - IH7 (SOFR Mar27 minus Euribor Mar27) | same reference period, same expiry |
| P2 | SR3Z6 - IZ6 (SOFR Dec26 minus Euribor Dec26) | same period, nearer, will roll later than U6 |
| P3 | SR3Z6 - ER3Z6 (SOFR Dec26 minus ESTR Dec26) | the "SOFR vs ESTR" the Discord note named |
| P4 | SR3H7 - ER3H7 (SOFR Mar27 minus ESTR Mar27) | same, one year ahead |
| L-US | SR3Z6 alone (change in bp) | US leg only |
| L-EU | IZ6 alone and ER3Z6 alone | euro legs only |
Each contract's history runs from its listing; a pair's window is the overlap of its two legs with Nasdaq (OANDA CFD cache to 2026-08-20, CME NQ futures moves afterwards, as in all earlier studies), to 2026-10-09. Splits as before (in-sample 2024-04-15 to 2025-03-31, validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 on). If a pair's history starts after 2025-01-01 its in-sample part is shorter than 3 months: that pair is reported descriptively and cannot count toward a pass (underpowered, not negative).

## Tests (identical code to the earlier registered tests; nothing is retuned per pair)
- **T1 same-hour link**: correlation of the 1-hour line change with the Nasdaq 1-hour return, its R-squared, and the share of days on which the rolling 20-day correlation is below zero (stability). A pair is a "better contemporaneous proxy" only if it beats P0 on R-squared AND stability in validation and out of sample with a day-block bootstrap CI on the difference excluding zero.
- **T2 lead grid**: line change over W in {15 min, 1 h, 4 h} against Nasdaq's next H in {15 min, 30 min, 1 h, 2 h, 4 h, 8 h, 24 h, 48 h}, day-clustered t, BH-FDR 10% in-sample, confirm same sign one-sided p < 0.05 in validation and out of sample (COG-VIDEO-CLAIMS rule).
- **T3 turn events**: primary k = 0.75, families A0 (all confirmed turns), A1 (up-turn while Nasdaq down), A2 (up-turn while Nasdaq consolidating); matched controls by Amendment B (exclusion only around the event's own window), shifted-line placebo (200 draws, mean near zero required), Nasdaq-only regression increment, day-block bootstrap, validation and out-of-sample gates of COG-TURN-EVENTS.
- **T4 interpretable sequence**: the a-priori primary spec of COG-SEQUENCE-EVENTS (trigger 0.5 theta, second push 0.5 theta, window 16 bars) with its gates; the 36-spec grid and selection-aware placebo only for the best-looking pair.
- **T5 flexible model**: the walk-forward boosted trees of COG-SHAPE-AGNOSTIC (identical hyper-parameters), M0 Nasdaq-only versus M1 with the pair's multi-scale shape, targets 4 h direction and 2 h volatility, 60 shifted-line placebo draws, economic gate included in the verdict this time.
- **Legs alone** (L-US, L-EU): T2 and T5 only (a single leg has no turn-confluence story of its own).

## Correction across pairs and consistency
Pairs and legs are 4 pairs + 3 legs = 7 candidates. BH-FDR 10% across all candidate x test p-values from validation and out-of-sample combined (the weaker of the two halves' p). **Consistency rule**: because P1 / P2 / P3 / P4 share legs and period logic, a real effect should appear in more than one of them; a finding in exactly one pair is labelled exploratory and cannot promote itself. A finding must also appear with the same sign in the reference pair P0 or be explained by a pair-specific reason named before it is seen (none is named now).

## Pass rules
For each candidate and test, the gates of the cited earlier registration are used unchanged, including the economic gate (net of 1.0 bp, day-clustered lower bound above zero, else "context only") and the volatility gates (matched, placebo, Nasdaq-only regression, release-bar exclusion). A pair is reported as **better than C.OG's pair** only if it passes a test that P0 failed under the same gate AND the consistency rule holds.

## Honest limits
Contract-month robustness is still untestable for each pair taken alone before the December 2026 roll. No untouched sample exists for any pair; the forward record from 2026-10-15 is the untouched test and should be run for the single best-looking pair, registered before the record starts. Contracts listing later than C.OG's pair (the Dec and Mar ESTR contracts in particular) will have fewer in-sample days and lower power; the power statement (smallest detectable correlation / IC gain) is printed per pair.

## Not built
No live signal. A pass leads to a registered forward paper record for that pair only.
