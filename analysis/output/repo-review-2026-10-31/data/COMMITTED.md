# What data the MacroFXModel repo actually holds

Inventory date: 2026-10-31. Repo files were only read, never changed. The full table is
`committed_datasets.csv` in this folder: 170 datasets, 17 columns.

## Method and caveats

- **Files scanned.** The scan found 1,825 data files: parquet, csv, csv.gz, jsonl, pkl, db, sqlite and npz files, plus
  JSON files over 50 KB. `node_modules`, `.git` and `package-lock.json` were excluded. Together these files hold
  1,640 MB.
- **How each file was profiled.** Every file was opened with pandas, pyarrow or json to get its row count, columns and
  first and last dates. The rows and dates in the CSV come from the data itself. The frequency comes from date spacing
  and was corrected by hand where the guess was wrong.
- **How files were grouped.** Files were grouped into datasets by hand-written rules, which mark every RAW and DERIVED
  dataset. Any other file falls back to "one dataset per study folder".
- **Result files left out.** 21 study folders hold only results (results.json, summaries, cell grids). They come to
  11.6 MB and are not in the CSV, as the brief asked.
- **How consumers were found.** Consumers were found by searching 3,620 tracked code files for each dataset's path or
  filename. This search is a heuristic, so I checked it by hand:
  - **Live** (`consumers_live`) means a page, `server.js` or a `js/` module actually loads the file through fetch,
    readFileSync or path.join. I checked every live hit by reading the line that matched. Mentions in evidence or
    catalogue text (`js/deskEvidence.js`, `js/dataCatalogue.js`) do not count.
  - **Research** (`consumers_research`) is a looser match on the filename. It can overcount for generic names.
- **Producers.** The producer is the script that writes the file. For every RAW and DERIVED dataset I checked it by
  hand.
- **The one untracked file.** `VolRangeForecaster/data/m1/eurusd_m1.parquet` (63 MB) is on disk but **not tracked by
  git**. It is the only M1 file present: the R2 research cache holds 26 instruments. It is listed in the CSV with
  `last_commit = UNTRACKED`.

## Totals by class and tier (CSV rows)

| class | datasets | MB |
|---|---|---|
| RAW (reusable source data) | 40 | 396 |
| DERIVED (reusable feature or panel) | 25 | 74 |
| STUDY-INTERMEDIATE (only meaningful for one study) | 105 | 1,158 |

| tier | RAW | DERIVED | STUDY | MB |
|---|---|---|---|---|
| prices (M1, M15, daily, logs) | 6 | 7 | 77 | 1,231 |
| rates | 8 | 5 | 12 | 206 |
| positioning (COT, OI, gamma) | 3 | 3 | 9 | 105 |
| vol & options | 10 | 2 | 4 | 32 |
| events / calendar / surprises | 4 | 6 | 1 | 21 |
| FX (non-M1) | 1 | 0 | 0 | 14 |
| economy / macro | 1 | 1 | 2 | 7 |
| credit & funding | 3 | 1 | 0 | 6 |
| equities | 2 | 0 | 0 | 5 |
| liquidity & banking | 2 | 0 | 0 | 2 |

The repo's weight is in study scratch tables: 71% of the data bytes are STUDY-INTERMEDIATE. The macro tiers are held as
small, scattered files. Economy/macro is the thinnest. The only macro levels in the repo are:

- IFO (monthly);
- a regime table built from revised data;
- the calendar's actual and consensus values for **three economies only** (US, Euro Area, UK);
- the ForexFactory surprise archive.

None of these are CPI, PMI or GDP vintages.

## (a) The ten most valuable raw histories

1. **Cboe volatility indices** (`analysis/surfaces/cboe/`, 21 files): VIX daily from 1990 (36 years); VIX9D, 3M, 6M and
   1Y from 2007-11; VXN, VXD and RVX from 2009; VVIX, SKEW, VXTLT, GVZ and OVX; equity and EM vol indices. The values
   are closing levels that are never revised, with no duplicates. It is refreshed by
   `scripts/data/fetch_cboe_vol_indices.py`. **Not read by any live page**: live code uses copies.
