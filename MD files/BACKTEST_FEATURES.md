# MacroFXModel — Backtest Engine: Ranges, Confluences & Features

## Overview

The backtest engine trades a single core idea: **fade price at statistically significant Fibonacci confluence zones derived from the Asia session body range**. Twelve configurable features vote on whether structural, momentum, and regime conditions support the fade at each candidate level.

---

## 1. The Range System

### 1.1 Asia Body Range

**Timeframe:** M5 bars  
**Session:** London hours 00:00–05:59 (`lHour < 6`), weekdays only  
**Minimum:** 36 M5 bars (3 hours of data) — sessions with fewer bars are discarded  
**Type:** *Body range only* — uses candle open and close, not wick highs/lows

```
Asia High = max(open, close) across all session bars
Asia Low  = min(open, close) across all session bars
Asia Range = Asia High − Asia Low
```

The body-only definition is intentional: it represents committed price discovery, not transient spikes.

### 1.2 Monday Range

**Timeframe:** M30 bars  
**Filter:** bars where `lDay === 1` (London Monday)  
**Minimum:** 20 M30 bars  
**Type:** Body range (same formula as Asia)

Used as secondary reference boundaries for features that check proximity to range edges.

---

## 2. Fibonacci Levels

47 levels are projected from each Asia range, spaced at 0.25 standard-deviation multiples from −10.5 to +10.5:

```
FIB_LEVELS = [−10.5, −10, −9.5, … −0.75, −0.5, −0.25,
               0, 0.25, 0.5, 0.75,
               1, 1.5, … 10, 10.5]
```

Each level projects a price:

```
price = Asia Low + Asia Range × fib_level
```

Levels below 0 sit below the Asia Low; levels above 1 sit above the Asia High. The 0.0–1.0 band is the range interior; extreme levels (±2, ±5, ±10) are statistical extension targets.

---

## 3. Confluence Detection

For each trading day, confluences are built from **today's** and **yesterday's** Asia Fib level sets (47 × 47 = 2,209 candidate pairs).

### Step 1 — Proximity filter

A pair qualifies if its price distance is within the tolerance:

| Symbol class | Tolerance |
|---|---|
| FX pairs (EUR/USD, GBP/USD, USD/JPY) | 2 pips |
| Gold (XAU/USD) | 200 pips ($20) |

Qualifying pairs record a midpoint price and an `isTight` flag (set when distance ≤ 10% of tolerance, or when both sessions share the same Fib ordinal).

### Step 2 — Cluster merge

Raw pairs within 30% of the tolerance of each other's midpoint are collapsed into one cluster. A cluster's representative price is the mean of its members' midpoints.

### Result

Each confluence level carries:
- `price` — representative price
- `isTight` — very precise overlap (same Fib or ≤ 0.2 pips)
- `density` — number of raw Fib pairs that merged into this cluster

---

## 4. Entry Logic

### Direction

```
conf.price > current_price  →  entryDir = 'short'   (fade resistance from below)
conf.price < current_price  →  entryDir = 'long'    (fade support from above)
```

### Proximity trigger

A confluence only triggers an entry check when price is within **ATR × entryProximityATR** of the level (default multiplier 0.30).

### Gate

```
conviction >= minConviction   AND   confirmCount >= minConfirms
```

- `conviction = totalWeightedPts / maxPossiblePts` — ranges −1 to +1
- `confirmCount` = number of enabled features whose signal matches entryDir

### Stop Loss

```
slDist = max(Asia Range × slFraction, 5 pips)
SL = entry − slDist   (long)
SL = entry + slDist   (short)
```

Default `slFraction = 0.35` (35% of the Asia body range).

### Take Profit

```
TP = entry + slDist × rrRatio   (long)
TP = entry − slDist × rrRatio   (short)
```

Default `rrRatio = 2.2` — matches the live dashboard's fallback for session-sourced levels.

### Exit

1. **M1 bar scan** — TP or SL hit (SL checked first when both sides tagged in same bar)
2. **EOD** — any open trade force-closed at London 21:00

One trade at a time. New entry signals are ignored while a trade is open.

