# Regression Analysis Course — Study Notes (Lessons 1–8)

> **Source:** Colez Trades, "Regression Analysis" course, Lessons 01–08
> (Why Regression Matters → Advanced Extensions & What's Next).
> **Purpose of this file:** raw lecture notes, university-student style —
> what the lesson taught, the key facts and formulas to memorise, exam-prep
> questions, and threads to investigate in future study and implementation.
> Re-read before writing or reviewing any regression work.

---

## 0. One-paragraph summary of the whole course

Regression decomposes variation in returns into an **explained** part (factor
exposures, the β's) and an **unexplained** part (the residual ε, where alpha —
and noise — live). OLS finds the line minimizing squared residuals; the slope
is `β = Cov(X,Y)/Var(X) = ρ·(σY/σX)` — correlation scaled by relative
volatility. R² measures fit but not correctness or predictive power; adjusted
R² penalizes complexity. Inference (t-stats, p-values, CIs) is only valid if
the standard errors are right, and in finance the classical assumptions
almost never hold — volatility clusters (heteroskedasticity) and errors
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

### The fundamental question

- **"What drives returns?"** When a stock returns 15%, how much came from the
  market rising, the sector, company-specific factors — and how much, if any,
  is genuine skill (alpha)? Regression is the systematic framework for that
  decomposition. Without it we're guessing; with it we can separate signal
  from noise, skill from luck, systematic from idiosyncratic.
- Three headline applications:
  - **Factor discovery** — which variables predict future returns; separating
    real predictors from spurious correlations.
  - **Risk attribution** — decomposing portfolio volatility into market risk,
    factor exposures, and idiosyncratic components.
  - **Alpha measurement** — the regression intercept (α) measures return
    unexplained by known risk factors.

### How top quant firms use regression

| Firm | Application |
|---|---|
| AQR | Factor model construction — funds systematically harvest factor premia (value, momentum, quality) identified via regression; "cheap" / "momentum" = regression-derived factor scores |
| Two Sigma | Signal discovery — thousands of candidate predictors regressed against future returns to test statistical significance and economic meaning |
| Dimensional (DFA) | Risk attribution — "returns came 60% from market exposure, 25% small-cap tilt, 15% value tilt" |
| Every allocator | Performance attribution — "alpha or just more market risk?" answered by the CAPM regression; positive intercept after controlling for beta suggests skill |

Common thread: every application separates **systematic from idiosyncratic,
explained from unexplained, factor exposure from alpha**.

### The core idea: decomposing variation

- Total variation in returns = explained by model (`β₁X₁ + β₂X₂ + … + βₖXₖ`)
  + unexplained residual (ε — where alpha might hide).
- `R² = explained variation / total variation`. R² = 0.70 → model explains
  70% of return variation; 30% remains in the residual.
- The explained portion = the risk factors you're compensated for holding
  (essential for risk management / portfolio construction). The unexplained
  portion = idiosyncratic risk **and** potential alpha. An active manager's
  goal is positive average residuals.
- **Key fact:** most apparent "alpha" disappears when properly adjusted for
  factor exposures. A manager beating the market by 3% might just have
  β = 1.2 — more risk, not skill.

### Correlation vs causation

Three reasons correlation ≠ causation:

| Problem | Description | Finance example |
|---|---|---|
| Omitted variable bias | A third variable drives both X and Y | Analyst coverage correlates with returns — but firm quality drives both |
| Reverse causality | Y causes X, not the other way round | High returns attract analyst coverage? |
| Coincidental correlation | Enough variables → some correlate by chance | The "Super Bowl indicator" |

- Pragmatic stance in quant finance: prediction often matters more than
  causation — a variable that reliably predicts OOS is useful even if the
  mechanism is unclear. But causal understanding tells you whether the
  relationship will *persist* and when it might break.
- **Predictors with causal stories are more robust.** Value (book/price) has
  a mechanism (distress risk or extrapolation bias) → more likely to persist.
  "Ticker starts with A" has none → won't persist. Both can look significant
  in-sample; only one works out-of-sample.

### CAPM — regression's most famous application

```
Rᵢ − Rᶠ = α + β(Rₘ − Rᶠ) + ε
```

| Component | Name | Meaning |
|---|---|---|
| Rᵢ − Rᶠ | Excess return | Asset return minus risk-free rate (the Y) |
| α | Alpha (intercept) | Return unexplained by market — "skill" |
| β | Beta (slope) | Sensitivity to market movements |
| ε | Residual | Idiosyncratic return — noise |

Interpretation grid:

| Reading | Meaning |
|---|---|
| β > 1 | More volatile than market — aggressive, amplifies market moves |
| β < 1 | Less volatile than market — defensive, dampens moves |
| α > 0 | Outperformance after risk adjustment (potential skill) |
| α < 0 | Underperformance after risk adjustment |

Why CAPM revolutionized finance: before it, no systematic way to separate
skill from risk-taking. A 5% outperformance could be genuine skill (α > 0) or
just high β in an up market. The CAPM regression separates the two — this one
equation created the field of performance attribution.

```python
import statsmodels.api as sm
y = asset_returns - risk_free_rate
X = sm.add_constant(market_returns - risk_free_rate)  # adds intercept (alpha)
model = sm.OLS(y, X).fit()
alpha, beta = model.params[0], model.params[1]
```

### From CAPM to multi-factor models

Each advance came from **running regressions and finding systematic patterns
in the residuals**:

1. **CAPM (1960s)** — market factor only. But small and value stocks showed
   persistent positive alphas.
2. **Fama-French 3-factor (1993)** — adds **SMB** (Small Minus Big) and
   **HML** (High Minus Low book-to-market). Much of the small/value "alpha"
   turned out to be compensation for these factors.
3. **Carhart 4-factor (1997)** — adds **UMD** (Up Minus Down) momentum, after
   momentum was observed in the residuals. Became the performance-evaluation
   standard.
4. **Fama-French 5-factor (2015)** — adds **RMW** (Robust Minus Weak
   profitability) and **CMA** (Conservative Minus Aggressive investment).
5. **Your custom model** — same framework always: regress returns on
   candidate factors, examine residuals for patterns, add factors that
   explain systematic variation.

General form: `Rᵢ − Rᶠ = α + β₁F₁ + β₂F₂ + … + βₖFₖ + ε`. Alpha = return
unexplained by **all** included factors. **Key insight:** what looks like
alpha under a simple model often becomes explainable factor exposure under a
richer one — a value-tilted manager shows positive CAPM alpha but zero
Fama-French alpha.

### The factor zoo

- Hundreds of factors now documented. Problems this creates:
  - **Multiple testing** — test enough factors and some appear significant by
    chance; many published factors fail to replicate OOS.
  - **Robustness testing** — serious quants test factors across periods,
    markets, and specifications; only robust factors survive.

### Course roadmap (for orientation)

| Lessons | Focus |
|---|---|
| 2–3 | OLS mechanics, coefficients, R², adjusted R², model fit |
| 4 | Inference: t-stats, p-values, confidence intervals |
| 5–6 | Multiple regression, multicollinearity, diagnostics |
| 7–8 | Out-of-sample validation, robustness, regimes, implementation |

### Key takeaways (lesson's own)

1. Regression is the foundational tool of quant finance — factor models, risk
   attribution, alpha measurement all depend on it.
2. Core idea = decomposition: explained (systematic) vs unexplained
   (residual/alpha).
3. CAPM is the template; all multi-factor models follow its logic.
4. Correlation ≠ causation — but causal mechanisms make predictors more
   robust OOS.
5. Apparent alpha often becomes factor exposure under a richer model.
6. The course follows the field's own historical progression.

### Exam-prep questions

- Q: A fund beats its benchmark by 3%/yr with β = 1.3. Alpha? → A: Not
  necessarily — regress excess returns; the 3% may be explained by the higher
  β (more risk, not skill).
- Q: Why did SMB/HML "kill" small-cap and value alphas? → A: Those alphas
  were loadings on omitted factors; adding the factors moved the return from
  α into β·F.
- Q: Name the three reasons correlation ≠ causation. → A: Omitted variable
  bias, reverse causality, coincidental correlation.

### To investigate later

- Read the original Fama-French (1993) and Carhart (1997) papers.
- How exactly are SMB/HML/UMD portfolios constructed (sorting rules)?
- Which of the "factor zoo" factors have survived replication studies?

---

## 2. Lesson 02 — Simple Linear Regression Foundations

### OLS: what "best fit" means

- Infinitely many lines could pass through a scatter; OLS finds the unique
  line minimizing the **sum of squared residuals** (vertical distances,
  squared, summed): `min Σ(Yᵢ − Ŷᵢ)²`.
- Why *squared* errors:
  1. **Penalizes large errors more** — a residual of 10 contributes 100.
     Makes OLS outlier-sensitive.
  2. **Tractable math** — smooth, differentiable → closed-form solutions.
  3. **Unique solution** — the objective is convex, single global minimum.
  4. **Optimal under normality** — OLS = maximum likelihood if errors are
     normal.
- ⚠️ Outlier sensitivity is a double-edged sword: OLS distorts the line to
  accommodate outliers/errors. **Always visualize the data before trusting
  regression output.**

### The regression equation

```
Y = α + βX + ε
```

| Component | Name | Interpretation |
|---|---|---|
| Y | Dependent variable | What you're explaining/predicting |
| α | Intercept | Expected Y when X = 0 |
| β | Slope | Change in Y per one-unit change in X |
| ε | Error term | What the model doesn't explain |

CAPM-style example — `Asset Return = α + β × Market Return + ε`: α = return
unexplained by market (potential "skill"), β = move per 1% market move,
ε = idiosyncratic component.

- **Intercept caution:** α is E[Y | X=0]. If X = 0 is outside the data range,
  the intercept may be meaningless (returns regressed on market cap at
  market cap = 0 makes no sense).

### Interpreting the slope

- β = the **marginal effect** — change in Y per unit X, holding all else
  constant. **Sign** (direction), **magnitude** (strength — compare to
  standard errors), and **units** (β is Y-units per X-unit) all matter.
- Worked example: `Return (%) = 0.1 + 0.5 × Earnings Surprise (%)`:
  a 1% surprise associates with +0.5% return; α = 0.1% baseline drift.
- Is β = 0.5 large? Statistically: compare to its SE. Economically: does
  0.5% per 1% surprise matter after costs? A coefficient can be
  statistically significant but economically trivial, or vice versa.
- **The units trap** — same relationship, different numbers:

  | Surprise measured as | β |
  |---|---|
  | Percentage (5%) | 0.5 |
  | Decimal (0.05) | 50 |
  | Basis points (500) | 0.005 |

### Fitted values and residuals

- Every observation decomposes: **actual = fitted + residual**
  (`Yᵢ = Ŷᵢ + εᵢ`).
- **Fitted values (Ŷ):** what the model predicts — the systematic/explained
  component. Use for risk attribution.
- **Residuals (ε):** what the model gets wrong — the idiosyncratic part. Use
  for alpha hunting, diagnostics, outlier detection.
- Systematically positive residuals = outperformance after factor adjustment
  = alpha — **if it persists out-of-sample**.
- Residuals as diagnostics: good residuals look like random noise (no time
  trends, no relationship with X, constant spread). Patterns / funnels /
  curvature = the model is missing something.

```python
model = sm.OLS(asset_returns, sm.add_constant(factor_returns)).fit()
fitted = model.fittedvalues   # explained by factors
resid  = model.resid          # unexplained (alpha?)
# actual == fitted + residual
```

### The four OLS assumptions (ranked by severity)

1. **Linearity** — relationship is linear. Usually manageable; transform
   variables (logs, polynomials) if needed.
2. **Homoskedasticity** — constant error variance. *Almost always violated in
   finance* (volatility clusters; GARCH effects). Consequence: coefficients
   unbiased but **SEs wrong** → t-stats/p-values unreliable.
   Fix: White/Huber-White robust SEs.
3. **No autocorrelation** — errors independent over time. Often violated in
   time series (yesterday's residual predicts today's). Consequence: SEs
   typically **underestimated** → results look more significant than they
   are. Fix: **Newey-West** SEs (handles heteroskedasticity AND
   autocorrelation).
4. **Exogeneity** — X uncorrelated with ε. **The big one.** Violated by
   omitted variables, reverse causality, measurement error. Consequence:
   **β itself is biased** — systematically wrong, and no amount of data fixes
   it. Fix requires model rethinking: specification, instrumental variables,
   panel methods.

**Hierarchy:** het/autocorrelation = annoying but fixable (coefficients still
right, use robust SEs). Exogeneity violations = the coefficients themselves
are wrong. *Worry more about exogeneity.*

**Practical default:** for financial time series, always use Newey-West SEs
(cost: slightly wider CIs; benefit: valid inference).

```python
model = sm.OLS(y, X).fit(cov_type='HAC', cov_kwds={'maxlags': 4})
```

### The OLS formulas

```
β = Cov(X,Y) / Var(X)
α = Ȳ − βX̄            (line always passes through the centroid (X̄, Ȳ))
β = ρ_XY · (σY / σX)   (beta = correlation × ratio of standard deviations)
```

What the decomposition reveals:

- If σY > σX → |β| > |ρ| (high-vol asset has beta above its correlation).
- If σX > σY → |β| < |ρ|.
- If σY = σX → β = ρ (the standardized-variables special case).
- **Key fact:** high beta can come from high correlation OR high relative
  volatility. A crypto asset can have β = 2 vs equities from being twice as
  volatile, not from being highly correlated.

### Practical interpretation tips

- **Always check units** — "0.5" alone is uninterpretable.
- **Standardized coefficients:** z-score X and Y first (`Z = (X − X̄)/σX`);
  then β = SD-change in Y per SD-change in X → comparable across variables
  with different units (e.g. βearnings = 0.3 vs βcoverage = 0.1 →
  earnings surprises have 3× the standardized effect).
- **Economic vs statistical significance** — the 2×2:

  | Effect size | SE | Statistically sig? | Economically sig? | Action |
  |---|---|---|---|---|
  | Large | tight | Yes | Yes | Strong finding — investigate |
  | Small | tight | Yes | No | Precisely measured nothing |
  | Large | wide | No | Maybe | Promising but uncertain — more data |
  | Small | wide | No | No | Nothing here — move on |

- ⚠️ With enough data, *everything* becomes "significant" — millions of
  observations make a 0.001% effect have a tiny p-value. Always report
  magnitudes, not just p-values.
- **Causation language discipline:** "X is associated with Y" is defensible;
  "X causes Y" requires much more.

### Key takeaways (lesson's own)

1. OLS minimizes the sum of squared residuals; squaring penalizes large
   errors heavily.
2. β = Cov(X,Y)/Var(X); sign, magnitude, units all matter.
3. Every observation = fitted + residual; residuals are where alpha hides
   (and where model failures show).
4. Het/autocorrelation affect inference (robust SEs); exogeneity violations
   bias coefficients (model rethinking).
5. β = ρ·(σY/σX) — high beta from correlation OR relative volatility.
6. Statistical significance ≠ economic significance.

### Exam-prep questions

- Q: β = 0.5 with surprise in %; switch regressor to decimals. New β? →
  A: 50 — same relationship, units changed.
- Q: Two assets each have ρ = 0.6 with the market; A has 2× market vol,
  B 0.5×. Betas? → A: A: 1.2, B: 0.3.
- Q: Which violation biases β itself, not just the SEs? → A: Exogeneity
  failure.
- Q: Why does the OLS line always pass through (X̄, Ȳ)? → A: Because
  α = Ȳ − βX̄ by construction.

### To investigate later

- Derivation of the OLS closed-form solution via calculus (set derivatives of
  the objective to zero).
- Robust regression alternatives for outlier-heavy data (LAD, M-estimators —
  previewed in Lesson 6).
- When is a log or polynomial transform the right linearity fix for financial
  variables?

---

## 3. Lesson 03 — Measuring Model Fit: R² and Adjusted R²

### R²: proportion of variance explained

```
R² = 1 − (SSres / SStot) = SSexp / SStot

SStot = Σ(Yᵢ − Ȳ)²    total variation in Y around its mean
SSexp = Σ(Ŷᵢ − Ȳ)²    variation captured by the model
SSres = Σ(Yᵢ − Ŷᵢ)²   variation NOT captured
```

- Bounded [0, 1]. R² = 0.70 → model explains 70%; the remaining 30% is in
  the residuals (random noise, or systematic factors not yet included).
- **High R² ≠ good model; low R² ≠ bad model. Context matters enormously.**

### R² measures scatter, not slope

- Two datasets with the **same β** can have R² = 0.92 (tight cluster) vs
  R² = 0.35 (wide scatter). Same relationship, different noise.
- In finance, low R² is common and expected — returns have enormous
  idiosyncratic variation. A well-specified CAPM regression might only reach
  R² 0.30–0.50. A significant, economically meaningful coefficient can
  coexist with low R².

### What R² does and doesn't tell you

- ✓ Does: proportion of Y variance explained.
- ✗ Doesn't: whether the model is correctly specified (can be high with the
  wrong functional form).
