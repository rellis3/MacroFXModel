# Sniper Indicator Chart Markup — Validation Document

> **Purpose:** Validate summaries and implementations against the documented chart markup process using Craig's Sniper Indicator and Vu Manchu.  
> **Sources:** Summary 1 (Sniper Indicator, 2026-05-28) · Summary 2 (Vu Manchu, 2026-05-28) · Summary 3 (Jay / Sniper Suite, 2026-05-28)  
> **Status:** All three summaries captured — document complete.

---

## 1. Indicator Setup Checklist

| # | Requirement | Expected Value / Behaviour | Pass |
|---|-------------|---------------------------|------|
| 1.1 | Craig's Sniper Indicator loaded on TradingView | Present on chart | ☐ |
| 1.2 | Sessions indicator (Lux Algo) loaded | Present on chart | ☐ |
| 1.3 | Full trading day session highlighted | Visually segmented on chart | ☐ |
| 1.4 | Specific hourly session highlighted (e.g. 08:00–09:00) | Visually segmented on chart | ☐ |
| 1.5 | "Clean up mode" enabled | Only today's (or today + yesterday's) levels visible | ☐ |
| 1.6 | Pivot bias set to **Dynamic** | Dynamic mode active | ☐ |
| 1.7 | Structural flip logic set to **Close** | Close-based flips active | ☐ |
| 1.8 | Value area highs/lows hidden (optional, avoids clutter) | Hidden unless intentionally enabled | ☐ |

---

## 2. Key Price Levels

| Level | Type | Description | Must Be Present |
|-------|------|-------------|----------------|
| Daily Open | Static | Price at start of the trading day; does not move intraday | ☐ |
| Pivot Level | Static | Key S/R zone from pivot analysis; does not move intraday | ☐ |
| VWAP | Dynamic | Volume-weighted average; updates continuously throughout the day | ☐ |

**Validation rule:** Static levels must not change value once the day opens. VWAP must visibly update as price and volume develop.

---

## 3. Confluence Status Box

| # | Item | Expected Behaviour | Pass |
|---|------|--------------------|------|
| 3.1 | Confluence status box visible in chart corner | Displayed bottom-right | ☐ |
| 3.2 | Box shows "**Confluence Confirmed**" when all biases align | All three biases bullish OR all three bearish | ☐ |
| 3.3 | Pivot Bias component present | Bullish / Bearish label visible | ☐ |
| 3.4 | Structural Bias component present | Bullish / Bearish label visible | ☐ |
| 3.5 | Momentum component present | Fluid / fast-moving; ticks between bullish and bearish | ☐ |

### Confluence Logic Rules

- **Pivot Bias + Structural Bias aligned** → required for a valid entry filter (stable signals).  
- **Momentum Bias** → used as an entry **trigger**, not a standalone filter (more fluid, changes frequently).  
- All three aligned → "Confluence Confirmed" = highest probability setup.

---

## 4. Alert System

| # | Requirement | Pass |
|---|-------------|------|
| 4.1 | Alert line placed at Daily Open level | ☐ |
| 4.2 | Alert line placed at Pivot Level | ☐ |
| 4.3 | Price alert triggers notification when price approaches key level | ☐ |

---

## 5. Entry Criteria (Long / Buy Example)

| Step | Criterion | Pass |
|------|-----------|------|
| 5.1 | Price retraces to a key level (Daily Open or Pivot) | ☐ |
| 5.2 | Pivot Bias is **Bullish** | ☐ |
| 5.3 | Structural Bias is **Bullish** | ☐ |
| 5.4 | Momentum flips **Bullish** (entry trigger) | ☐ |
| 5.5 | Entry taken at level OR after momentum confirmation | ☐ |
| 5.6 | Stop loss placed **below** recent swing low | ☐ |

> For Short / Sell: reverse all bias directions; stop loss placed **above** recent swing high.

---

## 6. Practical / Backtesting Considerations