2. **CME CVOL EOD** (`js/data/cmeCvolEod.json`): EURUSD, GBPUSD, USDJPY and XAUUSD from 2016-01; AUD, CAD and CHF from
   2018-10, where every row is flagged `limited`. It holds ATM vol, up/down variance, skew and convexity, and ends
   2026-08-20. CVOL is licensed data and CME blocks scripts with a 403, so this snapshot is **irreplaceable**. It is
   live through `js/impliedVolCore.js`.
3. **CFTC legacy COT, 34 markets** (`analysis/output/cot-crowding-programme/cot_weekly.csv`): weekly from 2006-06 to
   2026-10, covering FX, Treasury futures, equity indices, metals, energy and agriculture. It is point-in-time by report
   date and has no duplicate keys. Fault #16: JPY, CAD and CHF are stored in pair terms. It is the legacy report, not
   TFF.
4. **OANDA 15-minute closes including bond CFDs** (`rates_residual/m15/` and `rate-surprise-events/m15/`, 22 files,
   5.0M bars):
   - UST 2y, 5y, 10y and 30y, Bund 10y and Gilt 10y CFDs;
   - Brent, XAU, XAG, NAS100, SPX500, DE30 and 6 FX pairs.
   Most series run 2018-2026; EURUSD, NAS100 and the US 2y and 10y start in 2009-11. This is the **only intraday
   government-bond history** in the repo.
5. **IBKR short-rate futures at 1 minute** (`stir_1m_deep/` and `stir_1m_meeting/`):
   - SOFR futures (SR3) H, U and Z: about 900k bars each, 2024-04 to 2026-10;
   - Euribor futures (I) H and Z: 2024-04 to 2026-10;
   - €STR futures (ER3): from 2024-11;
   - fed funds futures (ZQ), five meeting months: 2024-11 to 2026-10.
   IBKR history depth is limited, so these are **hard to pull again**. The other legs are only weeks long.
6. **CME options OI by strike** (`oi_research_book/data/surface_*`, 14 files, 1.87M rows): call and put OI, volume and
   GEX for EUR, GBP, AUD, CAD, CHF, JPY and NQ, 2020-09 to 2026-09. It is the **only committed copy** of the raw OI;
   the R2 "OI Data" CSVs are not in the repo. Two derived tables come from it:
   - `iv_daily_*` (6 years of IV30, IV90, 25-delta risk reversal and butterfly);
   - `gamma_iv_*`.
   Caveats: faults #11 and #12 (no futures-to-CFD basis; OI is published on D+1).
7. **Economic calendar and surprises.** Two sources:
   - `calendar_events.csv`: 2014 to 2026-07-02, actual, previous and consensus, US, EA and UK only. 46,095 rows (45%)
     are exact duplicates.
   - `backfill/surprise_backfill.json`: 26,403 ForexFactory events, 2007 to 2025-04, global, using the live feed's
     taxonomy.
   Both are live. The Nasdaq continuation from 2026-07-03 has 5,112 rows.
8. **Daily government curves for several countries** (`analysis/output/dynlead/yields_daily.parquet`): 2005 to
   2026-10. US 3m, 1y, 2y, 5y, 10y and 30y, from FRED; DE 1y to 30y, from the Bundesbank; JP 2y to 30y, from Japan's
   Ministry of Finance; GB 10y, from the Bank of England. No weekend rows.
9. **VIX futures settlements** (`vix-calculus/data/vx_settle.parquet`): every VX contract, 2013-05 to 2026-10,
   29,751 rows. This is the full VX term structure.
10. **Yahoo FX daily, 19 USD crosses including EM** (`fx-dollar-funding-exposure/cache/*_X_d.json` and the yen
    caches): 2004 to 2026 for MXN, BRL, KRW, INR, TRY, IDR, PHP, THB, MYR, TWD, SGD, SEK, NOK and the G10. JPY=X
    starts in 1996. This is the only committed EM FX history.

Close behind:

- BIS locational banking statistics, 1977 to 2026Q1, which cover all 5 manifest `bis_*` features;
- Treasury General Account balance from the Daily Treasury Statement, daily 2005 to 2026, with a 200-day hole from
  2021-10 to 2022-04;
