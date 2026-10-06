# Layer 5 — REMAINING TRAVEL: from here, with the time left, how far can price still go?

Part of `plans/FORECASTER_SYSTEM_BLUEPRINT.md`. Written 2026-10-06 before any builder exists. Frozen; changes only by
dated amendment before results.

## Why this is layer 5

Layer 4 (forge/PATH_MAP_SPEC.md) found price around the HAR lines path-neutral: real lines race exactly like control
lines in all 314 cells. The lines carry **distance**, not direction, and what changes through the day is **time and
travel left** (a p50 touch is the day's extreme 23% of the time in the morning, 74% after 20:00). So the decision layer
is a forecast of remaining travel, which later places targets and stops; it takes no side.

## The quantity

At checkpoint t (London 01:00, 03:00, …, 21:00, on the hour), with price P_t, running high H_t / low L_t, open O and
the session's HAR σ (daily, from `analysis/output/ladder_candidates/d1/<SYM>_har800.csv`, as layer 3), all in units of
σ·O:

| target | definition |
|---|---|
| **up** | (highest high after t to session end − P_t) |
| **down** | (P_t − lowest low after t to session end) |
| **new high** / **new low** | how far beyond H_t / L_t price goes after t (0 if it does not) — reported, no rule |

Data: OANDA M1 (`plans/DATA_SPEC.md`), London sessions with ≥ 600 bars, 34 instruments, 2016-05 → 2026-08.

## Candidates (each a σ-scaled quantile model; quantile multipliers fitted on train only)

forecast_q(t) = m_q × σ × s(t), with m_q per class (fx majors, crosses, gold, indices) × side × rung, and:

- **R0 clock**: s(t) = √(hours left ÷ 24).
- **R1 vol-time**: s(t) = √(share of the day's variance still to come at t), the intraday variance profile estimated
  per class on train (mean squared 1-min return by London minute-of-day).
- **R2 vol-time + today so far**: R1 with σ updated by what the day has done so far:
  σ_t = σ^(1−w) · σ̂_sofar^w, σ̂_sofar = realised vol so far ÷ the variance share elapsed (annualised the same way),
  w = elapsed variance share × k, k ∈ [0, 1] fitted on train per class (one number).

Train = sessions < 2025-09-05 (same split as layer 3). Test = 2025-09-05 → 2026-08.

## Scoring (test window, date-clustered)

- **PRIMARY — calibration by time of day and regime:** exceedance of p50 / p75 / p90 for up and down, in 5 checkpoint
  bands (01–05, 07–11, 13–15, 17–19, 21) × 3 regimes (HAR σ ÷ its trailing 250-session median: quiet < 0.85 · normal ·
  busy > 1.15). Mean |exceedance − target| over the 90 cells (5 × 3 × 3 rungs × 2 sides).
- **SECONDARY — sharpness:** p50 + p75 pinball vs R0 (median per-instrument ratio).
- **PASS:** a candidate passes if its 90-cell miss is ≤ 2.5pp and no band × regime cell is off by more than 5pp at p75
  or p90. Among passing candidates the lowest pinball is preferred. If none passes, the best is reported with the
  cells it fails.
- Reported, no rule: per class, new-high / new-low distributions, and the same by "range used so far" (layer 4's
  variable) as a check that remaining travel shrinks as the day's budget is spent.

## Variant log (Lesson 2)

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | R0, R1, R2 as above | 2026-10-06 | registered |