| # | Requirement | Notes | Pass |
|---|-------------|-------|------|
| 6.1 | Trading focus restricted to defined watchable sessions | e.g. 08:00–09:00; not 24/7 | ☐ |
| 6.2 | Entry taken only when confluence confirmed | No entry on partial alignment | ☐ |
| 6.3 | System is objective and repeatable | No manual subjective drawing required | ☐ |
| 6.4 | Backtesting conducted over thousands of trades before live use | Documented validation | ☐ |

---

## 7. Future / Optional Confluence Additions (Planned)

These are noted as upcoming enhancements — not required for the base validation:

- [ ] Volume Profile Value Area High (VAH)
- [ ] Volume Profile Value Area Low (VAL)
- [ ] Fibonacci Levels
- [ ] Additional volume-based support/resistance tools

---

## 8. Workflow Summary Validation

The correct end-to-end workflow must satisfy all of the following:

```
1. Open chart → Sniper Indicator + Sessions Indicator loaded
2. Daily Open, Pivot Level, VWAP auto-plotted (no manual drawing)
3. Clean up mode on → only relevant levels visible
4. Alert lines set on static levels
5. Price approaches level → check confluence box
6. Pivot + Structural bias aligned (bullish/bearish) → consider entry
7. Momentum confirms direction → enter trade
8. Stop loss placed at nearest swing structure
9. Focus only on pre-defined tradeable session hours
```

---

---

## 9. Vu Manchu (VMU) — Indicator Setup Checklist

| # | Requirement | Expected Value / Behaviour | Pass |
|---|-------------|---------------------------|------|
| 9.1 | Vu Manchu Cipher B + Divergences loaded on TradingView | Present in indicator pane | ☐ |
| 9.2 | MFI area multiplier set to **300** (default 150) | Money flow area visibly thicker | ☐ |
| 9.3 | RSI component **off** for trending markets | Disabled by default; enable only in extreme ranges | ☐ |
| 9.4 | Stochastic RSI component **off** for trending markets | Same rule as RSI | ☐ |
| 9.5 | VWAP line colour set to **yellow**, opacity **100%**, thickness increased | Clearly visible yellow line | ☐ |
| 9.6 | Automatic bullish/bearish divergence signals **disabled** | Discretionary reading only; auto-alerts off | ☐ |
| 9.7 | Zero line drawn horizontally on indicator pane | Visible reference for crosses and extremes | ☐ |

---

## 10. Vu Manchu — Core Components

| Component | What It Represents | Key Behaviour |
|-----------|--------------------|---------------|
| **VWAP** | Volume Weighted Average Price oscillator | Large spikes = strong buyer/seller presence; weak spikes = likely fakeout / reversal |
| **Waves** | Momentum (blue waves) | Measures strength/weakness of price pushes; used to confirm VWAP divergence |
| **Money Flow** | Energy / "fuel" remaining in a move | Sharp spike = energy spent → reversal likely; weak spike = fuel remaining → continuation likely |

**Validation rule:** All three components must be visible and legible on the indicator pane. Green/red dot signals must **not** be used as direct trade entries.

---

## 11. Vu Manchu — Divergence Types

### 11.1 Regular Divergence (Reversal Signal)

| # | Condition | Implication | Pass |
|---|-----------|-------------|------|
| 11.1a | Price makes a **higher high**, oscillator (VWAP / waves) makes a **lower high** | Bearish reversal signal — momentum weakening | ☐ |
| 11.1b | Price makes a **lower low**, oscillator makes a **higher low** | Bullish reversal signal — downside momentum weakening | ☐ |
| 11.1c | Divergence identified **before** price reaches the key level | Pre-confirmation; higher confidence | ☐ |

### 11.2 Hidden Divergence (Trend Continuation Signal)

| # | Condition | Implication | Pass |
|---|-----------|-------------|------|
| 11.2a | Price makes a **lower high** (pullback), oscillator makes a **higher low** | Bullish continuation — trend still has strength | ☐ |
| 11.2b | Price makes a **higher low** (pullback), oscillator makes a **lower high** | Bearish continuation — trend still has strength | ☐ |

