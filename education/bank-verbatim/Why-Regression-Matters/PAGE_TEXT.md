<!-- https://cog000.github.io/Why-Regression-Matters/ | Regression Analysis — Lesson 1: Why Regression Matters -->
Colez Trades
Quantitative & Macro Insights
C.OG
Regression Analysis / Lesson 1
C.OG
Lesson 01
# Why Regression Matters

Regression analysis is the workhorse of quantitative finance. Every factor model, risk attribution system, and alpha measurement framework is built on regression foundations.

Duration 25 minutes
Difficulty Foundation
Prerequisites Basic Statistics
Section 01
## The Fundamental Question in Quantitative Finance

If you understand one statistical technique deeply, make it regression. Every sophisticated quantitative strategy — from AQR's factor models to Two Sigma's signal discovery — is built on this foundation. Everything else builds from here.

### "What Drives Returns?"

This is the fundamental question regression answers. When a stock returns 15% in a year, we want to know: how much came from the overall market rising? How much from the stock being in a hot sector? How much from company-specific factors? And critically — how much, if any, represents genuine skill or alpha?

Regression provides a systematic framework for decomposing returns into their constituent parts. Without it, we're guessing. With it, we can separate signal from noise, skill from luck, and systematic factors from idiosyncratic returns.

🔍
#### Factor Discovery

Which variables predict future returns? Regression tests hypotheses systematically, separating real predictors from spurious correlations.

📊
#### Risk Attribution

Where does portfolio risk come from? Regression decomposes volatility into market risk, factor exposures, and idiosyncratic components.

⭐
#### Alpha Measurement

Is performance skill or factor exposure? The intercept in a regression (alpha) measures returns unexplained by known risk factors.

Section 02
## How Top Quant Firms Use Regression

Regression isn't just one tool among many — it's the foundation of modern quantitative finance. Understanding how the world's most sophisticated investors use it reveals why mastering regression is non-negotiable.

🔬
#### AQR Capital Management

**Application: Factor Model Construction** — AQR's entire business model is built on factor regression. Their funds systematically harvest factor premia (value, momentum, quality) identified through decades of regression analysis. When they say a stock is "cheap" or has "momentum," they mean it scores well on regression-derived factor scores.

📈
#### Two Sigma

**Application: Signal Discovery** — Two Sigma tests thousands of potential predictors to identify those with genuine forecasting power. A potential alpha signal — say, insider buying patterns — gets regressed against future returns to determine if the relationship is statistically significant and economically meaningful.

⚖️
#### Dimensional Fund Advisors

**Application: Risk Attribution** — DFA uses regression to understand exactly where portfolio returns come from. They can tell clients: "Your returns came 60% from market exposure, 25% from small-cap tilt, and 15% from value tilt" — precise attribution only possible through regression.

✓
#### Every Fund's Compliance

**Application: Performance Attribution** — Pension funds, endowments, and allocators use regression to evaluate managers. The question "Did this manager generate alpha, or just take on more market risk?" is answered by the CAPM regression. A positive intercept after controlling for beta suggests genuine skill.

💡
**The common thread:** Every application uses regression to separate systematic from idiosyncratic, explained from unexplained, factor exposure from alpha. This decomposition is the core insight that makes quantitative finance possible.

Section 03
## The Core Idea: Decomposing Variation

The fundamental insight of regression is decomposition. Total variation in returns can be split into two parts: variation explained by your model (systematic factors) and variation that remains unexplained (the residual). This simple idea is profound.

Total Variation in Returns
Why do returns differ across assets and time periods?
Explained by Model
β₁X₁ + β₂X₂ + ... + βₖXₖ
Unexplained (Residual)
ε — Where alpha might hide
R² measures the proportion explained
R² = Explained Variation / Total Variation
An R² of 0.70 means your model explains 70% of return variation. The remaining 30% is unexplained (residual).
### Why This Decomposition Matters

**The explained portion** tells you what drives returns systematically — market exposure, value tilt, momentum, etc. These are the risk factors you're being compensated for holding. Understanding your factor exposures is essential for risk management and portfolio construction.

