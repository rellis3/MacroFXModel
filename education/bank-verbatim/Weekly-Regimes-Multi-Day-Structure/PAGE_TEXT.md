<!-- https://cog000.github.io/Weekly-Regimes-Multi-Day-Structure/ | Volatility Intelligence — Lesson 3: Weekly Regimes & Multi-Day Structure -->
Colez Trades
Quantitative & Macro Insights
C.OG
Volatility Intelligence
C.OG
Lesson 03
# Weekly Regimes & Multi-Day Structure

Zoom out from daily forecasts to understand the bigger picture. Volatility regimes persist for weeks or months — knowing which regime you're in changes everything about how you trade.

Duration40 minutes
DifficultyIntermediate
FocusRegime Classification
Section 01
## The Three Volatility Regimes

Markets don't just have "volatility" — they cycle through distinct regimes. Each regime has different characteristics and requires different trading approaches. Recognizing which regime you're in is one of the highest-value skills in trading.

🔥
### High Volatility

Crisis mode. Large moves, gaps, unpredictable direction. Fear dominates.

Typical DurationDays to weeks
Daily Range1.5-3x normal
GapsFrequent
ReversalsCommon
⚖️
### Normal Volatility

Business as usual. Ranges are predictable. Trends develop and follow through.

Typical DurationWeeks to months
Daily RangeNear average
GapsOccasional
ReversalsNormal
😴
### Low Volatility

Quiet markets. Small ranges, slow grinding moves. Complacency builds.

Typical DurationWeeks to months
Daily Range0.5-0.7x normal
GapsRare
ReversalsSlow to develop
**Regime asymmetry:** Low volatility regimes tend to be longer and more stable. High volatility regimes are shorter but more intense. The transition from low to high is often sudden (a shock), while the transition from high to low is usually gradual (fear fades slowly).

Section 02
## Classifying the Current Regime

The simplest approach: compare current volatility to its historical distribution. Where does today's ATR sit relative to the last 6-12 months? This percentile rank tells you the regime.

📊 Percentile-Based Classification
Calculate where current volatility ranks against recent history. Simple, robust, and easy to interpret.

0th 25th 50th 75th 100th
LOW 0-25th percentile
NORMAL 25-75th percentile
HIGH 75-100th percentile
### Framework: Building a Regime Classifier

1
#### Calculate Historical ATRs

Compute the 10 or 14-day ATR for each day over the past 6-12 months. This is your reference distribution.

2
#### Calculate Current ATR

Get today's ATR using the same calculation. This is the value you want to classify.

3
#### Find the Percentile

What percentage of historical ATRs are below current? If 80% are below, you're in the 80th percentile.

4
#### Assign the Regime

Below 25th = Low Vol. 25th-75th = Normal. Above 75th = High Vol. Adjust thresholds based on your market.

# Regime Classification Framework def classify_regime(current_atr, historical_atrs): # Calculate percentile rank percentile = (historical_atrs < current_atr).sum() / len(historical_atrs) * 100 # Classify based on thresholds if percentile < 25: return "LOW", percentile elif percentile > 75: return "HIGH", percentile else: return "NORMAL", percentile # Data needed: 6-12 months of daily ATR values # Note for beginners: TradingView has built-in ATR indicators and # community scripts for regime detection — no coding required.
💡
**Rolling window matters.** Use 6-12 months of history — long enough to capture different regimes, short enough to reflect current market structure. Too much history includes conditions that may no longer be relevant.

Section 03
## Week-over-Week Forecasting

Just as yesterday's volatility predicts today's, last week's volatility predicts next week's. Weekly forecasts smooth out daily noise and are useful for position trading and swing trades held multiple days.

Last Week's Range
245
pips (realized)
→
This Week's Forecast
~250
pips (expected)
### Weekly Forecasting Framework

| Method | Formula | When to Use |
| **Last Week** | Forecast = Last week's range | Quick estimate, stable conditions |
| **4-Week Average** | Forecast = Avg of last 4 weeks | Smoother, less reactive |
| **EMA (Weekly)** | Forecast = α × Last + (1-α) × Prev EMA | Balanced approach (recommended) |
| **Sum of Daily ATRs** | Forecast = Daily ATR × 5 | Bridge from daily to weekly |

**Weekly vol ≠ Daily vol × 5.** Due to mean reversion within the week and overlapping ranges, weekly range is typically 2-3x daily range, not 5x. Don't simply multiply your daily ATR by 5 — measure actual weekly ranges to calibrate.

Section 04
## Trading Implications by Regime

Knowing your regime isn't academic — it directly affects every trading decision. Here's how to adapt your approach based on the current volatility environment.

😴
#### Low Volatility

