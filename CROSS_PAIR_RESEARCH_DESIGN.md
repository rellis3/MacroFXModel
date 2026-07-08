# Cross-Pair Forecast-Behaviour Research Suite ("the trend spotter")

**Status:** design proposal, for review before any code. Nothing built yet.

**Reframe (adopted from the brief):** stop thinking of the output as a *volatility
forecast* and treat it as a **Daily Market Expectation Model** — a probabilistic
description of the expected *distribution* of movement (high-low, open-close,
open-high/low, 5d/20d context, session structure, vol state). The research
question is not *"was the vol forecast right?"* but **"how does the market behave
relative to its expected distribution, and where is that expectation reliable?"**

**Objective:** understand the behaviour and predictive quality of the model
across all pairs. **Do not optimise a strategy. A bot is not the answer yet.**
The deliverable is *understanding* — which pairs to trust, which to discount,
which patterns are robust across instruments, and a ranked list of hypotheses
that could *later* improve the model, the filters, and the decision engine.

---

## 1. What already exists vs what this adds

The **per-pair** questions are largely answered already — the research book +
`vfr_research` JSON carries, per pair: forecast accuracy/bias per component,
distribution calibration (exceed-median / exceed-75), sharpness, skill vs
climatology, expansion curves, completion, misses, multi-day persistence,
day-of-week, seasonal, day-types, regime matrix, `byVov` (vol-state buckets),
and session structure. The `intraday_research` JSON adds touch/excursion +
expansion timing.

The **cross-pair** layer today is shallow: `cross` is a flat average of a few
headline daily H-L metrics + a sharpness ranking + the per-class recal proposal.
It does **not** do the four things you're actually asking for:

| The ask | New analytical job |
|---|---|
| *"find the balanced trends from them all"* | **Cross-pair consistency** — a pattern counts only if it holds across many pairs of different *types* |
| *"discount the outliers … if USDCHF is really bad we don't trade it"* | **Outlier discounting → trust tiers** |
| *"all pairs of different types"* | **Pair-type grouping** (majors / EUR-cross / JPY-cross / other-cross / gold / index) |
| *"which pair is most predictable / highest accuracy"* | **Composite forecast-reliability score → ranking** |

**This suite reads the already-output JSON — it does not re-run the heavy
per-pair engines.** That keeps it cheap, deterministic and unit-testable.

---

## 2. The four new analytical jobs (all doable now, from the aggregates)

