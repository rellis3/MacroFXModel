# Volatility Intelligence — Course Notes (Lessons 1–5)

Source: Colez Trades, "Volatility Intelligence" course (Quantitative & Macro
Insights). Raw study notes taken from the lesson material — key facts,
formulas, tables and takeaways as taught, plus threads to investigate later.

**Course thesis:** Volatility clusters, mean-reverts, and follows identifiable
regimes. Forecast daily ranges before the open, classify regimes that dictate
which strategies are viable, and size positions so risk stays consistent.

---

## Lesson 1 — Why Volatility Is Predictable

*35 min · Foundational · Application: position sizing, risk management*

### 1.1 The core insight: returns vs volatility

- Predicting tomorrow's **return/direction** is nearly impossible: typical
  accuracy ≈ **51%** — barely better than a coin flip.
- Predicting tomorrow's **volatility/range** is surprisingly achievable:
  directional accuracy of vol forecasts ≈ **70%+**.
- This asymmetry is the foundation of practical risk management and position
  sizing.
- Practical implication: you can't reliably know if tomorrow is up or down,
  but you CAN reliably estimate how much the market is likely to move — and
  that is directly actionable (position sizing, stop placement, target
  setting).

### 1.2 Volatility clustering

- **Large moves follow large moves; small moves follow small moves.** One of
  the most robust findings in financial markets — holds across asset classes,
  time periods and regimes.
- High vol begets high vol: after a 3% daily move, the next day is far more
  likely to see a large move than after a quiet 0.3% day. The market doesn't
  instantly calm down.
- Low vol begets low vol: quiet periods persist. A week of small ranges
  suggests next week will likely also be quiet — until something changes the
  regime.
- **Transitions are abrupt** — regimes can shift suddenly, often on
  news/events. The shift low→high is typically faster than high→low.
- Why clustering exists (mechanisms):
  1. Information arrives in bursts.
  2. Fear and uncertainty are contagious.
  3. Leverage and margin calls create cascades.
  4. Market participants adapt slowly to new volatility regimes.

### 1.3 The evidence (visualized)

- Scatter of yesterday's range vs today's range: clear positive correlation
  (upward slope) — high-range days tend to follow high-range days. A random
  market would show no pattern.
- **Autocorrelation:** returns have near-zero autocorrelation (today's return
  doesn't predict tomorrow's); volatility has strong positive autocorrelation
  (today's vol level strongly predicts tomorrow's). This is the statistical
  foundation for the whole course.

### 1.4 The persistence principle

The best forecast of tomorrow's volatility is a function of recent
volatility, with more weight on recent observations.

Four-step loop:
1. **Observe** — measure recent volatility (ranges, ATR, standard deviation).
2. **Weight** — recent observations matter more than older ones.
3. **Forecast** — project forward with appropriate confidence bands.
4. **Apply** — size positions, set stops, define targets.

Simple models that work:

| Model | Formula concept | Complexity | When to use |
|---|---|---|---|
| Yesterday's vol | Tomorrow ≈ Today | Simple | Quick estimate, stable regimes |
| Simple moving average | Average of last N days | Simple | Smoother estimate, less noise |
| Exponential smoothing | Weighted avg (recent = more weight) | Medium | Balance of responsiveness and stability |
| GARCH | Econometric model with mean reversion | Complex | Research, formal risk models |

- Good news: **simple models often perform nearly as well as complex ones.**
  A 10-day ATR captures most of the predictable variation in volatility. You
  don't need GARCH to get practical value.

### 1.5 Persistence calculator (interactive tool)

- Input: last 5 daily ranges (High − Low), newest first.
- Output: tomorrow's expected range.
- Method: exponential weighting — recent days get more weight than older
  days, capturing the persistence effect.

### 1.6 Framework: test persistence on your own data

Data requirements:
- **Minimum:** 30–60 days of daily OHLC.
- **Better:** 1–2 years of daily data to cover different regimes.
- **Sources:** TradingView, Yahoo Finance, broker platform, Bloomberg.
- **Format:** Date, Open, High, Low, Close — CSV or spreadsheet.

Testing steps:

```
# Step 1: daily ranges
daily_range = High - Low
# or True Range: max(High-Low, |High-PrevClose|, |Low-PrevClose|)

# Step 2: lagged series
yesterday_range = daily_range.shift(1)

# Step 3: correlation
correlation = corr(yesterday_range, today_range)   # expect 0.3–0.7

# Step 4: forecast accuracy
forecast = yesterday_range
error = abs(today_range - forecast) / today_range
mean_error = average(error)   # compare to naive forecast (long-term average)
```

What to look for:

| Metric | What it tells you | Typical values |
|---|---|---|
| Correlation (lag-1) | How strongly today predicts tomorrow | 0.3–0.7 (varies by asset) |
| Mean absolute error | Average forecast miss | 20–40% of actual range |
| Directional accuracy | % of time high-vol follows high-vol | 60–75% |
| Autocorrelation decay | How quickly persistence fades | Significant for 5–20 days |

- ⚠️ **Persistence strength varies by asset.** FX majors often show strong
  persistence; individual stocks vary more; futures behave differently in
  active vs overnight sessions. Test on YOUR instruments before relying on
  these forecasts.

### 1.7 Why this matters for trading

- **Position sizing** — size inversely to expected vol: higher expected vol =
  smaller position, keeping risk exposure consistent across conditions.
- **Stop placement** — stops based on expected range, not fixed pips.
  ATR-based stops breathe with the market: tight in quiet periods, wider in
  volatile ones.
- **Target setting** — know the expected daily range to set realistic
  targets. If the expected range is 80 pips, a 200-pip day-trade target is
  unrealistic.
- **Risk warnings** — high-vol regimes require different behavior: reduce
  size, widen stops, expect the unexpected. Vol forecasts provide early
  warning.
- Payoff: vol-adjusted sizing and stops → more consistent P&L volatility,
  fewer blow-up days, more predictable drawdowns, better risk-adjusted
  returns. This is how professionals approach risk.

### Lesson 1 key takeaways

1. Volatility is predictable, returns are not — don't waste energy predicting
   direction; focus on predicting range.
2. Volatility clusters: high follows high, low follows low — robust across
   markets and time.
3. Simple models work well — a 10-day ATR or exponential smoothing captures
   most of the predictable variation.
4. Test on your instruments — persistence strength varies.
5. Direct applications: position sizing, stops, targets, risk warnings.
6. This is how professionals manage risk.

---

## Lesson 2 — Daily Volatility Forecasting

*45 min · Practical · Focus: forecasting methods*

### 2.1 Measuring volatility: the building blocks

- **Simple range** = High − Low. Simplest measure; easy; misses gaps.
- **True Range** — accounts for gaps:

  ```
  TR = max(High − Low, |High − Close₋₁|, |Low − Close₋₁|)
  ```

  Worked example: yesterday's close 100; today opens 105, high 106, low 103.
  Simple range = 3 (106−103), but True Range = **6** (106−100) — capturing
  the gap that affected overnight positions.
- **Standard deviation** — classic statistical vol metric on return
  dispersion; more sensitive to outliers.

Which measure to use:

| Measure | Best for | Limitation | Typical use |
|---|---|---|---|
| Simple range | Intraday analysis | Misses gaps | Session-based targets |
| True Range | Swing trading, sizing | Slightly more complex | ATR calculations, stops |
| Standard deviation | Options, VaR models | Sensitive to outliers | Statistical models |
| Parkinson | Research, efficiency | Assumes no jumps | Academic studies |

### 2.2 Three forecasting methods

1. **Simple Moving Average** — `ATR = Σ(TR) / N`.
   Pros: dead simple, easy to understand, stable. Cons: slow to react, old
   data weighted equally.
2. **Exponential Moving Average** — `EMA = α × TR + (1−α) × EMA₋₁`.
   Pros: reacts faster, recent data matters more, good balance. Cons: need
   to choose α.
3. **Wilder's Smoothing** (classic ATR) — `ATR = (ATR₋₁ × (N−1) + TR) / N`.
   Pros: industry standard, built into platforms, well-tested. Cons:
   equivalent to an EMA; not necessarily optimal.

✓ **Course recommendation: EMA with a 10–20 day effective period** — captures
persistence better than simple averages, still easy to implement.

Understanding α:

| α | Equivalent period | Behavior | Best for |
|---|---|---|---|
| 0.10 | ~19 days | Slow, smooth | Position trading, stable markets |
| 0.15 | ~12 days | Balanced | **General purpose (recommended)** |
| 0.20 | ~9 days | Responsive | Swing trading, volatile markets |
| 0.30 | ~6 days | Very reactive | Short-term, regime changes |

Conversion: `α = 2 / (N + 1)` ⟷ `N = (2 / α) − 1`.

### 2.3 Calibrating to your market

1. **Gather data** — 60–120+ days of daily OHLC. More = more reliable, but
   too much may include stale regime information.
2. **Calculate True Ranges** — the realized-vol series you'll forecast.
3. **Test α values** — for each α from 0.05 to 0.40, compute EMA forecasts
   and measure MAE; lowest MAE = optimal α.
