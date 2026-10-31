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

## Amendments

### 2026-10-31 (PRE-RESULTS: nothing in this study has been computed; the script `scripts/29_hedge_flow.py` is written but not run)

Written after the data inventory, before any statistic was computed. Each change narrows or restates; none loosens a pass bar.

1. **Instruments actually available.** Six FX pairs (EUR, GBP, AUD, JPY, CAD, CHF) and NQ. There is no gold chain in `oi_research_book/data` ("7 FX/gold" above was wrong). The ES strike-level surface and its IV file were never built (only its daily master exists), so **ES is not in this pass** and the index route "both NQ and SPX" cannot be met; an NQ-only result is a pointer, not a pass.
2. **FX verdict set = the three non-inverted pairs (EUR, GBP, AUD), pooled.** JPY, CAD and CHF are run and reported but excluded from the verdict, because their call/put convention is unresolved (`GEX_FX_CROSSMATCH_RESULTS.md`, p about 0.005 in both directions). The "5 of 7 instruments" rule becomes: the pooled FX result passes AND the statistic has the expected sign in at least 2 of the 3 individual pairs. FX and NQ are never pooled with each other.
3. **Expiry sets.** The stored surface is per strike with expiries already summed, so the "strongest-DTE bucket" and "<=3 DTE" sets are replaced by the book's own two surfaces: `near` (DTE <= 45, T = front DTE, sigma = front IV) and `all` (every expiry, T = 30 days, sigma = 30d IV), as script 26 does.
4. **Outcome bars.** The book's UTC-D1 bars (`daily_master`, G2's build), not London M1 sessions. Primary lag 1 (target = next row); lag 2 (target the row after) is run as a robustness because OI(D) is only public mid D+1 and the banked ES work showed the honest target is S(D+2). If the two disagree the lag-2 result is the one reported as the verdict. Excursions are from the target row's open, in units of the trailing 20-day daily sigma.
5. **Feature definitions.** `u`/`d` = flow at F*(1 +- sd), sd = rv20/sqrt(252); `Fm = (|u|+|d|)/2 / (F * total OI)`; `Fz` = Fm as a causal expanding z-score per instrument (60-day minimum). `G0 = +1` when `u > d` (net reinforcing). T1 statistic = coefficient on `Fz*G0`, expected > 0. T2 uses days where exactly one side reinforces. T3 = mean(sign(Lop) * sign(up excursion - down excursion)).
6. **Placebo rules made exact.** (a) four strike shifts (+-2, +-4 listed increments, increment = median strike spacing within 10% of F): the real statistic must exceed all four; (b) 200 draws where every day takes a random neighbour book within +-5 sessions (re-centred on today's F): the real statistic must exceed the 95th percentile of the 200; (c) calls/puts swapped is a mechanical check only.
7. **Multiplicity family** = lag-1 FX and NQ x near/all x T1-T3 = 12 cells, Benjamini-Hochberg q = 0.10 on the week-clustered bootstrap p-values (2,000 reps, clusters = instrument-ISO week). The JPY/CAD/CHF group and lag 2 are reported outside the family.
8. **Lockbox.** Days after 2026-08-21 are excluded (the data ends 2026-08-20 / 2026-09-04 anyway). Seed 20261026.
