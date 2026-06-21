# CME OI Analyser — Session Handover
**Date:** April 2026  
**Scope:** Everything built and fixed in this conversation, integrated into `index.html` and `_worker.js`

---

## What Was Built

A full **CME Open Interest Analyser** integrated directly into the existing Regime + Confluence Dashboard (`index.html`). No new files — it's embedded in the single-page dashboard.

### Features

| Feature | Description |
|---|---|
| OI data input modal | Triggered by `📊 OI` button in topbar. Pair-locked to active pair tab. |
| Per-pair storage | OI data stored in `localStorage` keyed by pair symbol — each pair independent |
| Max Pain calculation | Full pain calculation matching Pine Script logic exactly |
| Call Wall / Put Wall | Highest call OI strike and highest put OI strike |
| High OI levels table | Top N strikes ranked by total OI with support/resistance classification |
| P/C ratio & skew bar | Visual put/call ratio with bias label (BULLISH / BEARISH / NEUTRAL) |
| OI change (flow) | Daily OI change per strike from optional second paste table |
| GEX / DEX (aggregate) | Gamma and delta exposure totals with dealer positioning interpretation |
| **Gamma flow chart** | Per-strike call GEX vs put GEX as a centred horizontal bar chart |
| Gamma flip detection | Identifies where net GEX crosses zero — regime change level |
| Saved-at timestamp | Shows when data was last pasted per pair |

---

## Files Changed

### `index.html`
All changes are additive — nothing existing was removed or modified.

**CSS additions** (after `.div-flag` block):
- `.oi-modal-overlay`, `.oi-modal` — modal overlay and container
- `.oi-form-*`, `.oi-lbl`, `.oi-input`, `.oi-textarea`, `.oi-select`, `.oi-hint` — form elements
- `.oi-card`, `.oi-card-hd`, `.oi-badge-*` — sidebar card
- `.oi-stats`, `.oi-stat`, `.oi-stat-val` — 4-stat strip
- `.oi-levels`, `.oi-level-hd`, `.oi-lvl-row`, `.oi-bar-*` — OI levels table
- `.oi-skew`, `.oi-skew-track`, `.oi-skew-dot` — P/C skew slider
- `.oi-gex-row`, `.oi-gex-cell` — OI flow section
- `.oi-gamma-*` — full gamma flow chart styles
- `.oi-add-btn`, `.oi-remove`, `.oi-empty` — UI controls

**HTML additions:**
- `📊 OI` button in topbar (after Refresh button)
- Full modal HTML (`#oiModalOverlay`) before `<script>` tag
- CME Open Interest section in right sidebar (between Monday Range and Daily Pivots)

**JavaScript additions** (full OI engine block before `// CONFIG` section):

| Function | Purpose |
|---|---|
| `oiLoadStore()` | Read `oi_store` object from localStorage |
| `oiSaveStore(store)` | Write `oi_store` object to localStorage |
| `openOIModal()` | Open modal, lock to current pair, repopulate all fields from stored data |
| `closeOIModal()` | Close modal, re-enable pair selector |
| `oiParseTable(raw)` | Parse raw CME OI paste → `{strikes, calls, puts, callChg, putChg}` |
| `oiParseChangeTable(raw, len)` | Parse optional change table, validates row count matches |
| `oiCalcMaxPain(strikes, calls, puts)` | Full pain calculation (matches Pine Script) |
| `oiErf(x)` | Error function approximation for BSM Greeks |
| `oiGreeks(strike, spot, pair)` | BSM gamma + delta per strike (flat sigma: forex 12%, gold 18%, equity 20%, T=14d) |
| `oiCalcExposures(strikes, calls, puts, spot, pair)` | Aggregate GEX and DEX |
| `oiFmtStrike(val, pair)` | Instrument-aware decimal formatting |
| `oiFmtOI(n)` | K/M abbreviation formatting |
| `oiFmtChg(n)` | OI change with +/− prefix |
| `processOIData()` | Validates, parses, computes all metrics, saves to store, calls renderAll() |
| `removeOIInstrument(pair)` | Deletes one pair's data from store |
| `renderOISidebar()` | Returns HTML for current pair's OI card (or empty prompt) |
| `renderGammaChart(gexProfile, spot, pair, maxPain)` | Centred horizontal bar chart with flip detection |
| `renderOICard(inst)` | Full card HTML — all sections |

---

## Storage Architecture

**Key:** `oi_store` in `localStorage`  
**Shape:** `{ "EUR/USD": { ...inst }, "GBP/USD": { ...inst }, ... }`

Each `inst` object contains:
```javascript
{
  pair, spot, maxPain,
  exposures: { gex, dex },
  topLevels: [{ strike, callOI, putOI, totalOI, callChg, putChg, callGex, putGex, netGex, gamma }],
  gexProfile: [{ strike, callGex, putGex, netGex }],  // ALL strikes, price-ordered, for chart
  callWall, putWall, callWallOI, putWallOI,
  totalCallOI, totalPutOI, pcRatio,
  totalCallChg, totalPutChg,
  numRows, numLevels, minOI,
  savedAt,       // display timestamp
  rawOI,         // raw paste text — repopulated into modal on re-open
  rawChg         // raw change paste text — repopulated into modal on re-open
}
```

**Why localStorage not KV:** Consistent with the existing design decision (see `design.md` Decision Log). OI data is user-entered, not shared — localStorage is intentional.

---

## OI Data Parsing Logic

Mirrors the Pine Script `parse_table()` function exactly:

