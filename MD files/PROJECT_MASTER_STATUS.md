# Trading Analytics Suite — Master Project Status
**Updated:** May 2026
**Purpose:** Central reference for all future chat sessions — where we are, what we built, how it works, what's next.

---

## THE BIG PICTURE

A live web-based multi-lens trading intelligence framework deployed on Cloudflare Pages. No build step. No Git. No frameworks. Vanilla JS ES modules + a single `_worker.js`.

**Strategic goal:** tell you *where* to trade (Fib range confluence), *whether and how much* (macro score + vol), and *what the market structure is doing* (OI/GEX, yield curves, ARMA, AI synthesis).

---

## LIVE DEPLOYMENTS

| Site | URL | Files | Purpose |
|---|---|---|---|
| **Regime + Confluence Dashboard** | macrorange.pages.dev | `index.html` + `js/*` + `_worker.js` | Primary trading tool |
| **FX Macro Desk** | fxmacro.pages.dev | Separate codebase | Team morning scorecard |
| **Trade Journal** | macrorange.pages.dev/journal | `journal.html` | Trade log + TradingView CSV export |

---

## DEPLOYMENT RULES (CRITICAL)

1. **Drag-and-drop the whole folder** onto Cloudflare Pages. Never rename `_worker.js`.
2. **`_worker.js` must be ASCII only** — no Unicode, emoji, smart quotes, em dashes. Run `node --check _worker.js` before deploying. Cloudflare silently fails with a column error otherwise.
3. **Environment variables must be set in BOTH Production AND Preview scopes** — drag-and-drop goes to Preview; Production-only = "API key not configured" errors.
4. **FRED data shape is architecturally critical** — `/api/fred` must return `{seriesKey: {value, prev}}` NOT raw arrays. This shape feeds all 7 tiers. Never break it.
5. **After adding new env vars** (e.g. OANDA_KEY), redeploy AND set in both scopes.

---

## ACTIVE PAIRS (9 total as of May 2026)

| Pair | Type | Code | Notes |
|---|---|---|---|
| EUR/USD | Major | eu | Primary test pair |
| GBP/USD | Major | gu | |
| USD/JPY | Major | uj | Safe haven cross |
| AUD/USD | Major | au | Risk proxy |
| XAU/USD | Metal | xa | Gold — special vol/OI handling |
| EUR/GBP | Cross | eg | Uses DE vs GB rate differential |
| USD/CAD | Major | uc | CAD FRED series added |
| USD/CHF | Safe haven | uf | CHF FRED series added |
| GBP/JPY | Cross | gj | Uses GB vs JP rate differential |

Cross pairs (EUR/GBP, GBP/JPY) use `crossBase`/`crossBaseShort` in `COMPASS_CONFIG` so the Macro Compass iterates the correct rate differential rather than USD-centric series.

---

## ARCHITECTURE — FILES

```
index.html                  ← shell only, no logic
_worker.js                  ← Cloudflare Worker: all API proxies + KV
journal.html                ← standalone Trade Journal
js/
  main.js                   ← orchestrator: fetch, wire, boot
  state.js                  ← S{} singleton shared across all modules
  config.js                 ← PAIRS, CACHE_DURATION, FIB_LEVELS, COMPASS_CONFIG
  utils.js                  ← helpers: barToUTC, loadCached, kvGet/kvSet, getPipSize
  macro.js                  ← 7-tier score engine, USD strength, dollar regime
  vol.js                    ← ATR, GARCH(1,1), vol regime, position sizing
  signal.js                 ← signal engine + entry scanner
  render.js                 ← main page render (reads S, calls sub-renders)
  compass.js                ← Macro Compass yield spread chart
  ranges.js                 ← Asia range + Monday range from OHLC bars
  confluences.js            ← confluence enhancement: stars, OI, daily opens
  arma.js                   ← ARMA(1,1) + regime transition model
  session.js                ← session detection, session opens, daily opens array
  events.js                 ← economic calendar + macro surprise index
  ai.js                     ← AI analysis: snapshot builder + card renderer
  cot.js                    ← CFTC COT data loader + renderer
  oi.js                     ← Open interest sidebar (CME data)
  caps.js                   ← Confluence proximity caps (KV-persisted)
css/
  index.css
  journal.css
```

