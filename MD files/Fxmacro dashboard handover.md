# fxmacrodesk — Project Handover

**Live site:** https://fxmacro.pages.dev  
**Platform:** Cloudflare Pages (Advanced Mode — `_worker.js`)  
**Last updated:** April 2026

---

## What this is

A team FX morning scorecard built on the C.OG cross-asset framework. It scores 9 currency pairs (+ gold) across 8 macro and technical tiers, generates a GARCH volatility forecast, classifies the volatility regime, and produces a Claude-written morning briefing that incorporates live FRED data, OHLC technicals, economic calendar events, and Finnhub news headlines.

All API keys are stored as Cloudflare environment variables — users never enter keys. Score trajectory and Claude briefings are stored in Cloudflare KV and shared across the whole team, so everyone sees the same history and the same cached morning briefing.

---

## Deployment

Three files are deployed via Cloudflare Pages drag-and-drop:

```
fxmacrodesk-cf/
├── _worker.js     ← all server-side logic (proxies, Claude, KV)
├── _headers       ← security headers
└── index.html     ← full dashboard (119 KB, self-contained)
```

**To redeploy:** Cloudflare dashboard → Pages → fxmacro → Deployments → drag the `fxmacrodesk-cf/` folder onto the deploy zone.

> **Important:** `_worker.js` Advanced Mode only works via drag-and-drop with this exact filename at the root. Do not rename it. Do not use the `functions/` folder approach — Cloudflare ignores that on drag-and-drop deploys.

---

## Cloudflare Setup

### Environment Variables
Set in: Pages → Settings → Environment variables

| Variable | Purpose | Source |
|---|---|---|
| `FRED_KEY` | FRED macroeconomic data | fred.stlouisfed.org |
| `TWELVE_KEY` | Twelve Data OHLC (800 calls/day free) | twelvedata.com/apikey |
| `NEWS_KEY` | JBlanked economic calendar | jblanked.com/api/key |
| `XR_KEY` | ExchangeRate-API live FX prices | exchangerate-api.com |
| `ANT_KEY` | Anthropic Claude for narrative | console.anthropic.com |
| `FINNHUB_KEY` | Finnhub news headlines | finnhub.io |

### KV Namespace
Create in: Cloudflare dashboard → Workers & Pages → KV → Create namespace

| KV namespace name | Binding variable name |
|---|---|
| `FX_SCORES` | `FX_SCORES` |

Bind in: Pages → Settings → Functions → KV namespace bindings

**What's stored in KV:**

| Key pattern | Contents | TTL |
|---|---|---|
| `scores:EURUSD` | 30-day score trajectory `[{date, score}]` | Manual (no expiry) |
| `narr2:EURUSD:2026-04-21` | Cached Claude briefing HTML | 23 hours |

---

## Worker API Routes

All routes are handled by `_worker.js`. The browser calls these same-origin — no CORS issues.

| Route | Method | Purpose |
|---|---|---|
| `/api/config` | GET | Returns which features are active (`hasFred`, `hasTwelve`, `hasKv`, `hasAnt`, `hasForexNews` etc.) |
| `/api/fred` | GET | FRED proxy — fetches all 17 series server-side |
| `/api/ohlc` | GET | Twelve Data proxy — 100 days OHLC for `?symbol=EUR/USD` |
| `/api/news` | GET | JBlanked calendar proxy — today's high-impact events |
| `/api/price` | GET | ExchangeRate-API live FX rates |
| `/api/scores` | GET | Read shared trajectory from KV for `?pair=EUR/USD` |
| `/api/scores` | POST | Write today's score `{pair, score, date}` to KV |
| `/api/narrative` | GET | Check KV cache for `?pair=EUR/USD&date=YYYY-MM-DD` |
| `/api/narrative` | POST | Generate Claude briefing, save to KV, return HTML |

---

## FRED Series Fetched (17 total)

| Internal key | FRED series ID | Used for |
|---|---|---|
| `vix` | `VIXCLS` | T2 risk sentiment |
| `us2y` | `GS2` | yield curve |
| `us10y` | `GS10` | T1 rate differentials, yield curve |
| `dxy` | `DTWEXBGS` | T3 dollar direction |
| `hy` | `BAMLH0A0HYM2` | T4 credit spreads |
| `nfci` | `NFCI` | T6 financial conditions |
| `aud_usd` | `DEXUSAL` | AUD/JPY carry calc |
| `usd_jpy` | `DEXJPUS` | AUD/JPY carry calc |
| `tips` | `DFII10` | T1 gold real yield |
| `bei` | `T10YIE` | breakeven inflation |
| `de2y` | `IRLTLT01DEM156N` | EUR/USD, EUR/GBP diff |
| `jp2y` | `IRLTLT01JPM156N` | USD/JPY diff |
| `gb2y` | `IRLTLT01GBM156N` | GBP/USD, EUR/GBP diff |
| `au2y` | `IRLTLT01AUM156N` | AUD/USD diff |
| `ca2y` | `IRLTLT01CAM156N` | USD/CAD diff |
| `ch2y` | `IRLTLT01CHM156N` | USD/CHF diff |
| `nz2y` | `IRLTLT01NZM156N` | NZD/USD diff |

