<!-- https://cog000.github.io/Regression-Diagnostics-Pitfalls/ | Regression Analysis — Lesson 6: Regression Diagnostics & Pitfalls -->
Colez Trades
Quantitative & Macro Insights
C.OG
Regression Analysis/Lesson 6
C.OG
Lesson 06
# Regression Diagnostics & Pitfalls

Your regression output is only as good as the assumptions underlying it. In financial data, assumption violations are the rule, not the exception. This lesson covers how to diagnose violations and fix them.

Duration35 minutes
DifficultyIntermediate
PrerequisitesLessons 2-5
Section 01
## Three Main Assumption Violations in Finance

OLS regression assumes well-behaved error terms. In finance, these assumptions are routinely violated — but there are fixes. Know how to diagnose and correct them.

#### Heteroskedasticity

Non-constant variance
Volatility clustering: large errors follow large errors
Fix: Robust SEs (White)
#### Autocorrelation

Correlated errors over time
Today's residual predicts tomorrow's (momentum, mean reversion)
Fix: Newey-West SEs
#### Non-Stationarity

Parameters change over time
Relationships from 2010 may not hold in 2024
Fix: Rolling windows
**In financial data, assumption violations are the rule, not the exception.** Volatility clusters. Errors are correlated. Relationships change. Know how to diagnose and correct these problems.

Section 02
## Heteroskedasticity: Volatility Clustering

Heteroskedasticity means non-constant variance — residuals are larger in some periods than others. In financial returns, this appears as volatility clustering: calm periods followed by calm, turbulent by turbulent.

📊
#### What It Looks Like

Residuals are larger in some periods than others. Plot residuals vs fitted values — if you see a "funnel" or "megaphone" shape, you have heteroskedasticity.

⚠️
#### Consequence

Coefficients remain **unbiased** BUT standard errors are wrong. Your t-statistics and p-values are invalid — you might think something is significant when it isn't.

🔧
#### The Fix

Use heteroskedasticity-robust standard errors (White/Huber-White). In Python: cov_type='HC3'. Corrects SEs without changing coefficients.

### Detection

| Method | How It Works | When to Use |
| **Visual inspection** | Plot residuals vs fitted values | Always — fast and catches obvious patterns |
| **Breusch-Pagan test** | Formal test for heteroskedasticity | When visual is ambiguous |
| **White test** | More general than Breusch-Pagan | When relationship may be nonlinear |

# Detecting and fixing heteroskedasticity import statsmodels.api as sm from statsmodels.stats.diagnostic import het_breuschpagan # Fit OLS and get residuals model = sm.OLS(y, X).fit() resid = model.resid # Breusch-Pagan test bp_stat, bp_pval, _, _ = het_breuschpagan(resid, X) print(f"BP p-value: {bp_pval:.4f}") # p < 0.05 = heteroskedasticity # Fix: use robust standard errors model_robust = sm.OLS(y, X).fit(cov_type='HC3') print(model_robust.summary())
Section 03
## Autocorrelation: Time-Dependent Errors

Autocorrelation means today's residual is correlated with yesterday's — errors aren't independent over time. Common in time-series financial data due to omitted variables, momentum, or mean reversion.

📈
#### What It Looks Like

If today's return residual is positive, tomorrow's is more likely to be positive too. Plot residuals over time — trends or cycles indicate autocorrelation.

⚠️
#### Consequence

Again, coefficients unbiased but SEs wrong — typically **underestimated**, inflating t-statistics. You think you have more precision than you do.

🔧
#### The Fix

Newey-West standard errors handle BOTH heteroskedasticity AND autocorrelation. Specify the number of lags to account for.

### Detection

| Method | How It Works | Interpretation |
| **Durbin-Watson** | Tests for first-order autocorrelation | DW ≈ 2: no autocorrelation; DW < 2: positive; DW > 2: negative |
| **ACF plot** | Autocorrelation function of residuals | Spikes outside confidence bands = autocorrelation at that lag |
| **Ljung-Box test** | Tests multiple lags jointly | p < 0.05 = significant autocorrelation |

# Detecting and fixing autocorrelation from statsmodels.stats.stattools import durbin_watson from statsmodels.stats.diagnostic import acorr_ljungbox # Durbin-Watson test dw = durbin_watson(model.resid) print(f"Durbin-Watson: {dw:.2f}") # ≈2 is good # Ljung-Box test lb_stat, lb_pval = acorr_ljungbox(model.resid, lags=[4], return_df=False) print(f"Ljung-Box p-value: {lb_pval[0]:.4f}") # Fix: Newey-West standard errors model_nw = sm.OLS(y, X).fit(cov_type='HAC', cov_kwds={'maxlags': 4}) print(model_nw.summary())
✓
**Newey-West should be your default for time-series regressions.** It handles both heteroskedasticity and autocorrelation. The cost is slightly wider confidence intervals; the benefit is valid inference.

Section 04
## Residual Diagnostic Plots

Always plot your residuals. Statistical tests can miss patterns that are obvious visually. Four key plots catch most problems.

📊
#### Residuals vs Fitted

Look for random scatter around zero. Patterns (curves, funnels) suggest misspecification or heteroskedasticity.

📅
#### Residuals vs Time

Look for independence over time. Trends, cycles, or clusters suggest autocorrelation or structural breaks.

📐
#### Scale-Location Plot

Check for constant spread. A funnel shape (residuals spreading out) indicates heteroskedasticity.

📈
#### Q-Q Plot

Check normality. Deviations in tails indicate fat tails (common in finance). May affect inference in small samples.

