# Statistical / Relative-Value Arbitrage — Existing-Capability Audit

> **Question asked:** does MacroFXModel already contain a *relative-value / statistical
> arbitrage engine* — a system that estimates a **fair value** per instrument and flags
> **statistically significant mispricing** — or does it only produce **directional bias**?
>
> **One-line answer:** the *ingredients* of a stat-arb engine are almost all present and
> mostly live, and in **two narrow cases** the system already computes a true fair-value
> **price** and a standardized deviation. But there is **no unified, multi-model,
> price-denominated fair-value consensus** across the instrument set, and **no
> convergence-probability layer**. The platform is ~70% of the way to the engine you
> describe — the missing 30% is the part that turns the existing pieces into a valuation
> engine rather than a bias engine.
>
> Companion docs: `CODEBASE_OVERVIEW.md`, `SYSTEM_ASSESSMENT.md`, `LEGO_MODULES.md`,
> `HEDGING_VS_SPREAD.md`. This audit follows the working agreement in `CLAUDE.md`:
> *"built" ≠ "works" ≠ "has edge"*. Nearly everything below is **built and live** but
> **in-sample / edge-unproven** unless stated otherwise.

---

## The one distinction the whole audit turns on: VALUE vs BIAS

- A **VALUE** output is a *price in the instrument's own units* (or an expected return):
  "EUR/USD fair value is 1.0840; it is trading 45 pips rich." You can subtract it from the
  market price and get a mispricing in pips.
- A **BIAS/SCORE** output is a *direction with a magnitude on an arbitrary scale*:
  "rate spread favours EUR, +2 of 3." You cannot subtract it from price.

The dashboard is overwhelmingly a **BIAS** engine. The stat-arb engine the prompt describes
is a **VALUE** engine. The gap between them is the subject of this document. A recurring
trap: several **BIAS** outputs are *labelled* "fair value" in the UI — the code itself flags
this (`js/compass.js:318-324`).

---

## Q1 — Does the dashboard already contain the foundations of a stat-arb engine?

**Yes — most of the foundations exist, and the two hardest pieces (a cointegration/OU
mean-reversion primitive and an ensemble combiner) are already built.** Mapped to the
components you listed:

| Component you named | Where it lives | What it actually outputs | Contributes to stat-arb? |
|---|---|---|---|
| **Macro Score (T1–T8 tiers)** | `js/macro.js` `calculateTierScores` (PCA-decorrelated, ±18, coherence bonus) | directional **SCORE** + size gate | Conditioning / confidence, **not** a value |
| **Seven-tier regime model (HMM V1–V7)** | `hmm.js`, `hmm5m*.js`, `RegimeV2/…`, `js/creditHmm.js` (Baum-Welch/Viterbi) | regime label + confidence | Regime-state input (when to trust reversion) |
| **Yield-spread models** | `js/compass.js`, `js/macro.js computeT1` | spread level/z → **BIAS**; *but* `compassDivergence` → **VALUE** (below) | Both — the one true FX fair-value anchor is here |
| **ARMA forecasts** | `js/arma.js fitARMA`/`fitVECM` | spread forecast + cointegration ECT | VECM is genuine equilibrium math, delivered as bias |
| **GARCH vol forecasts** | `js/volForecast.js` (+ Python mirrors) | σ, CI68/CI95 (**VALUE**, in pips) | The **forecast-error / band** input — critical |
| **Vol-regime classification** | `js/volForecast.js`, `js/regime-confidence.js` | cluster + reversion bias | Confidence + heuristic reversion prob |
| **Open Interest / GEX / Max Pain / Call & Put Walls** | `js/oi.js` (manual paste → KV) | **PRICE LEVELS** (walls, maxPain, gamma flip) + PIN/BREAKOUT score | Level magnets / convergence targets |
| **COT positioning** | `_worker.js:1619+` (CFTC TFF+disagg), `js/cot.js` | specZ, 3-yr percentile, crowding (**SCORE**) | Positioning-extreme confidence input |
| **Asia / Monday range, Pivots, FVG** | `js/ranges.js`, `js/vol.js`, `js/levelSources.js`, `js/range-bias.js` | **PRICE LEVELS** | Structural convergence targets |
| **Entry Scanner / Confluence Engine** | `js/confluence-core.js`, `js/confluences.js enhanceConfluences`, `js/signal.js runEntryScanner`, `js/levels.js` | clustered **PRICE LEVELS + star scores** | The integration surface a valuation layer would plug into |
| **AI Analysis** | `js/ai.js` + `server.js /api/analysis` (`claude-sonnet-4-6`) | narrative text | Consumes everything; emits no level |
| **Regression models** | `compassDivergence` OLS, `system-gold-macro.html` OLS, `bot/modules/beta_estimator.py` (OLS+Kalman) | **VALUE** (price) for the first two; **betas** for hedging in the third | Yes — regression-to-fair-value already exists in 2 places |
| **Z-score calculations** | `js/statsCore.js` (canonical), `zscoreSpreadEngine.js`, everywhere | standardized deviations | The mispricing-standardization primitive already exists |
| **Bayesian models** | `js/macro.js computeBayesianScore` (naive-Bayes log-odds), `RegimeV2/bocpd.py` (BOCPD) | probability + change-point | The **ensemble combiner** already exists (as a bias combiner) |
| **Cointegration / mean-reversion** | `js/hedgeSignalV2Engine.js` (OU half-life `−ln2/λ`, Engle-Granger), `portfolioBacktest/portfolio_backtest.py` (EG pairs), `js/arma.js fitVECM` | spread z, half-life, ECT | Yes — a full OU/cointegration primitive is **live** |

