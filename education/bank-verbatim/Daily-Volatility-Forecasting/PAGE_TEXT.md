<!-- https://cog000.github.io/Daily-Volatility-Forecasting/ | Volatility Intelligence — Lesson 2: Daily Volatility Forecasting -->
Colez Trades
Quantitative & Macro Insights
C.OG
Volatility Intelligence
C.OG
Lesson 02
# Daily Volatility Forecasting

Build practical forecasting models that predict tomorrow's expected range. From simple ATR to exponential smoothing — methods you can implement today and calibrate to your specific markets.

Duration45 minutes
DifficultyPractical
FocusForecasting Methods
Section 01
## Measuring Volatility: The Building Blocks

Before you can forecast volatility, you need to measure it. There are several ways to quantify "how much a market moves" — each with tradeoffs. Understanding these building blocks is essential for building effective forecasts.

📏
#### Simple Range

**High − Low** The simplest measure. How much did price move within the day? Easy to calculate, but misses gaps.

📐
#### True Range

**Accounts for gaps** Maximum of: High−Low, |High−PrevClose|, |Low−PrevClose|. Captures overnight moves.

📊
#### Standard Deviation

**Statistical measure** Classic volatility metric based on return dispersion. More sensitive to outliers.

True Range Formula
TR = max(High − Low, |High − Close₋₁|, |Low − Close₋₁|)
True Range captures the full daily movement including any gaps from the previous close
**Why True Range matters for traders:** If yesterday's close was 100, and today opens at 105 with a high of 106 and low of 103, the simple range is only 3 (106-103). But the True Range is 6 (106-100) — capturing the gap that affected your overnight positions.

### Which Measure to Use?

| Measure | Best For | Limitation | Typical Use |
| **Simple Range** | Intraday analysis | Misses gaps | Session-based targets |
| **True Range** | Swing trading, sizing | Slightly more complex | ATR calculations, stops |
| **Standard Deviation** | Options, VaR models | Sensitive to outliers | Statistical models |
| **Parkinson** | Research, efficiency | Assumes no jumps | Academic studies |

Section 02
## Three Forecasting Methods

Once you can measure volatility, you need to forecast it. Here are three methods that work — ranging from dead simple to moderately sophisticated. The good news: simple often beats complex.

📊
#### Simple Moving Average

Average of last N days
ATR = Σ(TR) / N
##### Pros

- Dead simple to calculate

- Easy to understand

- Stable estimates

##### Cons

- Slow to react to changes

- Old data weighted equally

⚡
#### Exponential Moving Average

Recent days weighted more
EMA = α × TR + (1-α) × EMA₋₁
##### Pros

- Reacts faster to changes

- Recent data matters more

- Good balance

##### Cons

- Need to choose α

🎯
#### Wilder's Smoothing

Classic ATR method
ATR = (ATR₋₁ × (N-1) + TR) / N
##### Pros

- Industry standard

- Built into platforms

- Well-tested

##### Cons

- Equivalent to EMA

- Not necessarily optimal

✓
**Our recommendation: Exponential Moving Average (EMA)** with a 10-20 day effective period. It captures the persistence effect better than simple averages while remaining easy to implement.

### Understanding the α Parameter

| α Value | Equivalent Period | Behavior | Best For |
| **0.10** | ~19 days | Slow, smooth | Position trading, stable markets |
| **0.15** | ~12 days | Balanced | General purpose (recommended) |
| **0.20** | ~9 days | Responsive | Swing trading, volatile markets |
| **0.30** | ~6 days | Very reactive | Short-term, regime changes |

Converting Between α and Period
α = 2 / (N + 1) ⟷ N = (2 / α) − 1
N is the equivalent simple moving average period
Section 03
## Calibrating to Your Market

Default parameters work reasonably well, but calibrating to your specific market improves accuracy. Different instruments have different volatility characteristics.

1
#### Gather Historical Data

Collect at least 60-120 days of daily OHLC data. More gives more reliable calibration, but too much may include stale regime information.

2
#### Calculate True Ranges

Compute True Range for each day. This is your measure of realized volatility that you'll try to forecast.

3
#### Test Different α Values

For each α from 0.05 to 0.40, calculate EMA forecasts and measure MAE (Mean Absolute Error). The α with lowest MAE is optimal.

4
#### Validate Out-of-Sample

Test your calibrated α on data not used for calibration. If performance degrades significantly, your optimal α may be overfit.

