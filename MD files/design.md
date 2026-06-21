# Regime + Confluence Dashboard — Design Document

> A complete reference for the architecture, design decisions, and reasoning behind every part of this system.  
> Use this as the source of truth when extending, debugging, or revisiting the dashboard later.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Core Philosophy](#core-philosophy)
3. [Architecture](#architecture)
4. [Data Sources & APIs](#data-sources--apis)
5. [Caching Strategy](#caching-strategy)
6. [Asia Range Logic (Critical)](#asia-range-logic-critical)
7. [Monday Range Logic](#monday-range-logic)
8. [Fibonacci Levels](#fibonacci-levels)
9. [Confluence Detection](#confluence-detection)
10. [The 7-Tier Macro Scoring System](#the-7-tier-macro-scoring-system)
11. [Volatility Regime](#volatility-regime)
12. [Position Sizing](#position-sizing)
13. [Cross-Asset Sentiment](#cross-asset-sentiment)
14. [Foreign Yield Curves](#foreign-yield-curves)
15. [Smart Confluence Enhancement](#smart-confluence-enhancement)
16. [Display Modes](#display-modes)
17. [Adding New Confluence Sources (Future)](#adding-new-confluence-sources-future)
18. [Future Ideas & Roadmap](#future-ideas--roadmap)
19. [Common Pitfalls & Gotchas](#common-pitfalls--gotchas)
20. [Decision Log](#decision-log)

---

## Project Overview

### What This Is

A **single-page web dashboard** deployed on Cloudflare Pages that combines:
- **Tier 1: Macro Regime Analysis** — 7-tier scoring system that condenses fundamentals into a single −16 to +16 number
- **Tier 2: Fib Range Confluences** — Asia session and Monday range Fibonacci confluence detection (mirrors a TradingView Pine Script indicator)
- **Cross-Asset Context** — Risk sentiment traffic light, foreign yield curves, macro/price divergence detection
- **Smart Trade Setups** — Per-confluence star ratings, position sizing, and stop/target suggestions

### What It Solves

Pure technical analysis (Fib levels) doesn't tell you *which way* to lean. Pure macro analysis doesn't tell you *where* to enter. This dashboard bridges that gap:

> **Macro tells you the bias. Fib tells you the level. The dashboard ties them together with conviction scoring and risk sizing.**

### What It's Not

- ❌ A trading system / execution platform — no orders are placed
- ❌ A tick-level real-time feed — quotes refresh every 5 minutes, OHLC is daily/30min/5min
- ❌ A backtesting engine — scores are point-in-time, not historically validated
- ❌ Financial advice — informational and educational only

---

## Core Philosophy

### Three Foundational Principles

**1. Hierarchy of analysis (top-down):**
> Macro regime → Directional bias → Volatility regime → Entry levels → Position sizing → Stop/target

Each layer narrows the problem. The dashboard renders them in this order so the eye flows from "what's the world doing" to "where do I click buy/sell".

**2. Confluence over single signals:**
> A 4-star setup (tight Fib + bias-aligned + pivot match + close to price) is rare and worth waiting for. A 1-star setup is just a level on the chart.

The star system is the central abstraction — it's how the dashboard says "this is a real opportunity" vs "this is noise."

**3. Free-tier first, scale later:**
> Every data source must be free. Every API call must be cached aggressively. The dashboard runs comfortably within Twelve Data's 800/day free quota with 5 pairs and constant use.

When we add paid data later (CME OI, Databento volume profile), it should *enhance* existing confluences, not replace them.

---

## Architecture

### Deployment Stack

```
Browser (claude.ai-style frontend)
        │
        ↓ HTTPS
Cloudflare Pages
        │
        ├── _worker.js     ← API proxy (server-side, hides keys)
        ├── index.html     ← Dashboard UI + logic (client-side)
        └── _headers       ← Security headers
        │
        ↓ Server-side fetch (with API keys)
External APIs
        ├── FRED (api.stlouisfed.org) — macro data
        └── Twelve Data (api.twelvedata.com) — OHLC + quotes
```

### Why Cloudflare Pages

- **Free tier is generous**: 500 builds/month, unlimited requests
- **Worker-based API proxy**: API keys never reach the browser (env vars stay server-side)
- **Static + dynamic hybrid**: HTML served as static file, API calls go through worker
- **Same-origin = no CORS issues**: browser calls `/api/fred` → worker proxies to FRED
- **Edge-cached**: faster than running our own server

### File Layout

```
tier1-tier2-cloudflare/
├── _worker.js     (~6 KB)  — Server logic, API proxies
├── index.html     (~67 KB) — UI, calculations, rendering, all client logic
└── _headers       (155 B)  — Security headers (X-Frame-Options, etc.)
```

**Important:** The HTML file is large because all logic is inline (no bundler). This is intentional — easier to deploy, no build step, no dependencies. Trade-off: not modular, but for this size of project it's the right call.

### Environment Variables (Cloudflare Pages → Settings → Environment Variables)

| Variable | Purpose | Set in BOTH Production AND Preview |
|---|---|---|
| `FRED_KEY` | FRED macro data | ✅ Required |
| `TWELVE_KEY` | Twelve Data OHLC + quotes | ✅ Required |

**Critical lesson learned:** Cloudflare Pages has **two separate environment scopes** (Production and Preview). Variables must be set in BOTH or you'll get "API key not configured" errors on uploaded deploys (which go to Preview by default).

---

## Data Sources & APIs

### FRED (Federal Reserve Economic Data) — Free, unlimited

**What we use it for:** All macro data (yields, VIX, DXY, credit spreads, financial conditions, foreign rates).

**Rate limit:** Effectively unlimited (no throttling for normal use).

**Series fetched (16 total, batched in parallel in one call):**

| Internal Key | FRED Series ID | Frequency | Used For |
|---|---|---|---|
| `vix` | `VIXCLS` | Daily | T2 VIX scoring, risk sentiment |
| `us2y` | `GS2` | Daily | US yield curve |
| `us10y` | `GS10` | Daily | T1 rate differential basis |
| `dxy` | `DTWEXBGS` | Daily | T3 DXY direction |
| `hy` | `BAMLH0A0HYM2` | Daily | T4 credit spreads (reported in pp, multiply by 100 for bp) |
| `nfci` | `NFCI` | Weekly Wed | T6 financial conditions |
| `tips` | `DFII10` | Daily | T1 for gold (real yield) |
| `bei` | `T10YIE` | Daily | Breakeven inflation (display only) |
| `aud_usd` | `DEXUSAL` | Daily | T5 AUD/JPY proxy component |
| `usd_jpy` | `DEXJPUS` | Daily | T5 AUD/JPY proxy component |
| `de10y` | `IRLTLT01DEM156N` | **Monthly** | Foreign curve, T1 EUR/USD |
| `gb10y` | `IRLTLT01GBM156N` | **Monthly** | Foreign curve, T1 GBP/USD |
| `jp10y` | `IRLTLT01JPM156N` | **Monthly** | Foreign curve, T1 USD/JPY |
| `au10y` | `IRLTLT01AUM156N` | **Monthly** | Foreign curve, T1 AUD/USD |
| `de_short` | `IRSTCI01DEM156N` | **Monthly** | DE short-rate proxy (overnight) |
| `gb_short` | `IR3TIB01GBM156N` | **Monthly** | UK short-rate proxy (3-month) |
| `jp_short` | `IRSTCI01JPM156N` | **Monthly** | JP short-rate proxy (overnight) |
| `au_short` | `IR3TIB01AUM156N` | **Monthly** | AU short-rate proxy (3-month) |

**Critical caveats:**
- **HY OAS is reported in percentage points, not basis points.** A FRED value of `3.50` means **350 bp**, not 3.5 bp. Always multiply by 100 in the code.
- **Foreign rates are monthly**, not daily. This is the trade-off for using FRED's free OECD-sourced data. The `MO` badge in the UI tells the user when they're looking at month-old data.
- **NFCI updates weekly on Wednesdays.** Same value all week — that's expected, not a bug.
- **All FRED data has a 1-business-day lag** even for "daily" series. We're never seeing today's close, always yesterday's.

**API call pattern:**
```javascript
GET https://api.stlouisfed.org/fred/series/observations?series_id={ID}&api_key={KEY}&file_type=json&sort_order=desc&limit=5
```

We fetch 5 observations and skip any with value `"."` (FRED's null marker), so we always get the latest valid value plus previous(es) for delta calcs.

---

### Twelve Data — Free 800 calls/day

**What we use it for:** OHLC bars (daily, 30-min, 5-min) and live quotes.

**Rate limit:** 800 calls/day on free tier. With 5 pairs and 23h caching, normal use is ~5 OHLC + ~480 quotes = well under limit.

**Endpoints used:**

| Endpoint | Purpose | Cache Duration |
|---|---|---|
| `/time_series?interval=1day&outputsize=100` | Pivots, ATR, momentum (T7) | 23 hours |
| `/time_series?interval=5min&outputsize=800` | Asia session range (body only) | 18 hours |
| `/time_series?interval=30min&outputsize=700` | Monday range (body only) | 23 hours |
| `/quote` | Live current price | 5 minutes |

**Critical detail:** All Twelve Data queries pass `&timezone=Europe/London` so we get London-timestamped bars. Asia session is `00:00-06:00 London` and we filter by hour after parsing.

---

## Caching Strategy

### Why Aggressive Caching Matters

Without caching, with 5 pairs and casual use:
- 5 × 10 page loads/day × 4 API calls = **200+ daily calls** minimum
- That burns Twelve Data's 800/day quota in 4 days

With caching:
- FRED: ~2 calls/day (12h cache)
- OHLC daily: ~5 calls/day (23h cache, one per pair)
- OHLC 5-min: ~5 calls/day (18h cache, one per pair)
- OHLC 30-min: ~5 calls/day (23h cache, one per pair)
- Quotes: ~480 calls/day (5min cache, refresh every 5 min during 8h trading day × 5 pairs × 12)
- **Total: ~497 calls/day** = 62% headroom

### Cache Layer

**Storage:** Browser `localStorage`. Each user has their own cache (no server-side KV — chose simplicity over team-shared cache).

**Cache key pattern:**
```javascript
fred                      // shared across all pairs
ohlc_EURUSD              // daily bars per pair
ohlc5m_EURUSD            // 5-min bars per pair
ohlc30m_EURUSD           // 30-min bars per pair
quote_EURUSD             // live quote per pair
```

**Cache value structure:**
```javascript
{
  data: { ... },          // the actual API response
  timestamp: 1714392000000  // when it was cached
}
```

On read, we check `Date.now() - timestamp < maxAge`. If stale, refetch.

### Cache Durations Explained

| Data | Duration | Why |
|---|---|---|
| FRED | 12 hours | Macro data updates daily at most, 12h is safe |
| Daily OHLC | 23 hours | Daily bars set at session close, won't change intraday |
| 5-min OHLC | 18 hours | Asia closes at 06:00, valid until next midnight (00:00) |
| 30-min OHLC | 23 hours | Monday range only matters daily |
| Quote | 5 minutes | Balance between freshness and API budget |

### Cache Versioning

Each cached response includes a `version` field in the data object. If we change the data structure (e.g. add fields), we bump the version. Old cached entries fail validation and refetch automatically. No server-side migration needed.

---

## Asia Range Logic (Critical)

> **This is the most important section.** Got the logic wrong twice before pinning it down. Read carefully.

### Specification (matches Pine Script source of truth)

**Source:** TradingView indicator (`Asia Session Fib Retracement`, v6 Pine Script).  
**Range window:** `00:00:00` to `05:59:59` London time (Europe/London, handles BST/UTC automatically).  
**Bar interval:** 5-minute.  
**Range method:** **BODY ONLY** — `min(open, close)` and `max(open, close)`. **NOT high/low wicks.**

### Why Body Only (Not Wicks)

From the Pine Script comment:
- Wicks are noise (stop hunts, spikes, low-liquidity prints)
- Body represents true market acceptance
- More stable range calculation

### The Implementation

```javascript
function calculateAsiaRanges(symbol) {
  const bars = ohlc5m[symbol].values;  // 5-min bars in London time
  
  // Group bars by date and filter for Asia hours
  const sessionsByDate = {};
  bars.forEach(bar => {
    const dt = new Date(bar.datetime);
    const hour = dt.getHours();  // London hour (already in Europe/London tz)
    if (hour >= 0 && hour < 6) {  // 00:00 - 05:59
      const dateKey = bar.datetime.split(' ')[0];  // YYYY-MM-DD
      if (!sessionsByDate[dateKey]) sessionsByDate[dateKey] = [];
      sessionsByDate[dateKey].push(bar);
    }
  });
  
  // Get most recent two complete Asia sessions
  const sortedDates = Object.keys(sessionsByDate).sort().reverse();
  const today = computeBodyRange(sessionsByDate[sortedDates[0]]);
  const yesterday = computeBodyRange(sessionsByDate[sortedDates[1]]);
  
  // ... project Fibs and detect confluences
}

function computeBodyRange(bars) {
  let bodyHigh = -Infinity, bodyLow = Infinity;
  bars.forEach(bar => {
    const o = parseFloat(bar.open), c = parseFloat(bar.close);
    bodyHigh = Math.max(bodyHigh, Math.max(o, c));  // max of o/c
    bodyLow = Math.min(bodyLow, Math.min(o, c));    // min of o/c
  });
  return { high: bodyHigh, low: bodyLow, range: bodyHigh - bodyLow };
}
```

### Two Ranges We Track

We need **today's** and **yesterday's** Asia ranges to detect confluences (where today's Fib level aligns with yesterday's Fib level).

### Why This Matters for Confluence

The trading thesis: when **today's Fib SD level** is at the same price as **yesterday's Fib SD level** (within a small pip tolerance), that's a high-probability reversal/reaction zone. Two independent calculations agreeing = stronger evidence.

---

## Monday Range Logic

### Specification

Same logic as Asia, but:
- **Bar interval:** 30-minute (wider for stability — weekly levels need more breathing room)
- **Filter:** Only bars where `dayOfWeek === 1` (Monday)
- **Method:** Body only (`min/max of open/close`)

### "Effective Monday" Logic

The Pine Script has a clever rule: 
- **If today is Monday**: use *last week's* completed Monday data (current Monday isn't done yet, can't compare to itself)
- **If Tue-Sun**: use *this week's* Monday data

The dashboard implements this:
```javascript
const isMonday = today.getDay() === 1;
let effIdx = isMonday ? 1 : 0;       // skip current Monday if today is Monday
let prevIdx = effIdx + 1;             // the Monday before that
```

This ensures Monday confluences are always between **two completed sessions** — never against an incomplete current Monday.

### Why Monday Specifically

- Monday sets the tone for the week
- Weekend gaps create initial imbalance
- Monday range = weekly structural anchor
- Pine Script uses this; we follow.

---

## Fibonacci Levels

### The Full Set (45 levels)

```javascript
const FIB_LEVELS = [
  -9.5, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5,
  -4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, -0.25,
  0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3,
  3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8,
  8.5, 9, 9.5, 10, 10.5
];
```

**Range:** −9.5 to +10.5 (45 total levels). This matches the Pine Script's text-area input exactly.

### Projection Formula

```javascript
price = rangeLow + (range × fibMultiple)
```

For a range with `low = 1.0950, high = 1.1050, range = 0.01`:
- `SD 1.0` → `1.0950 + (0.01 × 1.0) = 1.1050` (range high)
- `SD 2.5` → `1.0950 + (0.01 × 2.5) = 1.1200` (extension)
- `SD -2.0` → `1.0950 + (0.01 × -2.0) = 1.0750` (extension below)
- `SD 0.5` → `1.0950 + (0.01 × 0.5) = 1.1000` (mid-range)

### Direction Logic (Pine Script Rule)

| Fib Range | Direction | Logic |
|---|---|---|
| `fib >= 1.0` | **SHORT** | Above range = sell rallies (mean revert back into range) |
| `fib <= -0.25` | **LONG** | Below range = buy dips (mean revert back up) |
| `0.0 <= fib <= 0.75` | **CONTEXT** | Inside range — direction depends on bar approach (above level → short, below → long) |

The dashboard currently classifies inside-range levels as `'context'` and doesn't auto-pick a direction. **TODO:** implement context-driven direction once we have the bar approach data wired in.

### Why SD Notation (Standard Deviation)

Unlike traditional Fib retracements (0.382, 0.618), this system uses **whole + half multiples** that project levels in BOTH directions from the range. The "SD" naming is a convention — it's not a literal standard deviation calculation, it's a multiplier of the range size.

---

## Confluence Detection

### The Core Algorithm

For each level in **today's** Fib set, check against every level in **yesterday's** (or previous Monday's) Fib set. If the price difference is within tolerance, it's a confluence.

```javascript
todayLevels.forEach(today => {
  yesterdayLevels.forEach(yesterday => {
    const diff = Math.abs(today.price - yesterday.price);
    if (diff <= normalDistance) {
      const price = (today.price + yesterday.price) / 2;  // midpoint
      const isTight = diff <= tightDistance;
      // ... add to confluences
    }
  });
});
```

### Confluence Thresholds

From Pine Script auto-detection:

| Instrument | Normal threshold | Tight threshold (10% of normal) |
|---|---|---|
| Forex (EUR/USD, GBP/USD, USD/JPY, AUD/USD) | **2 pips** | **0.2 pips** |
| Gold (XAU/USD) | **200 pips** ($20.00) | **20 pips** ($2.00) |

### Pip Sizes (per instrument)

```javascript
function getPipSize(symbol) {
  if (symbol.includes('JPY')) return 0.01;     // JPY pairs: 2nd decimal
  if (symbol.includes('XAU')) return 0.1;      // Gold: $0.10 = 1 pip
  return 0.0001;                                // Standard forex: 4th decimal
}
```

### Tight vs Normal

- **Tight (green border, 🟢):** Within 0.2 pips for forex / 20 pips for gold. **Highest probability**.
- **Normal (orange border, 🟠):** Within 2 pips for forex / 200 pips for gold. Still tradeable, but lower conviction.

### Deduplication

Two different (today, yesterday) Fib pairs can produce the same price (within rounding). We dedupe by:
```javascript
const priceKey = price.toFixed(getDigits(symbol));
if (!seen.has(priceKey)) seen.add(priceKey);
```

---

## The 7-Tier Macro Scoring System

This is the heart of the dashboard's bias calculation. Adapted from the fxmacro 8-tier system, dropping T8 (Session Flow) per user preference.

### Tier Summary

| Tier | Name | Range | Source |
|---|---|---|---|
| **T1** | Rate Differential | ±3 | FRED 10Y yields (or TIPS for gold) |
| **T2** | VIX Level + Direction | ±3 | FRED VIXCLS |
| **T3** | DXY Direction | ±2 | FRED DTWEXBGS |
| **T4** | HY Credit Spreads | ±2 | FRED BAMLH0A0HYM2 |
| **T5** | AUD/JPY Carry Proxy | ±2 | FRED DEXUSAL × DEXJPUS |
| **T6** | NFCI Financial Conditions | ±1 | FRED NFCI |
| **T7** | Momentum | ±2 | Twelve Data daily OHLC |

**Sum range:** −15 to +15.  
**Coherence bonus:** +1 if 5 of 7 tiers agree with the total score's sign.  
**Maximum displayed:** ±16.

### T1: Rate Differential — Per-Pair Logic

This is per-pair specific. The basis (which yield minus which) determines whether positive = bullish for the pair or bearish.

| Pair | T1 Basis | Bullish When... |
|---|---|---|
| **EUR/USD** | US 10Y − DE 10Y | Diff is **negative** (DE wins, EUR strong) |
| **GBP/USD** | GB 10Y − US 10Y | Diff is **positive** (UK wins, GBP strong) |
| **USD/JPY** | US 10Y − JP 10Y | Diff is **positive** (US wins, USD strong) |
| **AUD/USD** | AU 10Y − US 10Y | Diff is **positive** (AU wins, AUD strong) |
| **XAU/USD** | TIPS real yield (inverted) | TIPS **low** (real yield falling = gold rallies) |

**Scoring (forex):** Magnitude in basis points → score:
- `> 100 bp` → ±3 (full)
- `> 50 bp` → ±2
- `> 20 bp` → ±1
- `< 20 bp` → 0 (neutral)

**Scoring (gold):** TIPS level → score:
- `< 0%` → +3 (negative real yield = bullish gold)
- `< 0.5%` → +2
- `< 1.0%` → +1
- `< 1.5%` → 0 (neutral)
- `< 2.0%` → −1
- `< 2.5%` → −2
- `≥ 2.5%` → −3 (high real yield = bearish gold)

### T2: VIX Level + Direction

**Components:**
- **Level score** based on absolute VIX:
  - VIX `> 30`: −2 (extreme fear)
  - VIX `> 25`: −1.5
  - VIX `> 20`: −0.5
  - VIX `> 15`: +0.5
  - VIX `> 12`: +1
  - VIX `≤ 12`: +1.5 (complacency, but supports risk-on)
- **Direction score** based on VIX change vs previous:
  - Change `> +2`: −1 (spiking)
  - Change `> +0.5`: −0.5
  - Change `< −0.5`: +0.5
  - Change `< −2`: +1 (collapsing)

**Total VIX score:** level + direction, clamped to ±3.

**Inversion for safe havens:** For USD/JPY and Gold, the score is **negated** (high VIX = bullish for safe havens). This matches institutional logic: fear → flight to JPY/CHF/Gold.

### T3: DXY Direction

DXY change as percentage:
- `> 0.5%` → ±2 (full move)
- `> 0.2%` → ±1
- `< 0.2%` → 0

**Sign convention:**
- For **USD/JPY (USD-base pair)**: DXY up = USD strong = bullish (keep sign positive)
- For **EUR/USD, GBP/USD, AUD/USD (USD-quote pairs)**: DXY up = pair down (negate sign)
- For **Gold**: DXY up = gold down (negate sign), and amplifier × 1.5 (gold is more sensitive to USD)

### T4: HY Credit Spreads

HY in basis points (FRED reports in pp; we multiply by 100):
- **Level component:**
  - `> 600 bp` → −1.5 (stressed)
  - `> 500 bp` → −1
  - `> 400 bp` → −0.5
  - `< 300 bp` → +0.5 (very tight, risk-on)
- **Direction (change vs previous, in bp):**
  - `> +20` → −1 (widening fast)
  - `> +5` → −0.5
  - `< −5` → +0.5
  - `< −20` → +1 (tightening fast, risk-on)

**Inverted for safe havens** (Gold, USD/JPY).

### T5: AUD/JPY Carry Proxy

**Calculation:** `audjpy = DEXUSAL × DEXJPUS`
- DEXUSAL = USD per AUD (FRED quote convention)
- DEXJPUS = JPY per USD
- Product = AUD/JPY synthetic rate (no direct FRED series)

**Scoring (% change vs previous):**
- `> 0.5%` → ±2 (carry on, risk-on)
- `> 0.2%` → ±1
- `< 0.2%` → 0

**Inverted for safe havens:** carry-on hurts JPY/CHF/Gold.

### T6: NFCI Financial Conditions

Chicago Fed's National Financial Conditions Index (weekly, every Wednesday):
- `> 0.5` → −1 (very tight)
- `> 0.1` → −0.5 (tightening)
- `< −0.2` → +0.5 (loose)
- `< −0.5` → +1 (very loose)

**Inverted for safe havens.**

### T7: Momentum (technical, not macro)

**Signals:**
- EMA(20) vs EMA(50): cross direction → ±1
- RSI(14) level:
  - `> 60` → +0.5
  - `> 50` → +0.3
  - `< 50` → −0.3
  - `< 40` → −0.5

Sum, clamped to ±2.

### Coherence Bonus

Count tiers that agree with the total score's sign. If `≥ 5 of 7` agree, add `+1` (or `−1` if total is negative). This rewards setups where the entire macro picture aligns.

**Display:** Coherence dots (T1 through T7) colored green/red/amber.

---

## Volatility Regime

### ATR Percentile Method

```javascript
function calculateVolRegime() {
  const ranges = bars.slice(0, 100).map(b => b.high - b.low);
  const recent = ranges.slice(0, 14).reduce((a,b) => a+b, 0) / 14;  // recent 14-day avg
  const sorted = [...ranges].sort((a,b) => a-b);
  const rank = sorted.findIndex(v => v >= recent);
  const percentile = (rank / sorted.length) * 100;
}
```

**Classification:**
| Percentile | Regime | Size Multiplier |
|---|---|---|
| ≤ 25th | LOW | 1.0× |
| 26th–74th | NORMAL | 1.0× |
| ≥ 75th | HIGH | **0.6×** (reduce 40%) |

### Why This Matters

A macro score of +13 doesn't mean "trade full size" if VIX is 35 and ATR is in the 90th percentile. Volatility multiplies risk per trade — wider stops eat more capital. The dashboard auto-reduces position size in HIGH vol regimes.

---

## Position Sizing

### Score → Base Size

| Macro Score (abs) | Position Size (% of normal) |
|---|---|
| ≥ 13 | 100% |
| 9–12 | 75% |
| 5–8 | 50% |
| 4 | 25% |
| 0–3 | 10% |

### Vol Adjustment

`Final Size = Base Size × Vol Multiplier`

Where vol multiplier is `1.0` for LOW/NORMAL and `0.6` for HIGH.

### Per-Confluence Adjustment

If a confluence's direction **doesn't** match the macro bias, halve the size:
```javascript
const sizeAdj = aligned ? 1 : 0.5;
const finalSize = Math.round(baseSize * sizeAdj);
```

This means a non-aligned trade off a 4-star confluence with score +13 in HIGH vol gives:
- Base: 100%, Vol: ×0.6 = 60%
- Not aligned: ×0.5 = **30%**

A counter-trend trade that's still worth taking but at a fraction of normal size.

### Stop & Target Suggestions

Currently using a **simplified ATR-based** approach:
- **Stop**: ATR × 0.5 (in price terms) from entry
- **Target**: 2 × stop distance (1:2 R:R baseline)

These are **suggestions**, not gospel. The actual TP should ideally be the **next confluence** in the trade direction, but that requires more logic.

**Future:** wire up actual next-confluence TPs (see [Future Ideas](#future-ideas--roadmap)).

---

## Cross-Asset Sentiment

### The Risk Sentiment Traffic Light

Three composite signals, each with its own card:

**1. AUD/JPY Carry**  
- Risk-on currency (AUD) vs safe haven (JPY)
- Calculated synthetically from FRED FX series
- > +0.2% / 24h = risk-on (🟢)
- < −0.2% / 24h = risk-off (🔴)
- Within range = mixed (🟡)

**2. HY Credit Spreads**
- > +5 bp / day = widening = risk-off (🔴)
- < −5 bp / day = tightening = risk-on (🟢)
- Stable = mixed (🟡)

**3. Composite**
- 2-of-3 signals agree → confirmed regime
- Mixed = caution (🟡)

The composite tells you whether to **trust momentum** (risk-on, follow the trend) or **fade extensions** (risk-off, mean revert at Fib levels).

---

## Foreign Yield Curves

### Display

Sidebar card showing **2s10s spread** for:
- 🇺🇸 US (daily, accurate)
- 🇩🇪 Germany (monthly, OECD-sourced)
- 🇬🇧 UK (monthly)
- 🇯🇵 Japan (monthly)
- 🇦🇺 Australia (monthly)

### Spread Status

| Spread | Status | Color |
|---|---|---|
| `< 0 bp` | Inverted | Red |
| `0–50 bp` | Flat | Amber |
| `> 50 bp` | Normal | Green |

### Why Foreign Curves Matter

> "Money flows to highest risk-adjusted return." — fxmacro lessons

If the **US curve** is flattening but the **DE curve** is steepening, that's a structural tailwind for EUR (capital flows toward DE growth recovery). This is a slower-moving signal than daily price action — months matter, not days.

### Trade-off

FRED only has **monthly data** for foreign rates. We accept this and clearly mark it with `MO` badges. The 2Y proxies are **overnight call rate** (DE, JP) or **3-month interbank** (UK, AU) — not technically 2Y, but close enough for spread direction.

---

## Smart Confluence Enhancement

### The 4-Star System

Each confluence gets graded on 4 criteria:

| Star | Criterion | Weight |
|---|---|---|
| ⭐ | Confluence detected (base) | 1 |
| ⭐⭐ | Tight (within 0.2 pips for forex) | 1 |
| ⭐⭐⭐ | Direction matches macro bias | 1 |
| ⭐⭐⭐⭐ | Within ATR×0.3 of a daily pivot | 1 |

**Trade quality threshold:** Take ⭐⭐⭐ or ⭐⭐⭐⭐ setups only.

### Enhancement Pipeline

```javascript
function enhanceConfluences(confluences, currentPrice, bias, pivots, volRegime, macroScore) {
  return confluences.map(c => {
    // 1. Distance from current price
    const distance = pipsBetween(currentPrice, c.price, symbol);
    
    // 2. Bias alignment
    const aligned = (c.direction === 'short' && bias === 'SHORT') ||
                    (c.direction === 'long' && bias === 'LONG');
    
    // 3. Pivot proximity (within ATR × 0.3)
    const pivotZone = atr * 0.3;
    let pivotMatch = null;
    Object.entries(pivots).forEach(([key, val]) => {
      if (Math.abs(c.price - val) <= pivotZone) {
        pivotMatch = key.toUpperCase();
      }
    });
    
    // 4. Compute stars
    let stars = 1;
    if (c.isTight) stars++;
    if (aligned) stars++;
    if (pivotMatch) stars++;
    
    // 5. Position sizing
    const baseSize = calcPositionSize(macroScore, volRegime);
    const finalSize = Math.round(baseSize * (aligned ? 1 : 0.5));
    
    // 6. Stop & target
    const stopDist = atr * 0.5;
    const sl = c.direction === 'short' ? c.price + stopDist : c.price - stopDist;
    const tp = c.direction === 'short' ? c.price - (stopDist * 2) : c.price + (stopDist * 2);
    
    return { ...c, distance, aligned, pivotMatch, stars, size: finalSize, sl, tp };
  });
}
```

### Sort Order

After enhancement, sort confluences by:
1. **Stars descending** (best setups first)
2. **Distance ascending** (closest to current price)

This puts the most actionable setup at the top of the list.

---

## Display Modes

Three modes from the Pine Script, exposed as a top toggle:

| Mode | Filter | When to Use |
|---|---|---|
| **Strongest** | Tight confluences only (≤0.2 pips) | Default. Highest probability. |
| **Strong** | All confluences (tight + normal) | When you want more options |
| **All Levels** | All confluences + key Fib levels | Research / chart markup |

In code:
```javascript
function filterConfluences(confluences) {
  if (currentMode === 'strongest') return confluences.filter(c => c.isTight);
  return confluences;  // 'strong' and 'all' currently same — TODO add key levels for 'all'
}
```

**TODO:** "All Levels" mode should also surface key Fib levels (0.25, 0.5, 0.75, 1.0) without confluence. Currently identical to "Strong".

---

## Adding New Confluence Sources (Future)

The architecture is **designed** for additional confluence sources to be added without refactoring. Here's the recipe.

### Pattern: A Confluence Source = (Levels, Direction Logic, Source Tag)

Every confluence source produces:
1. A list of price levels
2. A direction implied by each level (or "context")
3. A source tag for display ("asia", "monday", "vpoc", "max-pain", etc.)

### Adding a New Source — Step by Step

**Example: Adding Daily Open Lines**

1. **Calculate the levels** (in `index.html` script):
```javascript
function calculateDailyOpenLevels(symbol) {
  const bars = ohlcData[symbol].values;
  const today = bars[0];
  const yesterday = bars[1];
  
  return [
    { price: parseFloat(today.open), label: 'Today Open', direction: 'context' },
    { price: parseFloat(yesterday.open), label: 'Yest Open', direction: 'context' }
  ];
}
```

2. **Detect cross-source confluences** with existing Fib levels:
```javascript
function detectFibVsDailyOpen(fibLevels, dailyOpenLevels, symbol) {
  // Same algo as detectConfluences, but matching Fib → DailyOpen instead of Fib → Fib
}
```

3. **Tag the source** in the result:
```javascript
{
  ...,
  source: 'daily-open',  // new tag
  sourceLabel: 'Today Open'
}
```

4. **Add styling** for the new source tag in CSS:
```css
.ci-source.daily-open {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}
```

5. **Add icon** in the render function:
```javascript
const sourceIcon = c.source === 'asia' ? '📍 Asia' :
                   c.source === 'monday' ? '🗓️ Monday' :
                   c.source === 'daily-open' ? '🌅 Day Open' :
                   '?';
```

6. **Optional: Upgrade the star rating** if a confluence has multiple sources:
```javascript
// In enhanceConfluences:
if (c.hasDailyOpenMatch) stars++;  // 5-star setups become possible
```

### Future Confluence Sources (Roadmap)

Listed in priority order:

| Source | Data Required | Free? | Effort |
|---|---|---|---|
| **Daily Open** | Already have (daily OHLC bar 0) | ✅ Free | Low — 2 hours |
| **Yesterday's High/Low** | Already have | ✅ Free | Low |
| **Round Numbers** | Calculated from current price | ✅ Free | Low |
| **Previous Week High/Low** | Already have (30min bars cover this) | ✅ Free | Low |
| **Volume Profile (VPOC, naked POCs)** | Databento or similar | ❌ ~$30/mo | Medium |
| **CME OI Walls (call wall, put wall)** | CME DataMine | ❌ Free delayed / paid live | Medium |
| **Max Pain (options)** | CME DataMine + calculation | ❌ Same | Medium |
| **Order Blocks (ICT-style)** | Algorithmic detection from OHLC | ✅ Free | High |
| **Fair Value Gaps (ICT-style)** | Algorithmic detection from OHLC | ✅ Free | High |

### "Super-Confluence" Detection (the goal)

When **3+ different sources** all converge within ATR × 0.3 → that's a **super-confluence** worth treating as 5-star.

Example:
> 🟢🟢🟢🟢🟢 SUPER @ 1.0950
> ✅ Asia Fib SD 1.5 (tight, 0.2 pips)  
> ✅ Monday Fib SD 1.0 (tight, 0.5 pips)  
> ✅ Daily Pivot R1  
> ✅ Yesterday's High  
> ✅ CME 1.0950 call wall (15k OI)

These setups will be rare but high-probability.

---

## Future Ideas & Roadmap

### Phase 4: Persistent Memory & Learning (next major step)

**Idea:** Store every detected confluence and track outcomes.

**Cloudflare KV** namespace `CONFLUENCES`:
```
key: "EURUSD:2026-04-30:1.0950"
value: {
  detected: { stars: 4, direction: 'short', sl: 1.0972, tp: 1.0892 },
  result: { hit: 'tp', pips: +58, entryFilled: true, exitTime: ... }
}
```

After enough samples, calculate:
- 4-star setup win rate (e.g., 73%)
- 3-star setup win rate (e.g., 58%)
- 2-star setup win rate (e.g., 42%)

This gives **statistical backing** to the star system. If 3-star setups are below 50%, drop them from the default mode.

### Phase 5: Notifications

**Browser push or email** when:
- A 4-star confluence is within 5 pips of current price
- Major macro divergence detected
- Risk sentiment flips (composite changes from on → off or vice versa)

### Phase 6: Multi-Timeframe Confluences

Currently we only do **daily Asia** and **weekly Monday**. Add:
- **4-Hour London Session range** (08:00-12:00 London body-only)
- **Daily NY session range** (13:00-22:00 London body-only)
- **Monthly range** (use first day of month, 30-min body)

Each adds another set of Fib levels. **Quadruple-confluences** become possible.

### Phase 7: Discretionary Override Layer

Add a "trade conviction" notes field per pair (stored in KV) where the user can record:
- "I'm watching EUR/USD for breakout above 1.10 — only take longs"
- "Avoid USD/JPY this week — BoJ meeting"

Display on the pair card. Cross-check confluences against these notes.

### Phase 8: Real-Time Alerts via WebSocket

Currently quote refresh is 5-min cache. For live monitoring near a key confluence:
- When price within 30 pips of a 4-star confluence, **switch quote endpoint to refresh every 30 seconds**
- Use `setInterval` with adaptive frequency

**API budget:** even 30s refreshes for 1 hour = 120 calls. Still well within free tier when used selectively.

### Phase 9: AI Narrative (port from fxmacro)

The fxmacro dashboard has a Claude-generated morning briefing. Port that here:
- POST to `/api/narrative` with current state JSON
- Claude generates a 4-paragraph trader's brief: "Today the macro picture is..."
- Cache for 23 hours in KV
- Cost: ~$0.01 per pair per day, shared across team

### Phase 10: Multi-Pair Dashboard View

Currently single-pair-at-a-time. Add a "All Pairs" grid view (like fxmacro):
- Mini-card per pair showing score, bias, current price, distance to nearest 4-star confluence
- Click to drill into single-pair view
- Highlights pairs with active 4-star setups

### Phase 11: Backtesting Hook

The Fib strategy already has a backtester (separate `fibhq.pages.dev` project per docs). Wire its results in:
- Display historical 4-star setup win rates from backtest data
- "Last 30 days: 7 of 10 4-star setups hit TP"
- Build confidence in the system

### Phase 12: Mobile Layout Optimization

Current layout works on mobile but could be better:
- Stack confluence cards vertically with bigger touch targets
- Swipe between pairs instead of tabs
- Long-press a confluence to set an alert

---

## Common Pitfalls & Gotchas

### 1. HY OAS Unit Confusion
FRED reports HY OAS in **percentage points** (e.g. `3.50` = 350 bp). Always multiply by 100 for bp display. Easy to forget — caused early bug where T4 was 100× too small.

### 2. Date Parsing & Timezones
Twelve Data with `&timezone=Europe/London` returns bars labeled in London time. `new Date(bar.datetime).getHours()` returns the **browser's** local hour interpretation. **Solution:** parse the datetime string directly. The `getHours()` after `new Date()` actually works because the string format is timezone-agnostic ISO-like, but verify if anything weird shows up.

### 3. Cloudflare Pages Two-Environment Trap
Setting env vars only in **Production** but uploading to **Preview** = "API key not configured" error. Always set in BOTH.

### 4. Cache Invalidation
If you change the data structure, bump the `version` field in the response. Old cached entries with `version: 1` will fail validation when the code expects `version: 2`. **Soft-fail and refetch** rather than hard error.

### 5. Monday Detection
`new Date().getDay()` returns 0-6 with **Sunday = 0**. Monday = 1. Don't confuse with `getDate()` (day of month).

### 6. FRED Null Values
FRED uses `"."` as a null marker for missing observations (weekends, holidays). Filter these out:
```javascript
const valid = json.observations.filter(o => o.value && o.value !== '.');
```

### 7. Body Range, Not Wick Range
Critical for Asia and Monday calculations. Use `min(open, close)` and `max(open, close)`, NEVER `bar.high` and `bar.low`. Made this mistake twice — wicks include stop hunts and produce different (worse) Fib levels.

### 8. Pip Size for Gold
Gold pip = `$0.10`, not `$0.01`. Confluence threshold for gold = 200 pips = $20. Easy to confuse with forex pip sizes.

### 9. Tight Confluence Percentage
Tight = 10% of normal threshold. So:
- Forex: 0.2 pips (10% of 2 pips)
- Gold: 20 pips (10% of 200 pips)

Don't hardcode 0.2 — derive from `normalDistance × 0.10`.

### 10. AUD/JPY Synthetic Calculation
`AUD/JPY = AUD/USD × USD/JPY = DEXUSAL × DEXJPUS`. Make sure both components have prev values before computing the change percentage.

---

## Decision Log

Important architectural choices and why we made them.

### Decision: Cloudflare Pages over Vercel/Netlify
**Why:** Worker-based proxy with env vars hidden. Free tier is generous. Existing fxmacro deployment uses same pattern — consistent.

### Decision: Single-file `index.html` over modular bundle
**Why:** Trade modularity for deployment simplicity. No build step, no dependencies, drag-and-drop deploy. Project size is small enough that splitting files would add complexity without proportional benefit.

### Decision: localStorage cache over Cloudflare KV
**Why:** Simpler. Each user has their own cache. KV adds setup overhead and shared cache isn't useful for per-pair analysis. **Future:** could add KV for shared confluence outcome tracking (Phase 4).

### Decision: 7 tiers, drop Session Flow (T8)
**Why:** User-requested. T8 was a +1/−1 based on London/NY session — minor signal, doesn't add much when we're already filtering by Asia session. Drop reduces noise.

### Decision: Foreign curves use monthly OECD data
**Why:** FRED doesn't have daily 2Y for foreign countries. Monthly is the best free option. Acceptable because:
- 2s10s shape changes slowly (months, not days)
- Marked with `MO` badge so user knows
- Better than nothing — adds context for cross-country structural views

### Decision: Star system as central abstraction
**Why:** Boolean "is this a good setup?" is too binary. 4 criteria scored independently gives a clear, intuitive scale. Maps directly to "do I take this trade or not?"

### Decision: Position sizing as % of normal, not absolute
**Why:** Doesn't presume the user's account size. They multiply by their own normal trade size. 100% = full normal, 25% = quarter size.

### Decision: ATR × 0.5 for default stops
**Why:** Pine Script uses 0.25-0.5 range. We picked 0.5 as a reasonable middle. Tight stops match the strategy (mean reversion at structural levels). User can override based on their own rules.

### Decision: 1:2 R:R fixed target
**Why:** Default for safety. **Better future approach:** target = next confluence in trade direction. Implementing this requires sorting confluences by price direction and finding the next one — not hard, but adds complexity. Defer to Phase 5.

### Decision: Skip "All Levels" mode key levels for now
**Why:** 'All' mode is currently same as 'Strong'. Adding key Fib levels (0.25, 0.5, 0.75, 1.0) without confluence would clutter the UI. Defer until clear use case emerges.

### Decision: Risk Sentiment uses 3 signals (AUD/JPY, HY, VIX)
**Why:** Three is enough for 2-of-3 voting (clear regime detection). More signals = more confusion. AUD/JPY = cleanest carry proxy, HY = leading credit indicator, VIX = fear gauge — covers FX, credit, equity vol.

### Decision: Display foreign curves in sidebar, not top
**Why:** Foreign curves are slow-moving structural context, not daily trade signals. Sidebar = reference; top = action.

### Decision: Macro Divergence flag thresholds (score ≥ |4|, price move ≥ |1%| / 5d)
**Why:** Picked to catch real divergences without too much noise. May need tuning after observation. Goal: surface 1-3 alerts per week, not constant warnings.

---

## Appendix: Key Files & Locations

| File | Purpose | Approx Size |
|---|---|---|
| `_worker.js` | Server-side API proxy | 6 KB |
| `index.html` | UI + all client logic | 67 KB |
| `_headers` | Security headers | 155 B |
| `Fib_STRATEGY_DOCUMENTATION.md` | Source-of-truth Fib strategy spec | (project ref) |
| `Fxmacro_dashboard_handover.md` | fxmacro reference | (project ref) |
| `trading_lessons_reference.md` | Macro lessons | (project ref) |
| `inverted_yield_curve_notes.md` | Curve dynamics | (project ref) |

---

## Appendix: Quick Reference Formulas

**Fib level projection:**
```
price = rangeLow + (range × fibMultiple)
```

**Body range:**
```
high = max over all bars of max(open, close)
low  = min over all bars of min(open, close)
range = high - low
```

**Pivot points (standard):**
```
PP = (yesterdayHigh + yesterdayLow + yesterdayClose) / 3
R1 = (2 × PP) - yesterdayLow
R2 = PP + (yesterdayHigh - yesterdayLow)
R3 = yesterdayHigh + 2 × (PP - yesterdayLow)
S1 = (2 × PP) - yesterdayHigh
S2 = PP - (yesterdayHigh - yesterdayLow)
S3 = yesterdayLow - 2 × (yesterdayHigh - PP)
```

**ATR (simple, used in this dashboard):**
```
range[i] = high[i] - low[i]
ATR = average(range[0..13])  // 14-day simple avg
```

**EMA:**
```
k = 2 / (period + 1)
EMA[i] = price[i] × k + EMA[i-1] × (1 - k)
```

**RSI(14):**
```
For each day: gain = max(close - prevClose, 0), loss = max(prevClose - close, 0)
avgGain = average of gains over 14 days (then EMA-style update)
avgLoss = average of losses over 14 days
RS = avgGain / avgLoss
RSI = 100 - (100 / (1 + RS))
```

**AUD/JPY synthetic:**
```
AUD/JPY = DEXUSAL × DEXJPUS
       = (USD per AUD) × (JPY per USD)
       = JPY per AUD
```

**Coherence count:**
```
agreeCount = count of tiers where sign(tier.score) === sign(totalScore) && tier.score !== 0
coherenceBonus = +1 (or -1) if agreeCount >= 5 of 7 tiers
```

**Position size:**
```
baseSize = 
  abs(score) >= 13 ? 100 :
  abs(score) >= 9  ? 75  :
  abs(score) >= 5  ? 50  :
  abs(score) >= 4  ? 25  :
                     10
finalSize = round(baseSize × volMultiplier × alignmentMultiplier)
volMultiplier = 0.6 if HIGH vol else 1.0
alignmentMultiplier = 1.0 if direction matches macro bias else 0.5
```

---

## End of Document

**Last updated:** April 2026  
**Maintainer's note:** Update this document whenever the architecture changes. Future-you will thank present-you.

> "The foundation is solid. Now build on it."  
> — Fib Strategy Documentation closing line