**Validation rule:** Regular divergence ≠ hidden divergence. Misclassifying them inverts the signal. Both must be checked against the prevailing trend context.

---

## 12. Vu Manchu — Money Flow (Fuel) Concept

| Scenario | Money Flow Behaviour | Interpretation | Action |
|----------|---------------------|---------------|--------|
| Price approaches support/resistance | MF spikes sharply **downward** | Energy spent; reversal likely | Consider entry / mark reversal zone |
| Price approaches support/resistance | MF spike is **weak / shallow** | Fuel remaining; continuation likely | Avoid counter-trend entry; let price run |
| Gold — MF spikes to red (down) | Strong downward red spike | Exhausted sellers → good **long** zone | Mark as buy opportunity | 
| Gold — MF in green area | Green / elevated reading | Potential **sell** zone | Mark as sell opportunity |
| Bitcoin — MF spikes down | Downward spike | Often implies **continuation** (reverse of gold) | Asset-specific — re-calibrate per instrument |

**Validation rule:** Money flow interpretation must be calibrated per asset. Gold and Bitcoin have opposite default readings. Always document which asset convention is being applied.

---

## 13. Vu Manchu — Confluence Validation

All three components must align for a high-confidence setup:

| # | Confluence Condition | Signal Strength |
|---|---------------------|----------------|
| 13.1 | VWAP + Waves diverge together from price | Strong |
| 13.2 | VWAP + Waves + Money Flow all diverge / align | Strongest |
| 13.3 | Only one component diverges from price | Weak — avoid entry |
| 13.4 | All components flowing cohesively **with** price | Trend continuation — do not fade |

---

## 14. Vu Manchu — Non-Entry / Trade Avoidance Rules

| # | Condition | Rule |
|---|-----------|------|
| 14.1 | Indicators show clear lack of momentum | **Skip the trade** — preserve capital |
| 14.2 | Money flow spike is weak near key level | Fuel remains → likely continuation; no reversal entry |
| 14.3 | Only momentum diverging, VWAP and MF not confirming | Insufficient confluence — avoid |
| 14.4 | Divergence signals present but no fundamental bias alignment | Lower conviction — reduce size or avoid |

**Validation rule:** The ability to correctly identify **non-entry** conditions is weighted equally to entry conditions.

---

## 15. Vu Manchu — Entry Criteria (Combined Confluence)

| Step | Criterion | Pass |
|------|-----------|------|
| 15.1 | Price approaches a key S/R level | ☐ |
| 15.2 | Regular divergence present on VWAP **before** level is reached | ☐ |
| 15.3 | Waves (momentum) confirm divergence in the same direction | ☐ |
| 15.4 | Money flow spike confirms energy spent at the level | ☐ |
| 15.5 | Fundamental bias aligns with trade direction (e.g. macro bullish on gold) | ☐ |
| 15.6 | Green/red dot **ignored** as entry signal | ☐ |
| 15.7 | Entry taken on discretionary read, not automatic divergence alert | ☐ |

---

## 16. Vu Manchu — Practical Mark-Up Workflow

```
1. Load Vu Manchu Cipher B + Divergences on TradingView
2. Configure: MFI multiplier → 300, RSI/StochRSI off, VWAP → yellow 100% thick
3. Draw zero line on indicator pane
4. Disable automatic divergence alerts
5. Scroll back through historical significant tops and bottoms
6. At each top/bottom: record VWAP, waves, and money flow behaviour
7. Note whether divergence was regular (reversal) or hidden (continuation)
8. Mark horizontal levels at those key price points
9. On live chart: as price approaches a level, check all three VMU components
10. Only enter when VWAP + waves + money flow confirm same directional bias
11. Identify and honour non-entry conditions (weak fuel, missing confluence)
```

---

## 17. Cross-Indicator Confluence (Sniper + Vu Manchu)

These are the touch-points where both indicators must agree for the highest-conviction setups:

| Sniper Signal | Vu Manchu Confirmation Required | Combined Outcome |
|--------------|--------------------------------|-----------------|
| Price at Daily Open (support) | VMU VWAP bullish divergence + money flow red spike | High-conviction long |
| Price at Pivot Level (resistance) | VMU VWAP bearish divergence + money flow green extreme | High-conviction short |
| Sniper Confluence Confirmed (bullish) | VMU waves + money flow both bullish | Strongest buy signal |
| Sniper Confluence Confirmed (bearish) | VMU waves + money flow both bearish | Strongest sell signal |
| Sniper momentum trigger fires | VMU hidden divergence (continuation) | Trend continuation entry |

---

---

## 18. Jay's Approach — Pivot Setup & Calculation

| # | Requirement | Expected Value / Behaviour | Pass |
|---|-------------|---------------------------|------|
| 18.1 | Daily pivot calculated and plotted | `(Prev High + Prev Low + Prev Close) / 3` | ☐ |
| 18.2 | 4-hour pivot calculated and plotted | Same formula using 4-hour swing points | ☐ |
| 18.3 | Clean up mode **on** by default | Reduces clutter; shows relevant pivots only | ☐ |
| 18.4 | Clean up mode **off** when an untapped pivot is suspected | Reveals historically reactive levels not yet visited by price | ☐ |
| 18.5 | Untapped pivots marked with horizontal line + text annotation | Labelled "Untapped Pivot" on chart | ☐ |
| 18.6 | Price interaction at pivot observed (bounce vs. break-and-reverse) | Noted before committing to direction | ☐ |

---

## 19. Fibonacci Levels

| Level | Name | Usage |
|-------|------|-------|
| 0.382 | Standard retracement | Continuation entry zone; align with pivot or VAH/VAL |
| 0.618–0.70 | **Golden Pocket** | Primary confluence zone for reversals and continuations |
| 0.786 | Deep retracement | Secondary reversal confirmation level |
| 0.886 | **Preferred range entry** | Best risk-to-reward inside fixed volume ranges; sharp reactions expected |

**Validation rules:**
- Fibonacci must be pulled from the relevant swing high → swing low (or reverse for bearish).
- The 0.886 level inside a fixed volume range is the preferred entry; validate it delivers ≥ 3R before marking as a setup.
- Golden pocket (0.618–0.70) must coincide with the pivot for the confluence to count.

| # | Requirement | Pass |
|---|-------------|------|
| 19.1 | Fibonacci retracement drawn from correct swing points | ☐ |
| 19.2 | Golden pocket (0.618–0.70) identified and marked | ☐ |
| 19.3 | 0.886 level marked inside fixed volume range | ☐ |
| 19.4 | At least one Fibonacci level confluent with the pivot | ☐ |

---

## 20. Volume Profile Markings

| # | Requirement | Expected Behaviour | Pass |
|---|-------------|-------------------|------|
| 20.1 | Fixed Volume Range (FVR) applied to chart | Visible as a histogram or shaded zone | ☐ |
| 20.2 | Value Area High (VAH) marked | Horizontal line at upper boundary of main volume cluster | ☐ |
| 20.3 | Value Area Low (VAL) marked | Horizontal line at lower boundary of main volume cluster | ☐ |
| 20.4 | VAH/VAL treated as support/resistance | Price consolidation and reaction expected within this zone | ☐ |
| 20.5 | On bank/low-volume days, FVR takes priority over other tools | Volume profile more reliable when sessions are thin | ☐ |

---

## 21. Four Key Confluences at the Pivot

All four must be checked when price approaches the pivot area:

| # | Confluence Level | Type | Pass |
|---|-----------------|------|------|
| 21.1 | **Pivot line** | Static (daily or 4H) | ☐ |
| 21.2 | **Daily Open** | Static psychological level | ☐ |
| 21.3 | **Value Area High (VAH)** | Volume-derived | ☐ |
| 21.4 | **Value Area Low (VAL)** | Volume-derived | ☐ |
| 21.5 | **VWAP** | Dynamic — confirms buyer/seller dominance | ☐ |

