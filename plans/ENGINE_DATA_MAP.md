# Engine data map: global → country → asset

*2026-11-01. Owner: "creating that analysis engine of the global position, country position and then asset/stock
position... what data we have and don't use, how can you use it, and what data exists in the world which we don't
have which we could use. That's the key."*

**Method.** Every claim below was checked against code or live data, not memory:
- the page → API map: 643 feeds, 466 that never reach today/state/atlas/index;
- the store builders in `server.js`;
- the 100-feature manifest `plans/FEATURE_MANIFEST.json`;
- read-only GETs of production's own stores on 2026-11-01.

**Status words:**
- **IN ENGINE**: `/api/state` reads it today.
- **HELD, UNUSED**: the repo already has it, but the engine does not read it yet.
- **MISSING**: we don't hold it. The source is named, with cost and cadence.

Rule (`MARKET_STATE_ENGINE_PLAN.md` §0b): read the repo's store first; a new fetch only for **MISSING** rows.

---

## 1. Global position: what money, liquidity and risk are doing everywhere

| What | Status | Where / source | How the engine uses it |
|---|---|---|---|
| US rates, curve, real yields, breakevens, VIX/VIX3M, HY/IG OAS | IN ENGINE | KV `fredhistory_series_*`, R2 deep copy | tiers, chain, regimes |
| Fed net liquidity, TGA (weekly and daily), RRP, reserves, swap lines, H.8 bank credit | IN ENGINE | keyed FRED, Treasury DTS | liquidity layer |
| **G4 central-bank liquidity** (Fed + ECB + BoJ + PBoC proxy, USD) | IN ENGINE (new) | `js/globalLiquidityEngine.js`, which used to run only in the browser | impulse, cycle phase, per-currency impulse; never tested, shown as description |
| BIS cross-border dollar credit (USD, non-bank financials, Cayman, yen offshore) | IN ENGINE | KV `bank_credit_v1` | global dollar credit row |
| COT, 36 markets at full depth | IN ENGINE (fixed) | worker `cot_extremes_v3` (now warmed by the state reader), R2 `archive/tables/cot/` | positioning layer; state D and release-day crowding (both stand) |
| Long vol history (VIX since 1990, MOVE, SKEW, OVX, GVZ, VXEEM, VXTLT) | IN ENGINE | Cboe seeds, R2 | long-history context |
| GPR (geopolitical risk), surprises 2007→, nowcast, Fed path | IN ENGINE | KV / R2 / committed backfill | economies, global banner |
| **Offshore dollar plumbing:** Fed foreign repo pool (WLRRAFOIAL), Fed custody of Treasuries for foreign officials (WMTSECL1), foreign banks' US credit, net due to foreign offices | IN ENGINE (2026-11-01) | keyed FRED ids from the feature store (`fed_foreign_repo`, `fed_custody_ust`, `h8_foreign_bank_credit`, `h8_net_due_foreign`) | "who wants dollars": custody falling = foreign officials selling Treasuries; the foreign repo pool is where they park dollars. Add to the liquidity layer through keyed FRED |
| **Money markets:** CP outstanding, 3M financial CP, SOFR volume, EFFR, plus CP − fed funds | IN ENGINE (2026-11-01) | feature store, FRED | funding stress before it reaches credit spreads |
| **Treasury basis-trade crowding:** leveraged-fund share of UST 2Y/10Y/bond futures (TFF) | IN ENGINE (2026-11-01) | COT archive (TU, TY, US) | the 2020-style forced-unwind risk; add to the COT layer |
| **Cross-currency basis** EUR/GBP/JPY/CHF (live, realised, daily change) | HELD ON THE LAPTOP ONLY | `scripts/xccy-basis/build.py` → feature store; needs CME data from NT8, so the server cannot build it. Fix: upload the daily feature parquet to R2 | dollar funding stress outside the US; basis-yearend-premium stands (year-end turn) |
| **Chicago Fed NFCI** (+ St Louis STLFSI4) | IN ENGINE (2026-11-01) | keyed FRED | one-number financial conditions in the global banner |
| **5y5y inflation expectations** (T5YIFR) | IN ENGINE (2026-11-01) | keyed FRED | inflation-anchoring check in the playbook quadrant |
| Cboe option chains: dealer gamma for SPY, QQQ, IWM, SPX, NDX, TLT, HYG, GLD | IN ENGINE (2026-11-01; `cboeLadder` on live chains, cached 6 h). Daily archive in R2 `cboe_raw/` still unused for history | R2 `cboe_raw/` | dealer gamma across index **and ETF** options (QQQ ≈ 3× NDX); today the engine sees CME only |
| CME implied-vol term archive | HELD, UNUSED | `analysis/output/iv_term/iv_term_daily.csv` | vol term structure per FX/index/metal |
| Kansas City FSI | MISSING | FRED (free, monthly) | cross-check NFCI; trivial to add via keyed FRED |
| OFR Financial Stress Index (33 variables, daily) | MISSING | financialresearch.gov CSV (free, daily) | the broadest free daily stress gauge, with a global breakdown (US / other advanced / EM) |
| ECB, BoE, SNB, BoJ balance sheets directly (weekly) | MISSING (partly via FRED) | ECB Data Portal API, SNB data portal (sight deposits weekly = CHF intervention), BoJ time-series API; all free | G4 engine on primary data; SNB sight deposits are the CHF intervention tell |
| China: total social financing, M2, new loans, PBoC liquidity ops | MISSING | PBoC releases (free, monthly, scraping); CEIC is licensed | the credit impulse that drives metals, AUD and EM; the G4 PBoC leg is only an FX-reserve proxy today |
| TIC monthly cross-border flows | MISSING | Treasury TIC (free, monthly) | who is buying or selling US assets, by country |
| Japan MoF: weekly portfolio flows and monthly intervention | MISSING | MoF Japan (free) | JPY's own flow tape: carry exits and intervention |
| IMF COFER reserve composition | MISSING | IMF API (free, quarterly) | slow-moving dollar-share context |
| EIA weekly petroleum (inventories, production) | MISSING | EIA API (free key, weekly) | oil supply state behind the energy and CAD story |
| Global PMIs (S&P Global) | MISSING, licensed | proxy already held: OECD business confidence (`ism_v1`); add OECD CLI (free SDMX API) | the growth leg of the quadrant for every economy |

