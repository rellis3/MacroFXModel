<!-- https://cog000.github.io/Statistical-Inference-Significance/ | Regression Analysis — Lesson 4: Statistical Inference & Significance -->
Colez Trades
Quantitative & Macro Insights
C.OG
Regression Analysis / Lesson 4
C.OG
Lesson 04
# Statistical Inference & Significance

You've estimated beta. But is it real, or could you have gotten this result by chance? Statistical inference answers this critical question — and understanding it properly separates rigorous analysis from noise-chasing.

Duration 35 minutes
Difficulty Intermediate
Prerequisites Lessons 2-3
Section 01
## The T-Statistic: Signal-to-Noise Ratio

Estimating a coefficient is only half the battle. You also need to know how confident you should be in that estimate. The t-statistic provides the framework — it's your coefficient divided by its standard error, measuring how many standard errors your estimate is from zero.

T-Statistic Formula
t = β / SE(β)
Signal divided by noise — how far is your estimate from zero, in standard error units?
β (Numerator)
Your Estimated Coefficient
The signal — how far from zero is your estimate? **Larger |β| → larger |t|**
SE(β) (Denominator)
Standard Error of Coefficient
The noise — how uncertain is your estimate? **Smaller SE → larger |t|**
### Intuition: Why This Ratio?

Consider two estimates, both with β = 0.5:

| Scenario | β | SE(β) | t-stat | Interpretation |
| Precise estimate | 0.5 | 0.1 | 5.0 | Strong evidence — 5 standard errors from zero |
| Imprecise estimate | 0.5 | 0.4 | 1.25 | Weak evidence — could easily be noise |

💡
**The key insight:** A small coefficient with small standard error can be highly significant. A large coefficient with large standard error might not be. The t-statistic balances effect size against uncertainty.

Section 02
## Standard Errors: Quantifying Uncertainty

Standard error is the uncertainty in your coefficient estimate. It answers: if I collected a new sample and re-estimated, how different might beta be? Understanding what affects SE — and when classical formulas fail — is essential for valid inference.

### Three Factors That Determine Standard Error

📊
#### Sample Size (n)

**More data → smaller SE** This is why we want large samples. Doubling n roughly halves SE (shrinks by √2).

📉
#### Residual Variance (σ²)

**Noisier data → larger SE** If your model leaves a lot unexplained, coefficient estimates are less precise.

↔️
#### X Variance

**More spread in X → smaller SE** More variation in your predictor gives better identification of the relationship.

### Robust Standard Errors: When Classical Formulas Fail

**The problem:** Classical SE formulas assume homoskedasticity (constant variance) and no autocorrelation (independent errors). In financial data, these assumptions virtually never hold. Volatility clusters, and yesterday's residual predicts today's.

| Standard Error Type | Robust To | When To Use |
| **Classical (OLS)** | Nothing — assumes ideal conditions | Rarely in finance; only if you've verified assumptions |
| **White (HC)** | Heteroskedasticity | Cross-sectional data with non-constant variance |
| **Newey-West (HAC)** | Heteroskedasticity AND autocorrelation | Default for financial time series |

✓
**Practical rule:** In financial applications, always report Newey-West standard errors unless you have strong reason to believe classical assumptions hold. The cost is slightly wider confidence intervals; the benefit is valid inference.

# Using robust standard errors in Python import statsmodels.api as sm # Classical OLS (often wrong in finance) model_classical = sm.OLS(y, X).fit() # White heteroskedasticity-robust model_white = sm.OLS(y, X).fit(cov_type='HC3') # Newey-West (robust to heteroskedasticity AND autocorrelation) model_nw = sm.OLS(y, X).fit(cov_type='HAC', cov_kwds={'maxlags': 4}) # Compare t-stats (often lower with robust SEs) print(f"Classical t-stat: {model_classical.tvalues[1]:.2f}") print(f"Newey-West t-stat: {model_nw.tvalues[1]:.2f}")
Section 03
## Interpreting T-Statistics: Rules of Thumb