---

## 5. Feature Descriptions

Each feature returns `{ signal: 'long' | 'short' | null, val: string }`.  
A feature **confirms** when its signal matches `entryDir`; **conflicts** when it signals the opposite; **neutral** when signal is null.

Score contribution: `+weight` for confirm, `−weight` for conflict, `0` for neutral.

---

### Feature 1 — Range Position (`rangePosition`) | weight: 1

**Data:** Asia body range + Monday body range  
**Logic:** Finds the nearest range boundary (Asia or Monday). If within `ATR × 0.22`:
- Price in bottom 20% of that range → `long`
- Price in top 20% → `short`
- Price in the middle 60% → `null`

**Purpose:** Sanity check that the entry is genuinely at a range extreme, not midrange. Almost always confirms since confluences are built from range Fibs, but fires `null` for mid-range confluence clusters and fires **conflict** if the Fib puts price at the wrong end of the range for the intended direction.

---

### Feature 2 — CHoCH / BOS (`chochBos`) | weight: 2

**Data:** M30 bars (last 80), oldest-first  
**Logic:** 4-bar swing pivot detection on highs and lows. Compares the last two swing highs (SH) and last two swing lows (SL):

| SH | SL | Signal |
|---|---|---|
| HH (higher) | HL (higher) | `long` — bullish BOS |
| LH (lower) | LL (lower) | `short` — bearish BOS |
| LH | HL | `long` — bullish CHoCH (reversal) |
| HH | LL | `short` — bearish CHoCH |
| Mixed | — | `null` |

**Purpose:** Structural market context. BOS (Break of Structure) means momentum is already moving your way. CHoCH (Change of Character) means a reversal is forming. **Weight 2** reflects that a structural conflict (e.g. bearish BOS when you want to go long) is a strong veto.

---

### Feature 3 — Wick Rejection (`wickRejection`) | weight: 1

**Data:** Last 20 closed M5 bars (newest-first)  
**Logic:** Checks the nearest range boundary within `ATR × 0.22`. For each recent bar, a wick counts if:
- The bar is near the boundary (within `max(ATR × 0.12, 3 pips)`)
- Upper wick ≥ 40% of bar range at resistance → rejection wick
- Lower wick ≥ 40% of bar range at support → rejection wick

Signal fires when **≥ 2 rejection wicks** exist:
- At support → `long`
- At resistance → `short`

**Purpose:** Confirms that price has already been testing and rejecting the boundary. Two or more wicks means the market has seen the level and is reacting — it's not just approaching the zone cold.

---

### Feature 4 — RSI / VuManChu Divergence (`rsiDivergence`) | weight: 1

**Data:** Last 100 closed M5 bars  
**Logic:** Runs three oscillators on oldest-first bars:
1. **Wave Trend Oscillator (WTO)** — Cipher B (n1=10, n2=21): HLC3 → EMA → channel index → EMA
2. **Money Flow (MF)** — direction × (H−L) proxy, RSI-normalised, centred at 0
3. **RSI-14** — standard, centred at 0

For each oscillator, checks for *classic divergence* using 5-bar swing pivots:
- Near resistance: price makes higher high, oscillator makes lower high → bearish divergence → `short`
- Near support: price makes lower low, oscillator makes higher low → bullish divergence → `long`

Signal fires when **≥ 2 of 3 oscillators agree** on the same divergence direction.

**Purpose:** Momentum exhaustion confirmation. Divergence at a range boundary means the trend driving price to the level is losing steam — ideal for a fade.

---

### Feature 5 — Order Block (`orderBlock`) | weight: 1

**Data:** Last 31 closed M5 bars, oldest-first  
**Logic:** Searches for an order block near the nearest range boundary (within `ATR × 0.25`):
- **Bullish OB** at support: a bearish candle (`close < open`) followed immediately by 2 consecutive bullish candles → `long`
- **Bearish OB** at resistance: a bullish candle followed by 2 consecutive bearish candles → `short`

**Purpose:** Identifies institutional supply/demand footprints. An order block at the range boundary suggests large players placed orders there and a second test of the same level is likely to respect it.

