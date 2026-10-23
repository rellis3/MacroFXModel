# HEDGING PLAN, OI-LEVEL VERSION: do orders on the OI map's own levels do better than orders on the forecast lines?

*Registered 2026-10-23, before any score exists. Nothing in this file has been run. The rules below are frozen; changing one means a new registration.*

## Why

The live plan (`js/hedgingPlan.js`) enters at the p75 open-high / open-low forecast lines, 0.3% to 1.8% from the open, and averaged
-0.03R (NQ) and -0.08R (EURUSD, GBPUSD, AUDUSD) after costs (`forge/GAMMA_REGIME_TRADES_PREREG.md`, `_FX_`). Those lines are a volatility
percentile, not a place where hedging changes, and the plan rarely fills. The structure the OI course and C.OG's 2026-10-18 example use is different:
entries at the map's own levels (wall, zero gamma), a stop about 0.2% beyond, a target at the next level (`education/cog-snippets.md` §2).
Question: does that structure, built as the textbook playbook, add anything over the forecast-line plan?

## The plan (`js/hedgingPlanOI.js`, parameters in `OI_PLAN`)

Inputs per market, at the London open snapshot: spot, the day's forecast σ in price units, the regime (PIN = dealers long gamma, BREAKOUT = short
gamma, from the re-priced hedging map), and the strongest-DTE profile levels (`js/oiProfile.js`).

- PIN: FADE. Sell limit at the nearest call wall above spot; buy limit at the nearest put wall below. Stop 0.25σ beyond the wall. Target: the nearest
  level back toward spot (zero gamma, flip, max pain, gamma peak, node, another wall, expected-move edge) at least 1R from entry; none -> 1σ projected.
- BREAKOUT: FOLLOW. Buy stop 0.05σ above the nearest call wall; sell stop 0.05σ below the nearest put wall. Stop 0.25σ back inside the wall. Target: the
  nearest level further out at least 1R away; none -> 1σ projected.
- A wall further than 1.5σ from spot is not an order. A side with no wall has no order.
- First touch only, one trade a day (whichever side fills first), entries 08:00-20:00 London, anything open closed at 22:00 London.
- Same-minute stop and target counts as the stop. Cost 0.01% of price per round trip.

## What gets recorded (forward only, no backfill: the current OI book on past bars would be hindsight)

Each session at the London snapshot: both plans (this one and the forecast-line plan), frozen. Scored on that session's 1-minute OANDA bars with
`scoreOiPlan` / `scorePlan`. Per market: fills, R per trade, the regime, which level was the entry.

## Tests and decision rules

- **T1, fill rate:** share of sessions where an order fills, per plan. Descriptive. The point of the new structure is a plan that can actually trade.
- **T2, expectancy:** mean net R per trade, day-clustered bootstrap interval, per market and pooled by asset class (indices, gold, FX).
- **T3, against the old plan:** difference in mean R per SESSION (a session with no fill counts 0), same days, paired.
- **T4, placebo:** the identical rules at fake levels (the walls shifted +-1σ, same side structure, same days). The real plan must beat its placebo.
- **PASS** (per asset class): T2 mean > 0 with the interval above 0, AND T3 > 0 with the interval above 0, AND real minus placebo > 0 with the interval above 0.
- Judged only at >= 250 scored sessions per primary market and >= 60 fills in each regime. Before that: counts and descriptive R only.
- A market where spread / ATR is above 0.15 is excluded from the pass rule (`execution feasibility gate`).
- Multiplicity: 3 asset classes x 3 tests logged here; Benjamini-Hochberg at 0.10 across them.

## What a result changes

PASS -> a costed bot proposal, shadow first. NULL or FAIL -> the hedging plan stays a description of how the day may behave (the "it tells you how the
day may behave, not which way it goes" line it already carries) and the textbook structure is retired as a trade idea. No result changes the live plan,
the OI bots, or the indicator.

## Caveats

Hedging direction rests on the assumption that dealers are long calls and short puts. FX hedging is mostly over the counter and CME options are a slice.
Walls and flips did not beat placebo levels in `oi_research_book/WALL_PLACEBO_PREREG.md`; a PASS here would be a different, narrower claim (the plan
structure, not the wall as a magnet), and the placebo in T4 is what separates them.