**Key architectural shift:** the project moved from a monolithic single-file `index.html` (~5,000+ lines) to a modular ES module structure. The `S` state singleton is the shared bus — every module imports from `state.js`.

---

## CLOUDFLARE ENVIRONMENT VARIABLES

| Variable | Purpose | Required |
|---|---|---|
| `TWELVE_KEY` | TwelveData — daily OHLC + live quotes | Yes |
| `FRED_KEY` | FRED macro data | Yes |
| `ANT_KEY` | Anthropic API — AI analysis | Yes |
| `OANDA_KEY` | Oanda API — 5m + 30m bars for range detection | Yes (new) |
| `OANDA_ENV` | `live` or `practice` (default: `live`) | Optional |
| `FINNHUB_KEY` | Economic calendar + surprise index | Optional |
| `FX_SCORES` | Cloudflare KV namespace binding | Yes |

---

## ARCHITECTURE — DATA FLOW

```
Browser (macrorange.pages.dev)
        │
        ├── GET /api/config           → feature flags {hasFred, hasTwelve, hasAnt, hasKV}
        ├── GET /api/fred             → {vix:{value,prev}, us10y:{value,prev}, ...}  CRITICAL SHAPE
        ├── GET /api/ohlc             → TwelveData 100 daily bars (.values newest-first)
        ├── GET /api/oanda_ohlc5m     → Oanda 1500 x 5m bars (Asia session ranges)
        ├── GET /api/oanda_ohlc30m    → Oanda 700 x 30m bars (Monday ranges)
        ├── GET /api/quote            → TwelveData live {price: number}
        ├── GET /api/fredhistory      → {key: [{date,value}]} — 90 obs for Macro Compass
        ├── GET /api/config/caps      → proximity cap config from KV
        ├── PUT /api/config/caps      → save caps to KV FX_SCORES
        ├── GET /api/events           → Finnhub economic calendar
        ├── GET /api/surprise         → Finnhub macro surprise index
        └── POST /api/analysis        → Claude Sonnet structured JSON analysis
```

### Why Oanda for 5m/30m bars

TwelveData aggregates price from multiple sources — slight gaps/fills vs actual broker prices. Oanda is a primary FX market maker. Their OHLC (mid-price = bid+ask/2) reflects real executed flow. Even a 2-3 pip difference in the Asia session high/low propagates through every Fib level and confluence price. Oanda is strictly UTC; the worker converts to London local time via `toLocaleString('sv-SE', { timeZone: 'Europe/London' })` before normalising, so BST is handled correctly. TwelveData is kept for daily bars (pivots/ATR) and the live quote ticker.

### localStorage / KV Keys

| Key | Content | TTL |
|---|---|---|
| `ohlc5m_{sym}_{day}` | Oanda 5m bars (London local datetime) | Session day |
| `ohlc30m_{sym}_{day}` | Oanda 30m bars | Session day |
| `ohlc_{sym}` | TwelveData daily bars | 23 hours |
| `ai_analysis_{sym}` | Claude analysis per pair | **Permanent until Analyse clicked** |
| `compass_{sym}` | 90-day spread history | 6 hours |
| `fred` | FRED macro data | 12 hours |
| `journal_store` | Full trade journal (all dates/pairs) | Persistent |
| `oi_store` | Open interest data per pair | Manual (user-pasted) |

**AI cache change (May 2026):** TTL removed. Analysis persists in KV indefinitely until user explicitly clicks Analyse or Force Refresh. `aiLoadCache` now checks `obj.analysis` exists rather than checking a 1-hour TTL.

---

## THE 7-TIER MACRO SCORING SYSTEM

Total range: **-16 to +16** (±1 coherence bonus if 6+ tiers agree).

