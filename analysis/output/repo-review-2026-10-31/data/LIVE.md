# Live data feeds: coverage, depth and value (MacroFXModel, 2026-10-31)

Companion table: `live_feeds.csv` in this directory (69 dataset families, 12 columns). This file is the reading of
that table: what the system pulls, how much of it is kept, which tier of a macro "Market State Engine" it serves, and
where the cheapest depth gains are. No repo files were changed. The loader bugs from the earlier audit
(`../review/DATA.md`) are out of scope here except where they make a feed dead or stale.

Sources reconciled: `js/dataFeeds.js` (≈50 hand feeds plus generated store rows), `js/dataCatalogue.js` (106 series),
`plans/FEATURE_MANIFEST.json` (100 features, 9 gap), `plans/FEED_COVERAGE.md`, `plans/FEED_REVIEW_2026-10-22.md`,
`plans/DATA_AND_INTEGRATION_TRACKER.md`, `plans/DATA_SPEC.md`, `.claude/skills/data-rules/references/sources.md`, and the
code (`server.js`, `_worker.js`, `js/*Engine.js`, `js/intlYields.js`, `js/flowChainSources.js`, `js/vixCaptureRoutes.js`,
`js/yieldShapeRegimeRoutes.js`, `analysis/features/build_features.py`, `scripts/`). Freshness comes from the production
`/api/data-health` snapshot taken 2026-10-31 13:16 UTC (`../review/work_data/dh.json`).

---

## 1. The main finding: the server downloads deep history and throws it away

Most server feeds already download the full upstream history and then keep a short window in memory:

| Feed | What it downloads | What it keeps | Code |
|---|---|---|---|
| `_fredCsv` (rates, chapters, drill, crack, regime) | the whole fredgraph CSV (DGS10 from 1962, CPI from 1947) | 12y (rates), 6y (drill, chapters), 260 obs (crack), in memory only | `server.js:17158`, `:17217`, `:17441`, `:17562`, `:17309` |
| fredhistory (31 keys) | the last 90 observations (`sort_order=desc&limit=90`) | 90 obs, KV 24h TTL | `server.js:39672-39726` |
| Intl yields | MoF `jgbcme_all.csv` (full JGB curve 1Y-40Y from 1974), gilt from 2008, bund | 10Y tenor only, last 3 years, memory | `server.js:17252`, `js/intlYields.js:41-47` |
| Flow chain | daily DE/JP 2y and 10y, ECB DFR, BoE Bank Rate, US legs from 2005 | memory, 12h, one page | `js/flowChainSources.js:81-90` |
| Regime | ONS/Eurostat/StatCan CPI, core, unemployment, GDP | 60 months per currency, memory | `server.js:17162-17190` |
| Econ engines | 25 years of FRED per series (`fromDate='2000-01-01'`) | one score per engine | e.g. `server.js:9096-9112`, `js/laborMarketEngine.js:434` |
| Nowcast | the Cleveland Fed's ~7 MB file with the daily nowcast path | the latest month's last value | `server.js:17915-17940` |
| GPR | the daily GPR file from 1985 | one score | `server.js:9282-9300` |
| ECB (worker) | `lastNObservations=5` for €STR and the AAA 10y | 5 obs, KV 12h | `_worker.js:869-897` |
| COT (worker) | 156 weeks per contract (`COT_LIMIT`) | 156 weeks, KV 8-day TTL | `_worker.js:2064`, `:2381-2388` |

Each deploy empties every memory cache. The only durable deep history is the **laptop-only PIT feature store**
(`features/*.parquet`, gitignored, no R2 copy, last built 2026-10-16) and the committed CSVs (Cboe vol indices,
calendars, IV term, STIR).

Some forward-only archives are **trimmed even though upstream keeps no history**. Once deleted, that data cannot be
bought back:

- `oi_history` and `oi_history_raw` (CME QuikStrike OI and IV ladders): cut at 365 days, with no R2 copy
  (`server.js:20595`, `:20711`). Tracker item 7 is "not started".
- `yield_shape_regime_v1` (^TNX 15m): `KEEP_DAYS = 120` (`js/yieldShapeRegimeRoutes.js:17`). Yahoo keeps about 60 days.
- `gold_etf_flow_history`: capped at 120 points, and a point is only written on days someone opens the page
  (`server.js:18352`).
- ICE BofA OAS (HY, BB, CCC, IG, EM): FRED serves only a rolling ~3 years under the ICE licence. Each day a print we
  have not archived drops off the far end. The feature store starts on 2023-10-17.
- `daily_snapshot_v1` keeps 120 days and `global_read` 180 days (`server.js:4026`, `:4452`). This is the desk's own
  point-in-time record.

