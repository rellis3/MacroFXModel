# Vote Atlas v4 — Stage 0 pre-registration (base rates)

Written and committed 2026-09-29 **before** any Stage 0 number was computed. The
pass rule below is fixed; results are judged against it, not the other way round.

## Why this exists

Vote Atlas v1–v3 reported Sharpe ≈3.6 for months. The number was produced by a
feature (`prevOutcomeSameDay`) that equalled the trade's own outcome on ~66% of the
touches where it fired (fixed in 34d3438). Honestly re-run, v1's 30+ dimension vote
had a gross edge of +0.010R per trade against 0.05R of cost, and a monthly
walk-forward was negative on 13–14 of 17 pairs. v4 starts from the lines the owner
actually trades and asks the cheapest question first: **is there any edge at these
lines before any conditioning?** If a line family has none, 30 filters will not
create one.

## Lines (js/voteAtlasV4Lines.js)

The Vol Forecast v3 "Forecast p50/75/90" export as drawn by
`pine/cog_volatility_v3_sessions.pine`, reproduced to ≤0.02pp against the owner's
NAS100 chart for 2026-09-29 (`scripts/v4/parity_screenshot.mjs`):

| Family | Lines |
|---|---|
| OH/OL p50, p75, p90 | open × (1 ± oh/ol%) |
| Close p50, p75 | open × (1 ± oc%) |
| Proj p50, p75 | Proj H = running low × (1 + hl%), Proj L = running high × (1 − hl%), extremes through bar k−1 |

Open = first M1 bar at/after 00:00 Europe/London. σ = `forecastSigma` over completed
17:00-New-York daily bars, `buildLadder` with the day's event tag.
Causality is enforced by `js/voteAtlasV4Lines.test.mjs` (truncation + future-scramble).

## Event tags — two runs, verdict must agree

- **(a) calendar proxy**: `calendar_events.csv` (USD/EUR/GBP only, 2014-01-02 → 2026-07-02),
  mapped onto the export's buckets (FOMC / NFP / CPI / high / none). Dates outside
  coverage → unknown → ×1.0. This is NOT the ForexFactory history the multipliers were
  fitted on (not available in this environment), so it is an approximation.
- **(b) all `none`**: the assumption Vote Atlas v1–v3 used.

## Sample

17 pairs (the "recommended" set): eurusd gbpusd usdjpy audusd usdchf euraud eurchf
audjpy cadjpy chfjpy gold nq spx dow us2000 de30 uk100. Last 10 years of M1 in R2.
First touch of each line per London day. Halves: **H1 < 2021-09-28 ≤ H2**.

## Outcome (no parameters fitted on this data)

Entry at the line on the touch bar k. Symmetric barriers at ±b from the line,
b = m·σ_day·open, **m ∈ {0.25, 0.5} both reported, fixed in advance**. Resolution is
checked from bar k+1 (the touch bar's own intrabar path is unknowable). A bar that hits
both barriers is `ambiguous` and scored −1 for whichever trade is being evaluated
(conservative). Unresolved at the London day's last bar → marked to that close in R,
clipped to [−1, 1].

- fade R = +1 if the barrier back toward the open is hit first, −1 if the barrier
  beyond the line is hit first; follow R = the mirror.
- **net R = gross R − cost/b**, cost = `costForPair` round-trip %.

Control: one random static level per side per day at open × (1 ± u·hl_p75%),
u ~ U(0.2, 1), seeded by date — what "just any level" looks like under the same rules.

## Pass rule (per family × direction × m)

A family passes Stage 0 in a direction only if ALL hold, under BOTH tag runs:

1. mean net R > 0 in H1 **and** in H2;
2. pooled t ≥ 2.0 over the full sample;
3. net R > 0 on ≥ 11 of 17 pairs.

28 tests are run (7 families × fade/follow × 2 m), so ~1 false pass at t ≥ 2 is
expected by chance; rules 1 and 3 are the guard against that.

A family that fails but shows **gross** |mean R| with t ≥ 3 is carried into Stage 1
(conditioning) as "signal present, costs too high unconditioned". Everything else is
dropped from v4.