| Tier | Name | Max | Data source |
|---|---|---|---|
| T1 | Rate Differential | ±3 | FRED foreign LT rate vs US10Y. Gold: TIPS real yield. Cross pairs: explicit rate diff logic |
| T2 | VIX Level + Direction | ±3 | FRED VIXCLS + prev. Inverted for gold + safe-haven pairs |
| T3 | DXY Direction | ±2 | FRED DTWEXBGS + prev. Amplified for gold |
| T4 | HY Credit Spreads | ±2 | FRED BAMLH0A0HYM2 (in pp, multiply ×100 for bp) |
| T5 | AUD/JPY Carry Proxy | ±2 | FRED-derived cross (DEXUSAL × DEXJPUS) |
| T6 | NFCI Financial Conditions | ±1 | FRED NFCI (Chicago Fed, weekly) |
| T7 | Momentum EMA/RSI | ±2 | TwelveData daily OHLC — EMA(20), EMA(50), RSI(14) |

**Position sizing from score:**
10% (≤±4) → 25% (±5) → 50% (±9) → 75% (±13) → 100% (≥±13). Adjusted by vol regime multiplier.

### FRED Series (22 total including CAD/CHF additions)

`vix, us2y, us10y, dxy, hy, nfci, tips, bei, aud_usd, usd_jpy, de10y, gb10y, jp10y, au10y, de_short, gb_short, jp_short, au_short, ca10y, ca_short, ch10y, ch_short`

**Critical caveats:**
- Foreign rates (`de10y`, `gb10y`, etc.) are **monthly** OECD data — slow-moving, `MO` badge shown
- All FRED data has **1-business-day lag** — "live" = yesterday's close
- NFCI updates **weekly on Wednesdays**
- HY OAS: FRED value `3.50` = **350 bp** (×100 in code)
- T1 for cross pairs requires explicit if/else in `computeT1()` — shortCode-based pattern doesn't work for EUR/GBP, GBP/JPY

---

## VOLATILITY ENGINE

### EMA-ATR (primary)
- `EMA = α × TR + (1−α) × EMA_prev`, α = 0.15
- True Range: `max(H−L, |H−PrevClose|, |L−PrevClose|)` — always TR, never simple range
- Regime: percentile vs 100-bar history → LOW (<25th) / NORMAL / HIGH (>75th)

### GARCH(1,1)
- Fixed FX params: ω=1e-7, α=0.10, β=0.85 (persistence 0.95)
- Seeded on first 20 log-returns, walks forward
- Output: daily cap (68% CI), 68%/95% CI in pips, cluster detection
- ARMA modifier: +1 signal score when ARMA confirms bias and skill ≥ 5%

### Vol regime adjustments
| Regime | Size | Stop | Bias |
|---|---|---|---|
| LOW | Can increase | 0.75× ATR | Mean reversion |
| NORMAL | Baseline | 1.0× ATR | Standard |
| HIGH | -30 to -50% | 1.5-2× ATR | Momentum/breakout |

---

## FIB CONFLUENCE MODEL

### Core rules
- **Body range only** (open/close, not wicks). Wicks include stop-hunts — wrong levels.
- **Confluence** = today's Fib level aligns with yesterday's within threshold
- **Asia session**: 5m bars, 00:00-06:00 London local time (Oanda data, BST-corrected)
- **Monday range**: 30m bars, full Monday session body

### Fibonacci levels projected
`-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0`
(both Asia and Monday, today vs yesterday for each)

### Star rating system (updated May 2026 — max 7 stars)

| Condition | Stars |
|---|---|
| Base | 1 |
| Tight confluence (within 10% of normal threshold) | +1 |
| Direction aligned with macro bias | +1 |
| Pivot level within proximity | +1 |
| OI wall / gamma flip within proximity | +1 |
| Near a daily open level (23:00 London) | +1 |
| 3+ daily opens cluster at same level | +1 |
| Density ≥ 2 (2+ fib pairs collapsed here) | +1 |

