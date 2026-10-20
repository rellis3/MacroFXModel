<!-- https://cog000.github.io/Why-Volatility-Is-Predictable/ | Volatility Intelligence — Lesson 1: Why Volatility Is Predictable -->
Colez Trades
Quantitative & Macro Insights
C.OG
Volatility Intelligence
C.OG
Lesson 01
# Why Volatility Is Predictable

Returns are nearly impossible to forecast. Volatility is surprisingly predictable. This asymmetry is the foundation of practical risk management and position sizing.

Duration 35 minutes
Difficulty Foundational
Application Position Sizing, Risk Management
Section 01
## The Core Insight: Returns vs Volatility

Here's a truth that changes how you approach markets: **predicting tomorrow's return is nearly impossible, but predicting tomorrow's volatility is surprisingly achievable.** This isn't a small edge — it's the foundation of professional risk management.

📉
Return Forecasting
Tomorrow's direction?
~51%
Typical accuracy (barely better than coin flip)
vs
📊
Volatility Forecasting
Tomorrow's range?
~70%+
Directional accuracy of vol forecasts
💡
### The Practical Implication

You can't reliably know if tomorrow will be up or down. But you CAN reliably estimate *how much* the market is likely to move. This knowledge is directly actionable: position sizing, stop placement, target setting.

Section 02
## Volatility Clustering: The Pattern That Persists

**Large moves follow large moves. Small moves follow small moves.** This pattern — called volatility clustering — is one of the most robust findings in financial markets. It holds across asset classes, time periods, and market regimes.

#### Volatility Clustering in Action

Notice how high-volatility periods cluster together, as do low-volatility periods

← Earlier Time Later →
High Volatility
Normal Volatility
Low Volatility
🔥
#### High Vol Begets High Vol

After a 3% daily move, the next day is far more likely to see a large move than after a quiet 0.3% day. The market doesn't instantly calm down.

😴
#### Low Vol Begets Low Vol

Quiet periods tend to persist. A week of small ranges suggests next week will likely also be quiet — until something changes the regime.

⚡
#### Transitions Are Abrupt

Volatility regimes can shift suddenly — often on news or events. The shift from low to high vol is typically faster than high to low.

📊
**Why does clustering exist?** Several mechanisms: information arrives in bursts, fear and uncertainty are contagious, leverage and margin calls create cascades, and market participants adapt slowly to new volatility regimes.

Section 03
## Visualizing the Evidence

The persistence of volatility is visible in the data. These charts demonstrate how yesterday's volatility strongly predicts today's — a relationship you can exploit.

Yesterday's Range vs Today's Range
Positive Correlation If Random (No Pattern)
[CANVAS chart]
Each dot represents one day. The upward slope shows that high-range days tend to follow high-range days.

