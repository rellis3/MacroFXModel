# macro-h4-blend: macro sets the side, the 4h trend sets the size

**EXPLORATORY, not pre-registered** (owner 2026-11-14). 22 London days (2026-10-14 to 2026-11-13), 198 instrument-days on 9 instruments. Macro had a view on 69% of them; where both spoke, the 4h trend agreed with macro 48%. Days whose Global Read came after 07:00 London (entry moved to the first H1 open after publication): 22. Day trades from 07:00 London (or the first hour after the read) to 21:00, 1 daily σ stop, 0.03R cost. Aggregates only.

## Every instrument-day

| Variant | Trades | Total R | Mean R [±1 SE] | Win |
|---|---|---|---|---|
| MACRO | 137 | +4.0 | +0.029 [±0.087] | 49% |
| H4 | 198 | +4.3 | +0.022 [±0.072] | 49% |
| BLEND | 137 | +3.6 | +0.026 [±0.069] | 49% |
| BLEND+ | 198 | +7.8 | +0.039 [±0.052] | 51% |

## On the instrument-days Max traded (25)

| Who | Trades | Total R | Mean R |
|---|---|---|---|
| Max (all his filled signals those days) | 25 | +2.0 | +0.079 |
| MACRO | 18 | -0.1 | -0.008 |
| H4 | 25 | +3.3 | +0.131 |
| BLEND | 18 | +1.5 | +0.086 |
| BLEND+ | 25 | +2.2 | +0.088 |

## Reading (exploratory)

- **Every version is about flat**: +0.02 to +0.04R a trade, with a standard error of 0.05 to 0.09. Over 22 days none
  is distinguishable from zero or from the others.
  - The blend with the 4h fill-in (BLEND+) is the best point estimate: +7.8R over 198 trades.
  - Macro alone: +4.0R over 137.
  - The 4h trend alone: +4.3R over 198.
- **Macro and the 4h trend are different information.** Where both had a view they agreed only 48% of the time, about
  a coin flip, so the blend is not just the trend relabelled. That is what makes a weighted blend worth recording.
- **Against Max on his days** (25 instrument-days these 9 instruments share): Max +2.0R, BLEND +1.5R on 18 trades,
  BLEND+ +2.2R, the 4h trend alone +3.3R. Too few to rank.
  - Max's big wins over the period (the gold swings, the post-CPI trio) were multi-day holds or fell on days and
    markets outside this overlap, so this table under-counts his record.
- **What it means**: 22 days cannot tell whether macro-led, trend-led or blended bias is better. The forward
  bias-scoreboard records desk-rating and h4-trend on the same rows, so it can score this blend directly (Amendment A2
  of its prereg). That is where the comparison with Max gets its verdict.
- Limits:
  - The Global Read's story lean is an untested macro display (its tested direction arm is neutral on almost every
    day), and desk ratings exist only from 2026-11-03.
  - Day trades only. Every Global Read in this window was published after 07:00 London, so entries moved to the first
    hourly open after publication.
  - All dates are after the 2026-08-21 lockbox.
