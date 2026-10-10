# Level engine, Phase 2: reach, which-first, time-to-reach (registered 2026-10-10, before any Phase 2 outcome is computed)

**Part of:** `plans/LEVEL_ENGINE_ROADMAP.md`.

**Scope (owner):** probability of reaching each eligible level, which level is touched first, and the expected time to reach it, benchmarked against simple distance, volatility and time-remaining baselines.
- **Reach is kept separate from reaction.** Rejection / continuation after a touch is **not** studied here.
- **Safeguards:** S1 frozen; production unchanged; the forward block (`data/m1_forward/`) is not read.

## Levels (registry v1, scope frozen in `plans/LEVEL_REGISTRY_V1.md`)
- **Pre-session** (from data before 00:00 London):
  - pivots, prior high/low (PDH/PDL/PWH/PWL/20-day), 5-day volume profile, swing S/R, swing fib, 15-minute fib clusters, round numbers, VWAP anchors, daily opens (production `sessionConfluenceLevels` + `daily_open`);
  - the export ladder O-H/O-L p50/p75/p90 (`pit_*`, off the London open).
- **Intraday** (available only after they form): today's London open (from 00:00), Asia high/low (from 07:00), London high/low (from 12:00).

## Rows
**Decision checkpoints:** London 03:00, 07:00, 10:00, 13:00, 16:00, weekdays.
- Decision price P0 = the close of the last M1 bar before the checkpoint.
- σ = the session's export σ_daily (`pit_sig_daily`, % of open).

**A level is eligible at a checkpoint if all of these hold:**
- it is available at that checkpoint;
- it has not been traded through since 00:00 London (for pre-session levels: outside the running high-low range);
- its distance from P0 is between 0.05σ and 3σ;
- it is one of the **3 nearest eligible levels of its family on each side** (caps duplicates and size).

## Targets (fixed)
- **Reach:** first touch (M1 high ≥ L above, low ≤ L below) after the decision bar:
  - within 60 minutes;
  - within 240 minutes;
  - by 22:00 London (`end`).
- **Time:** minutes to the first touch, censored at 22:00. Scored as the reach probability at 30, 60, 120 and 240 minutes and at `end` (a discrete survival curve).
- **Race:** at each checkpoint, the nearest eligible level above vs the nearest below (across all families).
  - Outcome: up first / down first / neither by 22:00.
  - A same-minute double touch is **ambiguous**, excluded, and its rate reported.

## Predictions compared
| Id | Reach / time | Race |
|---|---|---|
| **B0** naive geometry | 2·(1 − Φ(d ÷ √(H_cal ÷ 24))); d = distance in σ; H_cal = calendar hours in the window | — |
| **B1** vol-time geometry | 2·(1 − Φ(d ÷ √v)); v = the class's discovery-profile share of the day's variance in the window (IEP profile) | b ÷ (a + b) (driftless random walk; a, b = distances up, down) |
| **M1** calibrated | logistic per horizon on z = d ÷ √v, log z, log v, range used ÷ σ, extension flag (level on the side price has moved toward from the open), London hour, class | logistic on log(a ÷ b), range used, the signed move from the open toward each side (D), hour, class: P(up first \| resolved); a second logistic for P(neither) |
| **M1 + family** | M1 + level-family dummies | — |

**Fitting:**
- M1 fitted on sessions **before 2022-01-01**.
- **E-dev:** 2022-01-01 → 2024-12-31.
- **E-conf:** 2025-01-01 → 2026-08-20 (previously explored data, **non-independent**).

## Metrics
- Brier skill and log loss vs B1 (the stronger baseline) and vs B0.
- Max decile calibration gap (deciles with ≥ 300 rows).
- Time: integrated Brier over the five survival horizons.
- Race: Brier skill vs b ÷ (a + b) on resolved races, and the share "neither".
- **Breakdowns:** class, family, checkpoint, distance band, year.
- **Intervals:** 5-date moving-block bootstrap, all instruments together, 1,000 draws. Rows within a date are not treated as independent.

## Acceptance

**Primary endpoints:** reach-at-`end`, race, time. Holm over 3, on E-conf.

**M1 is accepted for an endpoint if all of these hold:**
1. Brier skill vs B1 has a lower bound > 0 on E-dev and E-conf.
2. Calibration ≤ 3pp on both.
3. No class interval wholly below 0.

**Family invariance (the identity-of-level question, reported, one test):**
- M1 + family vs M1 Brier skill on E-conf, with an interval.
- **If the skill is < 0.3% or its interval includes 0:** "level family adds no reach information beyond geometry".

**Stopping rules:**
- **If M1 fails vs B1:** B1 is the reach model (with calibration monitoring), and Phase 2 stops adding features.
- **If B1 fails calibration:** the class vol-time profile is recalibrated as a separate registered fix, not tuned here.
