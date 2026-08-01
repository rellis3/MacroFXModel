# Trading Logic Analysis — Why Systems Are Unprofitable

> **Core Question:** Ignoring code bugs, what's wrong with the **trading decisions** themselves? Why are these strategies fundamentally unprofitable?

---

## 1. Volatility/Forecasting Systems — The Fatal Flaw

### Current Approach

**Always fade at the forecast extreme** (HL_75 band):

- Price hits open + HL_75 → SELL (fade back to open)
- Price hits open - HL_75 → BUY (fade back to open)

### Why This Fails

**The strategy assumes exhaustion = mean reversion. But at an extreme, price does ONE of TWO opposite things:**

1. **Mean-revert** (exhaustion) → fade works ✓
2. **Break out** (continuation) → fade loses badly ✗

**You're trading a 50/50 coin flip with negative expectancy** because:

- When you're right (mean-reversion), you capture open → HL_75 distance
- When you're wrong (breakout), you lose HL_75 × slMult (typically 1.5-2.0×)
- **Asymmetric payoff favors the breakout side**

### Evidence From Your Data

From [`TRADABILITY_REVIEW.md`](TRADABILITY_REVIEW.md:42):

> "96% of pairs show positive in-sample Sharpe — suspiciously high, the signature of selection fitted to the 2018–2023 training window."

**Translation:** The 2018-2023 period was range-bound (post-2018 vol collapse, pre-2022 inflation spike). Fading worked _then_. It doesn't generalize.

### What Would Actually Work

**Don't fade blindly. Classify the regime FIRST:**

```
IF (trend day / momentum / volatility expansion):
    → FOLLOW the extreme (buy the up-band, sell the down-band)
    → TP at next extension, SL at opposite band

ELSE IF (range day / exhaustion / volatility contraction):
    → FADE the extreme (current logic)
    → TP at open/median, SL at outer band
```

**The edge is the classifier, not the fade.**

### How to Build the Classifier

**Signals that distinguish exhaustion from breakout:**

1. **Intraday momentum before the touch:**
   - Fast approach (high velocity into the band) → exhaustion, fade
   - Slow grind (low velocity) → continuation, follow
   - _You already have this:_ [`touchFeatures.js`](js/touchFeatures.js:1) `approach_velocity`

2. **Volatility regime:**
   - Touch happens in first 2 hours of session + vol expanding → breakout likely
   - Touch happens late session + vol contracting → exhaustion likely
   - _You have:_ `dayTypeScore` (low T = mean-reverting day, high T = trend day)

3. **Market structure:**
   - Touch at a confluence level (multiple timeframe alignment) → stronger support/resistance, fade
   - Touch in open space (no structure) → continuation, follow
   - _You have:_ Asia/Monday fib confluence detection

4. **Overnight/session gap:**
   - Large gap + touch in gap-fill direction → fade (gap fill)
   - Small gap + touch extending the gap → follow (momentum)

5. **Volume/participation:**
   - High volume at the extreme → climax, fade
   - Low volume at the extreme → weak test, follow
   - _Missing:_ You don't have volume data in most backtests

**Concrete Implementation:**

```javascript
function decideAtExtreme(bar, band, features) {
  const { velocity, dayType, confluence, gapPct, timeInSession } = features;

  // Score exhaustion vs continuation (0 = pure continuation, 1 = pure exhaustion)
  let exhaustionScore = 0;

  // Fast approach = exhaustion
  if (velocity > 0.6 * sigma) exhaustionScore += 0.3;

  // Late in session = exhaustion
  if (timeInSession > 0.7) exhaustionScore += 0.2;

  // Low day-type T = mean-reverting day
  if (dayType < 0.3) exhaustionScore += 0.2;

  // Confluence level = stronger support/resistance
  if (confluence) exhaustionScore += 0.2;

  // Gap fill direction
  if (Math.abs(gapPct) > 0.5 && sameDirectionAsGap) exhaustionScore += 0.1;

  // Decision
  if (exhaustionScore > 0.6) return "FADE";
  if (exhaustionScore < 0.4) return "FOLLOW";
  return "SKIP"; // Unclear regime
}
```

**Test this A/B:**

- Current: always fade
- New: fade when exhaustionScore > 0.6, follow when < 0.4, skip middle
- Hypothesis: New approach has higher Sharpe + lower drawdown

---

## 2. Regime Systems — The Regime Definition Problem

### Current Approach

**HMM on daily returns → BULL/BEAR/RANGE → trade in direction of regime**

### Why This Fails

**Problem 1: Regime is BACKWARD-LOOKING**

HMM fits to _past_ returns. By the time it says "BULL", the move is often mature. You're:

- Entering late (after the trend is established)
- Exiting late (after the reversal has started)

