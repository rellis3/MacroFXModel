# Daily Vol & Range Forecast — Build Reference Guide

**Source:** Colez Trades — "The Daily Forecast" playbook  
**Purpose:** Reference for incorporating statistical daily vol/range forecasts into dashboard builds  
**Instruments covered:** Gold, EUR/USD, NQ (extensible to any liquid instrument)

---

## WHAT THE FORECAST PRODUCES

Three numbers per instrument, per session:

| Metric | Type | What It Measures | Chart Use |
|---|---|---|---|
| **Volatility (annualized %)** | Context / regime signal | Temperature reading — how energetic is today vs history | Not a chart level — regime comparator |
| **High–Low range (%)** | Geometry | Full candle amplitude, top to bottom, as % of daily open | Projects the expected opposite extreme once one extreme is known |
| **Open–Close move (%)** | Drift | Net directional displacement, as % of daily open | Symmetric ± envelope around the open = expected close band |

Each geometry/drift figure is published as a **pair**:
- **Median (50th percentile)** — central case; working hypothesis for the day
- **75th percentile** — stretch case; exceeded only 1 day in 4

**Range ≠ Move.** A 3% range / 1% move = choppy roundtrip day. A 3% range / 3% move = trend day. The pair encodes the *shape*, not just the size.

---

## THE SESSION WINDOW

Every forecast anchors to the **00:00 → 00:00 calendar day** — the full 24-hour candle, not a specific exchange session (not NY open, not London).

**Critical:** If the open is read from any candle other than the 00:00 candle, every downstream level drifts. This is a mechanical discipline — enforce it strictly.

---

## CHART IMPLEMENTATION — SIX STEPS

### Step 1 — Define the session window
Drop vertical lines at `Day 00:00` and `Next Day 00:00`. All levels live inside this band. Do this first, every time.

### Step 2 — Anchor the open
Mark the 00:00 candle open with a **horizontal ray** extended across the full session. Label it `Open`. This single price is the denominator for every percentage that follows.

### Step 3 — Apply the High–Low range
Wait for the **first extreme to print** (high or low). Then:
- If high prints first → project **−(range%)** downward from that high
- If low prints first → project **+(range%)** upward from that low

Use TradingView's Price Range tool. The target price is the expected opposite extreme under the median scenario.

### Step 4 — Pin the projected opposite extreme
Extend a horizontal ray at the Price Range tool's output. Label it `Expected Low` or `Expected High`. This is the day's statistical range boundary.

### Step 5 — Observe the interaction
When price reaches the projected level and rotates: the day has used its range budget. Further extension requires a 75th-percentile (or wider) day — possible but no longer the base case. Use this as a caution flag against chasing.

### Step 6 — Apply the Open–Close envelope
Project **±(open-close%)** symmetrically above and below the open using Price Range tool — two boxes, one envelope. The close is expected to land inside this band on a median day.

| Close location | Reading |
|---|---|
| Inside the envelope | Normal session |
| At the envelope edge | Directional trend day (median) |
| Outside the envelope | Stretch / 75th-percentile day — directional bias confirmed |

---

## PROBABILITY FRAMEWORK

The forecast is a **distribution**, not a point prediction.

- The **median** splits the world in half: ~50% of comparable days come in below, ~50% above
- The **75th percentile** is exceeded by only 1 day in 4
- Individual days hit, miss, and overshoot — calibration is over the sample, not any single session
- When forecasted vol diverges meaningfully from recent realised vol, the divergence itself is often the most actionable signal (regime shift warning)

**Percentile context matters.** A 2.65% median range for Gold on a given day may land near the 92nd percentile of that instrument's unconditional history. That is a regime signal embedded in the number — not just "Gold will move" but "Gold is expected to move wider than 9 days in 10 of its own history."

---

## HOW THIS CONNECTS TO EXISTING DASHBOARD LAYERS