The traditional rule |t| > 2 for significance is often too lenient in finance. Understanding why requires grasping the multiple testing problem — and leads to stricter thresholds for factor discovery.

#### T-Statistic Interpretation Scale

Strong negative Not significant Strong positive
|t|=2
|t|=2
t=0
|t| < 2
Not significant at 5%
2 < |t| < 3
Significant but suspect
|t| > 3
Robust significance
### The Harvey-Liu-Zhu Threshold: |t| > 3

**The finance problem:** Researchers test thousands of potential factors. At the 5% significance level, you expect 5 false positives per 100 tests — even if nothing is real. With thousands of tests, the "factor zoo" fills with spurious discoveries.

**The solution:** Harvey, Liu, and Zhu (2016) recommend using |t| > 3 as the significance threshold for factor discovery. This dramatically reduces false positives. A t-stat of 2.5 might be significant in a single pre-registered test, but it's suspect in factor research where thousands of specifications have been tried.

⚠️
**Be skeptical of any factor claiming significance with t-stat between 2 and 3,** especially if the authors tried many specifications. Most published factors in this range fail to replicate out-of-sample.

Section 04
## P-Values: What They Really Mean

P-values are universally reported and universally misunderstood. Getting the interpretation right prevents embarrassing errors — and helps you understand the limits of what statistical significance actually tells you.

#### ✓ Correct Interpretation

The p-value is the probability of observing data this extreme **or more extreme**, assuming the null hypothesis (β=0) is true.

*"If there were truly no relationship, I'd see a result this extreme only 3% of the time by chance."*

#### ✗ Common Misinterpretation

The p-value is **NOT** the probability that the null hypothesis is true.

*"There's a 3% chance that β=0"* — This is wrong! That would require Bayesian analysis with prior beliefs.

### What a P-Value of 0.03 Actually Means

### The Correct Statement

"If there were truly no relationship between X and Y (β=0), we would observe a coefficient estimate this large or larger only 3% of the time due to random sampling variation."

This is **evidence against the null**, not proof that the null is false. It tells you about P(Data | Null), not P(Null | Data).

### The Decision Rule

| If p-value... | Decision | Interpretation |
| p < 0.01 | Strong rejection | Very unlikely to see this by chance if null is true |
| p < 0.05 | Reject null | Conventional threshold for "statistical significance" |
| p > 0.05 | Fail to reject | Insufficient evidence — doesn't prove null is true |

💡
**"Fail to reject" ≠ "Accept null":** A p-value of 0.15 doesn't mean β=0. It means you don't have enough evidence to confidently say β≠0. The true effect might be real but your sample is too small or noisy to detect it.

Section 05
## Confidence Intervals: More Informative Than P-Values

Confidence intervals convey more information than p-values alone. They show both statistical significance AND the range of plausible effect sizes — telling you not just "is there an effect?" but "how big could it be?"

95% Confidence Interval Formula
β ± 1.96 × SE(β)
Point estimate plus/minus ~2 standard errors
#### Confidence Interval Visualization

CI Excludes Zero → Significant
Zero
Lower β = 0.5 Upper
CI Includes Zero → Not Significant
Zero
Lower (negative) β = 0.3 Upper
### Why CIs Are More Useful Than P-Values

#### CI: β = 0.5 [0.1, 0.9]

Significant (excludes zero), but wide range. You're confident the effect is positive, but uncertain about magnitude. Could be small (0.1) or large (0.9).

#### CI: β = 0.5 [0.45, 0.55]

Significant AND precise. Narrow interval means you know both that the effect exists and approximately how big it is.

✓
**Best practice:** Always report confidence intervals, not just p-values. A reader can see at a glance whether the effect is significant (does CI include zero?) and how precise your estimate is (how wide is the CI?).

Section 06
## The Multiple Testing Problem

Multiple testing is the central statistical challenge in quantitative finance. It's why most backtested strategies fail live, and why the "factor zoo" is filled with spurious discoveries. Understanding it is essential for avoiding false positives.