### Daily Opens Array (30 days — added May 2026)
Sourced from TwelveData daily OHLC `open` field (FX day starts 23:00 London). Stored as `S.sessionData.dailyOpens = [{date, price, label}]` newest-first. Fib levels near a daily open get +1 star. 3+ opens clustering at same level = +1 additional star (very strong support/resistance). Label format: "Mon 28 Apr".

### Proximity caps (configurable via Caps modal, persisted in KV)
| Layer | ATR frac | FX pip cap | Gold pip cap |
|---|---|---|---|
| OI walls | 0.12 | 10 pips | $8 |
| Pivots | 0.10 | 8 pips | $6 |
| Range boundaries (daily open) | 0.08 | 6 pips | $5 |
| Gamma flip | 0.15 | 12 pips | $10 |
| Enhanced pivots (confluence enh.) | 0.10 | 8 pips | varies |

Actual proximity = `min(ATR × fraction, cap × pipSize)`.

---

## CME OPEN INTEREST ANALYSER

### Data
Manual paste from CME website into OI modal. Pair-locked to active tab.

### Outputs
`maxPain, callWall, putWall, pcRatio, GEX aggregate, DEX aggregate, gamma flip, top OI strikes, gexProfile`

### GEX
- Flat sigma: FX 12%, gold 18%. Fixed 14 DTE. Indicative.
- Gamma flip = zero-cross in netGEX profile = regime change level
- Stored in `oi_store` localStorage key, synced from/to KV via `oiLoadStore()` / `oiLoadStoreFromKV()`

### Phase 3 OI→Confluence boost (completed May 2026)
OI data now read via `oiLoadStore()` in `confluences.js`. Call wall, put wall, max pain, gamma flip — all checked against each confluence level using ATR-scaled proximity caps. Match = +1 star. Mirrors the entry scanner OI logic.

---

## MACRO COMPASS + ARMA FORECAST

### Compass
90-day yield spread history per pair (10Y + short-rate) from FRED history endpoint. Mini chart with ARMA(1,1) directional forecast overlay.

### ARMA(1,1) methodology
First-differenced for stationarity. Method of moments: φ from lag-1 autocorrelation, θ from residual lag-1 autocorrelation. 5-day forecast with per-day change + 68% CI. `skillPct` vs naive random walk.

### Signal engine (updated May 2026)
Scores 0-12 (was 0-11 before ARMA wired in): fair value gap (0-3), 10Y momentum (0-2), 2Y momentum (0-1), 10Y spread level (0-1), lag detection (0-2), ARMA confirmation (+1 when confirms bias and skill ≥ 5%, confidence ≠ LOW, MIXED ≠ on). Output: bias, type, score/maxScore, FV gap pips, fvBull flag, lagDetected.

### Cross pair compass config (May 2026)
EUR/GBP and GBP/JPY don't have USD as a leg. Solution: `crossBase`/`crossBaseShort` field in `COMPASS_CONFIG`. `compassCompute()` iterates crossBase series (DE or JP) instead of us10y.

---

## SESSION INTELLIGENCE

### Session detection
London local time → Asia (00-06) / Pre-London (06-08) / London (08-13) / NY Overlap (13-17) / NY Close (17-21) / Off-Hours (21-24). Confidence multiplier applied to entry scanner and AI snapshot.

### Session opens (added May 2026)
`computeSessionOpens(bars5m)` extracts London open (08:00) and NY open (13:00) bar prices from today's 5m data. Stored in `S.sessionData.londonOpenPrice` / `nyOpenPrice`.

### Daily open bias
Most recent daily open shown in session badge with bullish/bearish arrow (current price above/below). Source: daily OHLC open field (= 23:00 London candle open). `S.sessionData.dailyOpenPrice` = most recent for badge display.

---

## AI ANALYSIS CARD

### Trigger
Analyse button → `triggerAIAnalysis()` → POST `/api/analysis`