1. Split by `\n` into rows
2. Skip rows that don't start with a digit (headers, DTE labels, Page Up/Down rows)
3. Clean: tabs → space, multi-spaces → single space
4. Split by space, extract all numeric tokens (handles `5,472` comma-thousands)
5. First token = strike, second = call OI, third = put OI (first C/P expiry column pair)
6. Validate: strike 0.001–30000, OI < 500,000
7. If 5+ tokens and tokens 4–5 are < 10,000 → treat as embedded change data

**Separate change table:** Same parsing, but validates row count matches main table before using. If mismatch, embedded change data (if any) is used instead.

---

## Gamma Flow Chart

**Data:** `gexProfile` — computed for ALL strikes (not just top N), ordered by price low→high.

**Per strike:**
```
callGex = callOI × gamma × contractSize × spot   // dealers hedging calls → positive
putGex  = putOI  × gamma × contractSize × spot   // dealers hedging puts → positive
netGex  = callGex - putGex
```

**Contract sizes used:**
- EUR/USD, GBP/USD, other FX pairs: 125,000
- XAU/USD: 100
- NQ: 20
- ES: 50

**Chart layout:** Centred zero line. Red bars grow LEFT from centre (call GEX). Green bars grow RIGHT (put GEX). ATM strike labelled in amber. Gamma flip strike highlighted.

**Labels:**
- `MAG` (green) — put-dominant. Dealers long gamma. Buy dips to hedge. Price slows and reverts.
- `REP` (red) — call-dominant. Dealers short gamma. Sell rallies to hedge. Price repels, accelerates once broken.
- `BAL` (grey) — balanced. Net GEX < 5% of max. No dominant character.

**Gamma flip:** First strike where `netGex` sign changes. Displayed as an amber callout below the chart. Above flip = one regime, below = opposite.

**Known limitations (documented, intentional):**
- Flat sigma assumption (no real IV per strike). OTM puts are underestimated due to vol skew.
- Fixed 14 DTE average. Near-expiry (0-DTE) strikes would have 10–20× higher gamma in reality.
- Scale is indicative not precise — relative bar widths are the signal, not absolute dollar values.

---

## `_worker.js` — What Changed and Why

The original `_worker.js` was not uploaded to this session. It was reconstructed from the design doc. **Two versions were produced** — the first was wrong, the second is correct:

### Version 1 (wrong — do not use)
FRED route returned raw arrays: `{ vix: [{date, value}, ...], ... }`  
Dashboard expects `{ vix: { value: X, prev: Y }, ... }` — causes all tier scoring to return 0/undefined.

### Version 2 (correct — deploy this)
FRED route transforms each series before returning:
```javascript
// Filters "." nulls, returns { value: latest, prev: previous }
return [key, { value: valid[0] ?? null, prev: valid[1] ?? null }];
```

**All other routes unchanged from original design:**
- `/api/quote` → `{ price: parseFloat(data.close) }` from Twelve Data `/quote`
- `/api/ohlc`, `/api/ohlc5m`, `/api/ohlc30m` → Twelve Data raw response passed through (dashboard reads `.values` directly)
- `/api/config` → `{ hasFred, hasTwelve }`

**After deploying new worker:** Clear `fred` key from localStorage to flush the stale wrong-shaped FRED cache. DevTools → Application → Local Storage → delete key `fred`.

---

## Quote Error Root Cause

**Error:** `Bad response from /api/quote (not JSON): <!DOCTYPE html>...`

**Cause:** Worker's `/api/quote` route was either missing or throwing, causing Cloudflare to serve `index.html` as the fallback — which is HTML, not JSON.

**Fix in new worker:** Route explicitly handles all error cases with `return err(...)` (JSON) instead of letting exceptions propagate to HTML fallback.

**Also check:** Cloudflare Pages → Settings → Environment variables — `TWELVE_KEY` must be set in **both** Production AND Preview scopes. Setting only Production causes this exact error on drag-and-drop deploys (which go to Preview).

---

## Deployment

Same drag-and-drop process as always:

```
tier1-tier2-cloudflare/
├── _worker.js     ← replace with new version
├── index.html     ← replace with new version  
└── _headers       ← unchanged
```

Cloudflare Pages → drag folder onto deploy zone.

---

## Render Safety

`renderOISidebar()` is wrapped in a try/catch IIFE in the main render template:
```javascript
${(()=>{ try { return renderOISidebar(); } catch(e) { 
  console.error('OI render error:', e); 
  return '<div class="oi-empty">OI display error — try re-pasting data.</div>'; 
} })()}
```
This means a broken OI card (e.g. malformed localStorage data) can never crash the main dashboard render.

`renderOICard()` uses fully defensive destructuring — every field has a fallback (`|| 0`, `|| []`, `|| {}`) so partial stored objects never throw.

---

## Known Issues / Watch Points

| Issue | Status |
|---|---|
| OI data is localStorage only — doesn't sync across browsers | By design. Consistent with existing caching strategy. |
| Gamma chart shows all strikes — can be long for dense data | Acceptable. Scroll within sidebar. Could add ±N strike filter if needed. |
| Flat sigma for Greeks | Documented limitation. Shape is correct, absolute values indicative. |
| 14 DTE assumption | Documented limitation. Most relevant for near-expiry OI. |
| CME data covers 18 expiries — first C/P pair only used | Correct. Matches Pine Script behaviour. |

---

## What To Build Next (from session discussion)

- **Confluence integration:** When a high-OI / strong gamma strike is within N pips of an existing Fib confluence, add it as a confluence source and include in star rating. This was mentioned as the roadmap item in `design.md` Phase 3: "CME 1.0950 call wall (15k OI)" appearing in a 5-star confluence callout.
- **OI-enhanced star scoring:** A 4-star Fib confluence that also sits on the call wall should score higher than one that doesn't. The data is now available to do this.

---

*End of handover document.*
