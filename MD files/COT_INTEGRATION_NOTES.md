# COT Integration Notes
## CFTC Disaggregated Report → Trading Suite

*Status: Planning only — not yet built*

---

## The URL Question

The URL originally identified was:

```
https://www.cftc.gov/dea/newcot/c_disagg.txt
```

**This is stale.** The data fetched from this URL showed a report date of **3rd March 2026**, but as of early May 2026 the CFTC has published reports up to **21st April 2026**. This URL appears to be a static/legacy file that is not updated automatically each week.

### The correct current URL

The CFTC publishes the current week's disaggregated combined report at:

```
https://www.cftc.gov/dea/newcot/c_disagg.txt   ← appears stale, do not rely on this
```

The **live rolling file** for the current week needs to be confirmed. Options to investigate:

1. **CFTC Public Reporting Environment (PRE) API** — `publicreporting.cftc.gov` offers a proper filterable API with no token required. This is the cleanest programmatic option and returns JSON/CSV. Example endpoint pattern:
   ```
   https://publicreporting.cftc.gov/resource/[dataset-id].json?...
   ```

2. **Annual compressed file + current week append** — CFTC publishes an annual `.zip` of all historical data, plus a separate current-week file. Worth checking the CFTC COT index page for the correct current-week URL pattern.

3. **Third-party mirror** — Sites like `cotreports.com` or Quandl/Nasdaq Data Link carry the same data in cleaner format with reliable weekly updates. However, introduces a third-party dependency which goes against the project's preference for direct sources.

**Action before building:** Fetch the CFTC COT index page and identify the definitive current-week URL for the disaggregated combined flat file. The correct URL likely follows a pattern like:
```
https://www.cftc.gov/dea/newcot/c_disagg_yyyy.txt   (annual)
https://www.cftc.gov/dea/newcot/c_disagg.txt         (current week — needs verification)
```

---

## What the File Contains

The `c_disagg.txt` file is a single large flat text file (~5MB) covering all markets CFTC tracks — agriculture, energy, metals, financials, FX. Each row is one comma-delimited record for one market, covering the most recent Tuesday's open interest snapshot.

**Release schedule:** Data is as of Tuesday close. Published Friday afternoon (approximately 15:30 ET). Weekly cadence.

---

## Column Structure (Disaggregated Combined Format)

Each row has approximately 150+ comma-separated fields. The fields we care about for FX sentiment:

| Col Index | Field Name | Description |
|-----------|-----------|-------------|
| 0 | `market_name` | e.g. `"EURO FX - CHICAGO MERCANTILE EXCHANGE"` |
| 2 | `report_date` | e.g. `2026-04-22` |
| 7 | `open_interest` | Total OI across all categories |
| 8 | `prod_merc_long` | Producer/Merchant longs (hedgers) |
| 9 | `prod_merc_short` | Producer/Merchant shorts (hedgers) |
| 10 | `swap_long` | Swap Dealer longs |
| 11 | `swap_short` | Swap Dealer shorts |
| 16 | **`mm_long`** | **Managed Money longs (specs)** ← primary signal |
| 17 | **`mm_short`** | **Managed Money shorts (specs)** ← primary signal |
| 49 | `chg_mm_long` | Week-on-week change in MM longs |
| 50 | `chg_mm_short` | Week-on-week change in MM shorts |

*Note: Column indices are 0-based after splitting the CSV row. Fields are space-padded integers — trim whitespace before parsing.*

---

## FX Market Name Strings

These are the exact strings used in `market_name` (col 0) for FX pairs relevant to the suite:

```
"EURO FX - CHICAGO MERCANTILE EXCHANGE"           → EURUSD
"BRITISH POUND - CHICAGO MERCANTILE EXCHANGE"      → GBPUSD
"JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE"       → USDJPY
"SWISS FRANC - CHICAGO MERCANTILE EXCHANGE"        → USDCHF
"CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE"    → USDCAD
"AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE"  → AUDUSD
"NEW ZEALAND DOLLAR - CHICAGO MERCANTILE EXCHANGE" → NZDUSD
```