### Snapshot sent to Claude
All 7 tier scores, vol regime + GARCH, Asia + Monday ranges, all Fib confluences with stars/distance, daily pivots, OI (max pain/walls/GEX/gamma flip/top strikes), FRED macro (VIX, HY, DXY, curves, NFCI, TIPS), AUD/JPY carry, risk sentiment, ARMA forecast + spread signal, regime transition risk, COT positioning, dollar regime, event risk, macro surprise, USD strength composite, top 3 entry scanner setups, session intelligence, vol impulse.

### Cache (updated May 2026)
**No TTL.** Analysis stored in KV and localStorage indefinitely. Reloads from KV on page load — available across devices and sessions. Only refreshed when user explicitly clicks Analyse or Force Refresh. Footer shows "Cached · persists until refreshed".

### Claude response fields
`overallBias, conviction, convictionScore, headline, regime, macroRead, yieldCurveRead, oiRead, garchRead, armaRead, spreadSignalRead, cotRead, sessionRead, dollarRegimeRead, eventRiskRead, surpriseRead, keyLevels[], tradingFramework, goodToDoNow[], avoidNow[], breakoutTrigger, reversionTrigger, cleanBreakPotential, sentimentPositioning, reflexivity, riskWarnings[]`

---

## TRADE JOURNAL (updated May 2026)

### What changed
- **Auto-save on Journal click** — levels written directly to `journal_store` (localStorage + KV) the moment the Journal button is clicked. No more 2-click flow (journal_pending → save banner → save button).
- **Merge logic** — preserves existing trade marks, outcomes, notes, SL/TP overrides if Journal clicked again later for same pair/date.
- **All 9 pairs** — `PAIRS_ALL` updated. Pair filter sidebar shows all 9. Stats breakdown table covers all 9.
- **Export** — unchanged CSV format for TradingView Pine indicator: `entry, dir (1/-1), sl, tp, stars, label`

### Storage
`journal_store` in localStorage, synced to KV on every save. Load: localStorage first (fast render), then KV merge (cross-device sync).

---

## LESSONS LEARNED

### Data
- **Body range, not wicks.** Wicks = stop hunts. This has been revisited multiple times. The body range rule is non-negotiable.
- **FRED has a 1-day lag and shape constraints.** `{value, prev}` shape is sacred. Monthly foreign rate data is slow — treat as directional confirmation, not precision.
- **TwelveData 5m bars are good but not FX-primary.** Oanda mid-price is closer to real flow. For range levels (where precision of 1-2 pips matters), Oanda is the right source.
- **5m bars only give ~5 trading days.** Daily OHLC gives 100 days. For 30-day daily opens, must use daily bars not 5m.
- **VWAP is not possible from TwelveData FX 5m data** — no volume field. `{ datetime, open, high, low, close }` only.
- **Oanda timestamps are UTC; TwelveData timestamps are London local.** Must convert Oanda UTC to London local in the worker (sv-SE locale trick) or BST sessions break.

### Architecture
- **ES modules don't share globals.** `S` singleton from `state.js` is the only shared bus. Never try `window.S` in console — it won't exist. Check localStorage or DevTools network instead.
- **localStorage envelope wrapping.** `loadCached` wraps data as `{data, timestamp}`. Access as `.data?.values` not `.values` directly.
- **COMPASS_CACHE_VERSION** must be bumped when COMPASS_CONFIG structure changes or stale cache silently serves wrong data.
- **Cross pairs need explicit T1 handling.** The shortCode-based pattern (`${shortCode}10y`) doesn't generalise to EUR/GBP or GBP/JPY. Required explicit if/else branches in `computeT1()`.
- **`journal_pending` pattern was a UX mistake.** Writing to a staging key and requiring a second click in the journal to commit is unnecessary friction. Direct-write-with-merge is better.
- **AI cache TTL was wrong.** A 1-hour TTL means every page reload after an hour shows empty analysis. For a discretionary trading tool you want to see yesterday's analysis as context — persistent cache is correct; Analyse button is the explicit invalidation.