**A. Cross-pair consistency / robustness — the anti-overfit spine.**
For each metric or relationship the book reports per pair (e.g. "H-L exceeds the
median >50% of days", "Tuesday is the least-accurate day", "large exceedances
persist next day"), compute across the N pairs: how many agree in **sign /
direction**, the median effect, and the dispersion. A finding is promoted to a
**robust trend** only if the agreement beats chance (sign test vs Binomial(N,½))
*and* holds across ≥2 pair types — not just within one cluster. This is the whole
point: a pattern that only shows up in 3 correlated JPY crosses is not a trend.

**B. Outlier discounting → trust tiers.**
Per quality metric (calibration error, sharpness, skill, bias, stability),
compute a **robust z-score** (median / MAD, not mean/σ, so one broken pair
doesn't move the bar). Pairs that are pathological on multiple metrics drop to a
**caution / exclude** tier. Output: a simple `trade / caution / exclude` label
per pair with the reasons — the literal "USDCHF is bad → don't trade it" answer,
made rule-based instead of eyeballed.

**C. Pair-type grouping.**
Bucket pairs into majors / EUR-crosses / JPY-crosses / other-crosses / gold /
index and ask whether forecast quality and behaviour **cluster by type** (do JPY
crosses systematically over/under-shoot? is gold's completion distribution
different?). This is the honest, analysis-level version of the earlier
"per-class logic" question — *observed*, not fitted into a bot.

**D. Composite forecast-reliability score.**
A transparent, weighted blend of the quality metrics (calibration closeness to
target, sharpness, skill-vs-climatology, low bias, stability over time) → one
0–100 **reliability score per pair**, with the sub-scores shown. This is the
ranking that answers "which pairs is the expectation model actually good at."

---

## 3. The 16 brief questions — honest availability map

| # | Question | Status |
|---|---|---|
| 1 Forecast accuracy (MAE/RMSE/bias/error dist) | per-component, per pair | ✅ have → **synthesise cross-pair** |
| 2 Distribution accuracy (< med / med–75 / >75 / >95) | exceed-median/75 per pair | ✅ (add the >95 bin) → synthesise |
| 3 Forecast stability (hi/lo/transition/trend/range/news/holiday) | regime + `byVov` present; **news/holiday weeks not tagged** | ⚠️ partial |
| 4 Regime behaviour (error by vol regime) | `regimeMatrix` / `byVov` | ✅ → synthesise |
| 5 Session behaviour (contribution, sequencing, compensation) | actual + sequencing + compensation ✅; **forecast contribution not emitted** | ⚠️ partial (see §4) |
| 6 Daily expansion process | `intraday_research` expansion curves | ✅ → synthesise |
| 7 Forecast completion (%, exceed, never reached) | `completion` / `completionByHorizon` | ✅ → synthesise |
| 8 Forecast misses (what big misses share) | `misses` aggregates ✅; **macro/news/gap/sentiment factors not joined** | ⚠️ partial |
| 9 Trend persistence (exceedances cluster / vol persistent) | `multiDay` / `persistence` | ✅ → synthesise |
| 10 Day-of-week effects | `byDow` | ✅ → synthesise |
| 11 Monthly / seasonal | `seasonal` (month/quarter) ✅; **Christmas/EOQ/month-end not explicit** | ⚠️ mostly |
| 12 Pair behaviour (most predictable / accurate) | this suite's core (§2 B/D) | ✅ **new** |
| 13 Multi-day relationships | `multiDay` | ✅ → synthesise |
| 14 Open-to-close behaviour | OC component + efficiency | ✅ → synthesise |
| 15 Session contribution accuracy (forecast vs actual) | **needs a forecast session split** | ❌ blocked (§4) |
| 16 Forecast confidence score | `confidence` bins per pair ✅; this suite adds the **cross-pair reliability score** (§2 D) | ✅ extend |
| Hidden relationships / correlation / clustering / feature importance | **needs per-day rows exported** (§4) | ❌ not from current JSON |

Roughly: **10 of 16 are "have it per-pair → just synthesise cross-pair now"**,
4 are partial, 2 are genuinely blocked on new data. That's the honest split — not
"all 16 in one pass."

---

## 4. Data-availability boundaries (stated up front, not discovered later)

1. **Per-day feature rows are not in the JSON.** The engine builds a rich per-day
   `row` (per-component errors, efficiency, forecast skew, climatology, day-type,
   vol state) but persists only the **aggregates**. The correlation /
   feature-importance / behavioural-clustering / hidden-relationship scan (the
   richest part of the brief) needs those rows. Fix = a small **per-day-rows
   export** (opt-in, one file per pair) — a Phase-2 engine change, then the scan
   runs over real rows. Until then the suite works on aggregates.
2. **The forecast emits no session contribution split**, so Q15 (forecast-vs-
   actual session error) cannot be scored. Q5's *behavioural* parts (sequencing,
   compensation, drift vs trailing-expected) **are** available. To unlock Q15 the
   Daily Market Expectation Model would need to output an expected Asia/London/NY
   share — a forecaster change, out of scope for the read-only suite.
3. **Macro / news / holiday tagging is absent.** Q3 (news/holiday weeks), Q8's
   macro/news/sentiment factor attribution, and Q11's Christmas/EOQ/month-end
   need an economic-calendar / holiday join we don't have. Flag as deferred;
   don't run a lookalike and call it the thing.

---

## 5. Statistical discipline (pre-registered)

- **Chance baseline for "cross-pair consistency":** with N pairs, k agreeing in
  sign is Binomial(N, ½) under the null. A "robust trend" must clear a sign-test
  p-bar **and** span ≥2 pair types. State N and the baseline on every claim.
- **Multiple comparisons:** we're scanning many metrics × many pairs. Correct
  (Benjamini–Hochberg) before calling a cross-pair pattern real; a few "winners"
  among dozens of slices is what noise does.
- **Correlated pairs are not independent evidence.** 8 USD-major variants moving
  together is ~1 vote, not 8. Down-weight within-cluster agreement (report both
  raw agreement and type-diversity of the agreeing set).
- **Pre-register both outcomes.** For each headline question, say now what
  "there's a robust cross-pair trend" and "it's pair-specific noise" each look
  like, so a null can't be re-narrated into a maybe.

---

## 6. Deliverables (a research report, not a bot)

- **Cross-pair trend board** — for each question: the robust trend (if any), the
  N-pairs-agree count vs chance, the effect distribution, and the type spread.
- **Trust-tier table** — `trade / caution / exclude` per pair, with reasons.
- **Reliability ranking** — 0–100 score per pair + sub-scores.
- **Pair-type profiles** — how behaviour clusters by instrument type.
- **Hypotheses list** — ranked, falsifiable, each tagged with the data it needs
  (some "testable now", some "needs per-day rows / macro join"). *These are
  candidates for later testing, explicitly not trade rules.*
- Rendered as a new card/section (proposed on `vol-research-book.html`, or a
  dedicated `cross-pair-research.html` — open decision).

---

## 7. Phased build plan

- **Phase 1 — Cross-pair synthesis from the existing JSON (no engine change).**
  A pure module (`js/crossPairResearch.js`) consuming `vfr_research` +
  `intraday_research` → jobs A–D of §2 + the ✅ rows of §3, with the §5
  discipline. Unit-tested on synthetic per-pair JSON. This is the trend spotter.
- **Phase 2 — hidden-relationship scan + day-types. ✅ BUILT.** Rather than persist
  65k raw rows, the scan (`js/forecastFeatureScan.js`) runs where the engine's per-day
  `rows` exist (server run-time) and attaches compact results as `summary.featureScan`;
  `crossPairResearch.hidden` folds them cross-pair (causal predictor→miss sign test +
  BH + type-spread, pooled seeded-k-means day-types).
- **Phase 2b — within-day session relationships. ✅ BUILT.** The per-day session series
  (`dailySessionContributions`) is joined into the scan (`sessionRelationships`) and
  folded cross-pair as `hidden.session` — Asia/London/NY share → miss, labelled
  within-day/descriptive (session shares are end-of-day, not a pre-open predictor).
  Presented on the canonical **`cross-pair-research.html`** page (linked from the
  dashboard). **Remaining (2b-ii / 2c):** session-contribution *accuracy* needs the
  forecaster to emit an expected session split; macro/news/holiday needs a calendar join.
- **Phase 3 (deferred, gated on Phase 1–2) — decision layer.** *Only if* the
  research surfaces robust, type-diverse, OOS-consistent structure does it become
  a filter/selector — and then through the honest A/B harness. Not before. The
  earlier "dynamic selector" idea lives here, downstream of the evidence.

Each phase is its own draft PR, linked from the research book.

---

## 8. Open decisions for you

1. **Pair-type buckets** — majors / EUR-cross / JPY-cross / other-cross / gold /
   index as above, or coarser (fx / gold / index)?
2. **Reliability-score weighting** — equal-weight the sub-scores, or lead with
   calibration + skill (the two that most directly mean "trustworthy")?
3. **Where it lives** — a new section on `vol-research-book.html` (my default),
   or its own `cross-pair-research.html` page?
4. **Start at Phase 1 now** (synthesis from current JSON), or do the Phase-2
   per-day-rows export first so the hidden-relationship scan lands in the same
   pass? (My rec: Phase 1 first — it's the trend spotter you asked for and needs
   no engine change; Phase 2 follows once you've seen it on real numbers.)
