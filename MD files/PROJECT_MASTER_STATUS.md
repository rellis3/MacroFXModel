# Trading Analytics Suite — Master Project Status
**Generated:** May 2026  
**Purpose:** Central reference for all future chat sessions — where we are, what we built, how it works, what's next.

---

## THE BIG PICTURE

Two live web dashboards, one worker, one journal — all deployed on Cloudflare Pages via drag-and-drop. No build step. No Git. No frameworks. Everything is self-contained HTML + a single `_worker.js`.

The strategic goal: a **multi-lens trading intelligence framework** that tells you *where* to trade (Fib range confluence model), *whether and how much* to trade (macro scoring + volatility), and *what the market structure is doing* (OI/GEX, yield curves, ARMA spread forecast, AI synthesis).

---

## LIVE DEPLOYMENTS

| Site | URL | Files | Purpose |
|---|---|---|---|
| **Regime + Confluence Dashboard** | macrorange.pages.dev | `index.html` + `_worker.js` | Primary trading tool |
| **FX Macro Desk** | fxmacro.pages.dev | `index.html` + `_worker.js` + `_headers` | Team morning scorecard with Claude narrative |
| **Trade Journal** | macrorange.pages.dev/journal (or standalone) | `journal.html` | Trade log + TradingView CSV export |

The project files in this project folder (`/mnt/project/`) represent the **Regime + Confluence Dashboard** — the main active build.

---

## DEPLOYMENT RULES (CRITICAL — DON'T BREAK THESE)

1. **Drag-and-drop only** — drag the folder onto Cloudflare Pages deploy zone. Never rename `_worker.js`.
2. **`_worker.js` must be ASCII only** — no Unicode, emoji, smart quotes, em dashes, box-drawing. Cloudflare's compiler silently fails with a column-position error. Always run `node --check _worker.js` before deploying.
3. **Environment variables must be set in BOTH Production AND Preview scopes** — drag-and-drop goes to Preview; setting only Production = "API key not configured" error.
4. **FRED data shape is architecturally critical** — `/api/fred` must return `{seriesKey: {value, prev}}` NOT raw arrays. Breaking this shape kills all 7-tier scoring across the entire dashboard. This was broken once (worker v1) — the correct shape is in `_worker.js` now.

---

## THE REGIME + CONFLUENCE DASHBOARD (main build)

### What It Is

A single-page analytics suite for FX (EUR/USD, GBP/USD, USD/JPY, AUD/USD) and Gold (XAU/USD). It layers:

1. **7-Tier macro score** — condenses fundamentals into −16 to +16
2. **Asia session + Monday body range Fibonacci confluences** — mirroring the original TradingView Pine Script indicator
3. **CME Open Interest analysis** — GEX, DEX, max pain, call/put walls, gamma flip
4. **Macro Compass** — 90-day yield spread history + ARMA(1,1) directional forecast per pair
5. **GARCH(1,1) volatility engine** — EMA-ATR + variance forecast + 68%/95% daily confidence intervals
6. **Multi-layer entry scanner** — cross-references Fib confluences, OI levels, pivots, range boundaries
7. **AI Market Intelligence card** — Claude Sonnet analysis of all dashboard data
8. **Trade Journal** — daily level log with TradingView CSV export
9. **Proximity Caps config** — editable confluence thresholds persisted in Cloudflare KV

### Files

| File | Size | Role |
|---|---|---|
| `index.html` | ~5,278 lines | Entire dashboard — UI, calculations, rendering |
| `_worker.js` | ~435–492 lines | Cloudflare Worker — API proxy + AI analysis + KV caps |
| `journal.html` | ~742 lines | Trade journal, standalone or linked |

### Cloudflare Environment Variables

| Variable | Purpose |
|---|---|
| `FRED_KEY` | FRED macroeconomic data |
| `TWELVE_KEY` | Twelve Data OHLC (daily/5min/30min) + live quotes |
| `ANT_KEY` | Anthropic API — AI analysis card |
| `FX_SCORES` (KV binding) | Cloudflare KV namespace — stores proximity caps config |

---

## ARCHITECTURE — DATA FLOW