- ✗ Doesn't: whether coefficients are significant (unrelated to t-stats).
- ✗ Doesn't: whether the model predicts OOS (can be high from overfitting).

Three dangerous scenarios:

1. **High R², wrong model** — a curve snaked through the points fits great
   in-sample, garbage for prediction.
2. **High R², biased coefficients** — omitted variable bias attributes
   variation to the wrong variables.
3. **Low R², useful model** — β = 0.5 with t = 4 is valuable even at
   R² = 0.05; there's just lots of other variation too.

⚠️ **Maximizing R² is not the goal.** An overfit R² = 0.95 model fails in
production; an R² = 0.10 model capturing a genuine stable relationship is far
more valuable.

### Adjusted R²

- Flaw in plain R²: it **never decreases** when you add variables — even pure
  noise → perverse incentive to add variables → overfitting.

```
R̄² = 1 − [(1 − R²)(n − 1) / (n − k − 1)]     k = number of predictors
```

- Adding a variable raises k; adjusted R² **falls** unless the variable adds
  enough explanatory power to compensate.
- Worked example:

  | Model | Variables | R² | Adj R² | Verdict |
  |---|---|---|---|---|
  | A | Market | 0.45 | 0.44 | baseline |
  | B | Market + Size | 0.52 | 0.51 | size helps |
  | C | Market + Size + Random | 0.53 | 0.50 | random hurts |

