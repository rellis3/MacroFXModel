# Weekly Vol & Range Forecast — How To Trade Guide

**Purpose:** Practical reference for reading and trading the weekly vol forecast output  
**Instruments covered:** All FX pairs, Gold, NQ, SPX500, DE30, UK100, US30, US2000  

---

## WHAT THE WEEKLY FORECAST PRODUCES

Six numbers per instrument, across two time horizons:

| Metric | Horizon | What It Measures |
|---|---|---|
| **H-L Range Median** | 5-day / 20-day | The typical week's (or month's) total high-to-low swing as % of the weekly open |
| **H-L Range 75th** | 5-day / 20-day | Stretch week — only 1 week in 4 exceeds this range |
| **O→H / O→L Median** | 5-day / 20-day | Expected distance from Monday's open to the week's high or low |
| **O→H / O→L 75th** | 5-day / 20-day | Stretch target — extreme of the weekly move |

Each figure is derived from the daily GARCH volatility model scaled by **√5** (weekly) or **√20** (monthly). The same median/75th percentile split used for daily levels applies here — median is the central case, 75th is where only 1 in 4 periods reaches.

**Range ≠ Move.** A 2% weekly H-L / 0.3% O→H means choppy rotation around the open. A 2% weekly H-L / 1.8% O→H means a trending week where the open is near the low. Reading both together defines the *shape* of the week before it unfolds.

---

## THE WEEKLY ANCHOR OPEN

### FX Pairs
The week opens **Sunday ~22:00 UTC** (17:00 EST) — that is when Oanda's Monday D1 bar begins. All weekly levels are anchored to that Sunday-night open price, not Monday midnight or the London open.

In practice: read the Monday D1 open from your broker on Sunday evening. All `O→H`, `O→L`, and `H-L` levels are calculated from this price.

### Indices (SPX500, NQ, DE30, UK100, US30, US2000)
There is no Sunday session for equity indices. The weekly anchor is **Monday's first traded D1 bar open** at each exchange's local open time:
- **US indices** (NQ, SPX500, US30, US2000): Monday ~14:30 UTC
- **UK100**: Monday ~08:00 UTC
- **DE30**: Monday ~09:00 CET (08:00 UTC)
- **Gold**: Follows the FX Sunday-night open (~22:00 UTC)

### When To Run The Forecast
The forecast can be generated at any time — the GARCH model runs on historical D1 bars and does not require the current week to be open. The best practice is to generate it **Sunday evening after the FX market opens** so you have the live weekly open price to anchor your levels.

---

## THE FIVE OUTPUT FIELDS

### 1. Bias + Confidence
```
Bias: Bullish  [High confidence]
```
Derived from three independent signals:
- **WTD momentum** — current week's open-to-close direction
- **Daily HMM regime** — hidden Markov model on D1 returns
- **5m HMM regime** — intraday regime if available

`High confidence` = at least 2 of the 3 signals agree. Use this to decide *which side* of the weekly range to prioritise. Bullish bias = buy the weekly O→L level, target the O→H level. Bearish = reverse.

### 2. Regime Signals
```
Regime signals: BULL (daily HMM) · BULL (5m HMM)
```
The HMM regime tells you whether the underlying price process is trending or ranging. This matters for level selection:
- **TREND regime**: The 75th percentile levels are more likely to be hit than the historical base rate implies. Give targets room and trail rather than fading.
- **RANGE regime**: The median levels act as genuine reversal zones. Fade the O→H/O→L median levels with tighter stops.

### 3. WTD Momentum
```
WTD momentum: Bullish  (+0.42% open→close)
```
The week-to-date net move relative to Monday's open. Once this exceeds the O→C median, the week's directional component is effectively "used up" — further range consumption is more likely rotational.

### 4. Range Consumed + Remaining Budget
```
Range consumed: 62%  (1.14% of 1.84% budget)
Remaining budget: 0.70%  (3 days in)
```
This is the most actionable real-time field. It tells you how much of the weekly H-L forecast has already been realised.

| Consumed | Interpretation |
|---|---|
| < 40% | Week is still open — full levels in play |
| 40–70% | Normal mid-week consumption — remain in trend direction |
| 70–90% | Range nearing exhaustion — reduce new position size |
| > 90% | Week extended — fade bias, mean reversion more likely |

### 5. 5-Day and 20-Day Forecast Levels
```
── 5-Day (Weekly)
H-L range     : 1.84%      75th: 2.31%
O→H / O→L    : 1.12%      75th: 1.48%

── 20-Day (Monthly)
H-L range     : 3.68%      75th: 4.62%
O→H / O→L    : 2.24%      75th: 2.96%
```
The 20-day figures are your monthly context. If the weekly O→H median sits close to the 20-day O→H median, the week is expected to complete the monthly move — high-probability target. If the weekly is a fraction of the monthly, the week is likely a single leg within a larger monthly structure and there will be continuation the following week.

