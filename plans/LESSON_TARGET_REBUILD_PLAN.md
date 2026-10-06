# Rebuild from the lessons' targets: forecast history → jumps → meta-labelling

*Plan agreed in outline with the owner 2026-10-06. Part of `plans/FORECASTER_SYSTEM_BLUEPRINT.md`. Each step gets
its own pre-registration before its results are computed.*

## Ground rules (owner, 2026-10-06)

1. **No Vote Atlas input anywhere.** Its trades, votes, outcomes, configurations and results carried look-ahead
   bias, so they are not used as data, as priors, as a primary model or as a reason to skip a test. The one thing
   reused is the export calculation's line maths, which is the owner's forecast (shared engine files; some carry
   "voteAtlas" in their file name for history only).
2. **Start from what the lesson says each method is for**, not from how we used it before. Earlier analyses may have
   been set up wrong. They are listed after a new result, never used to decide whether to run it.
3. **Point-in-time everything.** Every forecast is what the calc would have said that morning, with parameters
   fitted only on earlier data (walk-forward). The live widths are fitted through 2025-08-19, so any test before
   that date that uses them is in-sample; this plan refits them per fold.
4. Pre-registration, variant log, date-block intervals (Lessons 01–02), as for every layer.

## Step 0 — The forecast history table (the base everything else stands on)

For every London session, about 2016 → latest, all 34 instruments:
- **The forecast:** the Vol Forecast v3 export calculation replayed as that morning would have computed it
  (σ estimator per instrument on NY-close bars closed before London midnight, event tag, widths), with widths
  **refit walk-forward** (each year fitted only on years before it). Side columns, the shadow σ: HAR-800 and
  IV-adjusted (IV-adjusted only from when implied vol exists).
- **What the candles did:** from M1, open / high / low / close, the time of the high and the low, the first-touch
  time of each line, range used at each London hour, and jump measures (overnight gap; largest 5-minute move in σ
  units; realised variance vs bipower variation).
- **Checks:** recent days reproduce the live export (frozen ladders / scorecard); M1 cache refreshed (it was 46 days
  stale); calibration of the walk-forward table matches the in-sample one to within its interval. Data per
  `plans/DATA_SPEC.md`.

## Step 1 — Lesson 01: the forecast's own record as a sampling distribution

Calibration (p50/p75/p90 exceedance) and pinball loss of the table, with date-block bootstrap intervals, by year,
by regime and by instrument class. Output: the layer-3 validation card. This is the yardstick for steps 2–3.

## Step 2 — Lesson 03 §03: jumps (target: "jumps matter for single-step loss"; excess kurtosis)

Questions, in this order:
1. How much of each day's variance is jump vs diffusion (realised variance minus bipower variation; a jump test
   per day)? Per instrument: jump frequency λ, size distribution, excess kurtosis.
2. Are the jumps scheduled (release times) or unscheduled?
3. Does the forecast's tail fail on jump days (p90 exceedance, and how far past it)?
4. Does a jump term (Merton-style λ and size by day type) fix the tail out of sample?
5. Single-step loss: for a stop at distance d, how often does price jump through it, and by how much (gap risk)?
   This feeds layer 7 (stops).

## Step 3 — Lesson 03 §01: meta-labelling (target: "a secondary model learns, from the history of a primary
## model's decisions, when those decisions are likely to be right")

The primary model is **our forecast**, nothing else.
- **3a. Trust the lines.** Primary decision = the forecast's range statement for the day. Meta-label = the chance
  the forecast is right today (range stays inside p75, or which side breaks it), from what is known at the open:
  IV ÷ σ, release calendar, regime, yesterday's forecast error, yesterday's jump, weekday. Benchmarks: the base rate
  and the forecast's own 25%. Judged on calibration and Brier.
- **3b. Act at a line.** Primary = a simple, high-recall rule defined by the forecast (for example, at the first
  p50 touch, take the side of the break). Meta-label = act or skip, and how much. Label = a triple barrier set by
  the forecast lines (next rung vs back level, session end), after costs. Features: time, range used, pace, IV ÷ σ,
  event, jump state. Benchmark: the random-walk share b / (a + b). Pass: out-of-sample precision above the
  benchmark and after-cost mean R of the kept trades > 0, both with intervals.
- **Method (what earlier attempts lacked):** continuous features, a tree model with a logistic baseline; purged and
  embargoed walk-forward (Lesson 01 card 04); overlapping trades weighted by uniqueness; every variant in the
  pre-registration's table before it runs.

## Step 4 — Bring together

Each step's output becomes a shadow layer beside the live pages (Live Range / v3), with its validation card. Nothing
live changes until the owner chooses.

## Order and why

Step 0 first because every later step reads it. Jumps before meta-labelling because jump state is a meta-label
feature. Lesson 02's research-pace tracker runs alongside (it reads the ledger, not this data).

## Status

| Step | Status |
|---|---|
| 0 forecast history | **done** (e2742574): 91,517 sessions, 52,776 out-of-sample from 2020-08-21; reproduction, fold boundaries, sanity, causality 15/15 pass (`analysis/output/forecast_history/CHECKS.md`). M1 ends 2026-08-21 (top-up needs OANDA_KEY). HAR-800 / IV-adjusted side columns not yet added |
| 1b forecast fix | **PASS** (forge/FORECAST_FIX_PREREG.md): persistence + weekday 2.4% better than control [1.9, 3.0], every class and fold; regime miss 5.6 → 1.8 pp; + implied vol 4.0% better on 13 instruments. Next: wire as a shadow export + scorecard column |
| 1 forecast record | **done**: calibrated on all 12 rungs pooled; skill over climatology 4.9% [3.7, 6.2]; in-sample flattery 0.5%. Flaw = regime: busy days too wide (HL p75 19.9%), quiet too narrow (30.6%) → Lesson 03 §02 persistence fix is the next forecast change (`analysis/output/forecast_record/RESULTS.md`) |
| 2 jumps | **done**: jumps 6.6% of variance, only 22% scheduled; FX/gold p90 breaks on jump days (14% vs 7%); p90 event term FAIL; stop gap-risk table for layer 7 (`analysis/output/jumps/RESULTS.md`). Caveat: k=5 jump-day detector has no intraday-seasonality adjustment, so it flags ~96 days/yr |
| 3a meta-label: trust the lines | **done, FAIL as registered** (`analysis/output/meta_label/RESULTS_3a.md`): range skill 4.8% [3.2, 6.6], strong ranking (12% → 46%), but over-confident at the low end; low side PASS (1.6%). Drivers: weekday, release day, IV ÷ σ, recent misses → fix inside the forecast |
| 3b meta-label: act at a line | pre-registered `forge/META_LABEL_PREREG.md` |
| 4 bring together | not started |
