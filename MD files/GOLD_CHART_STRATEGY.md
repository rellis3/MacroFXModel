# Gold Chart Strategy — Max & Jay Method

XAU/USD only. Mean-reversion confluence trading. Price comes to you — never chase.

---

## Core Philosophy

The strategy is built on one principle: **institutional price decisions leave footprints**. Those footprints are unvisited volume nodes, session open levels where the market drove hard and never returned, and Fibonacci retracement zones that align with multiple independent structures. When price revisits those locations, momentum is typically exhausted — and that is when you look for an entry.

No breakout trades. No chasing. If you missed the entry, you wait for the next zone.

---

## Top-Down Framework

```
Daily / 4H
  └─ Establish structural bias (EMA trend + Break of Structure)
        ↓
  Session + Volume Levels  ← the institutional footprints
  └─ Floor pivots (PP, R1/R2, S1/S2) + 4H pivot
  └─ Value Area High / Low + Point of Control
  └─ Naked POCs (untouched, oldest pull hardest)
  └─ VWAP anchor levels (session opens with strong drives)
  └─ Daily open, Asia range H/L
        ↓
  Fibonacci Zones (M30 default, configurable)
  └─ Find valid swing legs (pivot high → pivot low or reverse)
  └─ Draw retracement zones from those legs
  └─ Score each zone for confluence with levels above
        ↓
  Wait — price must come TO the zone
        ↓
  VuManChu Cipher B confirmation (5m bars at zone)
  └─ Minimum 2 of 3 components must agree
        ↓
  Entry + structured SL/TP
```

---

## 1. Structural Bias (HTF)

Read on Daily and 4H only. Never trade against the Daily EMA structure.

| Signal | Condition |
|---|---|
| **Bullish** | EMA21 > EMA50, both sloping up |
| **Bearish** | EMA21 < EMA50, both sloping down |
| **Neutral** | EMAs converged or conflicting |
| **BOS boost** | Recent close breaks above last swing high (bullish) or below last swing low (bearish) |

If Daily says BULL and 4H says BEAR — bias is NEUTRAL. Only take longs when bias is BULL or NEUTRAL, shorts when BEAR or NEUTRAL.

---

## 2. Fibonacci — Drawing the Zones

### What counts as a valid impulse leg

- Must be at least 1.0–2.0× ATR (scales with timeframe; D1 = 2×, M15 = 1×)
- Must be anchored by confirmed pivot points — a pivot high/low requires N bars on each side that do not exceed it (N = 3–4 depending on TF)
- Legs are detected in alternating pivot pairs: low → high = long impulse, high → low = short impulse

### Zone variants per leg

Every valid impulse creates up to **five** independent zones. Each is scored separately — they are not duplicates:

| Variant | Entry Window | Notes |
|---|---|---|
| **GP** (Golden Pocket) | .618 → .650 | Tightest, highest probability reversal |
| **.5 Midpoint** | ±1.6% R around .500 | Impulse midpoint, often a pivot in consolidation |
| **.786** | ±1.6% R around .786 | Deep retrace, still valid |
| **.886** | ±1.6% R around .886 | Near structure origin, wider stop required |
| **Retest** | ±1.2% R around swing_end | Only appears when price has broken past the impulse end. The broken "1" level flips to support/resistance on first retest. |

### How to read the levels

```
Long impulse (low → high):

  swing_end   (1.000) ← broken level — Retest zone lives here if price has exceeded this
              (.886)  ← B zone, deepest
              (.786)  ← B zone
              (.650)  ← GP upper
              (.618)  ← GP lower   ← PRIMARY ENTRY ZONE
              (.500)  ← midpoint zone
              (.382)  ← outer watch boundary
  swing_origin (0.000) ← invalidation level (two closes below = zone dead)
```

The entry zone is **always** the GP (.618–.650) for the first attempt. The .786/.886 zones are valid setups only when a naked POC or VWAP anchor also sits there.

---

## 3. Confluence Scoring

