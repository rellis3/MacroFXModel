# Asia Range Fibonacci Confluence System

A complete backtest + probability-analysis system for trading Fibonacci confluence levels around the daily Asia session range. Built as part of the MacroFXModel website (repo: `rellis3/MacroFXModel`).

---

## What was built

Four things working together:

| File | Role |
|------|------|
| `js/asiaRangeEngine.js` | Node.js engine — range calc, fibs, confluence, trade simulation |
| `asia-range-backtest.html` | Full backtest UI with chart modal |
| `asia-range-analysis.html` | Client-side probability / analysis engine |
| `server.js` | Express API routes that run the engine and serve results |

Nav shortcuts added to:
- `index.html` Backtests dropdown: `📐 Asia Fib BT` and `📊 Asia Analysis`
- `asia-range-backtest.html` topbar: `📊 Analysis` button

---

## Strategy logic

### Asia session range
- **Hours:** 00:00–06:00 UTC
- **Timeframe:** M1 bars resampled to **5m**
- **Measurement:** candle **bodies only** — `max(open, close)` for high, `min(open, close)` for low
- Requires ≥10 M1 bars and range > 5 pips before the day is processed

### Monday range
- **Full Monday UTC day** (00:00–24:00)
- **Timeframe:** M1 resampled to **15m**
- **Measurement:** full **wicks** (bar high/low)
- Used to flag `monday_aligned` trades (within 10 pips of Monday H/L)

### Fibonacci levels (45 total)
```
-9.5, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5,
-4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, -0.25,
 0,  0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3,
 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8,
 8.5, 9, 9.5, 10, 10.5
```
Price at level `L` = `asia_low + asia_range × L`

Key levels (0, 0.25, 0.5, 0.75, 1.0) are always flagged `is_key = true`.

### Confluence detection
Each current-session fib is compared against all prior-session fibs:
- **Regular confluence:** nearest prior fib is within `confluenceThreshPips × pipSize`
- **Tight confluence:** additionally within `tightThreshold = threshold × (tightPct / 100)`

Default: `confluenceThreshPips = 2.0`, `tightPct = 10.0`

### Trade entry
- Limit orders placed at confluence fib levels
- **Outside range:** SELL above `asia_high`, BUY below `asia_low`
- **Inside range:** fade back to midpoint (SELL if above mid, BUY if below)
- SL distance = `asia_range × slMult` (default 0.5)
- TP options: midpoint of Asia range (`'0.5'`) or range edge (`'range_edge'`)
- Trade window: configurable hours (default 06:00–14:00 UTC = London open)

### MFE / MAE tracking
Tracked inside `walkLimitOrder` after fill on every bar:
- **MFE** (Max Favourable Excursion): max(entry − bar.low) for SELL, max(bar.high − entry) for BUY
- **MAE** (Max Adverse Excursion): max(bar.high − entry) for SELL, max(entry − bar.low) for BUY
- Converted to **R multiples** in `simulateDay`: `mfe_r = mfeDist / riskDist`

---

## Engine API (`js/asiaRangeEngine.js`)

### Exports
```js
import {
  runAsiaRangeBacktest,    // single pair
  runFullAsiaRangeBacktest, // all 26 pairs
  FIB_LEVELS,              // array of 45 numbers
  ASIA_INSTRUMENTS,        // array of 26 pair strings
} from './js/asiaRangeEngine.js';
```

### `runAsiaRangeBacktest(pairKey, opts, m1Dir)`
Returns `Promise<Trade[]>` for one pair.

### `runFullAsiaRangeBacktest(opts, pairs, m1Dir)`
Runs all pairs sequentially, calls `opts.onProgress({ pair, done, total })` after each.

