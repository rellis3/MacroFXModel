# VOLATILITY IMPLEMENTATION GUIDE
## Reference for Model Integration — Cog Volatility Intelligence Series

**Purpose**: A self-reference guide for implementing volatility measurement, forecasting, and regime classification into trading models. Covers all formulas, code patterns, parameter choices, and integration patterns relevant to the trading suite.

---

## PART 1: MEASURING VOLATILITY — THE BUILDING BLOCKS

### The Three Core Measures

| Measure | Formula | Use Case | Limitation |
|---|---|---|---|
| Simple Range | High − Low | Intraday session analysis | Misses overnight gaps |
| True Range (TR) | `max(H−L, |H−Prev Close|, |L−Prev Close|)` | ATR, stops, sizing | Slightly more complex |
| Standard Deviation | Return dispersion | Options, VaR models | Sensitive to outliers |
| Parkinson | `(ln(H/L))² / (4·ln2)` | Research/efficiency studies | Assumes no jumps |

### True Range — The Core Formula

```
TR = max(High − Low,  |High − PrevClose|,  |Low − PrevClose|)
```

**Why it matters**: If yesterday's close = 100, today opens at 105, High = 106, Low = 103:
- Simple Range = 3 (misses the gap)
- True Range = 6 (captures overnight move that hit your positions)

**Rule**: Always use True Range for swing trading, stop placement, and volatility sizing. Simple Range only for pure intraday (same-session) analysis.

---

## PART 2: FORECASTING METHODS

### Method Comparison

| Method | Formula | Pros | Cons |
|---|---|---|---|
| Simple MA (ATR) | `Σ(TR) / N` | Simple, stable | Slow, equal weight |
| EMA | `α × TR + (1−α) × EMA₋₁` | Responsive, balanced | Must choose α |
| Wilder's Smoothing | `(ATR₋₁ × (N−1) + TR) / N` | Industry standard | Equivalent to EMA |

**Recommendation**: EMA with α = 0.15 (equivalent ~12-day period). Best balance of responsiveness and stability.

### The α Parameter

```
α = 2 / (N + 1)     ←→     N = (2 / α) − 1
```

| α | Equivalent Period | Behaviour | Best For |
|---|---|---|---|
| 0.10 | ~19 days | Slow, smooth | Position trading, stable markets |
| **0.15** | **~12 days** | **Balanced** | **General purpose — start here** |
| 0.20 | ~9 days | Responsive | Swing trading, volatile markets |
| 0.30 | ~6 days | Very reactive | Short-term, regime change detection |

### EMA Calculation — JavaScript Implementation

```javascript
// Daily EMA-ATR update (called once per day, end of session)
function updateEmaATR(prevClose, high, low, prevEmaATR, alpha = 0.15) {
  // Calculate True Range
  const tr = Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose)
  );
  // Update EMA
  const newEmaATR = alpha * tr + (1 - alpha) * prevEmaATR;
  return { tr, emaATR: newEmaATR };
}

// Initialise from array of OHLC data
function initEmaATR(ohlcData, alpha = 0.15) {
  if (ohlcData.length < 2) return null;
  let ema = Math.abs(ohlcData[1].high - ohlcData[1].low); // seed with first TR
  for (let i = 2; i < ohlcData.length; i++) {
    const tr = Math.max(
      ohlcData[i].high - ohlcData[i].low,
      Math.abs(ohlcData[i].high - ohlcData[i - 1].close),
      Math.abs(ohlcData[i].low  - ohlcData[i - 1].close)
    );
    ema = alpha * tr + (1 - alpha) * ema;
  }
  return ema;
}
```

### Calibration — Finding Optimal α

Goal: minimise Mean Absolute Error (MAE) between forecast and actual TR.

```javascript
function findOptimalAlpha(trueRanges, alphaMin = 0.05, alphaMax = 0.40, step = 0.01) {
  let bestAlpha = 0.15;
  let bestMAE = Infinity;

  for (let alpha = alphaMin; alpha <= alphaMax; alpha += step) {
    let ema = trueRanges[0];
    let totalError = 0;

    for (let i = 1; i < trueRanges.length; i++) {
      totalError += Math.abs(trueRanges[i] - ema); // forecast error
      ema = alpha * trueRanges[i] + (1 - alpha) * ema; // update
    }

    const mae = totalError / (trueRanges.length - 1);
    if (mae < bestMAE) { bestMAE = mae; bestAlpha = alpha; }
  }

  return { bestAlpha, bestMAE };
}
```