```
Browser (macrorange.pages.dev)
        │
        ├── GET /api/config       → {hasFred, hasTwelve, hasAnt, hasKV}
        ├── GET /api/fred         → {vix:{value,prev}, us10y:{value,prev}, ...}  ← CRITICAL SHAPE
        ├── GET /api/ohlc         → Twelve Data 100 daily bars (.values array)
        ├── GET /api/ohlc5m       → Twelve Data 800 × 5min bars
        ├── GET /api/ohlc30m      → Twelve Data 700 × 30min bars
        ├── GET /api/quote        → {price: number}
        ├── GET /api/fredhistory  → {key: [{date, value}]} — 90 obs for Macro Compass
        ├── GET /api/config/caps  → proximity cap config from KV (or hardcoded defaults)
        ├── PUT /api/config/caps  → save caps to KV FX_SCORES
        └── POST /api/analysis    → Claude Sonnet structured JSON analysis
```

### localStorage Keys (client-side cache)

| Key | Content | TTL |
|---|---|---|
| `oi_store` | `{symbol: {topLevels, gexProfile, maxPain, callWall, putWall, ...}}` | Manual (user-pasted) |
| `ai_analysis_{sym}` | Cached Claude analysis per pair | 1 hour |
| `compass_{sym}` | 90-day spread history per pair | 6 hours |
| `cache_fred` | FRED data | 12 hours |
| `cache_ohlc_{sym}` | Daily OHLC | 23 hours |
| `journal_store` | Full trade journal (all dates, all pairs) | Persistent |

### KV Namespace (shared, server-side)

| Key | Content |
|---|---|
| `caps` | Proximity cap config JSON (persists across deploys) |
| `journal_store` | Trade journal backup (synced from localStorage on save) |

---

## THE 7-TIER MACRO SCORING SYSTEM

Total range: **−16 to +16** (plus ±1 coherence bonus if 6+ tiers agree direction).

| Tier | Name | Max | Data |
|---|---|---|---|
| T1 | Rate Differential | ±3 | FRED foreign LT rate vs US10Y. Gold uses TIPS real yield. |
| T2 | VIX Level + Direction | ±3 | FRED VIXCLS + prev. Inverted for gold & safe-haven pairs. |
| T3 | DXY Direction | ±2 | FRED DTWEXBGS + prev. Amplified for gold. |
| T4 | HY Credit Spreads | ±2 | FRED BAMLH0A0HYM2 + prev (bps change). Note: FRED reports in pp, multiply ×100 for bp. |
| T5 | AUD/JPY Carry Proxy | ±2 | FRED-derived cross (DEXUSAL × DEXJPUS) |
| T6 | NFCI Financial Conditions | ±1 | FRED NFCI (weekly, Chicago Fed — same value all week) |
| T7 | Momentum EMA/RSI | ±2 | Twelve Data OHLC — EMA(20), EMA(50), RSI(14) |

**Position sizing from score:** 10% (score ≤ ±4) → 25% (±5) → 50% (±9) → 75% (±13) → 100% (≥ ±13). Adjusted by vol regime multiplier and macro alignment multiplier.

### FRED Series (18 total)

`vix, us2y, us10y, dxy, hy, nfci, tips, bei, aud_usd, usd_jpy, de10y, gb10y, jp10y, au10y, de_short, gb_short, jp_short, au_short`

Critical caveats:
- Foreign rates (`de10y`, `gb10y`, etc.) are **monthly** OECD data — slow-moving, displayed with `MO` badge
- All FRED data has a **1-business-day lag** — "live" is yesterday's close
- NFCI updates **weekly on Wednesdays**
- HY OAS: FRED value of `3.50` = **350 bp** (multiply ×100 in code)

---

## VOLATILITY ENGINE

### EMA-ATR (primary)
- Formula: `EMA = α × TR + (1−α) × EMA_prev`, α = 0.15 (~12-day equivalent)
- True Range: `max(H−L, |H−PrevClose|, |L−PrevClose|)` — ALWAYS use TR, not simple range
- Regime: percentile of EMA-ATR vs 100-bar history → LOW (<25th) / NORMAL / HIGH (>75th)

### GARCH(1,1) (supplementary forecast)
- Fixed FX parameters: ω=1e-7, α=0.10, β=0.85 (persistence α+β=0.95)
- Seeded on first 20 log-returns, walks forward through full history
- CI uses half-normal: range = 2 × z × σ × price
- Output: daily cap (68% CI), 68%/95% confidence intervals in pips, volatility cluster detection