- 34 continuous futures, daily 2005 to 2026, from Yahoo and unadjusted: 585 weekend rows and 34 duplicate keys;
- the ^MOVE index from 2002;
- FRED daily rates and credit copies (DGS10 from 1962, DFF from 1954, BAA10Y, AAA10Y and others);
- the CIP cross-currency basis, 2016 to 2026 (DERIVED, with point-in-time `asof` columns).

## (b) Dormant assets: not live, used by one study at most

| dataset | coverage | MB | only user |
|---|---|---|---|
| Yahoo FX daily, 19 crosses incl. EM | 1996/2004-2026 | 14.1 | fx-dollar-funding-exposure |
| ^TNX and ^FVX yields | 1970-2026 | 2.9 | nbfi-rates-vol |
| iv_term_daily (own CVOL-style record) | 2026-07-30 onward, 25 products | 2.7 | none: archive only |
| HYG, JNK and IEF daily (HY credit proxy) | 2005/07-2026 | 1.6 | hy-spread-vol |
| ^MOVE (2 identical copies) | 2002-2026 | 1.2 | nbfi-rates-vol, rates-vol-gap |
| SOFR and €STR futures spread, 1 minute | 2026-04 to 10 | 1.2 | cog i2 build |
| VIX hourly | 2023-12 to 2026-10 | 0.9 | rangebook vix divergence |
| TGA daily (DTS) | 2005-2026 | 0.1 | cog-replication G1 test |
| spread_profile_hist (spread by weekday and hour) | to 2026-08 | 0.3 | none |
| central-bank statement tone (258 statements) | 2016-2026 | 0.1 | none |
| daily_ohlc_34 (horizon_reversion cache) | 2016-2026 | 4.3 | 1 forge script |
| Cboe PUT index; IBKR IV and HV for NQ, QQQ, SR3 and ZN | 1991-; 1 year | 0.2 | 1 each |
| calendar_events_nasdaq | 2026-07 onward | 0.6 | research `load_calendar()` only |

Several of these are exactly the market-state inputs the engine needs: EM FX, MOVE, the HY proxy, TGA and the IV term
archive. They are sitting in study caches.

## (c) Duplicates: the same series in several places

- **FRED daily CSVs.** Copied into up to six study folders, each with a different cut date:

  | series | copies |
  |---|---|
  | DGS2 | 5 |
  | DGS10 | 4 |
  | DFII10 | 4 |
  | VIXCLS | 3 |
  | DEXUSEU | 3 |
  | T10YIE | 2 |
  | DTWEXBGS | 2 |
  | DCOILWTICO | 2 |

  They are also folded again into `yield_coupling/yields.csv` and `spread-episodes/case2_daily.parquet`.
- **Cboe vol.** `analysis/surfaces/cboe` is the master. Older copies:
  - `rangebook/cboe` (VIX, VXN, VXD, RVX);
  - `rates-vol-gap/cache/VXN_History.csv`;
  - `forge/GVZ_History.csv`;
  - `js/data/cboeVolIndices.json` (VXN and GVZ; this is the copy the live code reads);
  - VIXCLS from FRED;
  - three byte-identical VIX, VVIX, VXN, VIX3M, VIX9D and NDX panels (vix-calculus, vix-nasdaq-beta and
    vvix-nasdaq-ratio).
- **MOVE.** Two byte-identical `move_daily.json` files.
- **COT.** The 34-market file plus two 13-market subsets (cot-extreme-aftermath and -duration). Futures prices: the
  34-market OHLC plus a 13-market close-only copy.
- **Daily price panels.** Six overlapping panels:
  - horizon_reversion daily_cache: 34 instruments, OHLC;
  - dynlead assets_daily: 34 instruments, closes;
  - residual-pca panel_daily: 15 instruments;
  - the education daily_closes: 7 instruments;
  - yield_coupling px_*: 18 Yahoo series;
  - gex_range_es NY-close bars: 2 instruments.
- **JPY=X.** Held twice (fx-dollar-funding-exposure and yen-funding-squeeze).
- **BIS.** 13 extracts in 5 folders with overlapping cuts.
- **live_range.** `hours.parquet` (52 MB) and `hours_ship.parquet` (42 MB) share the identical 1.9M-row key frame, and
  `live_range_wf/frame.parquet` (34 MB) is the same frame again.
