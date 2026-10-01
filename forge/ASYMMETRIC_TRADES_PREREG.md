# Tight stop, far target at the forecast levels — pre-registration

Committed 2026-10-01 before any number below was computed. Every earlier test raced the next line out against the line
behind (≈ 1 : 1). The owner's educator (COG) posts trades with a different shape: on gold, entry at a level around
01:00 UK with a stop a few dollars beyond it and a target a full day's range away (long 4,383.9 / stop 4,378.1 /
target 4,503.5 ≈ 20 : 1; short 4,250.4 / stop 4,258.4 / target 4,142.8 ≈ 13 : 1), held into New York. He also retests
the daily open. That bet is "this level is the day's extreme, and today travels", which is what the range book CAN
forecast (running-extreme and big-day results held out of sample). This tests that shape.

## Entries (bars before the entry bar only; first qualifying event per level per day)
Window: entries from 00:00 to 10:00 London.
- **HOLD** (the long example): price touches a level from the far side and the entry is AT the level, betting it holds.
  Up lines (OH p50/p75, CloseUp p50/p75, ProjH p50) → short; down lines → long.
- **BREAK** (the short example): the first M1 close beyond the level by ≥ 0.05σ; entry at the next bar's open in the
  break direction.
- **Daily open retest:** after price has moved ≥ 0.25σ away from the London day open, the first return to it; HOLD
  only (back the way it went).
## Stop, target, exit
- Stop: the level ± **0.1σ** or **0.2σ** beyond it (against the trade), plus spread charged on entry.
- Targets: **5R**, **10R**, and the **far forecast level**: for a long, the day's OH p75 (from the open); for a short,
  OL p75. A far-level target closer than 3R is skipped.
- Exit at the target, the stop, or the London day's last bar. One bar hitting both = stop.
## Instruments and sets
16 FX/gold pooled; 6 indices pooled (NQ, SPX, DOW, US2000, DE30, UK100). Gold, EURUSD and NQ reported alone.
## Regime (COG's "regime awareness")
Every result also split by the volatility regime the range book already uses: forecast σ ÷ median of the previous 20
days' forecasts < 0.85 quiet / 0.85–1.15 normal / > 1.15 heavy (known before the open). Descriptive, not a pass condition.
## Tests (fixed)
- Grid: {HOLD, BREAK} × {vol lines} plus {daily-open HOLD} × 2 stops × 3 targets = 18 cells per set.
- Report win rate, the break-even win rate for that payoff, net R per trade, and both halves.
- **PASS:** net R > 0 in 2016–22 AND 2023–26, the pooled t-test survives Benjamini–Hochberg 10% across all cells of
  both sets, AND the same cell is > 0 on the other set (FX/gold ↔ indices). Index cells must also be positive on
  their SHORT trades alone (no long-drift passes; see the book's note of 2026-10-01).
- Spread matters here: a 0.1σ stop on EURUSD is ≈ 4.5 pips, so a 0.8-pip spread costs ≈ 0.18R per trade. Reported per cell.
- Self-check: the entry, stop and target of sampled trades unchanged under future-scramble from the bar after entry.

## Amendment (2026-10-01, builds running, no results seen): IV/RV and skew splits
Owner asked about realised vs implied vol. For the 7 CVOL instruments (AUDUSD, EURUSD, GBPUSD, USDCAD, USDCHF, USDJPY,
gold; js/data/cmeCvolEod.json), using only CVOL rows dated before the trade's London date:
- **IV ÷ RV** = previous CVOL ÷ 20-day realised vol of the CVOL `underlying` series (annualised %); terciles from 2016–22.
  Textbook: high premium (nervous, two-way) → HOLD works better; low/negative premium → BREAK works better.
- **Skew alignment**: CVOL `skew` (upvar − dnvar) sign vs the trade direction (+ = the options market is paying more for
  protection in the trade's direction). Terciles of skew × direction.
Both are descriptive splits of the pre-registered cells, reported for every cell, not pass conditions; any pattern they
show would need its own pre-registered test.