**Evidence:** From your regime backtests, most profits come from the _entry_ bar, then give back. Classic late-entry problem.

**Problem 2: Daily returns are TOO SLOW for intraday trading**

You're trading on M30 bars but using a regime fitted to D1 returns. The regime can be "BULL" while price is in a 4-hour correction.

**Problem 3: Regime ≠ Tradeable Edge**

Knowing the regime is BULL doesn't tell you:

- WHERE to enter (any price? wait for pullback?)
- WHEN to exit (target? time? regime flip?)
- HOW MUCH conviction (strong bull vs weak bull?)

### What Would Actually Work

**Multi-timeframe regime with ENTRY TRIGGERS:**

```
1. HTF Regime (D1 HMM) → Directional bias (only trade WITH this)
2. MTF Structure (H4/H1) → Entry zones (pullback to support/resistance)
3. LTF Trigger (M30/M15) → Execution signal (momentum resumption)
```

**Example:**

```
HTF: BULL (D1 HMM says bullish)
MTF: Price pulls back to H4 EMA-20 (structure)
LTF: M30 closes above M30 EMA-5 (trigger)
→ ENTER LONG

Exit:
- TP: Next H4 resistance
- SL: Below H4 EMA-20
- Trail: Once 1R profit, trail at M30 EMA-5
```

### Better Regime Calculation

**Instead of pure HMM on returns, use a COMPOSITE:**

1. **Trend strength** (not just direction):
   - ADX > 25 = strong trend (tradeable)
   - ADX < 20 = weak trend (skip)
   - _You have ADX but it's shifted — fix it_

2. **Momentum alignment across timeframes:**
   - D1 EMA-20 slope
   - H4 EMA-20 slope
   - M30 EMA-20 slope
   - All three aligned = high conviction
   - Mixed = low conviction or skip

3. **Volatility regime:**
   - Expanding volatility = trend likely to continue
   - Contracting volatility = trend likely to stall
   - _You have this:_ `vol_z` in regime systems

4. **Market structure:**
   - Price above/below key levels (weekly pivots, prior day high/low)
   - Breaking structure = trend, respecting structure = range

**Concrete scoring:**

```python
def regime_conviction(d1_slope, h4_slope, m30_slope, adx, vol_z, structure_break):
    """
    Returns: ('BULL'|'BEAR'|'RANGE', conviction 0-100)
    """
    # Direction
    slopes = [d1_slope, h4_slope, m30_slope]
    if all(s > 0.001 for s in slopes):
        direction = 'BULL'
    elif all(s < -0.001 for s in slopes):
        direction = 'BEAR'
    else:
        return ('RANGE', 0)

    # Conviction
    conviction = 0

    # Trend strength
    if adx > 25: conviction += 30
    elif adx > 20: conviction += 15

    # Volatility expansion
    if vol_z > 1.0: conviction += 20
    elif vol_z > 0.5: conviction += 10

    # Timeframe alignment
    slope_std = np.std(slopes)
    if slope_std < 0.0005: conviction += 30  # Tight alignment
    elif slope_std < 0.001: conviction += 15

    # Structure break
    if structure_break: conviction += 20

    return (direction, min(conviction, 100))
```

**Trade only when conviction > 60.** This filters out weak/ambiguous regimes.

---

## 3. Asia Range / Fib Systems — The Confluence Trap

### Current Approach

**Trade fib levels that have "confluence" (multiple timeframes align)**

### Why This Fails

**Problem 1: Confluence = PAST alignment, not FUTURE edge**

Just because Asia fib 1.272 aligns with Monday fib 1.618 doesn't mean price will respect it. You're:

- Over-fitting to geometric coincidences
- Ignoring whether the level has actual ORDER FLOW behind it

**Problem 2: Sample collapse under filters**

From [`TRADABILITY_REVIEW.md`](TRADABILITY_REVIEW.md:111):

> "Starting from ~90 zones/day, filters remove 95%+, leaving 2-3 trades per level over 60 days."

**You're data-mining noise.** With 7 fib levels × 2 directions × 2 sessions = 28 levels/day, and 95% filtered out, you're picking the 1-2 that happened to work in-sample.

### What Would Actually Work

**Stop looking for geometric confluence. Look for BEHAVIORAL confluence:**

1. **Order flow confluence:**
   - Where did price ACTUALLY reverse in the past 5 sessions?
   - Where are visible stop clusters (above/below recent highs/lows)?
   - Where are round numbers (psychological levels)?

2. **Time-based patterns:**
   - Asia range extension happens most reliably in WHICH session? (London? NY?)
   - At WHAT time does the extension typically occur?
   - _You have this data — analyze it_

3. **Volatility-adjusted levels:**
   - Don't use fixed fib ratios (1.272, 1.618)
   - Use volatility-adjusted extensions: `asiaHigh + N × dailySigma`
   - Where N is calibrated to actual extension frequency (e.g., 1.5σ = 75th percentile)