- **OI.** `wall_summary_*` is a column subset of `daily_master_*`. The gex_range_es daily_master files (nyc and utc)
  re-copy the walls.
- **Short-rate futures (STIR).** `stir_1m` overlaps `stir_1m_deep` on the SR3 and Euribor legs. `cog_chart/` (28 MB)
  is a resample of these same bars. `stir/_superseded` holds 3 mixed continuous files.
- **day-reconstruction.** `archive/*_touches` and `m3/*_real_outcomes` hold the same 11,404 EURUSD touch rows (and the
  same for GOLD and NQ).

## (d) Bloat: big files with no reuse value

- **Overall.** 86 non-live study datasets hold 889 MB. The 18 of them over 10 MB come to **816 MB**. All are
  rebuildable from the M1 cache and serve one study each.
- **Live-range family: 330 MB.** live_range_history (129 MB), live_range_features (96 MB), live_range_confluence
  (61 MB) and live_range_wf (45 MB). None of it is read by a page.
- **line_touch_wide_scan: 143 MB.** It holds a 100 MB features.parquet and two 8 MB npz arrays of predictions.
- **Monolithic study JSONs: about 108 MB.** daily_open_retest_study.json (48 MB), dynamic_hl_level_study.json (35 MB),
  asia_touch_rest_of_day_study.json (17 MB), daily_open_retest_confluence (7 MB).
- **vf3_stage_b/part1_lines.parquet: 40 MB.** This is a point-in-time sigma line history, 2020 to 2026, for 34
  instruments. It is worth keeping only if you want a forecast archive.
- **cog_video_0918: 42 MB in 501 files.** It includes a 25 MB parameter sweep and about 480 tiny result CSVs.
- **RegimeOptimizer: 46 MB.** A 28 MB pickle plus 5 Optuna sqlite files.
- **`cron-worker/.wrangler` local state.** It is committed and should be gitignored.
- **level-atlas-vote-trades: 80 MB.** It is live through `js/levelAtlasRoutes.js`, but 38 MB of it is hltouches JSON
  that could be compressed or moved to parquet.

## Live use: datasets a page or server route actually loads

**RAW and DERIVED:**

| dataset | read by |
|---|---|
| calendar_events.csv | `js/calendarLoader.js` and `/api/calendar-events` |
| CVOL and cboeVolIndices | `js/impliedVolCore.js` |
| surprise_backfill | `server.js` |
| event_response_book and fiscal_history | event-response.html and fiscal-events.html |
| regime.json | `/api/regime` |
| release_layer1 and 2 | release-reaction.html and release-why.html |
| cog_chart legs | cog-chart.html |
| market-review packs | market-review.html |
| dax-ifo page.json | dax-ifo.html |
| backtest_enriched.json | `server.js` |
| the untracked EURUSD M1 | local-M1 loaders |

**Study folders:**

| folder | read by |
|---|---|
| level-atlas-vote-trades and -v2 | `js/levelAtlasRoutes.js` |
| AnalogML/data | motif and analog pages |
| forge/out_vol | `server.js` |
| spread-episodes | `server.js` |
| pattern-lab | `server.js` |
| cog_line | `server.js` |
| vumanchuLab | `server.js` |
| volatilityExhaustion | `server.js` |
| daily-open-fib-retest | `server.js`, which reads `results_ba.json` only |
| portfolio-book | portfolio-book.html |
| overnight-hold* | overnight-hold pages |
| decision-lab | decision-lab.html |
| VolRangeForecaster/data | layer2-vol-audit.html and sltp-distribution.html |

Everything else in this inventory has **no live reader**. That includes the Cboe master, COT, the OI surfaces, the
M15 bond data, the IBKR short-rate data, the yield curves, BIS and the CIP basis.

## plans/FEATURE_MANIFEST.json against what is committed

The manifest lists 100 features: 79 built, 9 gap, 12 unset. The `features/` parquet store is
**absent from this checkout**: `features/*.parquet` is gitignored and lives on the owner's laptop. None of the 79
"built" files is in the repo. The builder (`analysis/features/build_features.py`) pulls from APIs: FRED vintages,
CFTC TFF, BIS, Yahoo and OANDA.

