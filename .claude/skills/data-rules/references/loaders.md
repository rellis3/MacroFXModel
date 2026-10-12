# Canonical loaders and helpers

Use these rather than writing a new loader. Each one has burned someone before; the gotchas are listed.

## JavaScript

| Helper | Where | Notes |
|---|---|---|
| `loadM1ForPair(pairKey, m1Dir)` | `js/volBacktestM1Engine.js:1532` | Order: R2 decoded snapshot (`m1-decoded/`) → raw R2 `m1/{key}_m1.parquet` → local `VolRangeForecaster/data/m1` → Google Drive, then **always merges** R2 `m1-tail/{key}.json`. Returns `{n, times (Int32 epoch s), opens, highs, lows, closes, volumes}`. Reads OHLCV as `r[0..4]` and time as the **last** column (the BAM trap). Some index files have BigInt volumes. |
| `bucketM1IntoSessions(packed, boundaryHour = 22)` | `js/forecastAnalyser.js:402` | Returns `Map(date → bars[])`. **Pass `'Europe/London'`**; the default is a 22:00-UTC broker day. |
| `nyCloseDailyBars(packed)` | `js/voteAtlasV4Lines.js:59` | `[{key, endSec, open, high, low, close, n}]`, 17:00 New York. `endSec` is when the bar becomes usable. Keep `n >= 60`. |
| `londonMidnightSec(now)` | `js/volBacktestEngine.js:120` (not exported) | UTC epoch of the latest 00:00 London. |
| `fetchSessionOpenLondon(instrument)` | `js/volBacktestEngine.js:139` (not exported) | First live M1 open at/after London midnight. For DE30/UK100 it's the market-open bar. |
| `fetchD1Aligned(instrument, count = 130, {dailyAlignment: 17, alignmentTimezone: 'America/New_York'})` | `js/volBacktestEngine.js` | Live OANDA D candles. |
| `auditUsable(sessionDate, auditedAt)` | `js/harShadowCore.js:90`, `js/dailyReadCore.js:101` (duplicated) | False when the audit's London date is after the session. Skip those records. |
| Forecast σ | `js/volForecast.js` / `js/forecastCore.js` | `js/vol.js` is retired; don't use it. HAR-800 = `forecastSigma(last 800 NY-close bars, 'har_rv_log')`. |
| Instruments | `js/instrumentRegistry.js` | `resolveKey()`, pip sizes, symbols (see `instruments.md`). |

## Python

| Helper | Where | Notes |
|---|---|---|
| `load_daily(pair, data_root="VolRangeForecaster/data/m1", day_start_hour=0, years=0, end=None, session="london22")` | `forge/vol.py:779` | Sessions `utc24`, `london24`, `london22` (default, production). `day_start_hour` is ignored. Use `end=` to stop at data/calendar coverage. **The index is the session start in naive UTC; re-key to the London date before joins.** `forge/run_iv_trades.py` documents a join that dropped every summer row (43% match share). |
| `load_m1(pair, root)` / `resample()` | `forge/bars.py` | Promotes `time` to the index, drops duplicate timestamps, NaN volume if missing. Resample labels left and drops empty bins. |
| `tag_column(covered=...)` / `load_event_tags` | `forge/vol.py` | Event tags. Uncovered dates → None and excluded. `load_event_tags` reads utf-8 with replace; the csv is latin-1. |
| `pylego/instruments.py` | `resolve_key`, `pip_size`, `oanda_symbol`, `yahoo_symbol`, `mt5_symbol`, `asset_class` | Kept in sync with JS via `node scripts/gen_instruments_json.mjs`. |
| `pylego.r2` | — | R2 access used by AnalogML. Read only from a sandbox. |

## General loading habits

- Read CSVs with `utf-8-sig` (BOM) and explicit date formats. CBOE dates are MM/DD/YYYY.
- Resample a faster series down to the slower series' release cadence, not the other way.
- Cross-asset values must be ≤ 15 min old with no forward fill. M15 bars are stamped at their open and are usable only
  after they close.
- Before any join, print the match share. A silent drop shows up there first.
