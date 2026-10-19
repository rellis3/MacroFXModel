# Data sources: where data lives and how it gets there

Env var **names** only (never print values): `OANDA_KEY`, `OANDA_ENV`, `OANDA_ACCOUNT_ID`, `R2_ACCESS_KEY`,
`R2_SECRET_KEY`, `R2_BUCKET` (+ `R2_ENDPOINT`, `R2_KEY_PREFIX` in JS), `FRED_KEY`. OANDA is reachable from Railway but
returns 403 from the sandbox; use `railway run …` where a script says so.

**In a cloud session the M1 caches are usually absent.** The SessionStart hook runs `scripts/r2_download.py`, which
exits with an error if the R2 vars are unset. Check `ls VolRangeForecaster/data/m1` before assuming data exists, and tell
the user if it doesn't rather than silently switching source.

## M1 price history

| Store | Path | Schema | Filled by |
|---|---|---|---|
| Research M1 (FX + gold) | `VolRangeForecaster/data/m1/{pair}_m1.parquet` | `open, high, low, close` f64, `volume` i64, `time` (UTC naive); BAM files add `bid_*`/`ask_*` **after** `time` | `scripts/r2_download.py` (R2 `r2-storage`, `m1/{pair}_m1.parquet`; 26 instruments; skips files > 10 KB, so it **never refreshes**), `scripts/fetch_m1_oanda.py` (`--years 5`, **use `--price M`**, `--no-upload` to avoid R2 writes), legacy `scripts/download_m1_parquets.sh` (gdown) |
| Index M1/H1/H4/D1 | `portfolioBacktest/cache/` (~2.4 GB, gitignored) | — | copied in by hand; `forge/vol.py` `INDEX_PAIRS = nq, spx500, de30, uk100, us30, us2000` |
| AnalogML M1 | `AnalogML/data/m1/{pair}_m1.parquet` | DatetimeIndex `datetime` (tz UTC), OHLCV | `AnalogML/refresh_m1.py` (incremental, atomic writes, mirrors to R2 `analogml/m1/`). Split from the research dir on 2026-08-17 after a schema collision; **it does not top up the research cache** |
| Holdout forward block | `data/m1_forward/<sym>_m1.parquet` + `manifest.json` | as AnalogML + bid/ask | `railway run python scripts/fetch_m1_forward.py`: post-2026-08-20 bars, download only, never scored |
| Nightly tail | R2 `m1-tail/{key}.json` | — | merged automatically by `loadM1ForPair` (lockbox risk, see `lookahead-and-oos.md`) |

`fetch_m1_oanda.py` notes that mid OHLC is not the exact midpoint of bid/ask; take spread from the raw bid/ask columns.

## Daily bars

- Live σ: OANDA `granularity=D`, 800 bars, 17:00 NY (`fetchD1Aligned` in `js/volBacktestEngine.js`).
- Research σ: NY-close bars from M1. `node scripts/rangebook/ny_close_d1.mjs NAME:fileKey ...` →
  `analysis/output/ladder_candidates/d1/<NAME>.json` (`[{d,o,h,l,c}]`, n ≥ 60).
- **Not for σ:** `VolRangeForecaster/data/m1/*_d1.parquet` (UTC days with Sunday stubs).

## Implied vol and options

- CME settlement IV inversion: `oi_research_book/data/iv_daily_{aud_usd,eur_usd,gbp_usd,nas100_usd,usd_cad,usd_chf,usd_jpy}.parquet`
  (2020-09 →). Also `gamma_iv_*`, `surface_*`, `wall_summary_*`, `daily_master_*`. Built from R2 `OI Data/*.csv` by
  `oi_research_book/scripts/01_build_daily_dataset.py`.
- OI archive: `OI Data/NAS100_USD.csv` (1,521 days).
- CBOE: `analysis/surfaces/cboe/` (GVZ `DATE,GVZ`; VIX, VIX1D, VIX3M, VIX6M, VIX9D, VXN `DATE,OPEN,HIGH,LOW,CLOSE`).
  Dates are **MM/DD/YYYY**. Ended 10/02/2026 at last check.