- **Rule:** if adjusted R² drops when you add a variable, it's probably
  noise. Use adjusted R² when comparing models with different variable
  counts.

### What's a "good" R² in finance? (memorise the benchmarks)

| Application | Typical R² | Why |
|---|---|---|
| Cross-sectional return prediction | 0.03–0.10 | Most variation is idiosyncratic; signal-to-noise inherently low |
| Time-series market model (CAPM) | 0.30–0.70 | Market affects all assets; blue chips higher, small caps lower |
| Multi-factor models | 0.50–0.90 | Multiple systematic sources — but explaining past, not predicting future |
| Suspiciously high | > 0.95 | Trigger skepticism — overfitting or data issues (e.g. variables not knowable in real time) |

### The overfitting trap

- Classic signature: complex model in-sample R² = 0.99 → out-of-sample
  R² = 0.25; simple model 0.65 → 0.60. The complex model memorized noise; the
  simple one captured the genuine relationship.
- Signs of overfitting:
  1. Large in-sample vs out-of-sample performance gap.
  2. Too many variables (near as many variables as observations → can fit
     anything, predict nothing).
  3. Suspiciously perfect results — the more spectacular the backtest, the
     more likely it's overfit.
- The quant graveyard is full of incredible backtests that failed live —
  hence mandatory OOS testing (Lesson 7).

### Beyond R²: other fit metrics

| Metric | Formula | Notes |
|---|---|---|
| RMSE | √[Σ(Yᵢ−Ŷᵢ)²/n] | Average error in original units — interpretable practical accuracy |
| MAE | Σ\|Yᵢ−Ŷᵢ\|/n | Outlier-robust (no squaring) — use when occasional large errors aren't catastrophic |
| AIC | 2k − 2ln(L) | Fit vs complexity; lower better; works for non-nested models |
| BIC | k·ln(n) − 2ln(L) | Stronger complexity penalty than AIC; penalty grows with n; prefers simpler models |

