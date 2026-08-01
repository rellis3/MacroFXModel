# Volatility Extremes Classifier Design

## Combining VuManChu + Volume + Time + MTF Regime

**Problem:** At volatility extremes (HL75, HL50, etc.), should we FADE or FOLLOW?

**Current State:** Always fading = 50/50 coin flip with negative expectancy

**Solution:** Multi-signal classifier to determine exhaustion vs continuation

---

## Signal Components

### 1. VuManChu WaveTrend (Already Integrated)

**Location:** `js/vumanchuCore.js`, used in `forecast-reversion.html`

**Signals:**

- **Divergence** (from `js/divergenceCore.js`)
  - Regular divergence at extreme = FADE (reversal signal)
  - Hidden divergence = FOLLOW (continuation signal)
  - No divergence = NEUTRAL

- **Overbought/Oversold**
  - WT1 > 53 at high touch = overbought = FADE
  - WT1 < -53 at low touch = oversold = FADE
  - WT1 between -53 and 53 = NEUTRAL

- **Momentum Direction**
  - WT1 rising into high touch = strong momentum = FOLLOW
  - WT1 falling into high touch = weakening = FADE

**Implementation:**

```javascript
function classifyVuManChu(wt1, wt2, divergence, touchSide) {
  // touchSide: 1 = high touch, -1 = low touch

  // Divergence overrides everything
  if (divergence === "regular") return "FADE";
  if (divergence === "hidden") return "FOLLOW";

  // Extreme WT = fade
  if (touchSide === 1 && wt1 > 53) return "FADE";
  if (touchSide === -1 && wt1 < -53) return "FADE";

  // Momentum direction
  const wtMomentum = wt1 - wt2;
  if (touchSide === 1 && wtMomentum > 5) return "FOLLOW"; // Strong up momentum
  if (touchSide === -1 && wtMomentum < -5) return "FOLLOW"; // Strong down momentum

  return "NEUTRAL";
}
```

---

### 2. Volume Analysis

**Data:** M1 parquet has volume column (tick volume for FX)

**Signals:**

- **Volume Spike at Touch**
  - Volume > 2x recent average = exhaustion = FADE
  - Volume < 0.5x recent average = quiet continuation = FOLLOW
- **Volume Trend**
  - Increasing volume into touch = climax = FADE
  - Decreasing volume into touch = orderly = FOLLOW

**Implementation:**

```javascript
function classifyVolume(touchBar, recentBars) {
  const touchVol = touchBar.volume;
  const avgVol =
    recentBars.slice(-20).reduce((sum, b) => sum + b.volume, 0) / 20;

  // Volume spike = exhaustion
  if (touchVol > avgVol * 2) return "FADE";

  // Quiet touch = continuation
  if (touchVol < avgVol * 0.5) return "FOLLOW";

  // Volume trend (last 5 bars)
  const volTrend = recentBars.slice(-5).map((b) => b.volume);
  const volSlope = (volTrend[4] - volTrend[0]) / 5;

  if (volSlope > avgVol * 0.1) return "FADE"; // Increasing = climax
  if (volSlope < -avgVol * 0.1) return "FOLLOW"; // Decreasing = orderly

  return "NEUTRAL";
}
```

---

### 3. Time of Day

**Data:** Bar timestamp from M1 data

**Signals:**

- **Session Phase**
  - First 2 hours (London open) = more reversals = FADE bias
  - Mid-session (10:00-14:00 UTC) = trends develop = FOLLOW bias
  - Last hour (NY close) = profit-taking = FADE bias

- **First Touch vs Repeated**
  - First touch of level in session = more likely to reverse = FADE
  - 2nd/3rd touch = level being tested = FOLLOW if breaks

**Implementation:**

```javascript
function classifyTime(touchBar, sessionStart, previousTouches) {
  const hour = new Date(touchBar.time * 1000).getUTCHours();
  const minutesSinceOpen = (touchBar.time - sessionStart) / 60;

  // Session phase
  let timeScore = 0;
  if (minutesSinceOpen < 120)
    timeScore = -1; // Early = fade bias
  else if (minutesSinceOpen > 1320)
    timeScore = -1; // Late = fade bias
  else timeScore = 1; // Mid-session = follow bias

  // Touch count
  if (previousTouches === 0)
    timeScore -= 1; // First touch = fade
  else if (previousTouches >= 2) timeScore += 1; // Repeated = follow

  if (timeScore <= -1) return "FADE";
  if (timeScore >= 1) return "FOLLOW";
  return "NEUTRAL";
}
```