## 2. Country position: each economy's growth, inflation, labour, policy

**IN ENGINE (new), per currency** for USD, EUR, GBP, JPY, AUD, CAD, CHF and NZD:
- the country grid now reads the server's own stores: `cpi_v1`, `ppi_v1`, `gdp_v1`, `ism_v1`, `labor_market_v1`, `retail_sales_v1`, `consumer_confidence_v1`, `trade_balance_v1`, `real_yield_v1`, `yield_curve_v1`, `rate_diff_v1`;
- each central bank's latest statement read (hawkish score, regime) and its calendar;
- surprises.

**Gaps, measured on production's stores, 2026-11-01:**

| Store | Gap | Fix | Source (free unless noted) |
|---|---|---|---|
| CPI | **GBP, JPY, AUD, CAD, NZD stopped** (FRED/OECD mirrors discontinued 2021–2025) | GBP from ONS D7G7 and CAD from StatCan, already used by the regime study, **now in the engine**. JPY, AUD, NZD still missing | JPY: e-Stat API (Statistics Bureau, free key, monthly). AUD: ABS Data API (monthly CPI indicator + quarterly). NZD: Stats NZ (quarterly) |
| Real yield | missing wherever CPI is missing | GBP and CAD now derived (10Y − national CPI), labelled | follows CPI |
| PPI | USD only | add | Eurostat (EA), ONS (UK), BoJ CGPI (JP), StatCan IPPI: all free |
| Retail sales | AUD stopped 2025-04, CAD stopped 2022-01; EUR, GBP, JPY stuck at 2026-04 (the OECD copy runs ~6 months behind) | switch to national sources | Eurostat, ONS, METI, ABS, StatCan |
| Business survey (`ism_v1`, OECD BCI) | CAD stale at 2026-04 | OECD CLI as the common growth lead; national surveys | OECD SDMX; CFIB (CA) |
| Consumer confidence | CAD absent | add | Conference Board of Canada is licensed; proxy: OECD CCI |
| Yield curves | non-US curves are **monthly** OECD series | daily curves | Bundesbank (DE), BoE yield curves (UK), MoF JGB (JP), RBA F2 (AU), BoC (CA), SNB (CH), RBNZ: all free daily |
| Policy path, non-US | only the Fed path is market-implied | from daily 2Y yields, or OIS where free | 2Y from the daily curves above; €STR/SONIA futures are exchange data (delayed, terms apply) |
| RBNZ statement read | no analysis yet on production | press Fetch on rbnz-sentiment.html once | RBNZ |

