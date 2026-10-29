# Forecaster System — blueprint (built from the lessons, layer by layer)

Source: `education/forecaster-portfolio-case-study/` (cog, "Case Study: The Forecaster Portfolio", 5 of 17 lessons
transcribed as of 2026-10-18; 04–05 in PR #1543). **This file is updated every time a new lesson is added**: read the lesson, note what it
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
  (5 of 17 so far) is read and folded in before building on it.
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

## Compliance review

`plans/LESSON_COMPLIANCE_REVIEW.md` (2026-10-06): on track in direction, behind on validation discipline — the test
year has been reused across variants (no locked holdout), Lesson 3's clustering measurements were skipped, no
parameter-stability or one-day-delay checks. Actions A1–A9 there, A7 (lockbox) first.

## Lesson intake (every new lesson)

Each lesson adds instructions; each pass makes the process stronger. When a lesson lands:
1. Transcribe it into `education/forecaster-portfolio-case-study/` (word for word, figures described).
2. Add a row to the lesson log below: what it adds, and **which layer(s)** it touches.
3. For each touched layer, write what changes: a new rule for every layer, a new test, a new condition, or a new
   variant. New tests and variants go into that layer's pre-registration as dated amendments **before** they run.
4. Re-run the affected layer(s) with the new instruction; record results in the same file; update the status table.
5. If a lesson changes the layer list itself (e.g. names a layer we had not inferred), revise the table and say so.

## Layers

Overview page: `forecaster-system.html`. Shared statistics: `forge/evaltools.py` (tested: `python -m forge.test_evaltools`).

| # | Layer | Job | Status |
|---|---|---|---|
| 1 | Data | One definition of a bar, a session and a realised value per instrument; sources fixed; integrity checked automatically | **spec + check built** (plans/DATA_SPEC.md, scripts/data_integrity.mjs); open: stale M1 cache, Yahoo indices, IV-adj refit |
| 2 | Measurement | The quantities everything is scored against: London-day O→H, O→L, H−L, \|O−C\|; intraday path | defined (forge `london22`, vol_session audit) |
| 3 | Volatility forecast | How far price is likely to travel today, as p50/p75/p90 lines | **HAR-800 preferred** (forge/LADDER_CALIBRATION_PREREG.md); live shadow: har-shadow.html |
| 4 | Path dynamics | A descriptive map: given today's lines, where price is, the time, the regime and the range used, what happens next (reach next rung / stall / return), with intervals | **done** (forge/PATH_MAP_SPEC.md, path-map.html): real lines race exactly like placebo lines in all 314 cells (hour, regime, event, class, range used, approach speed, prior-day level, IV÷σ); what varies is time left (held 23% → 74% through the day) |
| 5 | Primary decision | Derived from the layer-4 map. The map shows no fade/continue direction at the lines, so this layer is re-scoped to **remaining travel**: from where price is and the time left, how far it can still go (and so where targets and stops sit) | **built, near-pass** (forge/REMAINING_TRAVEL_PREREG.md): per-hour σ multipliers (R3) calibrated across the day and regimes (miss 1.6pp) except 21:00 downside p75 (30% vs 25%, year-varying) — fails the frozen rule by 0.1pp; √-time shapes fail; no 'budget spent' effect |
| 6 | Confidence (meta-labelling) | Probability the layer-5 call is right; whether to act at all | **run, FAIL** (forge/CONFIDENCE_PREREG.md): real but small skill (Brier +1.5–2.1%, AUC 0.57–0.59), p75 calibration 3.4pp > 3.0; carried by time of day + realised vol so far |
| 7 | Sizing and risk | How much to hold; stops; gap/jump risk | sizing: σ sizing steadies risk, σ choice irrelevant (forge/VOL_TARGET_PREREG.md); **stop risk mapped** (forge/STOP_RISK_PREREG.md): stops fill clean within the week (p99 1.0R) but not across weekends (p99 2.1R, 13% gap), release minutes (1.6R), overnight (1.3R), tier-1 days, indices |

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
| 04 Why the logic stays private (2026-10-18) | Economics of an edge, not a forecasting method. An edge's value is roughly its return × its half-life, so decay must be watched; square-root impact sets capacity and optimal size (a third of the gross edge kept; capacity falls with turnover²); correlated trials are worth far fewer independent ones (N/(1+(N−1)ρ) by variance, best-of-N scaled by √(1−ρ)); small capital can use edges too small for institutions; evidence without the recipe: Sharpe SE √((1+S²/2)/T), independent tests compound (Bayes), commit the specification before the results. Touches: validation/process (multiple testing, forward evidence), layer 7 (costs and capacity) |
| 06 From one idea to a portfolio (2026-10-27) | Portfolio construction. Variance of an equal-weight book = σ²[1/N + (1−1/N)ρ̄], so average correlation sets the floor; SE of a correlation ≈ (1−r²)/√T; eigenvalues against the Marchenko–Pastur band (1 ± √(N/T))² separate real structure from noise; effective bets by participation ratio, entropy and variance ratio; tails tested by counting joint worst-5% days against the hypergeometric (expected k²/T); correlation rises in stress through a common factor (Forbes–Rigobon correction); across independent legs skew falls by √N, kurtosis by N, Sharpe rises by √N/√(1+(N−1)ρ̄). Touches: layer 7 (sizing, portfolio), validation (breadth = effective bets) |
| 05 Data: why futures (2026-10-18) | Layer 1. Never edit raw data: returns within a contract, rolls as explicit trades (difference adjustment distorts % returns, worst in the oldest data); futures return = collateral + spot + roll yield; survivorship and look-ahead (information set, publication lag, revisions); resolution sharpens risk estimates but never the mean (SE of the mean = σ/√T whatever the sampling); microstructure noise inflates realised vol at fine sampling (signature plot); a record holds few regimes (T/τ); one bad print of kσ adds ~k²/n to variance and ~k⁴/n to excess kurtosis; screens flag but never alter; hash the dataset into the research record. Touches: layers 1, 3 (σ inputs), validation |

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
| L01 §05 | 12-check validation card | all | layer 3 checks done: point-in-time (Step 0), walk-forward (Steps 1/1b/A), multiple testing counted (ledger), significance intervals, **parameter stability PLATEAU**, **holdout sealed** (opens 2027-01-04), forward scorecard running | card page = Daily Plan track record |
| L01 §06 | Volatility drag, Kelly | 7 | **done** (analysis/forecaster_lessons/SIZING_NOTE.md): no build, 10% target about 1/5 Kelly | re-check at spread book review |
| L02 §01–§04 | Waiting times, overruns, uncertain rate, cost of search | process | **stopping rule adopted 2026-10-06**: one prereg + one logged variant per direction, then a decision | discovery-rate tracker from the ledger |
| L02 §05 | Breadth enters the evidence | process | **done**: TRIAL_LEDGER (94 tested, about 5 passes expected by luck) | keep current |
| L02 §06 | Discovery rate declines | process | not built | with L02 §01–§04 |
| L03 §01 | Layers, IR ≈ TC·IC·√BR | all | layers built and joined on daily-plan.html (forecast → room left → stop/size → record); no decision layer by evidence, so TC/BR not applicable | revisit when a validated directional book is sized through it |
| L03 §01 | Meta-labelling | 6 | 3a (morning trust) FAIL then nothing left after the forecast fix; 3b stopped (direction from the forecast conflicts with L03 §02). **Re-aimed:** primary = yield-spread book, meta-label = forecast state → size | plans/LESSON_TARGET_REBUILD_PLAN.md step C |
| L03 §02 | Vol clustering, persistence, half-life | 3 | HAR-800 preferred, weekly reverting, IV-adjusted, Live Range. Step 1 shows the daily export over-reacts to regime (busy too wide, quiet too tight) | daily persistence fix, scored on the Step 1 yardstick |
| L03 §03 | Jumps, excess kurtosis | 3, 7 | **done** (forge/JUMPS_PREREG.md): 6.6% of variance, 78% unscheduled, p90 event term FAIL; stop gap-risk table | use in layer 7 stops |
| L04 §01 | Edge decay, value ∝ half-life, Little's law | process | **in the backtest 2026-10-19**: decay panel on forecast-line-backtest.html (rolling 52-week net R per trade; trend with yearly-block interval; implied half-life when the trend is significant). Rule A: no decay detectable (EURUSD −0.03 R/yr [−0.22, +0.17]) | add the same read to the forward scorecard |
| L04 §02 | Square-root impact, capacity, turnover | 7 | at our size impact is negligible; the binding cost is the spread (feasibility gate, line-touch and futures-cost tests) | nothing to build unless size grows |
| L04 §03 | Correlated trials: effective independence | validation | **in the backtest 2026-10-19**: allowance √(1−ρ) × E[best of N] for the 60 rule × stop × target settings, per instrument and pooled (scripts/backtest/summarise_line_backtest.py): ρ 0.13, ≈ 6.8 effective tries, allowance 2.16 SE. Rule A pooled z 2.13 → 0 after the 60-setting allowance; on its 4 registered settings (ρ 0.86, allowance 0.39 SE) z 1.75 (0.2σ/5R) | carry into the validation card |
| L04 §04 | Small capital's territory | 7 | consistent with the evidence (small intraday edges exist gross), but spread, not institutional size, is what removes them | — |
| L04 §05–§06 | Evidence without the recipe: Sharpe SE, Bayes compounding, commitment | validation | **in the backtest**: Sharpe ± SE on every setting; independent-evidence list for rule A with the lesson's Bayes arithmetic (one independent pass so far) | paper record and holdout add passes 2–3 |
| L05 §01 | Construction: rolls, return index, adjustment | 1 | OANDA CFD data has no contract rolls; NT8 futures stitcher writes unadjusted + ratio series and rolls.csv | check every NT8 study uses within-contract or ratio returns and never ranges across a stitched roll |
| L05 §02 | Futures returns: carry, basis, roll yield | 1, yield book | carry enters the yield-spread book, not the range forecast | — |
| L05 §03 | Survivorship and look-ahead | 1, validation | look-ahead: several fixes logged, ALFRED vintages, feature-store as-of rules; survivorship: instrument list fixed, but bot and strategy reviews look only at what is still running | survivorship note in bot reviews |
| L05 §04 | Resolution: noise and the signature plot | 1, 3 | **done 2026-10-18** (forge/signature_plot.py, analysis/output/signature_plot/RESULTS.md): 1-min returns overstate vol by +7.4% crosses, +4% majors/gold, +1% indices; 15-min within ~1%. Daily σ forecast unaffected; the vol-time profile (IEP / Level Scenarios) over-weights quiet hours slightly (max 0.9pp share), absorbed by the calibrated reach model | use 5–15-min returns for any realised-variance estimate on FX/gold; rebuild the profile from 15-min if the reach model is refitted |
| L05 §05 | Macro in the data; few regimes per record | validation | **in the backtest**: high-volatility spells counted per period (EURUSD 2020-26: 5 spells, avg 77 sessions) | — |
| L06 §01–§03 | Diversification, correlation noise, effective bets | 7, validation | **run 2026-10-27** (forge/RULE_A_PORTFOLIO_PREREG.md; Decision Lab "Rule A as a portfolio"): rule A's 11 instruments = 5.5 bets by variance, 8.8 by participation ratio; avg corr 0.10; two eigenvalues above the noise (indices 2.27, EURUSD/USDCHF 1.49). Cluster risk budget walk-forward Sharpe 0.71 → 0.99, +0.28 [−0.05, +0.68] **UNDERPOWERED** | forward test a clusters-only budget; put effective bets in the validation card |
| L06 §04–§05 | Tail dependence, regimes and common factors | 7, validation | **run 2026-10-27**: rule A's FX+gold and index halves share 10 worst-5% days vs 3.9 (p 0.004): both trade on the same rich-vol mornings (the lesson's common factor). Rule A vs the portfolio book: corr −0.01 [−0.07, +0.05], joint worst days 6 vs 3.9 (p 0.19) **VALIDATED** as a separate source | combined forward record of rule A + the book |
| L06 §06 | What a portfolio inherits (skew, kurtosis, Sharpe √N, drawdown) | 7 | equal-risk rule A + book Sharpe 1.61 vs 0.86 / 1.41 alone (book before financing haircuts; descriptive) | Lessons 8 and 15 measure the combined path |
| L05 §06 | Data quality: bad prints, immutable store, hashes | 1 | **in the backtest 2026-10-19**: flag-only spike screen per instrument (EURUSD: 361 flagged minutes, mostly release times; 0 rule-A entries near a flag) and sha256 of the price file, the line file and the build script in each data file and on the page. Not yet in prereg results records generally | add the fingerprint to the prereg results template |

**Forecast Line Backtest (2026-10-18):** `forecast-line-backtest.html` + `scripts/backtest/build_line_backtest.py`: the chosen lines point-in-time for every day 2020-08 → 2026-08 (34 instruments), rule trades checked on 1-minute bars after costs, equity, by-year, line calibration, day browser with each layer's output. The place each new lesson's check is added. First read (exploratory, not a new registration): rule A, the registered rich-day break adapted to the chosen lines, 0.2σ stop / 5R: +0.27R gross, +0.16R net over 2,057 trades on 11 instruments, 6 of 7 years positive; fade/continue references B/C gross ≈ 0, net negative.

Side study handed off 2026-10-06: Live Range moving lines across history + jump-through risk (plans/LIVE_RANGE_HISTORY_BRIEF.md).
Parallel work: layers 1, 4 and 5 (DATA_SPEC, PATH MAP, remaining travel) are being built in another session; check
`git log -- plans/` before touching them.