**Scoring:** 3 or more confluences aligning at the same price zone = high-probability setup. Fewer than 3 = avoid or reduce size.

---

## 22. Jay's Reversal Entry Criteria

| Step | Criterion | Pass |
|------|-----------|------|
| 22.1 | Price taps pivot (or Golden Pocket / 0.886 level) | ☐ |
| 22.2 | Deep oversold (or overbought) candle visible on LTF (1m / 3m / 5m) | ☐ |
| 22.3 | Momentum divergence present on LTF chart | ☐ |
| 22.4 | Money flow shifts from **red → green** (bullish reversal) or **green → red** (bearish) | ☐ |
| 22.5 | Entry on LTF after divergence + money flow confirmation | ☐ |
| 22.6 | Stop loss placed beyond the recent swing high / low | ☐ |
| 22.7 | VWAP position confirms bias (above = buyers; below = sellers) | ☐ |

---

## 23. Jay's Continuation Entry Criteria

| Step | Criterion | Pass |
|------|-----------|------|
| 23.1 | Prevailing trend established | ☐ |
| 23.2 | Price retraces into pivot within the Golden Pocket (0.618–0.70) | ☐ |
| 23.3 | Price "breathes" / pauses near pivot — not a sharp break | ☐ |
| 23.4 | Momentum on LTF flips in trend direction (green → red for sell, red → green for buy) | ☐ |
| 23.5 | Sell / buy dots appear on LTF concurrent with negative / positive money flow | ☐ |
| 23.6 | VWAP confirms — continuation direction matches price-vs-VWAP relationship | ☐ |
| 23.7 | Stop loss placed just beyond recent swing in counter-trend direction | ☐ |

---

## 24. Target & Risk Management

| # | Rule | Expected Behaviour | Pass |
|---|------|--------------------|------|
| 24.1 | TP1 = first extension level | Small partial close taken here | ☐ |
| 24.2 | TP2 = second extension level | Majority of position closed here | ☐ |
| 24.3 | TP3 and beyond | **Ignored** unless extreme market event; price rarely reaches them | ☐ |
| 24.4 | Minimum acceptable R:R | ≥ 1.5R (example from video); 3R+ preferred on range setups | ☐ |
| 24.5 | Stop loss logically placed beyond swing structure | Not arbitrary; coordinated with pivot and volume structure | ☐ |

---

## 25. Jay's Practical Mark-Up Workflow

```
1. Open chart → Craig's Sniper Indicator active
2. Calculate daily pivot: (Prev H + Prev L + Prev Close) / 3
3. Calculate 4H pivot using same formula for 4H swing points
4. Enable clean up mode → check for any untapped pivots from previous sessions
5. If untapped pivot found → disable clean up mode → mark with horizontal line + label
6. Apply Fixed Volume Range → mark VAH and VAL as horizontal zones
7. Identify current swing high and low → pull Fibonacci retracement
8. Mark 0.382, Golden Pocket (0.618–0.70), 0.786, 0.886 levels
9. Check: which Fibonacci level aligns with pivot / VAH / VAL / Daily Open?
10. Count confluences at that price zone (pivot + daily open + VAH/VAL + Fib)
11. Note VWAP position relative to price
12. Drop to LTF (1m / 3m / 5m) as price approaches the confluence zone
13. For reversal: wait for oversold candle + momentum divergence + MF shift
14. For continuation: wait for retracement into Golden Pocket + LTF momentum flip + MF confirmation
15. Enter on confirmation → stop beyond swing → target TP1 (partial) then TP2 (majority)
```

---

## 26. Master Consolidated Validation Checklist

This section combines all three summaries into a single pre-trade checklist. Every row must pass before a trade is taken.

### 26A — Chart Preparation (all three approaches)

