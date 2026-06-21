# Dashboard Enhancement Implementation Spec
## For Claude Code — macrorange.pages.dev (Regime + Confluence Dashboard)

**Files to edit:** `_worker.js` + `index.html`  
**Deploy method:** Drag-and-drop folder to Cloudflare Pages (NO build step, NO Git)  
**Critical rule:** `_worker.js` must contain ASCII only (0-127). No Unicode, em dashes, smart quotes, Greek letters, or emoji — even in comments. Run `node --check _worker.js` before handing back.

---

## Overview of What We Are Building

Three distinct additions to the existing dashboard:

1. **OANDA Spread Monitor** — live bid/ask spread per pair from OANDA v20 REST API, used as a session quality filter (is this a good moment to enter?)
2. **Myfxbook Community Sentiment** — retail long/short % and average long/short price per pair, used as a contrarian crowding signal and as additional confluence price levels
3. **Enhanced AI Analysis Prompt** — richer, more calibrated context sent to Claude Sonnet so the analysis card gives human-understandable actionable output rather than generic observations

---

## Part 1: OANDA Spread Monitor

### What it does

Fetches live bid/ask for each pair from OANDA's v20 REST API. Computes the current spread in pips. Classifies it as NORMAL, WIDE, or EXTREME versus a hardcoded typical spread for that pair. Displays a session quality indicator on the dashboard. Wide or extreme spread = do not enter, wait.

### Why

Spread widens before data events, during thin liquidity (Asia late session, rollover), and on risk-off spikes. Knowing current spread vs typical gives a simple gate: even if you have a 4-star confluence, a 3x spread means the market is warning you off entering right now.

### Authentication

OANDA v20 REST API requires a bearer token. The user must:
1. Log into their OANDA fxTrade account (live or demo — demo works fine)
2. Go to Account Management Portal (AMP) at `fxtrade.oanda.com`
3. Under "My Services" select "Manage API Access"
4. Generate a personal access token

**Store as:** `OANDA_TOKEN` environment variable in Cloudflare Pages → Settings → Environment variables (both Production AND Preview scopes).

This is a static token that does not expire unless manually revoked. No session management needed. No KV storage needed. Simple bearer token in env var, same pattern as `FRED_KEY`, `TWELVE_KEY`, `ANT_KEY`.

### Worker route to add: `/api/spread`

Add this route to `_worker.js` before the final 404 return.

**Request:** `GET /api/spread?symbol=EUR_USD`

OANDA uses underscore format: `EUR_USD`, `GBP_USD`, `USD_JPY`, `AUD_USD`, `XAU_USD`.

**Worker logic:**
```
if (path === '/api/spread') {
  // Requires OANDA_TOKEN env var
  // OANDA environment: use fxtrade.oanda.com (live) or fxpractice.oanda.com (demo)
  // Caller passes ?symbol=EUR_USD&env=practice (or live)
  // Fetch: https://api-fx{env}.oanda.com/v3/instruments/{symbol}/candles
  //   No — simpler: use the pricing endpoint
  // Fetch: GET https://api-fxtrade.oanda.com/v3/accounts/{accountId}/pricing?instruments={symbol}
  //   Returns { prices: [{ asks:[{price,liquidity}], bids:[{price,liquidity}], ... }] }
  // Spread = ask - bid, convert to pips using pip size for that symbol
  // Return: { symbol, bid, ask, spread, spreadPips, timestamp }
}
```

**Exact OANDA pricing endpoint:**
```
GET https://api-fxtrade.oanda.com/v3/accounts/{ACCOUNT_ID}/pricing?instruments={symbol}
Authorization: Bearer {OANDA_TOKEN}
```

For demo accounts replace `api-fxtrade` with `api-fxpractice`.

The user must also store their **account ID** — this is visible in the OANDA portal. Store as `OANDA_ACCOUNT` env var. Format is a number like `101-004-12345678-001`.

**Worker must also store:** `OANDA_ENV` env var — value `live` or `practice`. Determines which base URL to use.

**Return shape:**
```json
{
  "symbol": "EUR_USD",
  "bid": 1.08245,
  "ask": 1.08248,
  "spread": 0.00003,
  "spreadPips": 0.3,
  "timestamp": "2026-05-11T10:23:00Z"
}
```