**⚠️ Calibration warning**: If your optimal α sits outside 0.10–0.20, be sceptical. Over-fit. Validate out-of-sample on 20–30% of data not used for calibration.

---

## PART 3: TYPICAL VOLATILITY BENCHMARKS

Use these as sanity checks — not gospel. Update for current regime.

| Market | Typical Daily Range | High Vol | Low Vol |
|---|---|---|---|
| EUR/USD | 50–80 pips | > 120 pips | < 40 pips |
| GBP/USD | 70–110 pips | > 150 pips | < 50 pips |
| USD/JPY | 50–90 pips | > 130 pips | < 40 pips |
| S&P 500 (ES) | 30–60 points | > 80 points | < 25 points |
| Crude Oil (CL) | $1.50–$3.00 | > $4.00 | < $1.00 |
| Gold (GC) | $15–$30 | > $45 | < $12 |

---

## PART 4: REGIME CLASSIFICATION

### The Three Regimes

| Regime | Percentile | Daily Range | Typical Duration | Character |
|---|---|---|---|---|
| Low Vol | < 25th | 0.5–0.7× normal | Weeks–months | Quiet, grinding, complacency |
| Normal | 25th–75th | Near average | Weeks–months | Trends develop, follow-through |
| High Vol | > 75th | 1.5–3× normal | Days–weeks | Large moves, gaps, fast reversals |

**Key asymmetry**: Low→High transitions are sudden (shock). High→Low transitions are gradual (fear fades slowly). The most dangerous moment is after extended low vol — positions sized for quiet markets get hit by explosive moves.

### Percentile-Based Classifier

```javascript
function classifyRegime(currentATR, historicalATRs) {
  const sorted = [...historicalATRs].sort((a, b) => a - b);
  const below = sorted.filter(v => v < currentATR).length;
  const percentile = (below / sorted.length) * 100;

  let regime;
  if (percentile < 25)      regime = 'LOW';
  else if (percentile > 75) regime = 'HIGH';
  else                      regime = 'NORMAL';

  return { regime, percentile, currentATR, medianATR: sorted[Math.floor(sorted.length / 2)] };
}

// Usage: pass last 6–12 months of daily ATR values as historicalATRs
// Update: weekly, or after any major move
```

**Window**: Use 6–12 months of history. Too short = unstable; too long = includes stale regimes.

### Trading Adjustments by Regime

| Parameter | Low Vol | Normal | High Vol |
|---|---|---|---|
| Position size | Can increase | Baseline | Reduce 30–50% |
| Stop distance | 0.75× ATR | 1× ATR | 1.5–2× ATR |
| Profit targets | Smaller, scale early | Standard R:R | Larger, take partials |
| Trade duration | Can hold longer | Normal | Shorter |
| Strategy type | Mean reversion | Trend following | Momentum/breakout |
| Overnight risk | Lower | Normal | Much higher — reduce |

### Regime Transition Warning Signs

| Transition | Warning Signs | Action |
|---|---|---|
| Low → High | Daily range spikes 2×+ average, gap opens, news shock | Immediately reduce size, widen stops |
| High → Normal | Ranges contracting over days, gaps decreasing | Gradually normalise, tighten stops cautiously |
| Normal → Low | Ranges compressing, multi-day consolidation | Mean reversion setups, prepare for breakout |
| Low → Normal | Gradual range expansion, breakout from consolidation | Standard approach, watch for trend following |

---

## PART 5: SESSION STRUCTURE (INTRADAY)

### Session Times (GMT)

| Session | Hours | Volatility | Character |
|---|---|---|---|
| Asia (Tokyo) | 00:00–06:00 | Lowest | Range-bound, table-setting |
| London | ~07:00–16:00 | High | Directional, highest liquidity |
| London/NY Overlap | ~12:00–16:00 | Peak | Largest daily moves print here |
| New York | ~12:00–21:00 | High | Active, news-driven |

### Asia Range as Daily Predictor

**Core insight**: Asia range × expansion ratio ≈ expected daily range.

```
Expected Daily Range = Asia Range × Expansion Ratio (typically 2.0–3.5×)
```

| Market | Typical Asia Range | Expansion Ratio | Expected Daily |
|---|---|---|---|
| EUR/USD | 20–35 pips | 2.0–3.0× | 50–80 pips |
| GBP/USD | 30–50 pips | 2.0–2.8× | 70–120 pips |
| USD/JPY | 25–45 pips | 1.8–2.5× | 50–90 pips |
| Gold (XAU) | $5–$12 | 2.5–4.0× | $15–$35 |
| S&P 500 Futures | 10–25 pts | 2.0–3.5× | 30–60 pts |