## 3. Asset position: where money sits inside markets

| What | Status | Where / source | Use |
|---|---|---|---|
| 11 S&P sectors + semis + equal-weight, 12 largest names | IN ENGINE (new) | drill bundle (Yahoo, since 2020) | relative strength, % off the 1-year high |
| Cboe dispersion, 1M/3M implied correlation, single-name vol (VIXEQ) | IN ENGINE (new) | drill bundle (Cboe) | "index calm, stocks not": dispersion is at its 93rd percentile today |
| Credit stack IG / HY / CCC | IN ENGINE (new) | drill bundle (FRED) | CCC at its 99th percentile, +110bp in 20 days, while IG and HY are calm |
| Sector sensitivity to yields, oil, dollar (60-session betas) | IN ENGINE (new) | computed from the bundle | how one thing moves another, measured now |
| Index options OI, walls, gamma (CME); Cboe chains for 18 ETFs/indices | HELD, partly used | `oi-dashboard*`, R2 `cboe_raw/` | per-asset dealer positioning; add ETF gamma to the asset layer |
| COT for commodities, rates, equity futures | IN ENGINE (board) | R2 | per-asset crowding; state D stands on 22 holdout markets |
| **Full S&P 500 constituents** (true breadth: % above 50/200-day, new highs/lows, A/D) | MISSING | Yahoo or Stooq daily (free, rate-limited), or Nasdaq screener | real breadth instead of the RSP/SPY proxy |
| **Earnings:** actuals | MISSING | SEC XBRL `companyfacts` API (free) | profit growth by sector |
| Earnings estimates and revisions | MISSING, licensed | FactSet, LSEG, Zacks (paid). Free partial: Nasdaq earnings calendar (schedule already held: `/api/earnings-ahead`) | the strongest single equity factor; needs a budget decision |
| Valuation: CAPE, index EPS | MISSING | Shiller data (free XLS), S&P index EPS spreadsheet (free) | valuation regime for the asset layer |
| **Fund flows:** ICI weekly mutual-fund/ETF flows; ETF shares outstanding | MISSING | ICI (free weekly), issuer sites (free daily) | where money is moving between equity, bond and money-market funds |
| **Leverage and shorts:** FINRA margin debt (monthly), short interest (twice monthly), ATS dark-pool volume (weekly) | MISSING | FINRA (free) | crowding and leverage per stock/sector |
| Retail sentiment: AAII weekly, Cboe put/call | MISSING | AAII (free), Cboe daily CSV (free) | contrarian context, never a signal until tested |
| Insider transactions (Form 4), 13F holdings | MISSING | SEC EDGAR (free) | who owns and who is selling, per name |
| Single-stock option chains for the 12 leaders | MISSING (same API as held) | extend `_cboeRawArchiveTick` to the 12 names | name-level gamma and skew |

## 4. Order of work (proposed)

1. **Already done today:**
   - country grid from the stores;
   - GBP/CAD CPI and real yields from national sources;
   - G4 global liquidity on the server;
   - asset layer from the drill bundle;
   - COT layer without a page visit.
2. **Held, unused → engine:** no new data, just wiring.
   - offshore dollar plumbing, money markets and TFF basis crowding (FRED ids are in the manifest);
   - NFCI and 5y5y in the global banner;
   - Cboe ETF gamma in the asset layer.
3. **Country gaps, free national sources:**
   - JPY/AUD/NZD CPI;
   - non-US PPI;
   - retail sales;
   - daily non-US yield curves (and from them, market-implied policy paths).
4. **Global missing, free:**
   - OFR FSI and STLFSI;
   - TIC;
   - MoF Japan flows;
   - SNB sight deposits;
   - EIA;
   - OECD CLI.
5. **Asset missing, free:**
   - S&P 500 constituents → real breadth;
   - SEC earnings actuals;
   - ICI flows;
   - FINRA margin and short interest;
   - CAPE.
6. **Needs a budget decision:** earnings estimates and revisions, PMIs, China credit (CEIC). Free proxies are named above.

Every new series follows `plans/DATA_SPEC.md` and the data-rules skill:
- point-in-time dates;
- archived to R2 on first fetch (`js/dataArchive.js`);
- a row in `js/dataFeeds.js`;
- description first;
- a forecast claim only through a registered, audited test.