# Calibration Framework: Finding Optimal α def find_optimal_alpha(true_ranges, alpha_range=(0.05, 0.40)): best_alpha = 0.15 best_mae = float('inf') for alpha in np.arange(*alpha_range, 0.01): ema = true_ranges[0] forecasts = [] for i in range(1, len(true_ranges)): forecasts.append(ema) ema = alpha * true_ranges[i] + (1 - alpha) * ema mae = np.mean(np.abs(true_ranges[1:] - forecasts)) if mae < best_mae: best_mae, best_alpha = mae, alpha return best_alpha, best_mae
⚠️
**Don't over-calibrate.** The optimal α on historical data may not be optimal going forward. If your calibrated α is very different from typical values (0.10-0.20), be skeptical.

Section 04
## Typical Volatility by Market

Different markets have different volatility characteristics. Understanding typical ranges helps you calibrate expectations and spot unusual conditions.

| Market | Typical Daily Range | High Vol | Low Vol |
| **EUR/USD** | 50-80 pips | > 120 pips | < 40 pips |
| **GBP/USD** | 70-110 pips | > 150 pips | < 50 pips |
| **USD/JPY** | 50-90 pips | > 130 pips | < 40 pips |
| **S&P 500 (ES)** | 30-60 points | > 80 points | < 25 points |
| **Crude Oil (CL)** | $1.50-$3.00 | > $4.00 | < $1.00 |
| **Gold (GC)** | $15-$30 | > $45 | < $12 |

**Use these as sanity checks, not gospel.** Market conditions change. What was "high volatility" in 2019 might be "normal" in 2024. Always compare forecasts to recent realized volatility.

Section 05
## Visualizing Forecasts

A good forecast includes uncertainty. Instead of a single number, think in terms of ranges and probabilities.

Forecast vs Actual (Simulated Example)
[CANVAS chart]
📊
#### Point Forecast

Your EMA gives the central estimate — the most likely value. But actual volatility will rarely equal the forecast exactly.

📐
#### Confidence Band

Based on historical forecast errors, construct a range. "68% of the time, actual will be within ±25% of forecast."

⚠️
#### Outliers Happen

Even a good forecast will occasionally be very wrong — especially when regimes shift. Plan for this possibility.

Section 06
## Daily Workflow

Here's how to integrate volatility forecasting into your daily trading preparation — a 2-minute check that informs all your sizing and target decisions.

1
#### Update Your Data

Add yesterday's True Range. Calculate new EMA: EMA_new = α × TR_yesterday + (1−α) × EMA_old

2
#### Note the Forecast

Your new EMA is today's forecast. Write it down. "Expected range today: 72 pips"

3
#### Compare to Yesterday

Is the forecast rising or falling? Rising = vol expanding. Falling = conditions calmer.

4
#### Apply to Trading

Use forecast for position sizing, stop placement, and target setting. If forecast is 72 pips, a 150-pip target is ambitious.

💡
**End-of-day review:** Compare actual range to forecast. Large misses may indicate regime change. Keep a log: Date, Forecast, Actual, Notes.

### 🚀 Where This Leads: Advanced Quantitative Methods

The EMA-based forecasting you've learned here is the foundation. Professionals build on these concepts with more sophisticated techniques. As you progress, you may explore:

#### GARCH Models

Generalized Autoregressive Conditional Heteroskedasticity — models volatility clustering formally

#### VECM

Vector Error Correction Models — captures long-run equilibrium relationships

#### Kalman Filters

State-space models for real-time estimation with noisy observations

#### Stochastic Volatility

Heston, SABR — vol as a random process for derivatives pricing

#### Realized Volatility

High-frequency estimation using intraday tick data

#### HAR Models

Heterogeneous Autoregressive — combines daily, weekly, monthly vol

#### Regime-Switching

Markov models that capture distinct high/low volatility states

#### ML Approaches

Neural networks, gradient boosting for non-linear vol patterns

**The principle remains the same:** volatility is persistent and predictable. These advanced methods are more sophisticated ways of exploiting the same fundamental property. Master the basics first — they often perform surprisingly close to the complex approaches, with far less risk of overfitting.

## Key Takeaways

1
**True Range captures gaps** — use it instead of simple range for overnight and swing positions.
2
**Exponential smoothing is the sweet spot** — balances stability and responsiveness. Start with α = 0.15.
3
**Calibrate to your market** — test different α values, measure MAE, but don't over-optimize.
4
**Think in ranges, not points** — build confidence bands around forecasts.
5
**Make it a daily habit** — 2 minutes each morning anchors expectations and informs trading decisions.
6
**This is the foundation** — advanced methods (GARCH, Kalman, etc.) build on these same persistence principles.
Next Lesson

### Weekly Regimes & Multi-Day Structure

Zoom out to weekly volatility patterns. Learn to classify high/normal/low regimes and how the current regime affects strategy selection and position sizing.

Volatility Intelligence Course

Educational content only. Not financial advice.
