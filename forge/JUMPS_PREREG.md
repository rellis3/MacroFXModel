# STEP 2 — Jumps (Lesson 03 §03)

*Pre-registered 2026-10-06, before any Step 1 or Step 2 number was seen. Part of
`plans/LESSON_TARGET_REBUILD_PLAN.md`. Reads the Step 0 table (`forge/FORECAST_HISTORY_SPEC.md`) and the calendar
proxy. No Vote Atlas input; earlier event-layer results are not used as priors.*

## What the lesson says jumps are for

Lesson 03 §03: returns are a diffusion plus jumps arriving as a Poisson process (Merton). Jumps put weight in the
tails (excess kurtosis) and matter for **single-step loss**: a stop is crossed by a jump, not walked to. A forecast
built for the diffusion part can be right on average and still wrong in the tail.

## Definitions (all from the Step 0 table; out-of-sample sessions `oos = 1`, complete sessions)

- 5-minute returns r_i over London 00–22 (264 per session). RV = Σ r_i². BV = (π/2) Σ |r_i||r_{i−1}|.
- **Jump share** = max(0, RV − BV) ÷ RV (the share of the day's variance not explained by continuous movement).
- **Jump day**: the largest |r_i| exceeds **k = 5** times the day's typical 5-minute move, √(BV ÷ 264).
  Variants k = 4 and 6 are logged below and reported as sensitivity, not chosen between.
- **Size** of the jump = largest |r_i| ÷ the session's σ_used (daily σ units).
- **Scheduled**: the jump bar's minute lies within −5 / +15 minutes of a Major release for one of the instrument's
  currencies (calendar proxy; USD/EUR/GBP only; to 2026-07-02). Otherwise unscheduled (or unknown after the
  calendar ends).

## Questions and reading rules

1. **How much is jump?** Per instrument and class: mean jump share, jump-day frequency λ (per year), median and 90th
   percentile size, excess kurtosis of the signed session return ÷ σ_used. Intervals: date-block bootstrap as in
   Step 1. Descriptive.
2. **Scheduled or not?** Share of jump days that are scheduled, per class, with intervals. Descriptive; on its
   answer depends whether a jump term can be known in advance (only scheduled jumps can).
3. **Does the tail fail on jump days?** p90 exceedance (HL, OH, OL) on jump days vs other days, `pit` forecast, with
   intervals. Reading: the tail **fails on jump days** if the jump-day p90 interval lies wholly above 12%.
   Note: a jump day is known only afterwards. Q3 says whether jumps are where the tail breaks; Q4 asks whether
   anything known in advance fixes it.
4. **Does a known-in-advance jump term fix the tail?** Merton's point is that jumps fatten the tail more than the
   middle. Today's event multiplier scales all rungs equally. Candidate: a **rung-specific** multiplier for p90 only,
   per event tag (FOMC, NFP, CPI, high, none, holiday), fitted per instrument inside each walk-forward fold on the
   fold's training sessions only (the multiplier that makes training p90 exceedance 10% given the fold's widths),
   applied to the fold's test year.
   **PASS** if, on test years pooled: (a) p90 pinball on event days (tags FOMC/NFP/CPI/high) improves, with its
   date-block interval of the relative change wholly below 0; and (b) p90 pinball on all days is not worse (upper
   interval bound < +0.5%). Otherwise FAIL, and the equal-scaling event multiplier stays.
5. **Single-step loss (feeds layer 7, stops).** For stop distances d = 0.25, 0.5, 1.0 × σ_used: the share of sessions
   where one 5-minute bar moves more than d, and the share where the open gaps more than d from the previous
   close (Mondays separately: weekend gap). Per class, with intervals. Descriptive.

## Output

`analysis/output/jumps/RESULTS.md`; script `scripts/forecast_history/jumps.py`.

## Variant log

| # | Variant | Why | Run? |
|---|---|---|---|
| 0 | as above, k = 5 | registered | — |
| 1 | k = 4 | sensitivity | reported alongside |
| 2 | k = 6 | sensitivity | reported alongside |