### Options object
| Option | Default | Description |
|--------|---------|-------------|
| `dateFrom` | `''` | ISO date string, inclusive |
| `dateTo` | `''` | ISO date string, inclusive |
| `confluenceThreshPips` | `2.0` | Pip distance for confluence match |
| `tightPct` | `10.0` | % of threshold for "tight" |
| `levelFilter` | `'tight'` | `'tight'` / `'confluence'` / `'all'` |
| `tradeZone` | `'outside'` | `'outside'` / `'both'` |
| `slMult` | `0.5` | SL = asiaRange × slMult |
| `tpMode` | `'0.5'` | `'0.5'` (midpoint) / `'range_edge'` |
| `tradeHourFrom` | `6` | UTC hour to start placing trades |
| `tradeHourTo` | `14` | UTC hour to stop |
| `showMonday` | `true` | Compute Monday range for each day |

---

## Trade record schema

Every trade returned by the engine has these fields:

```js
{
  // Identity
  instrument:      'EURUSD',          // uppercase pair
  date:            '2024-03-15',      // UTC date of Asia session
  side:            'SELL',            // 'BUY' | 'SELL'
  fib_level:       1.5,               // e.g. 1.5 = 150% extension

  // Prices
  entry_price:     1.08432,
  tp_price:        1.08210,
  sl_price:        1.08650,
  asia_high:       1.08410,
  asia_low:        1.08120,
  asia_range:      0.00290,
  asia_mid:        1.08265,

  // Outcome
  outcome:         'win',             // 'win' | 'loss' | 'open' (EOD)
  pnl_pct:         0.02050,           // % P&L vs refOpen (first bar of trade window)
  filled:          true,              // always true in engine output
  fill_time:       '2024-03-15T08:23',
  exit_time:       '2024-03-15T09:47',
  rr:              0.77,              // reward/risk ratio

  // MFE / MAE
  mfe_r:           0.812,             // max favourable excursion in R
  mae_r:           0.143,             // max adverse excursion in R

  // Confluence flags
  has_confluence:  true,
  is_tight:        false,
  is_key:          true,              // level is in {0, 0.25, 0.5, 0.75, 1}

  // Monday range
  monday_high:     1.08780,
  monday_low:      1.07950,
  monday_aligned:  false,             // within 10 pips of Mon H/L

  // Analysis dimensions (auto-populated)
  asia_range_pips: 29.0,
  range_bucket:    'small',           // tiny|small|medium|large|huge
  level_zone:      'outer_pos',       // deep_neg|outer_neg|inner|outer_pos|deep_pos
  dow:             'Fri',             // Mon|Tue|Wed|Thu|Fri
  session_filled:  'London',          // Asia|London|Overlap|NY

  // For chart modal
  fib_data: [{ level, price, hasConfluence, isTight, isKey }, ...],  // all 45 levels
}
```

### Range buckets
| Bucket | Asia range |
|--------|-----------|
| `tiny` | < 20 pips |
| `small` | 20–40 pips |
| `medium` | 40–70 pips |
| `large` | 70–120 pips |
| `huge` | > 120 pips |

### Level zones
| Zone | Fib level range |
|------|----------------|
| `deep_neg` | < −2 |
| `outer_neg` | −2 to 0 |
| `inner` | 0 to 1 |
| `outer_pos` | 1 to 2 |
| `deep_pos` | > 2 |

---

## Server routes (`server.js`)

Data directory: `VolRangeForecaster/data/asia/` — files named `asia_bt_<ISO>.json`

### `POST /api/asia-range-backtest/run`
Starts an async backtest job. Body (JSON):
```json
{
  "dateFrom": "2023-01-01",
  "dateTo":   "2024-12-31",
  "pairs":    ["EURUSD","GBPUSD"],   // omit for all 26
  "confluenceThreshPips": 2.0,
  "tightPct": 10.0,
  "levelFilter": "tight",
  "tradeZone": "outside",
  "slMult": 0.5,
  "tpMode": "0.5",
  "tradeHourFrom": 6,
  "tradeHourTo": 14
}
```
Response: `{ jobId: "abc123" }`

### `GET /api/asia-range-backtest/status/:jobId`
Poll until `done: true`.
```json
// while running
{ "ok": true, "done": false, "currentPair": "GBPUSD", "progress": "5/26" }

// on completion
{ "ok": true, "done": true, "message": "...", "file": "asia_bt_2024...json", "log": [...] }
```

