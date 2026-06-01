# backtest-viewer.html — Integration Guide

How to wire a new backtest source into the shared M1 replay viewer.  
Hand this document to a fresh session; it contains everything needed to complete the integration end-to-end.

---

## Architecture overview

```
backtest-viewer.html
│
├── URL param  ?source=<key>          ← selects which adapter is active
│
├── ADAPTERS   { vol, claude, gold }  ← registry of adapters (add yours here)
├── BACK_LINKS { vol, claude, gold }  ← "← Back" link per source
│
└── adapter interface
    ├── fetchTrades()       → Trade[]         ← populates the trade list
    ├── fetchCandles(trade) → Candle[]        ← populates the M1 chart
    ├── getLevels(trade)    → Levels | null   ← draws price-line overlays
    └── getDetail(trade)    → Detail          ← fills the info panel
```

The viewer handles **everything else automatically**:

- LightweightCharts 4.2.0 candlestick chart (loaded dynamically, non-blocking)
- TradingView-style replay (play/pause, step forward/back, scrubber, speed presets)
- Entry and exit arrow markers via `setMarkers()`
- Level price-lines via `createPriceLine()`
- Auto-scroll during replay (`timeToCoordinate` + `subscribeVisibleLogicalRangeChange`)
- Keyboard shortcuts (← → navigate trades, R replay, Space play/pause, L levels, Enter re-center)
- Trade list with win/loss filter, direction filter, P&L badges
- Detail panel (right sidebar / bottom sheet on mobile)
- Mobile-responsive layout

---

## Step 1 — Define the adapter object

Add your adapter **inside the `<script>` block** of `backtest-viewer.html`, before the `ADAPTERS` registry (around line 358).

```javascript
const MY_ADAPTER = {

  // ── fetchTrades ─────────────────────────────────────────────────────────────
  // Must return a Promise that resolves to Trade[].
  // Use AbortController for a sensible timeout (30 s shown here).
  async fetchTrades() {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const r = await fetch('/api/my-backtest/trades', { signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Failed to load trades');
      if (!d.trades?.length) throw new Error('No trades found — run the backtester first');
      return d.trades;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Request timed out — try again');
      throw e;
    } finally { clearTimeout(tid); }
  },

  // ── fetchCandles ────────────────────────────────────────────────────────────
  // Must return a Promise that resolves to Candle[].
  // Uses the shared M1 candles endpoint (same for all sources).
  // Timeout must be ≥ 120 s — first load from R2 can take 30–60 s.
  async fetchCandles(trade) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const pair = trade.instrument.toLowerCase().replace(/[^a-z]/g, '');
      const from = _dateOffset(trade.date, -2);   // helper already in the file
      const to   = _dateOffset(trade.date, +2);
      const r = await fetch(`/api/vol-backtest/candles/${pair}?from=${from}&to=${to}`, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d.ok || !d.candles?.length) throw new Error(d.error || 'No M1 data');
      return d.candles;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('M1 data took too long — try again');
      throw e;
    } finally { clearTimeout(tid); }
  },

  // ── getLevels ───────────────────────────────────────────────────────────────
  // Returns an object with price levels to draw, or null to skip.
  // All keys are optional — pass null/undefined to omit a line.
  getLevels(trade) {
    // Example: return null if you don't want level overlays
    if (!trade.open) return null;
    return {
      entry: trade.entry_price,   // solid green/red line labelled "Entry"
      tp:    trade.tp_price,       // dotted green line labelled "TP"
      sl:    trade.sl_price,       // dotted red line labelled "SL"
      hl75H: trade.hl75_high,      // dashed amber line labelled "HL75↑"
      hl75L: trade.hl75_low,       // dashed amber line labelled "HL75↓"
      ocH:   trade.oc_high,        // dashed blue line labelled "OC↑"
      ocL:   trade.oc_low,         // dashed blue line labelled "OC↓"
      open:  trade.open,           // solid grey line labelled "Open"
    };
  },

  // ── getDetail ───────────────────────────────────────────────────────────────
  // Returns up to 3 labelled strings shown in the detail panel.
  // All keys are strings; use '—' for missing values.
  getDetail(trade) {
    return {
      volRegime: trade.vol_regime || '—',
      asiaRange: trade.asia_low != null
        ? `${(+trade.asia_low).toFixed(5)} – ${(+trade.asia_high).toFixed(5)}` : '—',
      sdLevel: trade.sd_level?.toFixed(2) || '—',
    };
  },
};
```

