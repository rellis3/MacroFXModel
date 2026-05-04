# Claude Handover — MacroFXModel

> **Purpose:** Catch-up document for Claude (or any AI assistant) resuming work on this project after a context break. Read this before touching any code.

---

## What This Project Is

A **Cloudflare Pages** web app that provides multi-timeframe macro analysis and entry signals for FX and Gold trading. No framework — vanilla JS ES modules served from `index.html`. Backend is a single `_worker.js` Cloudflare Pages Function (ES module) that proxies external APIs and handles KV caching.

**Live pairs:** EUR/USD · GBP/USD · USD/JPY · AUD/USD · XAU/USD (Gold)

---

## Architecture

```
Browser
  └── index.html
        └── js/main.js          ← orchestrator, wires window globals
              ├── js/state.js   ← singleton S{} shared across all modules
              ├── js/config.js  ← PAIRS, CACHE_DURATION, COMPASS_CONFIG, FIB_LEVELS
              ├── js/utils.js   ← shared helpers: filterTradingDays, barToUTC, fred(), loadCached(), kvGet/kvSet
              ├── js/macro.js   ← 7-tier score engine + USD strength composite + dollar regime
              ├── js/vol.js     ← ATR, GARCH(1,1), vol regime, vol impulse, position sizing
              ├── js/signal.js  ← signal engine + entry scanner (calls macro/vol/events/compass)
              ├── js/render.js  ← main page render (reads S, calls all sub-renders)
              ├── js/compass.js ← Macro Compass yield spread chart + FX overlay toggle
              ├── js/ranges.js  ← Asia range + Monday range calculation from 5m bars
              ├── js/confluences.js ← confluence detection + enhancement
              ├── js/arma.js    ← ARMA regime transition model
              ├── js/session.js ← trading session detection (Asia/London/NY etc.)
              ├── js/events.js  ← Finnhub economic calendar + macro surprise index
              ├── js/ai.js      ← Anthropic API analysis prompt builder + card renderer
              ├── js/cot.js     ← CFTC COT data loader + renderer
              ├── js/oi.js      ← Open interest sidebar
              ├── js/caps.js    ← Confluence proximity caps (user-configurable)
              └── css/index.css

Cloudflare Pages (_worker.js)
  ├── /api/quote          ← TwelveData real-time quote
  ├── /api/ohlc           ← TwelveData daily OHLC (23h cache)
  ├── /api/ohlc5m         ← TwelveData 5m OHLC (18h cache)
  ├── /api/ohlc30m        ← TwelveData 30m OHLC (23h cache)
  ├── /api/fred           ← FRED current values (12h cache)
  ├── /api/fredhistory    ← FRED historical series for Compass chart
  ├── /api/events         ← Finnhub economic calendar today+3 days
  ├── /api/surprise       ← Finnhub calendar past 30 days (actual vs forecast)
  ├── /api/config         ← Feature flags: { hasFinnhub: bool }
  ├── /api/ai             ← Proxy to Anthropic API (claude-sonnet-4-5)
  ├── /api/kv/get         ← KV read (whitelisted keys only)
  └── /api/kv/set         ← KV write (whitelisted keys only)
```

---

## Environment Variables (Cloudflare)

| Variable | Used for |
|---|---|
| `TWELVEDATA_KEY` | All OHLC + quote data |
| `FRED_KEY` | Yield/rate data from FRED |
| `ANTHROPIC_KEY` | AI analysis (claude-sonnet-4-5) |
| `FINNHUB_KEY` | Economic calendar + surprise index (optional — site degrades gracefully without it) |
| `KV` | Cloudflare KV namespace binding (set in Pages dashboard, not as env var) |

---

## Deployment

**Manual copy only** — no git push / wrangler auto-deploy. User copies changed files directly to Cloudflare Pages via the dashboard or wrangler CLI manually. After editing, tell the user which files changed so they know what to upload.

---

## Data Sources