### Vol regime trading adjustments
| Regime | Size | Stop | Strategy |
|---|---|---|---|
| LOW (<25th pct) | Can increase | 0.75× ATR | Mean reversion |
| NORMAL | Baseline | 1.0× ATR | Standard |
| HIGH (>75th pct) | −30 to −50% | 1.5–2× ATR | Reduce, momentum/breakout |

---

## FIB CONFLUENCE MODEL

### Core philosophy
Body range only (no wicks). Confluence = today's level aligns with yesterday's level within threshold. Tighter = higher probability.

### Two range types
- **Asia session range** — 5min bars, 00:00–06:00 GMT, body (open/close) extremes
- **Monday body range** — 30min bars, body extremes across Monday session

### Fibonacci levels projected (both directions from each range)
`−1.0, −0.75, −0.5, −0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0`

### Star rating system (central abstraction)
Base 1 star + up to 3 modifiers:
- **+1** tight confluence (within 0.2 pip for FX, $2 for gold)
- **+1** direction aligned with macro bias
- **+1** pivot match within proximity cap

Entry scanner adds additional stars for OI walls, gamma flip, range boundaries — max 7 stars currently.

### Proximity caps (configurable via ⚙ Caps modal, persisted in KV)
| Layer | FX ATR frac | FX pip cap | Gold pip cap |
|---|---|---|---|
| OI walls | 0.12 | 10 pips | $8 |
| Pivots | 0.10 | 8 pips | $6 |
| Range boundaries | 0.08 | 6 pips | $5 |
| Gamma flip | 0.15 | 12 pips | $10 |

Actual proximity = `min(ATR × fraction, cap × pipSize)`.

---

## CME OPEN INTEREST ANALYSER

### Data input
Manual paste from CME website into the OI modal (📊 OI button). Pair-locked to active tab — switch pair first.

### Parser (mirrors Pine Script `parse_table()`)
- Skips non-digit rows (headers, DTE labels)
- Handles comma-thousands (e.g. 5,472)
- Takes first C/P column pair per row (most recent expiry)
- Validates: strike 0.001–30,000, OI < 500,000
- Optional separate change table validated by row count match

### Outputs per pair
`maxPain, callWall, putWall, pcRatio, GEX aggregate, DEX aggregate, gamma flip level, top N OI strikes, gexProfile (all strikes)`

### GEX calculation
- Flat sigma: FX 12%, gold 18%, equity 20%. Fixed 14 DTE. Indicative not precise.
- Contract sizes: FX 125,000; gold 100; NQ 20; ES 50
- Call GEX = repel/breakout zone (red bars, left); Put GEX = magnet/mean-revert zone (green bars, right)
- Gamma flip = where netGEX crosses zero = regime change level

### Storage
`localStorage` key `oi_store` — object keyed by `{symbol: inst}`. Never crashes dashboard render — wrapped in try/catch IIFE.

---

## MACRO COMPASS + ARMA FORECAST

### What it is
90-day yield spread history per pair (10Y and short-rate) fetched from FRED history endpoint, rendered as a mini chart with ARMA(1,1) directional forecast.

### ARMA(1,1) methodology
First-differenced for stationarity. Method of moments: φ from lag-1 autocorrelation of differences, θ from residual lag-1 autocorrelation. Produces 5-day forecast with per-day change + 68% CI. `skillPct` = improvement over naive random walk — negative skill shown as warning.

### Signal engine (feeds entry scanner)
Scores 0–9: fair value gap (0–3), 10Y momentum (0–2), 2Y momentum (0–1), 10Y spread level (0–1), lag detection bonus (0–2). Output: bias (BULLISH/BEARISH/NEUTRAL), type, score, reasons, FV gap pips.

### Pair config
| Pair | Short rate key | Long rate key | Sign |
|---|---|---|---|
| EUR/USD | de_short | de10y | −1 (higher spread = bearish EUR/USD) |
| GBP/USD | gb_short | gb10y | +1 |
| USD/JPY | jp_short | jp10y | +1 |
| AUD/USD | au_short | au10y | +1 |
| XAU/USD | null | us10y (TIPS) | −1 |

Note: 2Y spread uses monthly OECD data (forward-filled across daily dates) — treat 2Y ARMA as indicative only.

---

## AI ANALYSIS CARD

### Trigger
🧠 Analyse button → `triggerAIAnalysis()` → POST `/api/analysis`

