# Data-layer audit — MacroFXModel @ fc07dcb7 (2026-10-31)

Scope: feed inventory, canonical loader audit, known-fault re-check, integrity run. Nothing was written to R2, KV or
the repo. Scratch scripts and outputs: `/tmp/claude-0/-home-user-MacroFXModel/7ea4abce-c1f1-5243-a82a-043dd4b3b942/scratchpad/review/work_data/`
(`synth.mjs`, `test_sessions.mjs`, `test_load_daily.py`, `test_event_tag.py`, `test_runanalyser.mjs`,
`test_features_at.mjs`, `test_gli_units.py`, `di_copy.mjs` + `di_out/REPORT.md`, `dh.json` = production
`/api/data-health` snapshot, `vf.json` = production `/api/vol-forecast`).

Legend: **VERIFIED** = demonstrated by a script in work_data or by an unambiguous code trace with the numbers shown;
**SUSPECTED** = code reading says so, impact on real data not measured (no M1/parquet in this container).

---

## 0. What data is in this container

| Store | Present? | Note |
|---|---|---|
| `VolRangeForecaster/data/m1/*_m1.parquet` (research M1) | **No** | dir absent; R2 creds (`R2_ACCESS_KEY/SECRET`) unset; OANDA_KEY, FRED_KEY unset |
| `portfolioBacktest/cache` (index M1) | No | |
| `data/` (m1_bidask, m1_forward, iep_macro FRED vintages) | No | whole `data/` dir absent |
| `features/*.parquet` (PIT feature store) | No | gitignored (`.gitignore:569`); manifest only (`plans/FEATURE_MANIFEST.json`) |
| `OI Data/*.csv` | No | |
| `node_modules` / `pyarrow` | No | JS loaders that import `hyparquet`/`@aws-sdk` cannot be imported; Python cannot read parquet |
| Committed: `calendar_events.csv` (→2026-07-02), `calendar_events_nasdaq.csv` (→2026-11-05 incl. scheduled), `analysis/surfaces/cboe/*.csv` (21 indices, →2026-10-20/21), `oi_research_book/data/*.parquet` (last commit 2026-09-23), `analysis/output/iv_term/iv_term_daily.csv` (→2026-10-30), `analysis/output/stir/*.csv` (ZQ →2026-10-26; SR3/Euribor/€STR →2026-10-08/09), `js/data/cmeCvolEod.json` (→2026-08-21), `js/data/cboeVolIndices.json` (→2026-08-22), `backfill/surprise_backfill.json` (→2026-09-09), `backfill/event_response_*.json` (→2026-09-17), `analysis/output/cot-extreme-duration/cot_weekly.csv` (→2026-10-13) | yes | |

Consequence: every M1-based study in the repo is **not reproducible from this container**; the real-data checks below
were done on synthetic M1 that reproduces the FX trading week (Sun 17:00 NY → Fri 17:00 NY), which is exactly the
structure the session/DST logic has to handle.

---

## 1. Feed inventory

Registry of record: `js/dataFeeds.js` (≈50 hand feeds + ~100 KV stores), `js/dataCatalogue.js` (106 series),
`js/feedCoverage.js` → `plans/FEED_COVERAGE.md`, PIT store `plans/FEATURE_MANIFEST.json` (100 entries, built by
`analysis/features/build_features.py`, last built 2026-10-16). Live freshness from production `/api/data-health`
(151 rows: 96 fresh, 5 lagging, 5 stale, 2 dead, 41 unknown, 2 snapshot) on 2026-10-31 13:16 UTC.

### 1a. Macro / rates / liquidity

