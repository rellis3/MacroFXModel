# Forecast Markup & Price Exhaustion Trading Guide

> Derived from: "Volatility & Range Forecast" video walkthrough series (Colez Trades)  
> Instruments demonstrated: EUR/USD, Gold  
> Core concept: **Trade price exhaustion at statistically forecasted range extremes — not direction**

---

## Part 1 — The Core Idea

### Why forecast range instead of direction?

Short-term market direction is extremely noisy. Countless professional models fail to beat a coin flip on a day-to-day basis. Volatility, however, is **persistent and mean-reverting** — today's range is meaningfully predicted by recent history.

The strategy bypasses the hardest problem in trading (direction) and instead asks a simpler, more answerable question:

> **"How far is price likely to travel today?"**

Once you know the expected journey distance, you watch both ends of that journey. When price arrives at one end and shows exhaustion, *that* is the trade.

This is not a directional model. It is a **range exhaustion model**.

---

## Part 2 — What You Need Before the Session Opens

Before the trading day begins, you need three published numbers for your instrument:

| Number | What It Is | Example |
|---|---|---|
| **High–Low range %** | Expected full candle amplitude (high to low), expressed as % of open | 2.65% (NQ), 0.53% (EUR/USD) |
| **Open–Close move %** | Expected net directional drift from open to close | 1.22% |
| **Percentile context** | Where today's forecast sits vs historical distribution | 75th = stretch day |

These numbers come from the volatility forecasting model (outperforms GARCH, realised vol, Parkinson, and Harvey benchmarks in the video series). The **median** is your working number. The **75th percentile** is your stretch reference — exceeded only 1 day in 4.

> **Rule:** Get these numbers the evening before or early morning. Do not enter the session without them.

---

## Part 3 — Chart Markup: Step-by-Step

### The tools you need
- TradingView (or equivalent)
- Price Range drawing tool
- Horizontal ray tool
- Vertical line tool

---

### Step 1 — Bound the session

Drop vertical lines at `00:00` (session open) and `00:00` the next day (session close). Everything you do lives inside these lines.

```
|←————————— This session ————————→|
00:00                           00:00
```

> **Why 00:00?** The forecast anchors to the full 24-hour calendar day candle. Reading the open from any other candle (e.g. NY open at 14:30 UTC) causes all your levels to drift. This is non-negotiable.

---

### Step 2 — Mark the session open

Draw a horizontal ray at the **00:00 candle's open price**. Label it `Open`. This is the denominator for every percentage calculation that follows.

---

### Step 3 — Wait for the first extreme to print

Do not project levels immediately. Let price move and establish either:
- The **first significant high** (if price rises first), or
- The **first significant low** (if price falls first)

"Significant" means: a high or low that has not yet been broken when you check.

---

### Step 4 — Project the opposite extreme

Once you have an anchor extreme, use the **Price Range tool** to project the forecasted percentage in the opposite direction:

```
IF first extreme is a HIGH:
    Drag Price Range tool DOWN from that high
    Set distance = High–Low range % (e.g. 0.53%)
    The bottom of the range tool = Expected Low

IF first extreme is a LOW:
    Drag Price Range tool UP from that low
    Set distance = High–Low range % (e.g. 2.65%)
    The top of the range tool = Expected High
```

Extend a **horizontal ray** at the projected level. Label it `Expected High` or `Expected Low`.

---

### Step 5 — Apply the Open–Close envelope (both sides)

Separately, project **±(open-close %)** symmetrically above and below the open:

```
Upper envelope = Open + open-close%
Lower envelope = Open − open-close%
```

Draw this as two horizontal rays or a box. The closing price is expected to land inside this band on a median day.

| Close location | What it means |
|---|---|
| Inside the envelope | Normal session, no strong directional bias |
| At the edge | Median trend day — directional bias confirmed |
| Outside the envelope | 75th-percentile stretch day — rare, do not chase |

---

### Step 6 — Dynamic re-anchoring throughout the session

This is the most important mechanical discipline in the whole strategy.

**The forecast anchor must always come from the most recent extreme.**

As the session progresses:
- If a **new low** prints below your current anchor low → move your anchor to the new low, re-project the Expected High from there
- If a **new high** prints above your current anchor high → move your anchor to the new high, re-project the Expected Low from there

```
EXAMPLE SEQUENCE (EUR/USD, downtrend day):

09:00  Low at 1.0850 → project Expected High from 1.0850
10:30  New low at 1.0832 → re-anchor, project Expected High from 1.0832
11:45  New low at 1.0818 → re-anchor, project Expected High from 1.0818
13:00  Price hits Expected High at 1.0818 + 0.53% → WATCH FOR REJECTION
```

