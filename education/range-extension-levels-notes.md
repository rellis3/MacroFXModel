# Range Extension Levels — Lesson Notes

> **Source:** Colez Trades, "Quantitative & Macro Insights — Technical Execution
> Framework: Range Extension Levels."
> **Purpose of this file:** raw study notes on the lesson — the definitions, the
> method step by step, the key facts to remember for recall/exams, and a list of
> questions and ideas to investigate in future. Learn the material first;
> evaluation comes later and lives elsewhere.
> **Lesson's own framing:** "A systematic method for identifying high-probability
> price levels using range extensions. This framework projects the Asia session
> range to find where price may encounter exhaustion." Educational content only,
> not financial advice.

---

## 0. Lesson summary (one paragraph)

Define the Asia session range (00:00–06:00 London time) on the 5-minute chart,
measured from candle **closes** (not wicks). Project that range's size as
multiples — 1x, 2x, 3x, up to 10.5x — both above and below the range, using a
repurposed TradingView Fibonacci retracement tool. Each level marks how far
price has extended relative to the Asia range; far extensions are candidate
**exhaustion zones** (shorts above, longs below). The framework's key conceptual
point: these are **range extensions, not mathematical standard deviations** — a
forward-projecting structural measure, not a backward-looking statistical one.
The highest-probability levels are **alignment zones**, where extensions from
today's and yesterday's Asia ranges land within tolerance (2 pips on EUR/USD)
of each other. Levels are zones where price *may* react, not guarantees —
always combined with risk management.

---

## 1. Section 01 — Understanding Range Extensions

### 1.1 The critical distinction: range extensions vs mathematical standard deviations

The lesson flags this as *crucial* — it "fundamentally changes how you interpret
and apply the levels."

| | ✗ Mathematical standard deviations | ✓ Range extensions |
|---|---|---|
| What it measures | Statistical dispersion from a mean, using historical price data | The size of a defined range (Asia session) projected as multiples into price space |
| Assumptions | Assumes normal distribution; calculates variance across a dataset | None stated — measures how far price can extend from a known range |
| Direction of inference | **Backward-looking** statistical measure | **Forward-projecting** structural measure |

### 1.2 Why this matters (lesson's words, near-verbatim)

- Range extensions are **anchored to today's volatility context**.
- A 2x extension means price has moved **twice the distance of the Asia range**.
- This is a **structural observation about market expansion, not a statistical
  probability statement**.

### 1.3 The four building blocks introduced

| Block | Definition |
|---|---|
| 📊 **The Asia Range** | The foundational range from which all extensions are measured. 00:00–06:00 London time. |
| 📈 **Extension Multiples** | Each level (1x, 2x, 3x) = how many times the Asia range distance price has traveled. |
| 🎯 **Exhaustion Zones** | Extension levels mark where price has moved significantly and may find exhaustion. |
| ⚡ **Alignment Zones** | Where extensions from multiple sessions overlap → higher-probability areas. |

---

## 2. Section 02 — Tool Setup

### 2.1 Step 01: configure the Fibonacci tool (TradingView)

The Fib **retracement** tool is *repurposed* to project range extension levels.
Set the levels to:

```
0, 0.25, 0.5, 0.75, 1,
1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5
```

Structure of the grid (worth noticing): quarter-steps (0.25 / 0.5 / 0.75) exist
only **inside** the range (between 0 and 1); beyond 1 the ladder runs in
**half-steps** out to 10.5.

**Pro tip (lesson):** enable "Use one color" in the Fib settings for cleaner
visualization; save the configuration as a template for quick access.

### 2.2 Step 02: identify the Asia range

The Asia range is the foundational reference — the range from which all
extension levels are projected.

- **Time window:** 00:00 – 06:00 **London time**.
- **Indicator:** "Asian Range by Nico948" (TradingView).
- **Data feed:** use **OANDA** for consistent timestamps.
- **Chart context (Figure 1):** EUR/USD, 5-minute chart; a shaded box highlights
  the 00:00–06:00 consolidation period that establishes the range.