4. **Validate out-of-sample** — test the calibrated α on unused data; if
   performance degrades a lot, the α is overfit.

```
def find_optimal_alpha(true_ranges, alpha_range=(0.05, 0.40)):
    best_alpha, best_mae = 0.15, inf
    for alpha in arange(*alpha_range, 0.01):
        ema = true_ranges[0]; forecasts = []
        for i in 1..len(true_ranges)-1:
            forecasts.append(ema)
            ema = alpha * true_ranges[i] + (1 - alpha) * ema
        mae = mean(abs(true_ranges[1:] - forecasts))
        if mae < best_mae: best_mae, best_alpha = mae, alpha
    return best_alpha, best_mae
```

- ⚠️ **Don't over-calibrate.** The optimal α on historical data may not be
  optimal going forward. If your calibrated α is very different from typical
  values (0.10–0.20), be skeptical.

### 2.4 Typical volatility by market (sanity-check reference)

| Market | Typical daily range | High vol | Low vol |
|---|---|---|---|
| EUR/USD | 50–80 pips | > 120 pips | < 40 pips |
| GBP/USD | 70–110 pips | > 150 pips | < 50 pips |
| USD/JPY | 50–90 pips | > 130 pips | < 40 pips |
| S&P 500 (ES) | 30–60 points | > 80 points | < 25 points |
| Crude Oil (CL) | $1.50–$3.00 | > $4.00 | < $1.00 |
| Gold (GC) | $15–$30 | > $45 | < $12 |

- Use as sanity checks, not gospel — conditions change; "high vol" in 2019
  might be "normal" in 2024. Always compare forecasts to recent realized vol.

### 2.5 Visualizing forecasts — think in ranges, not points

- **Point forecast** — the EMA gives the central estimate; actual vol will
  rarely equal it exactly.
- **Confidence band** — from historical forecast errors, e.g. "68% of the
  time, actual will be within ±25% of forecast."
- **Outliers happen** — even good forecasts are occasionally very wrong,
  especially at regime shifts. Plan for it.

### 2.6 Daily workflow (~2 minutes each morning)

1. **Update data** — add yesterday's TR; compute
   `EMA_new = α × TR_yesterday + (1−α) × EMA_old`.
2. **Note the forecast** — write it down: "Expected range today: 72 pips."
3. **Compare to yesterday** — rising forecast = vol expanding; falling =
   calmer conditions.
4. **Apply** — use it for sizing, stops, targets. If the forecast is 72
   pips, a 150-pip target is ambitious.
5. **End-of-day review** — compare actual vs forecast; large misses may
   indicate regime change. Keep a log: Date, Forecast, Actual, Notes.

### 2.7 Where this leads: advanced quantitative methods

The EMA approach is the foundation; professionals build on the same
persistence property with:

- **GARCH** — models volatility clustering formally (Generalized
  Autoregressive Conditional Heteroskedasticity).
- **VECM** — Vector Error Correction Models; long-run equilibrium
  relationships.
- **Kalman filters** — state-space models for real-time estimation with
  noisy observations.
- **Stochastic volatility** — Heston, SABR; vol as a random process for
  derivatives pricing.
- **Realized volatility** — high-frequency estimation from intraday ticks.
- **HAR models** — Heterogeneous Autoregressive; combines daily, weekly,
  monthly vol.
- **Regime-switching** — Markov models capturing distinct high/low vol
  states.
- **ML approaches** — neural nets, gradient boosting for non-linear
  patterns.

The principle stays the same: volatility is persistent and predictable —
these are more sophisticated exploitations of the same property. Master the
basics first; they perform surprisingly close to complex approaches with far
less overfitting risk.

### Lesson 2 key takeaways

1. True Range captures gaps — use it instead of simple range for overnight
   and swing positions.
2. Exponential smoothing is the sweet spot — start with α = 0.15.
3. Calibrate to your market — test α values, measure MAE, don't
   over-optimize.
4. Think in ranges, not points — build confidence bands around forecasts.
5. Make it a daily habit — 2 minutes each morning anchors expectations.
6. Advanced methods (GARCH, Kalman, …) build on the same persistence
   principles.

---

## Lesson 3 — Weekly Regimes & Multi-Day Structure

*40 min · Intermediate · Focus: regime classification*

### 3.1 The three volatility regimes

| | 🔥 High | ⚖️ Normal | 😴 Low |
|---|---|---|---|
| Character | Crisis mode; large moves, gaps, unpredictable direction; fear dominates | Business as usual; predictable ranges; trends develop and follow through | Quiet; small ranges; slow grinding moves; complacency builds |
| Typical duration | Days to weeks | Weeks to months | Weeks to months |
| Daily range | 1.5–3× normal | Near average | 0.5–0.7× normal |
| Gaps | Frequent | Occasional | Rare |
| Reversals | Common | Normal | Slow to develop |