---

## Step 2 — Register the adapter

Find the `ADAPTERS` and `BACK_LINKS` objects (around line 418) and add your key:

```javascript
const ADAPTERS = {
  vol:  VOL_ADAPTER,
  my:   MY_ADAPTER,   // ← add this
};

const BACK_LINKS = {
  vol:  { href: 'vol-backtest.html',    label: '← Vol'  },
  my:   { href: 'my-backtest.html',     label: '← My Backtest' },  // ← add this
};
```

The viewer will now respond to `?source=my` in the URL.

---

## Step 3 — Link from your backtest page

In your backtest page, link to the viewer like this:

```html
<a href="backtest-viewer.html?source=my">Open in Replay Viewer</a>
```

Or programmatically:

```javascript
window.location.href = `backtest-viewer.html?source=my`;
```

---

## Step 4 — Server-side: trades endpoint

Your trades endpoint must return:

```
GET /api/my-backtest/trades
→ 200 { ok: true, trades: Trade[] }
→ 4xx { ok: false, error: string }
```

### Required Trade fields

| Field | Type | Description |
|---|---|---|
| `instrument` | `string` | Pair in any format, e.g. `"EUR/USD"`, `"EURUSD"`. Slashes and case are stripped by the adapter. |
| `date` | `string` | Trade date `"YYYY-MM-DD"`. Used for candle window and zoom. |
| `side` | `"BUY"` \| `"SELL"` | Direction. Controls entry arrow shape and level positions. |
| `outcome` | `"win"` \| `"loss"` \| `"open"` | Used for list badges and exit arrow colour. |
| `pnl_pct` | `number` | P&L percentage. Shown in list badge. |
| `fill_time` | ISO timestamp | Entry time, e.g. `"2025-01-15T08:32:00"`. Positions the entry arrow marker. |
| `exit_time` | ISO timestamp \| null | Exit time. If null, the viewer walks M1 bars to find TP/SL breach via `_computeExitBar`. |

### Optional Trade fields (used by the vol adapter — include if relevant)

| Field | Type | Description |
|---|---|---|
| `open` | `number` | Day open price. Required for `getLevels` to compute derived levels. |
| `hl_75_pct` | `number` | 75th-pct HL range as % of open. Used for entry/sl level lines. |
| `oc_med_pct` | `number` | Median OC range as % of open. Used for TP line. |
| `regime` | `"TREND"` \| `"RANGE"` | Affects TP calculation (RANGE → TP = open). |
| `vol_regime` | `string` | Displayed in detail panel. |
| `asia_low` | `number` | Asia session low. Displayed in detail panel. |
| `asia_high` | `number` | Asia session high. Displayed in detail panel. |
| `leg` | `string` | Trade leg label. Displayed in detail panel. |

---

## Step 5 — Server-side: candles endpoint (shared)

The M1 candles endpoint is **already implemented** in `server.js` and is shared across all sources. You do **not** need to add another candles endpoint.

```
GET /api/vol-backtest/candles/:pair?from=YYYY-MM-DD&to=YYYY-MM-DD
→ 200 { ok: true, pair: string, n: number, candles: Candle[] }
→ 404 { ok: false, error: string }   ← no M1 data for this pair
→ 500 { ok: false, error: string }   ← R2 / IO error
```

### Candle object shape