| Feed | Source | Fetch path | Schedule | Storage | Point-in-time | Freshness | Consumers |
|---|---|---|---|---|---|---|---|
| FRED dashboard (~70 series: curve DGS*, real yields DFII*, breakevens, SOFR/EFFR/IORB, RRP, WALCL, TGA, reserves, OAS, VIXCLS/GVZ/OVX, DEX*, oil, OECD MEI rates/yields) | FRED API / fredgraph CSV | server.js `fred_dash`, `fred_history`, `rates`, `chapters`, `weekmap`, `drill`, `crack` jobs | boot + 6h / 24h | KV `fred_data_v3`, `fredhistory_series_*`, memory | **latest vintage only** (revised) | fred_data_v3 fresh; `drill` lagging 5 sessions (worst leg dxy); `crack` lagging 3; `fredDash` memory empty after restart | rates.html, yield-curve, real-yield, global-liquidity, macro-scorecard, newsletter, bots via `fred` KV |
| Econ engines (CPI, PPI, GDP, labour, ISM-proxy, retail, trade, consumer conf.) | FRED + ONS/Eurostat/StatCan/OECD BTS | `js/*Engine.js`, release poller | every 10 min, refetch when due | KV `cpi_v1` … | latest vintage | fresh | macro-scorecard, currency cards; **ISM is not ISM** — FRED dropped NAPM in 2016; US uses INDPRO + Philly/Empire, others OECD BTS (`js/ismEngine.js:1-25`) |
| Surprise store (actual vs consensus) | ForexFactory consensus + **ALFRED first-print** vintages (+ONS/StatCan pub stamps, BoE/BoC/RBA) | `js/fredActuals.js`, `js/econSurprise.js` | hourly | KV `econ_surprise_v1`; `backfill/surprise_backfill.json` | **vintage-correct** (`fredActuals.js:208+`, 179/181 exact) | KV fresh; committed backfill ends 2026-09-09 | currency cards, surprise alerts, feature `surprises` |
| FRED vintages (research) | ALFRED | `scripts/fetch_fred_vintages.py` → `data/iep_macro/*_vintages.csv`; `build_features.py --builder fred_vintage` | manual (needs FRED_KEY, Railway) | local CSV / `features/` | vintage | not in container | IEP/macro studies, harness |
| Net liquidity (WALCL − TGA − RRP) | FRED H.4.1 + Treasury Fiscal Data (daily TGA) | `js/netLiquidity.js` (canonical), server.js 15061+, 18595+, 12208+ | per page/job | memory caches | latest vintage; lags WALCL 8d, TGA 2d, RRP 1d (gate uses flat 5 trading days) | — | liquidity-pulse, liquidity-gate, macro-equity, global-liquidity, COG G1 tide. **Not wired to newsletter** |
| Global liquidity (Fed/ECB/BoJ/PBoC/BoE BS + FX) | FRED | `js/globalLiquidityEngine.js`, `GlobalLiquidity/` (py + `backtestCore.mjs`) | on request | memory `GLI_BT_CACHE` | latest vintage, fixed week lags (cb 2w, growth 3w) | — | global-liquidity.html, q6 rerun |
| Funding & leverage read (swap lines, foreign repo, H.8, NY Fed rates, CFTC TFF UST) | FRED + CFTC | server job `fundingRead` | 6h | KV `funding_read_v1` | latest; one row/day kept forward | fresh (data date 2026-10-21) | newsletter weekly sentence |
| Intl yields | BoE IADB, Bundesbank, Japan MoF; ECB Data Portal (curve + €STR) | `intl_yields`, `ecb_sdw` | 6h / on request | memory, KV `ecbsdw_daily` | latest | fresh | rates pages; **€STR/ECB curve not in newsletter or store** |
| CB policy rates & statements | Fed/ECB/BoE/BoJ/RBA/RBNZ/BoC/SNB pages, Beige Book | `cb_text` poller | 30 min | KV `fomc_*`, `ecb_*` … | timestamped at fetch | fresh | *-sentiment.html, newsletter tone pills |
| Fed path — ZQ | IBKR TWS (laptop) | `fedwatch/pull_zq_path.py`, `run_zq.bat` | Windows Task Scheduler, evenings | KV `zq_path_v1` + `analysis/output/stir/CBOT_ZQ*.csv` | snapshot at capture | KV 2026-10-29 (1 session behind); CSV →2026-10-26 | fed-path.html, newsletter n.fedPath |
| Fed path — Atlanta Fed MPT | Atlanta Fed | `fedwatch/fetch_mpt.py` | laptop daily | KV `mpt_store_v1` | snapshot | 2026-10-29 | fed-path |
| STIR curves (SR3, Euribor, €STR FST3, ER3) | IBKR/Databento pulls | `scratchpad/ibkr_stir_pull.py` (manual) | **manual** | `analysis/output/stir/*.csv` | bars, no revision | **SR3/Euribor/€STR end 2026-10-08/09 — 3 weeks stale, no schedule**; no SONIA, TONA, BAX, bank-bill futures | cog-chart.html, stir studies (context only) |
| BIS LBS cross-border bank credit | BIS SDMX | server job `bankCredit` (12h) | KV `bank_credit_v1` | first-seen date per quarter kept (PIT) ; feature store uses quarter-end + 182d | latest quarter 2026-06-30 | bank-credit.html, newsletter weekly clause |
| Nowcasts (GDPNow, Cleveland CPI) | FRED / Cleveland Fed | `nowcast` | 24h | memory | snapshot | fresh | n.nowcast built and **dropped** by newsletter |
| Treasury auctions, Fed speakers, earnings, holidays | TreasuryDirect, Fed JSON, Nasdaq | `_calExtras` | on request 6h | memory | snapshot | — | newsletter "Beyond the calendar" |
| GPR | Caldara-Iacoviello | poller | 8d | KV `gpr_v1` | latest | fresh | not used |
| Credit spreads (IG/HY/CCC/EM OAS, BAA/AAA) | ICE BofA / Moody's via FRED | fred_dash, chain_extra | 6h | KV | latest; **1-day publication lag** (sources.md) | fresh | credit-stress, newsletter, Global Read |

