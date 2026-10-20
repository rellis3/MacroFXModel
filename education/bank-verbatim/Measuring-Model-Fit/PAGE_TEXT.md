<!-- https://cog000.github.io/Measuring-Model-Fit/ | Regression Analysis — Lesson 3: Measuring Model Fit -->
Colez Trades
Quantitative & Macro Insights
C.OG
Regression Analysis / Lesson 3
C.OG
Lesson 03
# Measuring Model Fit: R² and Adjusted R²

How do you know if your regression model is any good? R² is the standard measure, but it's widely misunderstood and often misused. This lesson covers what R² actually tells you — and what it doesn't.

Duration 30 minutes
Difficulty Foundation
Prerequisites Lesson 2
Section 01
## R²: Proportion of Variance Explained

R-squared measures how much of the dependent variable's variation your model explains. It's bounded between 0 and 1, with higher values indicating more explained variation. Simple to interpret — but this simplicity hides important nuances.

The R² Formula
R² = 1 - (SSres / SStot) = SSexp / SStot
SStot
Total Sum of Squares
Σ(Yᵢ - Ȳ)² Total variation in Y around its mean
SSexp
Explained Sum of Squares
Σ(Ŷᵢ - Ȳ)² Variation captured by the model
SSres
Residual Sum of Squares
Σ(Yᵢ - Ŷᵢ)² Variation NOT captured by model
### Interpreting R²

Example: R² = 0.70

0% Explained 70% Explained 100% Explained
An R² of 0.70 means your model explains 70% of Y's variation. The remaining 30% is in the residuals — variation your model doesn't capture. This could be random noise, or it could be systematic factors you haven't included.

**The key insight:** R² tells you what fraction of Y's variation your model explains. But high R² doesn't mean good model, and low R² doesn't mean bad model. Context matters enormously.

Section 02
## Visualizing R²: Same Slope, Different Fit

R² measures scatter around the line, not the slope itself. This visual illustrates a crucial point that many practitioners miss: you can have a highly significant coefficient with low R².

High R² vs Low R² — Same Relationship
Both charts have the same slope (β), but different amounts of scatter
[CANVAS chart]
R² = 0.92 Points cluster tightly
[CANVAS chart]
R² = 0.35 Points scattered widely
💡
**Same slope, different R².** Both charts show the same underlying relationship (same β). The difference is the scatter. On the left, points cluster tightly around the line — high R². On the right, the same relationship exists but with much more noise — low R².

**In finance, low R² is common and expected.** Asset returns have enormous idiosyncratic variation. A CAPM regression might have R² of only 0.30-0.50 even for a well-specified model. Don't dismiss a model just because R² is low — the coefficient might still be significant and economically meaningful.

Section 03
## What R² Does and Doesn't Tell You

R² is a narrow measure that answers one specific question. Over-relying on it leads to serious mistakes. Understanding its limitations is essential for proper model evaluation.

✓
**Does Tell You:** Proportion of Y variance explained — useful for understanding explanatory power
✗
**Doesn't Tell You:** Whether the model is correctly specified — can be high with wrong functional form
✗
**Doesn't Tell You:** Whether coefficients are significant — unrelated to t-statistics
✗
**Doesn't Tell You:** Whether the model will predict well out-of-sample — can be high from overfitting
### Three Dangerous Scenarios

📈
#### High R² with Wrong Model

You can achieve high R² by fitting a curve that snakes through your data points. The fit is great in-sample but the model is garbage for prediction. R² doesn't distinguish good models from overfit ones.

⚠️
#### High R² with Biased Coefficients

If you have omitted variable bias, your coefficients are biased even if R² is high. The model "explains" variation but attributes it to the wrong variables.

✓
#### Low R² with Useful Model

In finance, we often care more about coefficient significance than R². A factor with β = 0.5 and t-stat = 4 is valuable even if R² = 0.05. The factor has predictive power; there's just lots of other variation too.

⚠️
**The R² trap:** Maximizing R² is not the goal. A model with R² = 0.95 that's overfit will fail in production. A model with R² = 0.10 that captures a genuine, stable relationship is far more valuable.

