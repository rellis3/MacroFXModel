# Market Valuation Engine (MVE) — Architecture Review & Design

> **The shift being proposed.** Stop the dashboard asking *"Should I buy?"* and make it
> answer *"Is this market objectively mispriced, by how much, with what confidence, and how
> likely is it to converge?"* Directional signals become **secondary**; a **fair value with a
> quantified uncertainty** becomes primary.
>
> **This document is the sequel to `STAT_ARB_AUDIT.md`** (merged). That audit asked "does a
> fair-value engine exist?"; this one asks the bigger question — *"how far is the platform from
> an institutional Market Valuation Engine of the kind AQR / Two Sigma / Man Group / a global-macro
> desk would run, and what are the five highest-value research projects to get there?"*
>
> **One-line answer:** the platform is **~75–80% of the way** to an MVE by *component inventory*,
> but only **~25%** of the way by *assembly* — because almost every component currently outputs a
> **direction/score**, and an MVE requires them to output a **value + an uncertainty**. The good
> news: the two hardest institutional pieces most retail stacks lack — a **regime-adaptive weighting
> table** and a **walk-forward vol-estimator A/B bench** — already exist here, just in one corner
> each. The build is mostly *re-pointing and unifying*, not inventing.
>
> **Honesty contract (from `CLAUDE.md`).** *"Built" ≠ "works" ≠ "has edge."* Everything called
> "exists" below is **built and mostly live but in-sample / edge-unproven** unless stated. Where a
> proposed addition is unlikely to improve forecasting, this doc says so plainly (see Q-Final).

---

## Part 0 — The single reframe the whole design rests on

An MVE component must emit **two numbers, not one**:

```
  ( fair_value_i ,  σ_i )        not just   ( signal_i )
```

