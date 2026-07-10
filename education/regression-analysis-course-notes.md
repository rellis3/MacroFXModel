# Regression Analysis Course — Study Notes (Lessons 1–8)

> **Source:** Colez Trades, "Regression Analysis" course, Lessons 01–08
> (Why Regression Matters → Advanced Extensions & What's Next).
> **Purpose of this file:** my own study notebook — learn the material like a
> university student would: compress each lesson, keep the formulas and mental
> models at hand, list the questions I'd be examined on, and record research /
> implementation ideas for this codebase. Written for future-me: re-read this
> before writing or reviewing any regression in MacroFXModel.
>
> **House rule applies (CLAUDE.md):** notes on a *method* are not evidence of
> *edge*. Regression is infrastructure — a falsification tool, not an alpha
> source. §11 below is the honest-prior assessment; read it before getting
> excited about any of this. This course's own discipline (OOS validation,
> multiple-testing skepticism, robust SEs) is *exactly* the discipline this
> repo already enforces, so the notes double as the statistical "why" behind
> our harness rules.

---

## 0. One-paragraph summary of the whole course

Regression decomposes variation in returns into an **explained** part (factor
exposures, the β's) and an **unexplained** part (the residual ε, where alpha —
and noise — live). OLS finds the line minimizing squared residuals; the slope
is `β = Cov(X,Y)/Var(X) = ρ·(σY/σX)` — correlation scaled by relative
volatility. R² measures fit but not correctness or predictive power; adjusted
R² penalizes complexity. Inference (t-stats, p-values, CIs) is only valid if
the standard errors are right, and in finance they almost never are under
classical assumptions — volatility clusters (heteroskedasticity) and errors
correlate over time (autocorrelation) — so **Newey-West SEs are the default**.
Multiple regression gives *partial* effects and enables factor models
(CAPM → Fama-French 3/4/5), but multicollinearity (check VIF) destroys
coefficient interpretability, and the **multiple-testing problem** means the
factor-discovery bar is **|t| > 3** (Harvey-Liu-Zhu), not 2. The failure modes
that kill strategies between backtest and live are overfitting (in-sample fit
≠ prediction), look-ahead bias, non-stationarity (rolling betas drift), and
implementation friction (costs, lags, capacity). The cure is walk-forward
out-of-sample validation, robustness across periods/markets/specs, and
theory-first factor selection. Advanced tools: panel regression with fixed
effects + clustered SEs, Fama-MacBeth two-stage for factor premia, and
Ridge/Lasso regularization when predictors are many.

---

## 1. Lesson 01 — Why Regression Matters

### [CORE]

- The fundamental question: **"what drives returns?"** Regression decomposes a
  return into market / factor / idiosyncratic components — and the leftover
  intercept is the alpha claim.
- Total variation = explained (systematic, `ΣβₖXₖ`) + unexplained (residual ε).
  `R² = explained / total`.