**Concrete approach:**

```javascript
// Instead of fib confluence, use REALIZED extension frequency
function findActionableLevels(asiaRange, recentSessions, dailySigma) {
  const extensions = [];

  // Analyze last 20 sessions: where did price actually extend to?
  for (const session of recentSessions) {
    const extUp = (session.high - asiaRange.high) / dailySigma;
    const extDn = (asiaRange.low - session.low) / dailySigma;
    extensions.push({ up: extUp, down: extDn });
  }

  // Find the 75th percentile extension (where price reaches 75% of the time)
  const p75Up = percentile(
    extensions.map((e) => e.up),
    0.75,
  );
  const p75Dn = percentile(
    extensions.map((e) => e.down),
    0.75,
  );

  // These are your FADE levels (price reaches here often, then reverses)
  return {
    fadeUp: asiaRange.high + p75Up * dailySigma,
    fadeDn: asiaRange.low - p75Dn * dailySigma,
  };
}
```

**This is what the Range-Line system does** — it uses LEARNED levels from actual price behavior, not geometric ratios.

---

## 4. QMR (NASDAQ) — The Continuation Assumption

### Current Approach

**Overnight → London → NY continuation:** If overnight is up, trade long in NY.

### Why This (Barely) Works

**It's cost-critical** (dead by 4bp). The edge is TINY because:

**Problem: Continuation is not guaranteed**

Overnight gap up can be:

1. **Continuation** (gap and go) → your trade works
2. **Exhaustion** (gap and fade) → your trade loses
3. **Consolidation** (gap and chop) → your trade bleeds costs

**You're trading a weak tendency, not a strong edge.**

### What Would Make It Stronger

**Add a QUALITY filter to the continuation signal:**

1. **Gap size matters:**
   - Small gap (< 0.3%) = noise, skip
   - Medium gap (0.3-0.8%) = tradeable continuation
   - Large gap (> 0.8%) = exhaustion risk, fade or skip

2. **Volume confirmation:**
   - Overnight move on low volume = weak, likely to fade
   - Overnight move on high volume = strong, likely to continue
   - _You don't have volume — this is a data gap_

3. **Macro context:**
   - Continuation works better in LOW VIX environments (< 20)
   - Continuation fails in HIGH VIX environments (> 25)
   - _You have VIX but don't use it in QMR_

4. **Time of day:**
   - Continuation strongest in first 30 min of NY open
   - After 10:30 AM, mean-reversion takes over
   - _Your entry is ~9:25 AM — good, but could be earlier_

**Concrete improvement:**

```javascript
function qmrQualityFilter(overnightMove, vix, gapSize) {
  // Skip if gap too small (noise) or too large (exhaustion)
  if (Math.abs(gapSize) < 0.003 || Math.abs(gapSize) > 0.008) return false;

  // Skip if VIX too high (choppy environment)
  if (vix > 25) return false;

  // Require London to confirm overnight direction
  if (Math.sign(londonMove) !== Math.sign(overnightMove)) return false;

  return true;
}
```

**This would reduce trade frequency but increase win rate.**

---

## 5. Macro/Equity Systems — The Macro Timing Problem

### Current Approach

**Macro composite (liquidity, rates, credit, ISM) → equity allocation (0/25/50/75/100%)**

### Why This Fails

**Problem: Macro is SLOW, markets are FAST**

Macro indicators (Fed balance sheet, ISM, credit spreads) change on:

- Monthly frequency (ISM, employment)
- Weekly frequency (Fed balance sheet)
- Daily frequency (credit spreads, but with lag)

But equity markets move on:

- **Intraday** news/events
- **Overnight** gaps
- **Sentiment** shifts (faster than macro)

**By the time macro says "risk-on", the equity rally is often mature.**

### What Would Actually Work

**Use macro as a FILTER, not a TIMER:**

```
Macro says RISK-ON (bullish composite):
    → Allow long equity exposure
    → Trade technical entries (pullbacks, breakouts)
    → Size normally

Macro says RISK-OFF (bearish composite):
    → Reduce equity exposure to 0-25%
    → Only trade shorts or hedges
    → Size smaller

Macro says NEUTRAL:
    → 50% exposure
    → Trade both directions
    → Size normally
```

**Don't try to time entries with macro. Use macro to set the BIAS, then trade technicals.**

**Example:**