### Snapshot sent to Claude
All 7 tier scores, vol regime + GARCH, Asia + Monday ranges, all Fib confluences with stars/distance, daily pivots, OI data (max pain/walls/GEX/gamma flip/top strikes), FRED macro (VIX, HY, DXY, curves, NFCI, TIPS), AUD/JPY carry, risk sentiment, ARMA forecast + spread signal, regime transition risk, top 3 entry scanner setups.

### Claude response fields
`overallBias, conviction, convictionScore, headline, regime, macroRead, yieldCurveRead, oiRead, garchRead, armaRead, spreadSignalRead, keyLevels[], tradingFramework, goodToDoNow[], avoidNow[], breakoutTrigger, reversionTrigger, cleanBreakPotential, sentimentPositioning, reflexivity, riskWarnings[]`

### Config
Model: `claude-sonnet-4-5`, max_tokens: 4000. Cache: 1 hour per pair in localStorage. Cost: ~$0.01–0.02 per call.

---

## TRADE JOURNAL (journal.html)

### What it does
- Loads Fib levels from the main dashboard (via `localStorage` key `journal_pending` written by dashboard on render)
- User marks each level: Watch / Long / Short / Skip
- Records outcome: Win / Loss / BE / Missed
- Free-text notes per level
- Exports CSV formatted for the **Macro Range Journal TradingView indicator** (draws entry/SL/TP lines on chart automatically)

### Storage
`localStorage` key `journal_store` — also synced to Cloudflare KV as backup. Load priority: localStorage first (fast render), then KV merge.

### CSV export format
`entry, direction (1=long / −1=short), sl, tp, stars, label` — one row per level. Importable into the companion Pine Script indicator.

---

## FXMACRO DESK (separate deployment — fxmacro.pages.dev)

A **team morning scorecard** on the same C.OG cross-asset framework but with different emphasis:
- 8 tiers (includes Session Flow T8)
- 9 pairs + gold
- **Cloudflare KV** for shared score trajectory (30-day history) and cached Claude morning briefings
- Economic calendar (JBlanked API) + news headlines (Finnhub) fed into Claude narrative
- GARCH(1,1) built into the dashboard JS (Nelder-Mead MLE, falls back to EWMA)
- ExchangeRate-API for live FX prices

This is a **separate codebase** from macrorange. Not currently being actively developed (macrorange is the main build).

---

## CORE DESIGN PRINCIPLES

1. **Macro tells you the bias. Fib tells you the level. The dashboard ties them together.**
   The range model and volatility framework are complementary, not redundant: range = where to trade; vol + macro = whether, when, how much.

2. **Confluence over single signals.** A 4-star setup is rare and worth waiting for. A 1-star is just a level.

3. **Free-tier first.** FRED (unlimited), Twelve Data (800/day free, cached 23h), Anthropic (~$0.01/call cached 1h). Everything must run within free quotas indefinitely.

4. **Simplicity over abstraction.** Single-file HTML. No build step. No bundler. No external dependencies beyond Google Fonts. Drag-and-drop deploy. Every complexity decision should be challenged.

5. **Defensive rendering.** OI card wrapped in try/catch IIFE. All destructuring has `||` fallbacks. Broken data can never crash the main render.

6. **Body range not wicks** — wicks include stop hunts and produce different (worse) Fib levels. This has been a recurring mistake to avoid.

7. **FRED shape is sacred** — `{seriesKey: {value, prev}}`. Any deviation kills tier scoring.

---

## KNOWN ISSUES / WATCH POINTS

| Issue | Status | Note |
|---|---|---|
| Pivot S1 2-pip discrepancy vs external calculators | By design | Twelve Data uses 5pm NY close; external tools use midnight. Internally consistent. |
| ARMA on monthly 2Y data | Documented limitation | Monthly data forward-filled; treat 2Y ARMA as indicative only |
| GARCH fixed parameters | Documented | α=0.10, β=0.85 not fitted to specific instrument/period. Good enough for now. |
| OI data manual entry | By design | CME data not auto-fetched. Staleness flagged by `savedAt` timestamp. |
| AI analysis cache doesn't invalidate on OI update | Known | Workaround: click Analyse again after pasting new OI |
| NFCI lag | By design | Published weekly Wednesdays. Same value all week. |
| FRED 1-day lag | By design | All "live" FRED data = yesterday's close |
| Non-ASCII in `_worker.js` causes silent deploy failure | Critical | Always run `node --check _worker.js` before deploying |
| CF Pages two-environment trap | Critical | Set all env vars in BOTH Production AND Preview scopes |

