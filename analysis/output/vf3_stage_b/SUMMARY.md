# VF3 Stage B: summary for review (2026-10-10)

**Registration:** `forge/VF3_STAGE_B_PLAN.md`.

**Detail:**
- `PART1.md` (daily forecasts, 52,486 instrument-sessions, 2020-08 → 2026-08, out-of-sample rows);
- `PART2.md` (bot's COG lines as shipped);
- `PART3.md` (the page's intraday probabilities, 2022–24).

**Nature of the evidence:** all results are **retrospective on previously explored data**, not independent confirmation. The lockbox was not touched, and nothing after 2026-08-20 was read.

## 1. Which existing forecast to trust

Pinball ratio vs the production export rebuilt point-in-time (P). Below 1 is better. 95% date-block intervals.

| Forecast | All 12 rungs | H-L | O-C | O-H | O-L | HL p75 regime miss (P: 6.1pp) |
|---|---|---|---|---|---|---|
| S persistence (all 34) | **0.977** [0.971, 0.982] | 0.954 | 0.983 | 0.986 | 0.985 | 2.3pp |
| H HAR-800 (all 34) | 0.980 [0.973, 0.986] | 0.960 | 0.987 | 0.985 | 0.988 | 2.4pp, but **event-day miss 15.9pp** (no event term) |
| C incumbent COG, the bot's lines (all 34) | 1.073 [1.058, 1.089] | 1.106 | 1.064 | 1.067 | 1.054 | 7.5pp; systematically too wide |
| **SI persistence + IV** (IV-13) | **0.960** [0.950, 0.969] | **0.922** | 0.972 | 0.973 | 0.976 | 1.9pp |
| I IV-adjusted (IV-13) | 0.968 [0.961, 0.974] | 0.936 | 0.977 | 0.981 | 0.979 | — |
| IV pure implied (IV-13) | 0.982 [0.972, 0.991] | 0.963 | 0.988 | 0.993 | 0.984 | — |

**Answer:** the **chosen ladder**: persistence + IV where implied vol exists (13 instruments), persistence elsewhere.
- **It beats the production export on every target** (H-L most), corrects most of the production export's regime error (busy days too wide, quiet days too narrow), and S is better on **all 34 instruments**.
- **This confirms FORECAST_PICK's choice against a stricter benchmark** (point-in-time, no parameters applied backwards) and per target.
- The production export itself is well calibrated **on average** (every rung within 0.4pp of target). Its failures are conditional (§2).

## 2. Where it still fails (chosen ladder S/SI, HL p75 exceedance, target 25%)

| Failure | Evidence | Size |
|---|---|---|
| Release days run wider than the lines | S: NFP 31.4%, CPI 27.2% (P: 32.7%, 29.3%) | **NFP +6pp**; the fitted event multipliers under-scale NFP and CPI |
| Weekday correction overshoots | S: Mon 26.0%, Tue 21.7%, Wed 22.0%, Thu 23.2% | 3.3pp max (P: 3.9pp the other way) |
| Year-to-year drift | S: 2022 29.8%, 2023 19.6% | 5.4pp (P: 3.1pp): the persistence term over-reacts in some years |
| Single instruments | S: GBPCAD 32.0%, EURUSD gain only 0.998 | Few |
| **The page's intraday probabilities** (not the daily lines) | Path stats: static ~49%, real 70% → 15% by touch hour (calibration gap up to 16pp). Card "x% to median": predicts 51%, real 26%, and moves the wrong way through the day | Hour-aware tables improve Brier by **6–12%** (path) and **34%** (card) |
| The bot's COG lines (descriptive, not a forecast claim) | As shipped: "median" H-L line exceeded on **26.7%** of days, p75 on 14.2% (indices 15% / 8%) | Lines named median/75th behave like ~p75/~p90 |

## 3. Not scored, by decision or design
- **The production ladder as shipped** exists only from 2026-08-21, and every outcome lies in the unseen forward block (reserved for the IEP/shadow tests; HAR-800 is lockboxed there). Owner decision.
- **Remaining range and consolidation:** the validated tools (Live Range / layer 5, extreme-in, IEP E2) were not rescored, as registered.

## 4. The smallest evidence-based step

**Replace the page's two intraday probability displays (path stats, card "x% to median") with time-aware tables.**
- **Why:** they are the largest measured errors in the system (calibration gaps of 10–44pp), and the validated replacements already exist (T7 band read by checkpoint; Live Range; the hour × consumed table here).
- **Cost:** no new model and no change to any band or bot.
- **Status:** it still needs the prospective shadow check before any page change.

## 5. Proposed Stage C experiments (ranked; none started, each needs registration first)
1. **Time-aware band-hit and "reach the next line" probabilities for V3.**
   - Baseline: J2/K3 as displayed, plus the T7 table.
   - Challenger: the shadow spec's E1-core (distance ÷ σ√time-left, range used).
   - Prospective shadow (spec v2, with the Stage A corrections).
   - Strongest evidence, directly the owner's priority.
2. **Release-day width correction on the chosen ladder.**
   - Hypothesis: refitting the event multipliers on top of S/SI (not P) brings the NFP/CPI HL p75 exceedance within 25 ± 3pp without worsening pinball.
   - Baseline: SI/S; walk-forward.
3. **Consolidation (2 h) probability:** the already-specified E2 shadow (hour term credited +1.05% Brier). Keep, not expand.

**Deferred:**
- weekday overshoot (small);
- persistence over-reaction by year (needs a stability analysis before any hypothesis);
- cross-market spillover;
- the post-release intraday re-forecast (needs point-in-time release data; revisit after item 2).