**The unexplained portion (residual)** is where idiosyncratic risk lives — but also where potential alpha hides. If you're an active manager, your goal is to have positive average residuals: returns unexplained by common factors. If your "alpha" disappears when you add the right factors to your regression, you weren't generating alpha at all — just disguised factor exposure.

⚠️
**The humbling reality:** Most apparent "alpha" disappears when properly adjusted for factor exposures. A manager beating the market by 3% might just have a beta of 1.2 — they're taking more risk, not demonstrating skill. Regression separates the two.

Section 04
## Correlation vs. Causation: The Critical Distinction

Regression reveals associations — patterns in the data. It does not, by itself, prove causation. This distinction is critical for avoiding costly mistakes in quantitative finance.

### Three Reasons Correlation ≠ Causation

| Problem | Description | Finance Example |
| **Omitted Variable Bias** | A third variable drives both X and Y, creating spurious correlation | Analyst coverage correlates with returns — but firm quality drives both |
| **Reverse Causality** | Maybe Y causes X, not the other way around | Do high returns attract analyst coverage, not vice versa? |
| **Coincidental Correlation** | With enough variables, some will correlate by chance | The famous "Super Bowl indicator" — spurious pattern |

**The pragmatic approach in quantitative finance:** We often care more about prediction than causation. If a variable reliably predicts future returns out-of-sample, it's useful even if we don't fully understand why. But causal understanding helps: it tells us whether the relationship will persist, and under what conditions it might break down.

### Predictors with Causal Stories Are More Robust

Consider two signals that both predict returns in historical data:

#### Signal A: Value (Book/Price)

**Causal story:** Cheap stocks are riskier (distress risk) or behaviorally neglected (extrapolation bias). Either way, there's a reason for the premium.

More likely to persist

#### Signal B: Stock ticker starts with "A"

**Causal story:** None. Any correlation is coincidental or data-mined.

Will not persist

Both might show statistical significance in-sample. Only one will work out-of-sample. The difference is whether there's a plausible mechanism connecting the predictor to returns.

Section 05
## The CAPM: Regression's Most Famous Application

The Capital Asset Pricing Model (CAPM) is regression's most influential application in finance. Understanding it deeply provides the template for all factor models that followed — and reveals how regression transformed investment management.

The CAPM Regression Equation
Rᵢ - Rᶠ = α + β(Rₘ - Rᶠ) + ε
Rᵢ - Rᶠ
Excess Return
Asset return minus risk-free rate (Y variable)
α (Alpha)
Intercept
Return unexplained by market — "skill"
β (Beta)
Slope
Sensitivity to market movements
ε
Residual
Idiosyncratic return — noise
### What CAPM Tells Us

| Coefficient | Interpretation | Implication |
| **β > 1** | More volatile than market | Aggressive asset — amplifies market moves |
| **β < 1** | Less volatile than market | Defensive asset — dampens market moves |
| **α > 0** | Positive risk-adjusted return | Outperformance vs. benchmark (potential skill) |
| **α < 0** | Negative risk-adjusted return | Underperformance after risk adjustment |

### Why CAPM Revolutionized Finance

Before CAPM, there was no systematic way to separate skill from risk-taking. A manager who beat the market by 5% might have done so through:

- **Genuine skill (positive α)** — selecting assets that outperformed their expected returns

- **Higher risk (high β)** — simply holding more volatile assets that happened to do well in an up market

CAPM regression separates these two. The intercept (α) measures return after controlling for market exposure (β). This single equation created the entire field of performance attribution.

# Running a CAPM regression in Python import statsmodels.api as sm # Excess returns y = asset_returns - risk_free_rate X = market_returns - risk_free_rate X = sm.add_constant(X) # Add intercept (alpha) # Fit regression model = sm.OLS(y, X).fit() # Results alpha = model.params[0] # Intercept — risk-adjusted return beta = model.params[1] # Slope — market sensitivity
Section 06
## From CAPM to Multi-Factor Models

The progression from CAPM to multi-factor models illustrates regression's power for cumulative knowledge building. Each advancement came from running regressions and finding systematic patterns in the residuals.

1
#### CAPM (1960s) — Single Factor

Market risk explains stock returns. But researchers noticed: small stocks and value stocks had persistent positive alphas. Were these stocks simply better, or were there missing risk factors?

