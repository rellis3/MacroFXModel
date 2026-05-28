# Sniper Indicator Chart Markup — Validation Document

> **Purpose:** Validate summaries and implementations against the documented chart markup process using Craig's Sniper Indicator and Vu Manchu.  
> **Sources:** Summary 1 (Sniper Indicator, 2026-05-28) · Summary 2 (Vu Manchu, 2026-05-28)  
> **Status:** Awaiting summary 3 for full consolidation.

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

## Validation Log

| Summary # | Date Received | Key Additions / Conflicts | Status |
|-----------|--------------|--------------------------|--------|
| Summary 1 | 2026-05-28 | Base document — Sniper Indicator setup, key levels, confluence box, entry criteria | Captured |
| Summary 2 | 2026-05-28 | Vu Manchu setup, VWAP/waves/money flow components, regular & hidden divergence, fuel concept, non-entry rules, cross-indicator confluence | Captured |
| Summary 3 | — | — | Pending |

---

*This document will be updated after each summary is received. Conflicts between summaries will be flagged in the Validation Log.*