---

## CHART IMPLEMENTATION — STEP BY STEP

### Step 1 — Anchor the weekly open
On Sunday night (FX) or Monday morning (indices), read the D1 open price. Mark this as a horizontal level on your chart — all other levels are calculated from it.

### Step 2 — Plot the four weekly levels
From the weekly open price `O`:

| Level | Price | Description |
|---|---|---|
| **O→H Med** | `O + (O × oc_5d / 100)` | Median weekly high — primary resistance / TP |
| **O→H 75th** | `O + (O × oc_5d_75 / 100)` | Stretch high — only 25% of weeks exceed this |
| **O→L Med** | `O − (O × oc_5d / 100)` | Median weekly low — primary support / TP |
| **O→L 75th** | `O − (O × oc_5d_75 / 100)` | Stretch low — only 25% of weeks exceed this |

These four lines create the week's **range bracket** — the statistical envelope the week is expected to stay within.

### Step 3 — Assign roles based on bias
- **Bullish bias**: O→L Med and O→L 75th become *entry zones*. O→H Med and O→H 75th become *TP targets*.
- **Bearish bias**: Reverse.
- **Neutral / Low confidence**: Use both sides as fade zones — sell O→H 75th, buy O→L 75th with tight risk.

### Step 4 — Size using range consumed
Reduce position size as the week's range is consumed:
- Entry at O→L Med when consumed < 30%: full size
- Entry at O→L Med when consumed > 70%: half size or skip

### Step 5 — Use 20-day context for conviction
If the weekly O→H Med level coincides with (or exceeds) the monthly O→H Med level, the setup has monthly-level significance — this is where institutions are likely to have order flow and the level has additional confluence.

---

## RELATIONSHIP TO THE DAILY FORECAST

The weekly and daily forecasts are consistent — the weekly is the daily model scaled up, not a separate calculation. This means:

- The **daily O→H Med level** on Monday is a sub-target within the weekly O→H Med
- A day that closes at its daily O→H Med is contributing ~20% of the weekly budget toward the weekly O→H Med
- If Monday fully realises its daily H-L median, you have consumed ~45% of the weekly budget (1/√5 ≈ 45%) in a single session

**Practical use:** On a day where the daily forecast says high vol and the weekly still has 80%+ remaining budget, you have alignment on both timeframes — the day is expected to move *and* there is room in the weekly budget to sustain it.

---

## KEY LIMITATIONS

1. **√T scaling assumes independence.** The 5-day forecast is `daily_median × √5` which assumes each day's return is independent. In strong trending regimes (confirmed by HMM BULL/BEAR), actual weekly ranges exceed this estimate. In choppy/news-driven weeks they can fall short.

2. **No intraday structure.** The weekly forecast is silent on *when* during the week the high or low is printed. Monday often sets a weekly extreme that holds all week; or Wednesday. The daily hit-rate data is more useful for timing.

3. **The forecast anchors to Monday's open.** If you miss the Sunday-night FX open and enter on Tuesday, your O→H/O→L levels are still anchored to Monday's open, not Tuesday's. The consumed range field accounts for this — check it before using the levels as entries.

4. **Indices have gaps.** SPX500, NQ, etc. can open Monday with a gap above or below Friday's close. The weekly open used in the forecast is Monday's actual D1 open (post-gap), so the levels account for the gap automatically.

---

## QUICK REFERENCE — EXPORT FORMAT

```
──── EURUSD ──────────────────────
Bias                : Bullish  [High confidence]
Regime signals      : BULL (daily HMM)
WTD momentum        : Bullish  (+0.42% open→close)
Range consumed      : 62%  (1.14% of 1.84% budget)
Remaining budget    : 0.70%  (3 days in)

── 5-Day (Weekly)
H-L range           : 1.84%      75th: 2.31%
O→H / O→L          : 1.12%      75th: 1.48%

── 20-Day (Monthly)
H-L range           : 3.68%      75th: 4.62%
O→H / O→L          : 2.24%      75th: 2.96%

Volatility (ann)    : 7.23%  [42nd pct]
Note                : 62% of weekly range consumed
```

**Field key:**
- `H-L range` = total weekly high-to-low budget
- `O→H / O→L` = distance from Monday open to the week's high or low
- `75th` = level exceeded only 1 week in 4
- `Range consumed` = % of the H-L median already realised WTD
- `Remaining budget` = how many % points of range remain
- `Vol pct` = where current annualised vol sits in its historical distribution (low = quiet, high = elevated risk)