- **Regime asymmetry:** low-vol regimes are longer and more stable; high-vol
  regimes shorter but more intense. Low→high transition is often sudden (a
  shock); high→low is usually gradual (fear fades slowly).

### 3.2 Classifying the current regime — percentile method

Compare current volatility to its own historical distribution: where does
today's ATR sit vs the last 6–12 months?

- **0–25th percentile = LOW**
- **25th–75th = NORMAL**
- **75th–100th = HIGH**

Steps:
1. Compute 10- or 14-day ATR for each day over the past 6–12 months (the
   reference distribution).
2. Compute today's ATR the same way.
3. Percentile rank = % of historical ATRs below current.
4. Assign regime by thresholds; adjust thresholds to your market.

```
def classify_regime(current_atr, historical_atrs):
    percentile = (historical_atrs < current_atr).sum() / len(historical_atrs) * 100
    if percentile < 25:  return "LOW", percentile
    if percentile > 75:  return "HIGH", percentile
    return "NORMAL", percentile
```

- 💡 **Rolling window matters:** 6–12 months — long enough to capture
  different regimes, short enough to reflect current market structure.
- Beginners: TradingView has built-in ATR indicators and community
  "ATR percentile" / "volatility regime" scripts — no coding required.

### 3.3 Week-over-week forecasting

- Last week's volatility predicts next week's, just as daily does. Weekly
  forecasts smooth daily noise; useful for position/swing trades held
  multiple days.
- Example from the lesson: last week's realized range 245 pips → this week's
  forecast ≈ 250 pips.

| Method | Formula | When to use |
|---|---|---|
| Last week | Forecast = last week's range | Quick estimate, stable conditions |
| 4-week average | Avg of last 4 weeks | Smoother, less reactive |
| **EMA (weekly)** | α × last + (1−α) × prev EMA | Balanced (recommended) |
| Sum of daily ATRs | Daily ATR × 5 | Bridge from daily to weekly |

- ⚠️ **Weekly vol ≠ daily vol × 5.** Due to mean reversion within the week
  and overlapping ranges, weekly range is typically **2–3× daily**, not 5×.
  Measure actual weekly ranges to calibrate.

### 3.4 Trading implications by regime

**😴 Low vol (below 25th percentile):**
- Position size: can increase (smaller ranges = less $ at risk per unit).
- Stops: tighter — 0.75× ATR (less noise to filter).
- Targets: smaller, scale out early (limited range = limited opportunity).
- Duration: can hold longer (less adverse movement risk).
- Strategy type: **mean reversion works** — range-bound conditions favor
  fading.
- Overnight risk: lower — gaps smaller and rarer.

**⚖️ Normal vol (25th–75th):**
- Position size: standard — your baseline.
- Stops: standard — 1× ATR.
- Targets: standard R:R (1:2, 1:3 achievable).
- Duration: normal; let winners run.
- Strategy type: **trend following shines** — trends develop and follow
  through.
- Overnight risk: normal.

**🔥 High vol (above 75th):**
- Position size: **reduce 30–50%** (larger moves = more $ at risk).
- Stops: wider — 1.5–2× ATR (more noise; avoid whipsaws).
- Targets: larger, take partials (big moves happen — capture them).
- Duration: shorter; take profits quickly (reversals come fast).
- Strategy type: momentum, breakouts, continuation patterns.
- Overnight risk: much higher — reduce; large gaps, news sensitivity.

- ⚠️ **The most dangerous transition: Low → High.** After extended low vol,
  traders get complacent and size for small ranges. When vol explodes, stops
  can slip badly and losses accumulate fast. Always be prepared for regime
  change.

### 3.5 Regime transitions — warning signs

| Transition | Warning signs | What to do |
|---|---|---|
| Low → High | Sudden range spike (>2× average), news shock, gap opens, VIX spike | Immediately reduce size, widen stops, close marginal positions |
| High → Normal | Ranges contracting over several days, gaps decreasing, calmer price action | Gradually normalize positioning, tighten stops cautiously |
| Normal → Low | Ranges compressing, multi-day consolidation, decreasing ATR trend | Consider mean-reversion setups, prepare for eventual breakout |
| Low → Normal | Gradual range expansion, breakout from consolidation, trend development | Normal approach, watch for trend-following opportunities |

### 3.6 Data requirements & framework

- Data: minimum 6 months daily OHLC; better 12 months. For weekly, build
  weekly high/low from daily.