## 2. Coverage by engine tier

**Hold well** means daily, deep history, point-in-time handled, and refreshed on a schedule.
**Partial** means present but shallow, laptop-only, US-only or stale.
**None** means not pulled.

| Tier | Hold well | Partial | Not at all |
|---|---|---|---|
| Economy / macro | US releases with first-print surprises (ALFRED, 179/181 exact); US CPI in the PIT store; GDPNow and Cleveland nowcasts (latest value only) | Non-US: EUR/CHF HICP (Eurostat) in the CPI engine. GBP/CAD/EUR CPI, unemployment and GDP are fetched for the regime only, and the store marks them `gap`. Engines keep scores, not series. Scorecard history kept 5y but untested | PMIs (licensed; "ISM" is INDPRO or OECD BTS); JPY/AUD/NZD CPI (no source since OECD MEI died, `js/cpiEngine.js:78-98`); AUD/CAD retail; non-US PPI; nowcast history |
| Rates | US curve 1M-30Y, real yields, BEI, ACM term premium (full history downloaded); DGS2/10 in the store from 2000 | Gilt, bund and JGB 10y daily (3y kept). Non-US 2y daily only in flow-chain memory. OECD monthly short rates are dying (`rate3m_eur` dead since 2026-02-16, `rate3m_aud` since 2026-09-15). ZQ and MPT come from the laptop. SR3/Euribor/€STR futures are manual and 3 weeks stale | SONIA, TONA, CORRA and AONIA overnight rates live; OIS curves; non-US 2y/5y in the store; auction results |
| Credit & funding | US plumbing (SOFR, SOFR99, EFFR, IORB, SRF, DW, RRP, reserves, swap lines, foreign repo, custody, H.8, TFF basis), kept as a daily point-in-time log (`funding_read_v1`, 1000 days); Moody's Aaa/Baa from 1986 | ICE OAS (3y licence window, not archived); CP/bill spread; cross-currency basis registered but unbuilt (laptop NT8) | Euro and EM high-yield beyond FRED's window; CDS, CDX and iTraxx (licensed); a live xccy basis |
| FX | OANDA prices (D1 from 2002, M1 bid/ask from 2016); H.10 fixings; broad and EM dollar; financing snapshots | FX implied vol: EVZ dead, the CVOL file ends 2026-08-20, the QuikStrike IV term only starts 2026-07-30, settle-IV inversion runs 2020-09 to 2026-09 (offline). Risk reversals only on chain-capture days | Dollar vs majors (DTWEXAFEGS); a free daily FX vol surface (the FXE/FXY/UUP chains are archived but not turned into one) |
| Equities | OANDA index CFDs (D1 from 2003); 14 sector ETFs and 12 mega-caps (6y/3y, memory) | Earnings calendar (schedule only) | Breadth, constituents, earnings revisions, FRED SP500/NASDAQCOM cross-check |
| Volatility & options | Cboe index family (VIX 1D-1Y, VVIX, SKEW, VXN, RVX, COR1M/3M, VIXEQ, DSPX, VXTLT; files from 1990/2004/2006); full Cboe chains for 18 symbols in R2 since 2026-10-19; VIX/VXN 1-minute in R2 since 2026-10-02 | Repo Cboe CSVs refreshed by hand (2026-10-20/21) and `cboeVolIndices.json` frozen at 2026-08-22; MOVE store stops 2026-09-21; CME OI and IV in KV only, cut at 365 days | Intraday MOVE, TNX, VVIX and DXY archives |
| Positioning | CFTC TFF from 2006 in the store (7 FX and 4 UST); CME OI walls and GEX; Databento ES/NQ OI | Live COT reads use 3y percentiles; `cot_factor_history_v1` is a manual job (70 days stale); gold ETF series is thin | OANDA books (source withdrawn); a usable retail sentiment history |
| Liquidity & banking | Net-liquidity legs; BIS LBS quarterly, first-seen point-in-time; H.8 vintages | NFCI (snapshot plus 90 obs, untested); ECB/BoJ/China balance sheets on request in the worker (5y max) and not in the store; daily TGA not persisted | STLFSI4, EPU, TIC flows, BIS global liquidity indicators |
| Events / calendar / surprises | ForexFactory live gate; Nasdaq continuation CSV twice a week; 2014-2026 archive; surprise store (about 10k rows from 2015); CB statement text for 8 banks; Fed speakers; auction schedule | JPY/AUD/NZD/CHF actuals never filled; calendar seam at 2026-07-02 with different event names; Event Vol Impact relies on a Finnhub premium call that 403s | Non-Fed speaker calendars; auction results; prediction markets |
| Prices | Yes (see FX and Equities) | Research M1 frozen at 2026-08-21 by design (lockbox); the default pull is 5y although OANDA serves about 20y | - |