These strings must be matched exactly (trimming surrounding quotes) when parsing.

---

## Derived Metrics to Extract

From the raw columns above, compute the following per pair:

```
netMM    = mm_long - mm_short          // Speculative net position (contracts)
netChg   = chg_mm_long - chg_mm_short  // Week-on-week change in net position
mmPct    = netMM / open_interest * 100 // Spec positioning as % of total OI (crowding proxy)
reportDate = report_date               // Date string for staleness flagging
```

A **z-score vs 52-week range** would be the ideal additional metric (positioning extremes), but this requires historical data, not just the current week snapshot. The flat file only contains the most recent week. Historical data would need the PRE API or the annual compressed files.

---

## Proposed Signal Logic

For integration into the signal engine, a simple tiered read:

| `netMM` z-score (vs 52wk) | `netChg` direction | Suggested COT signal |
|---|---|---|
| > +1.5σ (extreme long) | Increasing | ⚠️ CROWDED LONG — contrarian risk |
| +0.5σ to +1.5σ | Increasing | MOMENTUM LONG |
| Flat (±0.5σ) | Any | NEUTRAL |
| −0.5σ to −1.5σ | Decreasing | MOMENTUM SHORT |
| < −1.5σ (extreme short) | Decreasing | ⚠️ CROWDED SHORT — contrarian risk |

Without historical z-score, a fallback simpler signal:
- `netMM > 0` and `netChg > 0` → **LONG MOMENTUM**
- `netMM < 0` and `netChg < 0` → **SHORT MOMENTUM**
- `netMM` and `netChg` in opposite direction → **FADING / TURNING**
- Otherwise → **NEUTRAL**

---

## Proposed Worker Route

Add a new `/api/cot` route to `_worker.js`:

```javascript
// Route: /api/cot
// Fetches CFTC disaggregated file, extracts FX rows, returns clean JSON

if (url.pathname === '/api/cot') {
  // 1. Fetch the raw CFTC file
  const resp = await fetch('https://www.cftc.gov/dea/newcot/c_disagg.txt');
  const text = await resp.text();

  // 2. FX market name → pair symbol map
  const FX_MAP = {
    'EURO FX - CHICAGO MERCANTILE EXCHANGE':            'EUR/USD',
    'BRITISH POUND - CHICAGO MERCANTILE EXCHANGE':      'GBP/USD',
    'JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE':       'USD/JPY',
    'SWISS FRANC - CHICAGO MERCANTILE EXCHANGE':        'USD/CHF',
    'CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE':    'USD/CAD',
    'AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE':  'AUD/USD',
    'NEW ZEALAND DOLLAR - CHICAGO MERCANTILE EXCHANGE': 'NZD/USD',
  };

  // 3. Parse each line
  const result = {};
  for (const line of text.split('\n')) {
    const fields = line.split(',').map(f => f.trim().replace(/^"|"$/g, ''));
    const marketName = fields[0];
    if (!FX_MAP[marketName]) continue;

    const symbol = FX_MAP[marketName];
    const oi       = parseInt(fields[7])  || 0;
    const mmLong   = parseInt(fields[16]) || 0;
    const mmShort  = parseInt(fields[17]) || 0;
    const chgLong  = parseInt(fields[49]) || 0;
    const chgShort = parseInt(fields[50]) || 0;

    result[symbol] = {
      reportDate: fields[2],
      openInterest: oi,
      mmLong,
      mmShort,
      netMM: mmLong - mmShort,
      netChg: chgLong - chgShort,
      mmPct: oi > 0 ? ((mmLong - mmShort) / oi * 100).toFixed(1) : '0.0',
    };
  }

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
```

**Caching consideration:** The file is ~5MB and updates only once a week (Friday). The worker should cache the result for at least 12 hours, ideally until Saturday, to avoid repeatedly fetching a 5MB file on every dashboard load. A simple module-level cache object with a timestamp check would suffice without needing KV storage.