| Data | Source | Frequency | Notes |
|---|---|---|---|
| FX/Gold quotes | TwelveData `/time_series` | Daily + 5m + 30m | Daily bars from TwelveData have only date `"YYYY-MM-DD"` (length 10); 5m bars have full datetime `"YYYY-MM-DD HH:MM:SS"` (length 19). `barToUTC()` in utils.js handles both. |
| US yields (2Y, 10Y, TIPS) | FRED API | Daily | `DGS2`, `DGS10`, `DFII10` |
| Foreign yields | FRED API | Monthly | German: `IRLTLT01DEM156N` (10Y), `IRSTCI01DEM156N` (short). GB, JP, AU have own series. Monthly = ~12 data points/year — coarser than daily US rates. **ECB SDW not yet integrated.** |
| DXY | FRED `DTWEXBGS` | Weekly | Used in Compass for XAU/USD only |
| Economic calendar | Finnhub `/api/v1/calendar/economic` | On-demand | Requires `FINNHUB_KEY`. Graceful degradation if absent. |
| COT data | CFTC (user-supplied URL) | Weekly | Loaded via user-configured URL in COT modal |
| AI analysis | Anthropic claude-sonnet-4-5 | On-demand | Triggered by user clicking "Analyse" |

---

## The 7-Tier Macro Score System

`calculateTierScores()` in `macro.js` returns `totalScore` (range roughly ±17) + coherence bonus.

| Tier | Name | Max ±| What it measures |
|---|---|---|---|
| T1 | Rate Differential | ±3 | Yield spread (10Y + 2Y). For Gold: TIPS real yield. Includes momentum bonus ±1 from Compass data. |
| T2 | Risk Sentiment | ±3 | VIX-proxy from vol regime |
| T3 | Trend | ±3 | EMA alignment on daily bars |
| T4 | Momentum | ±3 | RSI + price momentum |
| T5 | Positioning | ±2 | COT net positioning |
| T6 | Seasonality | ±1 | Calendar-based patterns |
| T7 | Valuation | ±1 | Fair value vs current price |

If ≥5 tiers agree direction → coherence bonus +1 in that direction.

Signal bias: totalScore > 4 → LONG, < -4 → SHORT, else NEUTRAL.

---

## Signal Engine (`signal.js`)

`runSignalEngine()` builds on top of the tier score:
- Starts from tier bias (LONG/SHORT/NEUTRAL)
- Adds Compass fair value gap confirmation
- Adds **macro surprise modifier** (+1 or +2 pts) via `getPairSurpriseScore()` from `events.js`
- Adds **cross-pair USD conflict/confirm** via `detectCrossConflict()` from `macro.js`
- Max score: 11

`runEntryScanner()` computes position size multiplier:
```javascript
sizeMult = eventRisk.sizeMult × sessionData.confidence × crossConflict.sizeMult
```

---

## USD Strength Composite (`macro.js`)

`computeUSDStrength()` — cross-pair USD composite from 4 pairs:
```
usdStrength = mean z-score of:
  -EURUSD 5d return  (negative = USD bull)
  -GBPUSD 5d return
  -AUDUSD 5d return
  +USDJPY 5d return
```
Z-scored over 20-period window. Returns `{ score, trend, strength, contributions, fredConflict }`.

`detectCrossConflict()` compares USD strength to signal direction. Strong USD (|score| > 1.0) conflicts with EURUSD long, GBPUSD long, AUDUSD long, XAUUSD long. Applies `sizeMult` of 0.65–1.15.

Background-loads all 4 USD index pairs' daily OHLC in `main.js` after current pair loads.

---

## Session Intelligence (`session.js`)

`detectSession()` — detects current trading session from London local time:

| Session | London hours | Confidence multiplier |
|---|---|---|
| Asia | 00:00–06:00 | 0.75 |
| Pre-London | 06:00–08:00 | 0.65 |
| London | 08:00–13:00 | 1.0 |
| NY Overlap | 13:00–17:00 | 1.1 |
| NY Close | 17:00–21:00 | 0.85 |
| Off-Hours | 21:00–24:00 | 0.60 |

Applied to position size bar in `render.js` and to entry size in `signal.js`.

---

## Volatility (`vol.js`)

`calculateVolRegime()` returns:
- `regime`: LOW / NORMAL / HIGH / EXTREME
- `atrPips`: 12-period EMA ATR
- `garch`: GARCH(1,1) daily vol forecast with 68%/95% CIs
- `volImpulse`: `{ last5Avg, prior5Avg, pct, bias }` — last 5 vs prior 5 bar ATR
- `volBias`: `'expanding'` (>+15%) / `'contracting'` (<−15%) / `'stable'`

