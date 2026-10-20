<!-- https://cog000.github.io/Simple-Linear-Regression/ | Regression Analysis — Lesson 2: Simple Linear Regression Foundations -->
Colez Trades
Quantitative & Macro Insights
C.OG
Regression Analysis / Lesson 2
C.OG
Lesson 02
# Simple Linear Regression Foundations

Before building complex factor models, you need rock-solid understanding of the simplest case: one dependent variable, one independent variable, one line. This is where OLS mechanics, coefficient interpretation, and model assumptions all become concrete.

Duration 30 minutes
Difficulty Foundation
Prerequisites Lesson 1
Section 01
## OLS: Finding the Line That Minimizes Squared Errors

Ordinary Least Squares (OLS) is the engine of regression analysis. Understanding exactly what it does — geometrically and algebraically — prevents misuse and misinterpretation. The goal is simple: find the line that best fits the data.

### What "Best Fit" Means

Given a scatter of data points, infinitely many lines could pass through them. OLS finds the unique line that minimizes the **sum of squared residuals** — the vertical distances between each point and the line, squared and summed.

OLS Objective Function
Minimize: Σ(Yᵢ - Ŷᵢ)²
Find α and β that make this sum as small as possible
### Why Squared Errors?

⚖️
#### Penalizes Large Errors More

Squaring means a residual of 10 contributes 100 to the objective, not 10. This makes OLS sensitive to outliers — large errors are heavily penalized.

📐
#### Makes Math Tractable

The squared function is smooth and differentiable everywhere. This allows calculus-based optimization with clean closed-form solutions.

✓
#### Unique Solution Guaranteed

The sum of squares is convex — it has a single global minimum. No matter where you start, you'll find the same answer.

📊
#### Optimal Under Normality

If errors are normally distributed, OLS produces the maximum likelihood estimate — the statistically "best" estimate possible.

⚠️
**The outlier sensitivity is a double-edged sword.** OLS gives you the best fit for your data — but if your data includes outliers or errors, OLS will distort the line to accommodate them. Always visualize your data before trusting regression output.

OLS: Minimizing Squared Vertical Distances
The best fit line minimizes the sum of squared residuals (shown as vertical distances)
[CANVAS chart]
Section 02
## The Regression Equation: Understanding Each Component

Each component of the regression equation has a specific interpretation. Getting these interpretations right is essential for meaningful analysis — and for avoiding the mistakes that plague careless practitioners.

The Simple Linear Regression Equation
Y = α + βX + ε
Y
Dependent Variable
What you're trying to explain or predict
α (Alpha)
Intercept
Expected Y when X equals zero
β (Beta)
Slope
Change in Y for one-unit change in X
ε (Epsilon)
Error Term
What the model doesn't explain
### Financial Example: Asset Return vs Market Return

CAPM-Style Regression
Asset Return = α + β × Market Return + ε
| Component | In This Context | Interpretation |
| **α (Alpha)** | Asset's excess return | Return unexplained by market — potential "skill" |
| **β (Beta)** | Market sensitivity | How much the asset moves per 1% market move |
| **ε (Epsilon)** | Idiosyncratic return | Asset-specific component unrelated to market |

💡
**Intercept interpretation requires caution.** The intercept (α) is the expected value of Y when X equals zero. In finance, this often represents "alpha" — return unexplained by your factor. But be careful: if X=0 is outside your data range, the intercept may not be meaningful. A regression of returns on market cap makes no sense at market cap = 0.

Section 03
## Interpreting the Slope (β): Where Economic Insight Lives

The slope coefficient is where the economic insight lives. Interpreting it correctly requires attention to sign, magnitude, and units. Getting any of these wrong leads to misleading conclusions.

📈
#### Economic Meaning

β tells you the marginal effect — how much Y changes for a one-unit change in X, holding all else constant.

±
#### Sign Matters

Positive β: X and Y move together. Negative β: X and Y move inversely. The sign tells you the direction of the relationship.

📏
#### Magnitude Matters

Larger |β| means stronger relationship — but compare to standard errors before concluding. Context determines if a magnitude is "large."

📐
#### Units Matter

β is in units of Y per unit of X. Changing measurement scales changes β proportionally. Always know and report your units.

### Example: Earnings Surprises and Returns

Consider a regression of asset returns on earnings surprises:

Return (%) = 0.1 + 0.5 × Earnings Surprise (%) + ε
| Interpretation | Meaning |
| **β = 0.5** | A 1% earnings surprise is associated with a 0.5% return on average |
| **Positive sign** | Positive surprises → positive returns (intuitive relationship) |
| **α = 0.1** | Even with zero surprise, average return is 0.1% (baseline drift) |

**Is β = 0.5 large or small?** That depends on context. Statistically, compare to the standard error. Economically, consider: is a 0.5% return for a 1% earnings surprise meaningful for a trading strategy after costs? A coefficient can be statistically significant but economically trivial, or economically meaningful but statistically uncertain.

### The Units Trap