```python
def macro_bias(gli_z, credit_spread_z, curve_slope, ism):
    """Returns: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL'"""
    score = 0

    # Global liquidity expanding
    if gli_z > 1.0: score += 2
    elif gli_z > 0: score += 1
    elif gli_z < -1.0: score -= 2
    else: score -= 1

    # Credit spreads tightening
    if credit_spread_z < -0.5: score += 1
    elif credit_spread_z > 0.5: score -= 1

    # Yield curve steepening
    if curve_slope > 0.5: score += 1
    elif curve_slope < -0.5: score -= 1

    # ISM expanding
    if ism > 52: score += 1
    elif ism < 48: score -= 1

    if score >= 3: return 'RISK_ON'
    if score <= -3: return 'RISK_OFF'
    return 'NEUTRAL'
```

**Then trade equity using TECHNICAL signals, sized by macro bias.**

---

## 6. Cross-Cutting Strategic Issues

### Issue 1: No Position Management

**All systems enter and hope.** There's no:

- Scaling in (add to winners)
- Scaling out (take partials)
- Dynamic stops (trail winners, widen on conviction)

**Range-Line system has this** (chandelier trail) — that's part of why it works.

### Issue 2: No Trade Filtering

**All systems trade every signal.** There's no:

- Skip low-conviction setups
- Skip during high-impact news
- Skip during illiquid hours

**RegimeV7 has event blackout** — that's good. Apply it everywhere.

### Issue 3: No Correlation Management

**All systems trade pairs independently.** If you're:

- Long EUR/USD
- Long GBP/USD
- Long AUD/USD

**You're 3× long USD risk, not 3 independent trades.**

**Solution:** Portfolio-level risk management:

- Max N positions in same direction
- Max correlation between open positions
- Reduce size when correlation > 0.7

### Issue 4: Fixed Stops Are Wrong

**All systems use fixed stops** (ATR × multiplier). But:

- Volatile markets need wider stops
- Quiet markets need tighter stops
- **Fixed stops get run in volatile markets, then price reverses**

**Solution:** Volatility-adjusted stops:

```python
sl_distance = atr * multiplier * (1 + vol_z * 0.2)
# If vol_z = 2 (high vol), stop is 40% wider
# If vol_z = -1 (low vol), stop is 20% tighter
```

---

## 7. Summary: What Would Actually Make Systems Profitable

### Volatility/Forecasting

**Stop:** Always fading at the extreme
**Start:** Classify exhaustion vs continuation FIRST, then fade or follow
**Key:** The edge is the classifier (velocity, day-type, confluence, gap)

### Regime

**Stop:** Trading on backward-looking D1 HMM alone
**Start:** Multi-timeframe regime (HTF bias + MTF structure + LTF trigger)
**Key:** Conviction scoring — only trade when all timeframes align

### Asia Range

**Stop:** Geometric fib confluence (data-mining noise)
**Start:** Behavioral levels (where price actually reversed in past N sessions)
**Key:** Use learned levels from realized extensions, not fixed ratios

### QMR

**Stop:** Trading every overnight continuation
**Start:** Quality filter (gap size, VIX, London confirmation)
**Key:** Reduce frequency, increase win rate

### Macro/Equity

**Stop:** Timing entries with macro
**Start:** Macro as bias filter, technical entries
**Key:** Macro sets direction, technicals set timing

### Cross-Cutting

1. **Add position management** (trail winners, scale out)
2. **Add trade filtering** (skip low-conviction, news, illiquid hours)
3. **Add correlation management** (portfolio-level risk)
4. **Use volatility-adjusted stops** (not fixed ATR multiples)

---

## 8. The One Thing That Works (Range-Line)

**Why does Range-Line work when others don't?**

1. **It trades LEARNED levels** (where price actually reversed), not geometric ratios
2. **It has position management** (chandelier trail captures trends)
3. **It's selective** (one-shot per line per session, no re-entry gaming)
4. **It's tested honestly** (costs on, pessimistic fills, true OOS)

**The lesson:** Trade what price DOES, not what geometry SAYS it should do.

---

## 9. Recommended Next Steps

1. **Build the exhaustion-vs-continuation classifier** for vol systems
   - Test: always-fade vs always-follow vs classifier
   - Hypothesis: Classifier beats both

2. **Build multi-timeframe regime conviction** for regime systems
   - Test: current HMM vs conviction-filtered HMM
   - Hypothesis: Conviction filter improves Sharpe + reduces drawdown

3. **Replace fib confluence with behavioral levels** for Asia range
   - Test: fib levels vs realized-extension levels
   - Hypothesis: Behavioral levels have higher win rate

4. **Add quality filter to QMR**
   - Test: all continuations vs filtered continuations
   - Hypothesis: Filter reduces trades but increases Sharpe

5. **Use macro as bias, not timer** for equity systems
   - Test: macro-timed entries vs macro-biased technical entries
   - Hypothesis: Technical entries with macro bias beat macro timing

**Focus on #1 first** — volatility systems have the most potential because the vol estimate itself is sound. The problem is just the always-fade decision.