### The Math Is Simple — and Devastating

At the 5% significance level, you expect 5% of true nulls to be falsely rejected by chance.

- Test **100 random variables** → expect **5 false positives**

- Test **1,000 random variables** → expect **50 false positives**

- If you only publish the significant ones, you're mostly publishing noise

### Solutions to Multiple Testing

🎯
#### Bonferroni Correction

Divide α by number of tests. Testing 100 factors? Use α = 0.05/100 = 0.0005. Very conservative — controls probability of *any* false positive, but may miss real effects.

📊
#### False Discovery Rate (FDR)

Control expected *proportion* of false positives among rejections. Less conservative than Bonferroni. If you claim 10 factors are significant, FDR ensures ~1 is false on average.

📈
#### Higher T-Stat Threshold

Harvey-Liu-Zhu approach: use |t| > 3 for factor discovery. Simple, practical, accounts for the reality that many factors have been tested before yours.

🔬
#### Out-of-Sample Validation

The ultimate test. Does your factor work on data it hasn't seen? This catches overfitting that survives all statistical corrections.

🚨
**The quantitative finance graveyard** is filled with factors that looked great in backtests but failed live. Multiple testing is the primary culprit. Every time you test another specification, tweak another parameter, or try another sample period, you're inflating false positive risk.

Section 07
## Practical Significance Testing in Finance

Statistical best practices in finance differ from textbook statistics. These practical guidelines reflect hard-won lessons from the field — where the stakes are real money and the data is messy.

🔧
#### Always Use Robust SEs

Classical SEs assume constant variance and independent errors — assumptions that virtually never hold in financial data. Newey-West should be your default.

💰
#### Economic Significance

Statistical significance isn't enough. A coefficient can be highly significant (t=10) but economically trivial (0.001% per month). Always ask: is this effect large enough to matter after costs?

📊
#### Use |t| > 3 for Factors

The Harvey-Liu-Zhu rule accounts for multiple testing in factor research. A t-stat of 2.5 is suspect; researchers have tried many things before publishing.

🧪
#### Out-of-Sample Validation

The ultimate test. Does significance hold in data the model hasn't seen? In-sample significance with out-of-sample failure = overfitting.

### A Practical Checklist

| Check | Question | Red Flag If... |
| **Robust SEs** | Did they use Newey-West or similar? | Classical SEs only — t-stats likely inflated |
| **T-stat magnitude** | Is |t| > 3? | T-stat between 2-3 with many tested specs |
| **Economic size** | Is the effect large enough to trade? | Significant but tiny effect size |
| **Out-of-sample** | Did they test on held-out data? | Only in-sample results reported |
| **Multiple testing** | How many things did they try? | Cherry-picked from many specifications |

**The key insight:** A single t > 2 result means little if you've tested hundreds of specifications. Statistical significance must be interpreted in context — how many tests were run? What prior probability would you assign to this effect existing? Does it replicate out-of-sample?

## Key Takeaways

1
**T-statistic = coefficient / standard error** — measures how many standard errors your estimate is from zero. It's a signal-to-noise ratio.
2
**P-value is P(data | null), not P(null | data)** — the probability of seeing this result IF β=0, not the probability that β=0.
3
**Confidence intervals are more informative than p-values** — they show both significance (does CI include zero?) and precision (how wide?).
4
**Multiple testing inflates false positives** — use |t| > 3 for factor discovery, or apply formal corrections like FDR.
5
**Always use robust standard errors in finance** — Newey-West handles both heteroskedasticity and autocorrelation common in financial data.
6
**Statistical significance ≠ economic significance** — a tiny effect can be highly significant with enough data. Always check if the magnitude matters.
Next Lesson

### Multiple Regression: Adding More Variables

How do you control for multiple factors simultaneously? We'll cover multiple regression mechanics, interpretation challenges, and the critical problem of multicollinearity.

Regression Analysis Course

Educational content only. Not financial advice.
