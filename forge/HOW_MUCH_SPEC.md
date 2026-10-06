# STEP B — The "how much" layer: stop and size rules (Lesson 03, Lesson 01 §06)

*Written 2026-10-06, before the numbers below were computed. Part of `plans/LESSON_TARGET_REBUILD_PLAN.md` (END
STATE, step B). Not a hypothesis test: these are decision rules, with their thresholds fixed here first and their
numbers measured from data already built (the Step 0 table, out-of-sample sessions). No new forecasting.*

## What the lessons say

- **Lesson 03 §02:** a volatility forecast's value "bears on how much to hold rather than on which way to bet".
- **Lesson 03 §03:** jump risk "passes through stop orders at prices beyond their limits"; "a portfolio sized on
  volatility alone understates the loss it can suffer in a single step"; it "has to be allowed for in advance".
- **Lesson 01 §06:** size below Kelly on a shrunk edge (analysis/forecaster_lessons/SIZING_NOTE.md: no system-level
  sizing build; the per-trade rule is risk budget ÷ stop distance).

## The unit

σ = the chosen forecast's daily σ (persistence + IV; forge/FORECAST_PICK_PREREG.md), as % of price. In research the
same σ comes from `analysis/output/forecast_fix/live_variant/lines_B.csv` (`sigB`, walk-forward, point-in-time).

## The rules (thresholds fixed now)

1. **Minimum stop distance** per instrument class = the smallest d on a 0.05σ grid where the share of sessions in
   which a **single 5-minute bar** moves more than d is **≤ 5%**. A stop closer than that is crossed by one bar on
   more than 1 day in 20, i.e. it is "jumped", not "reached".
2. **Single-step overshoot allowance** = the **90th percentile** of how far that one bar carried past d, on the
   sessions where it crossed d (σ units).
3. **Size** = risk budget ÷ (stop distance + overshoot allowance), so the planned loss already includes the step
   past the stop.
4. **Weekend:** if a position is held over the weekend, add the **90th percentile Monday open gap** (|gap| ÷ σ) to
   the allowance in rule 3 (Monday opens gap past 0.5σ 9% of the time vs 1.4% Tuesday–Friday, Step 2 Q5).
5. **Short index positions:** indices jump mostly **upward** (Step 2: OH p90 passed 19.1% on jump days vs 10.2%). Use
   the upside overshoot percentile for shorts and the downside one for longs, per class.

Numbers are reported per class (FX majors, FX crosses, gold, indices) with date-block intervals for the crossing
shares. **Honest limit:** the measure is the day's largest 5-minute move, so it is the single-step risk for a stop
that the market's biggest bar passes. It is an upper bound for any particular stop and a fair one for "a stop
anywhere in the day".

## Output

`js/howMuchParams.js` (generated), `js/howMuch.js` (stop + size from σ, price, side, budget, weekend) with tests;
`analysis/output/how_much/RESULTS.md`. Shown on the Daily Plan page (step E). Nothing live changes.
