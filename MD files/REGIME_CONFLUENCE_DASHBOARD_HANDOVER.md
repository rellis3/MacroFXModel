# Regime + Confluence Dashboard — Full Handover
**Live site:** https://macrorange.pages.dev  
**Platform:** Cloudflare Pages (Advanced Mode — `_worker.js`)  
**Last updated:** May 2026  
**Files:** `index.html` (5,278 lines) + `_worker.js` (435 lines)

---

## Overview

A production web-based trading analytics suite for FX pairs (EUR/USD, GBP/USD, USD/JPY, AUD/USD) and Gold (XAU/USD). The dashboard combines:

- **7-Tier macro scoring** — rates, carry, credit, vol, sentiment, curve, COT
- **Asia + Monday range Fib confluence detection** — tight/normal levels with star ratings
- **CME Open Interest analysis** — GEX, DEX, max pain, call/put walls, gamma flip
- **Macro Compass** — 90-day yield spread history per pair with ARMA(1,1) directional forecast
- **GARCH(1,1) vol engine** — EMA-ATR + variance forecast + 68%/95% confidence intervals
- **Multi-layer entry scanner** — cross-references Fib, OI, pivots, range boundaries, signal engine
- **AI Market Intelligence** — Claude Sonnet analysis of all dashboard data via Anthropic API
- **Proximity caps config** — editable confluence thresholds stored in Cloudflare KV (FX_SCORES)

---

## Deployment

```
macrorange-cf/
├── index.html     ← full dashboard (5,278 lines, entirely self-contained)
└── _worker.js     ← Cloudflare Pages Worker (Advanced Mode)
```

**To redeploy:** Cloudflare Dashboard → Pages → macrorange → Deployments → drag the folder onto the deploy zone.

> **Critical:** Always drag the **folder**, not individual files. `_worker.js` must be at the root level. Do not rename it.

> **Worker ASCII rule:** The `_worker.js` must contain only ASCII characters (0–127). No Unicode, em dashes, smart quotes, Greek letters, emoji, or box-drawing characters — even in comments. Cloudflare's worker compiler rejects non-ASCII and fails the deploy silently with a column-position error. Always run `node --check _worker.js` before deploying.

---

## Cloudflare Setup

### Environment Variables
Set in: Pages → Settings → Environment variables (both Production AND Preview scopes)

| Variable | Purpose |
|---|---|
| `FRED_KEY` | FRED macroeconomic data (fred.stlouisfed.org) |
| `TWELVE_KEY` | Twelve Data OHLC — daily, 5min, 30min bars |
| `ANT_KEY` | Anthropic Claude API key — AI analysis card |

### KV Namespace
**Existing namespace:** `FX_SCORES`  
**Binding variable name:** `FX_SCORES`  
Set in: Pages → Settings → Functions → KV namespace bindings

The `FX_SCORES` KV namespace stores:
- Key `caps` — confluence proximity cap config (JSON, persists forever across deploys)

If `FX_SCORES` is not bound, the dashboard falls back to hardcoded defaults — everything still works, caps just can't be saved.

---

## Worker Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/config` | GET | Returns `{hasFred, hasTwelve, hasAnt, hasKV}` — UI uses to light up status pills |
| `/api/quote` | GET | Live price from Twelve Data → `{price}` |
| `/api/ohlc` | GET | 100 daily bars → raw Twelve Data response (`.values` array) |
| `/api/ohlc5m` | GET | 800 × 5min bars → raw Twelve Data response |
| `/api/ohlc30m` | GET | 700 × 30min bars → raw Twelve Data response |
| `/api/fred` | GET | All FRED series → `{seriesKey: {value, prev}}` — THIS SHAPE IS CRITICAL |
| `/api/fredhistory` | GET | 90 observations per series for Macro Compass chart → `{key: [{date, value}]}` |
| `/api/config/caps` | GET | Read proximity caps from KV `FX_SCORES` (falls back to hardcoded defaults) |
| `/api/config/caps` | PUT | Write proximity caps to KV `FX_SCORES` (persists forever) |
| `/api/analysis` | POST | Send dashboard snapshot to Claude Sonnet → structured JSON analysis |

