# Vol & Range Forecaster — Reference Document

> Context for backtesting integration. Covers methodology, constants,
> file locations, API, and design decisions made during build.

---

## What It Does

Produces a daily **expected range forecast** for 10 instruments:

- **GOLD** (XAU_USD)
- **NQ** (NAS100_USD — Nasdaq 100 CFD)
- **EURUSD, GBPUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF, GBPJPY**

For each instrument it outputs:
- Annualised volatility %
- High–Low range: **median** and **75th percentile** (as % of price)
- Open–Close move: **median** and **75th percentile** (as % of price)

Example output format:
```
**VOL & RANGE FORECAST**
**For session: MONDAY, June 1, 2026**

──── GOLD ───────────────────
Volatility (annualized) : 21.38%
High to Low range       : 2.12% median · 2.73% 75th Percentile
Open to Close move      : 1.06% median · 1.80% 75th Percentile
```

---

## Methodology

### 1. Volatility — Garman-Klass EWMA

Applied to daily **OHLC bars** (not just closes).

```
gk_t  = 0.5 · [ln(H/L)]² − (2·ln2−1) · [ln(C/O)]²
v_t   = λ · v_{t-1} + (1−λ) · gk_t      λ = 0.94
σ_t   = √v_t
σ_annual = σ_t × √252
```

- One-step-ahead forecast: last value of the GK-EWMA series
- Seeded from mean GK variance of first 20 bars — no transient
- ~800 daily bars fetched (~3 years) from Oanda (mid-price OHLC)

**Why Garman-Klass over close-to-close EWMA/GARCH?**
Close-to-close vol only captures the overnight change between closes.
For gold (large intraday H-L ranges that often partially reverse by close),
this systematically understates realized vol by 25–35%. The GK estimator
uses the full bar (O, H, L, C) and is 5–8× more statistically efficient than
close-to-close. This closes the gap between our estimates and professional
quant systems that use range-based vol estimation.

### 2. High–Low Range — Analytical Brownian Motion

Percentiles of `(H−L)/σ` for a standard Brownian motion on [0,1].
Derived from BM range theory (Feller 1951).

```
HL_median = 1.572 × σ_daily × news_mult
HL_75th   = 2.049 × σ_daily × hl_75_corr × news_mult
```

### 3. Open–Close Move — Half-Normal Distribution

Percentiles of `|O−C|/σ` for `|N(0,1)|`.

```
OC_median = 0.6745 × σ_daily × oc_corr × news_mult
OC_75th   = 1.1503 × σ_daily × oc_corr × news_mult
```

### 4. Per-Asset-Class Corrections

Calibrated from reference data (May 2026). Account for overnight gap
behaviour between asset classes.

| Asset class | `hl_75_corr` | `oc_corr` | Rationale |
|-------------|-------------|-----------|-----------|
| `commodity` | 0.989       | 1.163     | Futures overnight gaps inflate OC (+16%) |
| `index`     | 0.950       | 1.111     | Equity futures, moderate gap (+11%) |
| `fx`        | 0.894       | 0.948     | 24h spot trading, fewer gaps (−5%) |

### 5. News Multiplier (optional)

Applied to all range outputs. Sourced from Finnhub economic calendar
(`FINNHUB_KEY` env var). Falls back to 1.0 if no key / no event found.

| Event      | Multiplier |
|------------|-----------|
| FOMC Rate  | ×1.35     |
| NFP        | ×1.30     |
| CPI        | ×1.25     |
| PCE        | ×1.20     |
| GDP / PPI  | ×1.15     |

---

## Constants Summary (use these in backtester)

```js
// Garman-Klass EWMA
EWMA_LAMBDA   = 0.94
GK_ADJ        = 2*ln2 - 1  // ≈ 0.3863
TRADING_DAYS  = 252

// GK variance per bar: gk = 0.5·ln(H/L)² − GK_ADJ·ln(C/O)²

// BM range percentiles
BM_RANGE_P50  = 1.572   // HL median multiplier
BM_RANGE_P75  = 2.049   // HL 75th multiplier (before class correction)

// Half-normal OC percentiles
HN_P50        = 0.6745  // OC median multiplier
HN_P75        = 1.1503  // OC 75th multiplier

// Asset-class corrections
commodity: { hl_75_corr: 0.989, oc_corr: 1.163 }
index:     { hl_75_corr: 0.950, oc_corr: 1.111 }
fx:        { hl_75_corr: 0.894, oc_corr: 0.948 }
```

Formula in full:
```
σ_d    = σ_annual / √252

HL_med = 1.572 × σ_d × news_mult
HL_75  = 2.049 × hl_75_corr × σ_d × news_mult
OC_med = 0.6745 × oc_corr × σ_d × news_mult
OC_75  = 1.1503 × oc_corr × σ_d × news_mult
```

All outputs are **percentages of price** (e.g. 2.12% means 2.12% of the
open/current price for that session).

---

## File Locations