**Note**: Weekly vol ≠ Daily vol × 5. Weekly range is typically 2–3× daily range due to intraweek mean reversion. Measure actual weekly ranges to calibrate.

### Interpreting Asia Range Size

| Asia Range vs Average | Implication | Trading Action |
|---|---|---|
| Narrow (< 70% of avg) | Quiet overnight, compression | Expect smaller day, be patient |
| Normal (70–130% of avg) | Typical conditions | Standard expectations |
| Wide (> 130% of avg) | Elevated vol already, possible overnight news | Expect active day, adjust sizing |

### Session Level Code

```javascript
function getSessionLevels(intradayBars, expansionRatio = 2.5) {
  // Assumes bars have { time: 'HH:MM', high, low, close }
  const asiaBars = intradayBars.filter(b => b.time >= '00:00' && b.time < '06:00');

  const asiaHigh = Math.max(...asiaBars.map(b => b.high));
  const asiaLow  = Math.min(...asiaBars.map(b => b.low));
  const asiaRange = asiaHigh - asiaLow;

  // Projected targets centred on Asia range
  const extension = asiaRange * (expansionRatio - 1) / 2;

  return {
    asiaHigh, asiaLow, asiaRange,
    projectedHigh: asiaHigh + extension,
    projectedLow:  asiaLow  - extension,
    expectedDailyRange: asiaRange * expansionRatio
  };
}
```

---

## PART 6: POSITION SIZING WITH VOLATILITY

### Core Formula

```
Position Size = Risk Amount ÷ (ATR × Stop Multiplier)
```

| Component | What It Is | Typical Values |
|---|---|---|
| Risk Amount ($) | Max loss per trade | 0.5–2% of account |
| ATR | Current EMA-ATR forecast | Updated daily |
| Stop Multiplier | Stop distance in ATR units | 1.0–2.0× ATR |

### Worked Example

```
Account: $50,000   Risk: 1% = $500
ATR (EUR/USD): 65 pips   Stop: 1.5× ATR = 97.5 pips   Pip value: $10/pip

Position Size = $500 ÷ (97.5 × $10) = 0.51 lots   → Risk if stopped: ~$500

[ATR spikes to 120 pips — high vol regime]

Position Size = $500 ÷ (180 × $10) = 0.28 lots   → Risk if stopped: ~$500 (same!)
```

**The formula halves position size when vol doubles — risk stays constant.**

### JavaScript Implementation

```javascript
function calculatePositionSize(accountSize, riskPct, atrPips, stopMultiplier, pipValue) {
  const riskAmount   = accountSize * (riskPct / 100);
  const stopDistance = atrPips * stopMultiplier;
  const rawSize      = riskAmount / (stopDistance * pipValue);

  // Hard cap: never more than 3× your normal position regardless of low vol
  const maxSize = (accountSize * 0.02) / (atrPips * 1.0 * pipValue);
  return Math.min(rawSize, maxSize * 3);
}

// Optional regime multiplier on top
function regimeMultiplier(regime) {
  return { LOW: 1.15, NORMAL: 1.0, HIGH: 0.65 }[regime] || 1.0;
}
```

### ATR-Based Stop & Target Reference

| Stop Distance | Character | When to Use |
|---|---|---|
| 0.75× ATR | Tight, higher hit rate | Low vol, high-conviction scalps |
| 1.0× ATR | Standard | Normal conditions, most swing trades |
| 1.5× ATR | Wide, more breathing room | Trending markets, position trades |
| 2.0× ATR | Very wide | High vol regimes, tail risk |

| Target | R:R (vs 1× ATR stop) | Notes |
|---|---|---|
| 1.0× ATR | 1:1 | Higher probability |
| 1.5× ATR | 1.5:1 | Reasonable daily target |
| 2.0× ATR | 2:1 | Good R:R — may need to hold |
| 3.0× ATR | 3:1 | Ambitious — strong trend required |

**Reality check**: If ATR = 80 pips (expected daily range), a 200-pip same-day target = 2.5 days of average movement. ATR keeps expectations grounded.

---

## PART 7: DAILY WORKFLOW CHECKLIST

### Pre-Market (2 minutes)

