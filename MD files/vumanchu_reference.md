# Vu Manchu (VMU) Indicator — Trading Reference

## What It Is

A momentum oscillator oscillating above/below zero. Unlike RSI, MACD, or Awesome Oscillator, VMU has a **multi-component structure** allowing simultaneous analysis of several variables — creating built-in confluence from a single indicator.

Works in **both trending and ranging markets** (most oscillators fail in trends).

---

## Setup (TradingView)

Search: **"Vu Manchu cipher B plus divergences"** — free adaptation of the paid Market Cipher indicator.

### Key Config Changes
| Setting | Value | Reason |
|---|---|---|
| MFI area multiplier | 150 → **300** | Makes money flow area thicker/readable |
| RSI | **Off** (trending), On (ranging) | RSI gives false overbought signals in trends |
| Stochastic RSI | **Off** (trending) | Same issue |
| VWAP line | **Yellow, 100% opacity, thick** | Enhanced visibility |
| Auto divergence signals | **Off** | Edge comes from discretionary reading, not scripted alerts |

> **Rule:** Settings evolve with market conditions. Gold in a trend → RSI off. Ranging market → RSI on.

---

## Three Core Components

### 1. VWAP (Volume Weighted Average Price)
- Oscillates above/below zero like an oscillator but **weighted by volume**
- Acts like a volume-weighted EMA
- **Large VWAP spike** = significant volume behind the move → move is legitimate, likely to hold
- **Small/weak VWAP spike** = fakeout risk, potential reversal

### 2. Waves (Momentum)
- Blue waves representing momentum strength
- Function similarly to VWAP — confirm strength or weakness of price moves
- Used **alongside VWAP** for confirmation — when both align, confidence increases

### 3. Money Flow
- Most complex but most critical component
- Related to volume and liquidity
- **Asset-specific** — must recalibrate interpretation per instrument

**Gold interpretation:**
- Money flow **spikes down sharply (red)** near support → exhausted sellers → good long entry
- Money flow in **green area** → potential sell zone

**Bitcoin interpretation:**
- Often the **reverse** — downside spikes can imply continuation
- Always back-test interpretation per asset before trading

---

## Divergence Types

### Regular Divergence → **Reversal Signal**
- Price makes higher high, oscillator makes lower high
- Price moves up but weakening oscillator implies pending downside reversal
- Works across VWAP, waves, and money flow

### Hidden Divergence → **Continuation Signal**
- Price makes lower high (retraces), oscillator makes higher low
- Trend still has strength — expect continuation in prevailing direction

> **Key:** Identify divergences **before** price reaches the reversal level to confirm it, not after the move has started.

---

## The "Fuel" Concept (Money Flow)

How much energy remains in a move:

| Money Flow Behaviour Near Key Level | Implication |
|---|---|
| Spikes down **sharply** | Energy spent → reversal likely |
| **Weak or no spike** | Fuel remaining → price likely continues through level |

This is used to mark high-probability reversal vs continuation zones.

---

## Confluence Framework

Strongest signals come when **all three components align**:

| Scenario | Signal |
|---|---|
| Momentum + VWAP + money flow diverging from price | Pending correction |
| All three flowing cohesively with price | Strong trend continuation |
| Two of three diverging | Moderate signal — use discretion |

> Green/red dots on VMU **are not entry signals**. Beginners mistake these for buy/sell triggers — they are not reliable as standalone signals.

---

## Chart Markup Workflow

1. Mark horizontal levels at **significant historical tops and bottoms**
2. Draw a **horizontal line at zero** on the indicator pane
3. Sweep through past highs/lows and observe how VWAP, waves, and money flow behaved at each
4. Mark **divergence zones** by visually comparing price move vs oscillator move
5. Note **money flow spike depth** at each level (fuel spent vs remaining)
6. Apply **fundamental bias** as the overlay context (e.g. bullish macro on gold = look for long entries on VMU pullback signals)

---

## When NOT to Enter

Equally important as entries. Avoid trades when:
- Indicators show **no momentum or divergence alignment**
- Money flow shows **remaining fuel** through a level you expected to hold
- All components flowing cohesively **against** your intended direction

> One of the most successful traders in the presenter's group built their edge primarily around **non-entry signals** — preserving capital in poor setups is a genuine edge.

---

## Applicability to the Macro FX System

| VMU Concept | Potential Integration |
|---|---|
| VWAP divergence | Secondary confirmation layer on top of Asia Range Fib confluence |
| Money flow fuel | Validate whether price has "energy" to break through a Fib level or reverse |
| Hidden divergence | Trend continuation confirmation — aligns with momentum regime classification |
| Fundamental bias overlay | Already handled by macro tier scoring — VMU technical layer sits underneath |
| When-not-to-enter discipline | Reinforces GARCH vol gate logic — confluence of absence = no trade |

> Note: VMU is a volume-weighted indicator. On FX pairs, Twelve Data free tier provides **no real volume** — money flow signals on FX may be unreliable. VMU would be more trustworthy on **NQ, ES, Gold** where actual volume data exists.

---

## Key Principles Summary

- Confluence beats any single signal — VMU's edge is multi-component alignment
- Divergences must be spotted **prospectively**, not retrospectively
- Money flow interpretation is **asset-specific** — always back-test per instrument
- The indicator is a **discretionary aid**, not a mechanical signal generator
- Mastery comes from repetitive visual study of historical tops/bottoms with VMU active
- Knowing when **not** to trade is as valuable as knowing when to trade
