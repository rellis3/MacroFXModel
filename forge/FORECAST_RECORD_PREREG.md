# STEP 1 — The forecast's own record as a sampling distribution (Lesson 01)

*Pre-registered 2026-10-06, before any Step 1 number is computed. Part of `plans/LESSON_TARGET_REBUILD_PLAN.md`.
Reads only the Step 0 table (`analysis/output/forecast_history/`, spec `forge/FORECAST_HISTORY_SPEC.md`). No Vote Atlas
input. Descriptive yardstick for Steps 2–3: it has reading rules, not a pass/fail for a strategy.*

## Lesson 01's point applied

A calibration figure ("p75 exceeded 25% of the time") is one draw. Report it with the spread it would have across
the histories that could have happened, and check it across regimes and horizons (here: years and instrument classes).

## Rows

`oos = 1` sessions only (each forecast made with a spec fitted on earlier data), complete sessions
(`last_min >= 21:00`). Calendar-unknown rows (after 2026-07-02) are kept and also reported separately.

## Quantities

For each line family (OH, OL, HL, |OC|) and rung (p50, p75, p90):
- **exceedance** = share of sessions where realised > the line; target 50 / 25 / 10%;
- **pinball loss** at the rung's quantile, in units of the session's σ_used (so instruments pool).

Two forecasts on the same rows:
- **`pit`** — point-in-time (the honest record);
- **`live`** — today's settings applied backwards (in-sample before 2025-08-20). `live − pit` measures how much
  in-sample fitting flatters the record.

Benchmark for pinball: **climatology** — no σ forecast at all: the rung is the instrument's empirical quantile of
the realised quantity (% of open) over its previous 250 sessions. Both forecasts' losses are divided by the same
session σ_used before pooling. Skill = 1 − pinball(pit) ÷ pinball(climatology).

## Intervals

Stationary block bootstrap over **dates** (all instruments on a date resampled together, so cross-instrument
correlation is kept), mean block 20 sessions, 2,000 replicates, seed 20261006. 95% percentile intervals.

## Breakdowns (each with intervals)

1. pooled; 2. by fold year (6); 3. by instrument class (FX majors, FX crosses, gold, indices); 4. by regime —
σ_used ÷ its own trailing 250-session median, causal: quiet < 0.85, normal, busy > 1.15; 5. by event tag;
6. per instrument (exceedance only).

## Reading rules (fixed now)

- A cell is **miscalibrated** if its whole 95% interval lies outside target ± 2 pp.
- A cell is **unresolved** if its interval is wider than ± 5 pp (too little data to say).
- The forecast **has skill** over climatology if the pooled skill interval excludes 0.
- In-sample flattery is **material** if the pooled `live − pit` pinball interval excludes 0.

## Output

`analysis/output/forecast_record/RESULTS.md` + `results.json`; the layer-3 validation card in
`plans/FORECASTER_SYSTEM_BLUEPRINT.md`. Script `scripts/forecast_history/forecast_record.py`.

## Variant log

| # | Variant | Why | Run? |
|---|---|---|---|
| 0 | as above | registered | — |
