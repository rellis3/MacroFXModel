# Regression Analysis Course — Reference & Trading Model Integration

> Source: [cog000.github.io](https://cog000.github.io/Why-Regression-Matters/) — 8-Lesson Series  
> Compiled for: Trading Analytics Suite (tradingtools-aay.pages.dev)

---

## Course Philosophy

The difference between retail traders and quantitative professionals comes down to **validation**. Retail sees correlation and assumes edge. Professionals build models, stress-test assumptions, and understand exactly where their analysis can fail.

Regression is the foundational tool because it answers one question: **what actually drives returns?** Every factor model, risk attribution system, and alpha measurement framework is built on regression foundations.

---

## Lesson 1 — Why Regression Matters

### Core Concept: Decomposition

Total variation in returns splits into two parts:

```
Total Variation = Explained (systematic factors) + Unexplained (residual)
```

R² measures the explained proportion. **The residual is where alpha hides** — and also where model failures show.

### The CAPM Template

```
Rᵢ - Rᶠ = α + β(Rₘ - Rᶠ) + ε
```

| Term | Meaning |
|------|---------|
| α (alpha) | Return unexplained by market — potential skill |
| β (beta) | Sensitivity to market movements |
| ε | Idiosyncratic return — noise |

All multi-factor models follow this same structure — more factors, same logic.

### Multi-Factor Progression

| Model | Added Factors | What It Captured |
|-------|--------------|-----------------|
| CAPM (1960s) | Market only | Baseline |
| Fama-French 3F (1993) | + Size, + Value | Small/value premium |
| Carhart 4F (1997) | + Momentum | Trend persistence |
| FF 5F (2015) | + Profitability, + Investment | Quality premium |

### Critical Warning: Correlation ≠ Causation

Predictors with a **causal story** are more robust than purely data-mined ones. Ask: *why would this predict returns?* If there is no answer, the relationship will not persist out-of-sample.

### Trading Model Application

- Every signal you test is an attempt to explain residual variation
- If your "edge" disappears after adding market beta, you were not generating alpha — just taking on more risk
- The decomposition framework applies directly to volatility regime analysis: what proportion of volatility variation is explained by macro factors vs. idiosyncratic noise?

---

## Lesson 2 — Simple Linear Regression (OLS Mechanics)

### The OLS Objective

Minimise the **sum of squared residuals**: Σ(Yᵢ - Ŷᵢ)²

This produces a unique, optimal solution — but is sensitive to outliers because squaring penalises large errors heavily.

### Equation Components

```
Y = α + βX + ε
```

- **α (Intercept):** Expected Y when X = 0. Treat with caution — may be meaningless if X=0 is outside your data range
- **β (Slope):** Change in Y for one-unit change in X. Sign, magnitude, and units all matter
- **ε (Error):** What the model does not explain

### β as Scaled Correlation

```
β = ρ × (σY / σX)
```

High beta can come from:
- High correlation with the factor (ρ near 1), OR
- High volatility relative to the factor (σY >> σX), OR
- Both

This matters for forex and futures — a pair can have high beta to DXY not because it tracks DXY closely, but because it is inherently more volatile.

### Residuals: The Two Outputs

Every regression produces per-observation:
- **Fitted value (Ŷᵢ):** The systematic, factor-explained component
- **Residual (εᵢ):** The idiosyncratic component — where alpha (or model failure) lives

**Good residuals:** Random scatter around zero, no trends, constant spread, no relationship with X.  
**Bad residuals:** Patterns over time, funnel shapes, curves — all indicate the model is missing something.

### OLS Assumption Violations (Hierarchy of Concern)

| Violation | Consequence | Fix |
|-----------|------------|-----|
| Heteroskedasticity | SEs wrong (coefficients still unbiased) | White/HC3 robust SEs |
| Autocorrelation | SEs wrong, usually underestimated | Newey-West (HAC) SEs |
| Exogeneity failure | Coefficients themselves are biased | Model rethink required |

> **Default rule for financial time series: always use Newey-West standard errors.** The cost is slightly wider confidence intervals; the benefit is valid inference.

### Trading Model Application

- When regressing a pair's returns against a macro driver (DXY, yield spreads, risk sentiment), β tells you the marginal sensitivity
- Your EMA volatility calibration uses MAE as its error metric — this is the production equivalent of minimising residuals
- Exogeneity is the biggest concern: if your factor is itself driven by price (e.g., realised vol), reverse causality may bias the estimate

---

## Lesson 3 — Measuring Model Fit (R² and Adjusted R²)

### R² Formula

```
R² = 1 - (SSres / SStot)    where SSres = Σ(Yᵢ - Ŷᵢ)²  and  SStot = Σ(Yᵢ - Ȳ)²
```

### What R² Does and Does NOT Tell You

| R² tells you | R² does NOT tell you |
|-------------|---------------------|
| Proportion of variance explained | Whether the model is correctly specified |
| Relative explanatory power | Whether coefficients are significant |
| — | Whether the model will predict well out-of-sample |

### Benchmarks by Application

| Application | Typical R² | Note |
|-------------|-----------|------|
| Cross-sectional return prediction | 0.03–0.10 | Signal-to-noise is inherently low |
| Time-series market model (CAPM) | 0.30–0.70 | Market affects all assets |
| Multi-factor models | 0.50–0.90 | Explains past, not necessarily future |
| Suspiciously high | > 0.95 | Likely overfitting or data error |

### Adjusted R²

```
R̄² = 1 - [(1-R²)(n-1)/(n-k-1)]
```

Penalises for each added variable. **If adjusted R² falls when you add a variable, that variable is not helping — it is adding noise.**

### Model Selection Metrics

| Metric | Formula | Use For |
|--------|---------|---------|
| Adjusted R² | See above | Comparing models with different variable counts |
| RMSE | √[Σ(Yᵢ - Ŷᵢ)²/n] | Practical prediction accuracy (same units as Y) |
| MAE | Σ\|Yᵢ - Ŷᵢ\|/n | Less sensitive to outliers than RMSE |
| AIC | 2k - 2ln(L) | Model selection, non-nested models |
| BIC | k·ln(n) - 2ln(L) | Model selection, conservative (prefers simpler) |

### Trading Model Application

- **Do not maximise R².** A model with R²=0.95 that is overfit will fail live; a model with R²=0.08 capturing a genuine stable relationship is far more valuable
- When auto-calibrating EMA alpha values using MAE, you are already using the correct metric — you are penalising complexity by choosing the alpha that minimises held-out error, not in-sample fit
- AIC/BIC are useful when choosing between regime detection methods with different parameter counts

---

## Lesson 4 — Statistical Inference (T-stats, P-values, Confidence Intervals)

### The T-Statistic

```
t = β / SE(β)
```

Signal-to-noise ratio: how many standard errors your estimate is from zero.

| |t| value | Interpretation |
|---------|-------------|
| < 2 | Not significant at 5% |
| 2–3 | Significant but suspect (especially after multiple tests) |
| > 3 | Robust significance — Harvey-Liu-Zhu threshold |

### P-Value: What It Actually Means

**Correct:** P(data this extreme | β=0) — probability of seeing this result IF there is truly no relationship.  
**Wrong:** P(β=0) — this is NOT the probability that your factor is real.

A p-value of 0.03 means: *"If there were truly no relationship, we would see a result this large only 3% of the time by chance."*

### Confidence Intervals

```
95% CI:  β ± 1.96 × SE(β)
```

More informative than p-values because they show both significance (does the CI include zero?) and precision (how wide is it?).

### The Multiple Testing Problem

At 5% significance:
- Test 100 variables → expect **5 false positives**
- Test 1,000 variables → expect **50 false positives**

**Solutions:**

| Approach | Method | Trade-off |
|----------|--------|-----------|
| Strict threshold | Use \|t\| > 3 (Harvey-Liu-Zhu) | Simple, practical |
| Bonferroni | Divide α by number of tests | Very conservative |
| False Discovery Rate (FDR) | Control proportion of false discoveries | Less conservative than Bonferroni |
| Out-of-sample validation | Test on held-out data | Ultimate test, always required |

### Statistical vs Economic Significance

A coefficient can be:
- **Statistically significant but economically trivial:** t=10, effect = 0.001% per month — not worth trading
- **Economically meaningful but statistically uncertain:** needs more data, not a reason to ignore it

Always report effect sizes, not just p-values.

### Robust Standard Error Types

| SE Type | Robust To | When to Use |
|---------|----------|-------------|
| Classical (OLS) | Nothing — assumes ideal conditions | Rarely in finance |
| White (HC3) | Heteroskedasticity | Cross-sectional data |
| Newey-West (HAC) | Heteroskedasticity AND autocorrelation | **Default for time series** |

### Trading Model Application

- Every parameter you optimise (lookback window, band width, regime threshold) is a hypothesis test — the more you tune, the higher your required t-stat
- The Harvey-Liu-Zhu threshold of \|t\| > 3 is the right bar for any signal you intend to trade live
- The multiple testing problem is why walk-forward validation matters more than any single backtest statistic

---

## Lesson 5 — Multiple Regression & Factor Models

### The Critical Interpretation Shift

In multiple regression, each coefficient is a **partial effect** — the impact of that variable holding all others constant.

```
Rᵢ - Rᶠ = α + β₁(Mkt-RF) + β₂(SMB) + β₃(HML) + β₄(UMD) + ε
```

| Coefficient | Interpretation |
|-------------|---------------|
| β₁ (Market) | Market sensitivity *after* controlling for size, value, momentum |
| β₂ (SMB) | Size exposure *after* controlling for market, value, momentum |
| α (Alpha) | Return unexplained by ALL included factors — a higher bar |

### Multicollinearity

Occurs when predictors are correlated. Does not bias predictions, but makes it impossible to isolate individual factor contributions. Standard errors inflate.

**Detection: Variance Inflation Factor (VIF)**

```
VIF = 1        No problem
VIF = 5        Moderate concern
VIF = 10       Serious
VIF > 10       Severe — factor attribution is unreliable
```

### The F-Test

Tests whether **all** coefficients are jointly zero — whether the model as a whole has explanatory power.

> **Multicollinearity paradox:** You can have a significant F-test (model matters overall) with NO individually significant coefficients. Factors are jointly important but inseparable.

### Factor Model Build Process

1. **Start with theory** — what factors should logically predict this? Economic rationale is a prerequisite
2. **Get clean data** — no look-ahead bias, proper handling of missing values and delistings
3. **Run regression** — OLS with Newey-West SEs; check VIF; examine residuals
4. **Validate extensively** — out-of-sample across multiple time periods and instruments

### Common Factor Model Pitfalls

| Pitfall | Description |
|---------|-------------|
| Overfitting | Adding factors until R² is high; these fail out-of-sample |
| Look-ahead bias | Using data not available at signal generation time |
| Factor timing | Implicitly selecting factors based on their recent performance |
| Survivorship bias | Only including assets that survived; overestimates returns |

### Trading Model Application

- If adding multiple volatility drivers (ATR, realised vol, volume, GARCH), check VIF before trusting individual coefficients
- The partial effect interpretation means your beta to DXY in a model that already includes rate differentials is the *net* sensitivity after accounting for rate effects — a cleaner measure
- Survivorship bias applies to your instrument universe: if you only backtest pairs that are still actively traded, you overestimate historical performance

---

## Lesson 6 — Regression Diagnostics & Pitfalls

### The Three Main Violations in Finance

**1. Heteroskedasticity** — non-constant variance (volatility clustering)
- Coefficients remain unbiased
- Standard errors are wrong → t-stats and p-values invalid
- **Fix:** White/HC3 robust standard errors
- **Detect:** Plot residuals vs fitted values; Breusch-Pagan test

**2. Autocorrelation** — errors correlated over time
- Coefficients remain unbiased
- Standard errors underestimated → t-stats inflated → you think you have more precision than you do
- **Fix:** Newey-West standard errors
- **Detect:** Durbin-Watson statistic (≈2 = no autocorrelation); ACF plot of residuals; Ljung-Box test

**3. Non-Stationarity** — relationships change over time
- Coefficients themselves may be wrong in different periods
- **Fix:** Rolling windows; estimate separately by regime
- **Detect:** Chow test (known break), CUSUM test (unknown break), plot rolling coefficients

### Diagnostic Plot Checklist (run for every regression)

| Plot | What to Look For |
|------|-----------------|
| Residuals vs Fitted | Random scatter around zero — no patterns, no curves |
| Residuals vs Time | No trends, no cycles, no clusters |
| Scale-Location | Constant spread — no funnel shape |
| Q-Q Plot | Residuals near the line — fat tails are common in finance |

### Outliers and Influential Observations

**Cook's Distance:** measures each observation's leverage on the result. Threshold: `4/n`. Values above this flag influential points.

| Outlier Type | Action |
|-------------|--------|
| Data error (e.g., 500% return from bad feed) | Fix or remove |
| Genuine extreme event (e.g., COVID crash, March 2020) | Keep; report sensitivity |
| Systematic pattern in outliers | Reconsider model — missing variable |

### Rolling Regressions for Stability

```python
window = 60  # 60-period rolling window
rolling_betas = []
for i in range(window, len(y)):
    model = sm.OLS(y[i-window:i], X[i-window:i]).fit()
    rolling_betas.append(model.params[1])
# Plot — jumps = instability / regime change
```

**If rolling betas jump around, non-stationarity is an issue.** Stable coefficients across time are evidence of a real, persistent relationship.

### Trading Model Application

- Your volatility regime detection framework *is* non-stationarity management — you are already solving for the biggest violation
- Rolling the regression coefficients gives you a real-time signal of regime change *before* price confirms it
- The Cook's Distance framework translates directly: extreme candles (flash crashes, news spikes) should be treated as influential observations and sensitivity-tested, not just left in the calibration window

---

## Lesson 7 — From Regression to Production Models

### The Core Gap

```
In-sample R² = 0.9  and  Out-of-sample R² = 0.1  →  the model is worthless
```

**Validation is everything.** A model that fits historical data is worthless if it fails on new data.

### Validation Methods

**1. Train-Test Split (Chronological)**
- Train on earliest 70%, test on most recent 30%
- Never touch the test set during development
- Limitation: single split may be unrepresentative

**2. Walk-Forward Analysis (Gold Standard)**
```
Train on periods 1–T → Predict period T+1 → Roll forward → Repeat
```
Exactly mimics real-world trading. The only honest assessment of predictive power.

**3. Rolling vs Expanding Windows**

| Window Type | Advantage | Use When |
|------------|-----------|----------|
| Rolling (fixed lookback) | Adapts to regime changes | Relationships shift over time |
| Expanding (all history) | More precise estimates | Relationships are stable |

> Test both. If results differ dramatically, non-stationarity is a concern.

### Overfitting Defences

| Defence | Implementation |
|---------|---------------|
| Fewer parameters | Prefer 3-factor models over 20-factor models |
| Complexity penalty | Use Adjusted R², AIC, or BIC for model selection |
| Genuine holdout | One truly held-out test set — check it only once, at the end |
| Theory first | Only include factors with economic rationale |

### Robustness Testing Framework

A genuinely robust finding should hold across:
- **Multiple time periods** — bull and bear markets, pre- and post-crisis
- **Different instruments** — if it works in EURUSD, does it work in GBPUSD, USDJPY?
- **Different specifications** — small changes to variable definition, lag length, outlier treatment
- **Stable parameters** — rolling coefficients should not jump dramatically

### Research to Implementation: The Reality Check

| Research Finding | Implementation Reality | Net Result |
|-----------------|----------------------|-----------|
| Factor earns 10%/yr | Transaction costs: 3%/yr | 7% net |
| Signal available daily | Data published with 2-day lag | Signal already stale |
| Works in backtest | Factor published/known in market | Returns weakened post-publication |
| Profitable at $1M | Market impact at $100M | Does not scale |

### Trading Model Application

- Your EMA volatility calibration system is already a rolling walk-forward model — this lesson provides the formal validation framework around it
- The robustness test across multiple instruments is the next step: does the auto-calibrated alpha generalise across EURUSD, GBPUSD, and NQ, or is it instrument-specific?
- Implementation lag matters for your FRED-based macro tier scoring: confirm the exact publication delay for each series and ensure your scoring only uses data that was available on the signal date

---

## Lesson 8 — Advanced Extensions

### The Regression Family Tree

```
OLS (Foundation)
├── Panel Regression  (cross-section + time-series)
├── Fama-MacBeth      (asset pricing factor tests)
└── Regularisation    (many predictors: Ridge, Lasso, Elastic Net)
```

### Panel Regression

For datasets with both cross-sectional (multiple instruments) and time-series (multiple periods) structure.

**Key components:**
- **Entity fixed effects:** Control for unobserved instrument characteristics (e.g., liquidity profile, persistent spread tendencies)
- **Time fixed effects:** Control for common shocks affecting all instruments in a given period
- **Clustered SEs:** Required — standard SEs are too small without clustering

### Fama-MacBeth Regression

The standard approach for testing whether a characteristic predicts returns across instruments.

**Two-stage procedure:**
1. **Stage 1 (Cross-sectional):** For each period, regress that period's returns on last period's characteristics → get a periodic coefficient estimate
2. **Stage 2 (Time-series):** Average the periodic coefficients; standard error comes from their time-series variation

**Use case:** Does yesterday's implied volatility predict today's return across all pairs? Run Fama-MacBeth. The per-period cross-sectional regressions naturally handle within-period correlation.

### Regularisation

Addresses the problem of many potential predictors — OLS overfits badly in high dimensions.

| Method | Penalty | Effect | Use When |
|--------|---------|--------|---------|
| Ridge | L2 (sum of squared coefficients) | Shrinks all toward zero | Many correlated predictors |
| Lasso | L1 (sum of absolute coefficients) | Drives some exactly to zero | Want automatic variable selection |
| Elastic Net | L1 + L2 combined | Both shrinkage and selection | Best of both worlds |

The penalty parameter λ controls bias-variance trade-off — choose by cross-validation.

### When to Move Beyond Regression

Move to ML (tree models, neural nets) only when:
- Relationships are demonstrably nonlinear and regression has clearly failed
- You have 100+ candidate predictors (regularisation first; then ML)
- You have enough data to support additional model complexity

**Warning:** ML makes overfitting *easier*, not harder. Start simple. Add complexity only when simple models clearly fail. The burden of proof is on complexity.

### The Institutional Workflow

```
1. Research     → Hypothesis → Data → Regression → Diagnostics
2. Validation   → Out-of-sample → Robustness → Sensitivity
3. Implementation → Costs → Lags → Capacity
4. Monitoring   → Live vs backtest → Decay → Iteration
```

### Trading Model Application

- **Fama-MacBeth** is the right tool if you want to formally test whether, say, realised volatility or OI gamma exposure predicts next-day ranges *across all instruments simultaneously*
- **Lasso** is useful if you are testing many potential confluence inputs — it will automatically discard the ones that do not contribute to the signal
- **Panel regression** is appropriate when combining EURUSD, GBPUSD, NQ and ES data into a single regime model, controlling for instrument-specific effects

---

## Master Checklist — Applying Regression to a Trading Signal

Use this before trusting any quantitative result.

### Step 1: Model Specification
- [ ] Is there a clear economic/theoretical rationale for this factor?
- [ ] Are units and measurement consistent?
- [ ] Is there any look-ahead bias (using data not available at signal time)?
- [ ] Have survivorship biases been addressed?

### Step 2: Estimation
- [ ] Using Newey-West standard errors (default for time series)?
- [ ] VIF checked if multiple predictors (VIF < 10)?
- [ ] Residuals plotted (vs fitted, vs time, Q-Q)?
- [ ] Outliers identified and investigated (Cook's Distance)?

### Step 3: Inference
- [ ] Is \|t\| > 3 (Harvey-Liu-Zhu threshold for factor discovery)?
- [ ] Is the effect economically meaningful, not just statistically significant?
- [ ] Confidence intervals reported alongside p-values?
- [ ] How many specifications were tested before this one? (Multiple testing adjustment required)

### Step 4: Validation
- [ ] Out-of-sample tested (walk-forward, not just train-test)?
- [ ] Robust across multiple time periods?
- [ ] Robust across multiple instruments?
- [ ] Robust to small changes in specification?
- [ ] Rolling betas stable over time?

### Step 5: Implementation
- [ ] Transaction costs estimated and deducted?
- [ ] Data publication lag verified for each input series?
- [ ] Performance monitored live vs backtest expectation?
- [ ] Decay being tracked (signals degrade over time as edges are arbitraged)?

---

## Key Formulas Quick Reference

| Formula | Name | Use |
|---------|------|-----|
| Y = α + βX + ε | Simple regression | Single factor model |
| β = Cov(X,Y) / Var(X) | OLS slope | Coefficient calculation |
| β = ρ × (σY/σX) | Beta decomposition | Understand correlation vs volatility contribution |
| t = β / SE(β) | T-statistic | Signal-to-noise ratio |
| R² = 1 - SSres/SStot | R-squared | Proportion of variance explained |
| R̄² = 1 - [(1-R²)(n-1)/(n-k-1)] | Adjusted R² | Penalised fit for model comparison |
| CI = β ± 1.96·SE(β) | 95% Confidence interval | Range of plausible values |
| VIF > 10 | Multicollinearity threshold | When factor attribution breaks down |
| \|t\| > 3 | Harvey-Liu-Zhu threshold | Minimum bar for factor significance in finance |
| Cook's D > 4/n | Influential observation flag | Outlier investigation threshold |

---

## Integration Points with Existing Suite

| Suite Component | Regression Concept | Action |
|----------------|-------------------|--------|
| EMA Volatility Calibration | Walk-forward validation, MAE optimisation | Already implemented — formalise with t-stat reporting |
| Macro Tier Scoring (FRED) | Multi-factor partial effects | Check VIF between FRED series; use Newey-West on tier regressions |
| Regime Detection | Non-stationarity, rolling regressions | Plot rolling betas to confirm regime switches |
| OI Gamma Exposure | Factor model residuals | OI levels are a candidate factor; test \|t\| > 3 before adding to confluence score |
| Fib Confluence Scoring | Multiple testing problem | Every confluence source added is a test; apply FDR or require \|t\| > 3 |
| Cross-Instrument Analysis | Panel regression, Fama-MacBeth | For testing whether a signal generalises across all instruments simultaneously |

---

*Reference compiled from the C.OG Regression Analysis Course (8 lessons). Educational content — not financial advice.*
