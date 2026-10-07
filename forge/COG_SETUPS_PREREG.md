# C.OG's two setups at his own lines, and which DIRECTION to take them in

*Pre-registered 2026-10-07, before any trade was simulated. Owner: "yeah why not. The interesting thing I need is the trend
around direction and why/how we trade it."*

## Where this comes from

Checked against his own published reference forecasts (KV `vol_reference_<date>`, 72 days 2026-06-11 → 2026-10-05,
saved from the ref box on vol-forecast-v3):

- **Setup A (median-line fade):** his EURUSD buys filled at his ↓median O-C line (24 Sep: line 1.13597, fill 1.1360; 11 Sep:
  line 1.15907, fill 1.15866); NQ 9 Sep line 29302.5, fill 29315.6. Small exits back toward the open.
- **Setup B (London-midnight retest):** gold 28 Sep sell at 4250.4 with the stop 4258.4 just under the London open 4260.3; gold
  3 Sep buy at 4383.9 on the open 4384.8, stop 4378. Tiny stop (~0.1σ) beyond the open, far target (28 Sep: 4143 ≈ his 90th line).

Direction on his six trades (inference only, n = 6): the line trades were fades whatever the 20-day trend (EURUSD 24 Sep bought
against a −2% month); both retests went the way of the PRIOR DAY (3 Sep after +1.3%, 28 Sep after −0.6%). Six trades cannot
pick a rule, so the rules below are fixed now and tested on ten years.

**His σ cannot be rebuilt exactly.** Against his 72 published days, 30-day close-to-close σ on London closes matches his level
only after a scale (his/ours: EURUSD 1.25, GOLD 1.15, NQ 0.98) and tracks his day-to-day changes poorly (corr 0.5 FX/gold, 0.1
NQ); his line/σ ratios are stable (O-C median 0.68 / 0.78 / 0.73 × σ). So the ten-year test uses **his formula on a rebuilt σ**
(CC-HV(30) × that per-instrument scale, causal), not his exact numbers. His exact published lines are scored separately on
the days we have M1 for (2026-06-11 → 2026-08-20), descriptively only (n ≈ 50 days per instrument, no verdict).

## Data

EURUSD, GOLD, NQ (the three he publishes). Local M1, London sessions 00:00–22:00, 2016-10 → 2026-08-20. σ (daily fraction)
= CC-HV(30) of London closes strictly before the day × the scale above. Lines from the London open: median = 0.74σ, 75th =
1.24σ (his COG_CONST). Costs `costForPair` (eurusd 0.008%, gold 0.02%, nq 0.008% round trip).

## Setup A — fade at his median line

- Limit **buy at open × (1 − 0.74σ)** / limit **sell at open × (1 + 0.74σ)**; one of each per day at most.
- **Stop** at his 75th line (1.24σ from the open, i.e. 0.5σ beyond the entry). **Target** halfway back to the open (0.37σ).
- Otherwise out at 22:00. Fills 00:00–21:00. Breakeven before costs: 57.5% targets.

## Setup B — London-midnight retest, in the breakaway direction

- **Breakaway:** price first trades ≥ 0.37σ (half his median) away from the open, before 16:00.
- **Retest:** after that, price trades back to the open (before 20:00). **Enter at the open** in the breakaway direction.
- **Stop** 0.1σ the other side of the open. **Target** his 75th line in the breakaway direction (1.24σ from the open).
  Otherwise out at 22:00. One trade per day.
- **Mirror control:** the same retest taken AGAINST the breakaway (stop 0.1σ, target the 75th line the other way).

## Fills (both setups)

M1 bars. On the fill bar a stop that is also touched counts (stop first); the target counts from the next bar. R = net result
÷ stop distance, after cost.

## Direction rules (the question) — applied to each setup's trades

| rule | take the trade only if its side… |
|---|---|
| **none** | every trade (the baseline) |
| **T20-with** | = sign of the 20-day return to the prior close |
| **T20-against** | = the opposite of it |
| **P1-with** | = sign of the prior day's close-to-close move |
| **P1-against** | = the opposite of it |

Setup A's side is the trade's (+1 = buying the ↓ line). Setup B's side is the trade's (the breakaway direction).

## PASS (per setup × rule, the three instruments pooled; 10 primary tests)

1. Mean net R > 0, its 95% month-block bootstrap interval above 0, surviving **Holm** across the 10 tests (Setup A × 5 rules,
   Setup B × 5 rules).
2. For a direction rule (not **none**): rule minus **none** > 0 with its interval above 0.
3. Positive in both halves (2016-10 → 2021-08 and 2021-09 → 2026-08).

Reported, not deciding: per instrument, his 13:00–16:00 UK window, Setup B's mirror, his exact published lines (2026 days).

## What it decides

- **A rule passes:** that setup + that direction becomes a real Signal Journal alert ("BUY EURUSD at 1.13597, his ↓median,
  stop …, target …" / "SELL GOLD on the London-open retest 4260, stop …, target …") as a paper forward test first.
- **Nothing passes:** neither setup, in any of these directions, is an edge on its own. His results would then come from
  something we can't see (his macro gates / discretion), and we say so.

Stopping rule: one logged variant per setup at most. Output `analysis/output/cog_setups/RESULTS.md`; scripts
`scripts/cog_setups/build.py` + `score.py`.
