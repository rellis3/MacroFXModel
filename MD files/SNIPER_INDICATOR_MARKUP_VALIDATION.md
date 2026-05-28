# Sniper Indicator Chart Markup — Validation Document

> **Purpose:** Validate summaries and implementations against the documented chart markup process using Craig's Sniper Indicator.  
> **Source:** Summary 1 of 3 (posted 2026-05-28)  
> **Status:** Awaiting summaries 2 and 3 for full consolidation.

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

## Validation Log

| Summary # | Date Received | Key Additions / Conflicts | Status |
|-----------|--------------|--------------------------|--------|
| Summary 1 | 2026-05-28 | Base document — indicator setup, levels, confluence, entries | Captured |
| Summary 2 | — | — | Pending |
| Summary 3 | — | — | Pending |

---

*This document will be updated after each summary is received. Conflicts between summaries will be flagged in the Validation Log.*