# Creating diagnostic plots import matplotlib.pyplot as plt import scipy.stats as stats fig, axes = plt.subplots(2, 2, figsize=(12, 10)) # Residuals vs Fitted axes[0,0].scatter(model.fittedvalues, model.resid, alpha=0.5) axes[0,0].axhline(y=0, color='r', linestyle='--') axes[0,0].set_title('Residuals vs Fitted') # Residuals vs Time axes[0,1].plot(model.resid) axes[0,1].set_title('Residuals Over Time') # Scale-Location axes[1,0].scatter(model.fittedvalues, np.sqrt(np.abs(model.resid))) axes[1,0].set_title('Scale-Location') # Q-Q Plot stats.probplot(model.resid, plot=axes[1,1]) axes[1,1].set_title('Q-Q Plot') plt.tight_layout()
Section 05
## Non-Stationarity & Structural Breaks

Financial relationships change over time. A model estimated on 2000-2010 data may not apply to 2020 markets. Betas aren't constant — market sensitivity changes as companies evolve.

🔄
#### Changing Relationships

Betas aren't constant. An asset's market sensitivity changes as leverage changes, as industry dynamics shift, as the company evolves.

📉
#### Structural Breaks

Regime changes (2008 crisis, COVID) may invalidate relationships estimated before. The world changed — your model might be obsolete.

🔧
#### Remedies

Use rolling windows, estimate separately by regime, or allow time-varying parameters. Plot coefficient estimates over time to check stability.

### Detection Methods

| Method | Use Case | Interpretation |
| **Rolling regressions** | Visual check for stability | Plot coefficients over time; jumps = instability |
| **Chow test** | Known break date (e.g., 2008) | p < 0.05 = coefficients differ before/after |
| **CUSUM test** | Unknown break date | Detects when cumulative sum of residuals drifts |

# Rolling regression to check stability window = 60 # 60-month rolling window rolling_betas = [] for i in range(window, len(y)): y_window = y[i-window:i] X_window = X[i-window:i] model_roll = sm.OLS(y_window, X_window).fit() rolling_betas.append(model_roll.params[1]) # Market beta # Plot rolling beta over time plt.plot(rolling_betas) plt.title('Rolling Market Beta (60-month window)') plt.axhline(y=np.mean(rolling_betas), color='r', linestyle='--')
⚠️
**If your rolling betas jump around, non-stationarity is an issue.** A model with stable coefficients is more likely to work going forward. Wildly varying coefficients suggest the underlying relationship isn't stable.

Section 06
## Outliers and Influential Observations

Outliers can completely drive your regression results. This is especially problematic in finance where extreme observations are common. OLS is not robust to outliers.

⚠️
#### The Problem

A few extreme observations can dominate OLS results. One bad data point or one crisis month might determine your entire coefficient estimate.

🔍
#### Detection

**Cook's Distance** measures each observation's influence. High Cook's D (>1 or >4/n) flags influential points. **DFBETAS** shows impact on each coefficient.

🔧
#### Options

Robust regression (LAD, M-estimators), winsorization, or accept outliers but report sensitivity. Depends on whether outlier is error or genuine extreme event.

### Assessment Framework

| Outlier Type | What To Do | Example |
| **Data error** | Fix or remove | Typo: return of 500% instead of 5% |
| **Genuine extreme event** | Keep, but report sensitivity | March 2020 COVID crash |
| **Misspecification signal** | Reconsider your model | Systematic pattern in outliers suggests missing variable |

# Detecting influential observations from statsmodels.stats.outliers_influence import OLSInfluence influence = OLSInfluence(model) cooks_d = influence.cooks_distance[0] # Flag influential points threshold = 4 / len(y) # Common rule of thumb influential = np.where(cooks_d > threshold)[0] print(f"Influential observations: {influential}") # Estimate model with and without outliers mask = cooks_d <= threshold model_no_outliers = sm.OLS(y[mask], X[mask]).fit() print("Coefficients with outliers:", model.params) print("Coefficients without:", model_no_outliers.params)
Section 07
## A Diagnostic Checklist

Make diagnostics a habit. Running through this checklist for every regression prevents embarrassing errors. Start with visual inspection — it's fast and catches most issues.

1
#### Plot Residuals

Visual inspection catches most problems — do this first for every regression. Look for patterns, trends, clustering.

2
#### Check for Heteroskedasticity

Use White/Breusch-Pagan test. If present, use robust standard errors (HC3). This is cheap insurance.

3
#### Check for Autocorrelation

Use Durbin-Watson or ACF. If present, use Newey-West standard errors. Specify appropriate lag length.

4
#### Check for Influential Points

Use Cook's Distance. Investigate outliers — are they errors or information? Report sensitivity to their inclusion.

💡
**Document your diagnostics.** When presenting results, note: "Standard errors are Newey-West with 4 lags. Residual plots show no obvious patterns. Results are robust to excluding influential observations."

## Key Takeaways

1
**Heteroskedasticity and autocorrelation are ubiquitous in finance** — use robust standard errors as your default.
2
**Newey-West standard errors handle both problems** — they should be your default for time-series regressions.
3
**Always plot residuals** — visual diagnostics catch issues that formal tests miss.
4
**Outliers can dominate OLS results** — investigate influential points and report sensitivity to their inclusion.
5
**Financial relationships change over time** — use rolling windows to check parameter stability.
6
**Diagnostics aren't optional** — a regression without diagnostics is a black box that might be producing garbage.
Next Lesson

### Out-of-Sample Testing & Validation

The ultimate test: does your model work on data it hasn't seen? We'll cover proper validation techniques and why in-sample fit doesn't guarantee out-of-sample success.

Regression Analysis Course

Educational content only. Not financial advice.