## 3. The 10 cheapest high-value improvements to data depth

Sizes are rough estimates from observation counts. KV limits are 25 MB per value and 1 GB free. R2 is 10 GB free,
then $0.015/GB-month.

1. **Archive ICE BofA OAS before it rolls off FRED** (HY, BB, CCC, IG, EM corp). Append each day's FRED print to
   R2 `fred/daily/BAML*.json` in `refreshFredDashboard` or `_refreshWeekMap`, which already fetch these series. Size:
   6 series × 260 obs/yr ≈ 40 KB/yr. It is urgent because every unarchived day is lost for good. Also switch the store's
   `credit_*` asof rule to `fixed_lag:1`.
2. **Keep the full history `_fredCsv` already downloads.** Wrap `_fredCsv` (`server.js:17158`) so each CSV is
   written to R2 `fred/csv/<id>.csv` once a day, and point `refreshFredHistory` at that archive instead of
   `limit=90` (`server.js:39726`). There are no extra FRED calls, and it survives deploys. Size: about 70 daily series ×
   about 9-16k obs ≈ 15 MB raw, about 3 MB gzipped. This gives 20-60 years of 1d/5d/20d percentiles in place of
   90-day ones.
3. **Lift the 365-day trim on the QuikStrike archive and mirror it to R2** (`server.js:20595`, `:20711`, tracker
   item 7). This is the only live FX/gold/index implied-vol record, and CME sells no free history. Size: not
   measured. Measure `oi_history_raw` per day first; it is very likely under 1 MB/day, so under 300 MB/yr on R2.
4. **Daily non-US front-end rates into the store.** Promote flow-chain's existing series (DE 2y, JP 2y, ECB DFR,
   BoE Bank Rate, from 2005; `js/flowChainSources.js:85-90`). Add BoC Valet and RBA F1 2y/3y yields, plus CORRA and
   cash rate; the server already downloads both files for the policy rate (`server.js:17987-18005`). Change
   `parseMofCsv` to return 2Y/5Y/10Y/30Y. Add `rate2y_*` features to the manifest. This replaces the dying monthly
   OECD legs (`rate3m_eur` dead) under the one validated directional sleeve. Size under 5 MB.
5. **Overnight rates: €STR, SONIA, TONA and CORRA, with full history.** In the worker, change
   `lastNObservations=5` to `startPeriod=2019-10-01` (`_worker.js:875`). Add BoE IUDSOIA and the BoJ and BoC series to
   the rates job. These give the carry read and a server-side xccy basis (`scripts/xccy-basis/build.py` already has
   the formula) their overnight legs. Size under 1 MB.
6. **Wire non-US macro that is already fetched.** `_CCY_REGIME_SRC` (`server.js:17162`) already pulls ONS, Eurostat
   and StatCan CPI, core, unemployment and GDP. Feed them into `CPI_UNIVERSE` for GBP/CAD (`js/cpiEngine.js:91-92`)
   and into the store (`cpi_gbp`, `cpi_cad`, `cpi_eur` are `gap`). Later add ABS, Stats NZ and e-Stat for AUD, NZD
   and JPY. Size: negligible.