### Typical spreads for classification (hardcode in worker or index.html)

| Pair | Typical spread (pips) | Wide threshold (x2) | Extreme (x3.5) |
|---|---|---|---|
| EUR/USD | 0.4 | 0.8 | 1.4 |
| GBP/USD | 0.6 | 1.2 | 2.1 |
| USD/JPY | 0.5 | 1.0 | 1.75 |
| AUD/USD | 0.6 | 1.2 | 2.1 |
| XAU/USD | 0.25 (dollars) | 0.50 | 0.88 |

Classification logic (in index.html, client side):
```
NORMAL   = spreadPips <= typical * 1.5
WIDE     = spreadPips <= typical * 3.0
EXTREME  = spreadPips > typical * 3.0
```

### Caching

Do NOT cache spread data in KV or localStorage — the entire point is it is live. Poll every 60 seconds max. The Worker fetches fresh from OANDA on every request. No TTL logic needed.

### `/api/config` update

Add `hasOanda: !!env.OANDA_TOKEN` to the existing `/api/config` response so the dashboard knows whether to show the spread indicator.

### UI placement in index.html

Add a small "SESSION" indicator row at the top of each pair card, below the macro bias line and above the ENTRY CONFLUENCE section. 

```
SESSION QUALITY   [● NORMAL  0.3 pip]
```

Colour coding:
- NORMAL = green dot
- WIDE = amber dot + note "Spread elevated — consider waiting"
- EXTREME = red dot + note "Do not enter — spread extreme"

Do not show the indicator at all if `hasOanda` is false (graceful degradation).

### Spread also feeds into the AI snapshot

Add `spreadPips`, `spreadClassification`, and `typicalSpreadPips` to the snapshot object sent to `/api/analysis`. The AI prompt should use this to comment on execution quality.

---

## Part 2: Myfxbook Community Sentiment

### What it does

Fetches retail positioning data from Myfxbook's Community Outlook API. Per pair returns:
- Long % / Short % (contrarian signal — retail is usually wrong at extremes)
- Average long price / average short price (liquidity levels — where the crowd is underwater)
- Long volume / short volume in lots (size of positioning)

### Authentication — IMPORTANT, read carefully

Myfxbook does NOT use a static API key. It uses a session token system:

1. You POST your email + password to `https://www.myfxbook.com/api/login.json?email=X&password=Y`
2. It returns a session string like `rrYclnohNMGV7MCw9xAc`
3. That session is **IP-bound** — only works from the IP that created it — and expires after 1 month

**The problem:** Cloudflare Workers do not have a fixed outbound IP. If the Worker logs in and gets a session, that session is bound to whichever Cloudflare edge node handled the login request. Subsequent requests may route through a different edge node and the session will reject.

**The solution:** Manual session management.

The user logs in ONCE manually (via browser or curl), captures the session token, and stores it as an environment variable. The Worker never calls the login endpoint — it just uses the stored session token.

**Step-by-step for the user:**
1. Open a browser and navigate to:
   `https://www.myfxbook.com/api/login.json?email=YOUR_EMAIL&password=YOUR_PASSWORD`
2. The page returns JSON: `{"error":false,"message":"","session":"XXXXXXXXXXXXXX"}`
3. Copy the session value
4. Add it to Cloudflare Pages → Settings → Environment variables as `MYFXBOOK_SESSION` (both Production AND Preview scopes)
5. Repeat monthly when it expires — the dashboard will show a "Sentiment unavailable" state gracefully if the session has expired

**Store as:** `MYFXBOOK_SESSION` env var. No KV storage needed — it is not data that changes over time, it is an auth credential.

### Worker route to add: `/api/sentiment`

**Request:** `GET /api/sentiment` (returns all pairs in one call — no symbol param needed)

**Worker logic:**
```
Fetch: GET https://www.myfxbook.com/api/get-community-outlook.json?session={MYFXBOOK_SESSION}
Returns all symbols in one payload.
Parse and return only the pairs we care about: EURUSD, GBPUSD, USDJPY, AUDUSD, XAUUSD
```