- Calculations: daily ATR (10 or 14 period); weekly range = week high −
  week low; percentile vs history.
- Update frequency: **regime check weekly** (or after big moves); **ATR
  daily**; **threshold review monthly**.

```
def weekly_regime_check(daily_data, lookback_months=6):
    daily_data['ATR'] = calculate_atr(daily_data, period=14)
    current_atr = daily_data['ATR'].iloc[-1]
    lookback_days = lookback_months * 21   # ~21 trading days/month
    historical = daily_data['ATR'].iloc[-lookback_days:-1]
    regime, percentile = classify_regime(current_atr, historical)
    return { regime, percentile, current_atr, median_atr: historical.median() }
```

### Lesson 3 key takeaways

1. Three regimes — high, normal, low — each needs a fundamentally different
   approach.
2. Percentile ranking is simple and effective: current ATR vs 6–12 months;
   <25th = low, >75th = high.
3. Weekly volatility persists like daily — last week's range predicts this
   week's; use for swing planning.
4. Adapt everything to the regime: size, stops, targets, hold time, strategy
   type.
5. Low→high transitions require caution — complacency plus oversized
   positions is the danger.
6. Check regime weekly; daily fluctuations are noise — regime is the
   bigger-picture concept.

---

## Lesson 4 — Session Structure: Asia Range as Daily Anchor

*40 min · Intermediate · Focus: intraday structure*

### 4.1 The 24-hour trading day (times ≈ GMT; adjust for timezone/DST)

| Session | Hours (GMT) | Volatility | Liquidity | Character |
|---|---|---|---|---|
| 🌏 Asia (Tokyo) | 00:00–06:00 | Lowest | Moderate | Range-bound, quiet |
| 🌍 London | ~07:00–16:00 | High | Highest | Directional, active |
| 🌎 New York | ~12:00–21:00 | High (esp. overlap) | Very high | Directional, active |

- **Why Asia matters:** the quietest session establishes a range that London
  and New York then expand. Asia "sets the table" — it defines the initial
  support/resistance levels the more volatile sessions will test.

### 4.2 Asia range as a predictor

- Key insight: **Asia range predicts the expected daily range.** Narrow Asia
  range → potentially narrow day; wide Asia range (vs its norm) → volatility
  already elevated, likely a more active day.
- Formula: `Asia range × expansion ratio = expected daily range`.
  Example: 30 pips × 2.5 = ~75-pip expected daily range.
- Typical expansion ratio: **2× to 3.5×**.

| Market | Typical Asia range | Expansion ratio | Expected daily |
|---|---|---|---|
| EUR/USD | 20–35 pips | 2.0–3.0× | 50–80 pips |
| GBP/USD | 30–50 pips | 2.0–2.8× | 70–120 pips |
| USD/JPY | 25–45 pips | 1.8–2.5× | 50–90 pips |
| Gold (XAU/USD) | $5–$12 | 2.5–4.0× | $15–$35 |
| S&P 500 futures | 10–25 pts | 2.0–3.5× | 30–60 pts |

- These are guidelines, not rules. The ratio **varies with the vol regime**:
  high-vol regimes expand more (3×+), low-vol less (1.5–2×). Calibrate to
  your market by measuring actual Asia-to-daily ratios over 20–30 days.

Calibration framework:

```
def calculate_expansion_ratio(daily_data):
    daily_data['expansion'] = daily_range / asia_range   # per day
    return { average, median, min, max of daily_data['expansion'] }

# Data: daily data with Asia session high/low marked.
# TradingView: session-highlighter indicators can mark the Asia range
# automatically — search "Asia session range".
```

### 4.3 Using the Asia range in trading

- **Range context** — compare today's Asia range to recent averages: narrow,
  normal or wide? Sets expectations for the day.
- **Projected daily range** — Asia range × expansion ratio → use for target
  setting and expectation management.
- **Timing awareness** — if much of the expected range is used by midday,
  reduce expectations for further movement; if range is compressed late,
  opportunity may have passed.

Interpreting Asia range size:

| Asia range vs average | Suggests | Trading implication |
|---|---|---|
| Narrow (< 70% of avg) | Quiet overnight, compression | Expect smaller daily range; be patient |
| Normal (70–130%) | Typical conditions | Standard expectations; normal expansion ratio |
| Wide (> 130%) | Vol already elevated; possible overnight news | Expect active day; adjust sizing for higher vol |

- ⚠️ **Asia range is context, not a signal.** Use it to set expectations and
  calibrate targets — not as a mechanical entry trigger. The value is knowing
  what kind of day to expect (affects sizing, targets, patience).

### 4.4 Session volatility patterns (intraday rhythm)