Choosing:

| Goal | Metric |
|---|---|
| Explanatory power | R², adjusted R² |
| Practical prediction accuracy | RMSE, MAE |
| Compare models w/ different variable counts | Adjusted R², AIC, BIC |
| Select among many candidates | AIC, BIC |

### Key takeaways (lesson's own)

1. R² = proportion of variance explained — useful but narrow.
2. Adjusted R² penalizes added variables — use for model comparison.
3. Expected R² varies dramatically by application — context defines "good".
4. High in-sample R² can indicate overfitting — OOS validation essential.
5. Different metrics answer different questions.
6. Model fit ≠ predictive power — explanation vs prediction is *the* crucial
   distinction.

### Exam-prep questions

- Q: Adding a noise column moves R² 0.52→0.53 and adj-R² 0.51→0.50. Keep it?
  → A: No — the complexity penalty exceeded the fit gain.
- Q: Is R² = 0.05 good or bad? → A: Depends — excellent for cross-sectional
  return prediction, terrible for a large-cap CAPM time-series fit.
- Q: When prefer BIC over AIC? → A: Large samples / when you want the
  stronger parsimony bias.
- Q: Write the three sums of squares and their relationship. → A:
  SStot = SSexp + SSres; R² = SSexp/SStot.

### To investigate later

- Likelihood function L in AIC/BIC — how it's computed for OLS.
- How exactly does adjusted R² relate to an F-test on the added variable?
- What R² do published FX (rather than equity) return models typically
  report, cross-sectional vs time-series?

---

## 4. Lesson 04 — Statistical Inference & Significance

### The t-statistic: signal-to-noise ratio

```
t = β / SE(β)
```

- Numerator = the signal (how far the estimate is from zero); denominator =
  the noise (how uncertain it is). t counts standard errors from zero.
- Same β = 0.5: SE = 0.1 → t = 5 (strong); SE = 0.4 → t = 1.25 (could be
  noise). A *small* coefficient with a *small* SE can be highly significant;
  a *large* coefficient with a *large* SE may not be.

### Standard errors: what drives them

Three factors:

1. **Sample size n** — more data → smaller SE (doubling n roughly shrinks SE
   by √2).
2. **Residual variance σ²** — noisier model → larger SE.
3. **Variance of X** — more spread in the predictor → smaller SE (better
   identification).

### Robust standard errors (the ladder)

Classical SE formulas assume homoskedasticity and independence — in financial
data these virtually never hold (volatility clusters; residuals correlate).

| SE type | Robust to | When |
|---|---|---|
| Classical (OLS) | nothing | rarely in finance — only if assumptions verified |
| White (HC/HC3) | heteroskedasticity | cross-sectional data |
| **Newey-West (HAC)** | het **and** autocorrelation | **default for financial time series** |

```python
sm.OLS(y, X).fit()                                        # classical
sm.OLS(y, X).fit(cov_type='HC3')                          # White
sm.OLS(y, X).fit(cov_type='HAC', cov_kwds={'maxlags': 4}) # Newey-West
```

(4 lags is a common choice for monthly data. Robust t-stats are often
*lower* than classical ones.)

### Interpreting t-statistics

- Rule-of-thumb scale: |t| < 2 not significant at 5%; 2 < |t| < 3 significant
  but suspect; **|t| > 3 robust**.
- **Harvey-Liu-Zhu (2016):** because researchers have tested thousands of
  factors, use **|t| > 3** as the significance threshold for factor
  discovery. A t of 2.5 might be fine in a single pre-registered test but is
  suspect in mined factor research. Most published factors with t between 2
  and 3 fail to replicate OOS.

### P-values: what they really mean

- ✓ Correct: p = probability of observing data **this extreme or more**,
  **assuming the null (β = 0) is true**. p = 0.03 → "if there were truly no
  relationship, I'd see a result this extreme 3% of the time by chance."
- ✗ Wrong: p is NOT the probability that the null is true. "3% chance β = 0"
  would require Bayesian analysis with priors.
- p measures **P(Data | Null)**, not **P(Null | Data)** — evidence against
  the null, not proof it's false.
- Decision rule: p < 0.01 strong rejection; p < 0.05 conventional
  significance; p > 0.05 fail to reject.
- **"Fail to reject" ≠ "accept the null."** p = 0.15 doesn't mean β = 0 — the
  effect might be real but the sample too small/noisy to detect.

### Confidence intervals: more informative than p-values

```
95% CI:  β ± 1.96 × SE(β)
```

- Shows **both** significance (does the CI exclude zero?) and precision
  (how wide?).
- β = 0.5 [0.1, 0.9]: significant but wide — confident it's positive,
  uncertain how big. β = 0.5 [0.45, 0.55]: significant AND precise.
- **Best practice: always report CIs, not just p-values.**

### The multiple testing problem (the central challenge)

- At α = 5%, testing true nulls falsely rejects 5% of the time:
  100 random variables → ~5 false positives; 1,000 → ~50. Publish only the
  significant ones → the literature fills with noise.
- Solutions:
  1. **Bonferroni** — divide α by number of tests (100 tests → α = 0.0005).
     Very conservative; may miss real effects.
  2. **False Discovery Rate (FDR)** — control expected share of false
     positives among claimed discoveries.
  3. **Higher t threshold** — the Harvey-Liu-Zhu |t| > 3 rule.
  4. **Out-of-sample validation** — the ultimate test; catches overfitting
     that survives all statistical corrections.
- Every extra specification tried, parameter tweaked, or sample period
  swapped inflates false-positive risk.

### Practical significance checklist (finance)

| Check | Question | Red flag |
|---|---|---|
| Robust SEs | Newey-West or similar used? | Classical only — t-stats likely inflated |
| t magnitude | Is \|t\| > 3? | t between 2–3 with many tried specs |
| Economic size | Big enough to trade after costs? | Significant but tiny |
| Out-of-sample | Tested on held-out data? | In-sample only |
| Multiple testing | How many things were tried? | Cherry-picked from many specs |

### Key takeaways (lesson's own)

1. t = β/SE(β) — a signal-to-noise ratio.
2. p = P(data | null), not P(null | data).
3. CIs > p-values: significance and precision at a glance.
4. Multiple testing inflates false positives — |t| > 3 for factor discovery,
   or formal corrections (FDR).
5. Robust (Newey-West) SEs are the finance default.
6. Statistical ≠ economic significance — check magnitudes.

### Exam-prep questions

- Q: 200 signals tested, 12 with p < 0.05. Impressed? → A: No — ~10 false
  positives expected at α = 5%; demand |t| > 3 and OOS replication.
- Q: Why are classical t-stats usually inflated in financial time series?
  → A: Positive autocorrelation → classical SEs underestimate uncertainty.