**AUD/JPY** is derived: `DEXUSAL × DEXJPUS` (no direct FRED cross).  
**Rate differentials** all use `us10y` (GS10) as the US comparator — all foreign series are long-term rates (`IRLTLT01*`), so like-for-like comparison requires 10Y not 2Y.

---

## The 8 Scoring Tiers

| Tier | Name | Max | Data source |
|---|---|---|---|
| T1 | Rate Differential | ±3 | FRED foreign LT rate vs US10Y. Gold uses TIPS real yield. |
| T2 | VIX Level + Direction | ±3 | FRED VIXCLS + prev. Inverted for gold & safe-haven pairs. |
| T3 | DXY Direction | ±2 | FRED DTWEXBGS + prev. Amplified for gold. |
| T4 | HY Credit Spreads | ±2 | FRED BAMLH0A0HYM2 + prev (bps change). |
| T5 | AUD/JPY Carry Proxy | ±2 | FRED-derived cross rate + level awareness. |
| T6 | NFCI Financial Conditions | ±1 | FRED NFCI (weekly, Chicago Fed). |
| T7 | Momentum EMA/RSI | ±2 | Twelve Data OHLC — EMA(20), EMA(50), RSI(14). |
| T8 | Session Flow | ±1 | Browser UTC clock. |

**Total range: ±16** (plus ±1 coherence bonus if 6+ tiers agree).  
**Sizing:** Score maps to position size from 10% (score ≤ ±4) to 100% (score ≥ ±13).

---

## Pairs

| Pair | T1 basis | Notes |
|---|---|---|
| EUR/USD | US10Y − DE2Y | Standard |
| USD/JPY | US10Y − JP2Y | VIX inverted (safe haven) |
| GBP/USD | GB2Y − US10Y | Standard |
| AUD/USD | AU2Y − US10Y | Standard |
| USD/CAD | US10Y − CA2Y | Standard |
| EUR/GBP | DE2Y − GB2Y | Standard |
| USD/CHF | US10Y − CH2Y | VIX inverted (safe haven) |
| NZD/USD | NZ2Y − US10Y | Standard |
| XAU/USD | TIPS real yield | T1=TIPS, T2=VIX inverted (fear=bullish), T3=DXY amplified |

---

## GARCH Volatility Forecast

Built entirely in JavaScript inside `index.html` — no external library.

**Model:** GARCH(1,1): `σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}`  
**Estimation:** Nelder-Mead simplex MLE on 100 days of log returns from Twelve Data  
**Fallback:** EWMA (λ=0.94, RiskMetrics) if MLE fails to converge  
**Output:** σ forecast at t+1, t+3, t+5 sessions; current vs long-run vol; persistence (α+β); ±1σ and ±2σ price ranges for tomorrow

**Requires:** Twelve Data OHLC loaded. The OHLC result object must contain `logReturns` and `atrHistory` arrays (added in cache version 3). Old cache (v1 or v2) is automatically invalidated and re-fetched.

**Cache version:** `CACHE_VER = 3` in `loadOHLC()`. Bump this whenever the OHLC result shape changes to force a fresh fetch across all users.

---

## Volatility Regime Classification

Uses the `atrHistory` array (ATR for each of the 100 days) to compute ATR percentile vs recent history.

| Percentile | Regime | Sizing guidance |
|---|---|---|
| ≤ 25th | 😴 LOW VOL | Can increase size — smaller ranges |
| 26th–74th | ⚖️ NORMAL VOL | Standard sizing |
| ≥ 75th | 🔥 HIGH VOL | Reduce 30–50% — wider stops needed |

Also computes a weekly range forecast (EMA of last 4 weekly ranges) and week-over-week comparison.

---

## Claude Narrative

**Flow:**
1. Client calls `GET /api/narrative?pair=EURUSD&date=2026-04-21`
2. If cached in KV → return immediately (shared with team)
3. If not cached → fetch JBlanked calendar + Finnhub news in parallel
4. Build human-readable data summary, send to `claude-sonnet-4-6` (non-streaming)
5. Save response HTML to KV with 23h TTL key `narr2:EURUSD:2026-04-21`
6. Return to client