**Return shape:**
```json
{
  "EURUSD": {
    "longPct": 44,
    "shortPct": 56,
    "longVolume": 905.47,
    "shortVolume": 1142.58,
    "longPositions": 2932,
    "shortPositions": 3888,
    "avgLongPrice": 1.0850,
    "avgShortPrice": 1.0920,
    "sentiment": "SHORT_HEAVY",
    "crowding": "MODERATE"
  },
  ...
}
```

Compute `sentiment` in the worker:
- `LONG_HEAVY` = longPct >= 65
- `SHORT_HEAVY` = shortPct >= 65  
- `BALANCED` = neither above 65%

Compute `crowding`:
- `EXTREME` = dominant side >= 75%
- `STRONG` = dominant side >= 65%
- `MODERATE` = dominant side 55-64%
- `BALANCED` = below 55%

### Caching

Cache in KV under key `sentiment` with a 30-minute TTL. This uses the existing `/api/kv/get` and `/api/kv/set` pattern already in the worker. Add `sentiment` to the `isAllowedKVKey` whitelist in the worker.

The Worker should:
1. Check KV for `sentiment` key — if fresh (< 30 min), return it
2. If stale or missing, fetch from Myfxbook, compute derived fields, write to KV, return result
3. If Myfxbook returns an error (e.g. expired session), return `{ error: "sentiment_unavailable", reason: "..." }` and log — never crash

Free tier allows 100 requests per 24 hours. 30-minute cache = 48 fetches/day. Safe.

### `/api/config` update

Add `hasMyfxbook: !!env.MYFXBOOK_SESSION` to the `/api/config` response.

### How sentiment data is used in index.html

**Contrarian signal on pair card:**

Show a "RETAIL" row in the entry confluence section:

```
RETAIL CROWD   56% SHORT  [CONTRARIAN LONG SIGNAL]
```

Logic:
- If dominant side matches macro bias → "CROWD ALIGNED — low contrarian value"  
- If dominant side opposes macro bias → "CONTRARIAN [direction] SIGNAL" (positive for conviction)
- If crowding is EXTREME and opposing macro → add +1 to star rating (crowd squeeze setup)
- If crowding is EXTREME and agreeing with macro → subtract 0.5 from star rating (crowded trade warning)

**Average price levels as confluence:**

`avgLongPrice` and `avgShortPrice` are price levels where the retail crowd is clustered. These should be added to the `enhanceConfluences()` function as additional confluence sources, alongside OI walls and Fib levels.

Label them:
- `avgLongPrice` → "Retail Long Cluster" (acts as support — longs defend this level, or it becomes a stop-hunt magnet below)
- `avgShortPrice` → "Retail Short Cluster" (acts as resistance — shorts defend, or stop-hunt magnet above)

Proximity cap for these levels: use the same `oiAtrFrac` / `oiPipCap` caps as OI walls — they are the same category of level (positioning cluster, not pure technicals).

Add a tag `retailCluster: true` on the confluence object so the star rating logic and UI label can identify it.

If a retail cluster price is within the proximity cap of a Fib confluence, it boosts that confluence's star rating by +0.5 (same logic as OI wall proximity already in the codebase).

**Staleness display:**

Show `savedAt` timestamp next to the sentiment row. If data is older than 2 hours, show amber warning "Sentiment stale — refresh".

---

## Part 3: Enhanced AI Analysis Prompt

### Problem being solved

The current Claude analysis prompt receives accurate data but produces output that is sometimes generic ("VIX is elevated suggesting caution"). The goal is output that reads like a prop desk analyst wrote it — specific levels, specific triggers, specific reasoning calibrated to what the numbers actually mean in context.

### Changes to the prompt in `_worker.js`

The prompt is in the `/api/analysis` POST handler. The existing snapshot structure is good — we are enhancing the prompt instructions and adding new snapshot fields, not restructuring.

**New snapshot fields to add to `aiCollectSnapshot()` in index.html:**

