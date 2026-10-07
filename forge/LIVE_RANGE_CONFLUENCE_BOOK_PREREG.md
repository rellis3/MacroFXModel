# LIVE-RANGE-CONFLUENCE-BOOK: does the line that moves with the day unlock confluences for fade vs continue?

*Pre-registration, 2026-10-07 (owner approved "go" and asked that the FULL DAY be tracked, not only first touches: Amendment 0 below, made before any build or run). Research only; no live changes;
no Vote Atlas input (every column computed fresh from the local M1).*

## The owner's question, in one sentence
The lines are the exhaustion ZONE where a trade is considered. At that line, do the confluences (time and session of day, volatility and
range used so far, momentum and rate of change into the line, WaveTrend, VWAP, value area high/low, point of control, naked POC, prior
day/week levels, and a meta-label of the day) say **fade or continue**, and does the **moving (hourly re-forecast) line** make those
confluences work better than the **static morning line** did?

## Two sets of touches, built the same way (head-to-head)
- **Moving:** every hourly-drawn line (up/down × p50/p75/p90) first touched in its own hour (the existing replay; grids refit every quarter
  on prior dates only, page σ).
- **Static:** the morning ladder lines (pit OH/OL p50/p75/p90 off the London open), first touch of each line per session.
- **Race (both):** from the touch bar's close, next line out (continue) vs the level behind (fade; p50 → the anchor / open) to 22:00; both-in-bar,
  unresolved and pre-resolved dropped and counted. Net R after spread ÷ σ for each trade; risk = distance to the stop.
- 34 instruments, 2016-03 → 2026-08. Scoring only on out-of-sample dates (see Walk-forward).

## Confluence columns (all causal: bars strictly before the touch bar; oriented toward the line's side; σ units)
1. **Time / state:** hour, session (Asia / London / overlap / NY-late), weekday, regime (trailing σ vs its 250-day median), day-so-far
   volatility (range used ÷ σ; realised 5-minute variance so far ÷ σ²), pace (last-hour range), touch number today, a jump earlier today,
   IV ÷ σ (7 CVOL instruments only).
2. **Momentum into the line:** 15-min, 1-hour and 3-hour rate of change; acceleration; speed of approach; relative tick volume of the approach.
3. **WaveTrend (LazyBear 10/21, 5-min):** WT1 and WT1−WT2 oriented to the line; overbought/oversold flag (|WT1| > 53 oriented); a WT cross in
   the last 3 bars; **WT vs the line:** at a new session extreme, WT1 now below/above WT1 at the previous session extreme (divergence).
4. **VWAP:** price − session VWAP (σ).
5. **Level confluence (the line within 0.15σ of the level; count of stacked levels):** prior-day high / low / close, prior-week high / low,
   week open, prior-session volume-profile POC / value area high / value area low (tick volume, 70% value area), **naked POC** (a prior
   session POC, last 10 sessions, not yet traded through). First pass excludes FVG, Fibonacci and round numbers (phase 2).
6. **Meta-label:** a gradient-boosted model of P(continue) from all of the above, refit every quarter on prior touches only (López de Prado
   meta-labelling: a secondary model deciding which touches to act on).

## Tests and pass rules
**T1 lift.** For each confluence (binary or tercile top vs bottom) × class × rung, the excess continuation (race result minus the random-walk
b÷(a+b) from the close) when present vs absent, date-block 95% interval, both halves of the sample, n ≥ 300 each side. A *real* lift: interval
excludes 0, same sign in both halves, |lift| ≥ 2pp. Count of confluences tested and expected false positives (≈ 5%) reported.
**T2 moving vs static (the owner's question).** For each real lift, the difference between the moving-line lift and the static-line lift (same
confluence, same class, same rung): "the moving line **unlocks** it" if the difference's date-block 95% interval excludes 0, in the direction of
a larger lift, in both halves.
**T3 trade.** Walk-forward by quarter from 2018-04: meta-label model P(continue) on prior touches only. Trade CONTINUE if P > b÷(a+b) + 0.05, FADE
if P < b÷(a+b) − 0.05 (variant: top/bottom decile), else no trade; net R. **PASS** if net R > 0 with the date-block interval's lower bound > 0, positive in
≥ 6 of 8 full years, and better than a random continue/fade pick on the same touches. Run on moving and static touches; the comparison is the answer.
Single-confluence rules (one confluence, one direction chosen on the first 60% of dates, confirmed on the last 40%) are a secondary T3b.
**Reading rule.** Four outcomes, stated in plain English: (a) moving lines unlock a confluence and it trades; (b) moving lines unlock it but it
does not survive costs; (c) confluences matter equally at static and moving lines; (d) none matter. Prior record (static lines): 0 tradeable of 315
cells, no price/level/flow column cleared costs; the burden is on the new line.

## Variant log
| # | Variant | Added | Status |
|---|---|---|---|
| 1 | as above, with Amendment 0 (all passes + full-day tracking) | 2026-10-07 | pending |
| 2 | phase 2: FVG, Fibonacci, round numbers | 2026-10-07 | not run |

Output `analysis/output/live_range_confluence/RESULTS.md`; banked in `js/deskEvidence.js`.

## Amendment 0 (2026-10-07, owner's instruction, before any build): track the full day, not just the first touch

1. **Every pass, not the first touch.** A line can be touched more than once. After a touch the line **re-arms** when a bar closes ≥ 0.15σ back inside
   it; the next bar to reach the line is a new event (up to 5 per drawn line per hour for moving lines, 8 per session for static lines). Each event
   carries its **touch number** for that line. Events are correlated, so every interval is a date-block bootstrap (all instruments of a date together).
2. **What the move did afterwards, for every event (the full-day record):** MFE (best extension past the touch-bar close by 22:00, σ) and MAE (worst
   pullback), minutes to each, the oriented return at +15 min, +1 h, +3 h and at the close, whether the line's side extreme was **held** (final
   extreme within 0.25σ beyond the line), how far the day's extreme finally extended beyond the line, and the minutes from touch to that extreme.
3. **A where-and-when move map (descriptive, no pass rule):** by hour of day × rung × class (and by session, weekday, regime, touch number, and the
   confluences): touch frequency, the share that continue to the next line / fall back / stall, typical MFE / MAE and their timing, how often the
   touch is the day's extreme and when. Moving and static lines side by side. It states what the day does at each line, to read before any trade rule.
4. T1 / T2 / T3 are unchanged except they now use all passes (the first-touch-only subset is reported alongside as a check).