```typescript
{
  time:  string,  // "2025-01-15T08:32:00" — ISO without Z, epoch-sec compatible
  open:  number,
  high:  number,
  low:   number,
  close: number,
}
```

### How the candles endpoint works (internals)

- M1 parquet files live in R2 (`m1/<pair>.parquet`, e.g. `m1/eurusd.parquet`).
- On first request for a pair, `loadM1ForPair` loads from R2 → local disk → Google Drive (in that order).
- Loaded data is packed into TypedArrays (`Int32Array` for times, `Float32Array` for OHLC) — ~28 MB/pair vs ~350 MB plain objects. This keeps Railway 512 MB RAM viable.
- Only bars within `[from, to]` are unpacked into objects at response time (max 20,000 bars returned).
- An LRU cache (max 3 pairs) keeps recently accessed pairs in memory.

### Required env vars for M1 data

| Var | Purpose |
|---|---|
| `R2_ENDPOINT` | Cloudflare R2 S3 endpoint URL |
| `R2_BUCKET` | R2 bucket name (default `r2-storage`) |
| `R2_KEY_PREFIX` | Key prefix inside bucket (default `m1`) |
| `R2_ACCESS_KEY` | R2 access key ID |
| `R2_SECRET_KEY` | R2 secret access key |

Set these in Railway → Variables. Without them the server falls back to local disk, then Google Drive (if `M1_DRIVE_IDS` has an entry for the pair).

---

## How `_computeExitBar` works (automatic exit detection)

When a trade has no `exit_time`, the viewer walks M1 bars from `fill_time` forward, checking each bar against TP and SL levels returned by `getLevels`. First breach wins. This means:

- If `getLevels` returns `null`, exit markers are simply omitted.
- If your strategy uses levels the vol adapter doesn't know about, implement `getLevels` to return them.
- If you store `exit_time` on every trade, `_computeExitBar` is never called.

---

## Full data flow for a trade click

```
User clicks trade row
  → adapter.fetchCandles(trade)           server: loads TypedArrays from R2/disk
    → /api/vol-backtest/candles/eurusd    server: unpacks date window → Candle[]
  → _cs.setData(candles)                  LightweightCharts: renders M1 bars
  → adapter.getLevels(trade)              computes price levels from trade fields
  → _cs.createPriceLine(...)              draws each level line
  → _computeExitBar(trade)               (only if no exit_time) walks bars for TP/SL
  → _cs.setMarkers([entry, exit])         draws entry/exit arrows
  → _zoomToTrade(trade)                   scrolls to ±3h around trade date
```

---

## Replay internals (no changes needed)

The replay system is fully self-contained. It uses:

- `_candles` (already loaded) sliced up to the current cursor position
- `_cs.setData(slice)` + `_cs.update(bar)` to reveal bars one at a time
- `_replayTimer` (setInterval) for playback; speed presets: 50 / 100 / 200 / 350 / 700 ms/bar
- A draggable `<div>` scrubber mapped to `_scrubTo(pct)`
- A CSS vertical line (`bv-replay-line`) positioned via `timeToCoordinate()`
- Arrow keys hijacked during replay mode for step forward/back

No adapter changes are needed to support replay — it works automatically once `fetchCandles` returns data.

---

## Quick checklist for a new source

- [ ] Add adapter object `MY_ADAPTER` with all four methods
- [ ] Add `my: MY_ADAPTER` to `ADAPTERS`
- [ ] Add `my: { href, label }` to `BACK_LINKS`
- [ ] Add `GET /api/my-backtest/trades` endpoint to `server.js` returning `{ ok, trades }`
- [ ] Ensure trade objects include at minimum: `instrument`, `date`, `side`, `outcome`, `pnl_pct`, `fill_time`
- [ ] Verify R2 env vars are set in Railway (M1 candles endpoint is shared — no additional work needed)
- [ ] Link to viewer with `?source=my` from your backtest page
- [ ] Test: open `backtest-viewer.html?source=my`, check trade list loads, click a trade, verify chart and replay work