```javascript
// Spread data (from OANDA)
spreadPips: currentSpread?.spreadPips ?? null,
spreadClassification: currentSpread?.classification ?? null,  // NORMAL/WIDE/EXTREME
typicalSpreadPips: TYPICAL_SPREADS[currentPair.symbol] ?? null,

// Myfxbook sentiment
retailLongPct: myfxSentiment?.[sym]?.longPct ?? null,
retailShortPct: myfxSentiment?.[sym]?.shortPct ?? null,
retailSentiment: myfxSentiment?.[sym]?.sentiment ?? null,  // LONG_HEAVY/SHORT_HEAVY/BALANCED
retailCrowding: myfxSentiment?.[sym]?.crowding ?? null,    // EXTREME/STRONG/MODERATE/BALANCED
avgLongPrice: myfxSentiment?.[sym]?.avgLongPrice ?? null,
avgShortPrice: myfxSentiment?.[sym]?.avgShortPrice ?? null,
retailContrarian: null,  // compute: true if retail dominant side opposes macro bias
```

**Compute `retailContrarian` before building snapshot:**
```
retailContrarian = (macroBias === 'LONG' && retailSentiment === 'SHORT_HEAVY') ||
                   (macroBias === 'SHORT' && retailSentiment === 'LONG_HEAVY')
```

**New sections to add to the prompt string in the worker:**

Add after the existing YIELD CURVE section:

```
EXECUTION QUALITY (OANDA live spread)
Spread right now: ${s.spreadPips ?? 'N/A'} pips  |  Typical: ${s.typicalSpreadPips ?? 'N/A'} pips  |  Classification: ${s.spreadClassification ?? 'N/A'}
${s.spreadClassification === 'EXTREME' ? 'WARNING: spread is extreme - do not enter, market is illiquid or pre-event' : ''}
${s.spreadClassification === 'WIDE' ? 'NOTE: spread is elevated - entry cost is high, wait for normalisation or widen stop to account for it' : ''}

RETAIL CROWD POSITIONING (Myfxbook community)
Retail long: ${s.retailLongPct ?? 'N/A'}%  |  Short: ${s.retailShortPct ?? 'N/A'}%  |  Crowding: ${s.retailCrowding ?? 'N/A'}
Avg price of retail longs: ${s.avgLongPrice ?? 'N/A'}  |  Avg price of retail shorts: ${s.avgShortPrice ?? 'N/A'}
Contrarian signal vs macro bias: ${s.retailContrarian ? 'YES - retail crowd opposes macro direction (supportive for trade)' : s.retailSentiment === 'BALANCED' ? 'Crowd is balanced - neutral' : 'NO - retail crowd agrees with macro direction (crowding risk)'}
```

### Enhanced prompt instructions

Replace the existing one-line instruction block at the end of the prompt with this expanded version:

```
You are a professional FX/futures prop desk analyst. Your job is to give a SPECIFIC, CALIBRATED trading brief — not generic observations.

Rules for your response:
1. Every level you mention must be a specific price, not a description. Say "1.0847" not "near resistance".
2. Every vol / spread observation must reference the actual numbers. Say "GARCH forecasts 42 pips today, 28 used, 14 remaining" not "volatility is moderate".
3. Retail crowd data is contrarian. If 70% of retail are long and macro says short, that is a TAILWIND (squeeze fuel), say so explicitly.
4. Spread classification gates entry quality. If spread is WIDE or EXTREME, say "do not enter now, wait for spread < X pips" with the actual X.
5. avgLongPrice and avgShortPrice are real liquidity clusters. If price is approaching avgShortPrice from below, that is a resistance cluster with real stops above it. Say so.
6. The headline must be one sentence a trader can act on. Not "mixed signals suggest caution." Something like "Fade the 1.0847 Fib/retail-cluster confluence short, target 1.0812, stop 1.0858, wait for spread to normalise below 0.6 pips."
7. goodToDoNow must be specific actions, not attitudes. "Wait for price to reach 1.0847 then look for 5m bearish engulf" not "be patient".
8. avoidNow must also be specific. "Do not chase the move if price is already below 1.0830" not "avoid chasing".
9. riskWarnings must reference actual values from the snapshot. "VIX at 24 (prev 19) — rising fear, USD bid likely to persist" not "volatility risk".
10. If retailCrowding is EXTREME and retailContrarian is true, call out the squeeze setup explicitly in the headline or tradingFramework.

Respond with a single valid JSON object. No markdown. No text outside the JSON. All string values 1-2 sentences max. Max 3 items per arrays.
```