---

### 4. Multi-Timeframe Regime Alignment

**Data:** Regime states from 1m, 5m, 15m, 30m, 4h (from regime classifier)

**Signals:**

- **All TFs Aligned**
  - All bullish at high touch = strong trend = FOLLOW
  - All bearish at low touch = strong trend = FOLLOW
- **TFs Diverging**
  - Higher TFs bearish but lower TFs bullish at high = exhaustion = FADE
  - Mixed signals = NEUTRAL

**Implementation:**

```javascript
function classifyMTFRegime(regimes, touchSide) {
  // regimes = { '1m': 'BULL_TREND', '5m': 'BULL_TREND', ... }

  const tfs = ["1m", "5m", "15m", "30m", "4h"];
  const bullCount = tfs.filter((tf) => regimes[tf]?.includes("BULL")).length;
  const bearCount = tfs.filter((tf) => regimes[tf]?.includes("BEAR")).length;

  // All aligned = follow the trend
  if (touchSide === 1 && bullCount >= 4) return "FOLLOW"; // High touch in uptrend
  if (touchSide === -1 && bearCount >= 4) return "FOLLOW"; // Low touch in downtrend

  // Counter-trend touch = fade
  if (touchSide === 1 && bearCount >= 3) return "FADE"; // High touch but bearish
  if (touchSide === -1 && bullCount >= 3) return "FADE"; // Low touch but bullish

  // HTF vs LTF divergence
  const htfBullish =
    ["30m", "4h"].filter((tf) => regimes[tf]?.includes("BULL")).length >= 1;
  const ltfBearish =
    ["1m", "5m"].filter((tf) => regimes[tf]?.includes("BEAR")).length >= 1;

  if (touchSide === 1 && htfBullish && ltfBearish) return "FADE"; // Exhaustion

  return "NEUTRAL";
}
```

---

## Combined Classifier

### Scoring System

Each signal votes: FADE (-1), NEUTRAL (0), FOLLOW (+1)

```javascript
function classifyExtreme(context) {
  const {
    wt1,
    wt2,
    divergence,
    touchBar,
    recentBars,
    sessionStart,
    previousTouches,
    regimes,
    touchSide, // 1 = high, -1 = low
  } = context;

  // Get individual signals
  const vmcSignal = classifyVuManChu(wt1, wt2, divergence, touchSide);
  const volSignal = classifyVolume(touchBar, recentBars);
  const timeSignal = classifyTime(touchBar, sessionStart, previousTouches);
  const mtfSignal = classifyMTFRegime(regimes, touchSide);

  // Convert to scores
  const scoreMap = { FADE: -1, NEUTRAL: 0, FOLLOW: 1 };
  const scores = {
    vmc: scoreMap[vmcSignal],
    vol: scoreMap[volSignal],
    time: scoreMap[timeSignal],
    mtf: scoreMap[mtfSignal],
  };

  // Weighted sum (VuManChu and MTF are more important)
  const totalScore =
    scores.vmc * 2 + // VuManChu weight = 2
    scores.vol * 1 + // Volume weight = 1
    scores.time * 1 + // Time weight = 1
    scores.mtf * 2; // MTF regime weight = 2

  // Decision thresholds
  if (totalScore <= -3) return { action: "FADE", confidence: "HIGH", scores };
  if (totalScore === -2 || totalScore === -1)
    return { action: "FADE", confidence: "LOW", scores };
  if (totalScore >= 3) return { action: "FOLLOW", confidence: "HIGH", scores };
  if (totalScore === 2 || totalScore === 1)
    return { action: "FOLLOW", confidence: "LOW", scores };

  return { action: "SKIP", confidence: "NONE", scores }; // No clear signal
}
```

---

## Integration with Existing System

### Where to Add This

