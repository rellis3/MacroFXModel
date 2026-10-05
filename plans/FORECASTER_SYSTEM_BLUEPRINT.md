# Forecaster System — blueprint (built from the lessons, layer by layer)

Source: `education/forecaster-portfolio-case-study/` (cog, "Case Study: The Forecaster Portfolio", 3 of 17 lessons
transcribed as of 2026-10-05). **This file is updated every time a new lesson is added**: read the lesson, note what it
adds or changes per layer, then build.

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
| 4 | Path dynamics | A descriptive map: given today's lines, where price is, the time, the regime and the range used, what happens next (reach next rung / stall / return), with intervals | **built** (forge/PATH_MAP_SPEC.md, path-map.html): races are random-walk at every line and condition; what varies is time left (held 23% → 74% through the day) |
| 5 | Primary decision | Derived from the layer-4 map. The map shows no fade/continue direction at the lines, so this layer is re-scoped to **remaining travel**: from where price is and the time left, how far it can still go (and so where targets and stops sit) | next |
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