---

### Feature 6 — HTF EMA Alignment (`htfEma`) | weight: 1

**Data:** M5 bars (last 250+), synthesised into H1 candles (every 12 bars)  
**Logic:** Builds H1 close series by taking the close of every 12th M5 bar (oldest-first). Computes EMA21 and EMA50 on H1 closes:

| Price vs EMA21 | Price vs EMA50 | Signal |
|---|---|---|
| Above | Above (or EMA50 unavailable) | `long` |
| Below | Below (or EMA50 unavailable) | `short` |
| Mixed | — | `null` |

**Purpose:** Higher-timeframe trend filter. If the daily/H1 trend opposes the fade, conviction should be lower. A long fade at support **with** price below both EMAs is fighting the trend — this feature will conflict.

---

### Feature 7 — Session TWAP Slope (`vwapSlope`) | weight: 1

**Data:** M5 bars from London 08:00 onward (today only); falls back to last 50 bars if < 12 session bars  
**Logic:** Computes a cumulative session TWAP (running mean of HLC3). Measures slope over last 8 bars (40 minutes).

| Entry dir | Price vs TWAP | Slope | Signal |
|---|---|---|---|
| `short` | Above TWAP | Declining | `short` (strong) |
| `short` | Above TWAP | Rising | `short` (mild) |
| `short` | Below TWAP | Any | `long` (conflict) |
| `long` | Below TWAP | Rising | `long` (strong) |
| `long` | Below TWAP | Declining | `long` (mild) |
| `long` | Above TWAP | Any | `short` (conflict) |

**Purpose:** Intraday flow direction. A declining TWAP approaching resistance is price running out of steam — ideal for a short fade. A rising TWAP approaching resistance means buying momentum and the feature conflicts.

---

### Feature 8 — ADX Filter (`adxFilter`) | weight: 1

**Data:** Last 200 M30 bars  
**Logic:** Computes ADX-14 (Wilder smoothing) with +DI and −DI:

| ADX | Condition | Signal |
|---|---|---|
| < 20 | Range-bound | confirms `entryDir` (fades work in range) |
| > 28 | Trending | conflicts `entryDir` (trend oposes fade) |
| 20–28 | Transitional | confirms if DI aligns with entry, else `null` |

**Purpose:** Regime filter. ADX > 28 means price is in a strong directional trend — range-fade trades have poor expectancy in trending markets. ADX < 20 is the ideal fade environment.

---

### Feature 9 — Hurst Exponent (`hurstRegime`) | weight: 1

**Data:** Last 80 daily closes (oldest-first)  
**Logic:** R/S (Rescaled Range) analysis across scale sizes [4, 8, 16, 32]. Fits a log-log regression of R/S vs scale to derive the Hurst exponent H:

| H | Regime | Signal |
|---|---|---|
| < 0.45 | Mean-reverting | confirms `entryDir` (fades favoured) |
| 0.45–0.55 | Random walk | `null` (no edge either way) |
| > 0.55 | Trending | conflicts `entryDir` (persistence unfavourable for fade) |

**Purpose:** Long-run statistical regime. H < 0.45 means the price series has been statistically mean-reverting — ideal for range fade strategies. H > 0.55 means a trending regime where fade entries have elevated risk of being run through.

---

### Feature 10 — Fair Value Gap (`fvgBias`) | weight: 1

**Data:** Last 100 closed M5 bars  
**Logic:** Scans for 3-bar imbalances:
- **Bullish FVG:** `bar[i−1].high < bar[i+1].low` — gap between previous high and next low
- **Bearish FVG:** `bar[i−1].low > bar[i+1].high` — gap between previous low and next high

Filters to *unfilled* FVGs only (no subsequent bar has closed into the gap). Then:
1. If current price is **inside** an unfilled FVG → signal matches FVG type
2. If a FVG midpoint is within `ATR × 0.5` → signal matches FVG type

**Purpose:** Price imbalances act as magnets — price is statistically drawn to fill them. If an unfilled bullish FVG sits at a support confluence, the fade long is confirmed by the gap-fill magnet.