### Critical FRED shape
`/api/fred` returns `{seriesKey: {value, prev}}` — NOT raw arrays. Breaking this shape kills all tier scoring. The `value` field is the most recent non-null observation, `prev` is the second most recent.

### FRED series fetched
`vix, us2y, us10y, dxy, hy, nfci, tips, bei, aud_usd, usd_jpy, de10y, gb10y, jp10y, au10y, de_short, gb_short, jp_short, au_short`

### FRED history series (for Macro Compass)
`us2y, us10y, de10y, gb10y, jp10y, au10y, de_short, gb_short, jp_short, au_short`

---

## Data Architecture

### Global state variables (index.html)

| Variable | Type | Purpose |
|---|---|---|
| `currentPair` | object | Active pair — has `.symbol`, `.name`, `.shortCode` |
| `fredData` | object | `{seriesKey: {value, prev}}` from `/api/fred` |
| `ohlcData` | object | `{symbol: {values: [{datetime, open, high, low, close}]}}` daily bars, newest-first |
| `ohlc5mData` | object | 5min bars per symbol, newest-first |
| `ohlc30mData` | object | 30min bars per symbol, newest-first |
| `asiaRangeData` | object | `{symbol: {today, yesterday, confluences[]}}` |
| `mondayRangeData` | object | `{symbol: {current, previous, confluences[]}}` |
| `compassData` | object | `{symbol: {spread2y[], spread10y[], arma10, arma2, ...}}` — 6h cache |
| `_caps` | object | `{fx: {...}, gold: {...}}` — loaded from KV on startup |
| `window._latestQuote` | object | `{price}` — live price |

### localStorage keys

| Key | Content |
|---|---|
| `oi_store` | `{symbol: {topLevels, gexProfile, maxPain, callWall, putWall, pcRatio, ...}}` |
| `ai_analysis_{sym}` | Cached Claude analysis per pair (1h TTL) |
| `compass_{sym}` | Cached 90-day spread history per pair (6h TTL) |
| `cache_fred`, `cache_ohlc_{sym}`, etc. | OHLC + FRED data caches |

---

## Pairs Config

```javascript
const PAIRS = [
  { symbol: 'EUR/USD', name: 'EUR/USD', shortCode: 'de' },
  { symbol: 'GBP/USD', name: 'GBP/USD', shortCode: 'gb' },
  { symbol: 'USD/JPY', name: 'USD/JPY', shortCode: 'jp' },
  { symbol: 'AUD/USD', name: 'AUD/USD', shortCode: 'au' },
  { symbol: 'XAU/USD', name: 'Gold',    shortCode: 'au', isGold: true },
];
```

`shortCode` maps to FRED series keys (e.g. `de10y`, `de_short`).

---

## Key Functions

### Tier Scoring
`calculateTierScores()` → `{totalScore, maxScore, tiers[], agreeCount, coherenceBonus}`  
Scores -16 to +16 across 7 tiers. Coherence bonus of +1 if 6+ tiers agree direction.

### Volatility Engine
`calculateVolRegime()` → full object including:
- `regime` — LOW / NORMAL / HIGH (percentile vs 100-bar TR history)
- `percentile` — where EMA-ATR sits in history
- `atr`, `atrPips` — EMA-ATR with α=0.15
- `garch` — `{pips, ci68Pips, ci95Pips, sigmaAnnual, cluster, clusterMsg, vsEma}`
- `ci68Pips`, `ci95Pips` — GARCH confidence interval daily ranges
- `dailyCap`, `dailyCapPips` — uses GARCH 68% CI as primary cap
- `usedRange`, `usedRangePips`, `usedPct` — range consumed today
- `remainingRange`, `remainingPips` — remaining daily budget
- `stopMult`, `stopDist`, `tpMult` — regime-adjusted sizing params