| # | Check | Source | Pass |
|---|-------|--------|------|
| A1 | Craig's Sniper Indicator loaded | S1 | ☐ |
| A2 | Sessions indicator (Lux Algo) loaded and sessions highlighted | S1 | ☐ |
| A3 | Vu Manchu Cipher B + Divergences loaded and configured | S2 | ☐ |
| A4 | Daily pivot and 4H pivot plotted | S3 | ☐ |
| A5 | Daily Open marked | S1 / S3 | ☐ |
| A6 | VWAP visible and updated (dynamic) | S1 / S2 / S3 | ☐ |
| A7 | VAH and VAL marked from Fixed Volume Range | S1 (planned) / S3 | ☐ |
| A8 | Fibonacci retracement drawn from correct swing | S3 | ☐ |
| A9 | Untapped pivots identified and annotated | S3 | ☐ |
| A10 | Clean up mode status appropriate for session | S1 / S3 | ☐ |

### 26B — Confluence Count (minimum 3 required)

| # | Confluence Layer | Present? |
|---|-----------------|---------|
| B1 | Pivot (daily or 4H) | ☐ |
| B2 | Daily Open | ☐ |
| B3 | VAH or VAL | ☐ |
| B4 | Fibonacci level (especially Golden Pocket or 0.886) | ☐ |
| B5 | VWAP | ☐ |
| B6 | Sniper confluence box: Pivot Bias + Structural Bias aligned | ☐ |
| B7 | VMU VWAP divergence at level | ☐ |
| B8 | VMU Waves (momentum) divergence at level | ☐ |
| B9 | VMU Money Flow spike / fuel confirmation | ☐ |

> **Minimum to proceed:** 3 of B1–B9 confirmed. Ideal: 5+.

### 26C — Entry Confirmation Sequence

| Step | Action | Source | Pass |
|------|--------|--------|------|
| C1 | Price reaches confluence zone | All | ☐ |
| C2 | Sniper: Pivot + Structural bias aligned to trade direction | S1 | ☐ |
| C3 | Sniper: Momentum flips as entry trigger | S1 | ☐ |
| C4 | VMU: VWAP divergence confirms trade direction | S2 | ☐ |
| C5 | VMU: Waves divergence aligns with VWAP divergence | S2 | ☐ |
| C6 | VMU: Money flow spike confirms energy spent at level | S2 / S3 | ☐ |
| C7 | LTF (1m–5m): Momentum divergence visible | S3 | ☐ |
| C8 | LTF: Money flow colour shift confirms direction | S3 | ☐ |
| C9 | VWAP side matches trade direction (above = buy, below = sell) | S1 / S3 | ☐ |
| C10 | No clear non-entry condition present (weak fuel, absent VMU confluence) | S2 | ☐ |

### 26D — Risk Management

| # | Rule | Pass |
|---|------|------|
| D1 | Stop loss placed beyond recent swing structure | ☐ |
| D2 | TP1 identified (small partial) | ☐ |
| D3 | TP2 identified (majority close) | ☐ |
| D4 | R:R ≥ 1.5R; 3R+ preferred | ☐ |
| D5 | Trade only within pre-defined watchable session hours | ☐ |

---

## Validation Log

| Summary # | Date Received | Key Additions | Status |
|-----------|--------------|---------------|--------|
| Summary 1 | 2026-05-28 | Sniper Indicator setup, key price levels (Daily Open / Pivot / VWAP), confluence box (Pivot + Structural + Momentum biases), entry criteria, session focus | Captured |
| Summary 2 | 2026-05-28 | Vu Manchu setup, VWAP/Waves/Money Flow components, regular vs hidden divergence, fuel concept, non-entry rules, cross-indicator confluence table | Captured |
| Summary 3 | 2026-05-28 | Jay's pivot-based approach, pivot formula, untapped pivots, Fibonacci levels (0.382 / Golden Pocket / 0.886), FVR / VAH / VAL, four confluences at pivot, reversal vs continuation criteria, TP1/TP2 management | Captured |

**No conflicts identified across summaries.** VWAP, confluence layering, money flow, and session-based trading are consistent themes across all three. Summary 3 adds Fibonacci and volume profile depth; Summary 2 adds VMU oscillator mechanics; Summary 1 provides the structural bias framework that anchors both.

---

*Document complete. All three summaries consolidated.*
