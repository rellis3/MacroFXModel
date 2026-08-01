# Trading Logic Analysis — Strategic Improvements (Revised)

> **Context:** After reviewing all backtest systems, the question is: **ignoring code bugs, what strategic changes would make these systems profitable?** This analysis follows the CLAUDE.md principles: no prejudging, no selling words, evidence-based suggestions only.

---

## 1. Volatility/Forecasting Systems — The Classifier Hypothesis

### Current State (Evidence)

- Always fades at HL_75 band
- Sharpe degrades 56% IS→OOS (0.75 → 0.33)
- 9/26 pairs go negative OOS
- 96% positive IS Sharpe (suspiciously high)

### The Hypothesis

**At an extreme, price either mean-reverts OR continues. The current strategy assumes mean-reversion 100% of the time.**

### Testable Improvement

Build a classifier that decides fade vs follow at the extreme:

**Inputs already in codebase:**

- [`touchFeatures.js`](js/touchFeatures.js:1) — `approach_velocity` (fast spike vs slow grind)
- [`dayTypeCore.js`](js/dayTypeCore.js:1) — `dayTypeScore` (T score: low = mean-reverting, high = trend)
- Confluence detection (multiple timeframe alignment)
- Time in session
- Gap size

**Test structure:**

```javascript
// A/B test three strategies on same data:
// 1. Current: always fade
// 2. New: always follow
// 3. Classifier: fade when exhaustionScore > 0.6, follow when < 0.4, skip middle

function exhaustionScore(velocity, dayType, confluence, timeInSession, gapPct) {
  let score = 0;
  if (velocity > 0.6 * sigma) score += 0.3; // Fast approach
  if (timeInSession > 0.7) score += 0.2; // Late session
  if (dayType < 0.3) score += 0.2; // Low T (mean-reverting day)
  if (confluence) score += 0.2; // Structure support
  if (Math.abs(gapPct) > 0.5 && sameDirectionAsGap) score += 0.1;
  return score;
}
```

**Pre-registered outcomes:**

- **"Worked":** Classifier OOS Sharpe > max(fade, follow) by ≥0.2, with ≥30 OOS trades
- **"Didn't":** Classifier ≤ best single-direction strategy

**Why this might work:** The vol estimate itself is sound (you already know the range). The problem is the blind fade decision. Separating exhaustion from continuation could capture both regimes.

**Why this might not work:** The features might not actually predict the regime. The classifier could overfit to IS noise.

**Next step:** Build the A/B test, run it, report both outcomes honestly.

---

## 2. Regime Systems — Multi-Timeframe Conviction

### Current State (Evidence)

- HMM on D1 returns → BULL/BEAR/RANGE
- Trades on M30 bars
- ADX one-bar-future shift contaminates results

### The Hypothesis

**D1 regime is backward-looking and too slow for M30 trading. Multi-timeframe alignment might filter weak setups.**

### Testable Improvement

Add conviction scoring across timeframes:

**Already in codebase:**

- D1 HMM regime
- ADX (after fixing the shift)
- `vol_z` (volatility expansion/contraction)
- EMA slopes at multiple timeframes

**Test structure:**

```python
def regime_conviction(d1_regime, d1_slope, h4_slope, m30_slope, adx, vol_z):
    """Returns conviction 0-100"""
    if d1_regime == 'RANGE':
        return 0

    conviction = 0

    # Trend strength
    if adx > 25: conviction += 30
    elif adx > 20: conviction += 15

    # Volatility expansion
    if vol_z > 1.0: conviction += 20
    elif vol_z > 0.5: conviction += 10

    # Timeframe alignment
    slopes = [d1_slope, h4_slope, m30_slope]
    if d1_regime == 'BULL' and all(s > 0.001 for s in slopes):
        conviction += 30
    elif d1_regime == 'BEAR' and all(s < -0.001 for s in slopes):
        conviction += 30

    return conviction

# Trade only when conviction > 60
```

**Pre-registered outcomes:**

- **"Worked":** Conviction-filtered OOS Sharpe > unfiltered by ≥0.3, with ≥30 OOS trades
- **"Didn't":** Conviction filter ≤ unfiltered or reduces trades below 30

**Why this might work:** Filtering weak/ambiguous regimes could improve win rate.

