# Gold line continuation: parked ideas (do later)

**Parked 2026-11-28 by the owner: "store the ideas and run later; focus on the fade".** Nothing here is built or
registered. Start from this file when continuation comes back.

## What has been looked at (exploratory only)

`gold-line-continuation-explore` (`analysis/output/gold-line-continuation-explore/RESULTS.md`, part B): at the first
poke of Jordan's 8 lines, a **1:1 trade with a tight stop** (±1 rolling-MAE stop, median about $3.40) in the break's
direction wins about 48–49%, the same as at fake lines; negative after costs. Signals tested one at a time: poke candle
closed beyond, 5 minutes accepted, VWAP stretch, approach speed, time of day, day range used (broken as built).

**This only rules out a small 1:1 continuation trade.** It says nothing about the ideas below.

## To run later

1. **MFE / MAE after a break, first (owner's choice):** after price breaks a line (P75, P90 and beyond P90), how far
   it runs on (MFE) vs how far it comes back (MAE) before 22:00, in σ and in $, versus fake lines. Does a break
   beyond P90 run further at real lines? This designs the target and stop for anything below.
2. **Far targets:** next line out, the P90, the forecast HL range end, or hold to 22:00, with a skewed payoff (win
   rate 30–40% can still pay).
3. **Wider stops:** sized from the forecast range or σ, not the fade's tight MAE stop.
4. **Failed fade → flip:** when the fade order is cancelled (price runs 1.2× the stop past the line) or stopped out,
   enter the other way.
5. **Retest entries:** break, come back to the line from the other side, hold, then enter.
6. **Acceptance:** closes beyond the line on 1-minute / 5-minute bars, N minutes without a retouch.
7. **Room left in the day:** rebuilt so it varies (e.g. range used vs the HL P90, or the distance from the line to the
   forecast HL end).
8. **Reach odds to the next line out** (C.OG ladder), **VWAP side / trend**, **time of day** (13:00–16:00 London moves
   about 2× the morning), **approach speed**; then combinations, not one at a time.
9. Same-bar order: count both-hit minutes both ways (pessimistic and optimistic) and say which.

Each would be a removable layer with its own prereg, judged against fake lines, costs on.