⚠️ **Important (lesson):** ensure the chart timezone is set correctly — the Asia
range must be consistently defined across all analysis.

---

## 3. Section 03 — Projecting Extension Levels

Project the Asia range as multiples **both above and below** current price to
identify potential exhaustion zones. All analysis is on the **5-minute
timeframe** for precision.

### 3.1 Step 01: extensions above price (potential short entry zones)

- Draw the Fib tool **from the highest candle close to the lowest candle close**
  within the Asia range.
- This projects the extension levels **above** the range.
- Use: identify potential levels to **short** from (Figure 2, EUR/USD 5m).

**Key point (lesson):** *use candle closes, not wicks.* Closes represent where
price was **accepted**; wicks represent **rejection**.

### 3.2 Step 02: extensions below price (potential long entry zones)

- Draw the Fib tool in the **opposite direction — from the lowest candle close
  to the highest candle close**.
- This projects the extension levels **below** the range (Figure 3, EUR/USD 5m).

### 3.3 Reading the two projections

| Direction | Meaning |
|---|---|
| **Extensions above price** | Price has extended upward → levels mark potential exhaustion zones for **short** considerations. |
| **Extensions below price** | Price has extended downward → levels mark potential exhaustion zones for **long** considerations. |

---

## 4. Section 04 — Finding Alignment Zones

The **highest probability levels** occur where extensions from multiple Asia
ranges overlap.

### 4.1 Multi-session confluence

- **Repeat** the full extension-projection process on the **previous day's**
  Asia range.
- Look for areas where levels from **both sessions fall close together**.

### 4.2 Alignment tolerance

- **EUR/USD: 2 pips.**
- If two extension levels from different sessions fall within 2 pips of each
  other → mark it as a **confluence zone**.
- Figure 4: two Asia ranges shown; the highlighted zone is where extension
  levels from both sessions align — "a high-probability confluence area."

---

## 5. Daily Setup Checklist (the routine, verbatim)

1. ✓ **Current Asia range identified** — today's 00:00–06:00 London range
   clearly marked.
2. ✓ **Extensions above projected** — Fib drawn from highest close to lowest
   close.
3. ✓ **Extensions below projected** — Fib drawn from lowest close to highest
   close.
4. ✓ **Previous session extensions added** — yesterday's Asia range extensions
   overlaid.
5. ✓ **Alignment zones identified** — levels within 2 pips marked as confluence
   zones.

---

## 6. Knowledge check (from the lesson)

**Q: What's the key difference between range extensions and mathematical
standard deviations?**

- ✗ Range extensions use more data points for higher accuracy
- ✗ Standard deviations project future levels while range extensions look backward
- ✓ **Range extensions project multiples of a defined range forward; standard
  deviations measure statistical dispersion from historical data**
- ✗ They are essentially the same calculation with different names

Note the second distractor is the true statement *reversed* — easy trap. It is
the SDs that look backward and the extensions that project forward.

---

## 7. Key takeaways (the lesson's four, memorize)

1. **Range extensions ≠ standard deviations.** Projecting multiples of a defined
   range forward, not calculating statistical variance.
2. **Extensions measure market expansion.** A 3x extension = price has traveled
   three times the Asia range distance.
3. **Confluence amplifies probability.** Alignment zones where multiple session
   extensions overlap offer higher probability.
4. **These are zones, not guarantees.** Extension levels identify where price
   *may* react — always combine with proper risk management.

---

## 8. Glossary (quick recall)

- **Asia range** — the 00:00–06:00 London-time session range, measured on
  5-minute candle closes; the foundational reference for all projections.
- **Range extension** — the Asia range's size projected as a multiple into price
  space beyond the range; a forward structural measure.
- **Extension multiple (1x / 2x / 3x…)** — how many Asia-range-distances price
  has traveled.
- **Exhaustion zone** — an extension level where price has moved significantly
  and may find exhaustion (shorts above, longs below).