- Q: CI = [−0.1, 0.7], p = 0.14. What does the CI add? → A: The effect could
  plausibly be zero *or* economically large — underpowered test, not a
  demonstrated null.
- Q: State the Bonferroni correction for 50 tests at α = 5%. →
  A: Per-test α = 0.05/50 = 0.001.

### To investigate later

- Read Harvey, Liu & Zhu (2016), "…and the Cross-Section of Expected
  Returns" — the source of the t > 3 rule.
- Benjamini-Hochberg FDR procedure mechanics.
- How is the Newey-West lag count chosen in practice (plug-in rules such as
  `4(n/100)^(2/9)`)?
- Bayesian alternative: what would P(Null | Data) actually require?

---

## 5. Lesson 05 — Multiple Regression & Factor Models

### From simple to multiple regression

```
Simple:    Y = α + β₁X₁ + ε                       (e.g. CAPM)
Multiple:  Y = α + β₁X₁ + β₂X₂ + … + βₖXₖ + ε     (e.g. Fama-French)
```

- **The key interpretation change:** each coefficient is a **partial
  effect** — "the effect of X₁ on Y, *holding all other X variables
  constant*."
- Why it matters:
  - **Isolate factor effects** — market beta in a multi-factor model is
    sensitivity *after* controlling for size and value; cleaner than CAPM β.
  - **Control confounders** — if size and value are correlated, simple
    regression on either is biased; multiple regression separates them.
  - **More meaningful alpha** — Fama-French α is return unexplained by
    market AND size AND value: a higher bar than CAPM α.

### Fama-French (+ momentum) in action

```
Rᵢ − Rᶠ = α + β₁(Mkt−RF) + β₂(SMB) + β₃(HML) + β₄(UMD) + ε
```

| Factor | Name | Construction idea |
|---|---|---|
| Mkt−RF | Market | Excess market return |
| SMB | Size | Small Minus Big |
| HML | Value | High Minus Low book-to-market |
| UMD | Momentum | Up Minus Down |

Coefficient reading:

| Coefficient | Interpretation | Example |
|---|---|---|
| β₁ | Market sensitivity net of other factors | 1.2 → 1.2% per 1% market move |
| β₂ | Size exposure (+ = tilts small) | 0.5 → behaves like small caps |
| β₃ | Value exposure (+ = tilts value) | −0.3 → behaves like growth |
| α | Return unexplained by ALL factors | 0.2% → genuine outperformance |

### Multicollinearity: when factors fight

- Definition: predictor variables highly correlated with each other.
- Effect: **doesn't bias predictions**, but **destroys interpretation of
  individual coefficients** — estimates become imprecise, effects can't be
  separated, SEs explode.
- Detection: **Variance Inflation Factor (VIF)** —
  VIF = 1 no problem · 5 moderate · 10 serious · **> 10 severe**.

```python
from statsmodels.stats.outliers_influence import variance_inflation_factor
vif = [variance_inflation_factor(X.values, i) for i in range(X.shape[1])]
```

### The F-test: overall model significance

- H₀: β₁ = β₂ = … = βₖ = 0 (all slopes jointly zero). Rejecting = "at least
  some factors matter" — it does NOT say which (that's the individual
  t-stats).
- **The multicollinearity paradox:** a significant F-test with NO
  individually significant coefficients — factors jointly matter but their
  effects can't be separated.

### Building your own factor model (the process)

1. **Start with theory** — what *should* logically predict returns? Factors
   with economic stories are more likely to persist.
2. **Get clean factor data** — Ken French's library, AQR, or construct your
   own; no look-ahead bias, handle delistings properly.
3. **Run the regression** — OLS with Newey-West SEs; check VIF; examine
   residuals.
4. **Validate extensively** — OOS is mandatory; different periods, different
   markets. Works in only one sample = overfitting.

### Reading regression output (worked example)

| Variable | Coef | Std Err | t | p |
|---|---|---|---|---|
| const (α) | 0.0015 | 0.0012 | 1.25 | 0.212 |
| Mkt−RF | 1.15 | 0.08 | 14.38 | 0.000 |
| SMB | 0.42 | 0.12 | 3.50 | 0.001 |
| HML | 0.15 | 0.08 | 1.88 | 0.062 |

- HML here is the instructive row: β = 0.15, t = 1.88, p = 0.062 —
  **marginally significant; suggestive but not conclusive. Don't
  over-interpret borderline results.**
- Focus: coefficients for economic interpretation, t-stats for significance.

### Common factor-model pitfalls