**Why this might not work:** The filter might just reduce sample size without improving edge. The regime itself might not be predictive.

**Next step:** Fix ADX shift first, then A/B test filtered vs unfiltered.

---

## 3. Asia Range — Behavioral vs Geometric Levels

### Current State (Evidence)

- Trades fib levels (1.272, 1.618, etc.)
- Confluence = multiple timeframes align
- Sample collapses to 2-3 trades per level
- No committed OOS run

### The Hypothesis

**Geometric fib ratios are arbitrary. Levels where price actually reversed in recent sessions might be more predictive.**

### Testable Improvement

Replace fib levels with realized-extension levels:

**Test structure:**

```javascript
// Instead of fixed fib ratios
function findBehavioralLevels(asiaRange, recentSessions, dailySigma) {
  const extensions = [];

  // Analyze last 20 sessions: where did price actually extend to?
  for (const session of recentSessions) {
    const extUp = (session.high - asiaRange.high) / dailySigma;
    const extDn = (asiaRange.low - session.low) / dailySigma;
    extensions.push({ up: extUp, down: extDn });
  }

  // 75th percentile = where price reaches 75% of the time
  const p75Up = percentile(
    extensions.map((e) => e.up),
    0.75,
  );
  const p75Dn = percentile(
    extensions.map((e) => e.down),
    0.75,
  );

  return {
    fadeUp: asiaRange.high + p75Up * dailySigma,
    fadeDn: asiaRange.low - p75Dn * dailySigma,
  };
}
```

**Pre-registered outcomes:**

- **"Worked":** Behavioral levels OOS win rate > fib levels by ≥5%, with ≥30 OOS trades
- **"Didn't":** Behavioral ≤ fib or insufficient sample

**Why this might work:** Range-Line system uses learned levels and it works. This applies the same principle to Asia range.

**Why this might not work:** Recent extensions might not predict future extensions. The sample might still be too small.

**Next step:** Build both versions, run honest OOS split, compare.

---

## 4. QMR — Quality Filter

### Current State (Evidence)

- Overnight → London → NY continuation
- Cost-critical (dead by 4bp)
- Honest run shows Sharpe 1.18 OOS but fragile

### The Hypothesis

**Not all continuations are equal. Filtering by gap size, VIX, and London confirmation might improve win rate.**

### Testable Improvement

Add quality gates:

**Already in codebase:**

- Gap size calculation
- VIX data
- London session move

**Test structure:**

```javascript
function qmrQualityFilter(overnightMove, londonMove, vix, gapSize) {
  // Skip if gap too small (noise) or too large (exhaustion)
  if (Math.abs(gapSize) < 0.003 || Math.abs(gapSize) > 0.008) return false;

  // Skip if VIX too high (choppy environment)
  if (vix > 25) return false;

  // Require London to confirm overnight direction
  if (Math.sign(londonMove) !== Math.sign(overnightMove)) return false;

  return true;
}
```

**Pre-registered outcomes:**

- **"Worked":** Filtered OOS Sharpe > unfiltered by ≥0.2, even if trade count drops
- **"Didn't":** Filtered ≤ unfiltered or reduces trades below 30

**Why this might work:** Reducing noise trades could improve Sharpe even with fewer trades.

**Why this might not work:** The filter might just reduce sample size without improving edge. The continuation signal itself might be too weak.

**Next step:** A/B test filtered vs unfiltered on same OOS window.

---

## 5. Macro/Equity — Macro as Bias, Not Timer

### Current State (Evidence)

- Macro composite → equity allocation (0/25/50/75/100%)
- WALCL units bug (millions vs billions)
- Safe-haven sign inversion

### The Hypothesis

**Macro indicators (monthly ISM, weekly Fed balance sheet) are too slow to time entries. Using macro as directional bias + technical entries might work better.**

### Testable Improvement

Two-layer approach:

**Test structure:**

```python
# Layer 1: Macro bias (slow)
def macro_bias(gli_z, credit_spread_z, curve_slope, ism):
    score = 0
    if gli_z > 1.0: score += 2
    if credit_spread_z < -0.5: score += 1
    if curve_slope > 0.5: score += 1
    if ism > 52: score += 1

    if score >= 3: return 'RISK_ON'
    if score <= -3: return 'RISK_OFF'
    return 'NEUTRAL'

# Layer 2: Technical entry (fast)
# - RISK_ON: allow long, trade pullbacks to EMA-20
# - RISK_OFF: reduce to 0-25%, only shorts
# - NEUTRAL: 50%, trade both directions
```

