# Jay's Pivot Trading Method
## Chart Mark-Up & Trade Execution Reference

---

## Core Philosophy

Jay's approach combines **pivot points as structural anchors** with Fibonacci retracements, volume profile, momentum divergence, and money flow — creating a multi-layer confluence framework for both reversal and continuation trades.

> The pivot is the daily anchor. Everything else is confirmation.

---

## The Pivot Formula

### Daily Pivot
$$\text{Pivot} = \frac{\text{Previous High} + \text{Previous Low} + \text{Previous Close}}{3}$$

### 4-Hour Pivot
Same formula but using 4-hour swing points — used for shorter timeframe confluence.

Price is expected to **tap and react** at these lines, driving reversals or continuation moves.

---

## Chart Mark-Up Process (Step by Step)

### Step 1 — Plot Pivots (Craig's Indicator)
- Enable **clean up mode** for clarity in normal conditions
- Turn off clean up mode when you suspect an **untapped pivot** is present
- Untapped pivots → mark with a horizontal line + text annotation ("untapped pivot")
- These are high-priority levels: price reacts sharply even with minimal external confluence

### Step 2 — Add 4-Hour Pivots
For shorter timeframe confluence layering on top of daily pivots.

### Step 3 — Pull Fibonacci Retracements
- In a **bearish zone**: pull from swing high → swing low
- In a **bullish zone**: pull from swing low → swing high
- Key levels to mark:

| Level | Name | Use |
|---|---|---|
| 0.382 | Shallow retrace | Continuation entry, stop above swing high |
| 0.618–0.70 | Golden Pocket | High-probability reversal / continuation zone |
| 0.786 | Deep retrace | Reversal zone, pairs well with divergence |
| 0.886 | Deep retrace | Preferred entry inside value area ranges |

### Step 4 — Overlay Volume Profile (Fixed Range)
On low-volume days (bank holidays, quiet sessions), use a **fixed volume range** to identify:
- **Value Area High (VAH)** — top of the volume distribution
- **Value Area Low (VAL)** — bottom of the volume distribution

Mark both as horizontal zones on the chart. Price consolidates inside; extensions from these zones are high probability.

### Step 5 — Mark the Four Key Confluence Levels
Always check these four for alignment around the pivot:

1. **Pivot line** — the core anchor
2. **Daily open** — psychological level, often acts as mini-support/resistance
3. **Value Area High**
4. **Value Area Low**

Multiple tests and rejections at these levels = strong signal.

### Step 6 — Overlay VWAP
- Price **above VWAP** → buyers in control → bias long
- Price **below VWAP** → sellers in control → bias short
- VWAP relative to pivot confirms or contradicts the directional bias

---

## Trade Types

### Type 1 — Reversal Trade

**Conditions (bearish reversal example):**
- Price taps into pivot / golden pocket zone
- Deep oversold candle appears
- **Momentum divergence** visible (price makes new low, momentum does not)
- Money flow shifts from red → green on lower timeframe indicators
- Preferably at 0.786 or 0.886 Fibonacci level

**Entry process:**
1. Drop to 1m / 3m / 5m chart
2. Wait for divergence + money flow colour change (red → green)
3. Enter as buyers visibly reclaim control
4. Stop: below the swing low
5. Targets: TP1 (partial), TP2 (majority close)

---

### Type 2 — Continuation Trade

**Conditions (bearish continuation example):**
- Macro / higher timeframe bias is clearly bearish (below VWAP, below pivot)
- Price retraces back up into pivot area, landing in the **golden pocket** (0.618–0.70)
- Price "breathes" / pauses at the pivot — sellers reappear
- Momentum flips from green → red on shorter timeframes
- Sell dot appears on indicator
- Money flow goes negative (green → red)

**Entry process:**
1. Watch price tap the pivot
2. Confirm sell signal on 1m / 3m chart (red dot + negative money flow)
3. Enter short
4. Stop: just above recent swing high
5. Targets: TP1 and TP2

---

## Target & Exit Framework

| Level | Action |
|---|---|
| TP1 | Small partial close |
| TP2 | Majority of position closed |
| TP3–TP5 | Largely ignored — price rarely reaches these in normal conditions |

**Risk-reward examples from the method:**
- Typical: 1.5R to 3R
- Strong confluence setups (e.g. 0.382 + pivot alignment): up to 6R

---

## Indicator Toolkit

| Tool | Role |
|---|---|
| Craig's Indicator | Pivot calculation + clean-up display |
| Fibonacci Retracement | Identify confluence with pivot |
| Fixed Volume Range | VAH / VAL identification |
| VWAP | Buyer/seller control gauge |
| Momentum Indicator (MC) | Divergence + trend exhaustion |
| Money Flow (MC) | Red/green confirmation of buying/selling pressure |

---

## Confluence Checklist (Pre-Entry)

Before entering any trade, confirm at least 3 of these:

- [ ] Price at or near daily pivot
- [ ] Fibonacci level aligns (0.618 / 0.786 / 0.886)
- [ ] VWAP side matches trade direction
- [ ] Daily open / VAH / VAL supporting the level
- [ ] Momentum divergence visible on lower timeframe
- [ ] Money flow colour shift confirmed
- [ ] Untapped pivot nearby adds pressure

---

## Key Principles

- **Untapped pivots are magnetic** — even without other confluence, price reacts sharply
- **Golden pocket (0.618–0.70) + pivot = highest probability zone**
- **VWAP as filter** — only take continuation trades in the direction VWAP confirms
- **Divergence on lower timeframes** is the trigger for reversals, not the reason
- **Clean up mode off** = more pivots visible — use selectively when hunting untapped levels
- **TP3–TP5 are traps** — partial at TP1, exit majority at TP2, don't get greedy

---

## Relationship to Existing System

This method complements the Asia Range Fibonacci system already in the dashboard:

| Jay's Method | Dashboard Equivalent |
|---|---|
| Daily pivot | Could be added as a confluence source (low effort) |
| Golden pocket | Asia range 0.618 Fib extension |
| VAH / VAL | Future: volume profile / VPOC layer |
| VWAP | Not currently in dashboard |
| Money flow divergence | Discretionary — not automated |

The pivot calculation is simple enough to add as a **standalone confluence source** in `index.html` — marking it as a potential quick-win enhancement alongside the existing Fib levels.