Units are often overlooked but critical. Consider what happens if we change the earnings surprise measure:

| Earnings Surprise Measured As | β Value | Same Relationship? |
| Percentage (e.g., 5%) | 0.5 | Yes — baseline |
| Decimal (e.g., 0.05) | 50 | Yes — same relationship, β × 100 |
| Basis points (e.g., 500) | 0.005 | Yes — same relationship, β ÷ 100 |

The underlying economic relationship is identical — only the scale changed. Always know your units and report them clearly.

Section 04
## Fitted Values and Residuals: The Two Outputs of Every Regression

Every regression produces two key outputs for each observation: fitted values (predictions) and residuals (errors). Understanding both is essential for model evaluation and alpha hunting.

#### Decomposing Each Observation

Actual
Yᵢ
=
Fitted
Ŷᵢ
+
Residual
εᵢ
📊
#### Fitted Values (Ŷᵢ)

**What your model predicts.** For an asset with β=1.2 and a market return of 2%, the fitted value is α + 1.2×2%. This is the return "explained" by market exposure.

📉
#### Residuals (εᵢ)

**What your model gets wrong.** The difference between actual and fitted: εᵢ = Yᵢ - Ŷᵢ. This is the asset-specific component unrelated to your factors.

### What Each Tells You

| Output | Reveals | Use For |
| **Fitted Values** | Expected return given factor exposure | Understanding systematic component; risk attribution |
| **Residuals** | Idiosyncratic return; model failures | Alpha hunting; model diagnostics; outlier detection |

**The key insight for alpha hunters:** If your residuals are systematically positive (negative), your asset is outperforming (underperforming) after adjusting for factor exposure. This is alpha — return unexplained by your model. Of course, this only matters if the residuals persist out-of-sample.

### Residuals as Diagnostics

Well-behaved residuals should look like random noise — no patterns over time, no relationship with X, constant spread. If your residuals show patterns, your model is missing something important.

#### ✓ Good Residuals

Random scatter around zero. No trends over time. Constant variance. No relationship with X or fitted values.

#### ✗ Bad Residuals

Patterns visible. Trending over time. Variance changes (funnel shape). Curved relationship with X (nonlinearity).

# Extracting fitted values and residuals in Python import statsmodels.api as sm # Fit the model X = sm.add_constant(factor_returns) model = sm.OLS(asset_returns, X).fit() # Get fitted values and residuals fitted_values = model.fittedvalues # Ŷᵢ — explained by factors residuals = model.resid # εᵢ — unexplained (alpha?) # Check: actual = fitted + residual assert np.allclose(asset_returns, fitted_values + residuals)
Section 05
## OLS Assumptions: When the Engine Works (and When It Doesn't)

OLS produces optimal estimates only when certain assumptions hold. In finance, these assumptions are routinely violated — knowing which violations matter and how to address them is essential for credible analysis.

✓
#### 1. Linearity

The relationship between X and Y is linear. This is often approximately satisfied, and non-linear relationships can be handled through variable transformations (logs, polynomials, etc.).

Usually manageable — transform variables if needed
⚠️
#### 2. Homoskedasticity

Error variance is constant across all values of X. **Almost always violated in finance** — volatility clusters. Large errors follow large errors (GARCH effects).

**Consequence:** Coefficients remain unbiased, but standard errors are wrong → t-statistics and p-values are unreliable.

Fix: Use heteroskedasticity-robust standard errors (White/Huber-White)
⚠️
#### 3. No Autocorrelation

Errors are independent over time. **Often violated in time series** — yesterday's return residual often predicts today's (momentum, mean reversion effects not captured by model).

**Consequence:** Again, coefficients unbiased but standard errors wrong — typically underestimated, making results look more significant than they are.

Fix: Use Newey-West standard errors (handles both heteroskedasticity AND autocorrelation)
🚨
#### 4. Exogeneity

X is uncorrelated with the error term. **The big one.** If X is correlated with ε (due to omitted variables, reverse causality, or measurement error), your β estimate is *biased* — not just imprecise, but systematically wrong.

**Consequence:** Your coefficient doesn't measure what you think it measures. No amount of data fixes this.

Fix: Requires careful thinking about model specification, instrumental variables, or panel methods
🚨
**The hierarchy of violations:** Heteroskedasticity and autocorrelation are annoying but fixable — your coefficients are still right, you just need robust standard errors. Exogeneity violations are serious — your coefficients themselves are wrong. Always worry more about exogeneity than the other assumptions.

### Practical Defaults for Financial Data

**Rule of thumb:** When working with financial time series, always use Newey-West standard errors as your default. They're robust to both heteroskedasticity and autocorrelation — the two most common violations in financial data. The cost is slightly wider confidence intervals; the benefit is valid inference.

# Using Newey-West standard errors in Python import statsmodels.api as sm # Fit model with Newey-West SEs (4 lags is common for monthly data) model = sm.OLS(y, X).fit(cov_type='HAC', cov_kwds={'maxlags': 4}) # Now t-stats and p-values are valid even with # heteroskedasticity and autocorrelation print(model.summary())
Section 06
## The OLS Formulas: What's Actually Being Calculated