**Note:** Vol impulse is computed and displayed but is NOT yet a mechanical signal modifier. It shows as a pill in the pair header. Still to do: wire `volBias` into signal type (expanding → breakout entry, contracting → mean reversion entry).

---

## Economic Events (`events.js`)

`loadEventData(hasFinnhub)` — loads from `/api/events` and `/api/surprise`.

`computeEventRisk()` levels:
- HIGH impact event in next 4h → sizeMult = 0.50
- Medium in 4h OR high today → sizeMult = 0.75
- Otherwise → 1.0

`computeSurpriseIndex()` — actual vs forecast per currency, normalised. Returns `{ USD: score, EUR: score, ... }`.

`getPairSurpriseScore()` — returns `{ net, baseScore, quoteScore }` for current pair. Used in signal engine.

---

## Macro Compass (`compass.js`)

Yield spread chart (normalized, 90 data points) showing:
- **Purple line:** US 10Y yield z-score (inverted)
- **Green/Amber dashed:** 2Y spread or DXY z-score
- **Blue dashed (new):** FX rate z-score overlay (last 90 daily bars) — toggled with "FX Rate" button

Toggle buttons: 2Y | 10Y | Both | **FX Rate** (independent on/off, stored in `S.compassShowFX`).

`compassFairValue()` — weighted z-score of 2Y+10Y spreads → UNDERVALUED / OVERVALUED signal.

`setCompassMode(mode)` and `toggleCompassFX()` are both exposed on `window` from `main.js`.

---

## Two-Layer Caching

1. **localStorage** — fast, client-side. TTLs defined in `CACHE_DURATION` in `config.js`.
2. **Cloudflare KV** — fallback when localStorage is empty (e.g. fresh browser). Keys are whitelisted in `_worker.js`.

KV whitelisted exact keys: `fred_data`, `events_today`, `surprise_index`, compass keys per pair, COT data.  
KV whitelisted prefixes: `ohlc_`, `ohlc5m_`, `ohlc30m_`, `asia_`, `monday_`, `compass_`, `events_`.

`COMPASS_CACHE_VERSION = 3` — bump this in `config.js` any time the compass data structure changes to force re-fetch.

---

## Key Known Issues / Watch Points

### `barToUTC()` (utils.js)
Daily bars from TwelveData have `datetime` of length 10 (`"2026-05-04"`). 5m bars have length 19 (`"2026-05-04 12:05:00"`). `barToUTC()` detects by `dt.length === 10` and appends `T00:00:00Z` for daily. This was a critical bug fix — do not regress.

### `filterTradingDays()` (utils.js)
Filters weekends from bar arrays. Returns bars in **reverse-chronological** order (newest first, matching TwelveData API). Code that needs chronological order must `.reverse()` the result.

### Monday Asia Range on Mondays
Asia range "Prev" was not showing on Mondays because the worker outputsize was too small (800 bars). Set to 1500. `londonSessionDay()` in utils.js detects the correct previous trading day — returns Friday when called on Monday.

### DXY in XAU Compass
DXY data is weekly (`DTWEXBGS`), US yields are monthly. Dates never coincide so `forwardFill()` always returned empty. Fixed by using `dxyHist.slice(-90)` directly (the weekly series is already dense enough).

### Confluences
Layer 2 fib cap in `detectConfluences()` was removed — it was filtering out all confluences. If confluences disappear again, check `detectConfluences()` in `confluences.js` for any cap logic that zeros results.

---

## State Object (`state.js`)