> **Why re-anchor?** Because you don't know which low will be the low of the day. By always projecting from the most recent extreme, you ensure your Expected level is always valid regardless of what comes next.

---

## Part 4 — Reading Price Exhaustion: The Trade Signal

### What you are watching for

When price approaches your `Expected High` or `Expected Low` level, you are watching for **price exhaustion** — evidence that the day has used its range budget and cannot extend further.

Signs of exhaustion at the projected level:
- Price touches the level and immediately reverses (strong rejection wick)
- Price approaches but stalls with multiple small candles failing to close through
- Volume drops as price reaches the level (if data is available)
- The move into the level is "climactic" — accelerating into the touch

### Confirmation

The trade is confirmed when:
1. Price reaches the projected level
2. Price reverses
3. Price **closes below** the projected high (or above the projected low) and does not recover

Until confirmation, the level is a watch zone, not a signal.

---

### The Trade Setup

```
SCENARIO A — Shorting the Expected High

Setup:    Price has established a low early in the session
          Expected High has been projected upward
          Price climbs toward the level through the session

Entry:    When price touches Expected High and shows rejection
          (e.g. rejection wick on 3m / 5m candle at the level)

Stop:     Above the Expected High level
          (if 75th percentile range is breached, the forecast is wrong — exit)

Target:   Back toward the session low / open
          (range already priced in = expect mean reversion)

─────────────────────────────────────────────────
SCENARIO B — Buying the Expected Low

Same logic, reversed. Price has established a high.
Expected Low projected downward. Watch for touch + rejection.
Entry on confirmation, stop below the level, target the session high.
```

---

## Part 5 — The Range Budget Concept

This is the **most powerful intraday filter** in the strategy.

```
Range budget consumed = (Current high − Current low) / (Daily open price)
Range budget remaining = Forecasted H–L % − Budget consumed
```

As the session progresses and price has already covered most of the forecasted range:
- **Breakout / continuation probability collapses**
- **Mean-reversion probability rises**

Example:
- Median range: 0.53%
- By 14:00, price has already moved 0.50%
- Expected remaining range: 0.03% = noise
- Any "breakout" from here is statistically dubious
- The correct trade is fading extensions, not following them

> This reasoning is **unavailable without a range forecast.** It is the key edge this approach gives you over vanilla technical analysis.

---

## Part 6 — The Two-Sided Distribution Rule

Always maintain both sides simultaneously:

```
HIGH SIDE:   Project Expected Low from the current day's high
LOW SIDE:    Project Expected High from the current day's low
```

You do not need to know which side will be hit first. By maintaining both:
- You are covered regardless of the morning direction
- You avoid the directional bias trap
- When one side is hit and confirmed, the other side tells you how much remaining range exists

If the day has already priced in the Low → High move (low-to-high distance ≥ forecasted H–L range), the probability of a new low is now very low. This is a natural stop to adding shorts.

---

## Part 7 — Open-to-Close Overlay

The open-to-close % tells you where the **closing price** is expected to land.

### Combining it with the High–Low forecast

If the forecasted High–Low move has already been met **to the downside** (the low is in), the upside close scenario becomes very unlikely. The open-to-close envelope now biases toward the **lower half**, because:

- A full range has printed high → low
- A bullish close above open would require exceeding the range budget
- The model therefore now points to a **bearish close**

This is a **probability filter**, not a guarantee. But it removes the need to predict direction — the range tells you which close scenario is more likely.

---

## Part 8 — Common Mistakes to Avoid

| Mistake | Why it hurts | Correction |
|---|---|---|
| Anchoring from the wrong candle | All levels drift, false Expected levels | Always anchor from 00:00 candle open |
| Not re-anchoring when a new extreme prints | Stale level, wrong Expected target | Every new extreme → re-project |
| Entering at the level without waiting for rejection | Catching a knife, large losses if level breaks | Wait for rejection + close confirmation |
| Trading against a level when range budget is 0 | Fighting momentum that has already exhausted | Check remaining budget before entry |
| Ignoring the 75th percentile | Stopping too tight on stretch days | Note 75th as "override" level if median breaks |
| Predicting which side gets hit first | Creates directional bias before market shows its hand | Maintain both sides, let price decide |

---

## Part 9 — Worked Examples from the Videos

### Example 1 — EUR/USD, 0.53% range

- Forecast posted evening of the 28th, for the 29th (Friday)
- Morning: highest high established early
- Expected Low projected 0.53% below
- High remained the high until late in session
- When high was finally broken: price had already priced in the Low → High move
- **High of the day confirmed** once price closed below forecasted high with no recovery

