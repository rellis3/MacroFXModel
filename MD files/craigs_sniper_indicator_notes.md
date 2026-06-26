# Craig's Sniper Indicator — Chart Markup & Trading Method

> **Core concept:** Mean reversion trading using automated support/resistance levels, filtered by three internal market biases.

---

## 1. The Three Key Levels

| Level | Type | What It Is |
|---|---|---|
| **Daily Open** | Static | Price at market open — anchor for the day |
| **Pivot Level** | Static | Classic pivot point — key S/R zone |
| **VWAP** | Dynamic | Volume-weighted average price — live mean reversion line |

**Static** levels don't move — reliable anchors each morning.  
**Dynamic** VWAP evolves with price and volume throughout the session.

---

## 2. The Three Internal Biases

These are the filters that determine whether a level is worth trading.

### Pivot Bias
- Measures directional pressure relative to pivot levels
- Slower to change — gives structural context
- **Required to be confirmed** before taking a trade

### Structural Bias
- Assesses the underlying price structure (higher highs/lows etc.)
- Also slower — provides directional backbone
- **Required to be confirmed** alongside pivot bias

### Momentum Bias
- Fast-moving, ticks frequently between bullish/bearish
- Not a standalone signal — used as an **entry trigger**
- Confirms near-term buying/selling pressure at the moment of entry

> **Rule of thumb:** Pivot + Structural bias = the *filter*. Momentum = the *trigger*.

---

## 3. Confluence Confirmed Box

Located in the bottom-right corner of the chart.

- Shows **"Confluence Confirmed"** when pivot bias + structural bias both agree
- Updates in real time
- When confirmed → bias is aligned and the level you're watching has statistical backing
- When not confirmed → skip the trade, even if price hits a key level

---

## 4. Chart Setup — Step by Step

### Indicators to Load
1. **Craig's Sniper Indicator** — plots daily open, pivot, VWAP, and confluence box
2. **Sessions indicator (Lux Algo)** — segments chart into time blocks for session clarity

### Settings to Configure
- **Clean up mode: ON** — filters levels to today + yesterday only (removes clutter)
- **Pivot bias: Dynamic** — flexible directionality
- **Structural flip logic: Close** — cleaner confirmation signals
- Value area highs/lows: hide initially (planned for advanced use later)

### Session Marking
- Highlight your target session (e.g. 08:00–09:00)
- Forces you to only analyse what you'd realistically see live
- Avoids hindsight bias from marking levels after the fact

---

## 5. Trade Entry Workflow

```
Price approaches key level (Daily Open / Pivot / VWAP)
         ↓
Check Confluence Box
         ↓
  Is it "Confluence Confirmed"?
     YES ↓              NO → Skip trade
  Pivot bias bullish/bearish?
  Structural bias matching?
         ↓
  Wait for Momentum to flip in your direction
         ↓
         ENTER
         ↓
  Stop loss: just beyond recent swing high/low
```

### Long Setup Example
1. Price retraces to daily open
2. Confluence box shows "Confirmed" (pivot + structural = bullish)
3. Momentum flips bullish
4. Enter long
5. Stop loss below recent swing low

### Short Setup Example
Mirror of the above — pivot + structural = bearish, momentum flips bearish, enter short at a key level.

---

## 6. Alert System

- Set price alerts at **daily open** and **pivot level**
- Alerts fire when price approaches — you don't need to watch the chart constantly
- When alerted, check confluence box before acting
- Only take action if conditions are met

---

## 7. Backtesting Notes

- Thousands of trades validated the indicator
- Not all hours are worth trading — results confirmed to focus on specific sessions
- 24/7 trading is impractical; session-focused markup matches real trader availability
- Confluences statistically improve win rate vs trading every level blindly

---

## 8. Planned Additions (Advanced Confluence)

These are future layers to stack on top of the base system once comfortable:

- **Volume Profile Value Areas** — Volume Area High (VAH) and Volume Area Low (VAL)
- **Fibonacci levels** — additional confluence when price clusters near Fib zones
- Other volume-based supports

> Don't add these until the base system is internalised. More confluence ≠ always better.

---

## 9. Key Principles to Internalise

| Principle | Detail |
|---|---|
| **Levels without confluence are noise** | A great level with no bias alignment = skip it |
| **Momentum is a trigger, not a signal** | Don't enter on momentum alone — wait for bias confirmation first |
| **Static levels are your anchor each morning** | Daily open + pivot are the first things you mark |
| **Session focus removes hindsight bias** | Only look at what you'd see in your live session |
| **Objective over discretionary** | The confluence box removes guesswork — trust the system |

---

## 10. Quick Reference Checklist

Before every trade:

- [ ] Price is at or near a key level (daily open / pivot / VWAP)
- [ ] Confluence box shows "Confluence Confirmed"
- [ ] Pivot bias agrees with trade direction
- [ ] Structural bias agrees with trade direction
- [ ] Momentum has flipped in trade direction
- [ ] Stop loss placed beyond recent swing structure
- [ ] You are inside your defined trading session

---

*Source: Craig's Sniper Indicator video walkthrough — mean reversion + confluence bias method*
