# Instruments: keys, symbols, pips, sources

The canonical registry is `js/instrumentRegistry.js` (JS) and `pylego/instruments.py` / `instruments.json` (Python),
kept in sync by `node scripts/gen_instruments_json.mjs`. Always go through `resolveKey()` / `resolve_key()` rather than
string munging.

## Naming

| Context | Example |
|---|---|
| Canonical storage key | `eurusd` (lowercase): names `m1/{key}_m1.parquet`, `m1-tail/{key}.json` and the book |
| OANDA | `EUR_USD`, `XAU_USD`, `NAS100_USD`, `DE30_EUR` |
| MT5 | `EURUSD` |
| Display | `EUR/USD` |

**Index spellings differ by place.** The registry uses `spx`, `dax`, `ftse`. Parquet and forge use `spx500`, `de30`,
`uk100`, `us30`, `us2000`. `fetch_m1_oanda.py` carries both (`dow`/`us30`, `spx`/`spx500`, `dax`/`de30`,
`xauusd`/`gold`). Aliases are in `EXTRA_ALIASES` (e.g. `us2000`→`rut`, `de30`→`dax`). The registry's `dax` display
string is `DE30_USD` while OANDA's symbol is `DE30_EUR`. `forge/vol.py` `FX_ROOT_SKIP = {dow, spx, nq, gold.bak}` skips
alias duplicates. `forecastLadderParams` keys SPX500/US30 vs SPX/DOW mismatch is a known live issue.

## Pips and point values

| Class | Pip |
|---|---|
| FX | 0.0001 |
| JPY crosses | 0.01 |
| Gold | **1.0** (0.1 is a bug, fixed 2026-08-24, pinned by `js/reconcile.test.mjs`) |
| Indices | 1.0 point |

`pylego/point_values.json`: a missing entry falls back to pip 0.0001 / pv 10, which can size 100× wrong. chfjpy and
euraud were missing at last check.

## Universe and σ source

| Instruments | Live σ | Research history |
|---|---|---|
| 27 FX (live runs 22), GOLD | OANDA mid | OANDA M1 (`VolRangeForecaster/data/m1`) |
| NQ | Yahoo NQ=F (futures, matches OANDA, ratio 1.02) | OANDA M1 (`portfolioBacktest/cache`) |
| SPX500, US30, US2000, DE30, UK100 | OANDA NY-close bars for ladders since 2026-10-06 (Yahoo cash σ ran 14–28% low) | OANDA M1 (`portfolioBacktest/cache`) |
| BTCUSD | Yahoo | none |
| Non-gold commodities | OANDA | none local |

Downloader coverage differs: `r2_download.py` and `refresh_m1.py` have 26 instruments; nzdcad and cadchf come only from
`fetch_m1_oanda.py`. Nothing automates the index cache.

SPX500 has 95 short days (< 600 M1 bars, mostly US half-days). Check them before using intraday paths. Gold and index
gaps are exchange holidays (Good Friday, DE/UK bank holidays).