### Example 2 — EUR/USD, 0.52% range

- Day began: highest high marked, Expected Low projected
- Low broke → re-anchored to new low
- New low broke → re-anchored again
- Eventually: price drove up to Expected High (projected from final anchor low)
- **Immediate rejection** at Expected High
- High of the day confirmed — no candle closed above it again
- Entry at rejection → target back to session lows

### Example 3 — EUR/USD, 2.65% range (NQ-type vol)

- 1:00 AM: first significant high established
- Expected Low projected from that high
- 14:30 (NY open): price hit Expected Low
- Strong rejection + closed above Expected Low
- **Low of the day confirmed** since 1:00 AM
- Entry at the rejection at NY open — target back toward session high

### Example 4 — Gold, open-to-close overlay

- High–Low range: 2.56%, Open–Close: 1.22%
- High printed early, Expected Low projected downward
- Throughout day: no trade above the marked high
- Session close tracked exactly to forecasted open-to-close level
- The combination of H–L + O–C gave a "bearish close bias" once the high was in

---

## Part 10 — Daily Workflow Checklist

```
[ ] PRE-SESSION
    [ ] Read published H–L range % and O–C move %
    [ ] Note median and 75th percentile for the day
    [ ] Note annualized vol figure — compare to GARCH output and recent history
    [ ] Open chart, drop verticals at 00:00 → next 00:00
    [ ] Mark 00:00 open with horizontal ray (label: "Open")
    [ ] Apply ±O–C% envelope above and below the open

[ ] EARLY SESSION (first 1–3 hours)
    [ ] Wait for first significant extreme to establish
    [ ] Project H–L range % to opposite side using Price Range tool
    [ ] Label Expected High / Expected Low ray
    [ ] Maintain both sides simultaneously

[ ] MID SESSION (ongoing)
    [ ] Re-anchor whenever a new extreme prints
    [ ] Track range budget consumed vs forecast
    [ ] Note if >80% of range consumed → fade extension bias kicks in
    [ ] Watch for price approaching Expected levels

[ ] AT THE LEVEL (trade execution)
    [ ] Is this price reaching the Expected High or Expected Low?
    [ ] Does the approach show exhaustion / slowing momentum?
    [ ] Is there a rejection wick or stall at the level?
    [ ] Wait for close confirmation (close on the correct side of the level)
    [ ] Enter with stop beyond the level (75th percentile = hard stop)
    [ ] Target: back toward session anchor or open

[ ] END OF SESSION
    [ ] Did H–L range get met? Was O–C close in the envelope?
    [ ] Log: Date | Forecasted % | Actual % | Level hit? | Trade result
    [ ] Grade accuracy over the sample — not this single day
```

---

## Part 11 — Key Principles to Internalise

**1. Volatility is easier to forecast than direction.**
This is empirically proven. The model beats GARCH, realised vol, Parkinson, and Harvey. Trade the thing that's forecastable.

**2. The forecast is a distribution, not a point prediction.**
The median is your working hypothesis. Single days miss. Calibration is over 20+ sessions, not any one trade.

**3. Range budget is the most powerful intraday filter you have.**
When the budget is spent, stop trying to trade breakouts. The edge has flipped to mean reversion.

**4. You never need to predict direction.**
The two-sided distribution covers both scenarios. Let price show you which extreme is next. Your job is to be ready at both ends.

**5. Confirmation before entry.**
A level being touched is not a signal. A level being touched, rejected, and having price close on the correct side — that is a signal. Be patient.

**6. Grade over the sample.**
The presenter repeatedly emphasises: individual days hit, miss, and overshoot. The edge is statistical and only visible over many sessions. Do not abandon the approach because one day behaves differently.

---

## Cross-Reference: Integration with Existing Dashboard

| This Guide | Dashboard Layer |
|---|---|
| H–L range % input | `GARCH 68%/95% CI bands` — cross-validate external forecast vs model |
| Range budget consumed | `usedPct` / `remainingRange` fields in dashboard |
| Percentile context | `sizeMult` regime classifier → LOW / NORMAL / HIGH |
| Expected High/Low levels | Fib confluence scanner — boost star rating if Fib sits within N pips |
| Expected High/Low levels | OI analyser — boost conviction if call wall / put wall aligns |
| O–C envelope | Directional bias filter for AI analysis card |

---

*Source: Colez Trades — "Volatility & Range Forecast" walkthrough series*  
*Companion to: `DAILY_VOL_RANGE_FORECAST_GUIDE.md`, `VOLATILITY_IMPLEMENTATION_GUIDE.md`*  
*Internal reference only. Not financial advice.*