---

### Feature 11 — Weekly Pivot (`weeklyPivot`) | weight: 1

**Data:** Daily bars (oldest-first), grouped by calendar week  
**Logic:** Derives classical weekly pivot levels from the **prior full week's** OHLC:

```
PP = (H + L + C) / 3
R1 = 2×PP − L,   R2 = PP + (H − L)
S1 = 2×PP − H,   S2 = PP − (H − L)
```

Finds the nearest level within `ATR × 0.22`:
- Near WR1 or WR2 → `short`
- Near WS1 or WS2 → `long`
- Near WPP → `null`
- No level within range → `null`

**Purpose:** Institutional S/R. Weekly pivots are used by bank desks and algorithms as reference levels. Price at a weekly R1 while near a Fib confluence is a high-conviction fade setup.

---

### Feature 12 — Ichimoku Cloud (`ichimokuCloud`) | weight: 1

**Data:** Daily bars (oldest-first), minimum 78 bars  
**Logic:** Computes standard daily Ichimoku (9/26/52):

```
Tenkan-sen  = mid(9-bar high/low)
Kijun-sen   = mid(26-bar high/low)
Senkou Span A = (Tenkan + Kijun) / 2, shifted 26 bars back
Senkou Span B = mid(52-bar high/low), shifted 26 bars back
```

Evaluates cloud position relative to **current price**:

| Price vs Cloud | Signal |
|---|---|
| Above cloud top | `long` |
| Below cloud bottom | `short` |
| Inside cloud | `null` |

Also reports TK cross (Tenkan vs Kijun) and Chikou span direction for the `val` display string, but only the cloud position drives the signal.

**Purpose:** Long-term structural filter. Price above the daily cloud means bullish macro structure; longs at support confluences are aligned with HTF trend. Price below the cloud means bearish structure; shorts at resistance are aligned. Inside the cloud is ambiguous — no signal.

---

## 6. Conviction Score

```
conviction = totalWeightedPts / maxPossiblePts
```

Where:
- `totalWeightedPts` = Σ (weight × sign) for all enabled features (sign: +1 confirm, −1 conflict, 0 neutral)
- `maxPossiblePts` = Σ weights of all enabled features

Range: **−1.0** (every feature conflicts) to **+1.0** (every feature confirms).

### Entry gate (both conditions required)

```
conviction  ≥  minConviction   (default 0.0)
confirmCount ≥  minConfirms    (default 2)
```

`minConviction = 0` means net confirms ≥ net conflicts by weight. Raising it to `0.3–0.5` requires a meaningful majority.

Note: `chochBos` has weight 2, so a structural conflict alone pulls conviction below 0 even if every other feature confirms.

---

## 7. Backtest Parameters Reference

| Parameter | Default | Description |
|---|---|---|
| `rrRatio` | 2.2 | Take-profit distance as multiple of SL distance |
| `slFraction` | 0.35 | SL = this fraction × Asia body range |
| `minConviction` | 0.0 | Minimum weighted net feature score (−1 to +1) |
| `minConfirms` | 2 | Minimum number of features that must confirm |
| `entryProximityATR` | 0.30 | Price must be within this × ATR of a confluence level |
| `warmupDays` | 100 | Trading days skipped at start for indicator warmup |

---

## 8. Excluded (Live-Only) Features

Three features exist in the live dashboard but are excluded from the backtest as they require live external data:

| Feature | Reason excluded |
|---|---|
| **COT Positioning** | Requires weekly CFTC commitment data via Quandl |
| **Retail Sentiment** | Requires live Oanda position book API |
| **WTI Correlation** | Requires FRED daily WTI crude series |

---

## 9. Data Requirements

| Timeframe | Used for |
|---|---|
| M1 | TP/SL exit precision (optional — falls back to EOD close) |
| M5 | Entry signals, Asia range build, feature bar windows |
| M30 | Monday range, CHoCH/BOS pivots, ADX, daily bar synthesis |

CSV format: `timestamp,open,high,low,close,volume` — Unix milliseconds, oldest row first.