### Deployment
- **Non-ASCII in `_worker.js` causes silent Cloudflare deploy failure.** Always run `node --check _worker.js`.
- **Both Production AND Preview env var scopes** must be set. Drag-and-drop deploys to Preview — setting only Production = broken in production, broken in preview, confusing error messages.
- **KV namespace binding (`FX_SCORES`) is set differently from string env vars** — it's a binding in the Pages dashboard, not a key-value pair.

### Strategy
- **Confluence over single signals.** A 4-star level is rare and worth waiting for.
- **Stars are additive context, not a binary filter.** 1-star levels still matter for stop placement / level awareness.
- **The star system now reaches 7 stars** — but 5+ is already exceptional. Don't chase every 7-star mechanically; treat as "very high conviction zone."
- **Session timing matters as much as level.** A 4-star level hit during Asia (low confidence) is different from the same level hit during London overlap (high confidence). Session badge confidence multiplier captures this.
- **Daily opens are real confluence.** The 23:00 London open consistently acts as a magnet/repel level throughout the week. 3+ opens clustering at a price = very strong historical support/resistance.

---

## KNOWN ISSUES / WATCH POINTS

| Issue | Status | Note |
|---|---|---|
| Pivot discrepancy vs external calculators | By design | TwelveData uses 5pm NY close; external = midnight. Internally consistent. |
| ARMA on monthly 2Y data | Documented | Monthly forward-filled; treat 2Y ARMA as indicative only |
| GARCH fixed parameters | Documented | α=0.10, β=0.85 not fitted per instrument. Good enough. |
| OI data manual entry | By design | CME not auto-fetched. Staleness shown via savedAt timestamp. |
| BST edge on Asia session | Near-miss resolved | Worker now converts Oanda UTC → London local; first bar of BST session no longer missed |
| NFCI weekly lag | By design | Published Wednesdays only |
| Non-ASCII in worker | Critical | `node --check _worker.js` before every deploy |
| CF Pages two-scope trap | Critical | Set all env vars in both Production AND Preview |
| `S` not accessible in browser console | By design | ES module singleton. Debug via localStorage or DevTools Network. |

---

## ROADMAP

### Completed (May 2026 session)
- [x] Phase 3: OI→confluence boost (call wall / put wall / max pain / gamma flip → +1 star)
- [x] ARMA wire-up to signal engine (confirms bias → +1 score point, maxScore 11→12)
- [x] Session open price levels (London 08:00, NY 13:00 stored in sessionData)
- [x] Daily opens array — 30 days from daily OHLC, newest-first, label "Mon 28 Apr"
- [x] Daily open confluence boost (+1 star if fib near daily open, +1 extra if 3+ cluster)
- [x] 4 new pairs: EUR/GBP, USD/CAD, USD/CHF, GBP/JPY (full compass + T1 + signal support)
- [x] UI rename: "High Confluence Entries" → "Trade Setups", "Fib Confluences" → "Level Map"
- [x] Journal auto-save (1-click, direct write, merge-preserving)
- [x] Journal: all 9 pairs in sidebar + stats breakdown
- [x] AI analysis persistent cache (no TTL, KV-backed)
- [x] Oanda 5m/30m data source (range levels now from primary FX market maker)

### Next priorities

**Order block detection** (needs more analysis before building)
- Requires 1H OHLC route in `_worker.js`
- New `js/orderblocks.js` module
- Integration into entry scanner as additional tag + star modifier
- Definition: last bullish/bearish candle before a strong impulsive move

**Vol impulse as signal modifier**
- Already partially in vol.js (`volImpulse`, `volBias`, `volImpulsePct`)
- Wire into `runSignalEngine()`: expanding vol → breakout bias; contracting → mean-reversion
- Currently computed but not used as mechanical modifier

**Fitted GARCH**
- MLE optimisation when 250+ daily bars available
- Requires data persistence across sessions (KV or R2)
- HAR model (daily + weekly + monthly vol) as upgrade path

**Backtesting validation**
- See `BACKTEST_PYTHON_MODEL.md` for the full Python strategy spec
- Historical Oanda data (or Dukascopy) as price source
- Walk-forward validation on 5-year dataset