Every zone is scored at its GP centre price. Higher score = more institutional interest at that level. Only zones scoring ≥ 3.0 are considered for entries (configurable).

### Score weights

| Level | Weight | Notes |
|---|---|---|
| Naked POC | 2.0–3.0 | Age-weighted: +0.1/day, max 3.0. Oldest pulls hardest. |
| VWAP anchor | 1.8–2.5 | Session right-angle levels. +0.05/day, max 2.5. |
| Daily open | 1.5 | Opening price of the current trading day |
| Current POC | 1.5 | Today's volume Point of Control |
| HTF aligned | 1.5 | Zone direction matches Daily/4H structural bias |
| Fib cluster | 1.5 | GP centre of this zone aligns with GP of a different impulse |
| .886 cross-fib | 1.5 | GP centre aligns with .886 of a different impulse |
| HVN | 1.2 | High Volume Node from today's profile |
| Prev day H/L | 1.2 | Previous session's range extremes |
| Trendline (3T) | 1.8 | Directionally-aligned TL with 3+ confirmed touches |
| Trendline (2T) | 1.2 | Directionally-aligned TL with 2 touches |
| VAH / VAL | 1.0 | Value Area bounds from today's volume profile |
| Session H/L | 1.0 | Asia, London, or NY session range extreme |
| .786 cross-fib | 1.2 | GP aligns with .786 of a different impulse |
| .382 cross-fib | 0.8 | GP aligns with .382 of a different impulse |
| .500 cross-fib | 0.6 | GP aligns with .5 of a different impulse |
| Floor pivot | 0.8 | PP, R1, R2, S1, S2 |

**A zone with no cross-fib or volume confluence in its composition is C-class and lower priority.**

---

## 4. The Sniper Panel — Reading the Levels

Before checking Fib zones, read the Sniper Panel as a context check. Craig's approach:

### Pivot levels (daily + 4H)

Daily pivots (PP, R1/R2, S1/S2) are calculated from the **previous session's** high, low, close.
4H pivot is calculated from the **last completed 4H candle**.

| Concept | Rule |
|---|---|
| **Untapped = Fresh** | A level price has not yet tested today is magnetically strong |
| **Tapped = Weak** | Once price has visited a level and reacted, it loses pull |
| **First touch** | The first test of any pivot level is the highest-probability reaction |

### Confluence status box

Three signals checked before any entry:

1. **Pivot Bias** — price above PP = bullish, below PP = bearish
2. **Structural Bias** — Daily/4H EMA trend direction (from HTF engine)
3. **Momentum** — VWAP slope direction on the current session

When all three agree: **confluence confirmed** — the bias is clean and entries in that direction have the highest edge. When they conflict: wait or reduce size.

### Value Area

- Price **inside** the VA → range-bound, mean-reversion to POC is the expected behaviour
- Price **outside** the VA and holding above VAH → bullish breakout mode, look for pullbacks to VAH
- Price below VAL and holding → bearish, look for retests of VAL as resistance

---

## 5. VuManChu Cipher B — Entry Confirmation

Only evaluated **once price is inside a high-score zone's GP window**. Uses 5m bars at the zone.

Three components. Minimum **2 of 3** must agree with the expected direction:

### Component 1: WaveTrend (WT1/WT2)

Momentum oscillator. At a long zone, any of these qualifies:

| Signal | Condition |
|---|---|
| **OVERSOLD** | WT1 < −60 — most powerful, fuel exhausted |
| **DIVERGENCE_BULL** | Price makes lower low, WT makes higher low — reversal |
| **HIDDEN_BULL** | WT makes lower low, price makes higher low — trend continuation |
| **BULLISH** | WT1 crosses above WT2 — weakest, only valid when above not firing |

At a short zone: mirror (OVERBOUGHT, DIVERGENCE_BEAR, HIDDEN_BEAR, BEARISH).

**Structural divergence** is detected from the last two confirmed swing points — not a comparison of current value vs window range. Hidden divergence (oscillator extreme, price shallower move) signals trend-continuation pullback entries.

### Component 2: Money Flow