Autocorrelation: How Today Predicts Tomorrow
[CANVAS chart]
Returns (nearly zero autocorrelation)
Volatility (strong autocorrelation)
**What autocorrelation shows:** Returns have near-zero autocorrelation (today's return doesn't predict tomorrow's). But volatility has strong positive autocorrelation — today's volatility level strongly predicts tomorrow's.

This is the statistical foundation for everything that follows in this course.

Section 04
## The Persistence Principle

Volatility persistence isn't just a curiosity — it's the basis for actionable forecasting. The principle is simple: **the best forecast of tomorrow's volatility is a function of recent volatility**, with more weight on recent observations.

1
#### Observe

Measure recent volatility (ranges, ATR, standard deviation)

→
2
#### Weight

Recent observations matter more than older ones

→
3
#### Forecast

Project forward with appropriate confidence bands

→
4
#### Apply

Size positions, set stops, define targets

### Simple Models That Work

| Model | Formula Concept | Complexity | When to Use |
| **Yesterday's Vol** | Tomorrow ≈ Today | Simple | Quick estimate, stable regimes |
| **Simple Moving Average** | Average of last N days | Simple | Smoother estimate, less noise |
| **Exponential Smoothing** | Weighted avg (recent = more weight) | Medium | Balance of responsiveness and stability |
| **GARCH** | Econometric model with mean reversion | Complex | Research, formal risk models |

✓
**The good news:** Simple models often perform nearly as well as complex ones. A 10-day ATR (Average True Range) captures most of the predictable variation in volatility. You don't need GARCH to get practical value.

Section 05
## Test the Persistence Yourself

Enter recent daily ranges from your market to see volatility persistence in action. This calculator shows how yesterday's volatility forecasts tomorrow's expected range.

Interactive Volatility Persistence Calculator
Enter the daily ranges (High - Low) for the last 5 days. The calculator will show how recent volatility predicts tomorrow's expected range.

#### Enter Recent Daily Ranges

Last 5 Daily Ranges (newest first)
Calculate Forecast
Tomorrow's Expected Range
—
Forecasted daily range
#### How This Works

The forecast uses exponential weighting: recent days get more weight than older days. This captures the persistence effect — if recent days were volatile, expect volatility to continue.

Section 06
## Framework: Test This on Your Data

Don't take our word for it — verify volatility persistence on the instruments you trade. Here's exactly what data you need and how to test the relationship.

### Data Requirements

#### 📊 Minimum Data

30-60 days of daily OHLC (Open, High, Low, Close) prices

#### 📈 Better Data

1-2 years of daily data to test across different regimes

#### 🌐 Sources

TradingView, Yahoo Finance, your broker platform, Bloomberg

#### 📋 Format

Date, Open, High, Low, Close — CSV or spreadsheet

### Step-by-Step Testing Framework

# Framework: Testing Volatility Persistence # Step 1: Calculate daily ranges daily_range = High - Low # Or use True Range: max(High-Low, |High-PrevClose|, |Low-PrevClose|) # Step 2: Create lagged series yesterday_range = daily_range.shift(1) today_range = daily_range # Step 3: Calculate correlation correlation = corr(yesterday_range, today_range) # Expect: 0.3 to 0.7 for most markets # Step 4: Test forecast accuracy forecast = yesterday_range error = abs(today_range - forecast) / today_range mean_error = average(error) # Lower is better — compare to naive forecast (long-term average)
### What to Look For

| Metric | What It Tells You | Typical Values |
| **Correlation (lag-1)** | How strongly today predicts tomorrow | 0.3 – 0.7 (varies by asset) |
| **Mean Absolute Error** | Average forecast miss | 20-40% of actual range |
| **Directional Accuracy** | % of time high-vol follows high-vol | 60-75% |
| **Autocorrelation decay** | How quickly persistence fades | Significant for 5-20 days |

⚠️
**Important:** Persistence strength varies by asset. FX majors often show strong persistence. Individual stocks vary more. Futures during active trading show different patterns than overnight. Test on YOUR instruments before relying on these forecasts.

Section 07
## Why This Matters for Trading

Volatility forecasting isn't academic — it directly improves your trading decisions. Here's how predictable volatility translates into practical edge.

📐
#### Position Sizing

Size positions inversely to expected volatility. Higher expected vol = smaller position. This keeps your risk exposure consistent regardless of market conditions.

🎯
#### Stop Placement

Set stops based on expected range, not fixed pips/points. ATR-based stops breathe with the market — tight in quiet periods, wider in volatile ones.

🏁
#### Target Setting

Know the expected daily range to set realistic profit targets. If the expected range is 80 pips, a 200-pip target on a day trade is unrealistic.

⚠️
#### Risk Warnings

High volatility regimes require different behavior: reduce size, widen stops, expect the unexpected. Vol forecasts provide early warning.

🎯
### The Practical Payoff

A trader using volatility-adjusted position sizing and stops will have more consistent P&L volatility — fewer blow-up days, more predictable drawdowns, and better risk-adjusted returns over time. This is how professionals approach risk.

## Key Takeaways

1
**Volatility is predictable, returns are not.** This asymmetry is the foundation of practical risk management. Don't waste energy predicting direction — focus on predicting range.
2
**Volatility clusters.** High vol follows high vol, low follows low. This persistence is robust across markets and time periods — it's the basis for forecasting.
3
**Simple models work well.** You don't need complex econometrics. A 10-day ATR or exponential smoothing captures most of the predictable variation.
4
**Test on your instruments.** Persistence strength varies. Verify the relationship exists in the markets you actually trade before relying on forecasts.
5
**Direct trading applications:** Position sizing, stop placement, target setting, and risk warnings all benefit from volatility forecasts.
6
**This is how professionals manage risk.** Volatility-adjusted sizing leads to more consistent P&L and better risk-adjusted returns over time.
Next Lesson

### Daily Volatility Forecasting

Build practical forecasting models: ATR methods, exponential smoothing, and how to calibrate forecasts to your specific market. Plus interactive calculators for daily use.

Volatility Intelligence Course

Educational content only. Not financial advice. Test all concepts on your own data.