Section 04
## Adjusted R²: Penalizing Complexity

R² has a fundamental flaw: it never decreases when you add variables. Add any variable — even random noise — and R² goes up (or at best stays the same). This creates perverse incentives to add variables, leading to overfitting.

**The Problem:** R² always increases when you add variables, even if the new variable is pure noise. This creates an incentive to add variables — leading to overfitting.

#### R² (Standard)

R² = 1 - (SSres / SStot)
**Rewards explanatory power** No penalty for complexity Problem: Always pick the model with most variables

#### Adjusted R²

R̄² = 1 - [(1-R²)(n-1)/(n-k-1)]
**Penalizes for each added variable** Can decrease when adding noise Solution: Only add variables that improve adjusted R²

### How Adjusted R² Works

The adjusted R² formula includes (n-k-1) in the denominator, where k is the number of predictors. Adding a variable increases k, which can make adjusted R² fall if the variable doesn't add enough explanatory power to compensate.

| Model | Variables | R² | Adjusted R² | Verdict |
| Model A | Market only | 0.45 | 0.44 | Baseline |
| Model B | Market + Size | 0.52 | 0.51 | Size helps |
| Model C | Market + Size + Random | 0.53 | 0.50 | Random hurts |

✓
**Practical rule:** If adjusted R² decreases when you add a variable, that variable probably isn't helping your model — it's just adding noise. Use adjusted R² when comparing models with different numbers of predictors.

Section 05
## What's a 'Good' R² in Finance?

R² benchmarks vary dramatically across applications. What's "good" depends entirely on context. A 5% R² might be excellent for one application and suspicious for another.

| Application | Typical R² | Why? |
| **Cross-Sectional Return Prediction** | 0.03 - 0.10 | Most variation is idiosyncratic; signal-to-noise ratio is inherently low |
| **Time-Series Market Model (CAPM)** | 0.30 - 0.70 | Market movements affect all assets; blue chips higher, small caps lower |
| **Multi-Factor Models** | 0.50 - 0.90 | Multiple systematic sources captured; but explaining past, not predicting future |
| **Suspiciously High** | > 0.95 | Should trigger skepticism — possible overfitting or data issues |

### Context Is Everything

📊
#### Cross-Sectional Prediction

Predicting next month's returns using this month's characteristics typically has very low R². Even the best factor models explain perhaps 5-10%. The signal-to-noise ratio in asset returns is inherently low.

📈
#### Time-Series Market Model

Regressing an asset's returns on market returns shows higher R² because market movements affect all assets. Large-cap assets might show R² of 0.5-0.7; smaller assets have more idiosyncratic variation.

⚠️
#### Very High R² (> 0.95)

Should make you suspicious. Either you're explaining returns with variables that wouldn't be known in real-time, or you've overfit. Perfect fit usually means something is wrong.

⚠️
**Remember:** Multi-factor models can achieve high R² for diversified portfolios. But these models are explaining *past* returns, not predicting *future* ones. In-sample fit is not the same as predictive power.

Section 06
## The Overfitting Trap: When High R² Is a Red Flag

The most dangerous model is one with high in-sample R² that fails out-of-sample. This is overfitting — the model has memorized noise rather than learned signal. In quantitative finance, overfitting is the primary reason strategies fail in live trading.

#### In-Sample (Training Data)

[CANVAS chart]
Complex: R² = 0.99 Simple: R² = 0.65
#### Out-of-Sample (New Data)

[CANVAS chart]
Complex: R² = 0.25 Simple: R² = 0.60
**The complex model** (red curve) fits the training data almost perfectly — R² = 0.99. It snakes through every point. But on new data, it performs terribly. The "patterns" it learned were specific to the training data.

**The simple model** (green line) has lower in-sample R² but maintains its performance on new data. It captured the genuine linear relationship without fitting noise.

### Signs of Overfitting

📉
#### In-Sample vs Out-of-Sample Gap

Large difference between training and test performance is the classic overfitting signal. If your model works great on historical data but fails on new data, you've overfit.

