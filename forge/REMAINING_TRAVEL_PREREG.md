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
| 1 | R0, R1, R2 as above | 2026-10-06 | run: **all FAIL** (90-cell miss 6.7 / 5.7 / 5.8pp; worst cell 16–18pp) — regimes calibrated, time-of-day shape wrong |
| 2 | R3 per-hour multipliers; R4 = R3 + today-so-far (Amendment 1) | 2026-10-06 | run: **R3 near-pass** (miss 1.62pp ✓, worst cell 5.1pp ✗ vs 5.0), R4 miss 1.78 / worst 6.7 ✗ |

## Amendment 1 (2026-10-06, after variant 1, before variant 2)

Variant 1 result (`analysis/output/remaining_travel_fit.log`): every candidate is calibrated across regimes (quiet /
normal / busy p75 exceedance 23–25%, p90 9–10%) but not across the day: one multiplier per class scaled by √(clock or
variance left) runs too wide late (17–21: p75 exceeded 8–16%, p90 2–6%) and slightly tight early (p50 0.55–0.57).
The √-time shape of a random walk's maximum does not match how remaining travel shrinks through the session.

Variant 2 lets the data set the time shape:
- **R3**: multiplier per class × side × rung × **checkpoint hour** (11 hours), scale = σ (no time formula).
- **R4**: R3 × the today-so-far factor of R2 (σ̂_sofar ^ (elapsed × k), k per class refit on train).
Same split, same scoring and pass rule.

Descriptive finding from variant 1 (no rule): remaining travel is LARGEST when the most range is already used
(> 1.4σ so far) at every checkpoint — no "budget spent" effect; busy days stay busy (intraday volatility clustering).

## Results (variant 2, 2026-10-06) — `analysis/output/remaining_travel_fit.log`

Test 2025-09-05 → 2026-08-20: 91,523 checkpoints, 248 sessions, 34 instruments.

| model | 90-cell miss (≤ 2.5) | worst p75/p90 cell (≤ 5.0) | pinball vs R0 | verdict |
|---|---|---|---|---|
| R0 clock √(hours left) | 6.74pp | 17.9pp | 1.000 | fail |
| R1 vol-time √(variance left) | 5.72pp | 16.5pp | 0.996 | fail |
| R2 R1 + today so far | 5.81pp | 18.0pp | 0.989 | fail |
| **R3 per-hour multipliers** | **1.62pp** | **5.1pp** | **0.980** | **fail by 0.1pp** |
| R4 R3 + today so far | 1.78pp | 6.7pp | 0.973 | fail |

R3 by band (up p50/p75/p90 exceedance; target 50/25/10): 01-05 51/25/10 · 07-11 51/25/10 · 13-15 51/25/10 ·
17-19 49/25/10 · 21 51/26/10; down the same within 2pp except 21:00 (57/29/11). By regime p75 23.7–25.1%, p90 9.1–10.0%.

**No candidate passes the pre-registered rule.** R3 is the best and fails on one place only: the **21:00 checkpoint,
downside, p75** (quiet 30.1%, normal 29.8% vs 25%). That cell varies by year (2016 21.7%, 2018 28.0%, 2020 29.5%,
2023 20.5%, 2025 28.9%, 2026 30.0%; train mean 25% by construction), broad across classes in the test year (fx 29%,
gold 37%, indices 28%): the last two hours of the session swing between calm and busy years. The rule is not loosened
after the fact.

Read for the system:
- The √-time shape of a random walk is wrong for remaining travel; the shape must be learned per checkpoint hour. With
  it, remaining travel is calibrated across the day and across regimes everywhere except the session's last hours.
- "Today so far" (R4) sharpens a little (pinball 0.973 vs 0.980) but costs calibration: not worth it.
- No "budget spent" effect: more range used so far means MORE travel to come, at every checkpoint.
- Status: R3 is the working remaining-travel model, **not passed**; the 21:00 checkpoint is flagged unreliable. It goes
  to the shadow screen as a forward check, where the late-session cell can be watched on live data.