- **Asia: low & stable** — ranges form; the table is set. Good for
  identifying levels, not for directional trades.
- **London open: surge** — vol spikes as European traders enter; often when
  the day's direction is established. Key breakout window.
- **London/NY overlap (~12:00–16:00 GMT): peak volatility** — both centers
  active; the largest moves of the day happen here; most of the daily range
  gets printed; highest chance of news-driven vol. Peak opportunity AND peak
  risk — moves are fastest, stops most likely to be hit.

### 4.5 Daily prep using sessions

1. **Mark the Asia range** — at (or before) London open, draw Asia session
   high and low as horizontal lines. These are the day's reference levels.
2. **Calculate expected expansion** — Asia range × typical ratio (2–3×) →
   expected daily range and potential targets beyond the Asia levels.
3. **Note the context** — current vol regime? scheduled news today? higher
   timeframe trend? These affect how to interpret Asia breaks.
4. **Watch the London reaction** — first 1–2 hours of London: how does price
   interact with the Asia levels? Often sets the tone for the day.
5. **Adjust through the day** — expected range reached early → reduce
   expectations; range compressed late → opportunity may have passed.

- 💡 TradingView tip: "Session Breaks" indicator draws session boundaries
  automatically; community scripts also project Asia range ("Asia range",
  "session box").

### 4.6 Data requirements & framework

- Data: minimum 15-min or hourly bars with timestamps; better 5-min for
  precise session boundaries; 20–30 days for calibration.
- Key calculations: Asia high/low = max/min during Asia hours; daily
  high/low = 24-h max/min; expansion ratio = daily range ÷ Asia range.
- Daily workflow: pre-session note Asia range size → calculate expected
  daily range → end of day log actual vs expected.

```
def get_session_levels(intraday_data, date):
    asia_start, asia_end = "00:00", "06:00"   # adjust for timezone
    asia = bars in [asia_start, asia_end)
    asia_high, asia_low = max(asia.high), min(asia.low)
    asia_range = asia_high - asia_low
    expansion = 2.5
    projected_high = asia_high + asia_range * (expansion - 1) / 2
    projected_low  = asia_low  - asia_range * (expansion - 1) / 2
    return { asia_high, asia_low, asia_range, projected_high, projected_low }
```

### Lesson 4 key takeaways

1. Asia sets the table — the quietest session establishes the range London
   and NY expand; typical expansion 2–3.5×.
2. Asia high/low are key levels — intraday S/R; breaks signal direction,
   holds suggest range continuation.
3. London open is the key breakout window — first 1–2 hours often establish
   the day's direction; late-day breaks are less reliable.
4. The overlap is peak volatility — most of the daily range prints there.
5. Context matters more than signals — Asia breakouts work best with trend
   alignment, a catalyst and clean price action; don't trade mechanically.
6. Make it a daily routine: mark Asia levels before London, project the
   range, watch the reaction, adjust through the day.

---

## Lesson 5 — Position Sizing with Volatility

*45 min · Practical · Focus: risk management*

### 5.1 Why fixed position sizing fails

- Fixed sizing ("always 1 lot" / "always risk 2%") creates **inconsistent
  risk exposure** — actual risk swings with volatility.
- Fixed approach: same size regardless of conditions → risk per trade changes
  with vol → P&L swings with market conditions → results become
  regime-dependent → hard to isolate whether your edge is real.
- Vol-adjusted approach: size adapts to current vol → low vol: larger size,
  same risk; high vol: smaller size, same risk → consistent P&L volatility →
  more predictable drawdowns.
- Clarification from the lesson: whether fixed sizing hurts depends on the
  strategy — some benefit from high vol (trend following, breakouts), others
  suffer (mean reversion, range trading). The point isn't that high vol is
  bad — it's that **risk exposure should be consistent and intentional, not
  an accident of market conditions.**
- With fixed sizing, a 50-pip stop in low vol and a 100-pip stop in high vol
  are very different dollar amounts even though both are "1 lot" — and when
  risk changes with conditions, you can't tell skill from lucky vol timing.

### 5.2 The core formula

```
Position Size = Risk Amount ÷ (ATR × Multiplier)
```

| Component | What it is | How to determine |
|---|---|---|
| Risk amount ($) | Max acceptable loss per trade | Usually 0.5–2% of account, e.g. $500 on $50k (1%) |
| ATR | Average True Range — your vol forecast | 10- or 14-period ATR, updated daily (Lesson 2) |
| Multiplier | Stop distance in ATR units | Typically 1–2× ATR; depends on strategy and regime |

- 💡 **The multiplier is your choice.** 1× ATR = tighter stop (hit more often,
  smaller loss); 2× ATR = wider (hit less often, larger loss if hit). Position
  size adjusts automatically so risk exposure is the same either way.

