 # MacroFXModel — Future Build Roadmap

## Current State (as of May 2026)

### Supported Instruments (9)
| Symbol | Type | Data Source |
|---|---|---|
| EUR/USD, GBP/USD, USD/JPY, AUD/USD | FX Major | TwelveData |
| EUR/GBP, USD/CAD, USD/CHF, GBP/JPY | FX Cross/Major | TwelveData |
| XAU/USD | Commodity | TwelveData |
| NAS100_USD | Equity Index | OANDA |

### Features Shipped
- 8-tier macro scoring (T1–T8): rate differential → Kalman 5m deviation
- Bayesian probability score (% continuation direction)
- VuManChu fractal divergence (RSI daily + WaveTrend 5m)
- Confluence level detection with star rating (max 9⭐)
- Entry scanner with tag chips and Telegram alerts
- COT positioning for FX + Gold + NQ
- Finnhub economic calendar with macro surprise index
- GARCH volatility regime
- 4h range detection, GEX proxy, OI proxy

---

## Phase 1 — Architecture Refactor (2h)
**Goal:** Replace boolean instrument flags with a proper `assetClass` field so all downstream code branches cleanly.

### What to change

**`js/config.js`** — replace individual booleans on each pair object:
```js
// BEFORE
{ symbol: 'NAS100_USD', isEquity: true, ... }
{ symbol: 'XAU/USD',    isGold: true,   isSafeHaven: true, ... }
{ symbol: 'USD/JPY',    isSafeHaven: true, isUsdBase: true, ... }

// AFTER
{ symbol: 'NAS100_USD', assetClass: 'index',     usdBase: true,  invert: false }
{ symbol: 'XAU/USD',    assetClass: 'commodity', usdBase: true,  invert: true  }
{ symbol: 'USD/JPY',    assetClass: 'fx',        usdBase: true,  invert: false, safeHaven: true }
{ symbol: 'DOW_USD',    assetClass: 'index',     usdBase: true,  invert: false }
{ symbol: 'UK100_USD',  assetClass: 'index',     usdBase: false, invert: false }
```

**`js/macro.js`** — replace all `S.currentPair.isGold / isEquity / isSafeHaven` checks with:
```js
const cls = S.currentPair.assetClass;  // 'fx' | 'commodity' | 'index'
const inv = S.currentPair.invert;
```

**`js/utils.js` `getPipSize()`** — extend with index point sizes:
```js
function getPipSize(symbol) {
  const pair = PAIRS.find(p => p.symbol === symbol);
  if (!pair) return 0.0001;
  if (pair.assetClass === 'index') return 1.0;
  if (symbol.includes('XAU'))     return 0.1;
  if (symbol.includes('JPY'))     return 0.01;
  return 0.0001;
}
```

---

## Phase 2 — DOW (US30) Support (~20–25h)

### 2a. Config + data routing (2–3h)

Add to `PAIRS` in `js/config.js`:
```js
{ symbol: 'DOW_USD', code: 'dow', shortCode: 'dow', name: 'DOW 30',
  assetClass: 'index', usdBase: true, invert: false }
```

Add to `COMPASS_CONFIG`:
```js
'DOW_USD': { short: null, long: 'us10y', label: 'Yield Curve', isEquity: true }
```