2
#### Fama-French 3-Factor (1993)

Eugene Fama and Kenneth French added Size (SMB: Small Minus Big) and Value (HML: High Minus Low book-to-market). These factors explained much of the "alpha" that small and value stocks seemed to generate under CAPM. The apparent alpha was actually compensation for additional risk factors.

3
#### Carhart 4-Factor (1997)

Mark Carhart observed momentum in the residuals — stocks with high recent returns continued outperforming. Adding a Momentum factor (UMD: Up Minus Down) captured this pattern. The 4-factor model became the standard for performance evaluation.

4
#### Fama-French 5-Factor (2015)

Two more factors: Profitability (RMW: Robust Minus Weak) and Investment (CMA: Conservative Minus Aggressive). Firms with high profitability and low investment had unexplained returns — these factors captured that pattern.

∞
#### Your Custom Model

The framework is always the same: regress returns on candidate factors, examine residuals for patterns, add factors that explain systematic variation. Regression lets you test any factor hypothesis systematically.

The General Multi-Factor Model
Rᵢ - Rᶠ = α + β₁F₁ + β₂F₂ + ... + βₖFₖ + ε
Each βₖ measures exposure to factor Fₖ. Alpha (α) measures return unexplained by ALL included factors.
**The key insight:** What looks like alpha under a simple model often becomes explainable factor exposure under a richer model. A manager with a "value tilt" will show positive alpha against CAPM but zero alpha against Fama-French. They weren't skilled — they were just exposed to the value factor.

### Factor Zoo: The Current State

Researchers have now documented hundreds of potential factors. This "factor zoo" creates its own problems:

⚠️
#### Multiple Testing Problem

Test enough factors, and some will appear significant by chance. Many published factors fail to replicate out-of-sample.

🧪
#### Robustness Testing

Serious quants test factors across different time periods, markets, and specifications. Only robust factors survive scrutiny.

This course will teach you not just how to run regressions, but how to think critically about the results — distinguishing genuine factors from statistical artifacts.

Section 07
## What You'll Learn in This Course

This course is structured to build regression mastery progressively. Each lesson builds on the previous, culminating in the ability to develop production-grade factor models with institutional rigor.

| Lessons | Focus | You'll Learn |
| **2-3: Foundations** | OLS Mechanics | How regression actually works, coefficients, R², adjusted R², model fit |
| **4: Statistical Inference** | Significance Testing | T-statistics, p-values, confidence intervals — separating signal from noise |
| **5-6: Multiple Regression** | Factor Models | Multiple variables, multicollinearity, diagnostics, fixing common problems |
| **7-8: Production Models** | Real-World Application | Out-of-sample validation, robustness testing, regime changes, implementation |

### Why This Progression?

📚
**Foundations first:** Sloppy fundamentals create sloppy analysis. Understanding exactly what OLS does — and what coefficients mean economically, not just statistically — prevents embarrassing mistakes.

**Inference gets dedicated attention:** This is where most practitioners go wrong. Knowing that a coefficient is "significant" means nothing if you don't understand what significance actually implies (and doesn't imply).

**Production considerations last:** Academic regression and real-world regression differ. Issues like out-of-sample validation, regime changes, and implementation constraints separate models that work in research from models that work in practice.

## Key Takeaways

1
**Regression is the foundational tool of quantitative finance** — factor models, risk attribution, and alpha measurement all depend on it.
2
**The core idea is decomposition:** separating total variation into explained (systematic factors) and unexplained (residual/alpha).
3
**CAPM is regression's most famous application** — all multi-factor models follow the same logic with more explanatory variables.
4
**Correlation ≠ causation** — but predictors with plausible causal mechanisms tend to be more robust out-of-sample.
5
**What looks like alpha often becomes factor exposure** under a richer model — regression helps distinguish genuine skill from systematic risk-taking.
6
**This course builds from foundations to production models** — following the same progression the field itself developed.
Next Lesson

### OLS Mechanics: How Regression Actually Works

We'll dive into the mathematics of Ordinary Least Squares — what the algorithm does, why it works, and how to interpret the output correctly.

Regression Analysis Course

Educational content only. Not financial advice.
