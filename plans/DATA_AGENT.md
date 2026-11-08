> **Status (2026-11-08, later): this file is the INVENTORY, the WATCH LIST and the QUESTION TEMPLATES.** The design in it (section 4)
> is superseded by [`RESEARCH_OPPORTUNITY_ENGINE.md`](RESEARCH_OPPORTUNITY_ENGINE.md) wherever they differ. Main differences: the scan
> runs on the owner's laptop in Python; there is **no daily cap** on questions (log the count scanned and correct for it); banked nulls are
> **not** queued as "context only" (the registry never labels, hides or demotes a question and the question writer never sees prior
> results); and the hand-off to research is an **Open case button**, never automatic. The lockbox rules, Holm/BH and the 2026-08-21
> cut-off below stand.
> **v2 note (2026-11-08):** the Benjamini-Hochberg unit in section 4.3 rule 4 changes from "question" to "hypothesis family" and Holm now spans a family's variants; see `RESEARCH_OPPORTUNITY_ENGINE.md` section 6.6. The lockbox rules and the 2026-08-21 cut-off are untouched (that file's section 8 maps them).

# Data Agent: inventory and design

*2026-11-08. Owner idea (tidied): a STANDALONE Data Agent, not one of the research agents. It watches the data from the
daily run, the backtests, and options open interest (OI), COT, volatility, rates and yield/spread pairs. It reads
current data, writes SUGGESTED QUESTIONS to a queue, and shows how each suggested question performed over history. The
owner (or later automation) sends a chosen question to a research case (librarian, researchers, Head) or straight to a
quick historical test. Stage 1 is rules only: percentiles, z-scores, extremes, divergences, regime shifts. No model
calls.*

*This is the inventory and design round. Nothing was built and no code was touched. Method: read the code and docs named
beside each claim, plus read-only GETs of production on 2026-11-08 (`/api/state`, `/api/data-archive/status`,
`/api/cboe-raw`, `/api/cot-extremes`, `/api/oi-store`, `/api/oi-history`, `/api/options-skew`, `/api/cvol`,
`/api/xccy-basis`, `/api/desk-pack`, `/api/research-pod/quick-test`, `/api/spread-episodes/live`). A claim marked
**(doc)** comes from a repo document and was not re-checked here; **(not verified)** means I could not check it. The
local M1 cache is absent in this cloud session (`VolRangeForecaster/data/m1` does not exist), so nothing M1-based was
inspected.*

**Rules that bind everything below** (data-rules, research-protocol, research-director, cog-knowledge): session = London
date; no lookahead (every statistic for day t uses data before t, strictly); the lockbox (sessions after 2026-08-21 are
H-A, nothing scores layers 3, 5, 6 on them; the one evaluation is `forge.lockbox_check --evaluate`, expected late
November 2026); every question is a trial; exploratory answers say so and are never banked as validated; a banked null
is not re-asked in new clothes; Evidence Book entries are written only through research-protocol.

---

## 0. Headline

1. **Most of what the owner named exists.** OI/GEX, COT, VIX family and other Cboe vol indices, MOVE, FRED yields and
   spreads, SOFR, credit, FX/gold/index prices, the daily-run outputs and the Evidence Book are all held. The best single
   entry point already built is `GET /api/state` (the Market State Engine, 343 KB, 10-minute cache): it already computes
   current value, 20/5-day change, percentile and span for about 100 readings. The Data Agent should read that document
   and the same R2 archive, not re-fetch anything.
2. **Several named things do not exist, or exist only as a few weeks of history** (section 1.12): a SOFR-vs-ICE-2 daily
   spread history beyond Apr-Oct 2026 intraday futures (it exists only as IBKR files and a laptop-pushed feed); cross-
   currency basis (laptop-only, prod route empty); FX options skew history (1 point); CME CVOL after 2026-08-20; Cboe
   option-chain history (16 days); CME rates-vol (SR3/ZN/ZT) 16 days; ICE credit spreads before 2023-10; EVZ (dead);
   per-day dealer gamma history on prod (the `options` layer of `/api/state` is empty today).