**Pre-registered outcomes:**

- **"Worked":** Macro-biased technical entries OOS Sharpe > macro-timed entries by ≥0.3
- **"Didn't":** Macro-biased ≤ macro-timed

**Why this might work:** Macro sets direction, technicals set timing. Separates slow and fast signals.

**Why this might not work:** The macro bias might not be predictive. The technical entries might not have edge.

**Next step:** Fix WALCL units bug first, then A/B test both approaches.

---

## 6. Cross-Cutting Improvements

### Position Management

**Current:** Enter and hope
**Test:** Add chandelier trail (like Range-Line)

**Pre-registered:** Trail OOS Sharpe > fixed TP by ≥0.2

### Trade Filtering

**Current:** Trade every signal
**Test:** Skip during high-impact news (already have event blackout in RegimeV7)

**Pre-registered:** Filtered OOS Sharpe > unfiltered by ≥0.1

### Correlation Management

**Current:** Trade pairs independently
**Test:** Max 2 positions in same direction, max correlation 0.7

**Pre-registered:** Correlation-managed OOS Sharpe > unmanaged by ≥0.1

### Volatility-Adjusted Stops

**Current:** Fixed ATR × multiplier
**Test:** `sl_distance = atr * multiplier * (1 + vol_z * 0.2)`

**Pre-registered:** Vol-adjusted OOS Sharpe > fixed by ≥0.1

---

## 7. Why Range-Line Works (Evidence-Based)

**Facts:**

- Sharpe 4.7-6 @2-3× cost
- DSR 100%, OOS ≥ IS
- Every year + every fold green

**What it does differently:**

1. Trades learned levels (where price actually reversed), not geometric ratios
2. Has position management (chandelier trail)
3. Is selective (one-shot per line per session)
4. Tested honestly (costs on, pessimistic fills, true OOS)

**The lesson:** It trades what price DOES, not what geometry SAYS it should do.

---

## 8. Recommended Testing Order

### Priority 1: Volatility Classifier

**Why:** Vol estimate is sound, just the decision is wrong. Highest potential.
**Test:** Always-fade vs always-follow vs classifier
**Timeline:** 1-2 days to build, 1 day to run

### Priority 2: Regime Conviction

**Why:** Regime systems have infrastructure, just need better filtering.
**Test:** Current HMM vs conviction-filtered HMM
**Timeline:** Fix ADX shift first (1 day), then test (1 day)

### Priority 3: Asia Behavioral Levels

**Why:** Range-Line proves learned levels work.
**Test:** Fib levels vs realized-extension levels
**Timeline:** 2 days to build, 1 day to run

### Priority 4: QMR Quality Filter

**Why:** Already has honest run, just needs refinement.
**Test:** All continuations vs filtered continuations
**Timeline:** 1 day to build, 1 day to run

### Priority 5: Macro as Bias

**Why:** Needs WALCL bug fix first.
**Test:** Macro-timed vs macro-biased technical entries
**Timeline:** Fix bugs (1 day), then test (2 days)

---

## 9. What NOT to Do (Anti-Patterns from CLAUDE.md)

- ❌ Don't prejudge any idea before testing
- ❌ Don't use "promising" or "game-changer" without evidence
- ❌ Don't report in-sample numbers as edge
- ❌ Don't assume the classifier will work — test it
- ❌ Don't oversell the next idea to soften a null
- ❌ Don't add more parameters to optimize — add principled selectors

---

## 10. The Honest Assessment

**What we know:**

- Range-Line works (proven OOS)
- Everything else fails OOS or has no committed OOS run
- The vol estimate is sound
- The regime infrastructure exists
- The macro data exists

**What we don't know:**

- Whether the classifier will work
- Whether conviction filtering will work
- Whether behavioral levels will work
- Whether quality filters will work

**The only way to know:** Build the tests, run them honestly, report both outcomes.

**The bar:** OOS Sharpe improvement ≥0.2, with ≥30 OOS trades. Anything less is noise.