Data for the same features committed elsewhere:

**Equivalent data committed (28 features):**

- vix (Cboe VIX and VIXCLS) and vix3m (Cboe VIX3M);
- y10_usd and y2_usd (FRED DGS copies);
- credit_baa10y, credit_aaa10y and credit_hy_oas (BAMLH0A0HYM2, only the same 3-year window);
- move_index (`move_daily.json`);
- bis_usd_xb_g, bis_all_xb_g, bis_nbfi_g, bis_cayman_usd_g and bis_yen_offshore_g (BIS extracts);
- calendar_high (calendar_events, Major tier);
- sofr and effr (xccy-basis/rates);
- all 12 xccy_basis_* features (`xccy-basis/basis_daily.csv`). The manifest has these as not built, so the committed CSV
  is the only copy.

**Partial or proxy (about 34 features):**

| features | committed proxy | how it falls short |
|---|---|---|
| px_d1_* (10) | horizon_reversion daily_cache, dynlead closes, Yahoo FX, futures_daily | only from 2016, not 2002 |
| rate3m_* (7) | macro_IR3TIB01 | revised latest values, not FRED vintages; the GBP feature is BoE IUDBEDR, not committed |
| y10_eur, y10_gbp, y10_jpy | dynlead yields_daily | daily official curves, a different source from the manifest's monthly OECD series |
| fed_tga | DTS TGA, daily | different source, finer resolution |
| hl_london_* (3 of 6) | EURUSD M1, untracked; day-reconstruction v4days for EURUSD, NQ and GOLD | NQ and GOLD only as session tables |
| surprises | ForexFactory surprise_backfill | covers 2007 to 2025-04 only |
| spread_profile | spread_profile_hist | historical profile, not the live snapshot |
| iorb | IOER | the series before 2021 only |
| cot_lev_share_* (7) | legacy COT 34 | uses speculator and commercial counts, not TFF leveraged-fund shares |

**Not committed anywhere (about 38 features):**

- **Inflation:** all cpi_* (8).
- **Other rates:** y10 for AUD, CAD, CHF and NZD; y2m_usd; rate_on_de, rate_on_jp and rate_on_ca.
- **Fed balance sheet:** fed_assets, fed_reserves, fed_swaplines, fed_foreign_repo and fed_custody_ust.
- **Bank credit:** h8_* (3) and cp_outstanding.
- **Money markets:** sofr_volume, obfr, rrp_on and cp_fin_3m.
- **Positioning:** tff_lev_* (4).
- **Model state:** hmm_state_eurusd.

These are the gaps a market-state engine would have to fetch, chiefly the CPI vintages, the Fed H.4.1 and H.8 series,
RRP and TFF positioning.

## Quality flags worth knowing before reuse

- **calendar_events.csv:** 46,095 exact duplicate rows; 358 weekend-dated rows; only US, EA and UK; latin-1 encoding;
  ends 2026-07-02 (fault #5).
- **futures prices_daily:** 585 Saturday or Sunday rows; 34 duplicate (date, symbol) keys; roll jumps left unadjusted.
- **horizon_reversion daily_cache:** dates are the session start in UTC; 10 Saturday-stamped stub rows.
- **OI book (surfaces, walls, iv_daily, gamma):** faults #11 and #12. Next-day targets use UTC days that include
  Sunday stubs; OI is published on D+1; no futures-to-CFD basis; calls and puts are not swapped on inverted pairs. The
  null-audit `wall-placebo/basis` parquet is the correction table.
- **CVOL:** AUD, CAD and CHF rows are all flagged `limited`. The snapshot ends 2026-08-20.
- **Revised, not vintage:** the IR3TIB01 monthly rates, BIS and regime.json carry latest values. They are not
  point-in-time.
- **TGA (DTS):** missing from 2021-10 to 2022-04-18.
- **xccy basis:** rows flagged policy (1,606), spike (352) or fault (37) must be dropped.
- **Yahoo FX:** bars are stamped at the bar end (fault #18).
- **Research M1 cache:** stale at 2026-08-21 (fault #7). Only EURUSD is present, and it is untracked.