### 5.3 Worked examples

**Example 1 — EUR/USD, normal vol:** $50,000 account, 1% risk = $500; ATR
65 pips; stop 1.5× ATR = 97.5 pips; pip value $10/std lot.
`$500 ÷ (97.5 × $10) = 0.51 lots`. Risk if stopped: ~$500.

**Example 2 — EUR/USD, high vol:** same account and risk; ATR 120 pips;
stop 1.5× ATR = 180 pips.
`$500 ÷ (180 × $10) = 0.28 lots`. Risk if stopped: ~$500 (same!).

- Notice: vol nearly doubled (65→120 pips) → size nearly halved (0.51→0.28
  lots) → **risk exposure unchanged.** That's the power of vol-adjusted
  sizing.

### 5.4 Regime-based adjustments (optional layer)

| Regime | Risk multiplier | Note |
|---|---|---|
| 😴 Low vol | 1.0–1.25× | Can maintain or slightly increase base risk % |
| ⚖️ Normal | 1.0× | Standard risk % — baseline |
| 🔥 High vol | 0.5–0.75× | Reduce base risk % as extra protection |

- ⚠️ This is a **double adjustment** — the formula already shrinks size when
  ATR is high; some traders additionally cut the risk % (e.g. 1% → 0.5%) in
  high-vol regimes. Whether it makes sense depends on the strategy — some
  perform better in high vol.
- Why some traders adjust further:
  - **Gaps & slippage** — in high vol, a 100-pip stop might execute at 150
    pips.
  - **Model uncertainty** — vol forecasts are less reliable in extreme
    regimes; ATR may understate true risk.
  - **Strategy dependence** — if the strategy suffers in high vol, cut risk;
    if it thrives, maintain or even increase.

### 5.5 ATR-based stops & targets

Stops:

| Stop distance | Characteristics | When to use |
|---|---|---|
| 0.75× ATR | Tight, higher hit rate, smaller losses | Low-vol regimes, high-conviction setups, scalping |
| 1.0× ATR | Standard, balanced | Normal conditions, most swing trades |
| 1.5× ATR | Wide, more breathing room | Trending markets, position trades |
| 2.0× ATR | Very wide, rarely hit but large if triggered | High-vol regimes, tail-risk protection |

Targets (with a 1× ATR stop):

| Target distance | R:R | Probability context |
|---|---|---|
| 1.0× ATR | 1:1 | Higher probability, smaller wins |
| 1.5× ATR | 1.5:1 | Moderate — a reasonable daily target |
| 2.0× ATR | 2:1 | Good R:R; may need to hold longer |
| 3.0× ATR | 3:1 | Ambitious — strong trend needed |

- **Reality-check targets:** if expected daily range is 80 pips, a 200-pip
  day-trade target = 2.5 days of average movement — unrealistic. ATR keeps
  expectations grounded in what the market is likely to deliver.

### 5.6 Implementation steps

1. **Risk budget** — max risk per trade as % of account (0.5–2%); dollar
   amount: $50k × 1% = $500.
2. **Get current ATR** — 10- or 14-day; most platforms show it. E.g. EUR/USD
   ATR = 72 pips.
3. **Choose stop multiplier** — by strategy and regime, e.g. 1.5× ATR =
   108-pip stop.
4. **Calculate size** — `Risk ÷ (stop pips × pip value)`:
   `$500 ÷ (108 × $10) = 0.46 lots`.
5. **Apply regime adjustment (optional)** — in a high-vol regime, consider a
   further 25–50% reduction.

```
def calculate_position_size(account_size, risk_pct, atr, stop_multiplier, pip_value):
    risk_amount = account_size * (risk_pct / 100)
    stop_distance = atr * stop_multiplier
    return round(risk_amount / (stop_distance * pip_value), 2)

# calculate_position_size(50000, 1, 72, 1.5, 10)  →  0.46 lots
# Many platforms have built-in position size calculators; spreadsheets work too.
```

### 5.7 Common mistakes to avoid

- 🔄 **Stale ATR** — using yesterday's ATR in a fast market. Update daily; be
  extra cautious after major news or regime shifts.
- 📈 **Oversizing in low vol** — the formula allows bigger positions, but set
  a maximum position size regardless of ATR.
- 🎯 **Ignoring liquidity** — "trade 5 lots" is meaningless if the market
  can't absorb it without slippage; know your market's depth.
- 💥 **Forgetting gaps** — ATR stops assume exit at the stop price; in gaps
  and fast markets execution can be far worse. Build in a margin of safety.