| Pitfall | Description |
|---|---|
| Overfitting factors | Adding factors until R² is high → fails OOS; each factor adds noise-fitting capacity |
| Look-ahead bias | Using information not available at the time (year-end book values can't predict January returns) |
| Factor timing | Implicitly timing factors via variable selection — e.g. selecting on recent performance |
| Survivorship bias | Only surviving assets included → overstated returns (delisted assets often did poorly first) |

### Key takeaways (lesson's own)

1. Multiple-regression coefficients are PARTIAL effects.
2. Multicollinearity inflates SEs and obscures contributions — check VIF.
3. The F-test assesses joint significance.
4. Robust models need theory, clean data, extensive OOS validation.
5. Multi-factor alpha is more meaningful than CAPM alpha.
6. Watch overfitting, look-ahead, survivorship.

### Exam-prep questions

- Q: A fund has CAPM α = 2% but FF3 α = 0 with β_HML = 0.6. Verdict? → A: The
  "alpha" was value exposure, not skill.
- Q: F-test p < 0.001, but every individual t < 1.5. Diagnosis? →
  A: Multicollinearity — check VIF.
- Q: Why does survivorship bias inflate backtests? → A: Assets that died
  (usually after losses) are missing, so the sample outperformed the true
  investable set.
- Q: Define VIF thresholds. → A: ≈1 fine, 5 moderate, >10 serious/severe.

### To investigate later

- How SMB/HML/UMD portfolio sorts are actually built (2×3 sorts, breakpoints,
  rebalancing).
- What does an FX-market factor set look like (dollar factor, carry,
  momentum, value/PPP) and where does honest data for it come from?
- VIF vs condition number as multicollinearity diagnostics.
- What to do when two theoretically distinct factors are empirically
  near-collinear (orthogonalization? drop one? combine?).

---

## 6. Lesson 06 — Regression Diagnostics & Pitfalls

### The three main violations in finance

| Violation | What it is | Finance manifestation | Fix |
|---|---|---|---|
| Heteroskedasticity | Non-constant error variance | Volatility clustering — large errors follow large errors | Robust SEs (White) |
| Autocorrelation | Errors correlated over time | Today's residual predicts tomorrow's (momentum / mean reversion not captured) | Newey-West SEs |
| Non-stationarity | Parameters change over time | Relationships from 2010 may not hold in 2024 | Rolling windows |

**In financial data these violations are the rule, not the exception.**

### Heteroskedasticity in detail

- Looks like: residuals larger in some periods; "funnel"/"megaphone" shape in
  residuals-vs-fitted plot.
- Consequence: coefficients unbiased, **SEs wrong** → invalid t/p.
- Detection: visual inspection (always — fast, catches the obvious);
  **Breusch-Pagan** test; **White** test (more general, handles nonlinear
  forms).
- Fix: robust SEs — `cov_type='HC3'`. Corrects SEs without changing
  coefficients.

```python
from statsmodels.stats.diagnostic import het_breuschpagan
bp_stat, bp_pval, _, _ = het_breuschpagan(model.resid, X)  # p<0.05 → het
```

### Autocorrelation in detail

- Looks like: positive residual today → likely positive tomorrow; trends or
  cycles in the residuals-over-time plot.
- Consequence: coefficients unbiased, SEs **typically underestimated** →
  inflated t-stats, false precision.
- Detection:

  | Method | Interpretation |
  |---|---|
  | Durbin-Watson | ≈2 none; <2 positive autocorrelation; >2 negative |
  | ACF plot of residuals | spikes outside confidence bands = AC at that lag |
  | Ljung-Box | joint test over multiple lags; p < 0.05 = significant AC |

- Fix: **Newey-West** (handles het AND autocorrelation; specify lags).
  Newey-West should be the default for time-series regressions.

### The four residual diagnostic plots (always plot!)

1. **Residuals vs fitted** — want random scatter around zero; curves/funnels
   = misspecification or heteroskedasticity.
2. **Residuals vs time** — want independence; trends/cycles/clusters =
   autocorrelation or structural breaks.
3. **Scale-location** (√|resid| vs fitted) — want constant spread; funnel =
   heteroskedasticity.
4. **Q-Q plot** — want normality; tail deviations = fat tails (common in
   finance; can affect small-sample inference).

Statistical tests can miss patterns that are visually obvious — plot first.

### Non-stationarity & structural breaks

- Betas aren't constant: market sensitivity changes with leverage, industry
  dynamics, company evolution. Regime changes (2008, COVID) can invalidate
  pre-break estimates.
- Detection:

  | Method | Use case |
  |---|---|
  | Rolling regressions | visual stability check — plot coefficients over time; jumps = instability |
  | Chow test | known break date (e.g. 2008) — p < 0.05 = coefficients differ before/after |
  | CUSUM test | unknown break date — cumulative residual drift |

- Remedies: rolling windows, per-regime estimation, time-varying parameters.
- **Stable coefficients → more likely to work forward. Wildly varying
  coefficients → the relationship isn't stable.**

```python
# 60-month rolling beta
for i in range(window, len(y)):
    m = sm.OLS(y[i-window:i], X[i-window:i]).fit()
    rolling_betas.append(m.params[1])
```

### Outliers and influential observations

- OLS is **not robust** — a few extreme points (one bad tick, one crisis
  month) can dominate the estimate.
- Detection: **Cook's Distance** (flag > 1, or > **4/n** rule of thumb);
  **DFBETAS** for per-coefficient impact.
- Triage framework:

  | Outlier type | Action | Example |
  |---|---|---|
  | Data error | fix or remove | 500% typo instead of 5% |
  | Genuine extreme event | keep, report sensitivity | March 2020 COVID crash |
  | Misspecification signal | reconsider the model | systematic pattern in outliers = missing variable |

- Alternatives: robust regression (LAD, M-estimators), winsorization, or keep
  outliers but report with/without.

```python
from statsmodels.stats.outliers_influence import OLSInfluence
cooks_d = OLSInfluence(model).cooks_distance[0]
influential = np.where(cooks_d > 4/len(y))[0]
```

### The diagnostic checklist (habit)

1. **Plot residuals** — first, every regression.
2. **Test heteroskedasticity** (White/Breusch-Pagan) → robust SEs if present.
3. **Test autocorrelation** (Durbin-Watson/ACF) → Newey-West if present.
4. **Check influential points** (Cook's D) → investigate; report sensitivity.

Document it: "SEs are Newey-West with 4 lags. Residual plots show no obvious
patterns. Results robust to excluding influential observations."

### Key takeaways (lesson's own)

1. Het and autocorrelation are ubiquitous — robust SEs by default.
2. Newey-West handles both — the time-series default.
3. Always plot residuals — visuals catch what tests miss.
4. Outliers can dominate OLS — investigate and report sensitivity.
5. Relationships change — rolling windows for stability checks.
6. **Diagnostics aren't optional** — a regression without them is a black box
   possibly producing garbage.

### Exam-prep questions

- Q: Durbin-Watson = 0.9 — meaning and fix? → A: Strong positive
  autocorrelation; Newey-West SEs.
- Q: Rolling 60-month beta swings 0.4 → 1.6 → 0.7. Implication? → A:
  Non-stationary relationship — distrust the full-sample β; use rolling /
  regime-aware estimation.
- Q: Cook's D flags March 2020. Delete it? → A: No — genuine extreme; keep
  and report sensitivity (unless it's a data error).
- Q: Which plot detects heteroskedasticity, and what shape? → A:
  Residuals-vs-fitted (or scale-location); funnel/megaphone.

### To investigate later

- GARCH models — the formal treatment of volatility clustering mentioned
  here.
- Chow and CUSUM test mechanics; how to pick candidate break dates.
- LAD / M-estimator robust regression: when to prefer them over OLS +
  Cook's D sensitivity.
- Winsorization conventions in the empirical finance literature (1%/99%?).

---

## 7. Lesson 07 — From Regression to Production Models

### The gap: in-sample vs out-of-sample

| In-sample | Out-of-sample |
|---|---|
| Model fitted to this data | Model tested on NEW data |
| Always looks good | The real test |
| Can always be improved | Cannot be gamed |
| May reflect noise | Reveals true predictive power |
| "How well do I explain the past?" | "Will this work going forward?" |

- **In-sample R² of 0.9 means nothing if OOS R² is 0.1.** A model can
  memorize every quirk of the training data and fail spectacularly on new
  data. Validation is everything.

### Train-test split

- Split ~70/30. For financial data the split must be **chronological** —
  train on earlier periods, test on later (you can only predict the future).
- **Cardinal rule: never touch the test set during development.** Repeatedly
  checking test performance and adjusting = implicitly fitting the test set.
- Limitation: a single split can be (un)lucky → cross-validation.

### Cross-validation

- **K-fold:** split into K parts, train on K−1, test on 1, rotate, average.
  Uses all data for both roles.
- ⚠️ **Standard K-fold breaks time ordering** — training can "peek" at the
  future. Inappropriate for financial data.
- **Walk-forward analysis — the gold standard for finance:** train on data up
  to t, predict t+1, roll forward, repeat. Exactly mimics live trading.

```python
def walk_forward_cv(y, X, train_size, test_size):
    for i in range(train_size, len(y) - test_size + 1, test_size):
        model = sm.OLS(y[:i], X[:i]).fit()      # train on past only
        pred = model.predict(X[i:i+test_size])  # predict next period
        ...
```

### Rolling vs expanding windows

| Approach | Advantage | Disadvantage | Best when |
|---|---|---|---|
| Rolling (fixed lookback) | Adapts to regime change | Less data, noisier | Relationships change over time |
| Expanding (all history) | More precise estimates | Old data may mislead | Relationships stable |

- **Test both.** Similar results → relationships likely stable. Dramatic
  divergence → non-stationarity concern → rolling probably more appropriate.

### Avoiding overfitting (the toolkit)

1. **Fewer parameters** — a 5-factor model has less room to fit noise than a
   50-factor one.
2. **Penalize complexity** — adjusted R², AIC, BIC guard against "just one
   more factor."
3. **Genuine holdout** — a truly untouched test set, checked once, at the
   very end.
4. **Theory first** — only factors with economic rationale; data-mined
   factors fail OOS. "Small caps are riskier and less liquid" is a story;
   "tickers starting with A outperform" is noise.

### Robustness testing

A robust finding holds across many reasonable variations:

- **Different time periods** — 2000–2010 AND 2010–2020; bull AND bear.
- **Different markets** — US and international (value, momentum have been
  validated globally).
- **Different specifications** — variable definitions, lag choices, outlier
  treatment. Fragile results = probably overfitting.
- **Parameter stability** — coefficients stable across subsamples = a real,
  persistent relationship.

### From research to implementation (the reality check)

| Research finding | Implementation reality | Result |
|---|---|---|
| Factor earns 10% annually | Transaction costs 3%/yr | Net 7% |
| Signal available daily | Data published with 2-day lag | Signal stale (look-ahead if ignored) |
| Works in backtest | Factor published 2015 | Post-publication decay |
| Profitable at $1M | Market impact at $100M | Doesn't scale |

Four killers:

1. **Transaction costs** — paper returns ignore friction; 50%/yr with 300%
   turnover can be net-negative.
2. **Implementation lag** — publication delays, database updates; using data
   before its availability date = look-ahead bias.
3. **Capacity constraints** — small-cap factors especially.
4. **Decay after publication** — arbitrage pressure erodes known factors; the
   best edges stay proprietary.

**The research-to-production gap is where most quant strategies die;
disciplined validation is the bridge.**

### Key takeaways (lesson's own)

1. OOS testing is essential — in-sample fit means nothing alone.
2. Walk-forward analysis mimics real trading.
3. Overfitting is the primary enemy — simple, theory-driven, validated.
4. Implementation (costs, lags, capacity) separates paper from live returns.
5. Robustness across time/markets/specs distinguishes real effects from data
   mining.
6. Skipping validation is gambling, not investing.

### Exam-prep questions

- Q: Why is standard K-fold CV invalid for return prediction? → A: Folds mix
  future and past — temporal leakage. Use walk-forward.
- Q: You checked the test set 15 times while tuning. Status of the "OOS"
  result? → A: Contaminated — effectively in-sample now.
- Q: Rolling and expanding windows give sharply different results. Read? →
  A: Non-stationarity; old data misleads; favor rolling / regime-aware.
- Q: Name the four implementation killers. → A: Costs, lags, capacity,
  post-publication decay.

### To investigate later

- Purged / embargoed cross-validation variants for overlapping financial
  labels.
- How is turnover-adjusted (net-of-cost) factor performance computed in
  practice?
- Published estimates of post-publication factor decay (how much, how fast?).
- Practical designs for a "touch once" holdout in an iterative research
  workflow.

---

## 8. Lesson 08 — Advanced Extensions & What's Next

### The regression family tree

OLS is the trunk; specialized branches handle specific problems:

- **Panel regression** — data with cross-section AND time dimensions.
- **Fama-MacBeth** — the standard for asset-pricing factor tests.
- **Regularization (Ridge/Lasso)** — many predictors.

### Panel regression

- Data varies across entities (assets) and time (months). Plain OLS ignores
  the structure → biased results.
- **Entity fixed effects** — absorb unobserved, time-invariant asset
  characteristics (persistently higher returns for unobservable reasons).
- **Time fixed effects** — absorb common per-period shocks (market-wide
  events hitting all assets).
- **Clustered SEs** — must cluster by entity and/or time; otherwise SEs are
  too small and t-stats inflated.

```python
from linearmodels.panel import PanelOLS
data = data.set_index(['asset_id', 'date'])
model = PanelOLS(data['return'], data[['factor1', 'factor2']],
                 entity_effects=True, time_effects=True)
results = model.fit(cov_type='clustered',
                    cluster_entity=True, cluster_time=True)
```

### Fama-MacBeth regression

The workhorse of empirical asset pricing — two stages:

1. **Cross-sectional stage:** for each month, regress that month's returns on
   the prior month's characteristics → a monthly premium estimate γₜ.
2. **Time-series stage:** average the γₜ over time; the SE comes from the
   time-series variation of γₜ; t-test whether the mean premium ≠ 0.

- **Why it works:** running separate cross-sections each month naturally
  handles cross-sectional correlation — returns within a month are
  correlated (market moves hit all assets), but each month is treated as one
  independent observation of the premium.
- This is how academic factor research is done: "does value predict returns?"
  → Fama-MacBeth on book-to-market; "does momentum work?" → Fama-MacBeth on
  past returns.

```python
# Stage 1: monthly cross-sectional regressions → monthly coefficients
# Stage 2: mean(coef), t = mean / (std / sqrt(T))
```

### Regularization: Ridge & Lasso

Problem: with many predictors, plain OLS overfits — noisy coefficients, poor
OOS. Solution: penalize coefficient size — minimize
(prediction error + λ × coefficient penalty); choose λ by cross-validation.

| Method | Penalty | Effect | Use when |
|---|---|---|---|
| Ridge | L2 (Σβ²) | Shrinks toward zero, doesn't eliminate | Many correlated predictors |
| Lasso | L1 (Σ\|β\|) | Drives some β exactly to zero — variable selection | Sparse signals; want selection |
| Elastic Net | L1 + L2 | Both shrinkage and selection | Best of both |

```python
from sklearn.linear_model import RidgeCV, LassoCV
ridge = RidgeCV(alphas=[0.1, 1, 10, 100]).fit(X_train, y_train)
lasso = LassoCV(cv=5).fit(X_train, y_train)  # zeroed coefs = deselected
```

### When to move beyond regression (ML)

- Justified by: genuinely nonlinear relationships (trees, boosting, neural
  nets), high-dimensional data (100+ predictors), complex interactions hard
  to specify manually.
- ⚠️ But: **ML makes overfitting easier, not harder** — a neural net can
  memorize any dataset perfectly and fail completely OOS; interpretability
  drops. More flexibility demands more validation discipline.
- **Practical rule: start with simple regression; add complexity only when
  simple models clearly fail. The burden of proof is on complexity.**

### The institutional workflow

1. **Research** — hypothesis → data → regressions → diagnostics. Start from
   economic intuition, not data mining. Document everything.
2. **Validation** — OOS testing, robustness checks, sensitivity analysis.
   *This is where most strategies die.* Be your own harshest critic.
3. **Implementation** — costs, data lags, capacity. Paper profits often
   disappear here.
4. **Live monitoring** — track live vs backtest, watch for decay, iterate.
   Continues forever.

### Resources for continued learning

- **Theory:** Cochrane, *Asset Pricing* (the standard); Campbell, Lo &
  MacKinlay (empirical methods); Angrist & Pischke (causal inference).
- **Data:** Ken French's Data Library (free factor returns); WRDS; Bloomberg
  / Refinitiv.
- **Tools:** Python `statsmodels`, `linearmodels`; R `plm`, `sandwich`,
  `lmtest`.
- **Current research:** SSRN working papers; Journal of Finance; Journal of
  Financial Economics.

### Key takeaways (lesson's own)

1. Panel regression and Fama-MacBeth handle cross-section × time-series
   structure — learn when to use each.
2. Regularization improves prediction with many predictors — essential in
   high dimensions.
3. ML = flexibility + overfitting risk — start simple, escalate carefully.
4. The professional pipeline: research → validation → implementation →
   monitoring.
5. The course's closing point: the most important lesson isn't a technique —
   it's the mindset: rigorous hypothesis testing, extensive validation,
   healthy skepticism of apparently great results.

### Exam-prep questions

- Q: Why not pool all asset-months in one big OLS to test a characteristic?
  → A: Cross-sectional correlation within periods violates independence →
  understated SEs. Use Fama-MacBeth or panel + clustered SEs.
- Q: Ridge vs Lasso for 50 correlated candidate signals when you want a short
  interpretable list? → A: Lasso (or elastic net) — L1 zeroes out weak ones.
- Q: Where does the Fama-MacBeth standard error come from? → A: The
  time-series variation of the monthly cross-sectional coefficients γₜ.
- Q: Four pipeline stages; where do strategies die? → A: Research →
  **validation** → implementation → monitoring.

### To investigate later

- Fixed effects vs random effects — when is each appropriate (Hausman test)?
- Fama-MacBeth with lagged characteristics: exactly which lag conventions
  does the literature use?
- How does λ selection interact with walk-forward validation (Lesson 7's
  time-ordering rule applies to CV inside regularization too)?
- Shanken correction for errors-in-variables in two-pass regressions.
- Gradient boosting for tabular financial data — where has it genuinely
  beaten linear models in published work?

---

## 9. Master formula sheet (exam crib)

```
OLS objective:        min Σ(Yᵢ − Ŷᵢ)²
Slope:                β = Cov(X,Y)/Var(X) = ρ_XY · (σY/σX)
Intercept:            α = Ȳ − βX̄            (line passes through centroid)
Decomposition:        Yᵢ = Ŷᵢ + εᵢ           (actual = fitted + residual)
R²:                   1 − SSres/SStot = SSexp/SStot
Adjusted R²:          1 − (1−R²)(n−1)/(n−k−1)
t-stat:               β / SE(β)              (|t|>2 classic, |t|>3 factors)
95% CI:               β ± 1.96·SE(β)
AIC / BIC:            2k − 2ln(L)  /  k·ln(n) − 2ln(L)
RMSE / MAE:           √(Σε²/n)  /  Σ|ε|/n
Standardized var:     Z = (X − X̄)/σX         (→ β in SD units)
CAPM:                 Rᵢ−Rᶠ = α + β(Rₘ−Rᶠ) + ε
FF3 + momentum:       Rᵢ−Rᶠ = α + β₁(Mkt−RF) + β₂SMB + β₃HML + β₄UMD + ε
Bonferroni:           per-test α = α / N_tests
VIF rule:             1 fine · 5 moderate · >10 serious
Durbin-Watson:        ≈2 none · <2 positive AC · >2 negative AC
Cook's D flag:        > 1, or > 4/n rule of thumb
```

**Default settings for any financial regression (per the course):**
Newey-West (HAC) SEs · chronological splits only · walk-forward CV ·
|t| > 3 for anything mined from many specs · report CIs and magnitudes,
not just p-values · plot the four residual plots · document diagnostics.

---

## 10. Consolidated "investigate later" list

Threads to pull in future study sessions (collected from the per-lesson
lists):

**Reading list**

- [ ] Fama & French (1993); Carhart (1997); Fama & French (2015).
- [ ] Harvey, Liu & Zhu (2016) — the source of the |t| > 3 rule.
- [ ] Cochrane, *Asset Pricing*; Campbell/Lo/MacKinlay; Angrist & Pischke.
- [ ] Replication studies of the factor zoo — which factors survived?
- [ ] Published estimates of post-publication factor decay.

**Methods to learn properly**

- [ ] Derive the OLS closed-form solution; likelihood behind AIC/BIC.
- [ ] Benjamini-Hochberg FDR procedure.
- [ ] Newey-West lag selection rules (e.g. `4(n/100)^(2/9)` plug-in).
- [ ] GARCH — the formal model of volatility clustering.
- [ ] Chow / CUSUM structural-break tests; Hausman test (FE vs RE).
- [ ] Shanken correction for two-pass regressions.
- [ ] Purged/embargoed cross-validation for overlapping labels.
- [ ] Robust regression (LAD, M-estimators) and winsorization conventions.

**Application questions**

- [ ] How are SMB/HML/UMD portfolios actually constructed (sorts,
      breakpoints, rebalancing)?
- [ ] What is the standard FX factor set (dollar, carry, momentum, value/PPP)
      and what data does honest construction require?
- [ ] Typical R² levels for FX return models, cross-sectional vs time-series?
- [ ] Fama-MacBeth lag conventions for characteristics.
- [ ] How does regularization's λ selection compose with walk-forward CV?
- [ ] Practical design of a "touch once" holdout in an iterative workflow.
- [ ] Where has ML (boosting) genuinely beaten linear models on tabular
      financial data in published work?

**Implementation candidates (to scope properly later — flagged only, not
assessed here)**

- [ ] A reusable regression utility (OLS + Newey-West SEs + VIF +
      Durbin-Watson + Cook's D + rolling regression) for this codebase.
- [ ] Residual-diagnostic plots for existing model outputs.
- [ ] Rolling-beta stability views for cross-pair relationships.
- [ ] Fama-MacBeth-style panel testing over the multi-pair daily data.
- [ ] Clustered/date-aware error bars for pooled cross-pair statistics.

---

*Raw study notes for future learning — educational material only, not
financial advice.*