**So the foundations are real.** What is missing is not the primitives — it is the
*assembly*: pointing the cointegration/OU machinery at **price-vs-macro-fair-value** (it
currently points at **pair-vs-pair** spreads), unifying the scattered single-driver
fair-values into one **multi-model consensus per instrument**, and adding a
**convergence-probability** output on top.

---

## Q2 — Does the dashboard calculate a true Fair Value, or only directional bias?

**Both — but true fair value exists in only two narrow places, and the most prominent
"Fair Value" UI element is actually a bias.**

### True fair value (VALUE — a price you can compare to the market) — EXISTS, narrow

1. **`js/compass.js` → `compassDivergence(data, sym)` — the one live FX fair-value engine.**
   Rolling **OLS of FX price on the composite 2Y/10Y yield-spread z-score** over a
   120-trading-day window. It emits, in real price units:
   - `fairPrice = alpha + beta · spreadZ` — a fair-value **price**,
   - `gap` — pips the market must move to reach fair value,
   - residual `z` — the **standardized mispricing** (rich/cheap),
   - `r2`, `beta`, `alpha`, `n`.

   It is drawn on the chart as *"Yield fair value (regression-implied price)"* (`js/levels.js:591,674-678`)
   and surfaced as *"Price is running ~Xp rich / lagging below what the spread implies"*.
   **This is a genuine, live, single-factor relative-value model.** Its limitation is that
   its only driver is the rate spread.

2. **`system-gold-macro.html` → `rollingOLSResidual()` — a two-factor gold fair value.**
   Rolling **OLS of log(GLD) on the real yield and DXY** (252-day window) →
   `fairVal = exp(logGld − residual)`, a fair-value **price for gold**, with a residual
   z-score (+ overvalued / − undervalued) that drives allocation tiers. This is the closest
   thing in the repo to the multi-factor engine you want — but it is **gold-only** and lives
   in a **standalone HTML backtest**, not the live dashboard.

3. **`js/arima-price.js` → `fitArimaPrice()`** — ARIMA(1,1,1) 1-step price forecast +
   `fairValueDev` (σ from forecast). A *statistical* (pure price, no macro) fair value; it is
   consumed for **regime stability**, not valuation.