- Who uses it: AQR (factor construction), Two Sigma (signal discovery), DFA
  (risk attribution), every allocator (performance attribution — "alpha or
  just beta?").
- **CAPM** is the template: `Rᵢ − Rᶠ = α + β(Rₘ − Rᶠ) + ε`.
  α = skill claim, β = market sensitivity, ε = idiosyncratic noise.
- The factor-model lineage — each step came from **patterns found in the
  residuals** of the previous model:
  1. CAPM (1960s, market only)
  2. Fama-French 3-factor (1993: + SMB size, HML value)
  3. Carhart 4-factor (1997: + UMD momentum)
  4. Fama-French 5-factor (2015: + RMW profitability, CMA investment)
- **Factor zoo warning:** hundreds of published factors; many are
  multiple-testing artifacts that fail to replicate.
- Correlation ≠ causation: omitted variable bias, reverse causality,
  coincidence. Pragmatically we care about *prediction*, but **predictors with
  a plausible causal mechanism are more robust OOS** (value has a story;
  "ticker starts with A" doesn't).

### [ANALYSIS]

- The "alpha is what's left over" framing is the single most useful idea for
  this repo: any claim that a strategy "works" is implicitly a claim about a
  regression intercept after the right factors are included. Most apparent
  alpha is mislabeled factor exposure or risk (a β=1.2 manager "beats" the
  market in up years).
- The causal-story heuristic maps exactly onto our folklore-vs-replicated
  distinction in CLAUDE.md: momentum/carry/vol-premium have mechanisms and
  replication; S/R levels and range fibs mostly don't.

### Exam-style questions

- Q: A fund beats its benchmark by 3%/yr with β = 1.3 to that benchmark. Is
  that alpha? → A: Not necessarily — CAPM-regress its excess returns; the 3%
  may be fully explained by the higher β (more risk, not skill).
- Q: Why did SMB/HML "kill" small-cap and value alphas? → A: The alphas were
  loadings on omitted factors; adding the factors moved that return from α
  into β·F.

---

## 2. Lesson 02 — Simple Linear Regression Foundations

### [CORE]

- **OLS objective:** minimize `Σ(Yᵢ − Ŷᵢ)²`. Squared errors ⇒ heavy outlier
  penalty, differentiable (closed-form solution), convex (unique minimum),
  maximum-likelihood under normal errors.
- **Equation:** `Y = α + βX + ε`. In CAPM terms: α = excess return unexplained
  by the factor; β = sensitivity; ε = idiosyncratic.
- **Formulas (memorize):**
  - `β = Cov(X,Y) / Var(X)`
  - `α = Ȳ − βX̄` (line always passes through the centroid (X̄, Ȳ))
  - **`β = ρ_XY · (σY / σX)`** — beta is correlation scaled by relative vol.
    High β can come from high correlation OR high relative volatility (crypto
    can have β = 2 vs equities from vol alone, not correlation).
- Every observation decomposes as **actual = fitted + residual**. Fitted
  values = the explained/systematic part (risk attribution); residuals = the
  unexplained part (alpha hunting, diagnostics, outlier detection).
- **The four OLS assumptions, ranked by severity:**
  1. *Linearity* — usually manageable (transform variables).
  2. *Homoskedasticity* — almost always violated in finance (vol clustering).
     Coefficients still unbiased; **SEs wrong** → fix with White/robust SEs.
  3. *No autocorrelation* — often violated in time series. SEs typically
     **underestimated** → results look more significant than they are. Fix
     with Newey-West.
  4. *Exogeneity* (X uncorrelated with ε) — **the big one**. Violation ⇒
     coefficients themselves are biased; no amount of data fixes it. Caused by
     omitted variables, reverse causality, measurement error.
- **Hierarchy:** het/autocorr = annoying, fixable with robust SEs. Exogeneity
  = your β doesn't measure what you think. Worry about exogeneity most.
- Interpretation discipline: sign, magnitude, **units** (a rescaled X rescales
  β — 0.5 per % vs 50 per decimal is the same relationship); standardized
  coefficients (z-score both sides) for apples-to-apples comparisons;
  **economic vs statistical significance** are different questions.

### [ANALYSIS]

- The `β = ρ·(σY/σX)` identity is quietly the most FX-relevant formula in the
  course: cross-pair "betas" (e.g. AUDJPY on risk sentiment) are often just
  vol ratios in disguise. Before reading a large β as "strong linkage",
  decompose it — is it correlation or relative vol? Our σ machinery
  (`volSigmaSeries`) gives σY, σX for free.
- OLS's outlier sensitivity matters a lot for FX daily returns (fat tails,
  event days). Visualize before trusting; see Lesson 6's Cook's Distance.

### Exam-style questions

- Q: Regression gives β = 0.5 on "earnings surprise in %". You switch the
  regressor to decimals. New β? → A: 50 — same relationship, units changed.
- Q: Two assets have identical correlation 0.6 with the market; asset A has
  2× the market's vol, asset B 0.5×. Betas? → A: A: 1.2, B: 0.3.
- Q: Which assumption violation biases β itself (not just SEs)? → A:
  Exogeneity failure (omitted variables / reverse causality / measurement
  error).

---

## 3. Lesson 03 — Measuring Model Fit: R² and Adjusted R²

### [CORE]

- `R² = 1 − SSres/SStot = SSexp/SStot`, where
  `SStot = Σ(Yᵢ−Ȳ)²`, `SSexp = Σ(Ŷᵢ−Ȳ)²`, `SSres = Σ(Yᵢ−Ŷᵢ)²`.
- R² measures **scatter around the line, not the slope**: two datasets with
  identical β can have R² = 0.92 vs 0.35 (tight vs noisy). A coefficient can
  be highly significant with tiny R².
- R² does **not** tell you: correct specification, coefficient significance,
  or OOS predictive power. High R² can coexist with a garbage (overfit or
  biased) model; low R² can coexist with a genuinely useful factor
  (β = 0.5, t = 4, R² = 0.05 is *valuable*).
- **Adjusted R²** `= 1 − [(1−R²)(n−1)/(n−k−1)]` penalizes each added
  variable; it *falls* if a new variable doesn't pull its weight. Plain R²
  never decreases when you add variables — even pure noise.
- **Finance benchmarks (memorize):**

  | Application | Typical R² |
  |---|---|
  | Cross-sectional return prediction | 0.03–0.10 |
  | Time-series market model (CAPM) | 0.30–0.70 |
  | Multi-factor models (explaining, not predicting) | 0.50–0.90 |
  | Suspicious — check for overfit/leakage | > 0.95 |

- Overfitting signature: complex model, in-sample R² 0.99 → OOS R² 0.25;
  simple model 0.65 → 0.60. **The gap is the tell.**
- Other metrics: RMSE (error in original units), MAE (outlier-robust), AIC
  `= 2k − 2ln(L)` and BIC `= k·ln(n) − 2ln(L)` (fit-vs-complexity; BIC
  penalizes harder, prefers simpler models; both work for non-nested
  comparison).

### [ANALYSIS]

- The benchmark table is a calibration tool for reading *other people's*
  claims: any FX return-prediction pitch with R² above ~0.10 cross-sectionally
  should trigger the leakage/overfit alarm, not excitement.
- "Maximizing R² is not the goal" is the statistical restatement of our house
  rule that in-sample improvement is not evidence. The repo's harness judges
  on **OOS Sharpe with ≥30 OOS trades**, which is the trading equivalent of
  the in-sample/OOS R² gap check.

### Exam-style questions

- Q: You add a random-noise column and R² rises 0.52 → 0.53 while adjusted R²
  falls 0.51 → 0.50. Keep it? → A: No — the complexity penalty exceeded the
  fit gain; it's noise.
- Q: Is R² = 0.05 good or bad? → A: Depends: excellent for cross-sectional
  next-month return prediction; terrible for a large-cap CAPM time-series fit.
- Q: When prefer BIC over AIC? → A: Large samples / when you want the stronger
  parsimony bias in model selection.

---

## 4. Lesson 04 — Statistical Inference & Significance

### [CORE]

- **t-statistic = β / SE(β)** — signal-to-noise: how many standard errors the
  estimate sits from zero. β = 0.5 with SE 0.1 (t = 5) is strong; the same β
  with SE 0.4 (t = 1.25) is nothing yet.
- **SE(β) shrinks with:** more observations (≈ halves per 4× n), less residual
  variance, more spread in X.
- **Robust SE ladder (defaults for finance):**

  | Type | Robust to | Use |
  |---|---|---|
  | Classical | nothing | almost never in finance |
  | White (HC/HC3) | heteroskedasticity | cross-sections |
  | **Newey-West (HAC)** | het **and** autocorrelation | **default for time series** |

- **p-value = P(data this extreme | null true)** — NOT P(null | data). p = 0.03
  means "if β were truly 0, I'd see this 3% of the time", not "97% chance the
  effect is real". "Fail to reject" ≠ "accept the null".
- **Confidence interval** `β ± 1.96·SE`: shows significance (excludes zero?)
  *and* precision (width) at a glance. β = 0.5 [0.1, 0.9] vs [0.45, 0.55] are
  very different findings with the same point estimate. Report CIs.
- **Multiple testing — the central problem in quant finance.** At α = 5%,
  1,000 tested factors ⇒ ~50 false positives by construction; publish only
  the significant ones and the literature fills with noise. Fixes:
  - Bonferroni (α/N — conservative),
  - False Discovery Rate control,
  - **Harvey-Liu-Zhu: require |t| > 3 for factor discovery** (a t of 2.5 in a
    heavily-mined space is suspect),
  - and the ultimate arbiter: **out-of-sample replication**.
- With enough data everything is "significant" — always report magnitudes and
  ask if the effect survives costs (economic significance).

### [ANALYSIS]

- The |t| > 3 rule is the piece to internalize hardest. Our own harness runs
  many slices (pairs × horizons × presets) — that IS multiple testing. A
  slice-level "winner" at t ≈ 2 across ~70 cells is exactly what noise
  produces (CLAUDE.md already says this: "count the cells and state the
  chance-baseline"). This lesson supplies the formal threshold to use.
- P-value misreading is the most common inferential error I should catch in
  my own writing: never phrase p = 0.03 as "97% likely real".

### Exam-style questions

- Q: 200 signals tested, 12 have p < 0.05. Impressed? → A: No — expect ~10
  false positives at α = 5%; 12 is barely above chance. Demand |t| > 3 and OOS.
- Q: Why are classical t-stats usually *inflated* in financial time series?
  → A: Positive autocorrelation makes classical SEs underestimate true
  uncertainty; Newey-West widens them.
- Q: What does a 95% CI of [−0.1, 0.7] tell you that "p = 0.14" doesn't?
  → A: The effect could plausibly be zero *or* economically large — an
  underpowered test, not a demonstrated null.

---

## 5. Lesson 05 — Multiple Regression & Factor Models

### [CORE]

- `Y = α + β₁X₁ + β₂X₂ + … + ε`. Each βₖ is a **partial effect** — the impact
  of Xₖ *holding the other regressors constant*. This is the whole point:
  isolating each factor's contribution and controlling confounders.
- Canonical example — **Fama-French + momentum (Carhart)**:
  `Rᵢ − Rᶠ = α + β₁(Mkt−RF) + β₂·SMB + β₃·HML + β₄·UMD + ε`.
  α here is a *higher bar* than CAPM α: return unexplained by market AND size
  AND value AND momentum.
- **Multicollinearity:** correlated predictors don't bias *predictions*, but
  they blow up coefficient SEs and make individual β's uninterpretable.
  Detect with **VIF**: ≈1 fine, 5 moderate, **>10 serious**.
  - The paradox: significant F-test (factors jointly matter) with **no**
    individually significant t-stats — the factors fight over shared variance.
- **F-test:** H₀: all slopes jointly zero. Rejecting says "the model matters",
  not *which* variable matters.
- **Model-building process:** (1) theory first — economic rationale; (2) clean
  factor data (no look-ahead, delisting handled); (3) OLS with Newey-West,
  check VIF, examine residuals; (4) validate OOS across periods/markets.
- Reading output: coefficients for economics, t-stats for significance; treat
  borderline results (e.g. HML β = 0.15, t = 1.88, p = 0.062) as suggestive,
  not conclusive.
- **Pitfalls:** overfitting via factor-stacking, look-ahead bias (year-end
  book value predicting January), unintentional factor timing (selecting on
  recent performance), survivorship bias (delisted assets vanish with their
  losses).

### [ANALYSIS]

- Partial-effect thinking is what our confluence/level scoring currently
  lacks formal machinery for: when several "features" (ADX, WaveTrend, TWAP
  distance, day-type score) all fire together, are they independent evidence
  or the same information counted twice? That's a multicollinearity question,
  and VIF on our feature matrix would answer it cheaply.
- FX has no clean Ken-French-style factor library. Replicated FX factors are
  **carry, time-series momentum, value (PPP-deviation), dollar factor**;
  building them honestly needs rates data (carry needs swap/forward points —
  flagged in CLAUDE.md as a data limit). Don't run a lookalike on OANDA mids
  and call it carry.

### Exam-style questions

- Q: Fund has CAPM α = 2% but Fama-French α = 0, β_HML = 0.6. Verdict? → A:
  No skill demonstrated — the "alpha" was value-factor exposure.
- Q: F-test p < 0.001 but every t-stat < 1.5. Diagnosis? → A: Multicollinearity
  — check VIF; predictors share explanatory variance.
- Q: Why is survivorship bias an *upward* bias on backtest returns? → A:
  Assets that died (usually after losses) are excluded, so the surviving
  sample outperformed the true investable set.

---

## 6. Lesson 06 — Regression Diagnostics & Pitfalls

### [CORE]

- The big three violations in finance and their fixes:

  | Violation | Looks like | Consequence | Detect | Fix |
  |---|---|---|---|---|
  | Heteroskedasticity | vol clustering; funnel in residual-vs-fitted plot | SEs wrong (coeffs fine) | Breusch-Pagan, White test, eyeball | White/HC3 robust SEs |
  | Autocorrelation | residual trends/cycles; today's ε predicts tomorrow's | SEs *understated* → inflated t | Durbin-Watson (≈2 good, <2 positive AC), ACF plot, Ljung-Box | **Newey-West (HAC)** |
  | Non-stationarity | parameters drift; regime breaks (2008, COVID) | model estimated on old regime is obsolete | rolling regressions, Chow test (known break), CUSUM (unknown) | rolling windows, per-regime estimation |

- **The four residual plots (always):** residuals vs fitted (curves/funnels =
  misspecification/het), residuals vs time (trends = AC / breaks),
  scale-location (funnel = het), Q-Q (fat tails — endemic in finance).
- **Outliers / influential points:** OLS is not robust; one crisis month can
  set your β. Detect with **Cook's Distance** (> 4/n rule of thumb),
  DFBETAS per-coefficient. Triage: data error → fix/remove; genuine extreme
  (COVID crash) → keep but report sensitivity; systematic outlier pattern →
  the model is missing a variable.
- **Checklist habit:** (1) plot residuals, (2) test het → robust SEs, (3) test
  AC → Newey-West, (4) Cook's D → sensitivity analysis. Document the
  diagnostics in the write-up ("SEs are Newey-West, 4 lags; results robust to
  excluding influential points").
- Rolling-beta instability is itself information: stable coefficients →
  relationship more likely to hold forward; jumpy coefficients → don't trust
  the full-sample estimate.

### [ANALYSIS]

- The residual-plot discipline generalizes beyond regression: our backtest
  equity curves deserve the same treatment (PnL residuals vs time, vs regime,
  vs vol level). A strategy whose edge is one influential cluster of trades
  (one year, one pair) is the Cook's-Distance problem wearing a trading hat.
- Q-Q fat tails: FX daily returns are leptokurtic, so normal-theory intervals
  understate tail risk in small samples — one more reason the repo's ≥30 OOS
  trade floor exists.

### Exam-style questions

- Q: Durbin-Watson = 0.9. Meaning + fix? → A: Strong positive autocorrelation;
  Newey-West SEs (coefficients stay, inference corrected).
- Q: 60-month rolling beta swings 0.4 → 1.6 → 0.7. Implication? → A:
  Non-stationary relationship — full-sample β is a fiction; use rolling
  estimation or regime splits and distrust long-horizon extrapolation.
- Q: Cook's D flags March 2020. Delete it? → A: No — it's a genuine extreme;
  keep it and report results with/without (sensitivity), unless it's a data
  error.

---

## 7. Lesson 07 — From Regression to Production Models

### [CORE]

- **The gap:** in-sample answers "how well do I explain the past?"; OOS
  answers "will this work forward?" In-sample can always be improved and can
  always be gamed; OOS cannot. In-sample R² 0.9 with OOS R² 0.1 = memorized
  noise.
- **Train-test split:** chronological for financial data (train early, test
  late). Cardinal rule: **never touch the test set during development** —
  repeated peeking = fitting the test set implicitly.
- **Cross-validation:** standard K-fold breaks time ordering (future leaks
  into training) — inappropriate for finance. **Walk-forward analysis is the
  gold standard:** train on data ≤ t, predict t+1, roll, repeat — exactly
  mimics live trading.
- **Rolling vs expanding windows:** rolling adapts to regime change but is
  noisier; expanding is more precise if the relationship is stable. Run both:
  similar results ⇒ stability; divergent ⇒ non-stationarity, prefer rolling.
- **Anti-overfitting kit:** fewer parameters; complexity penalties (adj R²,
  AIC/BIC); one genuine holdout looked at exactly once at the end; **theory
  first** — only factors with an economic story.
- **Robustness testing:** different periods (bull AND bear), different markets
  (does it generalize?), different specifications (lags, definitions, outlier
  treatment), parameter stability across subsamples. Fragile = probably not
  real.
- **Research → implementation reality check:**

  | Paper | Reality |
  |---|---|
  | Factor earns 10%/yr | −3%/yr transaction costs at high turnover |
  | Signal "daily" | data published with a 2-day lag → stale (look-ahead) |
  | Great backtest | published 2015 → post-publication decay |
  | Works at $1M | market impact kills it at $100M |

### [ANALYSIS]

- This lesson is essentially a statistics-flavored restatement of this repo's
  CLAUDE.md: costs on by default, true IS/OOS split, no lookahead, "built ≠
  works ≠ has edge". Good — the two sources agree, which raises confidence
  the discipline is right, not just house style.
- One thing the repo could adopt more formally from here: the **single
  untouched holdout**. Our IS/OOS split exists, but if we iterate on a
  strategy while repeatedly reading the OOS card, we're peeking — the OOS
  set slowly becomes in-sample. Worth keeping a final, never-consulted
  segment (or forward paper-trading period) as the true test.
- Capacity constraints are mostly irrelevant at our size (retail FX), but
  **implementation lag** is not: any signal built on data with delayed
  availability (COT reports, some macro series) must be lagged to its
  publication date, not its reference date.

### Exam-style questions

- Q: Why is standard K-fold CV invalid for return prediction? → A: Folds mix
  future and past — training sees data after the test period (temporal
  leakage). Use walk-forward.
- Q: You checked the test set 15 times while tuning. Status of the "OOS"
  result? → A: Contaminated — selection on test performance means it's now
  effectively in-sample.
- Q: Rolling-window and expanding-window results diverge sharply. Read? → A:
  Non-stationarity; the old data misleads; favor rolling / regime-aware
  estimation.

---

## 8. Lesson 08 — Advanced Extensions & What's Next

### [CORE]

- **Panel regression** (many assets × many periods): entity fixed effects
  absorb unobserved time-invariant asset characteristics; time fixed effects
  absorb common per-period shocks; **cluster SEs by entity and/or time** or
  t-stats are inflated. (Python: `linearmodels.PanelOLS`.)
- **Fama-MacBeth** — the workhorse of empirical asset pricing, two stages:
  1. Each month: cross-sectional regression of returns on lagged
     characteristics → a monthly premium estimate γₜ.
  2. Average the γₜ over time; SE from the time-series variation of γₜ;
     t-test the mean premium ≠ 0.
  Elegance: treating each month separately handles cross-sectional
  correlation naturally. This is how "does value/momentum predict returns?"
  is formally tested.
- **Regularization** (many predictors):

  | Method | Penalty | Effect |
  |---|---|---|
  | Ridge | L2 (Σβ²) | shrinks all toward 0; good for correlated predictors |
  | Lasso | L1 (Σ\|β\|) | drives some β exactly to 0 — variable selection |
  | Elastic Net | L1+L2 | both; λ chosen by cross-validation |

- **When to go beyond regression (ML):** genuine nonlinearity, 100+
  predictors, complex interactions. But ML makes overfitting *easier*, not
  harder, and costs interpretability. Burden of proof is on complexity —
  start simple, escalate only when simple demonstrably fails.
- **Institutional workflow:** research (hypothesis → data → regression →
  diagnostics) → validation (OOS, robustness — *where most strategies die*)
  → implementation (costs, lags, capacity) → live monitoring (live-vs-backtest
  tracking, decay watch) — forever.
- **Resources:** Cochrane *Asset Pricing*; Campbell/Lo/MacKinlay; Angrist &
  Pischke (causality); Ken French data library (free factor returns); Python
  `statsmodels` / `linearmodels`; SSRN, JF, JFE for current research.

### [ANALYSIS]

- Fama-MacBeth is directly usable here: our per-line book is a panel (many
  pairs × many days). "Does day-type score T predict next-day continuation?"
  is precisely a Fama-MacBeth question — cross-pair regression each day, then
  the time-series mean of daily slopes with its own SE. This handles the
  "all pairs are risk-on/risk-off correlated today" problem our pooled counts
  currently ignore.
- Lasso is the disciplined version of "which of these 10 confluence features
  actually matter" — better than eyeballing weights, but λ must be chosen by
  *walk-forward* CV, not random K-fold, per Lesson 7.
- The clustered-SE point retroactively critiques any pooled cross-pair stat
  we've reported: 26 pairs on the same day are not 26 independent
  observations — effective n is far smaller. Cluster by date.

### Exam-style questions

- Q: Why not just pool all asset-months in one big OLS to test a
  characteristic? → A: Cross-sectional correlation within each period (common
  shocks) violates independence → wildly understated SEs. Fama-MacBeth or
  panel + clustered SEs.
- Q: Ridge vs Lasso for 50 correlated candidate signals when you want a short
  interpretable list? → A: Lasso (or elastic net) — L1 zeroes out weak ones;
  ridge keeps all 50 small.
- Q: Name the four institutional pipeline stages and where strategies die.
  → A: Research → **validation (dies here)** → implementation → monitoring.

---

## 9. Master formula sheet (exam crib)

```
OLS objective:        min Σ(Yᵢ − Ŷᵢ)²
Slope:                β = Cov(X,Y)/Var(X) = ρ_XY · (σY/σX)
Intercept:            α = Ȳ − βX̄            (line passes through centroid)
Decomposition:        Yᵢ = Ŷᵢ + εᵢ           (actual = fitted + residual)
R²:                   1 − SSres/SStot
Adjusted R²:          1 − (1−R²)(n−1)/(n−k−1)
t-stat:               β / SE(β)              (|t|>2 classic, |t|>3 for factors)
95% CI:               β ± 1.96·SE(β)
AIC / BIC:            2k − 2ln(L)  /  k·ln(n) − 2ln(L)
RMSE / MAE:           √(Σε²/n)  /  Σ|ε|/n
CAPM:                 Rᵢ−Rᶠ = α + β(Rₘ−Rᶠ) + ε
Carhart:              Rᵢ−Rᶠ = α + β₁(Mkt−RF) + β₂SMB + β₃HML + β₄UMD + ε
VIF rule:             >10 = serious multicollinearity
Durbin-Watson:        ≈2 none, <2 positive AC, >2 negative AC
Cook's D flag:        > 4/n
Standardized β:       z-score X and Y first → β in SD units
```

**Default settings for any financial regression (non-negotiable):**
Newey-West (HAC) SEs · chronological splits only · walk-forward CV ·
|t| > 3 for anything mined from many specs · report CIs and magnitudes,
not just p-values · plot the four residual plots · document diagnostics.

---

## 10. Implementation ideas for MacroFXModel

Ranked by usefulness-per-effort, each tagged **[infrastructure]** (tooling,
no edge claim) or **[research]** (a testable hypothesis with a prior).

1. **`regressionCore.js` brick** *[infrastructure — high value]*. A Tier-1
   pure-math brick: OLS fit (β, α, SE, t, p, CI, R²/adj-R²), **Newey-West
   SEs** (maxlags param), rolling-window regression, VIF, Durbin-Watson,
   Cook's Distance. Pure functions on arrays, unit-testable on synthetic data
   (recover known β from generated data; NW vs classical SE under injected
   autocorrelation). Sits next to `statsCore.js` (which already owns
   z-scores/linregSlope — import, don't duplicate `linregSlope`; the brick
   should extend it with inference, not re-implement the slope). Register in
   `LEGO_MODULES.md` per Lego Principle 6.
2. **Diagnose the existing strategy features for multicollinearity**
   *[infrastructure]*. VIF across the confluence/range-bias feature set (ADX,
   WT, TWAP distance, Hurst, day-type T…) on historical data. If several
   features are VIF > 10, the "confluence" score is double-counting one
   signal — a concrete, cheap finding either way.
3. **Fama-MacBeth test of the day-type score** *[research — the honest way to
   ask "does T predict anything?"]*. Panel = 26 pairs × days. Each day,
   cross-sectional regression of next-window outcome (e.g. follow-vs-fade
   PnL, or realized drift/diffusion) on that day's T; then time-series t-test
   of the mean slope. Handles cross-pair same-day correlation that pooled
   counts ignore. Pre-registered outcomes: "works" = mean slope with |t| > 3
   and stable sign across subperiods; "null" = anything less. **Prior: mostly
   null (~15–20% something survives)** — T is built from the same price data
   as the outcome, and daily-horizon FX predictability is thin.
4. **Rolling-beta stability panel for pair relationships** *[infrastructure
   with research uses]*. Rolling 120-day regressions of each pair's returns
   on a dollar factor / risk proxy; plot coefficient paths. Direct
   application of Lesson 6 — tells us which "known" cross-pair relationships
   are stable enough to condition on. No edge claim; it's a regime lens.
5. **Clustered/date-aware error bars on existing pooled stats**
   *[infrastructure — correctness fix]*. Anywhere we report a cross-pair
   pooled win-rate or mean edge, effective n is inflated by same-day
   correlation. Cluster by date (or block-bootstrap by day) before quoting
   significance. Cheap, and it will *lower* some numbers we like — which is
   the point.
6. **Holdout hygiene** *[process]*. Designate a final time segment (or
   forward window) per strategy that is never consulted during iteration;
   the OOS card we look at every day is slowly becoming in-sample (Lesson 7).

**Explicitly not doing:** building an FX "factor model" for alpha out of
OANDA mid prices. Carry needs forward points/swap data we don't honestly
have (CLAUDE.md data-limits rule); value(PPP) is quarterly-horizon; a
lookalike would be fake productivity.

---

## 11. Honest-prior assessment (house rules applied)

- **What this course actually is:** a solid, correctly-prioritized statistics
  curriculum. Its core claims (robust SEs, |t|>3, walk-forward validation,
  overfitting as the #1 killer) are mainstream, replicated, and match the
  published literature (Harvey-Liu-Zhu 2016 is real and widely cited). This
  is **method, not edge** — regression finds and validates edges; it does not
  supply them.
- **Blunt odds statements:**
  - That adopting these tools improves our *falsification* ability: ~certain.
    This is infrastructure with no downside beyond build time.
  - That any specific regression-flavored research idea above yields a
    tradeable after-cost FX edge: **base rate applies — default null,
    ~10–20% each**. Daily-horizon FX is liquid and picked-over.
  - Fama-MacBeth on the day-type score is the best-value test because it
    *re-examines something already built* with sharper statistics, rather
    than adding surface — consistent with the repo's "validate the existing
    thing OOS before building new engines" rule.
- **Where the course is silent and our house rules must fill in:** it says
  little about *cost modeling* granularity (spread vs slippage by entry
  type — our harness is stricter) and nothing about the per-key persistence
  / operational side. Statistics discipline from the course; operational
  discipline from CLAUDE.md.
- **Self-warning for future-me:** the seductive failure mode after learning
  this material is running many regressions across many slices and getting
  excited about the |t| = 2.4 cells. The course's own answer: that is the
  multiple-testing problem, the threshold is 3, and the arbiter is
  walk-forward OOS. Don't re-narrate a null.

---

## 12. Open questions / future research list

- [ ] What's the right Newey-West lag for our data? (Rule of thumb ~4 for
      monthly; for daily FX, `floor(4(n/100)^(2/9))` is the Newey-West
      plug-in — verify against `statsmodels` before hardcoding.)
- [ ] Does the day-type score T survive Fama-MacBeth with date clustering?
      (Idea #3 above — pre-register before running.)
- [ ] VIF profile of the confluence feature set — which features are
      redundant? (Idea #2.)
- [ ] Are our pair-vs-dollar-factor betas stable (rolling windows) or
      regime-dependent (Chow test at known macro breaks)?
- [ ] Block-bootstrap by day vs clustered SEs for our pooled stats — which is
      more practical in JS without pulling in a stats library?
- [ ] Lasso over confluence features with walk-forward λ selection: does it
      pick the same features the hand-tuned weights favor?
- [ ] Read: Harvey, Liu & Zhu (2016) "…and the Cross-Section of Expected
      Returns"; Cochrane's *Asset Pricing* ch. on GMM/Fama-MacBeth; López de
      Prado on backtest overfitting (deflated Sharpe) — natural next course.
- [ ] How would a *deflated Sharpe ratio* (accounting for number of trials)
      change the verdicts on our existing OOS cards?

---

*Study notes for future reference — educational material, not financial
advice, and (house rule) not evidence of edge.*