### Not yet started
- Futures instruments (NQ, ES, SR3, TN)
- CVOL / vol cones / skew panel
- Liquidity level detection (equal highs/lows, stop clusters)
- Auto-fetch OI data (would require a subscribed CME data provider)

---

## SIGNAL ENGINE FLOW

```
runSignalEngine(compassData, volRegime)
  ├── compassCompute()              → 90d spread trend, fair value gap, lag detection
  ├── computeARMAForecast()         → directional bias, skill%, 1d/5d forecast
  ├── detectCrossConflict()         → USD strength vs pair signal conflict check
  ├── score 0-12 across 6 factors
  └── returns { bias, type, score, maxScore, fvPips, fvBull, lagDetected }

runEntryScanner(signal, confluences, pivots, asia, monday, quote, volRegime)
  ├── for each enhanced confluence level:
  │     ├── proximity to price
  │     ├── OI wall / pivot proximity tags
  │     ├── daily open tag (newest matching open in last 30 days)
  │     ├── London/NY open price proximity
  │     ├── signal alignment bonus
  │     ├── vol regime filter (skip if extreme vol)
  │     └── total stars + RR calculation
  └── returns entries sorted by stars desc, distance asc
```

---

## RENDER FLOW

```
loadAll()
  └── renderAll()
        └── renderAllInner()
              ├── calculateTierScores()
              ├── calculateVolRegime()     ← EMA-ATR + GARCH
              ├── calculatePivots()
              ├── filterConfluences()
              ├── enhanceConfluences()     ← adds stars/OI/dailyOpen/direction/SL/TP
              ├── aiRenderCardOnUpdate()   ← loads persistent KV cache
              ├── loadAndRenderCompass()   ← async FRED history + ARMA
              └── renderSignalAndEntries()
                    ├── runSignalEngine()
                    ├── runEntryScanner()
                    └── renderEntryScanner() + renderSignalCard()
```

---

## DEBUGGING QUICK REFERENCE

| Symptom | Likely cause | Fix |
|---|---|---|
| "Loading..." stuck forever | JS syntax error | DevTools Console → read stack trace |
| "Bad response — not JSON" | Worker not running | Check `_worker.js` deployed; non-ASCII? |
| All tier scores 0 | FRED wrong shape | `/api/fred` returning raw arrays |
| Compass shows no data for new pairs | Missing FRED series | Check ca10y, ch10y etc. in worker SERIES map |
| Oanda fetch 401 | Wrong account type | Check OANDA_ENV — practice vs live |
| Oanda fetch 400 | Bad instrument name | Verify symbol translation: EUR/USD → EUR_USD |
| Asia session empty for cross pairs | BST edge case | Worker UTC→London conversion should handle it |
| OI shows wrong pair | Modal opened before pair switch | Switch pair tab first |
| Stars inflated | ATR-fraction too wide | Open Caps, reduce pip caps |
| Deploy fails silently | Non-ASCII in worker | `node --check _worker.js` |
| AI analysis shows empty | Old TTL-expired cache | Click Analyse. Cache now permanent — this should not recur |

---

## CSS VARIABLE REFERENCE

```css
--s1: card bg    --s2: secondary bg    --s3: tertiary bg
--border, --border2
--text, --text2, --text3
--green, --green-bg, --green-bd
--red,   --red-bg,   --red-bd
--blue,  --blue-bg,  --blue-bd
--amber, --amber-bg, --amber-bd
--purple,--purple-bg,--purple-bd
--r: border-radius small    --rl: border-radius large
```

Fonts: DM Sans (UI) + DM Mono (numbers).

---

## SMART DECIMAL FORMATTING

| Pair type | Decimals | Step |
|---|---|---|
| EUR/USD, GBP/USD, AUD/USD, EUR/GBP, USD/CAD, USD/CHF | 5 | 0.00001 |
| USD/JPY, GBP/JPY | 3 | 0.001 |
| XAU/USD | 2 | 0.01 |

---

*Updated May 2026. Update this document when architecture changes significantly.*
