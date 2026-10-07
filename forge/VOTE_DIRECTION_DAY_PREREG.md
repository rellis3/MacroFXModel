# Does the direction vote predict the DAY, and can a time-exit geometry carry it? (S7)

*Pre-registered 2026-10-08 ~00:45, after S6 (vote ladder monotone: v≥2 −0.019R … v≤−2 −0.082R with the gap; −0.013 … −0.100
without it) and before any of the numbers below were computed.*

## Why

S6 shows the vote ranks line trades correctly but every rung loses, because the line trades themselves lose ~0.05R (a
target 0.37σ away against a 0.5σ stop needs 57.5% wins). A small daily drift is cut off by a small target. Two checks:

## S7a — the vote vs the London session's direction (no line geometry)

EURUSD and GOLD (NQ only has the trend component, so it can never reach |v| ≥ 2), London sessions 2016-10 → 2026-08, local
M1. Daily vote v from the components fixed in forge/DIRECTION_VOTE_PREREG.md WITHOUT the intraday rates gap (T20, yield
book, US−DE 2y momentum, post-FOMC dollar drift), signed as a direction (+ = up). Outcome: log return London open 00:00 →
22:00, in units of that day's rebuilt σ (scripts/cog_setups). Position sign(v) when |v| ≥ 2.

PASS S7a: mean of sign(v)·return (σ units) after cost > 0 with month-block 95% interval above 0, positive in both halves
(2016-10 → 2021-08, 2021-09 → 2026-08). Reported: |v| ≥ 1, hit rate, by instrument.

## S7b — enter at his median line in the vote's direction, exit 22:00

Same days (|v| ≥ 2). At the first touch of either median line (open ± 0.74σ, 00:00–21:00), enter in the vote's direction
(a fade if the touched line is against the vote, a continuation if with it). Stop 0.6σ (the how-much FX minimum), no
target, out at 22:00. R = net ÷ stop. PASS: mean R > 0, month-block interval above 0, both halves.

## Stopping rule

These are the last two tests on the vote. Nothing else is tuned (no thresholds, windows or stops searched). If S7a fails, the
vote's direction content is too small to trade at any geometry and the vote is banked as a ranking only. Output appended to
`analysis/output/rates_residual/RESULTS.md`; script `scripts/rates_residual/vote_day.py`.