The OLS formulas reveal the geometric intuition behind regression. Understanding them — not just using them — deepens your grasp of what regression does and why it sometimes fails.

#### Slope (β)

β = Cov(X,Y) / Var(X)
How X and Y move together, scaled by X's variability

#### Intercept (α)

α = Ȳ - βX̄
Average Y minus slope times average X

### The Key Insight: β as Scaled Correlation

The slope formula can be rewritten to reveal a beautiful relationship:

Beta as Scaled Correlation
β = ρXY × (σY / σX)
Beta equals the correlation times the ratio of standard deviations
| Component | Meaning | Range |
| **ρXY** | Correlation — direction and strength of linear relationship | -1 to +1 |
| **σY / σX** | Ratio of standard deviations — relative volatility | 0 to ∞ |

### What This Decomposition Reveals

#### If Y is more volatile than X

Then |β| > |ρ|. A high-volatility asset will have a beta greater than its correlation with the market.

#### If X is more volatile than Y

Then |β| < |ρ|. The slope is dampened relative to the correlation.

#### If equal volatility

Then β = ρ. The slope equals the correlation exactly. This is the special case of standardized variables.

💡
**Why this matters:** An asset can have high beta (β > 1) either because it's highly correlated with the market OR because it's highly volatile relative to the market — or both. The formula separates these two effects. A crypto asset might have β = 2 not because it's perfectly correlated with equities, but because it's twice as volatile.

### The Intercept: Passing Through the Centroid

The formula α = Ȳ - βX̄ has a geometric interpretation: the OLS line always passes through the point (X̄, Ȳ) — the centroid of your data. Once you know the slope, the intercept is determined by this requirement.

Section 07
## Practical Interpretation Tips

Correct interpretation separates useful analysis from misleading conclusions. These practical tips prevent common mistakes that plague even experienced practitioners.

📏
#### Always Check Units

β of 0.5 means nothing without knowing units. "0.5% return per 1% earnings surprise" is interpretable. "0.5" alone is not.

📊
#### Use Standardized Coefficients

Standardize X and Y first (subtract mean, divide by SD). Now β shows standard deviation changes — comparable across different variables.

💰
#### Economic vs Statistical Significance

A coefficient can be statistically significant (low p-value) but economically trivial. Always ask: is this effect large enough to matter?

⚖️
#### Think About Causation

Regression shows association. "X is associated with Y" is defensible. "X causes Y" requires much more justification.

### Standardized Coefficients: Making Apples-to-Apples Comparisons

Raw coefficients depend on measurement units. Standardized coefficients solve this:

Standardization Process
Z = (X - X̄) / σX
Transform both X and Y this way before regressing
After standardization, β tells you: "A one-standard-deviation increase in X is associated with a β-standard-deviation change in Y." This is comparable across different variables with different units.

**Example:** Comparing the effect of earnings surprise vs analyst coverage on returns. Raw coefficients can't be compared (different units). Standardized coefficients can: if βearnings = 0.3 and βcoverage = 0.1, earnings surprises have 3× the standardized effect of coverage changes.

### The Economic vs Statistical Significance Trap

| Scenario | Statistically Significant? | Economically Significant? | Action |
| Large effect, tight SE | Yes | Yes | Strong finding — investigate further |
| Small effect, tight SE | Yes | No | Precisely measured nothing — not useful |
| Large effect, wide SE | No | Maybe | Promising but uncertain — need more data |
| Small effect, wide SE | No | No | Nothing here — move on |

⚠️
**With enough data, everything becomes "significant."** In a dataset with millions of observations, even a 0.001% effect will have a tiny p-value. Statistical significance tells you the effect is distinguishable from zero — not that it matters. Always report effect magnitudes, not just p-values.

## Key Takeaways

1
**OLS finds the line minimizing sum of squared residuals** — the unique "best fit" under standard conditions. Squaring penalizes large errors heavily.
2
**β = Cov(X,Y)/Var(X)** — the slope measures how much Y changes for a one-unit change in X. Sign, magnitude, and units all matter for interpretation.
3
**Every observation decomposes into fitted value + residual** — the explained and unexplained components. Residuals are where alpha hides (and where model failures show).
4
**Assumption violations matter differently.** Heteroskedasticity and autocorrelation affect inference (fix with robust SEs). Exogeneity violations bias coefficients (requires model rethinking).
5
**β = ρ × (σY/σX)** — beta is correlation scaled by relative volatility. High beta can come from high correlation OR high relative volatility.
6
**Statistical significance ≠ economic significance.** A tiny effect can be statistically significant with enough data. Always report and interpret magnitudes.
Next Lesson

### Measuring Model Fit: R² and Adjusted R²

How well does your model explain the data? We'll cover R², its limitations, adjusted R² for model comparison, and why fit isn't everything.

Regression Analysis Course

Educational content only. Not financial advice.