**The JSON schema is unchanged** — same field names as existing implementation. Only the instructions and additional data fields change.

---

## Cloudflare Environment Variables — Full Updated List

Set ALL of these in Cloudflare Pages → Settings → Environment variables, in BOTH Production AND Preview scopes.

| Variable | What it is | How to get it | Expires? |
|---|---|---|---|
| `FRED_KEY` | FRED API key | fred.stlouisfed.org → My Account → API Keys | Never |
| `TWELVE_KEY` | Twelve Data API key | twelvedata.com → Dashboard | Never (free tier) |
| `ANT_KEY` | Anthropic API key | console.anthropic.com | Never (until revoked) |
| `OANDA_TOKEN` | OANDA v20 personal access token | OANDA AMP portal → Manage API Access | Never (until revoked) |
| `OANDA_ACCOUNT` | OANDA account ID | Visible in OANDA portal, format: 101-004-XXXXXXXX-001 | Never |
| `OANDA_ENV` | `live` or `practice` | Set to `practice` if using demo account | Never |
| `MYFXBOOK_SESSION` | Myfxbook session token | Login manually: myfxbook.com/api/login.json?email=X&password=Y | **1 month — must refresh** |

---

## KV Storage — Full Updated Map

KV namespace: `FX_SCORES` (existing binding, no new namespace needed)

| KV Key | Content | TTL | Who writes | Notes |
|---|---|---|---|---|
| `caps` | Proximity cap config JSON | Forever | Worker PUT /api/config/caps | Existing — unchanged |
| `journal_store` | Trade journal backup | Forever | Worker /api/kv/set | Existing — unchanged |
| `sentiment` | Myfxbook community outlook, all pairs | 30 minutes | Worker /api/sentiment | NEW — add to whitelist |

Add `'sentiment'` to the `EXACT` set inside `isAllowedKVKey()` in the worker.

Spread data is NOT stored in KV — it is always fetched live.

---

## Worker Routes — Full Updated List

Existing routes are unchanged. Add these new routes:

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/spread` | GET | Live bid/ask spread from OANDA | `OANDA_TOKEN` + `OANDA_ACCOUNT` + `OANDA_ENV` env vars |
| `/api/sentiment` | GET | Myfxbook community outlook | `MYFXBOOK_SESSION` env var |

Updated `/api/config` response:
```json
{
  "hasFred": true,
  "hasTwelve": true,
  "hasAnt": true,
  "hasKV": true,
  "hasOanda": true,
  "hasMyfxbook": true
}
```

---

## index.html Changes Summary

### Global state to add

```javascript
let spreadData = {};        // { 'EUR/USD': { spreadPips, classification, bid, ask, timestamp } }
let myfxSentiment = {};     // { 'EURUSD': { longPct, shortPct, avgLongPrice, avgShortPrice, ... } }
```

### Data loading

Add calls to `/api/spread` and `/api/sentiment` inside the existing `loadAll()` function. Both are non-blocking — if they fail, the dashboard renders normally without them (same defensive pattern as existing data sources).

Spread: fetch every 60 seconds via a separate polling interval (not on the main refresh cycle which is every 5 minutes).

Sentiment: fetch once on load, then refresh every 30 minutes (respecting the KV cache TTL).

### Symbol format mapping

Myfxbook returns symbols as `EURUSD` (no slash). OANDA uses `EUR_USD` (underscore). The dashboard uses `EUR/USD` (slash). Add a lookup helper:

```javascript
const toOanda  = sym => sym.replace('/', '_');   // EUR/USD -> EUR_USD
const toMyfxb  = sym => sym.replace('/', '');    // EUR/USD -> EURUSD
const toSlash  = sym => sym.replace('_', '/');   // EUR_USD -> EUR/USD
```

### enhanceConfluences() additions

After the existing OI wall proximity check, add:

```javascript
// Retail cluster proximity check (Myfxbook avgLongPrice / avgShortPrice)
const sent = myfxSentiment[toMyfxb(sym)];
if (sent) {
  const retailLevels = [
    { price: sent.avgLongPrice,  label: 'Retail Long Cluster',  side: 'long'  },
    { price: sent.avgShortPrice, label: 'Retail Short Cluster', side: 'short' },
  ].filter(l => l.price && Math.abs(l.price - confluence.price) <= oiProximityCap);

  if (retailLevels.length > 0) {
    confluence.retailCluster = retailLevels[0];
    confluence.stars += 0.5;
    confluence.sources.push(retailLevels[0].label);
  }
}
```

### Star rating: crowding bonus/penalty

In the `enhanceConfluences()` star computation, after existing alignment check:

```javascript
const sentKey = toMyfxb(sym);
const sent = myfxSentiment[sentKey];
if (sent) {
  const crowdOpposesBias = (bias === 'LONG'  && sent.sentiment === 'SHORT_HEAVY') ||
                           (bias === 'SHORT' && sent.sentiment === 'LONG_HEAVY');
  const crowdAgreesBias  = (bias === 'LONG'  && sent.sentiment === 'LONG_HEAVY') ||
                           (bias === 'SHORT' && sent.sentiment === 'SHORT_HEAVY');

  if (crowdOpposesBias && sent.crowding === 'EXTREME') confluence.stars += 1;    // squeeze fuel
  else if (crowdOpposesBias && sent.crowding === 'STRONG') confluence.stars += 0.5;
  else if (crowdAgreesBias  && sent.crowding === 'EXTREME') confluence.stars -= 0.5;  // crowded trade
}
```

### UI additions per pair card

**Spread row** (above entry confluence section):
```html
<div class="session-quality {classification-class}">
  SESSION  <span class="spread-dot"></span>  {classification}  {spreadPips} pip
  {wide/extreme warning text}
