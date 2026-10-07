# Rebuild from the lessons' targets: forecast history → jumps → meta-labelling

*Plan agreed in outline with the owner 2026-10-06. Part of `plans/FORECASTER_SYSTEM_BLUEPRINT.md`. Each step gets
its own pre-registration before its results are computed.*

## END STATE (owner asked 2026-10-06: "plan me to something you are aiming at")

**One product: the Daily Plan page.** One row per instrument, every morning, refreshed hourly:
1. **One set of lines** (the forecast layer, FINISHED after step A below). No more line variants.
2. **Room left** — Live Range's hourly remaining-range re-forecast (already built).
3. **Act / skip at a line** — only if 3b passes; otherwise the row says "lines are for stops and targets, not entries".
4. **Stop and size** — from the jump/gap tables (Step 2) and the lines: stop beyond the jump-through zone, size =
   risk budget ÷ stop distance.
5. **Track record** — the forward scorecard for exactly what the row shows.

**Lesson review 2026-10-06 (owner asked "are we on track with the lessons?")** — two drifts corrected:
1. No stopping rule (Lesson 02 practice 01) → five forecast line variants. **Rule from now on: each direction gets one
   pre-registered test + at most one logged variant, then a decision.**
2. Trying to get direction from the forecast (3b). Lesson 03 §02: volatility decides **how much to hold, not which
   way**. Lesson 03 §01: meta-labelling sits on a primary that already chooses direction. 3b stopped before results
   (forge/META_LABEL_PREREG.md Amendment 3).

**Path (each step ends in a decision, not another variant):**
- A. ✅ **DONE 2026-10-06 — forecast work CLOSED** (forge/FORECAST_PICK_PREREG.md): persistence + IV where implied vol exists (live-type IV check PASS: 0.964 of plain, beats persistence by 1.6%), persistence elsewhere (0.980). Shipped as "Forecast · chosen ★" (top of v3 Export + Chart view, scorecard column); IV and IV-adjusted line exports moved to Archived. The plain Forecast stays the production calc (pages/bots read it) until the owner switches. Live Range keeps its own fitted σ (its intraday params were fitted on the plain σ; re-pointing would need a refit — not done, by the stopping rule).
  Original step: **Finish the forecast** (L03 §02): one pre-registered head-to-head on the Step 0 table — persistence + IV vs
  IV-adjusted vs HAR-800 vs plain — pick ONE; the scorecard confirms it forward (L02: the second, independent test).
  Other line exports move to an archive menu. No line work after this.
- B. ✅ **DONE 2026-10-06** (forge/HOW_MUCH_SPEC.md, analysis/output/how_much/RESULTS.md): minimum stop 0.55–0.60σ by class (one 5-min bar crosses it on ≤5% of days; a 0.25σ stop is crossed on 37–48%); worst-case step past the stop p90 0.4–0.8σ (upper bound); Monday gap p90 ~0.5σ vs ~0.2σ other days. `js/howMuch.js` (+ params, tests): size = budget ÷ (stop + step [+ weekend]).
  Original step: **The "how much" layer** (L03's main use, L01 §06 Kelly, L03 §03 jumps): per instrument, stop outside the
  jump-through zone, size = risk budget ÷ stop distance, weekend gap allowance. Rules with evidence attached.
- C+. ✅ **Meta-labelling built properly 2026-10-07 — CLOSED** (forge/META_LABEL_PROPER_PREREG.md): AFML pipeline, 3,144 bets / ~395 effective; forest and logistic both failed the sanity check (could not recover the known |z| effect); volatility features added 0. Effective sample is the limit.
- C. ✅ **DONE 2026-10-06 — FAIL** (forge/META_LABEL_YS_PREREG.md): meta-sizing the yield-spread book on the vol state lowered per-trade Sharpe 0.165 → 0.100 [diff −0.117, +0.006]; top tercile won least. Book stays flat / vol-targeted. Meta-labelling closed for now (stopping rule).
  Original step: **Meta-label done the lesson's way** (L03 §01): primary = the yield-spread book (validated direction edge);
  meta-label = forecast regime, jump state, room left → act / size up / size down. New pre-registration.
- D. ✅ **DONE 2026-10-07** (forge/STABILITY_AND_HOLDOUT_PREREG.md): stability PLATEAU (6 perturbations 0.978–0.983 vs base 0.980); holdout sealed (analysis/output/holdout/SEAL.md), opened once 2027-01-04.
  Original step: **Seal a holdout + parameter stability** (L01 cards 03, 07): everything after 2026-08-21 and the forward
  scorecard are the lockbox, looked at once when A–C are frozen; one stability run on the chosen forecast.
- E. ✅ **BUILT 2026-10-07**: daily-plan.html (chosen-forecast lines, range used, room left from Live Range with its clock/σ caveats, long+short stop and size from js/howMuch.js with budget + weekend, forward track record). Linked from v3 and Live Range.
  Original step: **Daily Plan page**: lines, room left, stop and size, act/size flag (only if C passes), track record.
- F. **Lessons 4–17** check this one product as they arrive.

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
| 1b forecast fix | **PASS + shipped as a shadow** (forge/FORECAST_FIX_PREREG.md): variant 1 (live-computable inputs) 0.980 [0.974, 0.985] of control, regime miss 6.8 → 2.4 pp. Live: `js/forecastLadderPersist.js`, `/api/vol-forecast/persist-ladder/{export,json}`, v3 Export + Chart view "Forecast · persistence-adjusted", forward scorecard column (verdict after 15 sessions). IV arm (C, 0.968) not yet live |
| 1 forecast record | **done**: calibrated on all 12 rungs pooled; skill over climatology 4.9% [3.7, 6.2]; in-sample flattery 0.5%. Flaw = regime: busy days too wide (HL p75 19.9%), quiet too narrow (30.6%) → Lesson 03 §02 persistence fix is the next forecast change (`analysis/output/forecast_record/RESULTS.md`) |
| 2 jumps | **done**: jumps 6.6% of variance, only 22% scheduled; FX/gold p90 breaks on jump days (14% vs 7%); p90 event term FAIL; stop gap-risk table for layer 7 (`analysis/output/jumps/RESULTS.md`). Caveat: k=5 jump-day detector has no intraday-seasonality adjustment, so it flags ~96 days/yr |
| 3a meta-label: trust the lines | **done, FAIL as registered** (`analysis/output/meta_label/RESULTS_3a.md`): range skill 4.8% [3.2, 6.6], strong ranking (12% → 46%), but over-confident at the low end; low side PASS (1.6%). Drivers: weekday, release day, IV ÷ σ, recent misses → fix inside the forecast |
| 3b meta-label: act at a line | **STOPPED before results** (Amendment 3): direction from the forecast conflicts with Lesson 03; meta-label re-aimed at the yield-spread book (step C) |
| 4 bring together | not started |