**File:** `forecast-reversion.html` or new `forecast-classifier.html`

**Hook into:** `makeDecider()` function (line 623-661 in forecast-reversion.html)

**Current code:**

```javascript
function makeDecider() {
  const style = styleMode();
  const momentum = $("momentum").checked;
  const divergence = $("divergence").checked;
  // ... existing logic
}
```

**New code:**

```javascript
function makeDecider() {
  const useClassifier = $("classifier").checked; // New checkbox

  if (!useClassifier) {
    // Existing fade_all / follow_med_fade_75 logic
    return existingDecider();
  }

  // New classifier logic
  return (line, bars, touchIdx, bands, wt, divs, regimes) => {
    const touchBar = bars[touchIdx];
    const recentBars = bars.slice(Math.max(0, touchIdx - 20), touchIdx);
    const touchSide = line.side; // 1 = high, -1 = low

    // Get VuManChu at touch
    const wt1 = wt[touchIdx];
    const wt2 = wt[touchIdx]; // signal line

    // Check for divergence
    const divergence = divs.find((d) => d.iRec === touchIdx);

    // Get MTF regimes (from regime classifier)
    const mtfRegimes = regimes; // passed in from regime_classifier_mtf.py output

    // Classify
    const decision = classifyExtreme({
      wt1,
      wt2,
      divergence: divergence?.kind,
      touchBar,
      recentBars,
      sessionStart: bars[0].time,
      previousTouches: countPreviousTouches(bars, touchIdx, line.price),
      regimes: mtfRegimes,
      touchSide,
    });

    // Only trade high-confidence signals
    if (decision.confidence !== "HIGH") return null;

    return decision.action; // 'FADE' or 'FOLLOW'
  };
}
```

---

## Testing Strategy

### 1. Backtest Setup

- **Data:** Last 6 months of M1 data
- **Split:** 60% IS, 40% OOS
- **Instruments:** EUR/USD, GBP/USD, Gold, NQ

### 2. Comparison

Test 4 strategies:

1. **Always Fade** (baseline)
2. **Always Follow** (baseline)
3. **Classifier (All Signals)** - VuManChu + Volume + Time + MTF
4. **Classifier (VuManChu Only)** - to see if other signals add value

### 3. Success Criteria

Classifier must beat BOTH baselines on OOS:

- Sharpe ratio > max(fade, follow) + 0.3
- Win rate > 50%
- Minimum 50 OOS trades
- Max drawdown < 3R

### 4. Signal Attribution

Track which signal contributed most:

- When VuManChu says FADE and classifier wins, +1 to VuManChu
- When Volume says FOLLOW and classifier wins, +1 to Volume
- Identify which signals are actually predictive

---

## Implementation Checklist

- [ ] Add regime classifier output to forecast-reversion.html
- [ ] Implement `classifyVuManChu()` function
- [ ] Implement `classifyVolume()` function
- [ ] Implement `classifyTime()` function
- [ ] Implement `classifyMTFRegime()` function
- [ ] Implement `classifyExtreme()` combined function
- [ ] Add classifier toggle to UI
- [ ] Add signal breakdown display (show which signals voted what)
- [ ] Run backtest comparing all 4 strategies
- [ ] Analyze signal attribution
- [ ] Tune weights if needed (but pre-register the tuning method)

---

## Expected Outcome

**If it works:**

- Classifier OOS Sharpe > 0.5 (vs fade/follow ~0.0)
- Win rate > 55%
- Trades only high-confidence setups (fewer trades but better quality)
- Clear signal attribution showing which signals matter

**If it doesn't work:**

- Classifier performs same as random (Sharpe ~0.0)
- Signals are not predictive
- Need to find different signals or accept that extremes are unpredictable

**Key insight:** The classifier should SKIP most touches (only trade when signals align strongly). Trading less but better is the goal.

---

## Next Steps

1. Run `regime_classifier_mtf.py` to get MTF regime states
2. Export regime states to JSON for forecast-reversion.html to read
3. Implement the 4 classifier functions
4. Add UI controls for classifier mode
5. Run backtest and compare results
6. Document findings in PREREGISTERED_EVALUATIONS.md
