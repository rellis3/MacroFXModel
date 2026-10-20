# CVOL scrape: is it feasible? (2026-10-21)

This is a feasibility check only. Nothing has been built.

## What the existing OI scraper does

- `oi_recon/pull_quikstrike.py`, `fetch_oi.py`, `run_daily.py` and `run_sweep.py` drive a real Chrome through
  Playwright. Chrome uses a persistent profile (`oi_recon/.chrome-profile/`, gitignored). The login is done
  **by hand**, once, through `recon.py --login`, and the script then reuses that session's cookies.
  The scraper does not try to evade detection: no UA rotation, no proxies.
- QuikStrike is an iframe on `cmegroup-tools.quikstrike.net`, loaded inside the cmegroup.com wrapper page
  `tools-information/quikstrike/open-interest-heatmap.html`. Products are picked by `pid`/`pf`
  (`quikstrike_ids.json`).
- The settlement JSON comes from an in-page `fetch` to `https://www.cmegroup.com/CmeWS/mvc/Settlements/Options`.
  The fetch runs from the page's own origin so that the session cookies go with it.

## Can the same session reach CVOL?

- **Not through QuikStrike.** The capture of 2026-07-29 (`oi_recon/out/2026-07-29/record/`) holds the full
  QuikStrike tool menu, 25 tools. None of them is CVOL. CVOL sits on cmegroup.com under
  `market-data/cme-group-benchmark-administration/cme-group-volatility-indexes.html`, and that page is linked
  from the same site nav.
- **Plain scripted requests are blocked.** On 2026-10-21, `curl` to the CVOL overview page and to the index pages
  returned HTTP 403 with this body: *"This IP address is blocked due to suspected web scraping activity… strictly
  prohibited by CME Group's website Data Terms of Use."* WebFetch timed out. So **I could not confirm a history JSON
  endpoint from here.** The CVOL index pages draw their charts from a CmeWS endpoint. The way to find it is the
  method `recon.py --browse` already uses: open one CVOL index page in the logged-in Chrome and record every JSON
  response the page fetches itself. That is one page load, done by hand once.
- **Other QuikStrike tools worth recording in the same pass:** `volatility-term-structure`, `treasury-analytics`
  and `short-term-interest-rate-analytics`. These may give ATM IV for SR3 and ZN without going through CVOL.

## Products (from CME docs; not checked against a live page)

| Asset | Tickers | Notes |
|---|---|---|
| Treasury, yield vol | TUVY, FVVY, TYVY, USVY | 2y/5y/10y/30y. Price-vol versions end in `VL` (TYVL…). TVL is the curve composite |
| SOFR | SRVL | the 3M SOFR CVOL |
| FX | EUVL, JPVL, GBVL (plus AUD/CAD/CHF) | the local parquet has these as EURUSD/USDJPY/… |
| Metals | GCVL | |
| Energy | CLVL | |
| Equity (NQ/ES) | **not found** | no CME doc or search result confirms an equity-index CVOL. For NQ, use VXN (Cboe) or the QuikStrike settlement IV already in `oi_store` |

Every index carries the same auxiliary fields: CVOL, UpVar, DnVar, Skew, SkewRatio, ATM, Convexity, Underlying.

## History depth

- The public pages show a chart only. CME licenses up to about 9 years of EOD history per index through **CME
  DataMine** ("CVOL End of Day Index"). An intraday product also exists.
- `data/cvol/cme_cvol_eod.parquet` is 16,657 rows with `source=CME_CVOL_EOD_SETTLE`, in the DataMine field layout.
  It holds **FX and gold only**: EURUSD, GBPUSD, USDJPY and XAUUSD from 2016-01-04, and AUDUSD, USDCAD and USDCHF
  from 2018-10-01, all to 2026-08-20. No rates.
- Where it came from: commit 7175f6ff (2026-08-21) says *"the owner's uploaded CME CVOL EOD export"*.
  It was converted by `scripts/convertCmeCvol.py` into `js/data/cmeCvolEod.json`. No fetch script exists anywhere
  in the repo or the sibling projects. **If you can get another export from the same source, it can include
  TYVY/SRVL etc.**, because those tickers are in the same DataMine product. That is the cheapest route to rates
  CVOL history and should be checked first.

## Auth and ToS

- A cmegroup.com login, the same as for OI. The DataMine route needs a paid DataMine licence.
- **ToS:** cmegroup.com's Data Terms of Use forbid automated retrieval, and the 403 above shows the IP is already
  flagged. A CVOL scrape carries the same legal exposure as the nightly OI capture. It also adds a practical risk:
  more automated hits from this IP make it more likely that the session the OI capture **depends on** gets blocked.
  The sanctioned options are: (a) a fresh DataMine export or quote for CVOL EOD, (b) the IBKR/Databento
  settlement-IV routes in this folder.

## Minimal implementation, if you choose to scrape anyway

1. **One-time discovery:** run `recon.py --browse` on a single CVOL index page in the existing profile, and write
   the endpoint and payload shape into `oi_recon/README.md`. If the endpoint returns full history, pull the
   history once (one request per ticker) and stop there. After that only a daily append is needed.
2. **File:** `oi_recon/fetch_cvol.py`. It reuses `pull_quikstrike._launch` and the existing profile, and does one
   in-page fetch per ticker for about 12 tickers, serialised, with a 1.5 s delay (the `fetch_oi.py --delay` default).
3. **Schedule:** a stage at the end of `run_daily.py`. It runs after the OI capture, inside the same browser lock and
   the same session, so it adds no extra logins or browser launches. A CVOL failure must never fail the OI verdict,
   so it reports its own line in the summary.
4. **Storage:** raw JSON goes to `oi_recon/out/<date>/cvol/`, appended to `data/cvol/cvol_daily.parquet`
   (key: date × ticker). Add a KV key `cvol_store` only if a page needs it. That key must be registered in
   `isAllowedKVKey` **and** `PERMANENT_KEYS`, because a key missing from `PERMANENT_KEYS` silently gets a 48h TTL.
5. **Failure guards.** The OI scraper's known fault is failing silently, so every guard compares against yesterday:
   - The as-of date must advance against the last stored row on each trading day, using the trading calendar,
     not raw weekdays.
   - If every ticker is unchanged from yesterday, that uniformity means the capture is stale, not a quiet market.
     Mark it FAILED.
   - Range sanity per ticker (for example, SRVL and TYVY must be > 0 and below 5× their 1-year median). A login
     page served in place of JSON means a parse failure, which exits non-zero.
   - Alert through the Railway-side Telegram path with a server-side freshness streak, the same way
     `oiFreshnessStreak` does. The local script cannot see weekends or holidays.