| File | Purpose |
|------|---------|
| `js/volForecast.js` | Core math engine (pure functions, no I/O) |
| `js/volForecastScheduler.js` | Data fetch, scheduler, KV persistence |
| `VolRangeForecaster/vol_range_forecast.py` | Standalone Python version |
| `VolRangeForecaster/validate_vs_reference.py` | Accuracy validation script |
| `VolRangeForecaster/test_forecast.py` | Unit tests |
| `vol-forecast.html` | Dashboard UI |

---

## Data Source

**Primary: Oanda v20 REST API** (if `OANDA_KEY` env var is set)

```
GET /v3/instruments/{instrument}/candles
    ?granularity=D&count=800&price=M
Authorization: Bearer {OANDA_KEY}
```

Returns mid-price OHLC candles. Filter `complete: true` only.

Instrument mapping:

| Name   | Oanda           | Yahoo fallback |
|--------|-----------------|----------------|
| GOLD   | `XAU_USD`       | `GLD`          |
| NQ     | `NAS100_USD`    | `NQ=F`         |
| EURUSD | `EUR_USD`       | `EURUSD=X`     |
| GBPUSD | `GBP_USD`       | `GBPUSD=X`     |
| USDJPY | `USD_JPY`       | `USDJPY=X`     |
| AUDUSD | `AUD_USD`       | `AUDUSD=X`     |
| NZDUSD | `NZD_USD`       | `NZDUSD=X`     |
| USDCAD | `USD_CAD`       | `USDCAD=X`     |
| USDCHF | `USD_CHF`       | `USDCHF=X`     |
| GBPJPY | `GBP_JPY`       | `GBPJPY=X`     |

**Yahoo Finance** is used as fallback when `OANDA_KEY` is not set.

---

## Scheduling / Timing

- **Daily run: 22:00 UTC, Mon–Fri** (after US session close)
- Forecast is computed for the **next trading session** (e.g. after
  Friday's close, computes Monday's forecast using Friday's close data)
- Before 22:00 UTC: site serves the forecast for the **current session**
  (computed the previous night)
- Env var `VOL_FORECAST_UTC` overrides the 22:00 default

**Session labelling convention:**
- `session_date` / `session_label` = the trading day being forecasted
- e.g. after Friday 22:00: label = "MONDAY, June 1, 2026"

---

## API Endpoint

```
GET  /api/vol-forecast           → latest forecast JSON
GET  /api/vol-forecast/history   → last 5 sessions
POST /api/vol-forecast/refresh   → trigger manual recompute
```

### Response shape (`GET /api/vol-forecast`)

```json
{
  "ok": true,
  "session_date":  "2026-06-01",
  "session_label": "MONDAY, June 1, 2026",
  "computed_at":   "2026-05-29T22:05:13.000Z",
  "instruments": {
    "GOLD": {
      "vol_annual": 21.38,
      "hl_median":  2.12,
      "hl_75":      2.73,
      "oc_median":  1.06,
      "oc_75":      1.80,
      "news_mult":  1.0
    },
    "EURUSD": { ... },
    ...
  },
  "meta": {
    "dow_label":   "Monday",
    "news_flag":   null,
    "news_mult":   1.0,
    "data_source": "oanda"
  }
}
```

All `vol_annual`, `hl_*`, `oc_*` values are **percentages**.

---

## Backtesting Notes

### Converting forecast % to price levels

```
price_level = entry_price × (1 ± range_pct / 100)

e.g. EURUSD entry 1.0850, HL median 0.48%:
  upper = 1.0850 × 1.0048 = 1.0902
  lower = 1.0850 × 0.9952 = 1.0798
```

### What each output means statistically

- **HL median (50th pct)**: on 50% of sessions the actual High–Low range
  will be *smaller* than this. The market will be *quieter* than forecast
  half the time.
- **HL 75th pct**: on 75% of sessions the range fits inside this value.
  Useful as a "typical active session" bound.
- **OC median**: expected absolute close-to-open drift (direction unknown).
- **OC 75th**: 75% of sessions close within this % of the open.

### Accuracy vs reference system

Validated against a reference quant system (Friday May 29, 2026):

| Metric | Mean absolute error |
|--------|-------------------|
| H–L median / 75th, O–C median / 75th | **< 1%** when fed same vol input |

Vol input accuracy depends on data source alignment. With Oanda data:
- NQ: ~2% off (very close)
- FX pairs: 5–14% off (data source / close time differences)
- GOLD: historically ~20% off on GC=F (roll distortion); XAU_USD much better

### Key caveat for backtesting

The forecast for session X is computed at 22:00 UTC on the day before X,
using close data through the previous session. A backtester should:

1. Look up the forecast stored for `session_date = date_of_bar`
2. Compare actual `(H−L)/close` and `|O−C|/close` to forecast percentiles
3. Score: did actual range fall inside the 50th/75th pct bands?

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OANDA_KEY` | Recommended | Oanda v20 API key (enables primary data source) |
| `OANDA_ENV` | No | `live` (default) or `practice` |
| `FINNHUB_KEY` | No | Enables news multiplier detection |
| `VOL_FORECAST_UTC` | No | Override daily run hour (default: `22`) |
