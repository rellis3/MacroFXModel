# Forecaster System — blueprint (built from the lessons, layer by layer)

Source: `education/forecaster-portfolio-case-study/` (cog, "Case Study: The Forecaster Portfolio", 3 of 17 lessons
transcribed as of 2026-10-05). **This file is updated every time a new lesson is added**: read the lesson, note what it
adds or changes per layer, then build.

## Purpose: what we are building, why, and to what end

*Agreed with the owner 2026-10-06. Re-read this before starting any piece of work here.*

- **What:** a forecaster system on the course's architecture, separate layers each tested on its own. The base is the
  owner's own volatility forecast (the Vol Forecast v3 export calc), improved, never replaced by a textbook model.
- **Why:** the owner's earlier systems (Vote Atlas, the fade/continue book) fused forecast, decision and sizing into one
  rule, and died of look-ahead bias and untested layers. The course shows how institutions avoid that.
- **What the evidence already says (94 tests, `MD files/TRIAL_LEDGER.md`):** how far price travels is forecastable;
  which way it goes at our lines is not. So the system's value starts as range, room and risk, and any direction or
  confidence layer must earn its place with its own test.
- **To what end:** each day the system says how far price can travel, how much is left, whether to act and how much,
  with an honest record per layer that shows how sure we can be. Run side by side with the live pages; nothing live
  changes until the owner chooses.
- **How we work:** in lesson order. Each lesson section is mapped to a layer, built individually, validated
  (pre-registered, intervals, variant log), noted in the tracker below, then brought together. Each new lesson
  (3 of 17 so far) is read and folded in before building on it.
- **Not the goal:** a quick profit test, a revived Atlas, or a year of paper trading.

Rules for every layer (from the lessons):
- **L3 — one job per layer, tested against its own standard.** A forecast is scored against outcomes, not P&L; a
  decision rule against what it decides; sizing against risk. A good final P&L can hide a weak layer.
- **L1 — every number is one draw from a sampling distribution.** Report intervals (date-clustered or block
  bootstrap), check across regimes, check across horizons.
- **L2 — the breadth of the search enters the evidence.** Every variant tried is logged in its pre-registration's
  variant table before it is run.
- **Side by side** (user rule): new layers run as shadows next to the live system; nothing live changes until the
  user chooses.

The lessons say the Forecaster Portfolio has **seven layers**: the third is volatility forecasting, another applies
meta-labelling, the rest are proprietary. The layer list below is **our inference**, not the lesson's, and will be
revised as lessons are released.

## Layers

| # | Layer | Job | Status |
|---|---|---|---|
| 1 | Data | One definition of a bar, a session and a realised value per instrument; sources fixed; integrity checked automatically | **spec + check built** (plans/DATA_SPEC.md, scripts/data_integrity.mjs); open: stale M1 cache, Yahoo indices, IV-adj refit |
| 2 | Measurement | The quantities everything is scored against: London-day O→H, O→L, H−L, \|O−C\|; intraday path | defined (forge `london22`, vol_session audit) |
| 3 | Volatility forecast | How far price is likely to travel today, as p50/p75/p90 lines | **HAR-800 preferred** (forge/LADDER_CALIBRATION_PREREG.md); live shadow: har-shadow.html |
| 4 | Path dynamics | A descriptive map: given today's lines, where price is, the time, the regime and the range used, what happens next (reach next rung / stall / return), with intervals | **done** (forge/PATH_MAP_SPEC.md, path-map.html): real lines race exactly like placebo lines in all 314 cells (hour, regime, event, class, range used, approach speed, prior-day level, IV÷σ); what varies is time left (held 23% → 74% through the day) |
| 5 | Primary decision | Derived from the layer-4 map. The map shows no fade/continue direction at the lines, so this layer is re-scoped to **remaining travel**: from where price is and the time left, how far it can still go (and so where targets and stops sit) | **built, near-pass** (forge/REMAINING_TRAVEL_PREREG.md): per-hour σ multipliers (R3) calibrated across the day and regimes (miss 1.6pp) except 21:00 downside p75 (30% vs 25%, year-varying) — fails the frozen rule by 0.1pp; √-time shapes fail; no 'budget spent' effect |
| 6 | Confidence (meta-labelling) | Probability the layer-5 call is right; whether to act at all | not started |
| 7 | Sizing and risk | How much to hold; stops; gap/jump risk | sizing tested early (forge/VOL_TARGET_PREREG.md: σ sizing steadies risk, σ choice irrelevant); stops/gaps not done |

## Layer 1 — Data

Faults already found (each would silently corrupt a higher layer):
1. `VolRangeForecaster/data/m1/*_d1.parquet` are **UTC-midnight days with Sunday stubs**; live uses OANDA D (17:00 NY,
   no stub). Use NY-close bars built from M1 (`nyCloseDailyBars`, n ≥ 60). The shipped IV-adjusted export was fitted
   on the stub bars (re-check pending).
2. Live **index σ comes from Yahoo** bars (`preferYahoo`), research from OANDA M1: the same NQ ladder differs page vs
   research.