### `GET /api/asia-range-backtest/trades`
Returns the latest saved backtest file:
```json
{
  "ok": true,
  "file": "asia_bt_20240315T120000.json",
  "trades": [ ...Trade[] ]
}
```

---

## Backtest UI (`asia-range-backtest.html`)

### Run bar controls
| ID | Label | Values |
|----|-------|--------|
| `arFrom` / `arTo` | Date range | ISO date pickers |
| `arPair` | Pair | All 26 + "All pairs" |
| `arLevelFilter` | Level filter | tight / confluence / all |
| `arTradeZone` | Trade zone | outside / both |
| `arTpMode` | TP target | midpoint / range edge |
| `arSlMult` | SL multiplier | 0.25–2.0 |
| `arConfluencePips` | Confluence pips | threshold for match |
| `arTightPct` | Tight % | % of threshold for tight |
| `arHourFrom` / `arHourTo` | Trade window | UTC hours |

### Output sections
- **8 KPI cards:** Trades, Win rate, Expectancy, Profit factor, Total P&L, Avg win, Avg loss, Max drawdown
- **Equity curve** (Chart.js)
- **Monthly return heatmap**
- **Per-instrument table** (N, Win%, Expect, PF)
- **Per-fib-level table**
- **DOW bar chart**
- **Session breakdown table**
- **Paginated trade log** with filters (pair / side / outcome / confluence type)

### Day-view chart modal
- Click the chart icon on any trade row
- Loads all M1 bars for that day + pair using `loadM1ForPair`
- Shows **all filled trades for that day** simultaneously
  - Focused trade: solid bright arrow marker
  - Other trades: dimmed circle with fib level label
- All entry / TP / SL price lines drawn (de-duped by price)
- **← →** arrow keys or **‹ ›** buttons to cycle through day trades
- Modal header: "Trade X of Y"
- Chart library: Lightweight Charts v4.2.0

---

## Analysis engine (`asia-range-analysis.html`)

**Self-contained client-side page.** Reads from `GET /api/asia-range-backtest/trades` — the same endpoint the backtest page writes to. Every backtest re-run automatically updates the analysis on next page load.

### Global filter strip
7 independent filters — all panels re-render instantly on change:

| Filter | Options |
|--------|---------|
| Pair | All 26 pairs |
| Confluence | All / Tight only / Regular / None |
| Session | All / Asia / London / Overlap / NY |
| DOW | All / Mon–Fri |
| Range size | All / tiny / small / medium / large / huge |
| Zone | All / deep_neg / outer_neg / inner / outer_pos / deep_pos |
| Monday aligned | Either / Yes / No |

After filtering, 6 stat chips show: filtered N, win rate, expectancy, PF, total P&L, Sharpe proxy.

### Panel 1 — Conditional pivot heat map
- Pick any **X axis** and **Y axis** from 7 dimensions
- Pick **metric**: Win Rate % / Expectancy / Profit Factor / Sample Size
- Cells coloured green (positive) → red (negative) scaled to min/max across the table
- Cells with < 3 trades show `—`
- Sub-label shows N for non-N metrics
- Dimension ordering is explicit (logical sequence, not insertion order)

### Panel 2a — MFE distribution (optimal TP)
- Bar chart for thresholds: 0.25R, 0.5R, 0.75R, 1R, 1.5R, 2R, 3R
- Each bar = % of filled trades whose MFE reached that threshold
- Also shows % of winners that reached each level
- **Suggested TP**: threshold with highest simulated expectancy

### Panel 2b — MAE distribution (tightest safe SL)
- Bar chart for thresholds: 0.1R, 0.2R, 0.3R, 0.5R, 0.75R, 1R, 1.5R
- Each bar = % of trades whose MAE exceeded that threshold
- **Tightest safe SL**: tightest SL where 80%+ of winners survive