a **level** (in the instrument's price units, or an expected log-return) **and its
forecast-error standard deviation**. Everything downstream — the ensemble, the mispricing
z-score, the confidence engine, the convergence probability — is a function of those pairs. The
current dashboard emits `signal_i` (a signed score) almost everywhere. **The entire MVE build is
the act of making each module also emit `(value, σ)`.** Two modules already do
(`compassDivergence`, the gold OLS); most don't.

---

## Part 1 — Complete module review: what each already estimates

Legend: ✅ yes · ⚠️ partial/proxy · ❌ no · **FV?** = could this become a fair-value model that
emits `(value, σ)`?

| Module | File(s) | Value | Prob | Direction | Vol | Confidence | **FV?** |
|---|---|:--:|:--:|:--:|:--:|:--:|---|
| **Macro Score (T1–T8)** | `js/macro.js calculateTierScores` (PCA-decorrelated ±18) | ❌ | ⚠️ | ✅ | ❌ | ⚠️ coherence | ⚠️ inputs to a Macro-FV, not itself |
| **Seven/HMM regime models** | `hmm.js`, `hmm5m*.js`, `RegimeV2/…`, `creditHmm.js` | ❌ | ✅ posterior | ✅ | ⚠️ | ✅ | ⚠️ the **weighting switch**, not an FV |
| **Yield-spread models** | `js/compass.js`, `macro.js computeT1` | ⚠️ | ❌ | ✅ | ❌ | ⚠️ r² | ✅ **already an FV** (`compassDivergence`) |
| **ARMA / VECM** | `js/arma.js` | ⚠️ spread | ❌ | ✅ | ⚠️ CI | ✅ skill-vs-RW | ✅ Yield-FV member |
| **ARIMA (price)** | `js/arima-price.js` | ✅ forecast px | ❌ | ⚠️ | ⚠️ σ | ✅ residualStability | ✅ Statistical-FV member |
| **GARCH** | `js/volForecast.js` (+ py) | ✅ σ (pips) | ❌ | ❌ | ✅ | ⚠️ | ✅ **the σ supplier for every FV** |
| **HAR-RV vs GARCH A/B** | `js/volEstimatorAB.js` (walk-fwd, pinball loss) | ✅ | ⚠️ calib | ❌ | ✅ | ✅ OOS score | ✅ Volatility-FV member (**already benchmarked**) |
| **Vol regime** | `js/regime-confidence.js`, `volForecast.js` | ❌ | ⚠️ reversion bias | ❌ | ✅ | ✅ | ⚠️ confidence gate |
| **Macro Compass** | `js/compass.js` | ✅ `fairPrice` | ❌ | ✅ | ❌ | ✅ r² | ✅ **the seed of the whole MVE** |
| **Open Interest / walls** | `js/oi.js` (manual paste) | ✅ price levels | ❌ | ⚠️ | ❌ | ❌ | ✅ Structure-FV magnet |
| **Gamma / Dealer GEX** | `js/oi.js oiCalcExposures` | ⚠️ flip strike | ❌ | ✅ PIN/BREAK | ⚠️ | ⚠️ | ⚠️ Positioning-FV **weight**, not a level |
| **Max Pain** | `js/oi.js oiCalcMaxPain` | ✅ strike | ⚠️ pin | ❌ | ❌ | ❌ | ✅ Structure-FV magnet |
| **Call/Put Walls** | `js/oi.js processOIData` | ✅ strikes | ❌ | ⚠️ | ❌ | ⚠️ OI size | ✅ Structure-FV magnet |
| **COT** | `_worker.js:1619+`, `js/cot.js` | ❌ | ⚠️ | ⚠️ contrarian | ❌ | ⚠️ percentile | ⚠️ Positioning-FV **weight** |
| **Entry Scanner** | `js/signal.js runEntryScanner` | ✅ levels | ❌ | ✅ | ⚠️ | ✅ | ⚠️ the **consumer**, not an FV |
| **Confluence Engine** | `js/confluence-core.js`, `confluences.js` | ✅ levels+stars | ❌ | ✅ | ❌ | ✅ stars | ✅ Structure-FV member |
| **AI Summary** | `js/ai.js` + `server.js /api/analysis` | ❌ | ❌ | ✅ | ❌ | ⚠️ | ❌ narrator (consumes MVE) |
| **Session models** | `js/ranges.js`, session data in `js/levels.js` | ✅ levels | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ Structure-FV member |
| **"Fair Value Gap" (yield)** | `js/signal.js fvGapToPips` | ❌ (spread z→pips) | ❌ | ✅ | ❌ | ❌ | ❌ **mislabeled bias** |
| **Regression** | `compassDivergence`, gold OLS, `beta_estimator.py` (OLS+Kalman) | ✅ / betas | ❌ | ✅ | ⚠️ | ⚠️ | ✅ FV core + hedging betas |
| **Z-score logic** | `js/statsCore.js` (canonical) + everywhere | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ **the standardizer** |
| **Bayesian** | `macro.js computeBayesianScore`, `RegimeV2/bocpd.py` | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ **the ensemble combiner pattern** |
| **Probabilistic scoring** | `computeSignalScore` (0–100), `regime_score.py` | ❌ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ combiner to re-target |
| **OU / cointegration** | `js/hedgeSignalV2Engine.js` (half-life, EG t-stat) | ⚠️ spread | ⚠️ | ✅ | ⚠️ | ✅ | ✅ **the convergence-clock primitive** |
| **Regime-adaptive weights** | `js/gold-model.js REGIME_WEIGHTS` | — | — | — | — | — | ✅ **the adaptive-weighting prototype (gold only)** |
| **Position sizing / Kelly** | `backtestSystem/risk.py`, `js/backtest.js` (half-Kelly), tier bands | ❌ | ⚠️ | ❌ | ✅ | ⚠️ | ⚠️ risk-engine consumer |

**Reading of the matrix.** The `Value` and `Confidence` columns are sparse; the `Direction`
column is nearly full. That *is* the finding: **the platform is a very complete directional
apparatus with a thin valuation spine.** But note where the ✅s in the FV? column cluster — a
**Macro/Yield FV** (compass, ARMA, tiers-as-inputs), a **Statistical FV** (ARIMA, OU), a
**Volatility FV** (GARCH + HAR bench), a **Structure FV** (OI walls, max pain, confluence,
sessions), and a **Positioning weight** (COT, GEX). **Five of the seven MVE members the prompt
sketches already have at least a prototype in the tree.**

---

## Part 2 — Theoretical framework: is an additive fair-value ensemble sound?

The prompt proposes `MVE = MacroFV + YieldFV + VolFV + PositioningFV + LiquidityFV + StatFV +
StructureFV`. **The instinct is right; the arithmetic as written is not.** Three corrections make
it theoretically sound:

1. **Sum expected *log-returns / deviations*, not prices.** You cannot add seven price levels —
   they would overcount the current price sevenfold. Each member should output a **signed
   deviation from the current price** (a fair-value gap `g_i = logFV_i − logP`, in return units),
   and the ensemble is a **weighted combination of the gaps**, converted back to one consensus
   fair value: `logFV = logP + Σ wᵢ gᵢ`.

2. **The members are not all the same kind of object.** Split them (as in `STAT_ARB_AUDIT.md`):
   - **Level anchors** (produce a genuine fair-value gap): Macro/Yield FV, Statistical/cointegration
     FV, Structure FV (magnets are levels), Volatility FV *only in the sense of setting the band*.
   - **Weights / gates** (do **not** produce a level): Positioning (GEX/COT), Liquidity, Vol
     regime, Sentiment. These scale confidence and holding time, they don't move the fair value.
   - Adding a "Positioning fair value" as a *price term* is a category error — positioning tells
     you whether a gap will hold or squeeze, not where fair value is.

3. **Weight by precision and orthogonality, not equally** (Part 3).

So the sound form is:

```
  gap_i = logFV_i − logP        (level anchors only, i ∈ A)
  logFV = logP + Σ_{i∈A} w_i · gap_i        with  w_i = f(precision_i, regime, correlation)
  σ_FV² = Σ w_i² σ_i²  + 2 Σ_{i<j} w_i w_j ρ_ij σ_i σ_j   (correlations MATTER — see Part 3)
```

This is a standard **forecast-combination / precision-weighted-mean** result, which is
theoretically well-founded and empirically robust. The naive additive form is not.

---

## Part 3 — Ensemble & regime-adaptive weighting

**Would a weighted ensemble beat a single model? Yes**, provided member errors are partly
independent — the combination's variance is lower than any single member's. **The failure mode is
correlation:** the candidate level anchors (compass, tiers-T1, carry) all key off the
rate-differential factor. Naive averaging double-counts it and makes the ensemble *look* more
confident than it is (`SYSTEM_ASSESSMENT.md §2.4`). Two disciplines:

- **Precision weight:** `wᵢ ∝ 1/σ_i²` using each member's **out-of-sample** residual std.
- **Orthogonalize:** de-correlate members before combining (the tiers already do PCA
  decorrelation; the Bayesian combiner already discounts the correlated T1/T3 pair — reuse that
  machinery). The ensemble's **dispersion** must reflect *independent* disagreement.

**Regime-adaptive weighting — already prototyped, must be generalized.** The prompt's example
(risk-on → positioning heavier, macro lighter; risk-off → real yields & credit dominate) is
*exactly* what `js/gold-model.js REGIME_WEIGHTS` already does for gold: a table of factor weights
that **sum to 1 per regime**, with the HMM regime selecting the row. The MVE build is to **lift
this pattern out of the gold model into the ensemble layer** and key it off the existing HMM /
macro-regime classifier:

```
  w_i(regime) = base_w_i · regime_multiplier_i[regime]     renormalized to Σ = 1
```

Mathematically this is a **mixture-of-experts** with a regime-indexed gate. Two guardrails so it
stays on the Lego path (`CLAUDE.md`: *"the brain is a selector, not more knobs"*):
- The regime multipliers are a **small principled table proven OOS**, not free parameters swept
  to fit. Start from theory (risk-off ⇒ real-yield/credit up, carry down) and validate.
- Cap how far any weight can move per regime, so a mislabeled regime can't hand 100% to one model.

**This is the single most institutionally-distinctive piece the platform already half-owns** —
most retail stacks have no regime-conditioned weighting at all.

---

## Part 4 — Confidence engine (mathematically)

Confidence should be a **posterior probability that the fair value is trustworthy and the gap
will converge**, built as a product of independent factors (equivalently, a log-odds sum — reuse
`computeBayesianScore`). Each factor is already computable:

```
  Confidence = σ( Σ_k β_k · z_k )         (logistic over standardized factor evidences)
```

| Confidence rises when… | Falls when… | Measured by | Status |
|---|---|---|---|
| Models **agree** | Models **diverge** | ensemble dispersion `sd(gap_i)` (low = agree) | needs ensemble |
| Historical **error low** | error high | OOS residual std of members | ⚠️ in-sample today |
| **Vol stable** | vol clustering | GARCH cluster / vol-of-vol | ✅ |
| **Regime persistent** | regime transition | HMM self-transition prob, BOCPD change-point prob | ✅ |
| **Correlations normal** | correlations break | rolling corr vs historical (Kalman-OLS β stability) | ✅ betas exist |
| Fit **strong** | fit weak | cointegration EG p-value / OU t-stat, r² | ✅ |
| Reversion **fast/reliable** | slow/absent | OU half-life, empirical snap-back base rate | ✅ half-life; ⚠️ base rate |

The mathematically clean statement: **confidence = calibrated P(convergence | evidence)**, where
evidence is model-agreement, OOS accuracy, regime persistence, and correlation stability. The
single weakest input today is **OOS error** — residual std is measured in-sample, which inflates
confidence (`SYSTEM_ASSESSMENT.md §2.1`). Build the denominator on walk-forward error or the whole
engine is over-confident by construction.

---

## Part 5 — Mispricing engine: which score is strongest?

Ranked, with the verdict:

| Method | Form | Verdict |
|---|---|---|
| Simple difference | `FV − P` | Display only — not comparable across instruments/time |
| Percentage difference | `(FV−P)/P` | Marginally better; still ignores FV uncertainty |
| Price z-score | `z(P)` | **Wrong object** — measures extension vs own history, not vs fair value |
| Standardized error | `(FV−P)/σ_resid` | ✅ Right idea — **already emitted** by `compassDivergence` & gold OLS |
| Residual regression error | residual of the cointegrating fit | Same as above, framed as the OU deviation |
| **Bayesian posterior** | `P(mispriced\|evidence)` | ✅ The *decision* layer on top of the z |
| **Mahalanobis distance** | `√((x−μ)ᵀ Σ⁻¹ (x−μ))` | ★ **Strongest when mispricing is multi-dimensional** |

**Recommendation.** For a *single* fair-value model, the strongest score is the
**prediction-interval-adjusted standardized residual** — the cointegrating-residual **t-stat that
folds in FV estimation error** (widen σ by the regression's parameter-uncertainty term, because
`α+β'X` is estimated). This is a small, principled upgrade to the standardized residual the repo
already computes.

For the *ensemble/MVE*, where "mispricing" lives in a multi-factor space (cheap vs rates AND vs
positioning AND vs structure, with those factors correlated), **Mahalanobis distance is the
theoretically correct generalization** — it standardizes the joint deviation by the **covariance**
of the factors, so correlated cheapness isn't triple-counted. Mahalanobis is **not currently
implemented anywhere** (confirmed by search) and is the natural mispricing metric for a true
multi-model engine. Wrap it in the **Bayesian posterior** for the final `P(mispriced)` the UI
shows.

---

## Part 6 — Probability / convergence engine

Move from *"cheap"* to a **distribution of outcomes** — and the primitive already exists
(`hedgeSignalV2Engine.js` OU), it just needs pointing at the MVE residual. For an OU deviation
`z_t` (speed λ, diffusion σ), the future deviation is **Gaussian in closed form**:

```
  E[z_{t+T}|z_t] = z_t·e^(−λT)                 Var = (σ²/2λ)(1 − e^(−2λT))
```

From which every requested output falls out:

- **P(mean reversion)** — `P(|z_{t+T}| < k)` or a first-passage probability of touching FV within T.
- **Expected magnitude** — `z_t(1−e^(−λT))` in σ, → pips via β and pip size.
- **Expected time horizon** — half-life `ln2/λ` (already computed).
- **Confidence interval** — `E ± 1.96·√Var` → an honest cone, not a point target.
- **Distribution of outcomes** — the full Gaussian transient density (or an empirical bootstrap
  of historical snap-backs of similar magnitude).
- **Tail risk** — the OU tails **understate** real FX tails (jumps, regime breaks). Report the
  OU CI **and** an empirical/EVT tail from the historical residual distribution; when the two
  diverge, trust the fatter one. This is the honest way to avoid selling a thin-tailed illusion.

Discipline: fit λ,σ **out-of-sample**, and benchmark the model P against the **measured empirical
snap-back base rate** (the Pine `yield-lag-forecast` indicator already measures one — that's the
floor the model must beat, not replace).

---

## Part 7 — Dashboard integration & the per-trade valuation card

Integrate as a **layer feeding the existing stack**, never a replacement (Lego Principle):

| Surface | Integration |
|---|---|
| **Macro Score** | MVE consumes tiers as inputs; surface a Macro-FV **gap** beside the ±18 score |
| **Entry Scanner** | add a **mispricing tag** + weight when a structural level aligns with the MVE gap direction (mirrors existing "Signal aligned +1") |
| **AI Summary** | feed `(FV, mispricing z, half-life, P(convergence), confidence)` per instrument into `aiCollectSnapshot` |
| **Trade Signals** | a new **6th factor in `computeSignalScore`** (valuation) — smallest change, whole-dashboard reach |
| **Risk Engine / Sizing** | size ∝ `confidence × |mispricing|`, capped by **fractional Kelly** (Kelly already computed in backtests) and vol |
| **Trade Journal** | log fair value & mispricing **at entry** so realized convergence can be scored → feeds the learning layer (Q-Final #5) |

Every trade card should show:

```
  Estimated Fair Value  1.0840        Current Price  1.0795
  Mispricing            +45p (+1.8σ, cheap)          Confidence  68%
  P(convergence, 10d)   64%           Expected Move  +28p   CI [−12, +70]
  Expected Hold         ~9 trading days (OU half-life)
  Expected Return / Risk / Sharpe      +0.35% / 0.22% / ~1.1 (ex-ante, model)
  Suggested size        ½-Kelly × confidence = 0.7%
```

**Honesty flag on this card:** every number right of "Mispricing" is a **model expectation**, and
ex-ante Sharpe/Kelly from an in-sample fit is the single most over-trusted figure in quant retail.
Label them "model, ex-ante" and drive sizing from the **out-of-sample-calibrated** confidence, not
the raw Kelly — half-Kelly at most, because Kelly on an estimated edge is famously over-levered.

---

## Part 8 — Gap analysis

| Capability | Status | Impact | Where / Note |
|---|---|---|---|
| Standardized-residual mispricing (single model) | ✅ Exists | High | `compassDivergence`, gold OLS |
| GARCH + **HAR-RV** vol, walk-forward A/B scored | ✅ Exists | High | `volForecast.js`, `volEstimatorAB.js` |
| OU half-life / EG cointegration primitive | ✅ Exists | High | `hedgeSignalV2Engine.js` (points at pairs) |
| **Regime-adaptive weight table** | ✅ Exists (gold only) | High | `gold-model.js REGIME_WEIGHTS` — generalize |
| Bayesian ensemble-combiner pattern | ✅ Exists | High | `computeBayesianScore` (directional) |
| Structure magnets (OI walls, max pain, confluence, sessions) | ✅ Exists | Medium | `oi.js`, `confluence-core.js`, `ranges.js` |
| Kalman-OLS rolling betas / correlation stability | ✅ Exists | Medium | `bot/modules/beta_estimator.py` |
| Multi-factor **per-instrument FV regression** (BEER-style) | ⚠️ Partial | High | one driver live (spread); gold 2-factor in HTML |
| OOS / prediction-interval mispricing denominator | ⚠️ Partial | High | residual std is in-sample today |
| Cointegration applied to **price-vs-macro** (not pairs) | ⚠️ Partial | High | re-point the OU/EG primitive |
| **Ensemble consensus FV + dispersion** | ❌ Missing | High | the core MVE object |
| **Convergence-probability layer** (OU: P, magnitude, T, CI) | ❌ Missing | High | primitive exists, not wired to FV |
| **Regime-adaptive weighting at ensemble level** | ❌ Missing | High | lift gold pattern to the MVE |
| **Mahalanobis** multi-factor mispricing | ❌ Missing | Medium | correct joint-deviation metric |
| **Implied-vol surface / IV, risk reversals, vol cones, VRP** | ❌ Missing | Medium | platform is **realized-vol only** — no options-implied inputs at all |
| **Deflated Sharpe / purged-CV** validation | ❌ Missing | High | needed before any MVE claim (`SYSTEM_ASSESSMENT §2.1`) |
| **Online/continuous weight learning from OOS PnL** | ❌ Missing | Medium | gold weights are hardcoded, not learned |
| Cross-sectional BEER panel (rich/cheap ranking) | ❌ Research | Medium | after single-instrument FV proven |
| Equity-index fair value (ERP / earnings-yield vs real yield) | ❌ Research | Medium | after FX/gold engine proven |
| **Not worth building:** live options full Greeks pricing engine | 🚫 | — | manual-paste OI + realized-vol proxy is adequate; a live IV feed (not a pricer) is the real gap |
| **Not worth building:** deep-learning price predictor | 🚫 | — | data-poor, non-stationary, unfalsifiable; contradicts the honest-harness ethos |

---

## Q-Final — The five highest-value research projects (brutally honest)

Ranked by **expected forecasting improvement**, with difficulty/effort and a candid note on why
each will (or won't) move the needle.

### 1. Multi-factor, per-instrument cointegrating Fair-Value model + OOS mispricing
*Generalize `compassDivergence` to (real-rate diff, DXY, curve, and for gold real-yield+breakevens),
validate stationarity, standardize the residual on walk-forward error.*
- **Impact: Highest.** Converts the platform's most-defensible macro edge from bias to value and
  makes every other MVE piece possible. **But honest bound:** FX macro-fair-value reverts over
  **weeks-to-quarters**, and UIP fails short-horizon (the forward-premium puzzle) — so the daily
  hit-rate uplift is **modest**; the real gain is conviction, target selection, and patience.
- **Difficulty: Medium. Effort: Medium.** The regression and cointegration primitives exist.

### 2. Convergence-probability layer on the FV residual (OU + empirical/EVT tails)
*Point `hedgeSignalV2Engine`'s OU/half-life at the FV residual; emit P(revert), magnitude, horizon,
CI; cross-check vs empirical snap-back base rate.*
- **Impact: High.** This is what turns "cheap" into a **sized, time-boxed thesis** — the difference
  between a valuation and a trade. Cheap relative to effort because the primitive is built.
- **Difficulty: Low–Medium. Effort: Low.** Main work is honest tail modelling and OOS λ fitting.

### 3. Ensemble consensus + regime-adaptive weighting (generalize `REGIME_WEIGHTS`)
*Precision-weighted, de-correlated combination of the FV members; regime-indexed weight table lifted
from the gold model to the MVE.*
- **Impact: High, but conditional.** Beats a single model **only if** members' errors are genuinely
  independent — and here they're correlated through the rate factor, so the *realized* gain is
  smaller than ensemble theory promises. Worth it mainly for **robustness** (graceful degradation
  when a feed dies) and regime-appropriate emphasis, not a large accuracy jump.
- **Difficulty: Medium. Effort: Medium.** Reuse PCA-decorrelation + gold weight pattern.

### 4. Honest validation harness: purged/embedded walk-forward + deflated Sharpe
*Not a forecasting model — the thing that tells you whether 1–3 are real.*
- **Impact: High (indirect).** Per `SYSTEM_ASSESSMENT`, the platform's headline numbers are
  in-sample with optimistic fills. Without deflated-Sharpe / purged-CV, **any MVE edge you measure
  is unfalsifiable** and you'll size into noise. This is the highest-ROI *non-model* project and
  should arguably run **alongside #1**, gating everything.
- **Difficulty: Medium. Effort: Medium.** Standard, well-documented techniques.

### 5. Continuous-learning weight layer (score members OOS, update weights)
*Log FV & mispricing at entry (trade journal), score realized convergence, nudge member/regime
weights toward what's actually been accurate — a slow, capped Bayesian update, not a fast RL loop.*
- **Impact: Medium.** Real but **easy to overfit** — chasing recent OOS performance on a short,
  non-stationary FX record is how learning layers *lose* money. Must be heavily regularized (shrink
  to priors, cap step size, long half-life). Do it **last**, only after 1–4 are proven, or it will
  amplify noise.
- **Difficulty: Medium–High. Effort: High.** The engineering (journal → scorer → updater) is more
  than the math.

### What is *not* worth building (and why)
- **A live options-Greeks pricing engine** — the manual-paste OI + realized-vol proxy is adequate;
  the genuine gap is a **live IV/risk-reversal feed** (an *input*, cheap), not a pricer.
- **A deep-learning price predictor** — FX is data-poor and non-stationary; DL here overfits,
  resists falsification, and violates the honest-harness ethos. It will not beat a well-specified
  cointegration model out-of-sample.
- **More confluence sources / more tiers** — the platform's risk is *breadth over depth*
  (`SYSTEM_ASSESSMENT §2.5`); adding signals raises in-sample fit and lowers OOS trust. Stop adding
  inputs; start valuing and validating.

---

### The blunt summary

By parts, you own an MVE: a fair-value seed (compass), a vol engine with a **walk-forward A/B bench**
(rare), an **OU convergence primitive**, a **Bayesian combiner**, and — unusually — a **regime-adaptive
weight table**. What you don't yet own is the **assembly**: one consensus fair value per instrument, a
standardized-and-validated mispricing, a convergence distribution, and the OOS harness that proves any
of it. Build #1, #2, #4 first (value → probability → proof); add #3 for robustness; defer #5. The
result is the reframe you want — from *"here are good setups"* to *"here is where the market is
statistically mispriced, how confident we are, and how likely and how fast it converges."* Just don't
let the elegance of the engine outrun the evidence for its edge — that discipline, not the architecture,
is what separates this from the desks you named.

---

## Part 9 — North Star & sequencing (the build order)

Two grander targets get proposed once the MVE idea lands: a **Market State Space Model** (each
model estimates a hidden state; a filter fuses them) and a **Market Relationship Engine** (every
instrument valued as part of one connected macro system). Verdict on each, then the concrete steps.

### 9.1 Verdict — is each a better target, or too far?

| Target | Verdict | Why |
|---|---|---|
| **Market State Space Model** | **Adopt the framing; take the Kalman upgrade — reachable, not too far.** | It is the *same object* as the MVE, one abstraction up. The genuine upgrade over a static precision-weighted mean is a **Kalman / dynamic-linear model**: consensus fair value = a **hidden state that evolves**; each model = a **noisy observation**. That buys recursive online updates, time-varying precision weighting, and forward-propagated uncertainty (σ/CI for free). The machinery already exists (`compute5mKalmanDev`, `beta_estimator.py KalmanBeta`). **Caveat:** a filter over unvalidated observations makes bad inputs look *precise* — build and OOS-validate the emitters first, then wrap them. |
| **Relationship Engine — factor-model form** | **Right long-term destination.** | Model a *small* set of shared macro factors (real rates, DXY, risk appetite, inflation expectations, liquidity); each instrument's fair value is a **loading** on them. Cross-asset coherence falls out automatically. Estimable, honest, and the repo already has seeds (5-factor macro beta, Kalman-OLS β, cross-pair USD strength, correlations dash). |
| **Relationship Engine — causal propagation graph** | **🚫 Too far, and an overfitting trap.** | "Shock in oil → inflation → bonds → FX → gold" as an *estimated directed network*: parameters scale as N², relationships are non-stationary (correlations break in exactly the crises you built it for — `SYSTEM_ASSESSMENT §2.4`), and causal identification isn't recoverable from correlations on ~10–15y of daily data. Looks brilliant in-sample, dissolves OOS. Build the factor model, not the graph. |

**The rule that governs all tiers:** each step (ensemble → SSM → cross-asset) multiplies the number
of *estimated relationships*, which multiplies overfitting risk. So the unglamorous validation harness
must exist **first** and scale with the ambition. The grander the target, the earlier the harness.

### 9.2 The emitter contract (the thing every phase depends on)

Every fair-value model implements one interface — a Tier-1 brick contract, so the ensemble, the
filter, and the UI all consume the same shape:

```
  estimate(ctx) → { fairValue, sigma, confidence, asOf }   // fairValue in price units; sigma = OOS residual std
```

`sigma` **must** be an out-of-sample residual std (walk-forward), not the in-sample fit residual —
this single choice is what keeps every downstream confidence honest.

### 9.3 The steps

**Phase 0 — Validation harness (do FIRST; it gates everything).**
- Build a shared brick: purged/embedded walk-forward split + **deflated Sharpe** (adjust for trials).
- Acceptance: reproduce one existing in-sample number *and* print its deflated counterpart beside it.
- Why first: without it, every later "it works" is unfalsifiable (`SYSTEM_ASSESSMENT §2.1`).

**Phase 1 — Emitter contract + first two fair-value models.**
- Define the `estimate()` contract above as a brick; register it in `LEGO_MODULES.md`.
- Refactor the two existing fair values to it: `compassDivergence` (FX) and `system-gold-macro.html`'s
  OLS (gold). Extend the FX one from single-driver (spread) to **BEER-lite**: real-rate diff + DXY + curve.
- Acceptance (per model, per instrument): emits `(fairValue, sigma)`; residual is stationary
  (Engle-Granger / OU t-stat passes); OOS residual is calibrated (coverage of the 68/95 bands).

**Phase 2 — Mispricing + convergence (per model, before any ensemble).**
- Mispricing = **prediction-interval-adjusted standardized residual** (fold in β estimation error).
- Point the existing OU/half-life primitive (`hedgeSignalV2Engine.js`) at the FV residual → emit
  `P(convergence), expected magnitude, half-life, CI`, plus an **empirical/EVT tail** alongside the OU CI.
- Acceptance: OU convergence probability is **benchmarked against the measured snap-back base rate**
  OOS (the Pine indicator already computes one) — it must at least match it, honestly reported if not.

**Phase 3 — Ensemble consensus + regime-adaptive weights.**
- Combine emitters as **precision-weighted, de-correlated** gaps (reuse the PCA-decorrelation + T1/T3
  discount patterns). Output consensus `fairValue`, `sigma_FV`, and **dispersion** (member disagreement).
- Add regime-adaptive weights by **lifting `gold-model.js REGIME_WEIGHTS`** to the ensemble, gated by
  the HMM/macro regime (mixture-of-experts). Weights capped per regime; table proven OOS, not swept.
- Acceptance: ensemble OOS error ≤ best single member; dispersion moves confidence sensibly.

**Phase 4 — Wire into the decision surface (make it change decisions, not just display).**
- 6th **valuation factor** in `computeSignalScore` (renormalize weights).
- Mispricing **tag + weight** in `runEntryScanner`; fair value as a non-arbitrary **TP target**.
- MVE block into `aiCollectSnapshot` → the AI narrates valuation, not just structure.
- Per-trade **valuation card** (Part 7); **journal logs FV & mispricing at entry** (feeds Phase 6/learning).

**Phase 5 — Kalman SSM wrapper.**
- Replace the static combiner with a DLM: hidden state = consensus FV; observations = emitters, each
  with its `sigma`. Reuse the repo's Kalman code.
- Acceptance: SSM OOS ≤ static ensemble error and CIs are **calibrated** (not just tighter).

**Phase 6 — Shared-factor cross-asset model (the safe Relationship Engine). ONLY after 1–5 prove OOS edge.**
- Small common-factor set → per-instrument loadings; values update jointly. Explicitly **not** a
  propagation graph. Start read-only (a coherence check on the independent FVs) before it feeds sizing.

**Deferred / do-not-build (restated):** learned/online weight updating (Phase 5.5 at earliest, heavily
regularized), live options-Greeks pricer (get an IV *feed* instead), deep-learning price predictor,
more confluence sources/tiers.

### 9.4 The minimal first slice (if you build one thing this week)
Phase 0's deflated-Sharpe walk-forward brick + Phase 1 on **EUR/USD only**: refactor `compassDivergence`
to the `estimate()` contract, add the real-rate and DXY factors, and print its **OOS** mispricing z with
calibrated bands. That single vertical slice proves the contract, the validation, and the honesty of the
σ end-to-end — everything else is repetition and composition on top of it.

---

*Reviewed against the working tree (JS modules, Python bots/backtests, Pine, HTML, `server.js`,
`_worker.js`). Module classifications and "exists/missing" claims were grep-verified. All
forecasting/edge estimates are ex-ante and in-sample unless noted; treat this as a build-map and a
falsification plan, not a promise of returns.*