Below 25th percentile
Position Size Can increase size Smaller ranges = less $ at risk per unit
Stop Distance Tighter — 0.75x ATR Less noise to filter out
Profit Targets Smaller, scale out early Limited range means limited opportunity
Trade Duration Can hold longer Less adverse movement risk
Strategy Type Mean reversion works Range-bound conditions favor fading
Overnight Risk Lower Gaps are smaller and rarer
⚖️
#### Normal Volatility

25th - 75th percentile
Position Size Standard sizing Your baseline approach
Stop Distance Standard — 1x ATR Normal breathing room
Profit Targets Standard R:R ratios 1:2, 1:3 achievable
Trade Duration Normal holding periods Let winners run
Strategy Type Trend following shines Trends develop and follow through
Overnight Risk Normal Standard gap expectations
🔥
#### High Volatility

Above 75th percentile
Position Size Reduce 30-50% Larger moves = more $ at risk
Stop Distance Wider — 1.5-2x ATR More noise, avoid whipsaws
Profit Targets Larger, take partials Big moves happen — capture them
Trade Duration Shorter, take profits quick Reversals come fast
Strategy Type Momentum, breakouts Big moves, continuation patterns
Overnight Risk Much higher — reduce Large gaps, news sensitivity
⚠️
**The most dangerous transition: Low → High.** After extended low volatility, traders become complacent. Positions are sized for small ranges. When volatility explodes, stops may experience significant slippage and losses can accumulate rapidly. Always be prepared for regime change.

Section 05
## Visualizing Regime Transitions

Regimes don't change instantly — they transition. Learning to spot these transitions early gives you an edge. Watch for volatility breaking out of established ranges.

Volatility Regimes Over Time (Simulated)
[CANVAS chart]
### Transition Warning Signs

| Transition | Warning Signs | What to Do |
| **Low → High** | Sudden spike in daily range (>2x average), news shock, gap opens, VIX spike | Immediately reduce size, widen stops, close marginal positions |
| **High → Normal** | Ranges contracting over several days, gaps decreasing, calmer price action | Gradually normalize positioning, tighten stops cautiously |
| **Normal → Low** | Ranges compressing, multi-day consolidation, decreasing ATR trend | Consider mean reversion setups, prepare for eventual breakout |
| **Low → Normal** | Gradual range expansion, breakout from consolidation, trend development | Normal approach, watch for trend following opportunities |

Section 06
## Data Requirements & Framework

To implement regime classification, you need historical data and a systematic approach. Here's exactly what you need and how to structure your analysis.

📊
#### Data Needed

**Minimum:** 6 months of daily OHLC **Better:** 12 months of daily OHLC **For weekly:** Calculate weekly high/low from daily

⚙️
#### Calculations

**Daily ATR:** 10 or 14 period **Weekly range:** Week high - Week low **Percentile:** Rank vs history

📅
#### Update Frequency

**Regime check:** Weekly (or after big moves) **ATR update:** Daily **Threshold review:** Monthly

# Weekly Regime Check Framework def weekly_regime_check(daily_data, lookback_months=6): # Calculate ATR for each day daily_data['ATR'] = calculate_atr(daily_data, period=14) # Get current ATR and historical distribution current_atr = daily_data['ATR'].iloc[-1] lookback_days = lookback_months * 21 # ~21 trading days/month historical_atrs = daily_data['ATR'].iloc[-lookback_days:-1] # Calculate percentile and classify regime, percentile = classify_regime(current_atr, historical_atrs) return { 'regime': regime, 'percentile': percentile, 'current_atr': current_atr, 'median_atr': historical_atrs.median() 'median_atr': historical_atrs.median()nbsp;'median_atr': historical_atrs.median()nbsp;'median_atr': historical_atrs.median()nbsp;'median_atr': historical_atrs.median()nbsp;} # Note for beginners: TradingView's built-in ATR indicator and # percentile scripts can achieve similar results without coding. # Search "ATR percentile" or "volatility regime" in TV indicators. }
## Key Takeaways

1
**Three regimes exist:** High, Normal, and Low volatility. Each requires fundamentally different trading approaches.
2
**Percentile ranking is simple and effective.** Compare current ATR to 6-12 months of history. Below 25th = Low, above 75th = High.
3
**Weekly volatility persists like daily.** Last week's range predicts this week's. Use for swing trade planning.
4
**Adapt everything to the regime:** Position size, stops, targets, hold time, and strategy type all change.
5
**Low → High transitions require caution.** Complacency from quiet markets can lead to oversized positions when volatility expands.
6
**Check regime weekly.** Daily fluctuations are noise — regime is a bigger-picture concept. Update after major moves.
Next Lesson

### Session Structure — Asia Range as Daily Anchor

Zoom into intraday structure. Learn how the Asia session range predicts London and New York expansion, and how to use session analysis for day trading.

Volatility Intelligence Course

Educational content only. Not financial advice.
