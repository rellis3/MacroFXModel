# Fibonacci Retracement — Markup & Trading Reference

> Distilled from video transcription. Covers how to draw fibs correctly, which levels matter, confluence confirmation, and common mistakes.

---

## What the Tool Does

After a price impulse move, markets rarely continue without a pullback. The Fibonacci retracement tool identifies **where those pullbacks are likely to end** before the dominant trend resumes. Levels are derived from the Fibonacci sequence ratios and mapped as percentages of a prior swing move.

---

## Key Levels and What They Mean

| Level | Label | Context |
|-------|-------|---------|
| 0.236 (25.6%) | Shallow | Strong trending environments — minor pause before continuation |
| 0.382 | Shallow–Moderate | Small breather, still favours trend continuation |
| 0.500 | Moderate | Healthy pullback, continuation bias remains |
| 0.618–0.650 | **Golden Pocket** | Highest-probability reversal zone for trend continuation |
| 0.786 | Deep | Approaching full retracement — scalping entries, tight stops |
| 0.886 | Very Deep | Strongest scalp entry level — precise limit orders, very tight SL |
| 0 / 1.0 | Anchors | Swing high / swing low — act as dynamic S/R after breakout |

### The Golden Pocket (0.618–0.650)
The single most important zone. Price that retraces here is considered "just enough" before resuming the dominant trend. Most reliable for swing entries and higher-timeframe trend continuation setups.

### Deep Retracements (0.786 and 0.886)
Used primarily for **scalping on 1m–5m charts**. The 0.886 in particular allows very precise limit entries with tight stop placement. Requires additional confirmation (volume profile, momentum divergence) because these levels are close to full retracement — a break beyond 1.0 signals potential trend reversal.

### The 0 and 1.0 Anchor Levels
After price breaks through the 0 (swing start) or 1.0 (swing end) level, it frequently **returns to retest** that level as new support or resistance before continuing. These retests are reliable entry triggers in their own right.

---

## How to Draw the Tool Correctly

### Rules
1. **Identify a clear swing high and swing low** on a relevant timeframe — these are the anchors.
2. **Draw in the direction of anticipated price movement:**
   - Bullish setup (expecting continuation higher): draw **low → high**
   - Bearish setup (expecting continuation lower): draw **high → low**
3. **Never draw backwards** (against price flow) — the most common beginner mistake and produces meaningless levels.
4. **Avoid drawing in sideways / choppy markets** unless using very short-term scalping setups with tight invalidation.

### Timeframe Selection
- Higher timeframes (4H, Daily): use 0.382, 0.500, golden pocket
- Lower timeframes / scalping (1m–5m): use 0.786 and 0.886 with volume profile confirmation

---

## Confluence — The Confirmation Layer

A Fibonacci level alone is a zone of interest, not a trade signal. Confluence is what converts a level into a high-probability entry.

### What Counts as Confluence
- **Previous swing highs or lows** aligning with the fib level
- **Pivot points** (daily, weekly) overlapping the zone
- **Volume profile nodes** (high-volume areas or low-volume gaps) at the level
- **Multiple fib drawings** from different swing moves producing the same level
- **Macro/structural bias** confirming the direction (macro score positive = only take long setups at fib support)

### How to Apply It
- More confluences at a level = higher conviction = larger position size / tighter stop
- A golden pocket that also sits on a prior daily low is significantly stronger than a golden pocket in isolation
- When using deep retracements (0.786 / 0.886), **volume profile and momentum divergence are near-mandatory** — the level alone is insufficient

---

## Entry Process (Scalping — 0.786 / 0.886)

1. Identify market structure direction (trend or range bias)
2. Locate a clear swing high and swing low
3. Draw Fibonacci from swing to swing in the correct direction
4. Mark any fixed range volume profile nodes near 0.786 / 0.886
5. Set a **limit order** at the level — avoid chasing with market orders
6. Place stop **beyond the swing high/low** (logical invalidation point), not at a fixed pip distance
7. Target: next structural Fibonacci level in the direction of the trade

---

## Stop Placement Rules

- **Never place stops too tight** — large wicks before reversal will stop you out before the level holds
- Stops belong at **logical invalidation points**: beyond the swing high (for longs) or swing low (for shorts)
- If the level fails and price closes through the anchor (0 or 1.0), the thesis is wrong — accept the loss

---

## Risk Management Principles

- Fib levels are **zones of interest**, not guaranteed reversal points — losing trades are part of the system
- Risk-reward targets: golden pocket setups typically offer 3R–5R; deep retracement scalps can yield 5R–16R when precise
- **Do not trade against the dominant higher-timeframe trend** without strong multi-confluence confirmation
- In high-volatility environments, deep retracement levels fail more often — preference should shift to shallower levels or no trade

---

## Common Mistakes

| Mistake | Why It's Harmful |
|---------|-----------------|
| Drawing fib backwards (against price flow) | Produces levels the market does not respect |
| Using fib in sideways / unclear market structure | Random levels, no structural significance |
| Anchoring to wick extremes inconsistently | Fib levels shift — pick body or wick and stay consistent |
| Stop too close to entry | Gets clipped by normal price noise before level holds |
| Trading counter-trend without strong confluence | Low probability, unfavourable risk/reward |
| Ignoring the dominant higher-timeframe trend | Forces losing positions against institutional flow |

---

## Quick Reference Checklist

Before entering at any Fibonacci level:

- [ ] Swing high and low clearly identified on relevant timeframe
- [ ] Tool drawn in the correct direction (not backwards)
- [ ] At least one additional confluence present at the level
- [ ] Market structure (trend/range) supports the direction
- [ ] Stop placed at logical structural invalidation, not arbitrary pip distance
- [ ] Higher-timeframe trend bias confirmed (or minimum: not opposed)
- [ ] For deep levels (0.786 / 0.886): volume profile or momentum divergence present
- [ ] Risk-reward minimum 2R before entry

---

## Integration with This Dashboard

In the dashboard context, Fibonacci levels are projected from the **Asia session body range** (00:00–06:00 London) and the **Monday body range**, using SD multiples. Confluence is detected when today's projected level aligns with yesterday's projected level within a pip tolerance.

The same principles from this guide apply:
- **Confluence levels get star ratings** — more overlap = higher stars
- **Macro score provides the directional filter** — positive score: prioritise long confluences; negative: prioritise short confluences
- **GARCH vol regime gates entries** — avoid taking range-fade setups in HIGH vol; the level will often be broken rather than respected

> Macro tells you the bias. Fib tells you the level. The dashboard ties them together with conviction scoring and risk sizing.
