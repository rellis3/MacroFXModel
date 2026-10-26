# Pre-registration: does the dealer hedge-flow schedule say where the day's range extends?

Written 2026-10-26. Frozen once committed. Nothing in this file has been run.

## What is being tested

`hedgeFlow()` in `js/greekLayers.js` (OI Lab card 05e) computes, for every price P near spot, how much the dealers' option
book forces them to buy or sell in the underlying on the way from spot to P:
`flow(P) = -(D(P) - D(spot)) x spot`, D = net dealer option delta, dealers long calls and short puts, instantaneous move
(time and vol held). Positive = dealers buy; the move is **reinforced** when they buy as price rises or sell as it falls,
**damped** when they do the opposite. It is the "dynamic hedging requirement / conditional feedback loop" picture made
explicit. The card is context. This prereg decides whether it earns any role beyond context.

## Prior art (grep'd before writing, per the repo rule)

- `GEX_RANGE_BROWNIAN` / `GEX_RANGE_ES` / G2 (cog gates verdict): the **sign of net gamma** predicts next-session range
  (long gamma narrower). Real, and the only tested positioning-to-price link. The schedule's slope at spot is the same
  quantity seen through delta, so the sign of the slope at spot is NOT new and is only a control here.
- `WALL_PLACEBO`, `24_ripple_walls_placebo`, `LEVEL_TYPES_PLACEBO_PREREG` (registered, not run): walls and flips did not
  beat placebo levels as touch/reaction points. Direction from positioning is null (G3, `project_cog_setups_direction`).
- `ZERO_GAMMA_DISTANCE`: distance to zero gamma added nothing beyond the sign (underpowered).
- Nothing tested the **size or asymmetry of the flow to either side of spot**. That is the new content.

## Data

Same as 17: `OI Data/*.csv` per instrument, per strike, per expiry, per right (open interest), T-1 lag (OI(D) is public
mid D+1), `Oanda Parquet Files/*_m1.parquet` for the session path. Flat ATM sigma per expiry from the stored CME IV
settlements (`project_iv_from_settlements`), the same path 18 used for gamma history. Sessions are London calendar days,
00:00-22:00 London, weekends out (data-rules). Sigma for scaling is the NY-close daily-bar sigma built from M1.
Sessions after 2026-08-21 are the lockbox and are not scored. 7 FX/gold instruments are one sample; NQ and SPX (about
1,520 days of Databento chains) are a second, longer sample for indices. Never pooled.

## Features (computed from the T-1 book, expiry set = the strongest-DTE bucket the indicator uses, and separately <=3 DTE)

- `G0` = sign of the slope at spot (control; equals the gamma sign).
- `Fu`, `Fd` = |flow| at +1 and -1 expected move (sigma of the day, as in the export), and `Au` / `Ad` = whether each side is
  reinforcing (1) or damping (0).
- `Lop` = log(Fu / Fd), the lopsidedness.
- `Fm` = (Fu + Fd) / 2 in units of the book's total open interest notional (scale-free across days).

## Tests

T1 **Size beyond sign.** Session range HL / sigma regressed on `G0` and `Fm`; the question is the coefficient on `Fm` given
`G0`, cluster bootstrap by (instrument, ISO week), 2,000 reps. Pass = coefficient sign as expected (more flow, wider range
when reinforcing, narrower when damping, i.e. an `Fm x G0` interaction) with the CI excluding 0.
T2 **Where the extension goes.** Paired within day: excursion beyond +0.5 sigma and beyond -0.5 sigma from the session open
(MFE in sigma units, 00:00-22:00 London), difference between the reinforcing side and the damping side, on days where
exactly one side is reinforcing. Pass = reinforcing side extends further, difference > 0, CI excluding 0, size at least
0.05 sigma.
T3 **Lopsidedness.** Does `Lop` predict the sign of (session high excursion minus session low excursion)? Registered as a
DIRECTION-ADJACENT test and expected null (G3). A pass here is reported as surprising and gets its own replication before
any use.

## Placebo (primary control)

For every real day the schedule is recomputed three ways and T1-T3 are re-run on each, same code path:
(a) **strike-shifted book**: all strikes moved by +-2 and +-4 listed increments (same OI shape at the wrong prices);
(b) **neighbour-day book**: another day's book from the same instrument within +-5 sessions, re-centred on today's spot;
(c) **sign-flipped book** (calls and puts swapped), which must flip T1/T2 if the mechanics are right (mechanical check, not
evidence).
PASS requires the real-book statistic to beat the (a) and (b) placebo distributions at the 95th percentile AND to hold in
both halves of the sample split by date AND to pass in at least 5 of 7 instruments (FX/gold set) or in both NQ and SPX.

## Decision rules

Effective n is days, not hours. A cell with fewer than 400 independent days is UNJUDGEABLE, not null. Multiple testing: 3
tests x 2 expiry sets x 2 samples are all logged here; verdicts use Benjamini-Hochberg FDR at 0.10 across the family. A pass
is then run through the execution-feasibility gate (spread / ATR below 0.15) before anyone says tradeable; passing placebo is
a finding about range, not a strategy.

## What would change a decision

- T1 and T2 pass: the 05e card gets a "range expectation" line and the OI-level shadow plan may use flow asymmetry as a
  sizing or side filter (own prereg).
- Only the sign control passes: the card stays as context and says so. No role beyond what gamma sign already has.
- T3 passes: replicate on the forward record before anything.

## Outputs

`scripts/29_hedge_flow.py`, `data/results/hedge_flow.json`, `HEDGE_FLOW_RESULTS.md`.