```javascript
S = {
  currentPair:     PAIRS[0],          // { symbol, code, shortCode, name, isGold?, isSafeHaven?, isUsdBase? }
  currentMode:     'strongest',
  fredData:        null,               // { us10y, us2y, de10y, gb10y, jp10y, au10y, tips, dxy, ... }
  ohlcData:        {},                 // keyed by symbol, daily bars
  ohlc5m:          {},                 // keyed by symbol, 5m bars
  ohlc30m:         {},                 // keyed by symbol, 30m bars
  asiaRangeData:   {},                 // { today, yesterday, confluences }
  mondayRangeData: {},                 // { current, previous, confluences }
  compassData:     {},                 // keyed by symbol, compass computation result
  compassMode:     'both',             // '2y' | '10y' | 'both'
  compassShowFX:   false,              // FX rate overlay on compass chart
  _caps:           null,               // proximity caps from KV
  cotData:         null,               // CFTC COT keyed by pair
  sessionData:     null,               // { key, name, color, confidence, desc, londonTime }
  dollarRegime:    null,               // { score, trend, strength, pairsUsed, contributions, fredConflict, label }
  usdStrength:     null,               // computeUSDStrength() result
  eventRisk:       null,               // { level, sizeMult, events, inNext4h, currencyRisk }
  surpriseIndex:   null,               // { [currency]: score }
}
```

---

## COMPASS_CONFIG fxSign convention

`fxSign: +1` means a **positive** yield spread is **bullish** for the pair.  
`fxSign: -1` means a **positive** spread is **bearish** for the pair.

| Pair | fxSign | Spread direction | Bullish when |
|---|---|---|---|
| EUR/USD | -1 | US−DE | spread negative (DE > US) |
| GBP/USD | +1 | GB−US | spread positive (GB > US) |
| USD/JPY | +1 | US−JP | spread positive (US > JP) |
| AUD/USD | +1 | AU−US | spread positive (AU > US) |
| XAU/USD | -1 | US 10Y | yields falling |

---

## What Is NOT Yet Done (Gaps / Future Work)

1. **Vol impulse → signal modifier** — `volBias` is computed but not wired. When `expanding`, should bias entry type toward breakout (use momentum entries, wider stops). When `contracting`, bias toward mean reversion. Add to `runSignalEngine()` in `signal.js`.

2. **ECB SDW API integration** — EUR rates currently use FRED monthly proxies (German Bund via OECD, `IRLTLT01DEM156N`). ECB's own SDW API (`sdw-wsrest.ecb.europa.eu`) provides daily ESTR and Euro area 10Y Bund free with no API key. Would improve T1 accuracy for EUR/USD, especially around ECB meetings.

3. **Surprise index conflict penalty** — currently surprise index only adds points when it confirms signal direction. A conflicting strong surprise (e.g. negative USD surprise when signal is LONG USD) should deduct points. Currently the code adds pts regardless of direction (a known simplification).

4. **T1 momentum bonus visibility** — shows in the tier card as tiny text "Compass mom +1 confirms". Low visibility.

---

## Files to Copy After Any Edit Session

After any coding session, tell the user which of these changed so they know what to re-upload:

| Commonly edited | Purpose |
|---|---|
| `_worker.js` | Backend — always copy if API routes or KV logic changed |
| `js/main.js` | Orchestrator — copy if imports or window globals changed |
| `js/state.js` | State — copy if new state fields added |
| `js/macro.js` | Tier scores + USD composite |
| `js/signal.js` | Signal engine |
| `js/render.js` | Page render |
| `js/compass.js` | Compass chart |
| `js/vol.js` | Volatility |
| `js/events.js` | Finnhub events |
| `js/session.js` | Session detection |
| `js/config.js` | Config constants |
| `css/index.css` | Styles |

---

## Quick Orientation Checklist (if Something Is Broken)

1. **No data / blank page** — check localStorage (F12 → Application → Local Storage → Clear All). Worker outputSize cap (currently 1500 for 5m, check `_worker.js`).
2. **Confluences missing** — check `detectConfluences()` in `confluences.js` for cap conditions that filter everything out.
3. **Asia range missing on Monday** — `londonSessionDay()` in `utils.js` must return Friday date. `filterTradingDays()` must skip weekends.
4. **DXY missing in Gold compass** — `compassCompute()` in `compass.js` uses `dxyHist.slice(-90)` not forwardFill.
5. **Compass cache stale after data structure change** — bump `COMPASS_CACHE_VERSION` in `config.js`.
6. **USD strength null** — needs ≥2 of the 4 USD index pairs loaded. Check that background-load loop in `main.js` is firing after current pair OHLC loads.
7. **Event risk / surprise not working** — check `FINNHUB_KEY` is set in Cloudflare env. Check `/api/config` returns `hasFinnhub: true`.

---

*Last updated: 2026-05-04*