---

## ROADMAP — WHAT TO BUILD NEXT

### Approved items (in rough priority order)

**Phase 3 (OI → Confluence integration)**
- [ ] When a call wall / put wall / gamma flip is within N pips of an existing Fib confluence, add it as a confluence source and boost star rating. This is the key design doc Phase 3 item. Data is already available in `oi_store` — it's a scoring logic change in `enhanceConfluences()`.

**Smart Money Concepts layer**
- [ ] Order block detection from OHLC 1H/4H bars — add star to entry scanner
- [ ] Liquidity level detection — equal highs/lows, stop cluster identification

**Session tools**
- [ ] VWAP from 5min bars — session bias filter (above = buy bias, below = sell bias)
- [ ] Session open price levels — London open and NY open as watched levels

**Macro data**
- [ ] COT positioning data — CFTC weekly, sentiment layer for signal engine
- [ ] ARMA spread forecast to feed directly into signal engine bias

**Architecture upgrades**
- [ ] Fitted GARCH — MLE optimisation when 250+ daily bars cached (requires data persistence layer)
- [ ] HAR model — combines daily + weekly + monthly vol for better multi-timeframe forecasting
- [ ] GARCH-VECM — cross-asset vol linkages (SR3 ↔ TN ↔ NQ) for futures expansion

### Not yet started
- [ ] Futures instruments (NQ, ES, SR3, TN) — pairs config, contract sizing, vol benchmarks
- [ ] CVOL / term structure / vol cones / skew panel (the "five lens vol framework")
- [ ] Backtesting validation of strategy edge

---

## RENDER ARCHITECTURE (index.html)

```
loadAll()                        // fetch all data sources
  └─ renderAll()                 // try/catch wrapper
       └─ renderAllInner()       // builds full HTML template
            ├─ calculateTierScores()
            ├─ calculateVolRegime()        // EMA-ATR + GARCH
            ├─ calculatePivots()           // bars[1] = yesterday's completed bar
            ├─ Asia/Monday range Fib detection
            ├─ enhanceConfluences()        // adds direction/stars/SL/TP
            ├─ filterConfluences()         // display mode filter
            ├─ [writes HTML to #mainContent]
            ├─ aiRenderCardOnUpdate()      // load cached AI analysis
            ├─ loadAndRenderCompass()      // async — 90d FRED history
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

`renderAll()` triggers on: page load, pair tab switch, OI save, auto-refresh timer, manual Refresh button.

---

## DEBUGGING QUICK REFERENCE

| Symptom | Likely cause | Fix |
|---|---|---|
| "Loading market data..." stuck | JS syntax error | DevTools → Console → read stack trace |
| "Bad response from /api/quote — not JSON" | Worker not running | Check `_worker.js` deployed; check for non-ASCII |
| All tier scores show 0 | FRED data wrong shape | `/api/fred` returning raw arrays, not `{value,prev}` |
| OI shows wrong pair data | Modal opened before pair switch | Switch pair tab first, then open OI modal |
| Entry scanner levels too far away | Proximity caps too wide | Open ⚙ Caps, reduce pip caps |
| "Claude returned non-JSON" | max_tokens truncation | Retry; rare with 4000 tokens |
| Stars inflated | Large ATR making ATR-fraction too wide | Pip cap is binding constraint — check ⚙ Caps |
| Deploy fails silently | Non-ASCII in `_worker.js` | `node --check _worker.js` before upload |

---

## CSS VARIABLE REFERENCE

```css
--s1: card background          --s2: secondary bg       --s3: tertiary bg
--border, --border2            --text, --text2, --text3
--green, --green-bg, --green-bd
--red,   --red-bg,   --red-bd
--blue,  --blue-bg,  --blue-bd
--amber, --amber-bg, --amber-bd
--purple,--purple-bg,--purple-bd
--r: border-radius small       --rl: border-radius large
```

Fonts: `DM Sans` (UI) + `DM Mono` (numbers/code)

---

## SMART DECIMAL FORMATTING

| Price range | Decimal places | Example |
|---|---|---|
| < 10 | 5 | 1.08452 |
| < 100 | 4 | 1.0845 |
| < 1,000 | 3 | EUR/GBP |
| ≥ 1,000 | 2 | Gold, USD/JPY |

`step` attributes on inputs match this formatting.

---

*This document was generated from a full read of all project files in May 2026. Update it when architecture changes significantly.*