7. **Fill surprise actuals for all 8 currencies from `calendar_events_nasdaq.csv`** (tracker build #6, not started).
   The file already has actual, consensus and previous for every country, while ForexFactory has no actual field.
   This takes the surprise index from "US plus partial GBP/CAD/EUR" to 8 currencies. Size: about 2k rows/quarter.
8. **Keep the nowcast and GPR history.** Append the daily Cleveland values and GDPNow to a KV row log, and backfill
   the daily path from the same 7 MB file. Keep the GPR daily series rather than one score. Both become free
   point-in-time panels for range tests. Size under 200 KB.
9. **COT at full depth.** Raise `COT_LIMIT` from 156 to about 1000 weeks (TFF from 2006; legacy back to 1986 where
   needed) and drop the 8-day TTL on `cot_series_v2`, or mirror it to R2. Add the remaining ~25 contracts (equities,
   commodities, rates) to the feature store, and handle the shutdown publication delays. Size: about 3-6 MB.
10. **Stop deleting forward-only captures and widen them.** Set `yield_shape_regime_v1` `KEEP_DAYS=120` to keep
    everything, in R2. Extend `vixCapture` to ^MOVE, ^TNX, ^VVIX, ^VIX9D and DX-Y.NYB, which is the same code (about
    40 KB/day/symbol, about 50 MB/yr). Put the gold ETF flow on a daily schedule with no 120 cap. Put
    `scripts/data/fetch_cboe_vol_indices.py` into the existing `calendar-refresh.yml` workflow and regenerate
    `js/data/cboeVolIndices.json`. Run `build_features.py` on a schedule and upload `features/` to R2, so the PIT store
    is no longer laptop-only and 15 days stale.

Honourable mentions, all one FRED id each: DTWEXAFEGS (dollar vs majors), USEPUINDXD, STLFSI4, ECBASSETSW and
JPNASSETS into the store, and VXTLT as the official substitute for Yahoo ^MOVE.

## 4. Collected but unused, and consumers of dead or stale feeds

### Collected, with no consumer or no test

| Feed | Cost | Status |
|---|---|---|
| OANDA order/position books | poller every 10 min (`server.js:10028`) | **Source withdrawn by OANDA**. KV no longer advances; today.html still shows it. Remove. |
| OANDA financing history | one call a day | No page or script reads `/api/financing/history`. Unrebuildable, so keep it, but use it in carry and cost work. |
| Myfxbook sentiment | worker on request | Legacy desk only; the ledger says retail crowding is null. |
| GPR | 8-day poll | today.html only; never tested; 40 years of daily data thrown away. |
| Nowcast | daily, 7 MB download | `n.nowcast` is built and the newsletter never reads it; the history is discarded. |
| Calendar with actuals | on request | Atlas loads it and the newsletter drops it. |
| HMM macro context and `/api/hmm1h-v2` | 6h | The 1h route has no page. It duplicates FRED pulls. |
| `cboe_snap_v1` | daily | Superseded by `cboe_raw`. |
| Econ engine scores and scorecard history (5y) | release poller | The newsletter does not read them and there is no ledger test. |
| SKEW, VVIX shape, COR1M/3M, VIXEQ, VXTLT, the 1M-30Y curve, NFCI, T5YIFR, CP-bill spread, H.8 | daily pulls | About 61 of 106 catalogue series have no ledger entry (`js/dataCatalogue.js` `untested()`). |
| VIX 1m, Cboe chains, flow chain | R2 or memory | Forward archives with no study yet. That is fine for the archives; flow chain is not even registered in `js/dataFeeds.js`. |

### Consumers that depend on dead or stale data

- **FX-vol stressed flag** (`/api/risk-flags`, `/api/cvol`, used by today.html and the newsletter stress strip).
  Its inputs are EVZCLS, dead since 2025-03-11, and the CME CVOL file, frozen at 2026-08-20. The flag is effectively
  driven by GVZ alone.
- **Macro scorecard and CPI engine.** CPI for GBP, CAD, AUD, NZD and JPY is discontinued, retail for AUD and CAD is
  dead, and PPI is USD-only. The worker `/api/fredhistory` still lists `ism: 'NAPM'` (`_worker.js:1433`), and the
  macro-equity backtest's EU PMI candidates are `MPMIEZMA156N`/`NAPM` (`server.js:11489`). That leg is likely
  missing or falling back to US data (suspected, not verified).
- **Carry and yield-spread studies** (`runStudy`, `rate3m_*`): `rate3m_eur` has been dead since 2026-02-16 and
  `rate3m_aud` since 2026-09-15. The store has been 15 days stale since 2026-10-16. `move_index` ends 2026-09-21 and
  `hl_london_*` ends 2026-08-21.
- **impliedVolCore** reads `js/data/cboeVolIndices.json`, which ends 2026-08-22.
- **cog-chart.html and the STIR studies** use SR3, Euribor and €STR CSVs that end 2026-10-08/09, with no schedule.
- **Drill bundle** was lagging 8.5 days on data-health. chapters.html borrows its legs, and `wider-market` and the
  drill question also depend on it.
- **COT factor test** input `cot_factor_history_v1` was last built 2026-08-22, by a manual backfill.
- **Event Vol Impact** depends on Finnhub's premium calendar, which 403s on the free key.
- **Research event tagging** depends on `calendar_events.csv`, which ends 2026-07-02. After that the Nasdaq file uses
  different event names.

## 5. Registry notes

- `js/dataFeeds.js` misses the flow-chain feed (`/api/flow-chain`, `js/flowChainSources.js`), the BoC/RBA policy
  fetches used by the surprise store, and the ONS/Eurostat/StatCan pulls (folded under `macro_regime`).
- Its `fred_history` row says "90 obs", which is accurate, but nothing flags that this is the depth the
  macro-change strip and the chain chips compute percentiles from.
- `plans/FEED_COVERAGE.md` grades feeds by newsletter reach. It does not grade them by depth kept. This file and the
  CSV add that dimension.