### Panel 3 — Best setup finder
- **Group by**: multi-select any combination of dimensions
- **Rank by**: Expectancy (default) / Win Rate / Profit Factor / Sharpe proxy
- **Min trades**: discard combos below threshold (default 15)
- Shows top 50 rows
- Rank badges: ★ #1 (green), ▲ #2 (blue), ◆ #3 (amber)
- Columns: dimension values, N, Win%, Expect, PF, Total P&L, Sharpe

### `sliceStats(trades)` helper
Core stats function used by all panels:
```js
{ n, nTotal, winRate, expectancy, pf, totalPnl, sharpe }
```
All metrics are based on `pnl_pct` values from filled trades only.

---

## Data pipeline

```
M1 packed TypedArray data (R2 / local / Google Drive)
         ↓  loadM1ForPair()
asiaRangeEngine.js  →  simulateDay()  →  walkLimitOrder()
         ↓
Trade[] with all schema fields
         ↓
server.js saves to VolRangeForecaster/data/asia/asia_bt_<ISO>.json
         ↓
GET /api/asia-range-backtest/trades
         ↓  same endpoint, two consumers:
asia-range-backtest.html          asia-range-analysis.html
(equity curve, heatmap,            (pivot, MFE/MAE,
 trade log, chart modal)            setup finder)
```

---

## Instruments (26)

```
eurusd  gbpusd  usdjpy  audusd  nzdusd  usdcad  usdchf
gbpjpy  eurjpy  eurgbp  euraud  eurcad  eurchf  eurnzd
audjpy  audnzd  audcad  audchf
gbpaud  gbpcad  gbpchf  gbpnzd
cadjpy  chfjpy  nzdjpy  gold
```

Pip sizes: 0.0001 for all except JPY pairs (0.01) and XAUUSD (1.0).

---

## Suggested workflow

1. Open `asia-range-backtest.html`, set date range and parameters, click **Run**.
2. Wait for all 26 pairs to complete (progress shown per pair).
3. Review equity curve, monthly heatmap, per-fib and per-pair tables.
4. Click any trade's chart icon to open the day-view modal — use ← → to cycle trades.
5. Open `asia-range-analysis.html` (topbar `📊 Analysis` button) — data loads automatically.
6. In Global Filters, narrow to a specific pair or confluence type.
7. Pivot heat map: set X = Fib Level, Y = Session — spot green clusters.
8. Apply those conditions as Global Filters; read Panel 2 for optimal TP/SL sizing.
9. Panel 3: group by Fib Level + Confluence + Session, rank by Expectancy — note ★ combo.
10. Return to backtest, tighten filters to that setup, re-run and compare equity curve.

---

## Key files at a glance

```
MacroFXModel/
├── js/
│   ├── asiaRangeEngine.js          ← engine (edit this for strategy changes)
│   └── volBacktestM1Engine.js      ← M1 data loader (shared with vol backtest)
├── asia-range-backtest.html        ← backtest UI
├── asia-range-analysis.html        ← probability analysis UI
├── server.js                       ← Express routes (search ASIA_BT_DATA_DIR)
├── index.html                      ← nav links in Backtests dropdown
└── VolRangeForecaster/
    └── data/
        └── asia/
            └── asia_bt_<ISO>.json  ← saved backtest results
```

---

## Extension points

- **Add a new fib level:** add to `FIB_LEVELS` array in `asiaRangeEngine.js`
- **Change session hours:** `tradeHourFrom` / `tradeHourTo` options, or edit defaults in `simulateDay`
- **New trade entry rule:** extend the fib loop in `simulateDay` before the `walkLimitOrder` call
- **New analysis dimension:** add a `case` to `getFeature()` in `asia-range-analysis.html` and add the field to the trade record in `simulateDay`
- **New pivot metric:** add an `option` to `#pvMetric` and handle it in `renderPivot()`
- **New MFE/MAE bucket:** add to `MFE_BUCKETS` or `MAE_BUCKETS` arrays in the analysis page

---

## Open PRs / branch

- Branch: `claude/asia-range-trading-strategy-ahj07u`
- PR #251 open (draft): help guide for analysis page
- Previous PRs #248 (server routes), #249 (nav link), #250 (day-view modal + analysis engine) — all merged to `main`
