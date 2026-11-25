# jordan-lines-mae: results (exploratory, not pre-registered)

Register row `jordan-lines-mae` (EXPLORATORY, 17336f35). Script `scripts/jordan-lines-mae/run.py` (`summarise` re-runs
the tables). Tables: `mae_table.csv` (instrument × lines × τ, σ and futures ticks), `mae_pooled.csv`, `stacks.csv`,
`stacked_vs_isolated.csv`, `stack_share_by_instrument.csv`, `noise_threshold.csv`, `stops.csv`; log `report.txt`.
Per-touch files are not committed.

## What this covers

This redoes `level-stack-stop` on **Jordan's lines only**: HL, Close+ and Close− (owner, 2026-11-25). OH/OL are our
site ladder's lines and are left out. In that earlier study, including them made Close+/OH pairs look like "stacks" on
65% of touches.

**The lines:**
- **Close+ / Close−:** fixed prices off the 00:00 London open.
- **HL:** a width, so during the day it becomes two **moving** lines:
  - projected high = running low + HL
  - projected low = running high − HL
  - Touching one means the day's range has just reached that HL percentile.

**Method:**
- Each instrument × line uses its own walk-forward QLIKE calc. Control 1 matched the race picks on 100% of line-years.
- Median, 75th and 90th lines.
- Every touch counts, re-armed after 0.1σ back off the line.
- Placebo levels sit at 0.75–0.90 or 1.10–1.25 × the distance.
- 25 futures and 40 CFDs, 2020 → 2026-08-21.
- All results are gross (no costs).

## 1. The MAE table, Jordan-style (futures ticks, 60 min after the touch, median lines)

| | Mean | Median | P75 | P90 | Jordan's 2026-09-26 table (median / P75 / P90) |
|---|---|---|---|---|---|
| GC, Close± | 65 | 35 | 76 | 144 | 33.8 / 76.3 / 86.8 |
| GC, HL projection | 79 | 44 | 93 | 172 | |
| NQ, Close± | 209 | 136 | 275 | 465 | 114 / 161 / 185 |
| NQ, HL projection | 227 | 144 | 286 | 505 | |
| 6E, Close± | 23 | 16 | 31 | 53 | 12.2 / 14.5 / 18.2 |
| 6E, HL projection | 28 | 19 | 37 | 63 | |
| 6J, Close± | 15 | 8 | 18 | 32 | 12.0 / 13.8 / 16.8 |
| 6J, HL projection | 18 | 10 | 21 | 39 | |

**How it compares to Jordan's table:**
- Gold's median and P75 match his almost exactly.
- His tails are much shorter. That is expected if his trades had a stop or a time limit; ours run 60 minutes with no
  stop.

**Units caveats:**
- 6E ticks are half-pips.
- 6J here is the inverted (USDJPY) price, so a "tick" is about 1.15 pips.
- We don't know which unit Jordan used for FX.

**In σ, pooled (60 min):**
- Close± median line: median 0.16σ, P75 0.31σ, P90 0.52σ.
- HL projections run about 15% wider: 0.19 / 0.36 / 0.61σ.
- Wider lines (75th, 90th) overshoot more.

## 2. Stacks as Jordan meant them: a Close± line near an HL projection

- **How often:** a Close± touch has an HL projection on the same side within 0.05σ on **8%** of touches. For HL
  touches the figure is **15%**. So it is the exception, not the rule.
- **Stacked vs isolated real touches:**
  - Close± stacked touches go back 0.25σ before through 0.25σ **2–3 pp less often** (futures −2.1 pp
    [−3.3, −1.2]; CFDs −2.7 pp [−3.5, −1.9]).
  - They also run about 0.025σ further.
- **But a placebo sitting near an HL projection behaves the same way** (line minus placebo within ±1.3 pp in every
  bucket). So the effect is the situation, not a confluence of lines. When Close± meets the HL projection, the day has
  already used its range and is moving.
- **Result in R** (0.20σ stop, 1R): stacked and isolated within ±0.015R, and level with placebo.
- **Answer to Jordan:** two of his lines within a few ticks don't make a stronger level. If anything a Close± touch
  turns slightly less often there, and so does any price in that spot.

## 3. Noise threshold (C.OG's method): none

Take every stop distance X from 0.025σ to 1.5σ. Among the touches that went X through the line, look at the move after
the stop price to 22:00.
- It averages about zero everywhere: futures −0.02σ, CFDs −0.01 to +0.06σ.
- It comes back on 50–54% of these touches.
- Line minus placebo is within ±0.01σ.

There is no distance where adverse movement turns from noise into information, on either Close± or the HL projections.

## 4. Stops: median-MAE ("median ticks") vs fixed σ

- **What the median-MAE stop works out to:** the trailing median 60-minute MAE (W = 10–252 sessions, earlier sessions
  only, every session keyed) is about **0.15–0.17σ on Close±** and **0.17–0.19σ on HL projections**.
- **The result is the same as a fixed σ stop:** about −0.01R gross, line minus placebo within ±0.015R on the Close±
  lines.
- **The look-back window changes nothing.**
- **One clear pattern: fading the HL 90th projection is worse than placebo.**
  - Futures: −0.016 to −0.034R.
  - CFDs: −0.018 to −0.025R.
  - Several confidence intervals sit below zero (e.g. futures, 252-day stop, 1R: −0.034 [−0.061, −0.007]).
  - Win rate is 43–44% against 44–45% for placebo.
  - When the day's range has reached its 90th HL percentile, price tends to keep going rather than turn. That points
    to a **follow** at HL p90, not a fade. It matches the earlier NQ p90 continuation lead.
- **Futures Close± median line:** +0.01R over placebo at 1R with a 0.20σ stop (CI just above zero), before costs. A
  faint lean only.

## What it means

1. **Stop:** size it in σ of the line. About **0.16σ (Close±)** or **0.19σ (HL)** is the median 60-minute overshoot,
   and the P75 is about 0.31 / 0.36σ. In NQ ticks at today's σ, that is a median of about 136 and a P75 of about 275.
   No stop rule creates an edge on its own.
2. **Close± near an HL projection:** it is not a stronger level. Price there is slightly more likely to carry on.
3. **HL 90th projection:** a candidate **continuation** (follow) signal. This is the one place where Jordan's lines
   beat the placebo in a consistent direction. It needs its own pre-registered test with costs.