</div>
```

**Retail sentiment row** (inside entry confluence checklist):
```html
<div class="retail-sentiment">
  RETAIL CROWD  {longPct}% long / {shortPct}% short
  <span class="retail-signal">{CONTRARIAN LONG SIGNAL / CROWD ALIGNED / BALANCED}</span>
</div>
```

Both rows should be hidden (display:none) if the relevant config flag (`hasOanda`, `hasMyfxbook`) is false.

---

## Deployment Checklist

Before drag-and-drop deploy:

1. `node --check _worker.js` — must pass with no errors
2. Verify no Unicode characters in `_worker.js` (check with: `grep -P '[^\x00-\x7F]' _worker.js`)
3. All new env vars set in BOTH Production AND Preview scopes in Cloudflare dashboard
4. `MYFXBOOK_SESSION` is fresh (obtained within the last month)
5. `OANDA_ACCOUNT` is correct format (`101-004-XXXXXXXX-001`)
6. `OANDA_ENV` is set to `practice` or `live` matching the account type
7. After deploy: open dashboard, check browser console for errors on `/api/spread` and `/api/sentiment` routes
8. Verify `/api/config` returns `hasOanda: true` and `hasMyfxbook: true`

---

## Error Handling Principles

Follow the existing dashboard pattern throughout:

- Every new data source wrapped in try/catch
- Failures return `null` / empty object — never throw to the render function
- Render functions check for null and hide the UI element gracefully
- No new data source can crash the main dashboard render
- Console.error for debugging, never alert()

If OANDA token is invalid → `/api/spread` returns `{ error: 'spread_unavailable' }` → client hides spread row
If Myfxbook session expired → `/api/sentiment` returns `{ error: 'sentiment_unavailable' }` → client hides sentiment row, shows "Refresh Myfxbook session" note in the config area

---

## Myfxbook Session Refresh Process (for the user, document in UI)

When the Myfxbook session expires (~monthly), the sentiment row will show "Sentiment unavailable — session expired".

To refresh:
1. Go to: `https://www.myfxbook.com/api/login.json?email=YOUR_EMAIL&password=YOUR_PASSWORD`
2. Copy the `session` value from the JSON response
3. Cloudflare Pages → Settings → Environment variables → update `MYFXBOOK_SESSION`
4. Redeploy (drag-and-drop)

Consider adding a small "Refresh Myfxbook Session" note in the dashboard settings/config modal pointing to this process.