| Dashboard Layer | Integration Point |
|---|---|
| **GARCH(1,1) vol engine** | The annualized vol figure is directly comparable to GARCH σ output. When the external forecast diverges from GARCH, flag it as a regime mismatch |
| **Daily range cap (`remainingRange`)** | The high-low median is the daily budget. The dashboard's `usedPct` field tracks how much of this budget has been consumed intraday |
| **GARCH 68%/95% CI bands** | The external 75th percentile range ≈ the 95% CI band. Cross-reference: if the external forecast 75th is inside the GARCH 95% CI, vol expectations are aligned |
| **Position sizing (`sizeMult`)** | The annualized vol reading determines regime. A 92nd-percentile day warrants reduced size, not baseline. Feed the percentile rank into the `LOW / NORMAL / HIGH` classifier |
| **Stop/TP placement** | Stops should live outside the daily noise band. The projected High/Low ray is the reference — stops inside this zone are statistically within normal fluctuation |
| **Fib confluence scanner** | The projected High/Low levels act as additional structural references. If a Fib confluence sits within N pips of the projected extreme, that is a double-confluence — boost star rating |
| **OI walls (call wall / put wall)** | Check whether the projected Low/High aligns with a put/call wall from the OI analyser. Alignment = high-conviction level |
| **AI analysis card** | Feed the day's percentile rank and projected levels into the Claude prompt as context. "Today's expected range is at the 92nd historical percentile" materially changes the AI narrative |

---

## INTRADAY FILTERING APPLICATION

Once levels are on the chart, the remaining budget calculation becomes continuously actionable:

```
Remaining range budget = Daily High–Low median − range already covered
```

**Worked example:**
- Median range: 0.6%
- By midday, price has already covered 0.55%
- Breakout/continuation probability collapses
- Mean-reversion probability rises sharply
- This reasoning is **unavailable without a range forecast**

This is the intraday complement to the dashboard's existing `remainingRange` / `usedPct` fields.

---

## POSITION SIZING PRINCIPLE

The annualized vol figure enables **conditional** position sizing rather than static sizing:

```
The same notional risk on a 2.65% day ≠ the same notional risk on a 0.8% day.
Size down when the regime percentile is elevated. Size up (cautiously) when it is suppressed.
```

This compounds materially over a quarter — it is the difference between sizing into noise and sizing into signal. The dashboard's existing `sizeMult` field already implements this logic; the external forecast percentile rank is a cross-validation input for that multiplier.

---

## DAILY WORKFLOW CHECKLIST

```
[ ] 1. Read median High–Low range and Open–Close move. Note 75th as stretch reference.
[ ] 2. Note annualized vol figure — compare to GARCH output and recent history percentile.
[ ] 3. Open chart. Drop verticals at 00:00 → next 00:00.
[ ] 4. Mark daily open with horizontal ray.
[ ] 5. Wait for first extreme to print. Project range % to opposite side.
[ ] 6. Extend horizontal ray at projected opposite extreme.
[ ] 7. Apply ±open-close% symmetric envelope around the open.
[ ] 8. Cross-check projected extremes against Fib confluences, OI walls, GARCH CI bands.
[ ] 9. Track intraday range consumption vs daily budget throughout session.
[ ] 10. Grade only over the sample — not the individual day.
```

---

## IMPLEMENTATION NOTES FOR FUTURE BUILDS

- **Data input:** The forecast numbers (annualized vol%, H–L range%, O–C move%, both percentiles) need to be entered manually or fetched from the publishing source. Build a UI input panel for these per instrument per session.
- **Percentile lookup:** To compute where today's forecast lands in historical context, maintain a rolling distribution of realised daily ranges (minimum 6 months). The dashboard's existing OHLC history from Twelve Data is sufficient for this.
- **KV persistence:** Store the day's forecast inputs in `FX_SCORES` KV under a `daily_forecast_{sym}` key so the bot can read them alongside the scored output.
- **Cross-layer alert:** If the external forecast 75th percentile range exceeds the GARCH 95% CI by more than 20%, surface a "vol mismatch" warning in the AI analysis card.
- **Instrument scaling:** The % figures are already instrument-agnostic. The only instrument-specific adjustment is pip/point conversion for pip-proximity cap checks.

---

*Source: Colez Trades — "The Daily Forecast" playbook, worked example Gold 19 May 2026*  
*Internal reference only. Not financial advice.*