```
1. UPDATE ATR
   EMA_new = α × TR_yesterday + (1 − α) × EMA_old
   Write down: "ATR today: X pips"

2. CLASSIFY REGIME
   Where does today's ATR sit vs 6-month history?
   Percentile: LOW (<25) / NORMAL (25-75) / HIGH (>75)

3. NOTE ASIA RANGE (intraday traders)
   Mark Asia High / Asia Low on chart
   Calculate: Expected Daily Range = Asia Range × expansion ratio

4. CALCULATE POSITION SIZE
   Risk Amount ÷ (ATR × stop multiplier) = lots
   Apply regime multiplier if using

5. SET CONTEXT
   Is ATR rising (vol expanding) or falling (conditions calming)?
   Any scheduled news that could spike vol?
```

### End-of-Day Review (2 minutes)

```
Log: Date | ATR Forecast | Actual Range | % Error | Regime | Notes
Large misses (>50%) = potential regime change — investigate
```

---

## PART 8: INTEGRATION WITH THE TRADING SUITE

### How Volatility Connects to the Five-Lens Framework

The dashboard's five-lens volatility framework maps directly to concepts from these lessons:

| Dashboard Lens | Lesson Concept | Key Metric |
|---|---|---|
| Open Interest | OI level vs strikes | Call/Put wall proximity |
| CVOL | Implied vol vs realised | IV/RV ratio, term structure |
| Term Structure | Contango/backwardation | Front vs back vol spread |
| Vol Cones | Historical range percentile | Where current ATR sits in cone |
| Skew | Risk reversal direction | Put vs call vol premium |

### Regime → Confidence Score Logic

```javascript
// Regime feeds into the overall confidence score
function regimeConfidenceAdjustment(regime, percentile) {
  if (regime === 'HIGH' && percentile > 90) return -20;  // penalise extreme vol
  if (regime === 'HIGH')                    return -10;  // general high vol caution
  if (regime === 'LOW'  && percentile < 10) return  +5; // very quiet = tighter conditions
  if (regime === 'NORMAL')                  return   0; // baseline
  return 0;
}
```

### Data Flow in the Dashboard

```
Yahoo Finance (via CORS proxy)
    → OHLC data (daily + intraday)
    → Calculate True Range per bar
    → EMA-ATR (α = 0.15 default, calibrated per instrument)
    → Regime classification (vs 6-month history)
    → Position size output
    → Stored in localStorage (data-layer.js) for cross-tool use
```

### Instrument-Specific Notes

| Instrument | ATR Unit | Pip Value | Notes |
|---|---|---|---|
| EUR/USD, GBP/USD | Pips (0.0001) | $10/pip std lot | Use smart decimal formatting |
| USD/JPY | Pips (0.01) | ~$9/pip std lot | Different pip decimal |
| NQ Futures | Points | $20/point | Use contract multiplier |
| ES Futures | Points | $50/point | Use contract multiplier |
| SR3 | Basis points | Variable | Rate futures — special handling |

---

## PART 9: ADVANCED METHODS (FUTURE REFERENCE)

Once EMA-ATR is solid, these are natural next steps:

| Method | What It Adds | When to Consider |
|---|---|---|
| GARCH | Formally models vol clustering (vol of vol) | When EMA-ATR lags regime changes |
| HAR Model | Combines daily + weekly + monthly vol | Better multi-timeframe forecasting |
| Kalman Filter | Optimal real-time estimation, handles noise | When α calibration feels unstable |
| Regime-Switching (Markov) | Explicitly models Low/Normal/High states | When regime misclassification is costly |
| Realised Vol (HF) | Intraday tick data for same-day estimate | When 5m bars are available |
| GARCH-VECM | Cross-asset vol linkages (SR3 ↔ TN ↔ NQ) | Multi-asset suite expansion |

**Principle**: All of these exploit the same fundamental property — **volatility is persistent**. The EMA-ATR captures most of this with far less overfitting risk. Add complexity only when you can demonstrate it adds measurable edge.

---

## QUICK REFERENCE CARD

```
MEASURE:   TR = max(H−L, |H−PC|, |L−PC|)
FORECAST:  EMA = α × TR + (1−α) × EMA_prev    [α = 0.15]
REGIME:    Percentile of EMA vs 6M history  →  LOW / NORMAL / HIGH
SIZE:      Risk$ ÷ (ATR × StopMult)         →  Lots/Contracts
SESSION:   Asia Range × 2.0–3.5             →  Expected Daily Range
STOP:      1.0–1.5× ATR from entry
TARGET:    1.5–2.0× ATR (reality-check vs expected daily range)
```

---

*Source: Cog Volatility Intelligence Course — Lessons 02–05*
*Reference for internal model building only. Not financial advice.*