- **Alignment / confluence zone** — where extension levels from two different
  Asia sessions fall within tolerance (2 pips EUR/USD); the framework's
  highest-probability areas.
- **Closes, not wicks** — ranges are drawn between candle closes (acceptance),
  never wicks (rejection).

---

## 9. Real-time implementation notes (how I'd run this at the desk)

- **Prep happens once per day, after 06:00 London** — the Asia range can't be
  final until the window closes, so the checklist runs at/after Asia close.
- **Standing chart template:** EUR/USD 5m on OANDA feed, chart timezone
  verified, the custom Fib template saved, "Asian Range by Nico948" plotted.
- **Two drawings every day** (highest-close→lowest-close, then the reverse),
  **plus keep yesterday's two** on the chart for the alignment scan.
- **Alignment scan:** walk the ladder and tag any today-vs-yesterday level pair
  within 2 pips — those confluence zones are the priority levels for the day.
- **Directional read at a level:** above the range = short consideration; below
  = long consideration. The framework supplies the *level*; entry trigger,
  stop, target and sizing are outside its scope — bring risk management.
- **Housekeeping:** re-verify the chart timezone after any platform update or
  DST change, since a mis-set clock silently shifts the entire range.

---

## 10. Questions to investigate in future (arising from the lesson)

Open questions the lesson raises but doesn't answer — future study/research
prompts, not conclusions:

1. **Which multiples matter most?** The grid runs to 10.5x. Where do reactions
   actually cluster — 1x? 2–3x? Does reaction quality decay or improve with
   distance?
2. **Why would extension multiples mark exhaustion?** What's the mechanism —
   statistical rarity of large moves, self-fulfilling attention on
   session-range multiples, or intraday mean-reversion after fast expansion?
3. **Does confluence measurably help?** Test alignment-zone touches vs
   single-session-level touches: hit rate, reaction size, after costs.
4. **Tolerance scaling.** 2 pips is given for EUR/USD only. What's the right
   tolerance for other pairs/instruments — fixed pips, %ATR, or a fraction of
   the Asia range?
5. **Closes vs wicks.** The lesson asserts closes are better (acceptance vs
   rejection). Does the close-to-close range produce better levels than the
   wick high/low range in a fair A/B?
6. **Is the Asia session special?** Would any 6-hour overnight window (or
   another session's range) project equally useful levels, or is 00:00–06:00
   London specifically informative?
7. **Timezone sensitivity.** London time shifts against UTC with DST. How
   sensitive are the levels to a one-hour shift in the window?
8. **More sessions of confluence.** The lesson uses two Asia ranges (today +
   yesterday). Does adding a third session tighten or just thin out the zones?
9. **Extension distance as a market-state reading.** If a 3x extension means
   "significant expansion," can the max multiple reached by a given time of day
   serve as a trend-day vs range-day indicator?
10. **Relation to volatility measures.** The lesson says extensions are
    "anchored to today's volatility context." How do range-multiple levels
    compare with σ-based bands built from an explicit vol estimate — do they
    mark the same prices?

---

## 11. Areas of interest for deeper study

- **Session-range structure** generally: how overnight/consolidation ranges
  relate to the following session's expansion (Asia → London/NY handoff).
- **Acceptance vs rejection** as a candle-reading principle (closes vs wicks) —
  where else does this distinction apply (range definition, level breaks,
  stop placement)?
- **Confluence as a general method:** the lesson's alignment idea (two
  independent projections agreeing within tolerance) is a pattern that could
  apply to any level family — pivots, prior highs/lows, volume levels.
- **Forward-projected vs backward-derived levels** as two families of technical
  levels — the lesson's core distinction, worth keeping as a classification
  lens when studying other frameworks.
- **Exhaustion behaviour at stretched prices:** what does "exhaustion" look
  like on the tape (failure to make new highs, wick clusters, momentum
  divergence), and how would one confirm it at an extension level?