4. Supporting: `pine/yield-lag-forecast.pine` (Pine port of #1, also plots a forecast target),
   `js/compass.js compassRocForecast` (expected price *move* from spread rate-of-change),
   `js/arma.js fitVECM` (cointegration equilibrium of the spread — value internally, bias out).

### Everything else is directional BIAS (SCORE)

- **`js/compass.js compassFairValue`** — *named* "fair value" but is a weighted z-score of the
  2Y/10Y spreads: `(z2·0.6 + z10·0.4)·fxSign`. It **never looks at price**. The code says so
  verbatim. Rendered as "Spread Lean / UNDERVALUED / OVERVALUED".
- **`js/signal.js` "Fair value gap … pips"** — takes that spread lean and scales it to pips
  via a heuristic `fvGap · ATR · 0.5 / pipSize`. **Not a regression price.** This is the
  "fair value" figure that reaches the AI summaries and Telegram (`server.js:1687`,
  `_worker.js:1338`). It is a bias dressed as a valuation.
- T1–T8 tiers, `computeGoldMacroModel`, `regime_score.py`, HMM regimes, COT crowding — all
  **SCORES / gates**.

### The difference, stated plainly

- **Fair value** answers *"where should price be?"* → a level → `market − fair value` is a
  tradeable, cross-instrument-comparable mispricing.
- **Directional bias** answers *"which way, how strongly?"* → a signed score on an arbitrary
  scale → you can rank setups but you cannot say *how far* price is from where it belongs, nor
  standardize that distance, nor estimate a convergence target.

The dashboard is ~90% a bias engine. Converting it to a valuation engine means making the
**level** the primary object and the **standardized deviation** the primary signal — which is
exactly what `compassDivergence` and the gold OLS already do in miniature.

---

## Q3 — If a unified fair value doesn't exist, what is the mathematically correct framework?

**FX/gold have no dividend-discount "intrinsic value."** The correct object is a
**conditional-equilibrium** price: the expected price given the macro state,

```
FairValue_t = E[ Price_t | X_t ]      X_t = macro/positioning/vol state vector
Mispricing_t = Price_t − FairValue_t
```

The mathematically correct backbone is **cointegration + error-correction**, not a naive
point regression:

1. **Long-run equilibrium (cointegration).** If (log) price and a set of fundamentals are
   cointegrated, there exists a stationary linear combination
   `z_t = logP_t − (α + β'X_t)` — the deviation from long-run fair value. Stationarity of
   `z_t` is what *licenses* calling deviations "mispricing." Without it you are regressing on
   a spurious trend. (The repo already has the machinery: Engle-Granger in
   `hedgeSignalV2Engine.js` and `portfolio_backtest.py`, VECM in `arma.js` — just not pointed
   at price-vs-macro.)

2. **Short-run dynamics (error-correction / OU).** Deviations decay:
   `Δz_t = λ·z_{t-1} + ε_t`, with `λ < 0`. The **half-life** `−ln2/λ` is the expected time to
   close half the gap. This is the object that makes a valuation *tradeable* — it says *when*,
   not just *whether*, price is cheap. (`hedgeSignalV2Engine.js halfLife()` already computes
   exactly this — for pairs, not for macro FV.)

3. **The domain-appropriate fundamentals.** For FX the established equilibrium frameworks are:
   - **Real-rate / UIP anchor** — expected FX change tied to the real rate differential.
     *Caveat (honesty): UIP fails at short horizons — the forward-premium puzzle. Carry earns
     precisely because price does **not** converge to the UIP fair value over days/weeks.*
   - **BEER (Behavioural Equilibrium Exchange Rate)** — panel/time-series regression of the
     real exchange rate on real rate differential, terms of trade, net foreign assets, relative
     productivity (Balassa–Samuelson). This is the academically standard "FX fair value."
   - **PPP** — the long-run (multi-year) anchor; too slow for the dashboard alone but a valid
     prior.
   - **Gold**: real yield + DXY (+ real rates / breakevens) — the two-factor model already in
     `system-gold-macro.html` is the right shape.

4. **The critical horizon caveat.** Cointegration deviations mean-revert over **weeks to
   quarters**, not intraday. A macro fair-value engine is a **swing/positioning** overlay, not
   an intraday trigger. Selling it as a day-trading signal would violate the `CLAUDE.md`
   working agreement (*folklore vs literature; don't oversell*). Its honest role is to bias and
   size multi-day trades and to tell the intraday engine which direction the macro wind blows.

**In one sentence:** the correct framework is *a cointegrating fair-value regression per
instrument whose stationary residual is the mispricing, with an OU half-life that gives the
convergence clock* — a valuation-grade version of what `compassDivergence` already prototypes.

---

## Q4 — How should fair value be constructed? Independent estimates combined?

**Yes — build independent single-driver fair-value estimates, but first split your list into
three dimensionally-different buckets. Only one of them produces a price.** Blending a level
with a flow as if both were prices is the main modelling error to avoid.

**Bucket A — level anchors (these DO output a fair-value price / expected return):**
- Yield differentials, interest-rate spreads → the compass regression (exists, FX).
- Real yields + inflation expectations (breakevens) → real-rate model (partially exists: TIPS
  in tiers, real yield in gold OLS).
- Dollar index → a driver for gold and a cross-check for USD pairs (exists in gold OLS).
- Statistical / cointegration regression → BEER-style multi-factor (missing as a unified model).
- Carry → an *expected-return* anchor (different from a level; `system-fx-carry.html` exists).

**Bucket B — conditioning / confidence variables (these do NOT output a price — they weight or
gate bucket A):**
- Volatility (sets the forecast-error band and the mispricing denominator — exists: GARCH).
- Options positioning (GEX/PIN vs BREAKOUT tells you whether the level will *hold* — exists).
- COT positioning (crowding = fuel or exhaustion — exists).
- Liquidity, risk sentiment, regime stability (say whether reversion is likely *now*).

**Bucket C — separate risk-premium signals (their own alpha, not a fair value):**
- Momentum (trend-following — often *opposes* value; keep it a separate book, do not fold it
  into the fair-value estimate or you cancel both).
- Credit spreads (a macro-regime and risk-premium input).

**So: yes, make each Bucket-A driver its own fair-value model** (each emitting a price *and*
its residual standard error), **combine those into one consensus price**, and use Buckets B/C
as **weights, gates, and separate signals — never as terms inside the price.** The repo already
respects this instinct: tiers PCA-decorrelate, and the Bayesian combiner discounts the
correlated T1/T3 pair. Carry (expected return) and value (level) must be kept as *distinct*
outputs even though both come from rates — they answer different questions.

---

## Q5 — Would an ensemble be superior? Why?

**Yes, with two disciplines attached.**

**Why an ensemble helps.** Each single-driver fair value has (i) specification error (wrong
functional form) and (ii) estimation error (finite-sample β). If model errors are partially
independent, a combination has lower variance than any single model — the standard
forecast-combination result. It also degrades gracefully when one feed is stale (the compass
model already falls back through partial-data branches).

**Discipline 1 — weight by precision, not equally.** Combine as an inverse-variance
(precision-weighted) or Bayesian-model-averaged mean:

```
FV = Σ w_i · FV_i ,   w_i ∝ 1 / σ_i²   (σ_i = model i's out-of-sample residual std)
```

Equal-weighting a high-r² cointegrated model with a low-r² one throws away information. The
gold OLS (r² tracked) and compass (r² tracked) already expose the numbers needed to do this.

**Discipline 2 — orthogonalize before averaging.** The candidate models mostly key off the
**same rate-differential factor** (compass, T1, carry). Naive averaging **double-counts** it
and understates the true uncertainty — the same shared-factor risk `SYSTEM_ASSESSMENT.md §2.4`
already flags for the strategy book. Use the existing PCA-decorrelation / correlation-discount
pattern (`js/macro.js`) so the ensemble's dispersion reflects *independent* disagreement, not
echoes of one factor.

**Net:** an ensemble is superior **iff** it is precision-weighted and de-correlated. Done
naively it is worse than the single best cointegrated model, because it will look more
confident than it is.

---

## Q6 — How should confidence be measured?

Confidence should be a **product of independent gates**, each already partly available:

| Confidence input | Definition | Status in repo |
|---|---|---|
| **Model agreement / dispersion** | std of the ensemble members' fair-value prices; tight = confident | Missing (needs the ensemble first) |
| **Fit quality** | r² / residual std of each cointegrating regression | **Exists** (`compassDivergence.r2`, gold OLS) |
| **Historical forecast error** | out-of-sample residual std → the denominator of the deviation | Partially (residual std computed in-sample) |
| **Cointegration strength** | Engle-Granger p-value / OU λ t-stat | **Exists** (`hedgeSignalV2Engine.passesCointegration`, t ≤ −3.4) |
| **Half-life** | tighter half-life ⇒ more tradeable, higher confidence | **Exists** (`hedgeSignalV2Engine.halfLife`) |
| **Regime stability** | is the relationship currently well-behaved? | **Exists** (`arima-price.js residualStability`, BOCPD, HMM) |
| **Vol regime** | wide bands ⇒ discount the mispricing | **Exists** (GARCH CI) |
| **Bayesian posterior** | P(mispriced \| evidence) via log-odds over independent gates | **Exists as a pattern** (`computeBayesianScore`) — re-target it |

**Recommended form:** a Bayesian/log-odds combination (the `computeBayesianScore` pattern) over
these gates, producing `P(genuine mispricing that will converge)`. The single most important and
currently **weakest** input is **out-of-sample** forecast error — today residual std is measured
in-sample, which flatters the deviation's significance (`SYSTEM_ASSESSMENT.md §2.1`). Confidence
must be built on OOS error, or it will overstate itself.

---

## Q7 — How should Mispricing Score be calculated? Which is statistically strongest?

Ranked weakest → strongest:

1. **`Mispricing = Market − FairValue`** (raw). Not comparable across instruments or time
   (200 pips means different things in EUR/USD vs USD/JPY vs gold), and it ignores that fair
   value is itself uncertain. Useful only for display.

2. **Z-score of price** (`zscore(price)`). Wrong object — it standardizes price against its own
   history, saying nothing about *fair value*. (Several tiles do this; it is a momentum/extension
   measure, not mispricing.)

3. **Standardized residual `(Market − FV) / σ_resid`.** This is the right idea and is what
   `compassDivergence` already emits (residual z-score) and what the gold OLS uses. Strong,
   comparable, and the natural entry variable.

4. **★ Strongest: the cointegrating-residual t-statistic with FV estimation error folded in.**
   Two refinements over #3:
   - Standardize by the **prediction-interval** std, not just the residual std — because the
     fair value `α + β'X` is *estimated*, the honest band is wider than the residual σ (add the
     regression's parameter-uncertainty term). This prevents over-confident signals when β is
     poorly pinned down.
   - Use the **stationary residual of a *validated* cointegrating relationship** (Engle-Granger /
     OU t-stat passing), so the denominator is the OU process's own dispersion. This is the
     textbook stat-arb z-score and it is *exactly* the quantity `hedgeSignalV2Engine.js` computes
     for pairs — it simply needs to be computed on the **price-vs-macro-FV** residual instead of
     the pair spread.

   ```
   MispricingScore_t = z_t / sqrt(1 + estimation_variance_term)
                     = (logP_t − (α̂ + β̂'X_t)) / σ_prediction
   ```

   with an OU half-life attached so the score carries a convergence clock, not just a distance.

**Bottom line:** the standardized-residual approach (#3) is what you already have in two places;
upgrading it to the prediction-interval-adjusted cointegrating t-stat (#4) is a small, principled
step and is the statistically strongest choice. Do **not** ship the raw pip gap or the price
z-score as "the mispricing."

---

## Q8 — How can the system estimate probability of convergence?

The **OU model gives all four requested outputs in closed form** — and the primitive is already
in the repo (`hedgeSignalV2Engine.js`), just not applied to the macro-FV residual.

For an OU deviation `z_t` with mean-reversion speed `λ` (`>0`) and diffusion `σ`, the future
deviation `z_{t+T} | z_t` is **Gaussian**:

```
E[z_{t+T} | z_t] = z_t · e^(−λT)                         (expected decay toward fair value)
Var[z_{t+T} | z_t] = (σ²/2λ)·(1 − e^(−2λT))              (transient variance → CI)
```

From this:
- **Probability of reverting** — `P(|z_{t+T}| < k)` (converged inside band k by horizon T), or a
  first-passage-time probability of touching fair value within T. Both come directly from the
  Gaussian above.
- **Expected magnitude** — the expected close-up of the gap is `z_t·(1 − e^(−λT))` in σ units,
  convertible to pips via the regression β and the instrument's pip size.
- **Expected timeframe** — the **half-life** `ln2/λ` (already computed) is the headline "how
  long."
- **Confidence interval** — `E ± 1.96·sqrt(Var)` around the projected path, i.e. an honest cone
  rather than a point target.

**Two calibration disciplines (per `CLAUDE.md`):**
- Fit `λ, σ` **out-of-sample / walk-forward**; an in-sample half-life is not a result.
- Cross-check the model probability against a **measured empirical snap-back base rate** — how
  often, historically, a deviation of this size actually reverted within T. The Pine indicator
  (`pine/yield-lag-forecast.pine`) *already measures a historical snap-back base rate*; that
  empirical anchor is exactly the benchmark the OU probability must beat, not replace.

So the answer to *"price is cheap"* becomes: *"EUR/USD is 1.8σ cheap vs its rate-implied fair
value; OU half-life ≈ 9 trading days; ~68% chance of halving the gap within two weeks;
expected +55 pips, 95% cone [−10, +120]."* Every term in that sentence is computable from
primitives already in the repo.

---

## Q9 — How should this integrate into the existing dashboard?

**As a new layer that feeds the existing conviction stack — not a replacement.** This is also
what the `CLAUDE.md` Lego Principle demands: a **new selector on top of the primitives**, added
as `score → choice`, proven OOS, with no new tunable knobs to overfit.

Concretely, four integration points, in priority order:

1. **A new factor in `computeSignalScore` (`js/signal.js`).** Today it blends HMM (20%) +
   Bayesian (30%) + tier alignment (25%) + range bias (15%) + structure (10%). Add a sixth
   **valuation/mispricing** factor (the standardized cointegrating deviation × convergence
   probability), and renormalize the weights. This is the smallest change with the largest reach
   — it flows straight into overall conviction and the star rating.
2. **A mispricing tag in the Entry Scanner (`runEntryScanner`).** When a structural level sits in
   the direction the mispricing points, add weight (mirrors the existing "Signal aligned" +1). A
   fade *with* the macro wind at a confluence level is the highest-conviction combination the
   platform can express.
3. **A convergence target for TP.** The fair-value price is a natural, non-arbitrary take-profit
   / mean-reversion target — better than the current ATR/vol-cap default — and the OU cone bounds
   how much of the gap to expect within the trade's horizon.
4. **Into the AI snapshot (`js/ai.js aiCollectSnapshot`).** Feed the per-instrument fair value,
   standardized mispricing, half-life and convergence probability so the narrative reasons about
   valuation, not just structure.

**Do not** let it replace the regime/structure engines: value tells you *direction and
patience*; regime/vol/structure tell you *when and where*. They are complementary — value at a
structural level in a supportive regime is the whole thesis of the platform
(`SYSTEM_ASSESSMENT.md §1.1`).

---

## Q10 — Gap analysis + realistic predictive contribution

Honest predictive-power estimates below are **directional and modest by design** — per the
working agreement, FX macro-fair-value edges are real but slow and weak at the dashboard's
horizon; anything claiming a large intraday uplift would be overselling.

### Already exists (live, usable today)

| Capability | Where | Note |
|---|---|---|
| Single-factor FX fair-value **price** + standardized deviation | `compassDivergence` | Rate spread only; live; drawn as a price line |
| Two-factor **gold** fair value (real yield + DXY) | `system-gold-macro.html` | Right shape; HTML backtest, not live |
| OU **half-life** + Engle-Granger cointegration primitive | `hedgeSignalV2Engine.js` | Live; points at pairs, not macro FV |
| Ensemble **combiner** patterns (Bayesian log-odds, precision-style weighting, PCA decorrelation) | `js/macro.js` | Directional today; re-targetable |
| **z-score / GARCH band / residual-std** primitives | `statsCore.js`, `volForecast.js` | The mispricing numerator & denominator |
| Regime-stability & change-point gates | `arima-price.js`, `bocpd.py`, HMMs | Confidence inputs |
| Positioning/structure **level magnets** | `oi.js`, `ranges.js`, `levelSources.js` | Convergence targets + hold/break context |

### Partially exists (built but bias-shaped or non-unified)

| Gap | What's there | What's missing |
|---|---|---|
| Multi-factor FX fair value | one driver (spread) live; gold two-factor in HTML | a **unified BEER-style regression** per FX instrument (spread + real rate + DXY + …) |
| Mispricing standardization | in-sample residual z | **out-of-sample** residual / prediction-interval std |
| Cointegration applied to valuation | pairs stat-arb only | point the OU/EG primitive at **price-vs-macro-FV** |
| "Fair value" labelling | compass "FV gap" is a spread lean | rename bias vs value honestly (code already flags it) |

### Missing (the real build)

| Missing piece | Why it matters |
|---|---|
| **Unified per-instrument fair-value regression** (EUR/USD, GBP/USD, USD/JPY, AUD/USD, gold, later indices) | the core object of the engine |
| **Ensemble consensus price + dispersion** (precision-weighted, de-correlated) | turns N single models into one valuation with a confidence |
| **Convergence-probability layer** (OU: P(revert), magnitude, timeframe, CI) | the difference between "cheap" and a tradeable, sized thesis |
| **Valuation factor wired into `computeSignalScore` + entry scanner + AI** | makes it change decisions, not just display |
| **OOS validation harness** for the fair-value residual (walk-forward, deflated significance, snap-back base-rate benchmark) | without it, per `CLAUDE.md`, it is not a result |

### High priority (do these; highest edge-per-unit-effort)

1. **Generalize `compassDivergence` into a multi-factor, per-instrument cointegrating fair
   value** (add real rate, DXY; validate stationarity). — *Realistic uplift: the single largest,
   because it converts the platform's most-defensible macro edge from bias to value. Still modest
   at daily horizon; meaningful at multi-day.*
2. **Attach the existing OU half-life / convergence probability to that residual.** — *Cheap
   (primitive exists); adds the "when," which is what makes value tradeable.*
3. **Wire a valuation factor into `computeSignalScore`.** — *Small change, whole-dashboard reach.*
4. **Rebuild the mispricing denominator on OOS error.** — *Prevents the in-sample over-confidence
   the assessment already flags.*

### Nice to have (later / lower marginal edge)

- BEER panel across instruments (cross-sectional rich/cheap ranking).
- Equity-index fair value (earnings yield vs real yield / ERP) once the FX/gold engine is proven.
- Empirical snap-back base-rate calibration surfaced next to every model probability.
- Regime-conditional β (different fair-value sensitivity in risk-on vs risk-off).

### The honest bottom line on predictive power

The **infrastructure** uplift is large — you would consolidate a dozen scattered signals into
one coherent valuation object and finally be able to say *how far* and *for how long*, not just
*which way*. The **alpha** uplift is **real but bounded**: macro-fair-value mean reversion in FX
is a weeks-to-quarters, risk-premium-laden effect that partially *contradicts* the carry and
momentum books already in the platform. Expect it to **improve conviction ranking, target
selection, and patience/sizing** more than it improves raw hit rate — and prove even that claim
out-of-sample, with costs, before believing it (`SYSTEM_ASSESSMENT.md §2`, `CLAUDE.md` working
agreement). The goal the prompt states — *transform a directional-signal engine into a
quantitative valuation engine* — is achievable mostly by **assembling and re-pointing what
already exists**, not by building from scratch.

---

*Audit generated from a structured code review (JS modules, Python bots/backtests, Pine, HTML,
`server.js`, `_worker.js`). File paths were verified against the working tree. Performance/edge
claims are in-sample and unproven unless explicitly noted; treat this as a build-map, not a
promise of edge.*