- ⚠️ **Maximum size rule:** even if the formula says 10 lots in ultra-low
  vol, set a hard cap (e.g. 3 lots). Low vol can become high vol instantly —
  don't be caught oversized when it does.

### Lesson 5 key takeaways

1. Fixed sizing creates inconsistency — risk exposure changes with vol,
   obscuring your true edge.
2. Core formula: `Size = Risk ÷ (ATR × Stop Multiplier)` — keeps risk
   exposure constant.
3. Size inversely to volatility — ATR doubles → size halves; same risk,
   different conditions.
4. Regime adjustments are optional — strategy-dependent.
5. ATR for stops and targets too — stay grounded in reality.
6. Set a maximum size — cap positions against sudden regime changes.

---

## Formula sheet (quick revision)

- True Range: `TR = max(H−L, |H−C₋₁|, |L−C₋₁|)`
- EMA forecast: `EMA = α × TR + (1−α) × EMA₋₁`; start α = 0.15 (~12 days)
- α ↔ period: `α = 2/(N+1)` ⟷ `N = 2/α − 1`
- Wilder ATR: `ATR = (ATR₋₁ × (N−1) + TR) / N`
- Regime percentile: % of 6–12-month ATR history below current;
  <25 = LOW, 25–75 = NORMAL, >75 = HIGH
- Weekly range ≈ 2–3× daily (NOT 5×)
- Expected daily range ≈ Asia range × expansion ratio (2–3.5×, regime-dependent)
- Position size: `Risk$ ÷ (ATR × stop multiplier × per-pip value)`
- Stops: 0.75× (low vol/tight) → 2× ATR (high vol/wide); targets 1–3× ATR
- Persistence benchmarks: lag-1 corr 0.3–0.7; MAE 20–40% of range;
  directional accuracy 60–75%; autocorrelation significant 5–20 days

---

## Future investigation list (from the lessons' own frameworks)

Things the course tells me to verify/calibrate on my own data before relying
on them:

1. **Persistence test per instrument** (L1 §6): lag-1 correlation of daily
   ranges, MAE of naive forecast vs long-term-average benchmark, directional
   accuracy, autocorrelation decay — on the pairs I actually trade (FX majors
   expected strong; verify Gold and indices separately).
2. **Optimal α per market** (L2 §3): grid 0.05–0.40 minimizing MAE, then
   out-of-sample validation; sanity-check the optimum sits near 0.10–0.20.
3. **Forecast error bands** (L2 §5): from my own forecast-vs-actual log,
   what band contains 68% of outcomes? (Course example: ±25%.)
4. **Regime thresholds** (L3 §2): does the 25/75 percentile split fit my
   markets, or do the thresholds need adjusting? 6 vs 12-month lookback
   comparison.
5. **Weekly-to-daily ratio** (L3 §3): measure actual weekly range ÷ daily
   range per pair — course says typically 2–3×; calibrate rather than assume.
6. **Asia expansion ratios** (L4 §2): measure Asia-to-daily ratios over
   20–30 days per instrument, and split by vol regime (high-vol regimes
   should show 3×+, low-vol 1.5–2×).
7. **Session timing** (L4 §4): confirm on my data that the London open and
   the London/NY overlap print most of the daily range; check DST effects on
   session boundaries.
8. **Regime-dependent strategy performance** (L3 §4, L5 §4): does mean
   reversion actually do better in my low-vol regimes and trend-following in
   normal? Does my strategy suffer or thrive in high vol (decides whether the
   optional regime risk-adjustment applies)?
9. **Forecast-vs-actual daily log** (L2 §6): keep the Date / Forecast /
   Actual / Notes journal — large misses as a regime-change indicator.
10. **End-of-day expansion check** (L4 §6): log expected (Asia-projected) vs
    actual daily range daily to refine the expansion ratio over time.

## Areas of interest for deeper study (the course's "where this leads")

- GARCH — formal volatility-clustering models
- HAR — combining daily/weekly/monthly vol (fits the multi-horizon theme)
- Realized volatility from intraday data
- Kalman filters / state-space estimation
- Regime-switching Markov models (formal version of Lesson 3's classifier)
- Stochastic volatility (Heston, SABR) — options/derivatives context
- VECM — long-run equilibrium relationships
- ML approaches to vol forecasting (with the course's caveat: simple methods
  get close, with far less overfitting risk)

## Next lesson

**Lesson 6 — The Daily Volatility Workflow:** putting it all together into a
daily routine; a practical checklist for pre-market preparation and trading
decisions.

---

*Source material: Colez Trades Volatility Intelligence course. Educational
content only, not financial advice. Test all concepts on your own data.*