```javascript
// Module-level cache (resets per worker instance, typically survives for hours)
let cotCache = null;
let cotCacheTime = 0;
const COT_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours in ms

if (Date.now() - cotCacheTime < COT_CACHE_TTL && cotCache) {
  return new Response(cotCache, { headers: { ... } });
}
// ...fetch and parse...
cotCache = JSON.stringify(result);
cotCacheTime = Date.now();
```

---

## Dashboard Integration Points

### 1. Data fetch (loadAll)
Add `/api/cot` to the parallel fetch block alongside FRED and Twelve Data. Store result in a `cotData` variable.

### 2. COT card (already exists in UI)
The screenshot confirms COT NET and OI CHANGE are already displayed per pair. The current data source for these fields needs to be identified before touching anything — check `index.html` for `COT` or `cotNet` references to understand what's currently feeding those fields.

### 3. Signal engine input
`cotData[pair.symbol]` → feeds `runSignalEngine()` as a COT positioning input. The signal label (MOMENTUM, NEUTRAL, CROWDED, TURNING) contributes to the COT positioning row in the signal scorecard.

### 4. Staleness flag
If `reportDate` is more than 8 days old (i.e. a Friday release was missed), show an amber warning on the COT card. This mirrors the existing `savedAt` staleness pattern used for OI data.

---

## What Exists Today in the Dashboard

From the screenshot, the following COT fields are already displayed per pair card:

- `COT NET` — e.g. `+20,317`
- `OI CHANGE` — e.g. `-5,065`  
- `SIGNAL` — e.g. `NEUTRAL`, `MOMENTUM`

And in the Signal Scorecard, a `COT positioning` row exists showing a z-score style reading (e.g. `Specs neutral z=+0.6σ — no strong...`).

**This means COT data is already partially wired** — but likely hardcoded, manually entered, or sourced from an existing mechanism. Before writing any new fetch code, grep `index.html` for `cotNet`, `mmLong`, `mmShort`, or similar to understand the current implementation, and ensure the new worker route replaces rather than duplicates whatever is there.

---

## Alternative: CFTC Public Reporting Environment (PRE) API

Instead of parsing the raw flat file, the PRE API at `publicreporting.cftc.gov` supports JSON queries:

```
https://publicreporting.cftc.gov/resource/[id].json?
  $where=market_and_exchange_names='EURO FX - CHICAGO MERCANTILE EXCHANGE'
  &$order=report_date_as_yyyy_mm_dd DESC
  &$limit=1
```

Advantages:
- Returns only the rows you ask for (no 5MB download)
- Clean JSON, no CSV parsing
- Supports historical queries for z-score calculation (just increase `$limit`)
- No API token required

Disadvantages:
- Requires knowing the correct dataset ID for the disaggregated combined report
- Slightly more complex query construction
- External dependency on CFTC's Socrata API infrastructure

**Recommendation:** The PRE API is the better long-term approach, especially once historical data is needed for z-score calculation. The flat file parse is a quicker first implementation that can be upgraded later.

---

## Open Questions Before Building

1. **What is the correct live URL?** Confirm the rolling current-week disaggregated combined flat file URL. The `c_disagg.txt` URL tested was 2 months stale.

2. **What is currently feeding the COT card?** Inspect `index.html` for existing COT data wiring to avoid duplication or conflicts.

3. **Do we want historical z-score or just raw net + change?** Raw net + weekly change is the v1 minimum viable signal. Z-score (which requires 52 weeks of history) is v2 and needs the PRE API.

4. **Which pairs need COT?** Forex pairs are on CME. NQ and ES (equity futures) also have COT data under the TFF report (Traders in Financial Futures), not the Disaggregated report — different file/columns if we ever want those.

5. **Caching strategy:** Module-level cache is simplest but resets on worker cold start. If reliability matters, a Cloudflare KV store would be more robust. Confirm whether the project has KV set up.

---

*Written: May 2026 — for implementation in a future session*
