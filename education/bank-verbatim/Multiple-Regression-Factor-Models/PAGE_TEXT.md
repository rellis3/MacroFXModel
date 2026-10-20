<!-- https://cog000.github.io/Multiple-Regression-Factor-Models/ | Regression Analysis — Lesson 5: Multiple Regression & Factor Models -->
Colez Trades
Quantitative & Macro Insights
C.OG
Regression Analysis/Lesson 5
C.OG
Lesson 05
# Multiple Regression & Factor Models

Real-world return drivers don't operate in isolation. Multiple regression lets you include several factors simultaneously, isolating each one's contribution.

Duration40 minutes
DifficultyIntermediate
PrerequisitesLessons 2-4
Section 01
## From Simple to Multiple Regression

Multiple regression extends simple regression to multiple explanatory variables. The critical change: coefficients now represent **partial effects** — the impact of each variable holding others constant.

#### Simple Regression

Y = α + β₁X₁ + ε
One predictor e.g., CAPM: Return = α + β(Market) + ε

#### Multiple Regression

Y = α + β₁X₁ + β₂X₂ + ... + ε
Multiple predictors e.g., FF3: Return = α + β₁(Mkt) + β₂(SMB) + β₃(HML) + ε

**The key interpretation change:** Each coefficient is now a PARTIAL effect.

β₁ is "the effect of X₁ on Y, *holding all other X variables constant*." This is what makes factor models powerful — you can isolate each factor's contribution.

### Why This Matters

🎯
#### Isolate Factor Effects

Market beta in a multi-factor model is sensitivity to market *after controlling* for size and value — a cleaner measure than CAPM beta.

📊
#### Control for Confounders

If size and value are correlated, simple regression on either gives biased estimates. Multiple regression separates their effects.

💡
#### More Meaningful Alpha

Alpha in Fama-French is return unexplained by market, size, AND value — a higher bar than CAPM alpha.

Section 02
## The Fama-French Model: Multiple Regression in Action

The Fama-French model is the canonical example of multiple regression in finance. Understanding it teaches you how factor models work.

Fama-French Three-Factor Model (+ Momentum)
Rᵢ - Rᶠ = α + β₁(Mkt-RF) + β₂(SMB) + β₃(HML) + β₄(UMD) + ε
📈
#### Market

Mkt-RF
Excess market return

📊
#### Size

SMB
Small Minus Big

💰
#### Value

HML
High Minus Low B/M

📈
#### Momentum

UMD
Up Minus Down

### Interpreting Coefficients

| Coefficient | Interpretation | Example |
| **β₁ (Market)** | Market sensitivity after controlling for other factors | β₁ = 1.2 → 1.2% per 1% market move |
| **β₂ (SMB)** | Size exposure — positive means tilts small | β₂ = 0.5 → behaves like small caps |
| **β₃ (HML)** | Value exposure — positive means tilts value | β₃ = -0.3 → behaves like growth |
| **α (Alpha)** | Return unexplained by ALL factors | α = 0.2% → genuine outperformance |

Section 03
## Multicollinearity: When Factors Fight

Multicollinearity occurs when predictor variables are highly correlated. It doesn't bias predictions, but destroys your ability to interpret individual coefficients.

#### Low Correlation

Coefficients precisely estimated, each factor's contribution clear, standard errors reasonable.

#### High Correlation (Multicollinearity)

Coefficients imprecisely estimated, can't separate effects, standard errors explode.

### Detecting Multicollinearity: VIF

#### Variance Inflation Factor Scale

VIF = 1 No problemVIF = 5 ModerateVIF = 10 SeriousVIF > 10 Severe
# Computing VIF in Python from statsmodels.stats.outliers_influence import variance_inflation_factor vif_data = pd.DataFrame() vif_data["Variable"] = X.columns vif_data["VIF"] = [variance_inflation_factor(X.values, i) for i in range(X.shape[1])] print(vif_data[vif_data["VIF"] > 10]) # VIF > 10 = problem
Section 04
## The F-Test: Overall Model Significance

The F-test asks whether the model as a whole has explanatory power — are ALL coefficients jointly zero?

### What the F-Test Tests

**Null hypothesis:** β₁ = β₂ = ... = βₖ = 0 (all slopes are zero)

Rejecting means at least some factors matter. But it doesn't tell you *which* ones — that requires individual t-statistics.

⚠️
**The multicollinearity paradox:** You can have a significant F-test (model matters overall) with NO individually significant coefficients. Factors jointly matter but you can't separate them.

Section 05
## Building Your Own Factor Model

Building a factor model follows a disciplined process. Skipping steps leads to models that fail in live trading.

1
#### Start With Theory

What factors should logically predict returns? Economic rationale matters. Factors with stories are more likely to persist.

2
#### Get Clean Factor Data

Ken French's data library, AQR, or construct your own. Data quality is crucial — no look-ahead bias, proper delisting handling.

3
#### Run the Regression

Standard OLS with robust standard errors (Newey-West). Check VIF for multicollinearity. Examine residuals.

4
#### Validate Extensively

Out-of-sample testing is mandatory. Different time periods, different markets. If it only works in one sample, it's overfitting.

Section 06
## Reading Regression Output

Every number in regression output tells part of the story. Focus on coefficients for economic interpretation, t-stats for significance.

OLS Regression Results — Example Factor Model
VariableCoefStd Errt-statP>|t|
const (α)0.00150.00121.250.212
Mkt-RF1.150.0814.380.000
SMB0.420.123.500.001
HML0.150.081.880.062
💡
**HML is instructive:** β = 0.15, t = 1.88, p = 0.062. Marginally significant — suggestive but not conclusive. Don't over-interpret borderline results.

Section 07
## Common Factor Model Pitfalls

Factor models can fail in subtle ways. Being aware of these pitfalls is essential for robust models.

📈
#### Overfitting Factors

Adding factors until R² is high creates models that fail out-of-sample. Each additional factor increases chance of fitting noise.

⏰
#### Look-Ahead Bias

Using information not available at the time destroys validity. Year-end book values can't predict January returns.

⚖️
#### Factor Timing

Implicitly timing factors through variable selection — often unintentional. Selecting based on recent performance is timing.

👻
#### Survivorship Bias

Only including assets that survived overestimates returns. Delisted assets often had poor returns before delisting.

## Key Takeaways

1
**Multiple regression coefficients are PARTIAL effects** — the impact of each variable holding others constant.
2
**Multicollinearity occurs when predictors are correlated** — inflates standard errors and obscures individual contributions. Check VIF.
3
**The F-test assesses overall model significance** — whether factors jointly explain returns.
4
**Building robust models requires theory, clean data, and extensive out-of-sample validation.**
5
**Alpha in multi-factor models is more meaningful** — return unexplained by ALL included factors.
6
**Watch for pitfalls:** overfitting, look-ahead bias, survivorship bias can all invalidate your model.
Next Lesson

### Advanced Topics: Interaction Terms, Dummy Variables, and Non-Linear Effects

How do you model effects that vary by category or relationships that aren't linear?

Regression Analysis Course

Educational content only. Not financial advice.