### 1b. Vol / options / positioning

| Feed | Source | Path | Schedule | Storage | PIT | Freshness | Consumers |
|---|---|---|---|---|---|---|---|
| Cboe vol indices (VIX term, VVIX, SKEW, VXN, RVX, VXD, GVZ, OVX, VXTLT, …) | cdn.cboe.com CSVs | `scripts/data/fetch_cboe_vol_indices.py` (never shrinks file); server `cboe_snap_v1` | manual for CSVs; KV snapshot daily | `analysis/surfaces/cboe/*.csv`, `js/data/cboeVolIndices.json` | close values, MM/DD/YYYY | CSVs →2026-10-20/21 (10 days); JSON →2026-08-22 (**70 days**) | vix-calculus, range-pressure gauge, fear-vs-Nasdaq |
| MOVE | Yahoo `^MOVE` | `build_features.py yahoo_daily`; server | — | feature `move_index` | close+1h | **store stops 2026-09-21** | stress flags |
| EVZ (euro FX vol) | FRED EVZCLS | — | — | — | — | **dead since 2025-03-11** (data-health) | FX vol flag |
| CME CVOL | manual export | — | manual | `js/data/cmeCvolEod.json` | — | **snapshot ends 2026-08-20/21** (cmegroup blocks scripts; history paid) | IV flag |
| CME settlement IV inversion | R2 `OI Data/*.csv` → `oi_research_book/scripts/01_build_daily_dataset.py` | offline | `oi_research_book/data/iv_daily_*.parquet` | settlement date | last commit 2026-09-23 | iv-forecast (validated), IV ladder |
| CME OI / gamma / IV term (QuikStrike) | QuikStrike scrape (laptop) | `oi_recon/run_daily.py` | nightly | KV `oi_store*`, `oi_history*`; `analysis/output/iv_term/iv_term_daily.csv` | OI(D) published ~15-16 UTC D+1 (fault #11) | oi_store fresh (2026-10-31 06:37); iv_term →2026-10-30. **KV is the only copy of `oi_raw_*`** (tracker item 7 not started) | oi-dashboard, GEX gate G2, newsletter option zone |
| Cboe full option chains (18 chains) | Cboe delayed quotes | server `_cboeRawArchiveTick` | daily after close | R2 `cboe_raw/<SYM>/<date>.json` | OI = prior close | since 2026-10-19 only | hedging forward record |
| CFTC COT legacy + TFF | publicreporting.cftc.gov (Socrata) | server cot routes, `build_features.py cftc_tff` | on request / weekly | KV `cot_series_v2`, `cot_extremes_v3`; feature store | report Tue → release Fri (report+3d); **shutdown delays not handled in store / js/cotFactorCore.js** | fresh (KV 2026-10-31) ; committed weekly CSV →2026-10-13 | cot-extremes, crowding, newsletter Positioning |
| OANDA order/position books | OANDA | `fetch_oanda_books.py`, server | — | KV `oanda_book_history_v1` | — | **dead source** (OANDA withdrew; faults-log #12) | none |
| Myfxbook sentiment | Myfxbook | `_worker.js` | on request | KV `sentiment` | — | — | not used |

### 1c. Prices and calendar

| Feed | Source | Path | Storage | PIT / shape | Freshness |
|---|---|---|---|---|---|
| Research M1 (27 FX + gold) | OANDA mid | `scripts/r2_download.py` (never refreshes >10 KB files), `fetch_m1_oanda.py` | `VolRangeForecaster/data/m1` ← R2 `m1/` | UTC naive, mid | **ends 2026-08-21** (fault #7; = lockbox start). Absent here |
| Nightly M1 tail | OANDA | server nightly job | R2 `m1-tail/{key}.json` | merged by `loadM1ForPair` **unconditionally** (lockbox leak) | live |
| Decoded snapshot | — | `loadM1ForPair` | R2 `m1-decoded/{key}.bin` | **Float32 prices**, Int32 times | — |
| AnalogML M1 | OANDA | `AnalogML/refresh_m1.py` hourly | `AnalogML/data/m1`, R2 `analogml/m1/` | separate schema | live (does not top up research cache) |
| Bid/ask M1 (34 instr.) | OANDA practice BAM | `fetch_m1_oanda.py --price BAM --out data/m1_bidask` | local + R2 `bid-ask/` | bid/ask cols after `time` | → 2026-10-19 |
| Holdout forward M1 | OANDA | `fetch_m1_forward.py` | `data/m1_forward` | never scored | — |
| Index M1 | OANDA CFD (hand copied) | — | `portfolioBacktest/cache` | — | absent |
| NT8 futures M1 | NinjaTrader 8 ZMQ bridge | `nt8_bridge/nt8_pull.py`, `nt8_backfill.py`, `nt8_stitch.py` | local | roll-stitched | laptop only |
| Live D1/H1/M5 | OANDA v3 | `fetchD1Aligned` (17:00 NY) | memory | — | live; data-health `oanda` 2026-10-29 |
| Index σ (live) | Yahoo (incumbent bands) + OANDA NY-close (ladders) | volForecastScheduler | KV | `ladder_sigma_source:'oanda'` confirmed live for SPX500/US30/US2000/DE30/UK100 | fresh |
| Calendar (research, legacy) | vendor export | — | `calendar_events.csv` | UTC, latin-1, 46k exact dups | ends 2026-07-02 |
| Calendar (continuation) | Nasdaq API | `scripts/calendar/fetch_nasdaq_calendar.py`, GH workflow Sun+Wed | `calendar_events_nasdaq.csv` | UTC; D-1 quirk handled (`:96`); keyword impact | →2026-11-05 (scheduled rows) |
| Calendar (live) | ForexFactory (Finnhub fallback) | `js/econCalendar.js` | KV `event_windows_v1` | — | fresh |
| FF history 2007–2025-04 | FF archive | `forge/ff_calendar.py` | `data/calendar/ff_calendar_2007_2025.csv` (absent) | repaired dates | ends 2025-04-07 |

### 1d. Gaps against "key macro data for global market state"

1. **Non-US macro is not point-in-time.** Feature store: `cpi_eur/gbp/cad/jpy/aud/nzd/chf` all `status: gap`;
   `y10_nzd` gap; no non-US GDP, unemployment, PMI, retail in the store at all. The live engines carry them but on the
   latest vintage only. A macro state engine for 8 currencies currently has PIT inflation for one.
2. **No PMIs anywhere** (S&P Global/ISM are licensed; FRED dropped ISM in 2016). US "ISM" = INDPRO + regional Fed
   surveys; other currencies = OECD BTS. The `ISM`-labelled engine is a proxy.
3. **Policy-rate expectations outside the US are not automated**: SR3/Euribor/€STR CSVs stop 2026-10-08/09, manual
   pull; no SONIA, TONA, BAX, ASX bills, NZ bills; no OIS curves. `rate3m_eur` (OECD `IR3TIB01EZM156N`) stopped
   2026-02-16 and `rate3m_aud` 2026-09-15 → carry studies using `rate3m_*` silently forward-fill (harness `at()` has
   no max-age).
4. **FX implied vol has no live free history**: EVZ dead, CVOL snapshot ends 2026-08-20, CME inversion parquet last
   committed 2026-09-23; QuikStrike IV term only since 2026-07-30.
5. **Cross-currency basis** features registered but unbuilt (`xccy_basis_*` no status). No TIC/portfolio flows, no
   ETF flow history (gold ETF only when a page is opened).
6. **Credit**: only US OAS (ICE BofA via FRED) + EM OAS; no European credit (iTraxx/CDX are licensed), no CDS.
7. **Central-bank balance sheets** beyond the Fed (ECBASSETSW, JPNASSETS) are only in the GLI engine, not the store.
8. **Revised-vs-first-print**: only the surprise store and the feature-store `fred_vintage` builders are
   vintage-aware. Every live engine, `analysis/regime_study.mjs` (CFNAI/INDPRO/PAYEMS/CPI from `fredgraph.csv`),
   `js/globalLiquidityEngine.js`, `GlobalLiquidity/data.py`, `MacroEquityBot/fred_signal.py`, q6 rerun scripts and the
   macro-confluence studies read the **latest revised** series.

---

## 2. Canonical loader audit

### 2.1 `bucketM1IntoSessions` — `js/forecastAnalyser.js:411`

* London DST rule (`_lastSundayUtc1am`, `_londonIsBst`) matches `Intl` Europe/London at every 30-min point
  2000–2035 (**0 mismatches**, `test_sessions.mjs`). Session open = London midnight on both 2025 and 2026 clock-change
  weeks; transition Sundays/Mondays bucket correctly (e.g. 2026-03-30 opens 23:00 UTC, 2026-10-26 opens 00:00 UTC).
* **London mode always emits a Sunday session** (Sunday 22:00–24:00 London = 120 bars; 180 bars on the
  US/UK-DST-mismatch Sundays, e.g. 2026-03-08/15/22, 2026-10-25, 2025-03-09/16/23, 2025-10-26). DATA_SPEC §1 says
  "Sunday-evening bars belong to Monday"; the code gives them their own Sunday key. Callers must drop weekends; see 2.5.
* Default boundary 22 (UTC): in EDT the FX week opens 21:00 UTC, so every summer Sunday gets a 60-bar stub labelled
  Sunday, and Friday sessions run 22:00 Thu → 21:00 Fri. Fine for callers that filter ≥600 bars; wrong as a "NY day".

### 2.2 `nyCloseDailyBars` — `js/voteAtlasV4Lines.js:59`

* Correct on all DST transition weeks tested: every key's `endSec` lands at 17:00 New York, no keys with n<60 apart
  from the partial last bar, including the 3 Sunday-mismatch weeks. No bug found.
* Minor: `endSec` uses the UTC offset of the bar's **first** minute; for an instrument trading through 02:00 NY on a
  DST Sunday (BTC/crypto) `endSec` would be 1 h off. Not relevant to FX/gold/index.

### 2.3 `loadM1ForPair` — `js/volBacktestM1Engine.js:1541`

* No de-duplication or sort of parquet rows; `mergeBarsIntoPacked` (`js/m1GapFill.js:145`) only appends bars after
  the last parquet time. Sessions are re-sorted in `bucketM1IntoSessions`, but `nyCloseDailyBars` assumes order.
  SUSPECTED only (no data to test).
* Time = **last column** (`r[r.length-1]`). A BAM parquet (bid/ask after `time`) still collapses to 1970 with no
  guard (documented trap; `loadM1ForPairLocal` has `findTimeColumn`, this one does not).
* R2 decoded snapshot stores prices as **Float32** (`packToBinary`, `:132`): ~7 significant digits. Harmless for
  ranges; exact-equality checks (e.g. `bar.time === t.time` is Int32, fine; `high === level` comparisons) can differ
  between the decoded-snapshot path and the raw-parquet path. SUSPECTED, low impact.
* `m1-tail` merged unconditionally → lockbox leak whenever creds exist (documented).
* Siblings in the same file still hard-code `row[5]`: `groupByDate` (`:326-335`, used by `runFullM1Backtest` and
  `runFullLevelAnalysis`) and `_foldM1Buckets`/`readM1Resampled` (`:285`, used by `scripts/run-slowdown-decomp.mjs`).
  On an 8-column file these silently read `bid_o` as time.

### 2.4 `auditUsable` — two diverged copies

`js/harShadowCore.js:90` takes 2 args; `js/dailyReadCore.js:101` takes `lateAudit` and accepts late audits that pin
their own window. So HAR shadow drops valid late audits that Daily Read keeps. Missing `auditedAt` → treated usable in
both. Minor (selection, not lookahead).

### 2.5 VERIFIED bug — Forecast Analyser scores Sunday stubs as sessions

`runAnalyser` (`js/forecastAnalyser.js:~480`) filters only `minBarsPerSession = 30`; London Sunday stubs have 120–180
bars. On 8 months of synthetic FX M1 (`test_runanalyser.mjs`): **26 of 160 daily windows (16%) are Sunday-dated**, and
5 of 32 weekly windows start on a Sunday. The stubs also enter the σ series (`sessionsToD1` → `volSigmaSeries`),
pulling σ down (fault #1's mechanism, re-introduced), and weekly windows become "4 weekdays + a 2-hour stub".
Call path: `js/forecastAnalyserStore.js:232,275` (`refreshPair`) → R2 `forecast-analyser/<pair>/<h>.json` → per-line
book, exit study, day-type study, stop study (`:341-490`), served by `js/analyserRoutes.js`; also
`scripts/run_vwapside_confluence_scope.mjs:65-69`. Same σ-from-London-sessions-with-Sunday-stubs pattern in the live
`local_decision_engine/lib/zonePricer.mjs:131-145` (no weekend or bar-count filter before `forecastSigma`).
Level Atlas / Session Path / Asia Fib Atlas drop stubs with `>= 200` bars (OK; Level Atlas keeps `_lastDate` even if
it is a stub, `js/levelAtlasEngine.js:249`).

### 2.6 `forge.vol.load_daily` — `forge/vol.py:779`

* Index = London midnight in naive UTC (documented). On synthetic data **6 of 17–29 rows** in a DST month have an index
  date ≠ London date, as expected.
* **VERIFIED: `london22` emits Sunday rows on US/UK-DST-mismatch Sundays.** NY 17:00 = 21:00 London in those weeks, so
  the first hour (60 bars) passes `hour < 22`. Synthetic 2026 run: Sunday rows 2026-03-08, -15, -22 and 2026-10-25
  (HL ≈ 0.18× a normal day). ≈4 per year per FX instrument. The skill's claim "Sunday bars fall outside london22" is
  false for these weeks. They enter σ (`as_of_yesterday` makes Monday's forecast use the stub) and are scored as
  sessions. Fix: drop `dayofweek >= 5` on the London date inside `load_daily`.
* `end=` cuts at UTC midnight (documented) — confirmed the BST stub behaviour.

### 2.7 VERIFIED bug — event tags shifted one session late in BST (`forge/vol.py:510` `tag_column`)

`build_forecast_frame` passes the naive-UTC index to `tag_column`, which looks tags up by `d.strftime("%Y-%m-%d")`.
In BST that string is the **previous** calendar date. `test_event_tag.py`: FOMC 2026-06-17 was attached to the
London session of **2026-06-18**; NFP 2026-07-03 (a Friday) was attached to nothing (its key would be Saturday's
session). Winter dates are correct. So for ~7 months a year, every event multiplier fit (`fit_event_multipliers`)
sees "the day after the event" as the event day and the true event day as `none`/previous tag.
Affected: `forge/run_vol.py` → `forge/export_ladder_params.py` → **`js/forecastLadderParams.js`** (header: report
`forge/out_vol_lon/vol_report.json`, i.e. london22) — the live production ladder's event multipliers (FOMC 1.143,
NFP 1.127 …), imported by `js/volForecast.js`, `js/forecastLadder.js`, `js/levelAtlasEngine.js`,
`js/sessionPathEngine.js`, `js/asiaFibAtlasEngine.js`; also `forge/run_vol_iv.py:63` (IV ladder prereg),
`forge/run_horizons.py:60`, `forge/export_vol_compare.py:38-42` (its `by_date` keys are also one day early in BST).
Expected effect: event multipliers biased toward 1 and `none` contaminated; size unmeasured (no M1 here). Not in the
faults table.

### 2.8 Feature-store loader `FeatureStore.at()` — `js/harness/features.mjs:137`

**VERIFIED logic bug**: `at(id, t)` returns the row with the newest *asof*, not the newest *period*. When a vintage
revises an old period on a later date than the latest new print, `at()` returns the old period's value.
`test_features_at.mjs`: rows {2026-01 printed 02-11, 2025-05 revised 02-14} → `at('2026-02-20')` returns the 2025-05
revision (2.2) instead of January (3.1). The same-asof tie-break (`:146-148`) only covers revisions published with
the new print. Exposure: every `asofRule: 'vintage'` feature where ALFRED revision dates differ from print dates —
OECD MEI `rate3m_*`, `y10_*`, `rate_on_*` (periodic bulk revisions), H.8 (`h8_*`), WALCL/TGA restatements. `runStudy`
uses `at()` for every signal (`js/harness/runStudy.mjs:65`) and for carry (`:201`, `rate3m_*`). `series()` is
correct. Also: `at()` has no staleness limit, so dead series (rate3m_eur since 2026-02-16) forward-fill forever.

### 2.9 Feature-store asof rules — `analysis/features/build_features.py`

* `credit_hy_oas`, `credit_baa10y`, `credit_aaa10y` use `close+1h` (date 22:00Z), but ICE BofA OAS and Moody's yields
  reach FRED about one business day later (the repo's own lag table, `.claude/skills/data-rules/references/sources.md`:
  "HY OAS 1d"). A London session that opens 23:00/00:00 UTC is credited with a value not yet published → half-day
  lookahead. SUSPECTED for DGS2/DGS10 (H.15 timing), likely fine for VIXCLS.
* `report+3d` for CFTC TFF ignores the 2018-12-18→2019-02-26 and 2025-09-30→2025-12-23 shutdowns (reports released
  weeks late) — the study scripts carry `SHUTDOWNS` lists, the store and `js/cotFactorCore.js:95-101` do not.
  Lookahead of up to ~6 weeks on ~24 reports for any harness/COT-factor study spanning them.
* `asof_close_plus_1h` = 22:00Z = the OANDA close itself in EST (not +1h). Harmless.
* `px_d1_*` weekend rows 2002–2013 (fault #9, still open).

### 2.10 Macro PIT outside the store

* `js/globalLiquidityEngine.js:27,118-125,158,204`: monthly series dated the 1st enter the weekly grid on the first
  week ≥ the 1st, then lag 2 (CB) / 3 (growth) weeks. INDPRO for month M (published ~M+1 day 16) is used from ≈M day
  22 → **~3.5 weeks early**; JPNASSETS (month M, published early M+1) ≈2–3 weeks early. All latest-vintage. Feeds
  global-liquidity.html, GLI backtests, q6 rerun. VERIFIED by trace.
* `GlobalLiquidity/data.py:78-96, 110-129`: forward-fills latest revised FRED with **no lag at all**.
* `analysis/regime_study.mjs` uses a 1-month lag (OK on timing) but revised data.

### 2.11 COT and calendar loaders

* COT: release = report + 3 d, tradable from the following Monday (`js/cotFactorCore.js:95-101`) — conservative except
  shutdown weeks (above). `scripts/positioning-into-release/run.py:31` excludes only the 2018-19 shutdown, but its END is
  2025-04-07, so it is unaffected.
* Calendar: legacy and Nasdaq files are both UTC-dated (0 rows where `date` ≠ UTC date of `datetime_raw`); Nasdaq D-1
  quirk handled (`fetch_nasdaq_calendar.py:96`); `load_calendar()` drops the 46k dups. `forge/vol.py:477`
  `load_event_tags` still reads the raw CSV **with duplicates** (harmless for tags, matters for counts) and as utf-8
  (documented). Asia-time releases (23:30 UTC) carry the UTC date, i.e. the previous London date in BST — minor.

---

## 3. Known-faults table: is "fixed" really fixed? Residual call sites

| Fault | Claimed | Finding |
|---|---|---|
| #1 `*_d1.parquet` for σ | research switched | Residual readers of UTC D1 files: `oi_research_book/scripts/15_iv_forecast_test.py:26` (**iv-forecast, validated**: HAR/RV features over Sunday-stub rows), `oi_research_book/scripts/01_build_daily_dataset.py:38` (fault #11, open), `forge/export_iv_adjusted_params.py:60` (superseded by `_ny`), `VolRangeForecaster/vol_backtest.py:133`, `analysis/surfaces/absorption_check.py:15`, `analysis/surfaces/vol_term_check.py:25`, `analysis/cvol_spec_curve.py:117`, `cog-replication/test_g1_direction.py:148`. UTC-day resamples via `forge.bars.frame(m1,"d1")`: `forge/yield_basket.py:171,196`, `forge/xsect_test.py`. Plus the London-session-with-Sunday-stub σ in 2.5 (`runAnalyser`, `zonePricer`) |
| #2 Yahoo index σ | fixed 2026-10-06 | **Confirmed fixed** live: `ladder_sigma_source: 'oanda'` for SPX500/DE30/US30/US2000/UK100. `scripts/data_integrity.mjs` still FLAGs it because it only reads `data_source` (stale check, false positive) |
| #3 late audits | fixed cf47b9a0 | Live: 28 usable / 34; the 6 late ones are all ≤ 2026-10-01 (pre-fix). Post-GMT audits now run 23:2x–23:56 UTC — inside the London day but within 4 min of midnight on 2026-10-29/30; a few minutes' drift would recreate the fault |
| #8 net-liquidity units | fixed in code | **Residual**: `GlobalLiquidity/config.py:49-58` still `"walcl / 1000 - tga - rrp"` with TGA labelled $B. With 2026-10-14 FRED values: **−876,617 $bn instead of 5,872** (`test_gli_units.py`). Synthetic generator `GlobalLiquidity/data.py:174-186` encodes the same wrong units, so `test_smoke.py` passes. JS side (`backtestCore.mjs` → `globalLiquidityEngine.js`) is fixed |
| #10/#14 range-line Monday / London | fixed 2026-10-24, "London everywhere" | **Residual 22-UTC callers**: `js/rangeLineAnalyser.js:914,924` (`touchesForPair`/`recordsForPair` default `?? 22`) reached from `server.js:34732` **`/api/levels-v2/learn`** (no boundaryHour in opts, `:34699-34706`) and `js/confluenceTest.js:140` from `server.js:35297` **`/api/levels-v2/confluence-test`**; `server.js:34609` **`/api/liquidity-backtest/run`** (`_bucketM1IntoSessions(packed)`); `scripts/build_daily_open_votetrades.mjs:111` (22, explicit). Range-line route itself is London (`server.js:34388`). |
| — new: levels-v2 learn/live drift | — | **VERIFIED by trace**: the live producer `levelsV2Engine.js:100-118` builds the Asia range from **00:00–06:00 UTC** and Monday from the UTC Monday, citing "the learn route buckets at boundaryHour default 0". Since `6a3b1af8` (2026-06-29) the default is 22, so the policy in KV `policy_v2` is learned on **22:00–04:00 UTC** Asia and a Sun-22:00→Mon-22:00 Monday. Live ladder ≠ learned ladder by 2 h. Active: `refreshAllPairsV2` (server.js:39413) and alert loop (:39938); page telegram-v2.html |
| — vol-backtest legacy | — | `runFullM1Backtest`/`runFullLevelAnalysis` (`js/volBacktestM1Engine.js:1475,1609`) pair OANDA D1 (17:00 NY, relabelled +1 day) with M1 grouped by **UTC date** (`groupByDate`), so the intraday path starts 2–3 h after the D1 open and includes 2–3 h of the next D1 day. Feeds `/api/vol-backtest/run` and `/level-analysis` (vol-backtest.html, weekly-vol-backtest.html) |
| #11/#12 OI book | open | unchanged (still open in code) |
| — Python London date joins | — | `forge/run_futures_vs_cfd.py:30` re-keys correctly; `forge/run_iv_sizing_filter.py:45` and `forge/run_vol_iv.py:43` use `merge_asof(... allow_exact_matches=False)` on the naive-UTC index, which happens to pick settle D-1 in both seasons (OK). The broken one is `tag_column` (2.7) and `export_vol_compare.py` |

---

## 4. Integrity run and freshness

`node scripts/data_integrity.mjs` cannot run here as-is: it imports `hyparquet`/`@aws-sdk` (no `node_modules`), and
without R2 creds `loadM1ForPair` would fall back to a Google Drive download that **writes into the repo**, and the
report is written to `analysis/output/`. I ran a copy (`work_data/di_copy.mjs`) with the M1 loader stubbed,
`--no-local`, output redirected to scratch. Live (read-only production API) result:

* FLAG live σ source — 7 instruments on Yahoo `data_source` (false positive for the 5 OANDA-ladder indices, see #2;
  genuinely Yahoo for NQ (NQ=F, fine) and BTCUSD (no research history)).
* OK stale forecasts; OK HAR shadow present (41/41).
* FLAG session audits — 28/34 usable; late ones 2026-09-15/18/22/25/28, 10-01 (pre-fix, readers skip them).
* LOCAL section not run: no M1 in container.

Freshness problems (as of 2026-10-31):

* Research M1 cache ends 2026-08-21 (71 days; also the lockbox). Local copy absent here.
* PIT feature store last built 2026-10-16 (15 days); `rate3m_eur` dead since 2026-02-16, `rate3m_aud` 2026-09-15,
  `move_index` 2026-09-21, `hl_london_*` 2026-08-21; 8 CPI/yield features `gap`.
* STIR CSVs (SR3, Euribor, €STR) 2026-10-08/09, manual; ZQ 2026-10-26.
* `js/data/cmeCvolEod.json` 2026-08-21, `js/data/cboeVolIndices.json` 2026-08-22, Cboe CSVs 2026-10-20/21.
* `backfill/surprise_backfill.json` 2026-09-09; `backfill/event_response_*` 2026-09-17; `calendar_events.csv` 2026-07-02.
* Production data-health: dead EVZCLS (2025-03-11), dead `fwd_fade_log`; stale 5 bot states (2026-09-29); lagging
  `drill` (5 sessions, dxy), `crack` (3), `release_layer2_v1` (4), `volatility_bot_v2_plan` (10); 41 rows "unknown"
  (no timestamp reported, incl. `cot_data`, `oanda_book_history_v1`, `oi_history_raw`, `session_stats`).
* KV is the sole copy of `oi_raw_*` (QuikStrike) — irreplaceable data with no second copy.

---

## 5. Priority fixes (data layer)

1. `forge/vol.py:510` — key `tag_column` by London date (`idx.tz_localize('UTC').tz_convert('Europe/London')`), refit
   `js/forecastLadderParams.js` event multipliers; also fix `export_vol_compare.py` keys.
2. `forge/vol.py:load_daily` — drop London weekend dates; `js/forecastAnalyser.js:runAnalyser` — drop weekend London
   dates (or raise min bars to ≥ 600); `zonePricer.mjs` — use `nyCloseDailyBars` for σ. Rebuild the analyser book.
3. `js/harness/features.mjs:at()` — choose the max-date row among rows with `asof ≤ t` (per-date latest vintage), add a
   max-age per cadence.
4. `levelsV2Engine.js` vs `/api/levels-v2/learn` — pass an explicit `boundaryHour` and make live use the same window
   (or re-learn the policy); make `recordsForPair`/`confluenceForPair` default `'Europe/London'`.
5. `GlobalLiquidity/config.py` USD formula → `walcl/1000 - tga/1000 - rrp` (and the synthetic generator).
6. Feature-store asof: credit OAS/Moody's → `fixed_lag:1`; TFF/COT → shutdown-aware release dates.
7. GLI monthly lags → publication-date based (≥ 6 weeks for INDPRO, ≥ 5 for JPNASSETS) or ALFRED vintages.
8. `data_integrity.mjs` — read `ladder_sigma_source`; add a no-write mode (`loadM1ForPairLocal`) and an `--out` flag.