Volume-weighted directional pressure, scaled −100 to +100.

**Gold-specific rule:** a Money Flow **spike** as price hits a zone signals **exhaustion**, not continuation. Buyers or sellers have been aggressive and are now running out. This is a reversal signal.

| Signal | Condition |
|---|---|
| **BULLISH_EXHAUSTION** | MF spike positive as price hits a long zone — buyers exhausted, reversal likely |
| **BEARISH_EXHAUSTION** | MF spike negative as price hits a short zone |
| **BULLISH / BEARISH** | Standard directional reading (lower weight) |

### Component 3: VWAP

Two independent ways this component can fire — either is enough:

**Slope exhaustion:** the momentum pushing price into the zone is fading. VWAP was rising into an overbought zone (short setup) but slope is now flattening or turning.

**VWAP oscillator divergence:** structural comparison of price swing points against `(close − session_VWAP)` normalised to ±100. Same divergence logic as WT — regular (reversal) or hidden (continuation). This is independent of slope.

---

## 6. Execution

### Entry

Enter **at the GP window** once VuManChu confirms (2/3 components). The GP zone is .618–.650 of the impulse — you are buying/selling where the institutional move retraced to, not chasing the move.

For **retest zones** (broken "1" level): entry at the retest window (±1.2% R of the swing end). Tight, fast reaction expected.

### Stop Loss

| Zone variant | SL anchor | Rule |
|---|---|---|
| GP / .786 / .886 | level_886 of the impulse | Structural SL: anchor − 0.3×ATR |
| .5 Midpoint | level_886 | Same as GP |
| Retest | gp_low (long) / gp_high (short) | SL just beyond the entry window itself |
| ATR floor | — | SL distance never less than 1.5×ATR(15m) regardless of above |
| Maximum | — | Never more than $40 (configurable) from entry |

### Targets

- **TP1** — 1.0× the SL distance (partial close, move to breakeven)
- **TP2** — 2.0× the SL distance (full close)

### Zone invalidation

A zone expires if **two consecutive closes** are beyond its swing origin:
- Long zone: two consecutive closes below swing_origin
- Short zone: two consecutive closes above swing_origin

Retest zones expire tighter: if price closes beyond `end ± 2.5 × retest_window`.

---

## 7. Filters and Gates

| Filter | Rule |
|---|---|
| **Session window** | London (07:00–13:00 UTC) and NY (13:00–20:00 UTC) only |
| **Max trades/day** | 2 (configurable) |
| **ATR compression** | If ATR(14)/ATR(100) < 0.65, min score raised by +1.5 — only highest-conviction zones |
| **Gold macro gate** | If gold macro KV signal is BEARISH STRONG and you are looking LONG — blocked |
| **ML gate** | Optional ML signal from ml_model.py — soft block only on STRONG opposing signal |
| **Cooldown** | 30 minutes after any trade close before next entry |

---

## 8. Quick Reference — Zone Quality

| Grade | Score | Composition must include |
|---|---|---|
| **A+** | ≥ 6.0 | nPOC + VWAP anchor + HTF aligned |
| **A** | 4.5–6.0 | nPOC or VWAP anchor + at least one other |
| **B** | 3.0–4.5 | Volume or session level confluence |
| **C** | < 3.0 | No meaningful confluence — skip |

---

## 9. What to Look at in Order (Pre-Trade Checklist)

1. **HTF bias** — what direction does the Daily say?
2. **Sniper confluence box** — pivot bias + structure + momentum all agree?
3. **Fresh pivot levels** — which key levels (PP, R1, S1, VAH, VAL) haven't been tapped today?
4. **Active zones** — which Fib zones are ≥ 3.0 score and in the direction of bias?
5. **Zone composition** — does it include a nPOC or VWAP anchor? Is the level they align with still fresh/untapped?
6. **Price approaching** — is price within 5 pips of the GP window?
7. **VuManChu at zone** — 5m confirmation, minimum 2/3 components
8. **Execute** — entry, set SL at anchor, set TP1/TP2