3. **The risk in this idea is statistical, not technical.** A rules engine that scans ~70 watch items daily and writes the
   extreme ones as questions is a forking-paths machine. The design answer (section 4.3) is a frozen watch list, a
   monthly full sweep of every item regardless of state (so a question's historical result is ranked against all items),
   the forward record from the suggestion date as the only real test, and scoring held back from H-A until the lockbox
   evaluation.
4. **Existing machinery runs perhaps a third of the question templates** (section 3). The quick test
   (`js/quickTest.js`) takes whitelisted daily closes for X and Y (78 series), tests X's walk-forward top/bottom quintile
   against Y's forward close change, and refuses under 750 overlapping days. It cannot test range (HL) outcomes, weekly
   COT, Cboe vol indices other than VIX/VXV/VXN/GVZ/OVX, or any series shorter than ~3 years. A "needs new runner"
   column is honest about that.

---

## 1. Data inventory

Columns: **Where** (R2 key / KV key / file / API route), **Read with** (the loader to use per data-rules; cloud-session
route if no local cache), **Freq**, **History** (first to last seen), **Freshness** (refresh path, last seen), **Caveats**
(point-in-time, faults), **Keys** (instrument / series keys).

### 1.1 The whole-state document (read this first)

| Item | Where | Read with | Freq | History | Freshness | Caveats | Keys |
|---|---|---|---|---|---|---|---|
| Market State Engine | `GET /api/state` (`js/stateRoutes.js`, `js/stateEngine.js`, `js/stateLayers.js`, `js/stateHistory.js`); plan `plans/MARKET_STATE_ENGINE_PLAN.md` | the route (pure builders are importable and tested) | built on request, 10-min cache | per reading: 3 years for most rates/credit, 1990 for VIX, 1970 for TNX (verified, `history.long`) | `generatedAt` 2026-11-08T19:00Z, `asOf` 2026-11-06 (verified) | Descriptive, never a signal. Its percentiles include today and use the full sample (`pctAll`): fine for description, **lookahead for a historical replay**; the agent must recompute causal percentiles. One input error today: `rate_diff_v1` store "not built yet". `layers.options` is empty today. Unit label for yields says "bp" while values are percent (cosmetic) | tiers (rates, credit, fx, equities, vol), drivers, `layers.{vol,positioning,options,liquidity}`, `assets.{credit,gamma,internals}`, `plumbing`, `history.{long,fx,cot,surprises}`, `regimes`, `edges` |
| Desk Pack (the daily run's input) | `GET /api/desk-pack` (2.7 MB); KV `desk_pack_index` | the route | built each desk run (weekdays from 06:55 London, `deskRun` in `_AI_JOBS`) | single day | `date` 2026-11-08, 134 feeds: 124 ok, 6 stale, 4 empty (verified) | Names its own gaps (`dataQuality.gaps`): gold-etf-flow, xccy-basis, rbnz/latest, desk-weekly empty; event-day, cb-expectations, term-premium, chain-read, eod-review, morning-brief stale | 11 skills: global_market, credit_funding, events_news, rates_cb, yields_curve, macro_economy, cot_positioning, vol_iv, options_oi, levels_structure, evidence_memory |
| Data health | `GET /api/data-health` | the route | live | rows per feed | verified live | lists dead/stale feeds with `ageDays`, e.g. EVZ 607 days dead, `kv:fwd_fade_log` dead | `kv:*`, `cvol:*` |
| R2 append-only archive | R2 `archive/<source>/<YYYY>/<date>.json` (snapshots), `archive/series/<source>/<id>.json` (series), `archive/tables/<source>/<id>.json`; status `GET /api/data-archive/status`; code `js/dataArchive.js`; job `_archiveDaily` (24 h interval, `server.js:43951`, `:44283`) | `getJSON` on the key (R2 creds on the server); `mergePoints` keeps the first value of a revised point as element 3 | daily | see 1.2-1.9 | status verified 2026-11-08: 135 series; days: `oi_raw` 81 (2026-08-20 -> 2026-11-08), `oi_summary` 81, `tnx_15m` 8 (from 2026-11-01), `nowcast` 8, `vol_forecast` 108 (2026-06-11 -> 2026-11-09), `vol_session` 109 (2026-06-09 -> 2026-11-06), `funding_read` 20, `surprise_store` 2 | Written once nothing is deleted. The CME options capture began 2026-07-30 but the archive's first day is 2026-08-20, so 2026-07-30 -> 08-19 is **not in R2** (it may still be in KV `oi_history`; not verified) | see below |

### 1.2 Options open interest, GEX and dealer gamma

| Item | Where | Read with | Freq | History | Freshness | Caveats | Keys |
|---|---|---|---|---|---|---|---|
| CME options OI store (live) | KV `oi_store` (+ `oi_store_py`, `oi_store_cmdty`, `oi_history`, `oi_history_raw`); routes `/api/oi-store` (1.3 MB), `/api/oi-today`, `/api/oi-history` (per-pair day-over-day deltas, `days: 81`). Capture is outside the server (`oi_recon/run_daily.py`, feed `cme_oi_iv` in `js/dataFeeds.js`) | the routes; per pair fields include `exposures.{gex,dex}`, `gexProfile`, `gammaFlip`, `gexFlip`, `fullBook.{gex,flip,regime}`, `pcRatio`, `totalCallOI/PutOI`, `callWall/putWall(+OI)`, `maxPain`, `expectedMove`, `ivTermStructure`, `riskReversal`, `skew`, `gexLadder`, `oiAsOf` (verified) | nightly | KV ~365 days then trimmed (`server.js:24785`); R2 `archive/oi_raw`, `archive/oi_summary` from 2026-08-20 | `oiAsOf` 2026-11-06, `savedAt` 07/11/2026 06:44 (verified) | OI(D) is published mid D+1, so pair it with session D+2 (DATA_SPEC section 5 #11). OI-book builder compares futures strikes to CFD prices without the basis and does not swap call/put on inverted pairs (#12); `js/oi.js` does swap. Banked reading: the CME gamma sign is "a proxy" for recent falls and vol (`gex-range-iv`, `gex-split-book`) | `EUR/USD, GBP/USD, USD/JPY, AUD/USD, XAU/USD, USD/CAD, USD/CHF, NAS100_USD, US30_USD, SPX500_USD, US2000_USD` (verified `/api/oi-store`); the feed catalogue says 41 instruments (doc) |
| OI research book (daily history) | `oi_research_book/data/daily_master_all_{aud_usd,gbp_usd,nas100_usd,usd_cad,usd_chf,usd_jpy}.parquet` and unsuffixed `daily_master_all.parquet` (EUR/USD), `daily_master_near_*`, `wall_summary_*`, `surface_*`, `gamma_iv_*` | `pd.read_parquet`; columns include `spot, call_wall_a..e, put_wall_a..e, total_call_oi, total_put_oi, total_call_vol, total_put_vol, net_gex_sum, gamma_flip, pc_oi_ratio, rv20_ann, atr14, fwd_hi_1d, fwd_lo_1d` | daily | 2020-09-04 -> 2026-09-04 (EUR file -> 2026-08-20) (verified) | static; rebuilt by hand with `oi_research_book/scripts/01_build_daily_dataset.py` from R2 `OI Data/*.csv` | `fwd_*_1d` come from UTC D1 files with Sunday stubs (#11); basis and call/put swap not handled (#12); a 2026-08-21 -> 09-04 tail overlaps the lockbox | `aud_usd, eur_usd, gbp_usd, nas100_usd, usd_cad, usd_chf, usd_jpy` (no gold/ES file here) |
| OI archive text | R2 `OI Data/NAS100_USD.csv` 1,521 days (doc `plans/DATA_ASSET_MAP.md`); ES and gold books via Databento are cited in `GEX_RANGE_ES_PREREG.md` / `GEX_RANGE_GOLD_PREREG.md` | (not verified: location of the ES/gold files) | daily | NQ 6 years; ES 2020-10 -> | | | |
| Cboe full option chains | R2 `cboe_raw/<SYM>/<YYYY-MM-DD>.json`, route `/api/cboe-raw?sym=&date=`; writer `_cboeRawArchiveTick` (flag `cboeRawArchive`) | the route; live dealer gamma derived per symbol in `/api/state` `assets.gamma.rows`: `netGex`, `regime` (BREAKOUT/PIN), `gexFlip`, `callWall`, `putWall`, `maxPain`, `flipDistPct` | daily after the close | **2026-10-16 -> 2026-11-06, 16 trading days per symbol** (verified) | 2026-11-06 last archived day | `open_interest` is the start-of-day figure; prices/IV/greeks 15-min delayed close. Too short for percentiles until ~Q1 2027. Today: SPY, QQQ, IWM, SPX, NDX, HYG, GLD all negative net GEX / BREAKOUT, TLT positive / PIN (verified) | `SPX, NDX, RUT, DJX, XSP, VIX, SPY, QQQ, IWM, DIA, GLD, SLV, USO, TLT, HYG, FXE, FXY, UUP` |
| FX options skew (risk reversals, flies) | KV `options_skew_v1`, `options_skew_hist`; `/api/options-skew` | the route; rows per FX future: 1w/1m `atm, c25, p25, rr25, bf25`, `lean` | laptop-pushed (Task Scheduler `run_cb_expectations.bat`, doc) | **1 history point** (`history: 1`, verified) | `asOf` 2026-11-04 18:02Z, `ageH` 97 (verified) | skew never tested as a lead (DATA_ASSET_MAP) | EUR, GBP, JPY, ... (6E, 6B, 6J ...) |
| CME implied-vol term archive | `analysis/output/iv_term/iv_term_daily.csv` (committed) | pandas; one row per trade date x product x expiry: `dte, atm_strike, future, straddle, iv, iv_prior, oi_call, oi_put, stale` | daily | 2026-07-30 -> 2026-11-06 for FX/gold/indices; commodities from 2026-10-01; **rates `SR3, ZN, ZT, TN` from 2026-10-22** (verified, 28,463 rows, 25 products) | rebuilt by `python oi_recon/iv_term_archive.py` from the capture laptop | `stale=1` = vols unchanged from the prior date | `AUD_USD, EUR_USD, GBP_USD, USD_CAD, USD_CHF, USD_JPY, XAU_USD, XAG_USD, XPT_USD, XPD_USD, XCU_USD, WTICO_USD, BCO_USD, NATGAS_USD, CORN_USD, SOYBN_USD, WHEAT_USD, NAS100_USD, SPX500_USD, US30_USD, US2000_USD, SR3, ZN, ZT, TN` |
| CME settlement IV inversion (history) | `oi_research_book/data/iv_daily_{aud_usd,eur_usd,gbp_usd,nas100_usd,usd_cad,usd_chf,usd_jpy}.parquet` | pandas | daily | 2020-09-08 -> 2026-09-04 (verified) | static | built from OI Data; pre-lockbox tail only | as above |
| CME CVOL EOD | repo root `cme_cvol_eod_available_history.parquet` (**not in this worktree**; licensed, cannot be re-pulled) via `js/cvolLoader.js`; `/api/cvol` | the loader / route | daily | EURUSD 2016-01-04 -> **2026-08-20** | `/api/cvol` shows `CME_EURUSD` asOf 2026-08-20, 81 days stale (verified); `EVZCLS` dead since 2025-03-11 | products AUDUSD, EURUSD, GBPUSD, USDCAD, USDCHF, USDJPY, XAUUSD (doc) | |

### 1.3 COT

| Item | Where | Read with | Freq | History | Freshness | Caveats | Keys |
|---|---|---|---|---|---|---|---|
| COT full depth (live archive) | R2 `archive/tables/cot/<sym>.json` (`js/cotArchive.js`); surfaced as `/api/state` `history.cot` and `layers.positioning` | `/api/state` or `getJSON` | weekly | 36 markets. **22 markets from 2006-2007 (1,001-1,065 weeks); WHEAT 2013; BTC 2018; NATGAS 2018; 14 markets only from 2022-02 (248 weeks): US, TY, TU, NQ, ES, YM, RTY, USD, GBP, NZD, WTI, BRENT, RBOB, COPPER** (verified from `weeks`/`since`) | `reportDate` 2026-11-03 (verified) | The 248-week markets are shallower here than in `cot_weekly.csv` (below): use the csv for deep history of those | `EUR, GBP, JPY, AUD, CAD, CHF, NZD, MXN, USD, NQ, ES, YM, RTY, TY, TU, US, GOLD, SILVER, PLAT, PALL, COPPER, WTI, BRENT, NATGAS, RBOB, CORN, WHEAT, SOYS, SYBO, SUGAR, COFFEE, COTTON, COCOA, CATTLE, HOGS, BTC` |
| COT live extremes | KV `cot_extremes_v3`, `cot_series_v2`, `cot_factor_history_v1`; `/api/cot-extremes`, `/api/cot`, `/api/cot-state` (`js/cotState.js`) | the routes; fields `specNet, commNet, specPct, commPct, specZ, specShare, amShare, dlShare, specShareChg4w, grossRatio, openInterest, oiPct, weeklyChg, histLen (156)` (verified) | weekly, recomputed on request | percentile window **156 weeks** by design (`COT_LIMIT`) | `reportDate` 2026-11-03 | published Friday 15:30 ET for Tuesday; feature rule `report+3d 20:30 UTC` (`plans/FEATURE_MANIFEST.json`). Use the Tuesday date only with a +3-day known-at | |
| COT weekly csv (deep, committed) | `analysis/output/cot-crowding-programme/cot_weekly.csv` (35,675 rows, 34 symbols, 2006-06-13 -> **2026-10-20**) | pandas; `sym, set (discovery/holdout), report_date, spec_long/short, comm_long/short, oi, traders_*` (verified) | weekly | 2006-06-13 (RTY 599 weeks, NZD 1,060, rest 1,063) | 3 weeks behind live (static file, `fetch_cot.py`) | **JPY, CAD, CHF stored in USD/xxx pair terms** (long/short swapped); read `COT_WEEKLY_README.md` first (DATA_SPEC #16). `set` is that programme's own split | 34 symbols |
| TFF Treasury leverage | feature store `tff_lev_share_ust2y/5y/10y`, `tff_lev_ust_notional`; live state `plumbing.treasuryFutures` | feature store = laptop only (`features/*.parquet`, last build 2026-10-16) | weekly | 2006-06-16 -> 2026-10-16 | | the feature store has no R2 copy (doc) | |

### 1.4 Volatility: implied, realised, term structure, vol of vol

| Item | Where | Read with | Freq | History | Freshness | Caveats | Keys |
|---|---|---|---|---|---|---|---|
| Cboe vol indices (21) | committed `analysis/surfaces/cboe/*.csv`; R2 `archive/series/cboe/<id>.json` refreshed by `_archiveDaily` (`_fetchCboe`, cdn.cboe.com); `scripts/data/fetch_cboe_vol_indices.py` | `/api/state` `history.long` or the csv (Cboe layout: `DATE` MM/DD/YYYY, 5-col OHLC or 2-col) | daily | VIX 1990-01-02, SKEW 1990, VVIX 2006-03-06, VXTLT 2004-01-02, VIX1Y 2007, VIX6M 2008, GVZ/OVX/VIX3M/VXN/VXD/RVX 2009, VIX9D/VXAPL/VXAZN 2011, VXEEM/VXFXI/VXEWZ/VXGDX/VXSLV 2011-03-16, VIX1D 2022-05-13 (verified from csv) | state shows VIX asOf 2026-11-06 (verified); committed csv ends 2026-10-20/21 | EVZ withdrawn. Dates are Cboe closes; known after 16:15 New York | `VIX, VIX1D, VIX9D, VIX3M, VIX6M, VIX1Y, VVIX, SKEW, VXN, VXD, RVX, OVX, GVZ, VXTLT, VXEEM, VXFXI, VXEWZ, VXGDX, VXSLV, VXAPL, VXAZN` |
| MOVE (bond vol) | Yahoo `^MOVE` -> R2 `archive/series/yahoo/MOVE.json`; `history.long` MOVE | state | daily | 2002-11-12 -> 2026-11-06 in `history.long` (verified); `tiers` MOVE reading spans only 99 days | the feature store copy ends 2026-09-21 | DATA_ASSET_MAP said the live feed stopped 2026-09-21; the archive route is alive now (state asOf 2026-11-06) | |
| Dispersion / implied correlation | drill bundle (71 series, 24 h in-memory) -> `assets.internals`: `dspx, cor1m, cor3m, vixeq` | `/api/state` | daily | since 2020-11-09 (verified) | 2026-11-06 | DSPX at 96th pct, VIXEQ 97th today (verified) | |
| VIX/VXN intraday capture | R2 `vix_m1/`; `/api/vix-capture` | route | every 6 h | (not verified) | | | |
| Desk realised vs forecast | KV `vol_forecast_<date>`, `vol_session_<date>` (R2 `archive/vol_forecast`, `archive/vol_session`: 108/109 days from 2026-06); `/api/vol-forecast/hit-rates` (90-day lookback, 8 instruments), `/api/session-stats` (5 years), `/api/forecast-scorecard` (started 2026-11-07) | routes | daily (London cron) | June 2026 -> | | `vol_session.oc` is signed (take abs); 6 early audits recorded the next session (`auditUsable` skips them) | GOLD, NQ, SPX500, DE30, UK100, US30, US2000, EURUSD in hit-rates; 51 instruments in state `layers.vol` (`volAnnual`, `volPct`, `hlP50`, `hlP75`) |
| Realised HL / OH / OL / OC history | M1 -> London sessions: `VolRangeForecaster/data/m1/{pair}_m1.parquet`, R2 `m1/{pair}_m1.parquet` (+ `m1-tail`); loaders `loadM1ForPair` + `bucketM1IntoSessions(packed,'Europe/London')`, `forge.vol.load_daily` | per data-rules; **absent in a cloud session** | M1 | 2016-01 -> 2026-08-21 (lockbox start); 26-28 FX + gold; indices in `portfolioBacktest/cache` | frozen at the lockbox | `loadM1ForPair` merges the nightly R2 tail (lockbox leak): truncate to <= 2026-08-21 | see instruments.md |
| NY-close D1 from M1 (committed) | `oi_research_book/data/gex_range_es/{nas100,spx500}_nyclose_d1.parquet`, `gex_range_gold/xauusd_nyclose_d1.parquet` | pandas | daily | 2016-01-04 -> 2026-08-20 (verified) | frozen | n >= 60 rule already applied | `nas100, spx500, xauusd` |
| Feature store `hl_london_*` | laptop `features/*.parquet`; manifest `plans/FEATURE_MANIFEST.json` (100 features) | `js/harness/features.mjs` `FeatureStore.at()` | daily | 2016-01-05 -> 2026-08-21 | built 2026-10-16/17, laptop only, no R2 copy | `at()` fixed 2026-10-31 (#17) | `eurusd, gbpusd, usdjpy, xauusd, nas100, spx500` |

### 1.5 Rates and policy rates

| Item | Where | Read with | Freq | History | Freshness | Caveats | Keys |
|---|---|---|---|---|---|---|---|
| FRED series, deep copies | R2 `archive/series/fred/<id>.json`; KV `fredhistory_series_<key>` (90 obs, 24 h TTL); `/api/fredhistory` (14 KB, 90 points); keyless `fredgraph.csv?id=` (latest vintage only, needs a named user-agent) | `getJSON`, or `_mbFred(id, years)` on the server | daily/weekly | 135 archived series (verified list): `DGS1MO, DGS3MO, DGS6MO, DGS1, DGS2, DGS3, DGS5, DGS7, DGS10, DGS20, DGS30, DFII5, DFII10, T5YIE, T10YIE, T5YIFR, THREEFY10, THREEFYTP10, SOFR, EFFR, IORB, IOER, DFEDTARU, RRPONTSYD, RPONTSYD, WALCL, WTREGEN, WRESBAL, TOTBKCR, DTWEXBGS, DTWEXEMEGS, VIXCLS, VXVCLS, DCPF3M, DEXJPUS, DCOILWTICO, ...` | archive started 2026-10-31; depth = whatever FRED served | `fred/*` dated by observation date, not publication. Point-in-time needs ALFRED vintages: `scripts/fetch_fred_vintages.py` -> `data/iep_macro/<id>_vintages.csv` (needs `FRED_KEY`; **no vintages in a cloud session**). Publication lags used: WALCL 8d, TGA 2d, RRP 1d, HY OAS 1d. Units: RRPONTSYD $bn, WALCL/WTREGEN $m (`js/netLiquidity.js`) | |
| Committed FRED seeds | `analysis/output/cog_yield_dir/fred/{DGS2,DGS10,T10Y2Y,T10Y3M,DFII10,T10YIE,DTB3,DFF,BAA10Y,AAA10Y}.csv` | pandas | daily | DGS2 1976-06-01, DGS10 1962-01-02, T10Y2Y 1976, T10Y3M 1982-01-04, DFII10/T10YIE 2003, DFF 1954, BAA10Y 1986, AAA10Y 1983 (verified); all end **2026-10-05/06** | static | revisable? (yields are not; BAA/AAA series are monthly-published daily Moody's, treat as known next day) | |
| Non-US yields and policy rates | R2 `archive/series/rates/{de_2y,de_10y,jp_2y,jp_10y,uk_10y,us_2y,us_10y,us_ff,ecb_dfr,boe_bank,baa10y,hy_oas}`, `rates/CORRA`, `rates/ESTR` (verified in status ids); issuer feeds in `js/yieldFeeds.js` (Bundesbank, MoF Japan, BoC Valet, RBA F2, BoE IADB); `/api/global-yields` (y2, y10, slope, `gapToUs`, `chg2y20d`), `/api/intl-yields`, `/api/world-rates`, `/api/policy-rates` | routes / `getJSON` | daily | DE/JP daily 2y/10y "from 2005" (doc `DATA_ASSET_MAP`, flow chain); SONIA, CORRA and ESTR added 2026-11-01 (CORRA and ESTR ids verified in the archive list), **TONA still missing** (doc) | 2026-11-05 | UK has 10y only from the daily feeds (no gilt 2y in `rates/`); CA/AU 2y via `yieldFeeds` for the quick test (`yield:CA2Y`, `AU2Y`) | |
| Monthly OECD short and long rates | `IR3TIB01*`, `IRLTLT01*`, feature store `rate3m_*`, `y10_*`, `rate_on_*` | features | monthly | 2013-06 -> (GBP 2000) | EUR 3m dead since 2026-02-16 | monthly, revises; poor for a daily agent | |
| Fed path | KV `zq_path_v1`, `analysis/output/stir/CBOT_ZQ*.csv` (to 2026-10-26, doc), Atlanta Fed MPT `mpt_store_v1`; `/api/fed-path` | route | 15-min futures | ZQ since 2025-04 for the meeting strip | | needs 12 consecutive monthly contracts | |

### 1.6 Yield curve points and spreads

| Item | Where | Read with | Freq | History | Freshness | Caveats | Keys |
|---|---|---|---|---|---|---|---|
| US curve 1M-30Y | FRED archive series above (`DGS1MO ... DGS30`) | compute spreads from the archive; no spread series is stored except FRED's own `T10Y2Y`, `T10Y3M` (committed) | daily | see 1.5 | | **spreads are derived, not stored**: 2s10s = `DGS10 - DGS2` (= `T10Y2Y`), 3m10y = `DGS10 - DGS3MO` (= `T10Y3M`), 5s30s = `DGS30 - DGS5`, 2s5s10s fly, 10y real = `DFII10`, breakeven = `T10YIE`, term premium = `THREEFYTP10` | |
| State-engine slope and gaps | `/api/state` tiers: `bundgap`, `giltgap`, `jgbgap` (non-US 10y minus UST 10y), `real`, `bei`, `funding`; `regimes.curve` ("curve not inverted") | state | daily | 3-year windows | 2026-11-05 | gap spans are ~1,092 days only | |
| Yield-spread engine | `/api/yield-spread/plan` (`js/yieldSpreadEngine.js`, `yieldSpreadProducer.js`), `/api/yield-coupling`, `/api/yield-curve`, `/api/yield-shape-regime` | routes | daily / 5-min (10y intraday) | 10Y intraday (^TNX 15m) archived from 2026-11-01 (8 days) | | KV `yield_shape_regime_v1` kept only 120 days before 2026-10-31 | |
| US-DE-JP 2y/10y spreads (research) | `analysis/output/dynlead/`, `analysis/output/ys_long/fred/DGS2.csv` + `policy_direction/` | files | daily | DGS2 1976, German 2y 1997, 9-currency 3m rates | | banked as null/context (see 3) | |

### 1.7 SOFR vs ICE-2 (Euribor), STIR futures

C.OG's pair (`SR3U6 - ICE 3-month Euribor`, written "I2!" / ICE-2; reconstruction `analysis/output/cog_video_0918/RECONSTRUCTION.md`).

| Item | Where | Read with | Freq | History | Freshness | Caveats | Keys |
|---|---|---|---|---|---|---|---|
| STIR futures 15-min | `analysis/output/stir/<EXCHANGE>_<symbol>.csv` (committed): SOFR `CME_SR3U5/Z5/H6/M6/U6/Z6/H7/M7`, Euribor `ICEEU_IZ4/IH5/IM5/IU5/IZ5/IH6/IM6/IU6/IZ6`, `ICEEU_ER3U6` (EUR STR), `EUREX_FST3_20261216_M`, `CME_ESRM7`, fed funds `CBOT_ZQ{V6..V7}` | pandas; `time` (UTC bar start), `open..close, volume, barCount` | 15-min | SR3 Dec 2024 -> 2026-10-08/09; ZQ -> 2026-10-26 (doc `RATES_NASDAQ_WORKLOG` data table and `live_feeds.csv`) | static archive, merged on each IBKR pull | IBKR serves ~6 months for expired contracts: "an archive, not a cache"; legs print unchanged on ~88% of minutes; stitching across contract rolls is manual | |
| STIR 1-min midpoint | `analysis/output/stir_1m/*.parquet` (SR3U6/Z6/H7/M7/U7, `ER3*`, `IH7`, `IZ6`, `IM7`, `IU7`, `IV6`, `IX6`, `CBOT_ZT*`, `EUREX_FGBS*`), `stir_1m_i2/` (Euribor serials), `stir_1m_hist/`, `stir_mid15/` | pandas | 1-min | Apr-Oct 2026; a deeper pull 2024-04 -> 2026-10 for SR3U6 and IH7 is described in the worklog (`stir_1m_deep/` **not present in this worktree**) | | `stir_1m_deep` not verified | |
| Live SOFR-Euribor line | `GET /api/spread-episodes/live`: Case 1 = SR3U6 minus IH7 (spread 89 bp, 15-min) vs NAS100; legs from KV `cog_legs_live_v1` pushed from the laptop (`_ccLivePush`, `server.js:8335`); forward record KV `spread_episodes_v1` from 2026-10-20 | route | 15-min while the laptop pushes | `legsAsOf` 2026-11-08T18:37Z but `"stale": true` (verified) | laptop-dependent | the `analysis/output/cog_chart` base files are not in this worktree (not verified) | |
| SOFR (overnight) | FRED `SOFR`, `SOFRVOL`; `rates` plumbing | archive | daily | 2018-04-04 -> | | | |
| Cross-currency basis | KV `xccy_basis_v1`, `xccy_basis_hist`; `/api/xccy-basis` | **prod returns `ok:false` "no futures pull yet"** (verified) | daily (laptop `refresh_xccy_basis.py --push`) | none on prod; feature store `xccy_basis_*` unbuilt (`status` none) | | `basis-yearend-premium` validated from the committed CSV (DATA_ASSET_MAP) | |
| Fed funds, IORB, EFFR, RRP | FRED archive | | daily | EFFR 2000, IORB 2021-07-30 | | funding = SOFR - IORB in state | |

**ICE-2 / Euribor daily history:** no daily series exists in the repo. Only intraday futures (Apr-Oct 2026 for the
C.OG pair; 2024-12 for older contracts) and the laptop feed. Monthly OECD `IR3TIB01EZM156N` is dead (2026-02-16).

### 1.8 Credit and funding

| Item | Where | Read with | Freq | History | Freshness | Caveats | Keys |
|---|---|---|---|---|---|---|---|
| ICE BofA OAS | R2 `archive/series/fred/BAMLH0A0HYM2, BAMLH0A1HYBB, BAMLH0A2HYB, BAMLH0A3HYC, BAMLC0A0CM, BAMLC0A4CBBB, BAMLEMCBPIOAS, BAMLHE00EHYIOAS` | archive; state `assets.credit` (IG/HY/CCC) | daily | **2023-10-17 ->** only (ICE licensing; FRED serves 3 years) (faults-log 2026-11-01) | 2026-11-05 | percentile spans 97 days for CCC/EM in the tier reading; HY 3 years | |
| Moody's Baa, Aaa | `BAA10Y` (1986), `AAA10Y` (1983) in the committed seeds and `rates/baa10y` | csv / archive | daily | to 2026-10-05 committed | | the long-history credit regime (feature `credit_baa10y`) | |
| HYG/JNK/IEF/LQD/TLT ratios | R2 `archive/series/yahoo/{HYG,JNK,IEF,LQD,TLT}`; state `history.long` `CREDIT_RATIO`, `IG_RATIO` | | daily | 2007-04-11 / 2002-07-30 -> 2026-11-06 (verified) | | HYG/IEF is the long-history spread proxy; demoted to context (`hy-spread-vol`) | |
| Funding plumbing | state `plumbing.rows`: `WMTSECL1, WLRRAFOIAL, BC0FRIW027SBOG, NDFFRIW027SBOG, COMPOUT, DCPF3M, EFFR, SOFRVOL, NFCI, STLFSI4, T5YIFR` (since 1986-2018, verified); KV `funding_read_v1` (20 days from 2026-10-20); liquidity: `net, walcl, tga, tgaDaily, rrp, reserves, swaps, bankCredit`; `/api/liquidity-board`, `/api/liquidity-pulse/data`, `/api/credit-board`, `/api/credit-stress` | state | daily/weekly | `tgaDaily` in state spans only 58 points (from 2025-10-08) though the archive holds Treasury DTS TGA from 2005 (doc) | 2026-11-04/05 | net liquidity in `js/netLiquidity.js` (fault #8, #19) | |
| BIS cross-border credit | KV `bank_credit_v1`, feature `bis_*` | | quarterly | 1979 -> | lagged 182 days | slow; context only | |

### 1.9 Prices: FX, gold, indices, commodities

| Item | Where | Read with | Freq | History | Freshness | Caveats | Keys |
|---|---|---|---|---|---|---|---|
| OANDA NY-close D1 | live `_gbD1` / `_btFetchD1` (`fetchD1Aligned`); feature store `px_d1_*` (2002-05 -> 2026-10-16, laptop; 10 series) | the quick test's `oanda:*` catalogue (28 G8 crosses + 25 others) | daily | up to 5,000 bars | live | weekend rows 2002-2013 in `px_d1_*` (#9); London-date labelling fixed 2026-10-31 (#13) | `oanda:EURUSD ... oanda:GOLD, SILVER, NQ, SPX500, US30, US2000, DE30, UK100, WTI, BRENT, COPPER, NATGAS, ...` |
| M1, bid/ask | see 1.4 and `data-rules/references/sources.md` | | | | | never `--price BAM` for the research cache | |
| Yahoo daily FX and EM | R2 `archive/series/yahoo/FX_*` (AUDUSD, BRL, CAD, CHF, EURUSD, GBPUSD, IDR, INR, JPY, KRW, MXN, MYR, NOK, NZDUSD, PHP, SEK, SGD, THB, TRY, TWD) | archive | daily | (not verified: first dates) | 2026-11-08 stamp | Yahoo FX bars are end-stamped: London date of (stamp - 1 min) (#18) | |
| Commodity drivers | state `drivers`: oil, copper, gold, crack spread, BTC; `/api/copper-gold`, `/api/crack`, `/api/commodity-fx` | | daily | ~562 days in state | 2026-11-03/06 | | |
| Index NY-close history | see 1.4 | | | 2016 -> 2026-08-20 | | | |
| NT8 1-min NQ/ES/GC/CL | `analysis/output/nt8/` (**absent here**) | | 1-min | (not verified) | | end-stamped bars (fault 2026-11-07) | |

### 1.10 Daily-run, backtest and desk outputs

| Item | Where | Read with | Freq | History | Freshness | Caveats |
|---|---|---|---|---|---|---|
| Desk run, analysts, scorecards | Desk Pack (1.1); KV `analyst_scorecard_v1`, `thesis_reality_v1`, `daily_snapshot_v1` (30 days, `/api/daily-snapshot`), `desk_watch_v1`, `eod_review_v1`, `morning_brief_v1`; routes `/api/analyst-scorecard` (2 scored mornings, interim) | routes | weekday | days to months | analyst scorecard `asOf` 2026-11-06 | descriptive; model-written text must not be treated as data |
| Forward ledgers | R2 `forward/direction_ledger/<date>.json` + `out/` (`js/directionLedger.js`, `directionLedger` job every 30 min); KV `spread_episodes_v1`, `fwd_fade_log` (dead), `paper_record_v1`, `signal_journal_v1`, `vix-signals-forward` | R2 / KV | daily | direction ledger: from 2026-10 | | the precedent for the Data Agent's forward record |
| Backtest outputs | `analysis/output/<slug>/RESULTS.md` + `results.json` (harness: `analysis/output/harness/<id>.json`), `oi_research_book/*_RESULTS.md`, `forge/*_PREREG.md` | files | per study | | | no machine index except the Evidence Book |
| The desk's evidence | `js/deskEvidence.js` (352 entries on 2026-11-08 per the map script), `MD files/TRIAL_LEDGER.md` (301 tested: 51 validated, 171 null, 79 underpowered, 51 context; generated 2026-11-08), `plans/RESEARCH_REGISTER.md` | `evidence_map.mjs <keywords>`; `js/deskEvidence.js` import | on bank | 2026-08 -> | | `/api/state` `edges` shows which validated range edges are active today (6 listed; 5 active) |
| Quick-test store | KV `research_pod_quicktests` (`_QT_KEY`, `server.js:7859`), `GET /api/research-pod/quick-test` | route | on demand | 1 stored test (`qt-1wnfq0i`, SPX500 -> USDCHF, NULL) | verified | exploratory, never banked |

### 1.11 Events

`calendar_events.csv` (102,760 rows, 2014-01-02 -> 2026-07-02, ~46k exact duplicates), `calendar_events_nasdaq.csv` (from
2026-07-03, refreshed twice weekly by `.github/workflows/calendar-refresh.yml`), `load_calendar()` in
`scripts/calendar/fetch_nasdaq_calendar.py`, ForexFactory surprise backfill 2007-2025 (`history.surprises`, 8
economies), `/api/calendar-ahead`, `/api/econ-surprise`. Needed here for the "release day" condition only.

### 1.12 What does NOT exist (plain list)

| Asked for | Status |
|---|---|
| Daily SOFR-vs-ICE-2/Euribor spread history | Not held. Intraday futures only: SR3 and Euribor 15-min from Dec 2024 (older contracts), 1-min Apr-Oct 2026; live feed laptop-dependent and flagged stale |
| Daily Euribor / ICE 3m rate | Not held (OECD monthly dead since 2026-02-16) |
| Dealer-gamma estimate history for SPX/NDX/QQQ ETFs | 16 days (Cboe chains from 2026-10-16). Index CME-based GEX history 2020-09 -> 2026-09-04 (7 products) and R2 since 2026-08-20 |
| Daily dealer gamma on prod right now | `/api/state` `layers.options` returns `rows: []`, `at: null` today (verified); the Cboe-derived `assets.gamma` works |
| FX risk-reversal / skew history | 1 point (laptop push, 97 h old). CVOL skew ends 2026-08-20 |
| CME CVOL after 2026-08-20; EVZ | Ended / dead; replaced by the CME settlement capture from 2026-07-30 |
| Rates implied vol history (SR3/ZN/ZT) | 16 days (from 2026-10-22). Proxies: VXTLT (2004 ->), MOVE (2002 ->) |
| ICE credit spreads before 2023-10-17 | Not available free (licensing). Use BAA10Y/AAA10Y (1986/1983) or HYG/IEF (2007) |
| Cross-currency basis on prod | Laptop only; route empty |
| Point-in-time macro vintages in a cloud session | Needs `FRED_KEY` and `data/iep_macro/` (laptop); the feature store is laptop-only with no R2 copy |
| UK 2-year gilt daily; TONA | Not held (UK has 10y only; TONA still open) |
| Breadth (constituents), OIS curves, PMIs, non-US CPI for JPY/AUD/NZD | Not held (ENGINE_DATA_MAP section 2-3) |
| Local M1 after 2026-08-21 | Frozen at the lockbox; `data/m1_forward/` is download-only, never scored |

### 1.13 Inventory faults that affect this agent

1. Percentiles in `/api/state` use the full sample including the current day: a causal replay needs its own windows.
2. COT depth is inconsistent: live/R2 shows 248 weeks for 14 markets while the committed csv has 2006 -> (csv ends 2026-10-20).
3. R2 CME options archive begins 2026-08-20, not 2026-07-30.
4. Two sources for the same series differ in date: tier VIX 28.18 (FRED, 2026-11-05) vs `history.long` VIX 25.64 (Cboe, 2026-11-06). The agent must key by `(series, source, asOf)`.
5. Most laptop-pushed feeds (skew, xccy basis, spread legs, feature store) have no schedule on the server and go stale silently; `/api/data-health` is the only check.
6. Lockbox: 2026-08-21 -> 2026-09-04 rows exist in the OI book parquets; the Cboe/R2 archives and `vol_*` records are all post-lockbox by construction.

---

## 2. Proposed watch list (72 items)

**State measures for every item** (computed once, causally, by one module):

- `value` now; `knownAt` (when public) and `asOf`.
- `pctW`: percentile of today's value in the item's own history strictly before today, windows **252 trading days**
  (1y) and **756** (3y), plus `pctAll` once >= 1,250 observations exist. Weekly items: 52 / 156 / full weeks. An item with
  fewer than 250 prior observations reports "building" and cannot trigger.
- `z`: robust z (median and MAD of the prior 252 observations; MAD x 1.4826), because most of these series are fat-tailed.
- `d1, d5, d20`: change over 1, 5, 20 sessions (weekly items: 1, 4, 13 weeks), in the item's unit; for price-like
  series log change.
- `streak`: sessions in the current state; `since`: date it first crossed.

**Unusual triggers** (frozen and versioned in one file; changing a threshold bumps `watchVersion` and starts a new
forward record): `X` extreme = `pct252 >= 95` or `<= 5` AND `pct756` same side; `fast` = `|z(d5)| >= 2`; `flip` = sign
change of a spread/GEX/slope held >= 3 sessions; `div` = two normally co-moving items with 60-day rolling correlation >=
0.4 whose 20-day moves have opposite sign and each `|z| >= 1` (pre-set); `regime` = category change in a classifier
that exists already (PIN/BREAKOUT, curve inverted/normal, crowd zone A-D); `stale` = input older than its allowed age.
Each fired trigger records the item id, trigger type and the day's total number of items scanned (the search breadth).

Cadence: daily items run after the close; weekly items run on the COT release (Friday after 20:30 UTC) and are carried
unchanged otherwise; "building" items are shown, not triggered.

### A. Options positioning: OI, GEX, dealer gamma (10)

| ID | Name and definition (inventory source) | Why it matters | Unusual when |
|---|---|---|---|
| A01 | Net GEX sign and size per Cboe underlying: `netGex` for SPX, NDX, SPY, QQQ, IWM, TLT, HYG, GLD (1.2 Cboe chains) | gamma-range effect validated for ES/NQ range (+0.15 after controls), not direction | sign flips; `|netGex|` > 2x its own median once history exists (Q1 2027); until then sign only |
| A02 | Distance to gamma flip: `flipDistPct` per symbol and CME `gammaFlip` vs spot per pair | near the flip dealer hedging changes sign | `|dist| < 0.5%`; sign change of `spot - flip` |
| A03 | Gamma regime state: PIN vs BREAKOUT (`fullBook.regime`, `assets.gamma.rows.regime`), number of the 8 Cboe symbols in BREAKOUT | breadth of short gamma | >= 7 of 8 in BREAKOUT (today: 7); transition day |
| A04 | CME vs Cboe gamma disagreement on Nasdaq: `sign(NQ CME netGex) != sign(NDX/QQQ netGex)` | `gex-split-book` null says CME alone is a thin slice (QQQ ~ 3x NDX, ~17x NQ) | disagreement for 3 sessions (context flag only) |
| A05 | Wall migration: day-over-day `callWallShift`, `putWallShift` in ticks and `%` (`/api/oi-history` deltas) | where dealers' strikes move | shift > 2 strike steps or both walls move the same way |
| A06 | Put/call OI ratio per pair: `pcRatio`; history from `daily_master_all_*.pc_oi_ratio` 2020-09 -> | positioning lean | `pct252 >= 95 or <= 5`; `fast` |
| A07 | OI change shock: `totalCallChg`, `totalPutChg` as % of total OI vs own history (`oi_history`) | fresh positioning vs roll | `pct >= 95` for either side |
| A08 | Max-pain distance in the nearest expiry with dte <= 5: `(maxPain - spot)/spot` | pinning near expiry (swing-walk max-pain null: context) | `|dist|` in top 5% for that dte band |
| A09 | OI-book risk reversal: `riskReversal.rr` and `ivDynamics.skewSteepening` per pair (CME store) | skew lean; no skew test exists | `pct252` extreme with `d5` same sign |
| A10 | Gamma-positive complacency: A01 positive AND VIX (C01) `pct252 <= 20` AND `d20(VIX) < 0` | long gamma plus falling vol = quiet regime that precedes vol expansion (descriptive) | all three true |

### B. COT positioning (10)

| ID | Name and definition | Why it matters | Unusual when |
|---|---|---|---|
| B01 | Spec net share per currency future (EUR, GBP, JPY*, AUD, CAD*, CHF*, NZD, MXN; `specShare`) vs own 156w and full history. *csv is in pair terms | crowding; state D and release-day crowding are validated | `pct156 >= 95 or <= 5`; count of G8 currencies in extreme |
| B02 | Spec net share, equity index futures (NQ, ES, YM, RTY) | NQ crowded against trend today (98th) | extreme; `splitChg4w` extreme |
| B03 | Spec net share, metals and energy (GOLD, SILVER, PLAT, PALL, COPPER, WTI, BRENT, NATGAS, RBOB) | commodity crowding (state D validated on 22 holdout markets) | extreme (today: RBOB 98, PALL 5) |
| B04 | Treasury positioning: spec share US, TY, TU and TFF leveraged share (`plumbing.treasuryFutures`) | basis-trade crowding; US(30y) at 99th pct today | extreme; `d4w` extreme |
| B05 | Positioning speed: 4-week change in share (`specShareChg4w`) z | rate of change (C.OG dR/dt framing) | `|z| >= 2` |
| B06 | Crowd state A-D per market (`/api/cot-state`, `js/cotState.js`: crowded with/against trend, price 13w move) | state D (crowded with trend, price extending) validated | entering D; transition D -> A/B |
| B07 | Spec vs commercial split: `specPct` and `commPct` both extreme and opposite | commercial hedgers vs speculators | `specPct <= 5 and commPct >= 95` (EUR today: 0 / 100) |
| B08 | Open interest percentile `oiPct` with price trending (13w) and OI falling 4w | stalled crowded trend (p7 underpowered: context) | `oiPct` fall >= 20 pts in 4w while crowd extreme |
| B09 | Crowd + scheduled high-impact release within 3 sessions (calendar) for a G8 pair | `positioning-into-release-direction` validated (direction, leveraged-fund crowd, release day) | crowd extreme AND release in window |
| B10 | Cross-market crowding breadth: number of the 36 markets with `pctAll` >= 95 or <= 5 | many crowded books at once | count >= 6 (today: 5) |

### C. Volatility: implied vs realised, term structure, vol of vol (14)

| ID | Name and definition | Why it matters | Unusual when |
|---|---|---|---|
| C01 | VIX level (Cboe VIX 1990 ->) | stress filter, many validated range terms | `pct252/756` extreme; `fast` |
| C02 | VIX term: `VIX9D/VIX` (calm < 0.8858, dear >= 0.9669 fixed by `vol-curve-front`) and `VIX/VIX3M` (inversion = `vix-inversion` validated) | validated range edges | first day of inversion; cross of the fixed cut-offs |
| C03 | VIX3M/VIX6M and VIX6M/VIX1Y slope | curve beyond the front | `pct` extreme; sign flip of slope |
| C04 | VVIX level and `VVIX/VIX` | vol-of-vol (VVIX at 95th today) | `pct252 >= 95` while VIX `pct252 < 80` (vol-of-vol spike with vol not yet high) |
| C05 | Implied ratio `VVIX/VXN` and `dR/dt` (5-session change of the 20-session ratio) (C.OG, `vvix-ratio-range` validated, `vix-beta-change` validated) | validated range signals | extreme ratio or `|z(dR/dt)| >= 2` |
| C06 | SKEW index (1990 ->) and SKEW with VIX falling | tail pricing; SKEW at 98th pct all-history today | `pct >= 95` while `d5(VIX) < 0` |
| C07 | IV minus RV, equity: VIX vs 20-day realised vol of SPX (NY-close D1); VXN vs NQ; GVZ vs gold | `iv-over-rv-wider` validated (over-insured then calms) | `ln(IV/RV)` `pct252 >= 95` or `<= 5` |
| C08 | IV minus RV, FX: CME 1-month ATM IV (`iv_term_daily`, "building" until ~Q3 2027 for percentiles) vs 20-day realised from OANDA D1 | `iv-forecast` validated (IV forecasts RV) | sign-only until 250 days: `IV < RV` for 5 sessions |
| C09 | Cross-asset vol breadth: count of {VIX, VXN, RVX, OVX, GVZ, VXEEM, VXTLT, MOVE, VXFXI, VXEWZ} with `pct252 >= 90` | systemic vs local vol (today OVX 94, GVZ 93, VXEEM 93) | count >= 6; or one index > 95 while VIX < 50 |
| C10 | MOVE/VIX and VXTLT/VIX | bond-vol vs equity-vol | extreme; sign flip of `d20` gap |
| C11 | Dispersion and implied correlation: DSPX, COR1M, COR3M, VIXEQ (since 2020-11) | `dispersion-reset` validated; RE-RUN status pending after fault #14 | DSPX `pct >= 95` and now falling (reset), COR1M `d20 > +10` |
| C12 | Realised range vs forecast line: share of the last 5 and 20 sessions where realised HL exceeded the p75 line (`vol_forecast_*` vs `vol_session_*`, `auditUsable`) per instrument | the shipped forecast is missing: `forecast-miss` family validated | share >= 60% over 5 (nominal 25%) |
| C13 | Realised-vol percentile per instrument: `volPct` (state `layers.vol`, 51 instruments) and count at >= 95 | range regime (NQ, SPX500, US30, US2000 at 99 today) | count >= 5; one FX pair >= 99 |
| C14 | Stress count: number of the five `forecast-miss-shock-fx` conditions (5d S&P fall, 5d VIX rise, VIX high, VIX inverted, 60d S&P fall) true today (`state.edges`) | validated; shadow x1.15 at 5 | count >= 4 |

### D. Rates, policy and funding (10)

| ID | Name and definition | Why it matters | Unusual when |
|---|---|---|---|
| D01 | US 2y `DGS2`: level, `d20`, `pct756` | first to price policy | `|z(d5)| >= 2`; `d20` below -25 bp (today -28) |
| D02 | US 10y `DGS10` and 10y real `DFII10`, breakeven `T10YIE`, 5y5y `T5YIFR`: which leg drove the 10y 20-day move | rates composition | change decomposes with real > 70% and breakeven opposite |
| D03 | Term premium `THREEFYTP10` | duration compensation | `pct756` extreme |
| D04 | Funding spread SOFR - IORB; EFFR - IORB; SOFR volume | plumbing stress before credit | spread > 5 bp away from month-end; `fast` |
| D05 | ON RRP usage and TGA (daily DTS, weekly WTREGEN): net liquidity `d4w` (`js/netLiquidity.js`) | liquidity impulse | `d4w` `|z| >= 2`; TGA daily jump |
| D06 | US minus Germany, UK, Japan policy rates (`rates/us_ff`, `ecb_dfr`, `boe_bank`) and US-DE, US-JP 2y gaps (`rates/us_2y`, `de_2y`, `jp_2y`) | carry and FX | gap `d20` extreme; sign flip of gap |
| D07 | 10y gaps to UST: Bund, Gilt, JGB (`bundgap`, `giltgap`, `jgbgap`) | cross-market rate pressure | `pct756` extreme |
| D08 | Market path vs policy: `DGS2 - EFFR` and ZQ-implied path (`zq_path_v1`) | what is priced vs set | `DGS2 - EFFR` sign flip; 2y minus FF `pct756` extreme |
| D09 | SOFR (SR3) minus Euribor (ICE) front-spread (laptop legs; building) | C.OG pair; banked null, context | only if the feed is fresh: `|z(d5)| >= 2` (carry flag `stale`) |
| D10 | SR3/ZN/ZT implied vol (CME, from 2026-10-22; "building") and VXTLT | rates vol | sign-only: IV `d5 > +10%` for 3 products |

### E. Yield curve and spread pairs (10)

| ID | Name and definition | Why it matters | Unusual when |
|---|---|---|---|
| E01 | 2s10s = `DGS10 - DGS2` (= `T10Y2Y`) level, sign, `d20` | classic curve; inversion study null for assets | sign flip held >= 3 sessions; `|d20|` top 5% |
| E02 | 3m10y = `DGS10 - DGS3MO` (= `T10Y3M`) | NY Fed recession gauge | sign flip; depth below -1.0 |
| E03 | 5s30s = `DGS30 - DGS5`; 2s5s10s fly | belly vs wings | `pct756` extreme |
| E04 | Steepener/flattener regime: signs of `d20(DGS2)` and `d20(DGS10)` -> bull/bear steepener/flattener (4 classes) | tells what is driving the curve | class change; class held with `|d20(2s10s)|` extreme |
| E05 | German 2s10s (`rates/de_2y`, `de_10y`) and Japan 2s10s (`jp_2y`, `jp_10y`) | non-US curve | sign flip; `pct756` extreme |
| E06 | Yield vs asset divergence (US 2y vs DXY / USDJPY / EURUSD, 20-day moves, 60-day rolling beta residual z) | owner's "yields vs assets" | `|z(resid)| >= 2` and rolling corr >= 0.4 (the pair normally co-moves); descriptive (`rates-spread-asset-lead` null as a lead) |
| E07 | Real yield vs gold: `DFII10 d20` vs gold `d20` same sign (normally opposite) | gold/real-yield link | both up (or both down) with `|z| >= 1` each |
| E08 | Stock-bond correlation: 60-day rolling corr of daily `DGS10` change vs NQ return, sign flip | diversification regime | sign flip held 10 days |
| E09 | US-DE 10y gap vs EURUSD 20-day move | rate-differential FX | divergence rule |
| E10 | Curve-vs-vol: 2s10s `d20` extreme with MOVE `pct756 >= 80` | stress at the front end | both |

### F. Credit and funding (6)

| ID | Name and definition | Why it matters | Unusual when |
|---|---|---|---|
| F01 | HY OAS level, `d20` (3y window; ICE from 2023-10) | credit stress | `pct756 >= 90`; `d20 > +30 bp` (today +33) |
| F02 | CCC OAS minus HY OAS, and CCC `d20` | quality dispersion inside HY (CCC 99th, +68 bp today) | CCC `d20` top 5% while IG `d20 < 15 bp` |
| F03 | BAA10Y and BAA-AAA quality spread (1986 ->) | the long-history credit regime used by edges | `pct` extreme; `d20 > 0` for regime change |
| F04 | HYG/IEF and LQD/IEF 20-day ratio change (2007 ->) | proxy spread with full history | `|z(d20)| >= 2` |
| F05 | IG vs HY divergence: IG `d20 < 5 bp` while HY `d20 > +25 bp` | credit tiering | rule |
| F06 | Financial CP minus fed funds (`cpSpread`), NFCI, STLFSI4 | unsecured funding / conditions | `pct` extreme |

### G. Prices and cross-asset (6)

| ID | Name and definition | Why it matters | Unusual when |
|---|---|---|---|
| G01 | Index drawdown from 52-week high and 20d return (NQ, SPX500, US30, US2000, DE30, UK100) | S&P 20d fall conditions the FX/idx range edges | 20d fall <= -5% |
| G02 | G8 cross-section dispersion: SD of 20-day returns of the 8 currency indices (from the 28 crosses) | rotation vs broad dollar | `pct756` extreme |
| G03 | Gold vs dollar divergence: gold `d20` and DXY `d20` both up | usual inverse | both |
| G04 | EM FX stress count (`history.fx.emStress`, 11 EM currencies down >= 2% in 20d) | EM funding | count >= 4 |
| G05 | Copper/gold and Brent - WTI, crack spread | growth vs safety, energy | `pct` extreme |
| G06 | Breadth proxy RSP/SPY and semis relative (drill bundle) | leadership narrowing | 20d change in top 5% |

### H. Daily run, backtests, data health (6)

| ID | Name and definition | Why it matters | Unusual when |
|---|---|---|---|
| H01 | Desk Pack data quality: `usableShare`, `stale`+`empty` counts, named gaps, each feed's `ageH` vs `maxAgeH` | "the data from the daily run" | `usableShare < 0.9` or a gap persists 3 days |
| H02 | Feed freshness: `/api/data-health` states dead/stale; laptop-pushed feeds (skew, xccy, spread legs, feature store) age | silent decay | any feed `stale` that fed a firing watch item |
| H03 | Forecast hit-rate drift: `/api/vol-forecast/hit-rates` 90-day above-p75 share vs nominal 25% per instrument; `forecast-scorecard` pinball | forecast quality | share outside binomial 95% band |
| H04 | Forward-record drift: forward results of live shadows (`spread_episodes_v1`, `forward/direction_ledger`, `vix-signals-forward`) vs their registered backtest interval | a backtest that stops holding | forward point outside the backtest CI for 20 events |
| H05 | Edges active today: `state.edges` count and stacking (`forecast-miss-shock-*`, `vix-inversion`, `nq-down-week`, `gex-range-es`) | which validated edges are on | count >= 3 simultaneously |
| H06 | Analyst scorecard drift (`/api/analyst-scorecard`, 8 analysts; interim, 2 scored days) | which analyst skills are drifting | not triggered until >= 20 scored days (building) |

**Count: 72** (A 10, B 10, C 14, D 10, E 10, F 6, G 6, H 6). The first-build subset is in section 5.

---

## 3. Question templates (22)

Written in the C.OG register (research-director): construct, condition on the extreme, sweep horizons, noise
threshold, outcome distribution, benchmark with control and mirror. Each has a frozen spec the Data Agent fills with
the live item and instrument. "QT" means the existing quick test (`js/quickTest.js`): X and Y from its whitelist, X
transform (`level, chg1, chg5, chg20, z60`), walk-forward top/bottom quintile of X (expanding, >= 250 days), forward Y
close change at horizons from {1, 2, 5, 10, 20, 60}, 60/40 discovery/test split, block bootstrap (seed 20261104,
B=500), Holm over horizons, lockbox cut at 2026-08-21, minimum 750 overlapping days. "Range runner" means a script on
London-session M1 or NY-close D1 high/low (`forge`, `scripts/`, harness `runStudy`), which needs the R2 M1 or the
committed NY-close parquets. Nearest ledger ids are the floor each question stands on.

Defaults for all: noise threshold from the placebo (shifted dates, all-shifts) and the control's SD; outcome read as
the full distribution across horizons, not a hit-rate; benchmark = unconditional forward distribution of the same
target (and, for range, the shipped IV-adjusted line); mirror = the opposite extreme (bottom 5% vs top 5%) and the
disagreeing instrument; session-date-clustered block bootstrap; Holm across the horizon family; BH q = 0.10 across
any disaggregation.

| # | Question (C.OG register) | Pre-registered spec: variable / condition / horizons / benchmark / min n / outcome | Runner | Nearest ledger |
|---|---|---|---|---|
| T1 | "Build how far a Cboe or CME dealer-gamma flip sits from price, as % of spot. When spot is within the closest decile of the flip, what happens to next-session range over 1, 2, 5 sessions against a same-vol random walk? Mirror: farthest decile." | `|spot - flip|/spot` (A02); decile 1 vs decile 10; 1/2/5 sessions; vol-matched DR; n >= 150 events per arm; DR with return controls | Range runner (extends `oi_research_book/scripts`); Cboe chains only after ~Q2 2027, CME book now | `gex-range-es` (validated, +0.15 controlled), `gex-range-iv` (underpowered), `zero-gamma-distance` (prereg exists) |
| T2 | "Build the share of the Cboe and CME books in short gamma. When 7 of 8 underlyings are in BREAKOUT, does the 1-5 day realised range of NQ exceed what VXN prices?" | count in BREAKOUT (A03); >= 7 of 8; 1/2/5/10 sessions; benchmark = `RV / VXN` unconditional; n >= 200 days | Needs new runner and history (Cboe 16 days; parked until n) | `gex-range-es`, `gex-split-book` null |
| T3 | "Take the put/call OI ratio per pair at its 5% extreme in its own 1-year window. Over 1, 5, 20 sessions, what is the distribution of forward return and range against all days? Mirror: the other extreme." | `pcRatio` (A06); `pct252` extreme; 1/5/20; unconditional; n >= 100 per tail pooled over 7 products, clustered by date | Range runner on `daily_master_all_*` (2020-09 -> 2026-08-21); direction part via QT only if added to catalogue | `gamma-real-iv` null, `wall-placebo` null: range/ret both new, direction expects null |
| T4 | "Construct COT spec share per currency relative to its own history. At the 95th/5th percentile, sweep 1, 4, 13, 26 weeks: what happens to the forward move, split by whether price is trending with the crowd (state D) or against? Control: matched non-crowded weeks." | `specShare` pct156 (B01) with trend state (13w); weekly horizons; matched controls; n >= 60 events per cell | Existing programme (`scripts/cot-crowding-programme/`, `js/cotState.js`); QT cannot (weekly, < 750 days) | `cot-crowding-p5` (validated), `positioning-into-release-direction`, `cot-crowding-slope-*` (underpowered) |
| T5 | "COT crowding into a high-impact release: for the currency pair whose leveraged fund is at its 90th percentile, does price on release day move against the crowd by more than on matched non-crowd release days? Add: does it persist 1, 2, 5 sessions?" | B09; release days in covered calendar (<= 2026-07-02 only); 0/1/2/5 sessions; matched release days; n >= 80 | Extends `positioning-into-release-direction` runner; **calendar tags after 2026-07-02 unknown** | `positioning-into-release-direction` |
| T6 | "Build the Treasury leveraged-fund share (TFF) and its 13-week change. At the 95th percentile, does 2y/10y yield 20-day vol or FX range exceed the forecast?" | B04; 13w build; vol of `d1(DGS2)` next 20 sessions; benchmark: trailing 20d vol; n >= 80 weekly events | New runner (forecast-miss harness, `scripts/funding-forecast-error`) | `funding-forecast-error-levbuild` (underpowered), `cot-crowding-p5` |
| T7 | "Condition on VIX9D/VIX and VIX/VIX3M together. Sweep the next 1, 5, 10 sessions of NQ/SPX range against the shipped IV-adjusted line. Which side of the cut-off carries the effect, and what is the noise threshold?" | C02; fixed cut-offs 0.8858 / 0.9669 plus inversion; 1/5/10; shipped line; n >= 150 | Range runner (the `vol-curve-front` / `us-extras-confirm` harness) | `vol-curve-front`, `vix-inversion`, `us-extras-confirm` (all validated). Incremental question only |
| T8 | "Model VVIX per VXN and its rate of change. At an extreme of dR/dt, over 1, 5, 20 sessions, what is the distribution of Nasdaq range and the VIX give-back? Control: SPX." | C05; extreme of the 5-session change; 1/5/20; benchmark = unconditional; n per banked prereg | Existing (`scripts/vix-signals-forward`, forward record from 2026-10-26) | `vvix-ratio-range`, `vix-beta-change`, `vix-second-derivative` (validated), `vvix-ratio-direction` (underpowered) |
| T9 | "Construct SKEW against VIX. When SKEW is in its top 5% of its own year while VIX is falling, what do the next 5, 10, 20 sessions of SPX range and drawdown look like? Mirror: SKEW low, VIX rising." | C06; `pct252 >= 95 and d5(VIX) < 0`; 5/10/20; benchmark all days; n >= 100 | QT for return/drawdown (needs `cboe:SKEW` added to catalogue); range via Range runner | none directly (`skew-fade` null is CVOL-based, different object) |
| T10 | "Build ln(implied/realised) for VIX vs SPX, VXN vs NQ, GVZ vs gold. At the top and bottom 5% of its own history, sweep 1, 5, 20 days: does realised range converge to implied (calms) or does the gap persist? Control: FX." | C07; extremes of `ln(IV/RV20)`; 1/5/20; benchmark = IV forecast; n >= 100 per tail | Range runner on committed NY-close D1 | `iv-over-rv-wider` (validated), `iv-forecast`; extension to GVZ/gold and the bottom tail is new |
| T11 | "Vol of vol with vol still low: VVIX in its top 5% while VIX is below its 80th percentile. Sweep 1, 5, 10, 20 days: does VIX or range expansion follow? Mirror: VVIX low, VIX high." | C04; `pct252(VVIX) >= 95 and pct252(VIX) < 80`; 1/5/10/20; unconditional VIX change; n >= 60 events (rare: report as UNDERPOWERED if less) | QT (`fred:VIXCLS` Y; VVIX X not in catalogue: add `cboe:VVIX`) | `vix-signals-forward` family; nearest new |
| T12 | "Construct 2s10s and 3m10y. On the first day the sign flips and holds three sessions, sweep 5, 20, 60, 120 days: what happens to NQ, USDJPY, gold, and to range? Control: random flip dates; mirror: re-steepening." | E01/E02; sign flip held 3 sessions; horizons 5/20/60/120 (QT max 60); matched dates; n small (a handful of flips since 2000) | QT for 1-60 days (`fred:T10Y2Y` in catalogue; `T10Y3M` to add); 120 days new runner | `curve-inversion` (null), `macro-confluence-*` (null/underpowered): must state new mechanism or park |
| T13 | "Steepener/flattener class (bull/bear): condition on which leg moved. For each class and 20-day move at its 90th percentile, what is the next 5, 20 days of the dollar and gold? Mirror: the other class." | E04; 4 classes x extreme; 5/20; unconditional; n >= 80 per class | QT with condition (X = `chg20` of DGS2, condition DGS10) approximates; classes need small extension | `yield-ladder-eurusd/nq` (underpowered), `rates-spread-asset-lead` (null as a lead) |
| T14 | "Yield-asset divergence: when the US 2y 20-day move and the dollar's 20-day move are in a normally-correlated pair but diverge by more than 2 SD of the 60-day residual, does the gap close in 5, 10, 20 days? Control: shifted-spread placebo." | E06; residual z; 5/10/20; placebo; n >= 100 episodes | New runner; dyn-lead already did a large version (28,560 cells) | `rates-spread-asset-lead`, `cog-dynamic-lead` (null; real counts = placebo): **re-asking needs a new mechanism; this question defaults to "context only" unless the owner overrides** |
| T15 | "Credit tiering: CCC OAS 20-day change in its top 5% while IG is calm. Over 5, 20, 60 days what happens to equity range and credit? Control: HYG/IEF (2007 ->) over the longer sample." | F02/F05; 3-year ICE window only for OAS (n small), HYG/IEF for long run; 5/20/60; unconditional | QT (`fred:BAMLH0A0HYM2`, 3y so UNDERPOWERED by rule; HYG/IEF X needs catalogue addition) | `hy-spread-vol` (context), `credit-leads-equities` (null), `macro-confluence-baa-credit` (null) |
| T16 | "Funding plumbing: SOFR - IORB above 5 bp away from month-end, or CP - fed funds in its top 5%. Sweep 1, 5, 20 days of index and FX range against the forecast." | D04/F06; threshold; 1/5/20; shipped line; n small | Range runner (`funding-forecast-error` harness) | `funding-stress` (null), `funding-forecast-error-*` (underpowered): re-ask only for the new `plumbing` set |
| T17 | "Realised range vs the shipped line: when the last 5 sessions all exceeded the p75 line, what is the next-session range ratio over 1, 2, 5? Is persistence in forecast errors beaten by the IV-adjusted line? Mirror: 5 sessions all below p50." | C12; streak rule; 1/2/5; benchmark = IV-adjusted forecast; n >= 200 | Range runner (`vol-layer`, forecast-scorecard) | `forecast-persistence-fix`, `vol-layer-rv5-increment` (validated): incremental |
| T18 | "Cross-asset vol breadth: when 6 or more of ten vol indices are above their own 90th percentile, sweep 1, 5, 20 days of FX range. Compare with VIX alone." | C09; count >= 6; 1/5/20; benchmark = VIX-only condition | Range runner; indices 2009 ->; `cboe:*` series into catalogue | `forecast-miss-scan` (context), `forecast-miss-shock-fx` (validated): the breadth increment is new |
| T19 | "Bond vol vs equity vol: MOVE/VIX in its top and bottom 5% of its year. Sweep 5, 20, 60 days of 10y yield, SPX and gold." | C10; extremes; 5/20/60; unconditional; n >= 100 | QT (MOVE in catalogue? no: add `yahoo:MOVE`/`cboe:VXTLT`) | none |
| T20 | "Net liquidity impulse (4-week change) at its extreme, with the units fixed (`js/netLiquidity.js`): sweep 5, 20, 60 days of NQ and credit." | D05; `d4w` extreme; 5/20/60; unconditional | QT (`fred:WALCL`, `WTREGEN`, `RRPONTSYD` are in the whitelist; combine needs derived X) | `liquidity-*` (reopened-heavy, G1 null): needs corrected-units framing; state as RE-RUN family |
| T21 | "Forward record: a frozen rule from any queue question recorded from its suggestion date. After n events, does the forward distribution fall inside the historical interval?" | the question's own spec + `watchVersion`; checks at n = 10, 20, 40 events | Data Agent scorer (new, R2 `forward/data_agent/`) | `vix-signals-forward`, `forward/direction_ledger` are the pattern |
| T22 | "Control question (every batch): the same trigger on shifted dates (+-1, +-5, +-20 sessions) and on a placebo series (a watch item chosen because it should not matter, e.g. a sector ETF ratio vs FX range). What does the noise threshold look like?" | per question; all-shift and single-shift; same horizons | QT (placebo) / Range runner | `wall-placebo`, `range-ladder-placebo-confirm`: placebo conventions |

Parked until data exists: Cboe-chain gamma percentiles and T2 (history 16 days; expected usable ~Q1-Q2 2027), FX skew
(1 point; the capture needs a schedule), rates vol (16 days), CME IV vs RV percentiles (history from 2026-07-30; ~250
days by August 2027), ICE credit before 2023-10 (not obtainable). **Anything that scores sessions after 2026-08-21 goes
to the owner as a lockbox-gated decision (open question 3).**

---

## 4. Architecture

### 4.1 Pipeline

```
 inputs (read-only)                      Data Agent (rules, no model)                         owner / automation
 ------------------                      ----------------------------                         ------------------
 /api/state, R2 archive/*      1 snapshot job   ->   R2 forward/data_agent/snap/<date>.json
 /api/desk-pack, data-health   2 anomaly scan   ->   watch-item states + fired triggers
 cboe_raw, oi_store, cot, iv   3 question writer (templates, rules)  ->  KV data_agent_queue_v1
 vol_forecast/vol_session,     4 screen: Evidence Book / register / dedupe / data-ready check
 forward ledgers, Evidence Book                                                           5 owner picks (or rule)
                               6 historical replay   ->  KV data_agent_replay_v1  <-----  quick test (QT) / range runner
                               7 hand-off:  queue -> research case (librarian -> researchers -> Head)   or  QT
                               8 scorecard: forward record from suggestion date  ->  R2 forward/data_agent/score/
```

1. **Snapshot job.** Pure module `js/dataAgentSnapshot.js` takes the same inputs the state engine reads (reuse
   `js/stateSources.js`, `js/stateHistorySources.js`, `js/stateLayers.js`; do not duplicate fetchers) and returns one
   JSON: for every watch item `value, asOf, knownAt, source, pct252, pct756, pctAll, z, d1, d5, d20, streak, since,
   inputsStale`. Percentiles are computed causally here (strictly before today; never copied from `/api/state`, whose
   `pctAll` includes today). Written once per day to R2 `forward/data_agent/snap/<YYYY-MM-DD>.json`, never overwritten
   (same rule as `js/directionLedger.js`: "a day the job missed stays a gap"). The snapshot also stores the code
   `watchVersion` and the inputs' `asOf` per item.
2. **Anomaly scan.** Pure function of the snapshot and a short window of earlier snapshots: applies the frozen triggers
   (section 2), writes `fired[]` with item, trigger type, strength (pct, z), and `scanBreadth` (number of items
   scanned that day, including the building ones).
3. **Question writer (rules).** One template per trigger family (the 22 in section 3), filled with the live item,
   instrument(s), the dates, the horizons, and the pre-set spec text. The statement is two to four lines in C.OG's
   register, built from slots; no model. Optional later: a capped DeepSeek tidy of the wording only (4.7).
4. **Screen.** Before a question is queued: (a) match against the Evidence Book and register by keyword and ledger id
   (reuse `evidence_map.mjs`'s matcher or `js/deskEvidence.js` directly) and attach "already answered: <ids>"; a question
   that re-asks a banked null is queued as "context only" unless a `newMechanism` string is present; (b) data-ready check
   against the inventory (min overlap, history length, lockbox); (c) dedupe against open questions (same item and
   family within 20 sessions). Questions that fail (b) are queued as "parked: <date or n>".
5. **Queue** (4.2). 6. **Replay** (4.3). 7. **Hand-off** (4.5). 8. **Scorecard** (4.4).

### 4.2 The question queue (storage)

- KV key **`data_agent_queue_v1`**: `{ version, updatedAt, questions: { <id>: { id, createdAt, watchVersion, item,
  trigger, statement, spec, status ('new'|'picked'|'sent-case'|'sent-qt'|'parked'|'context'|'dismissed'|'done'),
  screen: { answered: [ledgerIds], dataReady, parkedUntil }, replayId, caseId, qtId, ownerNote } } }`. Capped at 200
  open questions; resolved ones move to R2 `forward/data_agent/queue_archive/<YYYY-MM>.json`.
- KV `data_agent_replay_v1`: replay results (4.3) by question id. KV `data_agent_state_v1`: last run, last snapshot
  date, errors. Snapshots and the forward record live in R2 under `forward/data_agent/` (a daily file cannot outgrow KV).
- **Register each KV key in three places** (the pattern `js/agentRegistry.test.mjs` enforces for `research_pod_quicktests`
  and agent cap keys): `kv.js` (the allowed-key list), `_worker.js` (both lists, around lines 99 and 1160), and
  `js/storeRegistry.js` (a `L(...)`/`R(...)` entry with retention days and `{ market: false }`). A fourth place for the
  scheduled job: a row in `js/serviceFlags.js` (`id: 'dataAgent'`, `where: 'server'`), because `svcInterval` of an
  unregistered id runs ungated and logs loudly, and `js/serviceFlags.test.mjs` fails the commit that forgets it.
- Routes (new, `GET /api/data-agent/{state,queue,snapshot?date=,replay?id=}`, `POST /api/data-agent/{pick,dismiss,run}`);
  the POST routes need auth like the existing research-pod POSTs. None call a model.

### 4.3 Historical performance of a suggested question, and the snooping controls

"See how the suggested questions performed over a historical period" is two different things, kept apart:

- **Replay (screening, exploratory).** The question's trigger rule is evaluated on every past date with walk-forward
  windows (the quick test's approach: percentile from data before each day, >= 250 days burn-in, refreshed every 21),
  and the outcome distribution at each horizon is read against the unconditional benchmark with a bootstrap interval,
  Holm across the horizon family. Output is labelled "exploratory, not pre-registered" and never written to the Evidence
  Book. Data cut at 2026-08-21 (the lockbox) in the replay; the code path that loads data takes an explicit `to` and
  cannot see later sessions.
- **Forward record (the real test).** From the suggestion date, the frozen spec is recorded; outcomes are filled as each
  horizon closes (the `directionLedger.js` pattern: write once, resolve later, never back-issue). The forward record is
  the only clean out-of-sample data left (MARKET_STATE_ENGINE_PLAN section 4 phase 3).

**Data-snooping controls**

1. **Frozen watch list and triggers** in one versioned file; a change bumps `watchVersion` and starts a new forward
   record. The denominator of the search is recorded every day (`scanBreadth` x triggers).
2. **Monthly full sweep.** Once a month, run the replay for every watch item at its generic trigger, not only for those
   firing today. A suggested question's replay effect is then reported with its rank inside the sweep (the maximum of 72
   items is the null reference; E[max of N noise variants] is the bar, search-breadth rule) and a date-shifted null
   (all-shift placebo). A question the sweep ranks inside the noise band is queued "context".
3. **Every sent question is a trial.** A quick test result is already stored in `research_pod_quicktests`; the Data
   Agent additionally writes one rolling register row per month (`data-agent-<YYYY-MM>`, status `EXPLORATORY`) and an
   `analysis/output/data-agent/<YYYY-MM>/` index of every question sent, so the trial ledger's count of looks is honest
   (research-protocol: "bank everything you score"; exploratory looks get a register row). Verdicts that matter are
   re-run as a registered prereg on fresh data and banked through research-protocol; `node scripts/build_trial_ledger.mjs`
   then counts them (the ledger is 301 tests with 51 validated; ~15 would be validated by chance at 5%).
4. **Correction.** Holm across the horizon family inside a question (already in QT); BH q = 0.10 across all questions
   run in the same calendar month; a question is "worth a prereg" only if it survives both, has |t| >= 2 in the second
   half, clears its placebo, and its sweep rank is in the top decile. Promotion to anything live still needs |t| >= 3 or
   a passed forward test (`stats-defaults.md`).
5. **Controls built in:** mirror (opposite extreme), a placebo series, one-session delay, concentration by year (no
   single year >= 40% of the effect), shifted dates.
6. **Lockbox.** Replay and the quick test cut at 2026-08-21. The forward record is, by construction, after the lockbox
   date. The rule proposed (open question 3): the Data Agent records forward outcomes but does not display or use forward
   scores in any decision until `python -m forge.lockbox_check --evaluate` has run once (expected late November 2026).
   After that, scoring forward data of the Data Agent's own questions is not scoring layers 3, 5, 6 and is allowed.
   Also: H-B (shadow sessions from 2026-10-07): nothing may change because of what the shadow screens show; the agent
   suggests, it does not alter any live line.
7. **No model in stage 1** removes one snooping route (a language model choosing which of the day's extremes sounds
   interesting). The writer is a lookup into frozen templates.
8. **Direction questions rank last.** Evidence Book (2026-11-03): macro direction 0 of 82 validated, price 13 of 76, range
   27 of 86. The queue sorts range/vol questions first, direction questions carry a "direction: low prior" tag, and any
   direction question needs the pooled/cross-sectional design (REPO_REVIEW section 5) or is queued "context".

### 4.4 Scorecard

For each question that was sent: replay result (frozen at suggestion), forward events so far (n, hit rate or effect,
interval, vs replay interval), status `inside / outside / building`, and the watch-level view: of all questions the
agent has written, how many forward-confirmed (a calibration curve of the agent itself). Weekly roll-up appears on the
agent's page. It is descriptive until >= 20 events per question, as with the analyst scorecard.

### 4.5 Hand-off to research

- **To a research case:** the queue question text plus its spec, screen result (ledger ids) and snapshot values becomes
  the case question. The existing case intake is the pod's `POST /api/research-pod/run { brief }` and
  `POST /api/research-pod/case/from-dossier`; there is no "open a case from text" route, so a small new route
  `POST /api/data-agent/send { id, to: 'case' }` calls the same `_rpStart` path. Running the case spends model money, so
  it stays an owner action (the Head review is already "never automatic").
- **To a quick test:** `POST /api/research-pod/quick-test { x, y, horizons, xTransform, condition, proposalId }` with
  `proposalId = dq-<id>`, so the result links back. The QT catalogue (78 series) must be extended through the server
  loader `_qtLoad` (a whitelist of source functions): add `cboe:*` (archive), `yahoo:MOVE`, spreads (`T10Y3M`,
  `DGS3MO`, `DGS5`, `DGS30`), ratios (HYG/IEF), and COT only via a weekly mode. That is a change to `js/quickTest.js` and
  `server.js`, so it is not done this round.
- **Never auto-run in stage 1.** A queue entry only moves when the owner presses a button (open question 5).

### 4.6 Schedule

A `svcInterval`-style job like `deskScore`: weekdays after the close, **after the desk's evening score (>= 21:10
London) and after the Cboe chain archive**, at about 22:30 London (BST-safe: use the London clock, not a UTC hour). A
second light run on Friday after 20:30 UTC for the COT release. `_archiveDaily` is a 24-hour interval from boot, not a
clock time, so the Data Agent must read the archive as it is and record `inputsStale` rather than assume it is fresh.
The snapshot job must not run the heavy `/api/state` build more than once; read the 10-minute cached document.
Cost of running: server CPU for ~72 items, one `/api/state` read, a few R2 reads/writes per day (`forward/data_agent/`).
Weekly: the monthly sweep on the first Saturday.

### 4.7 Cost

Stage 1: **none** (no model call, no paid data). Optional stage 5: a capped DeepSeek wording tidy for the queue
(`modelTask` e.g. `data-agent-tidy` with `defaultProvider: 'deepseek'`, `cheapSafe: true` like `desk-news`), with a
hard cap key following `js/libraryLibrarian.js` (`LIBRARIAN_CAP = 400` calls) and `js/agentRegistry.js` `cap` shape,
e.g. `{ key: 'data_agent_tidy_v1', cap: 600, label: 'wording tidy calls' }` registered in the same three places. The repo
holds no configured price (`costOf` returns `priced: false` without one), so I give no dollar figure; the cap bounds it.
The tidy may reword a statement, never change its spec, items, horizons or numbers (the spec block is stored separately
and shown beside the text).

### 4.8 Agents tab (proposal only; do not edit `js/agentRegistry.js` this round)

`GROUPS` is `['Research','Library','Desk','News','Tests']`; the owner wants the Data Agent standalone, so propose a new
group **`'Data'`** (touches `GROUPS`, `js/agentsTab.js` styling, `js/agentRegistry.test.mjs` group check). Entries
(shape from the file's `A(id, name, group, o)`):

```js
A('data-agent', 'Data agent', 'Data', {
  purpose: 'Watches the desk\'s data (daily run, backtest outputs, options OI and gamma, COT, volatility, rates and yield spreads) with fixed rules, and writes suggested research questions to a queue. No model call. It suggests; it never changes a live line.',
  trigger: 'Weekdays after the evening score (about 22:30 London); Fridays again after the COT release.', job: 'dataAgent',
  reads: ['Market State document', 'Desk Pack and data health', 'R2 data archive', 'Cboe chains and CME OI capture', 'Evidence Book'],
  writes: ['data_agent_queue_v1 (questions)', 'R2 forward/data_agent (snapshots, replay, forward record)'],
  modelTask: null, spends: false, links: [L('Data agent', 'data-agent.html')],
}),
// optional later:  A('data-agent-tidy', 'Question wording tidy', 'Data', { modelTask: 'data-agent-tidy', spends: true, cap: CAP.dataAgent, planned: true, ... })
```

Points (non-agent boxes): `market-data` (source: 'State document, archive, chains, COT'), `question-queue` (store: KV
`data_agent_queue_v1`), `forward-record` (store: R2 `forward/data_agent`). Existing points reused: `owner`,
`evidence-book`, `case-store`, `quick-test` (agent), `desk-pack`, `score`.

Edges (`E(from, to, label, kind, opts)`): `desk-pack>data-agent` 'daily-run data'; `market-data>data-agent` 'series';
`score>data-agent` 'scored day'; `evidence-book>data-agent` 'screen against what is known'; `data-agent>question-queue`
'suggested questions'; `question-queue>owner`? (the owner reads the queue; use `owner>question-queue` control 'pick' as
in `owner>case-store`); `question-queue>case-store` control 'send to a research case', `question-queue>quick-test` control
'send to quick test'; `quick-test>question-queue` 'result'; `data-agent>forward-record` 'frozen spec and outcomes';
`forward-record>question-queue` 'scorecard'. Flow (named like `G(...)` in `FLOWS`): `data-watch`, grid left to right:
`market-data, desk-pack` (col 0) -> `data-agent` (col 1) -> `question-queue` (col 2) -> `owner` (col 3) ->
`quick-test`, `case-store` (col 4) -> `forward-record` (col 5); `evidence-book` feeds `data-agent` from row 2. The existing
`research-case` flow stays as is; the queue joins it at `case-store` and `quick-test`. Registry tests that must keep
passing: every edge end exists, model tasks exist, cap keys are registered KV keys.

### 4.9 Reuse and new code

Reuse: `js/stateEngine.js`/`stateLayers.js`/`stateHistory.js` (percentile logic as reference only), `js/cotState.js`,
`js/dataArchive.js` (read), `js/deskEvidence.js`, `js/preregStats.js` (`holm`, `benjaminiHochberg`, `mdeMeanDiff`),
`js/harness/stats.mjs` (`clusteredBlockBootstrap`), `js/quickTest.js`, `js/directionLedger.js` (the forward-record
pattern), `analysis/lib/eventBootstrap.mjs`. New: `js/dataAgentCore.js` (pure: items, states, triggers, templates,
screen), `js/dataAgentRoutes.js`, tests, `data-agent.html` (queue, state, scorecard), the registry entries above.

### 4.10 Phased build plan

| Phase | What | Size | Notes |
|---|---|---|---|
| P0 | Freeze the watch list and trigger file; causal state module (`dataAgentCore.js`), tests on synthetic series (a planted extreme must fire, noise must fire at the nominal rate) | S: 2-3 days, ~600 lines + tests | no I/O |
| P1 | Snapshot job + R2 `forward/data_agent/snap/`; anomaly scan; first 25 items (the top 10 in section 5 plus their neighbours); service flag + KV keys in three places; `GET` routes | M: 4-5 days | needs R2 reads and the state document; no Cboe percentiles yet (sign only) |
| P2 | Question writer (22 templates), screen against Evidence Book/register/data-ready, queue + page `data-agent.html` | M: 4-5 days | templates are text; screen reuses `evidence_map` logic |
| P3 | Replay engine: extend the QT catalogue and loader (`cboe:*`, `yahoo:MOVE`, spreads, ratios); range runner on the committed NY-close parquets and `daily_master_all_*` for the CME-based questions; monthly full sweep | L: 8-10 days | the heavy part; Cboe-chain questions stay parked until history exists |
| P4 | Hand-off routes (to case, to QT), forward-record writer and scorer, scorecard, Agents tab entries (`GROUPS` + entry + edges + flow) | M: 4-5 days | registry tests |
| P5 | Remaining watch items to 72; weekly COT run; data-health integration | M: 3-4 days | |
| P6 (optional) | Capped DeepSeek wording tidy | S: 2 days | owner call; cap in three places |

Total about 5-6 weeks of one session's work for P0-P5; stage 1 delivers value after P2 (a daily list of fixed-rule
flags and well-posed questions) with no replay yet.

---

## 5. Recommended first build (top 10 watch items)

Chosen for: data already in hand with >= 3 years of history, a validated or at least well-motivated range mechanism
(so the question can be answered by existing machinery), and low overlap with banked nulls.

1. **C02** VIX term (VIX9D/VIX, VIX/VIX3M): three validated range edges; history from 2009/2011.
2. **C05** VVIX/VXN ratio and dR/dt: validated; forward record already running (`vix-signals-forward`).
3. **C07** IV minus RV (VIX/VXN/GVZ vs realised): validated; extends to GVZ and the bottom tail.
4. **C12** Realised HL vs shipped p75 line (the daily run): drift of the system's own forecast; data in `vol_*` since June.
5. **B01-B03** COT spec share extremes (FX, indices, metals/energy) with crowd state D (B06): validated states; weekly; deep csv.
6. **B09** crowd into a high-impact release: validated direction result; calendar covered to 2026-07-02 (a limit to state).
7. **A02/A03** gamma flip distance and PIN/BREAKOUT breadth: validated ES/NQ range effect; sign only until Cboe history exists.
8. **E01/E02/E04** 2s10s and 3m10y flips and steepener/flattener class: 50-year history, cheap, but inversion and curve-to-asset nulls
   are banked, so these are state labels and conditioning variables for range, not direction claims.
9. **C09** cross-asset vol breadth (10 vol indices): history 2009 ->; new angle, "relative to its own distribution".
10. **H01/H02** daily-run and feed health: zero statistical risk, immediate value (laptop-pushed feeds go stale silently).

**What the rules would flag today** (a worked example from read-only GETs on 2026-11-08, not a result): VIX 25.64
(87th pct 5y, 84th all-history) and VIX term 1.04 (97th pct since 2009); VVIX 122 (95th); SKEW 153.6 (98th all-time
history); OVX 58 (94th), GVZ 26 (93rd), VXEEM 34 (93rd); DSPX 40 (96th) and VIXEQ 47 (97th); realised vol percentile >=
99 for NQ, SPX500, US30, US2000, EURCHF, AUDNZD; CCC OAS 13.2 (99th, +68 bp in 20 days) while IG sits at the 72nd; HY +33
bp; 7 of 8 Cboe underlyings in short gamma/BREAKOUT (SPX flip 3.5% above spot); COT: US 30y spec share 99th pct, RBOB
98th, NQ 97th (crowded against the trend), EUR spec net at 0th with commercials at 100th, PALL 5th; US 2y -28 bp in 20
days. A large share of the vol (C), credit (F) and crowding (B) items would have fired together; that clustering is why the monthly sweep and the per-day `scanBreadth` count matter.

---

## 6. Open questions for the owner (8)

1. **Scope of "daily run" and "backtest outputs".** Do you mean the 06:55 desk run and its Desk Pack (134 feeds) plus the
   volatility forecast run, and for backtests the Evidence Book and forward ledgers, or also each backtest's
   `analysis/output/<slug>/results.json`? *Default:* the Desk Pack, `vol_*` records, forward ledgers and the Evidence Book;
   individual `results.json` are read only when a question cites them.
2. **Percentile windows and what counts as extreme.** *Default:* 1-year and 3-year own-history windows (weekly: 52/156),
   extreme = 95th/5th on both windows, robust z >= 2 for speed; frozen in one file; a change starts a new forward record.
3. **Lockbox rule for forward scoring.** The forward record is after 2026-08-21 by construction. *Default:* the agent
   records outcomes but shows no forward score and makes no decision from it until the one lockbox evaluation has run
   (expected late November 2026); replays stop at 2026-08-21.
4. **Where the agent lives on the Agents tab.** *Default:* a new group "Data" (standalone, as you said), not under Research.
5. **Who sends a question onward.** *Default:* owner only, by button, in stage 1; no automatic quick tests or cases
   (cases spend model money; the Head review is already manual). Revisit after the first month of queue quality.
6. **Cap on questions per day and banking of exploratory looks.** *Default:* at most 5 new questions a day (fired
   triggers beyond that are logged, not queued), one rolling register row per month for all quick looks, and nothing
   banked as validated from a replay; a promising question is re-run as a registered prereg on fresh data.
7. **Laptop-pushed feeds (FX skew, cross-currency basis, SOFR-Euribor legs, feature store).** They have no schedule on
   the server and are stale or empty on production today. *Default:* include them as "building/stale" items with
   freshness alerts only; a separate decision to automate them (R2 copy of the feature store; xccy and skew pushes).
8. **Re-asking banked nulls (SOFR-Euribor, curve inversion, spread-to-asset leads).** *Default:* queue them as "context
   only" with the ledger ids shown, and require a stated new mechanism before they can be sent; the Data Agent never
   proposes them as trade ideas.

---

## 7. Sources read for this document

`plans/DATA_ASSET_MAP.md`, `ENGINE_DATA_MAP.md`, `MARKET_STATE_ENGINE_PLAN.md`, `DATA_SPEC.md`, `RATES_NASDAQ_WORKLOG.md`,
`FEATURE_MANIFEST.json`; `js/dataFeeds.js`, `dataArchive.js`, `agentRegistry.js` and its test, `quickTest.js`,
`directionLedger.js`, `storeRegistry.js`, `serviceFlags.js`, `modelRouter.js`; `server.js` (`_QT_KEY` block at 7853,
`_AI_JOBS` at 557, `_archiveDaily` at 43951, spread episodes at 8478, research-pod routes 6089-6330);
`analysis/output/{iv_term,cot-crowding-programme,cog_yield_dir,stir}/`, `analysis/surfaces/cboe/`,
`oi_research_book/data/`; the skills `data-rules`, `research-protocol`, `research-director`, `cog-knowledge`; and the
production GETs listed at the top. Nothing in this file contains real data beyond cited statistics; no data files were added.
