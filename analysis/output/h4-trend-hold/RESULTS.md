# h4-trend-hold: 07:00 entry on the 4h trend, 21:00 review, vs Max Cole

**EXPLORATORY, not pre-registered** (owner 2026-11-14). OANDA H1 mid from the dashboard feed, 13 instruments (gold, 9 FX, NAS100/SPX500/US30), 2026-02-26 to 2026-11-12. 1R = 1 daily σ stop; 0.03R cost per round trip. Rule and readings in the script docstring. Aggregates only.

## All instruments, every weekday

| Window | Variant | Trades | Total R | Mean R [±1 SE] | Win | Avg nights held | Gold / FX / Indices mean R |
|---|---|---|---|---|---|---|---|
| pre-lockbox (2026-02-26 → 2026-08-20) | DAY | 1637 | -68.2 | -0.042 [±0.025] | 44% | +0.0 | +0.041 / -0.057 / -0.024 |
| pre-lockbox (2026-02-26 → 2026-08-20) | HOLD | 856 | -91.9 | -0.107 [±0.052] | 31% | +0.9 | -0.037 / -0.100 / -0.151 |
| lockbox-to-max (2026-08-21 → 2026-10-06) | DAY | 429 | +3.6 | +0.008 [±0.050] | 44% | +0.0 | -0.238 / +0.003 / +0.108 |
| lockbox-to-max (2026-08-21 → 2026-10-06) | HOLD | 185 | +22.3 | +0.120 [±0.126] | 36% | +1.3 | -0.493 / +0.310 / -0.214 |
| max-period (2026-10-07 → 2026-11-12) | DAY | 351 | -32.1 | -0.091 [±0.054] | 45% | +0.0 | +0.124 / -0.117 / -0.087 |
| max-period (2026-10-07 → 2026-11-12) | HOLD | 181 | -55.4 | -0.306 [±0.090] | 29% | +0.7 | -0.117 / -0.377 / -0.171 |

## Head to head on Max's instrument-days (his first signal per instrument per day, crypto excluded)

| Variant | Instrument-days | Our R (total, mean) | Max first signal R (total, mean) | Max all signals that day (total) | Same side |
|---|---|---|---|---|---|
| DAY | 49 | -0.9, -0.018 | +10.6, +0.216 | +7.2 | 84% |
| HOLD | 26 | -6.5, -0.250 | +16.6, +0.638 | +15.1 | 81% |

Max's whole record on these instruments over the period (every filled signal): 86 trades, +7.2R, mean +0.084R.

## Reading (exploratory)

- **The 4h trend on its own loses.** Over every weekday on 13 instruments it loses in the longest window, before the
  lockbox date (−0.04R a trade, day only), and in Max's five weeks (−0.09R). It is around zero between them.
- **Holding overnight is worse**, not better: −0.11R and −0.31R a trade. The 21:00 "still the same trend" check keeps
  trades open into reversals, and the win rate falls to about 30%.
- **On the days Max traded, he beats the rule although he picks the same side about 84% of the time.**
  - Day-only: same 49 instrument-days, −0.9R for us vs +10.6R for his first signals.
  - Hold: 26 days, −6.5R vs +16.6R.
  - So his edge is not *which way*. It is **which days and markets he picks, when he gets in, and how he gets out**:
    his trades are at market around London, with his own stops, closes and swings.
- **What this changes**:
  - Our trend-following bias, traded mechanically from 07:00, does not beat Max. On this evidence it should not
    replace his signals.
  - The direction call alone (his or ours) is not where the money is. Timing and selection are.
  - The bias-scoreboard keeps `h4-trend` as a forecaster, and it should score below Max on R even where it ties him on
    direction.
- Limits: OANDA mid prices, a fixed 0.03R cost, a stop at 1 daily σ, nine months, one rule (the reading that matched
  Max). The window after 2026-08-21 is the lockbox and is reported for comparison only. Not a validated result.