**News sources in prompt:**
- **JBlanked** — today's high-impact economic events for the pair's currencies (actual vs forecast)
- **Finnhub** — general financial news filtered by currency/macro keywords

**Model:** `claude-sonnet-4-6`  
**Cache key prefix:** `narr2:` (bump to `narr3:` etc. if prompt changes significantly to force regeneration)  
**Max tokens:** 700

**Prompt style:** Conversational desk-analyst tone — 4 paragraphs, no headers, plain prose. References actual data values, calendar events, and news headlines naturally.

---

## localStorage (Client-Side Cache)

| Key | Contents | Notes |
|---|---|---|
| `cog_ohlc_EURUSD` | OHLC result object `{v:3, t:timestamp, data:{...}}` | 23h TTL, v=3 required |
| `cog_fred` | Serialised fredData object | 12h TTL, shown instantly on load |
| `cog_h_EURUSD` | Trajectory fallback cache | Only used if KV unreachable |

KV is always the primary source for trajectory. localStorage is offline fallback only.

---

## Data Pills (Status Bar)

The data pills row shows which features are active based on `/api/config` response:

| Pill | Env var | What it gates |
|---|---|---|
| FRED | `FRED_KEY` | All 8 macro tiers |
| OHLC | `TWELVE_KEY` | T7 momentum, GARCH, regime |
| News | `NEWS_KEY` | Economic calendar panel |
| Prices | `XR_KEY` | Live pair rates |
| KV Scores | `FX_SCORES` (KV binding) | Shared trajectory |
| Claude | `ANT_KEY` | Morning narrative |
| FX News | `FINNHUB_KEY` | News context in narrative |

Grey pill = env var not set. Green pill = active and returning data.

---

## Known Issues / Watch Points

- **GARCH on new pairs:** When a new pair is first loaded, it fetches 100 days of OHLC and computes GARCH from scratch. This is a one-time ~3s wait, then cached for 23h.
- **NFCI lag:** NFCI is published weekly on Wednesdays. The same value applies all week — this is expected, not a bug.
- **FRED lag:** All FRED data has a 1-business-day lag. "Live" FRED data reflects yesterday's close, not today's.
- **Twelve Data rate limits:** Free tier is 800 calls/day. With 9 pairs and 23h caching, normal use is ~9 calls/day well within limit. Switching pairs rapidly could burn calls faster — the cache prevents redundant calls within 23h.
- **Narrative caching:** The first team member to load a pair each morning triggers the Claude call and pays the API cost (~$0.01/call). Everyone else gets the cached version. If you change the prompt significantly, bump `narr2:` to `narr3:` in the `narrativeCacheKey` function in `_worker.js`.
- **XAU/USD live price:** ExchangeRate-API includes gold as `XAU` in the rates object. If price shows `—` for gold, the `XR_KEY` may not be set.

---

## File Locations

| File | Location | Notes |
|---|---|---|
| Dashboard | `/mnt/user-data/outputs/fxmacrodesk-cf/index.html` | Deploy to CF Pages |
| Worker | `/mnt/user-data/outputs/fxmacrodesk-cf/_worker.js` | Deploy to CF Pages |
| Headers | `/mnt/user-data/outputs/fxmacrodesk-cf/_headers` | Deploy to CF Pages |
| Cheat sheet | `/mnt/user-data/outputs/fx-cheatsheet.html` | Standalone reading guide |

---

## Architecture Diagram

```
Browser (fxmacro.pages.dev)
        │
        ├── GET /              → _worker.js → serves index.html
        ├── GET /api/config    → reads CF env vars → {hasFred, hasTwelve...}
        ├── GET /api/fred      → FRED API (env.FRED_KEY)
        ├── GET /api/ohlc      → Twelve Data (env.TWELVE_KEY)
        ├── GET /api/news      → JBlanked (env.NEWS_KEY)
        ├── GET /api/price     → ExchangeRate-API (env.XR_KEY)
        ├── GET /api/scores    → Cloudflare KV (FX_SCORES)
        ├── POST /api/scores   → Cloudflare KV (FX_SCORES)
        ├── GET /api/narrative → Cloudflare KV cache check
        └── POST /api/narrative → JBlanked + Finnhub (parallel)
                                 → Anthropic claude-sonnet-4-6
                                 → Cloudflare KV (save, 23h TTL)
```

---

## What This Is Not

- Not a trading system — no order execution, no position management
- Not financial advice — for informational and learning use only
- Not a real-time tick feed — FRED data is 1-day lagged, OHLC is daily closes
- Not a backtesting engine — scores are point-in-time only, not historically validated

---

*Built using the C.OG cross-asset framework. Reference: huskymacrodesk.com (original EUR/USD Google Sheets version).*