3. **vol_session audits taken after London midnight** recorded the next session (6 of 14, Sep–Oct 2026). Fix in
   `js/volForecastScheduler.js` (late audit pins the session's own window).
4. vol_session **`oc` is signed**; ladder `oc` rungs are |O−C|.
5. `inverseVolWeights` (`js/levelAtlasVoteReview.js`) uses full-sample variance (lookahead) — outside this system,
   logged for repair.

Deliverables: `plans/DATA_SPEC.md` (definitions + source per instrument) and an automated integrity report.

## Layer 4 — Path dynamics (next after layer 1)

A map, not a trade. Existing pieces to fold in rather than re-test: the ladder rung chain (`/api/vol-forecast/ladder/
path-stats`), the exhaustion clock (EXHAUSTION-SCHEDULE: a new extreme's chance of being final depends on London time,
not distance), the touch race tables (scripts/rangebook), range-used studies (volatilityExhaustion MARKET_STATE).
Conditioning variables: rung reached, London hour, regime (live σ ÷ HAR σ), event tag, range used ÷ HL p50, IV ÷ σ.

## Lesson log

| Lesson | What it adds to the design |
|---|---|
| 01 One path among many | Sampling distributions, bootstrap of paths, regime dependence, horizon aggregation |
| 02 Research has no timetable | Search breadth enters significance; log every variant |
| 03 A system built in layers | Separate forecasting from decision; volatility is the forecastable object (GARCH clustering, persistence/half-life); jumps (Merton) matter for single-step loss; meta-labelling; validate layer by layer |

## Series map (from Lesson 01 §05: which future lesson covers which check)

| Check | Lesson | Check | Lesson |
|---|---|---|---|
| 01 point-in-time data | 5 | 07 parameter stability | 13 |
| 02 in-sample / out-of-sample, walk-forward | 7, 14 | 08 path robustness (bootstrap, placebo) | 1, 15 |
| 03 holdout and lockbox | 14 | 09 regimes and stress | 6, 10 |
| 04 purged / embargoed CV, PBO | 13 | 10 forward evidence, power to detect decay | 16 |
| 05 multiple testing (DSR, Reality Check) | 4, 12 | 11 costs and capacity | 4 |
| 06 significance (PSR, MinTRL) | 11 | 12 a procedure for any record | 17 |

Lessons 11–16 are the validation module. When each lesson lands, its check replaces our interim version.

## Lesson tracker (work through in this order; update the row when a piece is built or tested)

| Lesson § | Topic | Layer | Status | Next |
|---|---|---|---|---|
| L01 §01 | A record is one draw | all | rule adopted | — |
| L01 §02 | Outcome probabilities over a horizon | 3 | **done**: p50/p75/p90 ladder, calibration-scored | — |
| L01 §03 | Sharpe SE, Lo's correction, shrinkage | 3, 7 | partly: `js/backtestStats.js` has PSR/DSR, N never the real search size; shrinkage used in SIZING_NOTE | **1st:** one validation card module |
| L01 §04 | Spread of paths (bootstrap) | 3 | **done for the export calc** (forge/FORECAST_RECORD_PREREG.md): calibrated, skill 4.9% [3.7, 6.2], regime flaw found | same yardstick for any candidate σ |
| L01 §05 | 12-check validation card | all | not built as a card | **1st:** a card per layer, filled for layer 3 |
| L01 §06 | Volatility drag, Kelly | 7 | **done** (analysis/forecaster_lessons/SIZING_NOTE.md): no build, 10% target about 1/5 Kelly | re-check at spread book review |
| L02 §01–§04 | Waiting times, overruns, uncertain rate, cost of search | process | not built | **2nd:** discovery rate and stopping rule from the ledger |
| L02 §05 | Breadth enters the evidence | process | **done**: TRIAL_LEDGER (94 tested, about 5 passes expected by luck) | keep current |
| L02 §06 | Discovery rate declines | process | not built | with L02 §01–§04 |
| L03 §01 | Layers, IR ≈ TC·IC·√BR | all | blueprint; TC unmeasured (no decision layer yet) | after layer 5 |
| L03 §01 | Meta-labelling | 6 | not started. Rebuilt from the lesson's target with **our forecast as the primary**; no Vote Atlas input (owner rule) | plans/LESSON_TARGET_REBUILD_PLAN.md step 3 |
| L03 §02 | Vol clustering, persistence, half-life | 3 | HAR-800 preferred, weekly reverting, IV-adjusted, Live Range. Step 1 shows the daily export over-reacts to regime (busy too wide, quiet too tight) | daily persistence fix, scored on the Step 1 yardstick |
| L03 §03 | Jumps, excess kurtosis | 3, 7 | **done** (forge/JUMPS_PREREG.md): 6.6% of variance, 78% unscheduled, p90 event term FAIL; stop gap-risk table | use in layer 7 stops |

Side study handed off 2026-10-06: Live Range moving lines across history + jump-through risk (plans/LIVE_RANGE_HISTORY_BRIEF.md).
Parallel work: layers 1, 4 and 5 (DATA_SPEC, PATH MAP, remaining travel) are being built in another session; check
`git log -- plans/` before touching them.