### GARCH(1,1) model
Fixed FX parameters: ω=1e-7, α=0.10, β=0.85 (α+β=0.95, covariance-stationary)  
Seeded on first 20 log-returns, walks forward through full history.  
CI uses half-normal approximation: range = 2 × z × σ × price

### Pivot Calculation
`calculatePivots()` uses `bars[1]` (yesterday's completed bar, newest-first).  
Formula: `PP = (H+L+C)/3`, `R1 = 2×PP - L`, `S1 = 2×PP - H`.  
Known: ~2 pip S1 discrepancy vs external calculators due to Twelve Data using 5pm NY close vs midnight session definition. Internally consistent — all pivot references in dashboard use same calculation.

### Confluence Detection
`enhanceConfluences(confluences, price, bias, pivots, volRegime, macroScore)`  
Returns enhanced confluence array. Each item adds:
- `direction` — 'long' / 'short' / null (anchored to last closed 5m candle, not live tick)
- `distance` — pips from current price (live quote)
- `aligned` — whether direction matches macro bias
- `pivotMatch` — nearest pivot key within cap
- `stars` — 1 (base) + tight (1) + aligned (1) + pivot (1)
- `sl`, `tp` — regime-adjusted stop and vol-capped TP
- `tpCapped` — true if TP was reduced by daily range cap

### Proximity Caps (configurable)
`getCaps(sym)` → returns `{oiAtrFrac, oiPipCap, pivAtrFrac, pivPipCap, rngAtrFrac, rngPipCap, gexAtrFrac, gexPipCap, enhPivAtrFrac, enhPivPipCap}`

Defaults (FX):
| Layer | ATR fraction | Pip cap |
|---|---|---|
| OI walls | 0.12 | 10 pips |
| Pivots | 0.10 | 8 pips |
| Range boundaries | 0.08 | 6 pips |
| Gamma flip | 0.15 | 12 pips |
| Fib pivot zone (enhanceConfluences) | 0.10 | 8 pips |

Actual proximity = `Math.min(atr × fraction, cap × pipSize)`.  
Gold caps are slightly wider (8/6/5/10/8 pip caps respectively).

### Entry Scanner
`runEntryScanner(signal, enhanced, pivots, asia, monday, quote, volRegime)`  
Takes Fib confluences and enriches each with all available layers:
- Signal engine alignment (+1 star)
- OI call wall / put wall / max pain within cap (+1–1.5 stars each)
- Gamma flip proximity (+1 star)
- Pivot proximity (from existing Fib stars)
- Range boundaries — Asia H/L, Monday H/L (+0.5 each)

TP selection: prefers OI wall / max pain if within daily range cap, else ATR-based.  
Entries filtered to 2+ layers. Max 7 stars currently (extensible).

Each tag shows pip distance in brackets, e.g. `Put Wall 1.16500 (4p)`.

### ARMA(1,1) Spread Forecast
`fitARMA(arr)` on the 10Y spread series (first-differenced for stationarity).  
Method of moments: φ from lag-1 autocorrelation of differences, θ from residual lag-1 autocorrelation.  
Produces 5-day forecast with per-day change + 68% CI.  
`skillPct` = improvement over naive random walk — negative skill shown as warning.

`computeARMAForecast(compassData)` runs on both 10Y and 2Y spreads, combines into directional signal (BULLISH / BEARISH / MIXED) with confidence (HIGH / MEDIUM / LOW).

### Regime Transition Risk
`computeRegimeTransition(trueRanges)` counts consecutive days in current regime.  
Key asymmetry: Low vol for 10+ days → ELEVATED, 20+ days → HIGH pre-shock risk.  
High vol → ELEVATED after 10 days (gradual normalisation pattern).  
Shows ATR compressing/expanding, risk score 0–100.

### Signal Engine
`runSignalEngine(compassData, volRegime)` — scores 0–9:
- Fair value gap: 0–3 pts (most important)
- 10Y momentum: 0–2 pts
- 2Y momentum: 0–1 pt
- 10Y spread level: 0–1 pt
- Lag detection bonus: 0–2 pts

Output: `{bias, type, score, maxScore, reasons[], fvPips, fvGap, lagDetected}`

### Macro Compass Config
```javascript
const COMPASS_CONFIG = {
  'EUR/USD': { short: 'de_short', long: 'de10y', label: 'US-DE', fxSign: -1 },
  'GBP/USD': { short: 'gb_short', long: 'gb10y', label: 'GB-US', fxSign: +1 },
  'USD/JPY': { short: 'jp_short', long: 'jp10y', label: 'US-JP', fxSign: +1 },
  'AUD/USD': { short: 'au_short', long: 'au10y', label: 'AU-US', fxSign: +1 },
  'XAU/USD': { short: null,       long: 'us10y', label: 'US10Y', fxSign: -1 },
};
```
`fxSign`: +1 = higher spread is bullish for pair, -1 = higher spread is bearish.

---

## AI Analysis Card

### Trigger
`🧠 Analyse` button in topbar → calls `triggerAIAnalysis()`.

### Snapshot (`aiCollectSnapshot`)
Sends to Claude: macro score + all 7 tiers, vol regime + GARCH (forecast/CI/cluster), Asia range + price position, Monday range + price position, all Fib confluences with stars/sources/distance, daily pivots, OI data (max pain/walls/GEX/DEX/gamma flip/top strikes), FRED macro (VIX/HY/DXY/curves/NFCI/TIPS/BEI), yield curve shape, AUD/JPY carry, risk sentiment, ARMA forecast (direction/confidence/skill/1d+5d forecasts), spread signal (bias/score/FV gap/lag), regime transition risk, and top 3 entry scanner setups.

### Claude response fields
`overallBias, conviction, convictionScore, headline, regime{label,detail}, macroRead, yieldCurveRead, oiRead, garchRead, armaRead, spreadSignalRead, keyLevels[], tradingFramework, goodToDoNow[], avoidNow[], breakoutTrigger, reversionTrigger, cleanBreakPotential, cleanBreakRationale, sentimentPositioning, reflexivity, riskWarnings[]`

### Cache
1 hour per pair in localStorage (`ai_analysis_{sym}`). Auto-renders cached version on page load.

### Worker config
Model: `claude-sonnet-4-5`, max_tokens: 4000  
System prompt enforces JSON-only response, 1-2 sentence values, max 3 items per array.  
Checks `stop_reason` for truncation before parsing.

---

## Proximity Config Modal

### UI
`⚙ Caps` button in topbar → opens `#cfgOverlay` modal.  
Shows KV connection status — green if `FX_SCORES` is bound and caps saved, amber if not bound.  
Separate sections for FX pairs and Gold.  
10 configurable fields per instrument type (5 layers × 2 params each).

### Save flow
Form → PUT `/api/config/caps` → KV `FX_SCORES.put('caps', JSON)` → `_caps` updated in memory → `renderAll()` called → dashboard re-renders with new thresholds immediately.

### Fallback
If KV not bound: GET returns hardcoded DEFAULTS object from worker. All proximity calculations still work, caps just don't persist.

---

## Status Pills

Row below the topbar shows live data status:

| Pill | ID | Lights green when |
|---|---|---|
| FRED | `pillFred` | `/api/fred` loaded |
| DAILY | `pillOhlc` | Daily OHLC loaded |
| 5MIN | `pill5m` | 5min OHLC loaded |
| 30MIN | `pill30m` | 30min OHLC loaded |
| QUOTE | `pillQuote` | Live price loaded |
| AI | `pillAnt` | `ANT_KEY` configured (purple) |
| KV | `pillKV` | `FX_SCORES` KV bound |

---

## OI Analyser (CME Data)

### Storage
`localStorage` key `oi_store` — object keyed by pair symbol e.g. `{"EUR/USD": {inst}}`.

### Per-instrument object
```
{
  topLevels: [],          // strikes sorted by total OI
  gexProfile: [],         // all strikes with netGex, for gamma flip detection
  rawOI, rawChg,          // raw paste text (for re-parsing)
  exposures: {gex, dex},  // aggregate GEX and DEX
  maxPain,                // calculated max pain strike
  callWall, callWallOI,   // highest call OI strike + OI amount
  putWall,  putWallOI,    // highest put OI strike + OI amount
  pcRatio,                // put/call ratio
  totalCallOI, totalPutOI,
  totalCallChg, totalPutChg,
  savedAt                 // ISO timestamp
}
```

### OI parser rules (mirrors Pine Script `parse_table()`)
- Skips non-digit-starting rows
- Cleans tabs and multi-spaces
- Handles comma-thousands (e.g. 5,472)
- Takes first C/P column pair per row (most recent expiry)
- Validates strike 0.001–30,000 and OI < 500,000
- Change table validated by row count match

### GEX calculation
Flat sigma: FX 12%, gold 18%, equity 20%. 14 DTE — indicative, not precise.  
Contract sizes: FX 125,000; gold 100; NQ 20; ES 50.

### Gamma flow chart
Per-strike centred bar chart: red left = call GEX (repel/breakout), green right = put GEX (magnet/mean-revert).  
Gamma flip = where netGEX crosses zero.

---

## Topbar Buttons

| Button | Action |
|---|---|
| 🔄 Refresh | `forceRefresh()` — clears all caches, reloads all data |
| 📊 OI | `openOIModal()` — pair-locked OI data input |
| 🧠 Analyse | `triggerAIAnalysis()` — sends snapshot to Claude |
| Dark | `toggleDark()` — light/dark theme toggle |
| ⚙ Caps | `openCfgModal()` — proximity cap configuration |

---

## Display Modes

Three modes selectable via Show buttons:
- **Strongest** — tight confluences only (sub 0.2 pip threshold)
- **Strong** — all tight confluences
- **All Levels** — everything detected

---

## Render Architecture

```
loadAll()                     // fetch all data sources
  └─ renderAll()              // try/catch wrapper
       └─ renderAllInner()    // builds full HTML template
            ├─ calculateTierScores()
            ├─ calculateVolRegime()    // EMA-ATR + GARCH
            ├─ calculatePivots()
            ├─ Asia/Monday range confluence detection
            ├─ enhanceConfluences()   // adds direction/stars/SL/TP
            ├─ filterConfluences()    // applies display mode filter
            ├─ [writes HTML to #mainContent]
            ├─ aiRenderCardOnUpdate()  // load cached AI analysis
            ├─ loadAndRenderCompass()  // async — fetches 90d FRED history
            │    ├─ compassCompute()
            │    ├─ renderCompassCard()
            │    └─ renderARMAAndTransition()
            │         ├─ computeARMAForecast()
            │         └─ computeRegimeTransition()
            └─ renderSignalAndEntries()
                 ├─ runSignalEngine()
                 ├─ runEntryScanner()
                 └─ renderEntryScanner() + renderSignalCard()
```

`renderAll()` is called:
- On page load (after all data fetches complete)
- On pair tab switch
- On OI save (via `closeOIModal()`)
- On auto-refresh timer
- On manual Refresh button

---

## Known Issues / Design Decisions

### Pivot 2-pip S1 discrepancy
Twelve Data daily bars use 5pm NY close. External pivot calculators often use midnight or London close. Produces ~2 pip difference in S1. Internally consistent — not a bug. Documented and accepted.

### ARMA on monthly 2Y data
The 2Y spread (short rates) uses monthly FRED data which is forward-filled across daily dates. ARMA on forward-filled data has reduced statistical power — treat 2Y ARMA as indicative only, weight the 10Y ARMA signal more heavily.

### GARCH fixed parameters
α=0.10, β=0.85 are well-validated for FX major pairs but not fitted to this specific instrument/period. Parameters can be made adaptive in future by implementing in-sample MLE optimisation.

### OI data is manual
CME OI data is pasted manually by the user — not fetched automatically. Staleness is flagged by `savedAt` timestamp. OI-based entry tags are only shown if OI data has been loaded for that pair.

### AI analysis cache invalidation
The 1-hour AI cache does not invalidate when OI data is updated. If you paste new OI data and immediately click Analyse, it uses the new OI — but if a cached analysis exists from before the OI update, it shows stale OI commentary. Workaround: click Analyse again after pasting new OI to force a fresh analysis.

---

## Roadmap / Next Steps

### Approved to build
- [ ] Order block detection from OHLC data (1H/4H bars) — adds star to entry scanner
- [ ] Liquidity level detection — equal highs/lows, stop cluster identification
- [ ] VWAP from 5min bars — session bias filter (above = buy bias, below = sell bias)
- [ ] Session open price levels — London open and NY open as watched levels
- [ ] COT positioning data — CFTC weekly, sentiment layer for signal engine
- [ ] ARMA spread forecast feed into signal engine bias with lead-time advantage

### Architecture upgrades
- [ ] Fitted GARCH — MLE optimisation when 250+ daily bars cached (requires data persistence layer)
- [ ] HAR model — combines daily + weekly + monthly vol for multi-timeframe forecasting
- [ ] ARMA on yield spread for compass lead signal (partially built — extend to feed signal engine directly)

### Phase 3 design doc target
- [ ] OI confluence integration into Fib star rating (call/put wall within N pips of Fib = extra star) — see design.md Phase 3

---

## CSS Variable Reference

```css
--s1: card background
--s2: secondary background  
--s3: tertiary background
--border, --border2: border colours
--text, --text2, --text3: text hierarchy
--green, --green-bg, --green-bd: green scale
--red,   --red-bg,   --red-bd:   red scale
--blue,  --blue-bg,  --blue-bd:  blue scale
--amber, --amber-bg, --amber-bd: amber scale
--purple,--purple-bg,--purple-bd: purple scale
--r: border-radius small
--rl: border-radius large
```

Fonts: `DM Sans` (UI), `DM Mono` (numbers/code)

---

## Debugging Tips

### "Loading market data…" stuck on screen
JS syntax error preventing render. Open browser DevTools → Console → read the error. Common causes: unclosed template literal, stray backtick, unterminated string. Check the function shown in the stack trace.

### "Bad response from /api/quote — not JSON"
Worker is not running. The route is returning `index.html` instead of JSON. Causes:
1. `_worker.js` was not included in the deploy (check CF Pages → Functions tab)
2. Non-ASCII characters in `_worker.js` caused a deploy-time syntax error (check CF Pages → Deployments → failed deploy log)

### OI data shows wrong pair
OI modal is pair-locked to `currentPair.symbol`. Switch to the correct pair tab before opening OI modal.

### Entry scanner shows levels far from entry
Proximity caps may be too wide. Open ⚙ Caps modal and reduce pip caps. FX OI wall cap of 10 pips is the recommended maximum.

### AI analysis shows "non-JSON" error
Claude hit the max_tokens limit and truncated mid-JSON. Rare with 4000 tokens but can happen with many confluences. Retry — the system prompt instructs Claude to be concise.

### Stars look inflated
Usually caused by large ATR making ATR-fraction thresholds too wide. The pip cap is the binding constraint — if ATR is 150p and the cap is 10p, only levels within 10p register. Check the ⚙ Caps settings.

---

*Handover generated May 2026. Deploy both `index.html` and `_worker.js` together — they are tightly coupled.*