- Live: QuikStrike capture. GVZ is also fetched from FRED in the HAR-IV shadow.
- **Cboe full chains (2026-10-19 →)**: R2 `cboe_raw/<SYM>/<YYYY-MM-DD>.json`, every contract once a day after the close
  (server.js `_cboeRawArchiveTick`, flag `cboeRawArchive`) for SPX, NDX, RUT, DJX, XSP, VIX, SPY, QQQ, IWM, DIA, GLD, SLV,
  USO, TLT, HYG, FXE, FXY, UUP (~11 MB/day). KV `cboe_raw_<SYM>_<date>` only as the no-R2 fallback (indices). Read via
  `/api/cboe-raw?sym=QQQ&date=`. `open_interest` is the start-of-day (prior-close) figure; prices/IV/greeks are the
  15-min-delayed close. No history before the first capture. ETF options dominate equity dealer gamma (QQQ ≈ 3× NDX,
  ≈ 17× CME NQ on 2026-10-16): a CME-only or index-only gamma read is a small slice.

## Economic calendar

- `calendar_events.csv` (root): 102,760 rows, `date,datetime_raw,country,ccy,impact,event,actual,previous,consensus`,
  2014-01-02 → **2026-07-02**. Read as **latin-1**. Impact tiers Major / Moderate / Standard.
- `forge/ff_calendar.py`: repaired ForexFactory history, 2007 → **2025-04-07**, different taxonomy (e.g. Building Permits
  is Major in the csv and Low in FF). Live ladder multipliers were fitted on FF.
- Live: ForexFactory feed (`js/econCalendar.js`).
- **Continuation (2026-07-03 →)**: `calendar_events_nasdaq.csv` (root), Nasdaq's free economic-events API via
  `scripts/calendar/fetch_nasdaq_calendar.py`, all countries, UTC times, extra columns `source,impact_src,status`.
  Refreshed twice a week by `.github/workflows/calendar-refresh.yml` (7 days ahead as `scheduled` rows). **Different
  event names** ("Nonfarm Payrolls", not "Payroll Jobs Growth") and keyword-assigned impact (`impact_src=keyword`).
  Load both with `load_calendar()` from that script; never match a literal event name across the 2026-07-02 seam.
  The old file has ~46k exact duplicate rows (faults-log #11).
  Nasdaq reuses one name for some MoM/YoY pairs (two "CPI" rows at the same minute): tell them apart by value scale.
- After coverage ends, tags are unknown. Exclude them (`forge/vol.py` `tag_column(covered=...)`) and pass `end=` to
  `load_daily`.

## FRED

- Point-in-time: `railway run python scripts/fetch_fred_vintages.py [series…]` → `data/iep_macro/<id>_vintages.csv`
  (`date,value,realtime_start,realtime_end`). Needs `FRED_KEY`.
- Series health: `node scripts/audit_fred_series.mjs [out.json]` (no key). Traps: a discontinued series doesn't error;
  `fredgraph` silently falls back to the base series for an unknown suffixed ID; a live ID can be the wrong measure
  (`CANSLRTCR03GPSAM` is car registrations, not retail sales).
- Units: RRPONTSYD is in **billions**; WALCL/TGA are in **millions**.
- Publication lags used so far: WALCL 8d, TGA 2d, RRP 1d, HY OAS 1d.

## Index σ source (live)

NQ uses NQ=F futures (fine). SPX500, US30, US2000, DE30 and UK100 use OANDA NY-close bars for the ladder family since
2026-10-06 (`ladder_sigma_source: 'oanda'`). Yahoo cash-index σ was 14–28% low. The Yahoo-σ ladder is kept as
`ladder_yahoo`, and the incumbent range bands stay on Yahoo. BTCUSD and non-gold commodities have no research history.