🔢
#### Too Many Variables

Adding variables always improves in-sample fit. If you have nearly as many variables as observations, you can fit anything — but predict nothing.

🎯
#### Suspiciously Perfect Results

A backtest showing amazing results should trigger skepticism. The more spectacular the in-sample performance, the more likely it reflects overfitting rather than genuine predictive power.

🚨
**The quantitative finance graveyard** is filled with strategies that showed incredible backtests but failed in live trading. This is why out-of-sample testing is mandatory — we'll cover validation techniques in detail in Lesson 7.

Section 07
## Beyond R²: Other Fit Metrics

R² isn't the only way to assess model fit. Different metrics answer different questions — choose based on your goal.

📏
#### Root Mean Square Error (RMSE)

Average prediction error in original units. If you're predicting returns, RMSE of 0.02 means your predictions are off by 2 percentage points on average. More interpretable than R² for practical usefulness.

RMSE = √[Σ(Yᵢ - Ŷᵢ)² / n]
📊
#### Mean Absolute Error (MAE)

Less sensitive to outliers than RMSE. While RMSE squares errors (heavily penalizing large ones), MAE treats all errors proportionally. Use MAE when occasional large errors aren't catastrophic.

MAE = Σ|Yᵢ - Ŷᵢ| / n
📈
#### Akaike Information Criterion (AIC)

Balances fit and complexity — lower is better. Good for model selection when comparing non-nested models. Penalizes for number of parameters, preventing overfitting.

AIC = 2k - 2ln(L)
📉
#### Bayesian Information Criterion (BIC)

Stronger complexity penalty than AIC — prefers simpler models. BIC's penalty increases with sample size, making it more conservative. Often preferred for model selection in large datasets.

BIC = k·ln(n) - 2ln(L)
### Choosing the Right Metric

| Goal | Best Metric | Why |
| Understand explanatory power | R², Adjusted R² | Shows proportion of variance explained |
| Assess practical prediction accuracy | RMSE, MAE | Error in interpretable units |
| Compare models with different variables | Adjusted R², AIC, BIC | Penalize for complexity |
| Select best model from many candidates | AIC, BIC | Work for non-nested models, penalize overfitting |

# Computing fit metrics in Python import statsmodels.api as sm from sklearn.metrics import mean_squared_error, mean_absolute_error import numpy as np # Fit model model = sm.OLS(y, X).fit() # R² and Adjusted R² r_squared = model.rsquared adj_r_squared = model.rsquared_adj # RMSE and MAE predictions = model.fittedvalues rmse = np.sqrt(mean_squared_error(y, predictions)) mae = mean_absolute_error(y, predictions) # AIC and BIC aic = model.aic bic = model.bic print(f"R²: {r_squared:.3f}, Adj R²: {adj_r_squared:.3f}") print(f"RMSE: {rmse:.4f}, MAE: {mae:.4f}") print(f"AIC: {aic:.1f}, BIC: {bic:.1f}")
## Key Takeaways

1
**R² measures proportion of variance explained** — useful but narrow. It doesn't indicate model correctness or predictive power.
2
**Adjusted R² penalizes for added variables** — use it when comparing models with different numbers of predictors. If adjusted R² falls when you add a variable, that variable isn't helping.
3
**Expected R² varies dramatically by application** — 5% can be excellent for cross-sectional returns, suspicious for time-series models. Context determines what's "good."
4
**High in-sample R² can indicate overfitting** — out-of-sample validation is essential for any model you'll actually use. Great backtests often fail live.
5
**Different metrics answer different questions** — R² for explanatory power, RMSE/MAE for practical accuracy, AIC/BIC for model selection. Choose based on your goal.
6
**Model fit ≠ predictive power** — fitting historical data well doesn't guarantee future success. The crucial distinction is between explanation and prediction.
Next Lesson

### Statistical Inference: T-Statistics, P-Values, and Confidence Intervals

How do you know if your coefficient estimates are real signals or just noise? We'll cover the tools for separating statistically significant relationships from random variation.

Regression Analysis Course

Educational content only. Not financial advice.