In `_worker.js` add `DOW_USD` to the `OANDA_EQUITY_SYMBOLS` set (or route to Polygon if OANDA doesn't carry it):
```js
const OANDA_EQUITY_SYMBOLS = new Set(['NAS100_USD', 'DOW_USD']);
```

### 2b. T1 rewrite for indices (4–6h)

**Current T1:** yield spread between two countries' 10Y + 2Y bonds — meaningless for DOW.

**New T1 for `assetClass === 'index'`:**
- Option A (simple): use US yield curve steepness (10Y − 2Y). Steepening = growth expectations = bullish equities. Already computed for NAS100; generalise it.
- Option B (better): earnings yield gap = S&P forward earnings yield − US 10Y real yield. Requires adding `SP500_EY` FRED series or Polygon fundamental data.
- Option C (proxy): invert VIX momentum as T1. Spike in VIX = bearish, declining VIX = bullish. Cheap to implement, less precise.

**Recommended:** Option A for Phase 2 (fast), upgrade to Option B later.

```js
// In computeT1() in macro.js
if (cls === 'index') {
  const curve = fredVal('us10y') - fredVal('us2y');
  // steeper curve → growth regime → bullish
  const score = curve > 0.5 ? 1 : curve > 0 ? 0 : -1;
  return { score, max: 1, label: 'Yield Curve', ... };
}
```

### 2c. T3 USD strength for indices (1h)

Currently T3 builds a USD composite from 4 FX pairs. For US equity indices (DOW, NAS100) this is already handled — USD strengthening is bearish (amplifier 1.5×, inverted flag). For FTSE the USD is largely irrelevant; disable T3 for non-USD indices:

```js
if (cls === 'index' && !pair.usdBase) {
  return { score: 0, max: 1, na: true, label: 'USD N/A' };
}
```

### 2d. Session detection (2–3h)

**`js/session.js`** currently knows Asia / London / NY FX opens. Extend to equity index sessions:

| Index | Exchange | Hours (UTC) |
|---|---|---|
| DOW / NAS100 / SPX | CME / NYSE | 13:30–20:00 cash; 23:00–22:00 futures |
| FTSE 100 | LSE | 08:00–16:30 |
| DAX | XETRA | 07:00–15:30 |
| Nikkei | TSE | 00:00–06:00 |

```js
function getIndexSession(symbol, nowUtc) {
  if (['DOW_USD', 'NAS100_USD', 'SPX_USD'].includes(symbol)) {
    const h = nowUtc.getUTCHours();
    if (h >= 13 && h < 20) return 'NY Cash';
    if (h >= 20 || h < 13) return 'Futures';
  }
  // ... FTSE, DAX, Nikkei
}
```

### 2e. Confluence caps + COT (1–2h)

Add `dow` bucket to caps config (same pattern as `gold`, `nas100`):
```js
export const DOW_CAPS_DEFAULTS = {
  confluenceThresholdPips: 100,   // 100 DOW points
  minStarsAlert: 4,
  ...
};
```

COT: CFTC publishes DOW futures (YM) positioning. Add to COT URL modal and extend `FX_MAP` in `_worker.js`:
```js
'DOW_USD': /Dow Jones.*Mini/i
```

---

## Phase 3 — FTSE (UK100) Support (~12–15h after DOW)

Most of the T1 rewrite and session logic from Phase 2 is reused. Additional work:

- **Config:** `{ symbol: 'UK100_GBP', assetClass: 'index', usdBase: false, invert: false }`
- **Data source:** OANDA carries UK100_GBP as a CFD. Add to `OANDA_EQUITY_SYMBOLS`.
- **T1:** Use UK yield curve (GB 10Y − GB 2Y) instead of US curve. Already fetch `gb10y` from FRED; add `gb2y` series.
- **T3:** Disable — GBP/USD sensitivity to FTSE is weak; not worth the noise.
- **T5 (carry trade):** Irrelevant; disable or replace with GBP risk sentiment proxy.
- **Compass:** `'UK100_GBP': { long: 'gb10y', label: 'UK Yield Curve', isEquity: true }`
- **COT:** LIFFE FTSE 100 futures (Z). CFTC reports available under "FTSE 100 INDEX" in the financial TFF report.

---

## Phase 4 — Jobs / NFP Data (~4–6h)

### Data (1h)
Add to `FRED_SERIES` map in `_worker.js`:
```js
PAYEMS:   'US NFP Payrolls',        // thousands of jobs added
UNRATE:   'US Unemployment Rate',   // percent
IC4WSA:   'Initial Jobless Claims', // weekly
JOLTS:    'Job Openings',           // millions (JTSJOL)
```

### Display (1–2h)
Add a "Jobs" sub-card in the macro regime section, similar to the existing yield/VIX cards. Show:
- Latest NFP vs prior vs forecast (from Finnhub calendar actual/forecast)
- Unemployment rate trend (3-month direction)
- Jobless claims 4-week MA

### Tier integration (2–3h)
NFP surprises already flow through the **Finnhub macro surprise index** (T6). To give jobs data more weight:

Option A: Weight the `jobs` event category higher in the surprise score (quick).

Option B: Create a standalone **T9 — Labour Market** tier:
- Score: +1 if NFP beat + unemployment falling, −1 if NFP miss + unemployment rising
- Na if no release in last 35 days
- Only active for USD-denominated pairs (all FX majors + US indices)

### Telegram alerts
Add jobs summary line when a surprise is fresh (< 5 days old):
```
📋 Jobs: NFP +256k (exp +185k) · UE 3.9%
```

---

## Phase 5 — Additional Indices (~8–12h each after Phase 2)

| Index | Symbol | Exchange | COT | Notes |
|---|---|---|---|---|
| S&P 500 | SPX_USD | CME (ES) | Yes | Similar to DOW; most liquid |
| DAX 40 | DAX_EUR | XETRA (FDAX) | Yes | EUR-denominated; needs EUR yield curve |
| Nikkei 225 | NKY_JPY | CME (NK) | Yes | JPY-denominated; invert USD logic |
| Hang Seng | HSI_HKD | HKEX | Sparse | HKD peg to USD; limited COT |
| Russell 2000 | RUT_USD | CME (RTY) | Yes | Small-cap US; higher beta to jobs data |

Each follows the same Phase 2 pattern. The T1 driver varies:
- **DAX:** German yield curve (DE 10Y − DE 2Y); already fetching `de10y`; add `de2y`
- **Nikkei:** JP yield curve (JP 10Y − JP 2Y); already fetching `jp10y`; add `jp2y`
- **S&P 500:** same as DOW (US yield curve or earnings yield)

---

## Phase 6 — Commodities Expansion (~10–15h)

| Symbol | Type | T1 Driver | COT |
|---|---|---|---|
| XAG/USD (Silver) | Commodity | TIPS real yield (same as gold) | Yes (CFTC COMEX) |
| WTI (Oil) | Commodity | DXY inverse + EIA inventory surprise | Yes (CFTC NYMEX) |
| Copper | Commodity | China PMI proxy + DXY inverse | Yes (CFTC COMEX) |

Silver is cheapest — shares Gold's T1 logic (TIPS real yield). Just add config + data source.

Oil requires an EIA inventory surprise series — not currently in FRED fetch; would need Finnhub or EIA API for weekly data.

---

## Architectural Notes for All Phases

### Flag evolution
```
v1 (current):  isGold, isEquity, isSafeHaven, isUsdBase, isPairCross   ← booleans
v2 (Phase 1):  assetClass ('fx'|'index'|'commodity'), usdBase, invert  ← structured
v3 (future):   full InstrumentProfile object with tier overrides        ← extensible
```

### Tier override pattern (Phase 3+)
Rather than littering `macro.js` with more `if/else` branches, consider a tier config table per instrument:
```js
// In config.js
'UK100_GBP': {
  T1: { driver: 'uk_yield_curve' },
  T3: { disabled: true },
  T5: { disabled: true },
}
```
Then `macro.js` looks up overrides before computing each tier.

### Data source priority
1. OANDA — preferred for all CFD instruments (FX, indices, commodities)
2. TwelveData — fallback for OANDA gaps; better for exotic FX
3. Polygon — for US equities if OANDA doesn't carry them
4. FRED — economic series only (yields, spreads, macro indicators)
5. Finnhub — economic calendar events only

### COT expansion
The `_worker.js` COT parser handles two CFTC report formats:
- **TFF (Traders in Financial Futures):** FX + equity index futures
- **Disaggregated:** commodities (gold, silver, oil, copper)

Adding a new instrument = adding one regex line to `FX_MAP` (TFF) or `DISAGG_MAP` (disaggregated) + user supplies the CFTC report URL in the modal.

---

## Effort Summary

| Phase | Description | Estimated Hours |
|---|---|---|
| 1 | Architecture refactor (assetClass flags) | 2h |
| 2 | DOW (US30) | 20–25h |
| 3 | FTSE (UK100) | 12–15h |
| 4 | Jobs / NFP data | 4–6h |
| 5a | S&P 500 | 8–10h |
| 5b | DAX, Nikkei (each) | 8–12h each |
| 5c | Russell 2000, Hang Seng | 8–10h each |
| 6a | Silver | 4–6h |
| 6b | WTI Crude | 10–12h |
| **Total (Phases 1–4)** | Core expansion | **~40–50h** |
| **Total (all phases)** | Full multi-asset platform | **~120–160h** |

---

## Quick Wins (< 4h each, can do anytime)

- **Silver (XAG/USD):** reuse Gold T1/T3 logic; just add config + OANDA route
- **Jobs data display:** add PAYEMS + UNRATE to FRED fetch; render in macro card
- **S&P 500 basic:** same yield curve T1 as DOW; OANDA likely carries SPX500_USD
- **Macro surprise filter by asset class:** tag Finnhub events as `us_equity`, `uk_equity` etc. so the surprise score only fires for relevant instruments
- **COT for existing NAS100:** already parsed; just needs URL wired in modal
