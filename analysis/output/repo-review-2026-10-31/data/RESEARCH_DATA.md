# Research by data: which data carries proven value, which was tested narrowly, which was never put to work

MacroFXModel, 2026-10-31. Inputs: `js/deskEvidence.js` (293 entries: 49 validated, 145 null, 55 underpowered, 44 context),
`analysis/output/repo-review-2026-10-31/VERDICT_AUDIT.csv` (249 audited: 144 STANDS, 66 REOPENED, 39 UNVERIFIED),
`analysis/output/repo-review-2026-10-31/DATA.md` (feed inventory), `DIRECTION.md` (effective-N / MDE table).
No repo file was modified.

Files:
- `research_by_data.csv`: one row per Evidence Book entry. Columns: id, verdict, audit status, data-family codes and names, tiers,
  outcome type, driver type, design, period, doc.
- `family_summary.csv`: one row per data family, including the never-tested families.

**Method and limits.** Families were assigned by hand for all 293 entries. For each entry I read its claim, result, use and
instruments, the "Data" section of its doc (172 distinct docs), and where needed the scripts. A keyword pass over doc and
script text was used only as a cross-check. A family is counted when the test *reads* it, whether as the signal, the outcome
market or a control. FX and index prices are inputs to almost everything, so the signal-only reading is given separately in §1b.
Periods are approximate start–end years. Designs: TS1 = one instrument, time series; TSm = the same rule run per instrument and
reported per instrument; POOL = a pooled panel; XS = cross-sectional ranking; EVT = an event study; FC = an out-of-sample forecast
comparison; BT = a trading backtest; DESC = descriptive. Outcomes: R = range/vol, D = direction/return, L = level/path,
P = trade P&L, F = forecast skill, X = descriptive or cost. Marks:
**PROVEN** = at least one validated entry whose audit STANDS; **REOPENED-HEAVY** = at least half of the audited entries are
REOPENED; **TESTED-NARROW** = nothing validated stands, and there are ≤5 tests, or only one design, or only one outcome type;
**TESTED-NO-EDGE** = several designs and outcomes, nothing standing; **NEVER-TESTED** = held or fed, with no Evidence Book entry.

## 1. Data families

### 1a. Families as used by any test
| Tier | Family (`code`) | Tests | V/N/U/C | Audit S/R/? | Validated that STANDS | Designs | Outcomes | Typical start | Mark |
|---|---|---|---|---|---|---|---|---|---|
| economy/macro | FRED/OECD macro activity & inflation (CPI, INDPRO, CFNAI, GDP, IFO) (`MAC`) | 5 | 0/5/0/0 | 2/2/1 | 0 | TS1 3, TSm 2 | D 3, R 1, P 1 | 1990-2026 | **TESTED-NARROW** |
| economy/macro | Nowcasts (GDPNow, Cleveland CPI; ALFRED vintages) (`NOW`) | 2 | 0/1/0/1 | 0/1/0 | 0 | EVT 2 | D 2 | 2011-2026 | **TESTED-NARROW** |
| rates | FRED US Treasury curve/real/breakeven/term premium (DGS*, DFII10, T10YIE, T10Y2Y) (`UST`) | 44 | 2/23/6/13 | 11/16/4 | 0 | TSm 17, TS1 6, EVT 6, DESC 5, POOL 5, FC 4, XS 1 | D 24, R 14, X 3, F 2, P 1 | 2007-2026 | **REOPENED-HEAVY** |
| rates | Short/policy rates (OECD 3m interbank, GS2, DFF) (`SR`) | 18 | 0/10/1/7 | 5/2/4 | 0 | TSm 6, BT 5, POOL 2, FC 2, XS 2, DESC 1 | P 8, D 6, F 2, R 1, X 1 | 2007-2026 | **TESTED-NO-EDGE** |
| rates | STIR futures (SR3, Euribor, ESTR, ZQ, ZT, Schatz; IBKR 1-15m) (`STIR`) | 17 | 0/15/0/2 | 8/4/3 | 0 | TS1 11, TSm 5, DESC 1 | D 15, X 1, R 1 | 2024-2026 | **TESTED-NO-EDGE** |
| rates | OANDA bond & commodity CFDs (USB02Y..30Y, DE10YB, UK10YB, WTI, XAG) M15/D1 (`BCFD`) | 16 | 0/12/4/0 | 10/6/0 | 0 | EVT 6, TSm 5, TS1 4, XS 1 | D 12, R 4 | 2008-2026 | **TESTED-NO-EDGE** |
| rates | Intl govt yields (Bundesbank, BoE IADB, MoF JGB, OECD 10y) (`INTY`) | 12 | 0/5/2/5 | 4/3/0 | 0 | TSm 8, FC 2, POOL 1, DESC 1 | D 10, X 1, R 1 | 2008-2026 | **TESTED-NO-EDGE** |
| credit & funding | Cross-currency basis (CME FX futures vs spot, EUR/GBP/JPY/CHF) (`XCCY`) | 10 | 2/5/2/1 | 5/3/1 | 1 — basis-yearend-premium | TS1 5, EVT 3, POOL 2 | R 4, D 3, X 3 | 2016-2026 | **PROVEN** |
| credit & funding | Credit spreads (FRED BAA/AAA, ICE HY/IG OAS; Yahoo HYG/IEF) (`CRED`) | 9 | 0/4/1/4 | 1/4/0 | 0 | TSm 5, POOL 4 | R 5, D 3, D+R 1 | 2020-2026 | **REOPENED-HEAVY** |
| credit & funding | Funding rates (SOFR, SOFR99, IORB/IOER, RRP, AA CP, SOFR volume) (`FUND`) | 8 | 0/2/4/2 | 3/1/2 | 0 | POOL 4, TSm 2, EVT 2 | R 5, D 2, X 1 | 2018-2026 | **TESTED-NO-EDGE** |
| liquidity & banking | BIS LBS cross-border bank credit (`BIS`) | 9 | 0/3/5/1 | 3/0/5 | 0 | TS1 5, XS 4 | D 6, R 3 | 1980-2026 | **TESTED-NO-EDGE** |
| liquidity & banking | Net liquidity H.4.1 (WALCL - TGA - RRP, ALFRED vintages) (`NLIQ`) | 7 | 0/3/3/1 | 3/3/0 | 0 | TSm 3, POOL 2, TS1 2 | D 5, R 2 | 2011-2026 | **REOPENED-HEAVY** |
| FX | OANDA FX & gold M1/D1 (28 FX + XAU) (`FX`) | 171 | 29/87/19/36 | 75/38/22 | 16 | TSm 42, BT 36, POOL 26, FC 20, DESC 19, EVT 14, TS1 9, XS 5 | D 45, R 41, P 37, F 20, L 16, X 12 | 2016-2026 | **PROVEN** |
| FX | FRED H.10 FX daily + broad dollar (DEX*, DTWEXBGS; 1971+) (`FXH10`) | 12 | 0/6/1/5 | 5/1/1 | 0 | TSm 4, DESC 2, EVT 1, POOL 1, BT 1, XS 1, FC 1, TS1 1 | D 7, P 3, X 1, R 1 | 1976-2026 | **TESTED-NO-EDGE** |
| equities | OANDA index CFDs M1/D1 (NAS100, SPX500, US30, US2000, DE30, UK100) (`IDX`) | 126 | 29/54/20/23 | 69/25/9 | 19 | TSm 33, POOL 21, BT 20, FC 19, DESC 14, TS1 11, EVT 6, XS 2 | R 38, D 25, P 20, F 19, L 14, X 9, D+R 1 | 2016-2026 | **PROVEN** |
| equities | Yahoo / FRED daily closes (indices, ETFs, futures, EM FX, NASDAQ100) (`YH`) | 45 | 5/18/20/2 | 32/4/7 | 2 — cot-crowding-p5, us-extras-confirm | TS1 17, POOL 14, BT 5, FC 4, XS 4, DESC 1 | D 19, R 16, P 6, F 3, X 1 | 2007-2026 | **PROVEN** |
| equities | CME index futures intraday (NQ/ES via NT8 or IBKR 1m) (`NT8`) | 17 | 2/15/0/0 | 8/3/6 | 1 — vmc-nq-cipher-sequencing | TS1 17 | D 12, R 4, X 1 | 2026 | **PROVEN** |
| volatility & options | Cboe vol indices (VIX, VIX3M, VIX9D, VVIX, VXN, GVZ; 21 files) (`VIX`) | 45 | 19/11/10/5 | 21/12/7 | 9 | TS1 10, FC 10, BT 9, TSm 6, POOL 4, XS 3, DESC 2, EVT 1 | R 16, P 10, D 9, F 8, X 2 | 2016-2026 | **PROVEN** |
| volatility & options | CME CVOL (FX/gold implied vol + skew) (`CVOL`) | 9 | 3/5/1/0 | 6/1/2 | 1 — combined-range | BT 6, FC 3 | P 6, F 3 | 2016-2026 | **PROVEN** |
| volatility & options | CME settlement-inverted implied vol (iv30/iv90, RR) (`CMEIV`) | 7 | 5/2/0/0 | 5/1/1 | 3 — iv-ladder, iv-forecast, forecast-pick | FC 4, BT 3 | F 4, P 3 | 2020-2026 | **PROVEN** |
| volatility & options | MOVE index (rates implied vol) (`MOVE`) | 4 | 0/1/2/1 | 2/1/0 | 0 | TS1 3, POOL 1 | R 4 | 2016-2026 | **TESTED-NARROW** |
| volatility & options | Cboe DSPX dispersion (`DSPX`) | 3 | 2/1/0/0 | 0/3/0 | 0 | TSm 3 | R 3 | 2014-2026 | **REOPENED-HEAVY+TESTED-NARROW** |
| volatility & options | Cboe VX futures settlements (`VX`) | 2 | 1/0/1/0 | 1/1/0 | 0 | BT 2 | P 2 | 2013-2026 | **REOPENED-HEAVY+TESTED-NARROW** |
| positioning | CFTC COT/TFF/Disaggregated (FX, commodities, index futures) (`COT`) | 27 | 2/13/12/0 | 24/3/0 | 2 — positioning-into-release-direction, cot-crowding-p5 | POOL 15, BT 6, EVT 2, FC 2, TSm 1, XS 1 | D 10, R 9, P 6, F 2 | 2007-2026 | **PROVEN** |
| positioning | CME options OI / dealer gamma (QuikStrike, Databento ES) (`OI`) | 9 | 1/6/2/0 | 4/5/0 | 0 | TSm 4, TS1 2, BT 2, FC 1 | R 4, L 2, P 2, F 1 | 2020-2026 | **REOPENED-HEAVY** |
| positioning | CFTC TFF leveraged-fund Treasury futures (basis-trade footprint) (`TFF`) | 4 | 0/1/3/0 | 3/1/0 | 0 | TS1 2, EVT 1, POOL 1 | R 3, D 1 | 2007-2026 | **TESTED-NARROW** |
| positioning | OANDA retail position book (`RET`) | 1 | 0/1/0/0 | 0/1/0 | 0 | TSm 1 | R 1 | 2018-2026 | **TESTED-NARROW** |
| events | Economic calendar (times, impact; calendar_events.csv, FF 2007-25, Nasdaq) (`CAL`) | 24 | 5/13/4/2 | 13/5/4 | 3 — positioning-into-release-direction, vol-curve-front, iv-ladder | EVT 7, TS1 7, TSm 4, FC 3, POOL 1, DESC 1, XS 1 | R 12, D 8, F 3, X 1 | 2016-2026 | **PROVEN** |
| events | CB decision dates & statement text (FOMC lexicon) (`CB`) | 11 | 2/4/2/3 | 4/3/1 | 0 | EVT 9, TSm 2 | D 9, R 2 | 2016-2026 | **TESTED-NO-EDGE** |
| events | Surprise store (actual vs consensus z; ALFRED first print) (`SURP`) | 8 | 2/3/2/1 | 2/4/1 | 0 | EVT 8 | D 5, R 3 | 2016-2026 | **REOPENED-HEAVY+TESTED-NARROW** |
| events | Fiscal events (UK Budgets, US Refunding) (`FISC`) | 4 | 0/2/2/0 | 3/1/0 | 0 | EVT 4 | R 2, D 2 | 2008-2026 | **TESTED-NARROW** |
| prices | Commodity prices (FRED WTI/gasoline/heating oil, copper) (`CMD`) | 8 | 0/5/2/1 | 4/3/0 | 0 | TS1 3, FC 2, DESC 1, TSm 1, POOL 1 | D 6, X 1, R 1 | 1986-2026 | **TESTED-NO-EDGE** |
| internal | Desk forecast history (PIT ladder/export lines, vf3 stage B) (`FC`) | 69 | 13/38/8/10 | 48/4/7 | 9 | BT 24, POOL 17, FC 14, DESC 8, TSm 5, TS1 1 | P 24, F 14, R 11, L 9, X 7, D 4 | 2016-2026 | **PROVEN** |
| internal | OANDA bid/ask M1 + financing (`BA`) | 12 | 1/4/4/3 | 5/0/4 | 0 | BT 7, DESC 3, EVT 2 | P 7, X 3, D 2 | 2016-2026 | **TESTED-NO-EDGE** |
| internal | Market View drill bundle (59 series, 2020+) (`DRILL`) | 5 | 2/2/0/1 | 0/4/0 | 0 | TSm 3, POOL 2 | R 3, D 2 | 2020-2026 | **REOPENED-HEAVY+TESTED-NARROW** |
| internal | Owner broker trade history (`TH`) | 1 | 0/0/0/1 | 0/0/0 | 0 | DESC 1 | X 1 | 2026 | **TESTED-NARROW** |
### 1b. Where the proven value sits (family as the *signal*, validated and STANDS)

Of the 49 validated entries, 30 STAND. Read as signals rather than as outcome markets, the standing value comes from a small set
of data:

| Signal data | Standing validated entries | What it is good for |
|---|---|---|
| Cboe vol indices (VIX, VIX3M, VIX9D, VXN, GVZ) | vix-inversion, iv-over-rv-wider, vol-curve-front, combined-range, us-extras-confirm, forecast-miss-shock-idx, forecast-miss-shock-fx (and VXN as the validation series in iv-forecast and forecast-pick) | **Range/vol** on indices, and on FX through forecast misses |
| CME settlement-inverted IV (`oi_research_book/data/iv_daily_*`) and CVOL | iv-ladder, iv-forecast, forecast-pick, combined-range | **Range forecasting** (σ inputs) |
| Own price, FX + index M1/D1 (OANDA) | first-hour-fraction, fast-start-rest-of-day, band-reach-from-here, extreme-in-probability, horizon-reversion, forecast-persistence-fix, range-ladder-placebo-confirm, breadth-all-down, drawdown-forecast-error-fx/idx, forecast-miss-month-end-fx | Intraday and daily **range/path** |
| CFTC COT (TFF/Disaggregated) | positioning-into-release-direction, cot-crowding-p5 | The **only standing direction results**: both are conditional events, and both pool many markets or releases |
| Yahoo daily breadth (US cash indices) | us-extras-confirm | Range |
| Cross-currency basis | basis-yearend-premium | A funding-cost calendar fact, not a market forecast |
| NT8 NQ 1m | vmc-nq-cipher-sequencing | Descriptive indicator ordering |

**No standing validated result uses** macro data, Treasury or foreign yields, short rates or STIR, credit spreads, funding rates,
net liquidity, BIS, MOVE, OI/gamma, the surprise store or CB statements as its signal. Every validated entry in those families is
REOPENED or UNVERIFIED: `surprise-size`, `post-fomc-usd-drift`, `nq-down-week`, `gex-range-es`, `dispersion-reset`,
`mv-*-range`, and `event-impact-map` (UNVERIFIED). The repo's demonstrated edge is **vol/range from implied vol and own price**.
The macro, rates, credit and liquidity tiers have been tested many times without a result that still stands.

### 1c. Never tested (held or fed, with no Evidence Book entry)
| Tier | Family (`code`) | Where it is held |
|---|---|---|
| economy/macro | Non-US macro engines (CPI/PPI/GDP/labour/retail via ONS, Eurostat, StatCan, OECD BTS) (`NONUSMAC`) | KV cpi_v1 etc. (latest vintage); feature store cpi_* gaps |
| rates | Fed path (ZQ strip as path, Atlanta Fed MPT probabilities) as daily state (`ZQMPT`) | KV zq_path_v1, mpt_store_v1; analysis/output/stir/CBOT_ZQ*.csv |
| credit & funding | Funding & leverage read (Fed swap lines, foreign repo pool, H.8 bank balance sheets) (`FUNDREAD`) | KV funding_read_v1 |
| credit & funding | EM / IG OAS sub-series (only HY/BAA-AAA used) (`EMOAS`) | FRED BAMLEMCBPIOAS etc. |
| liquidity & banking | Non-Fed CB balance sheets (ECB, BoJ, PBoC, BoE) / Global liquidity (`CBBS`) | js/globalLiquidityEngine.js, GlobalLiquidity/ (FRED ECBASSETSW, JPNASSETS) |
| volatility & options | QuikStrike IV term structure (FX/gold/NQ) (`IVTERM`) | analysis/output/iv_term/iv_term_daily.csv (2026-07-30 →) |
| volatility & options | Cboe full option chains (18 symbols) (`CBOECHAIN`) | R2 cboe_raw/<SYM>/<date>.json (2026-10-19 →) |
| volatility & options | Other Cboe indices held but never in a test: SKEW, OVX, VXTLT, RVX, VXD, VIX1D/6M/1Y, VXEEM, VXEWZ, VXFXI, VXGDX, VXSLV, single-stock VX (`CBOEX`) | analysis/surfaces/cboe/*.csv |
| positioning | Myfxbook retail sentiment (`MYFX`) | KV sentiment |
| events | Caldara-Iacoviello geopolitical risk index (`GPR`) | KV gpr_v1 (fetched every 8d, "not used") |
| events | Treasury auctions results, Fed speakers, earnings calendar (`AUCT`) | server _calExtras (memory only) |
Also only partly used: non-US policy-rate expectations beyond the IBKR STIR window (SR3/Euribor/€STR files stop 2026-10-08/09);
the ALFRED vintage store (`data/iep_macro`, absent from this container); the 1986–2005 COT history (`cot_weekly.csv` starts
2006-06); and IG OAS (descriptive only).

### 1d. Notes by family
- **UST (44 tests, 0 standing validated, 16 of 31 audited REOPENED).** This is the most-tested macro input. It was run mostly as
  single-instrument or per-instrument time series on 2007–2026 changes, and most often for direction. Its validated cells
  (`nq-down-week`, `event-impact-map`) do not stand. Levels, relative curves and XS designs: 1 XS test (`fx-factor-book-v2`, as a gate).
- **STIR (17 tests, all null or context).** Every test is single-instrument NQ/EURUSD lead-lag on 6–30 months of 15-minute data.
  At that sample length, ρ ≥ 0.18–0.20 was the minimum detectable effect (`cog-matched-pairs`). **Diminishing returns**: more
  tests on this window cannot be powered.
- **COT (27 tests).** Dense but concentrated: 15 POOL tests in one programme (`cot-crowding-*`, 34 markets). XS 1 (`residual-pca-cot`,
  underpowered); pooled rank-IC 1 (`cot-positioning-factor`, p 0.094). It is PROVEN only in conditional designs.
- **Cboe VIX family.** PROVEN for range. Of its 12 REOPENED entries, many are the C.OG VIX/VVIX-per-Nasdaq ratio family
  (`vix-beta-change`, `vvix-ratio-range`, `vix-second-derivative`, `vix-ratio-vx-futures`). Of the 21 Cboe files held, only
  VIX, VIX3M, VIX9D, VVIX, VXN and GVZ (plus the PUT index) were ever read.
- **SURP / CB / CAL.** The surprise store was used only in event studies on single pairs, and its range result (`surprise-size`)
  is REOPENED. CB data was used for FOMC only (9 of 11 tests are EVT; no other central bank). CAL is PROVEN only as conditioning
  (release days for the COT result, event exclusion for vol-curve-front and iv-ladder).
- **BIS (9 tests).** The only family run in a long-history XS design (`bank-credit-panel-*`, `fx-dollar-funding-exposure-*`, 1980+/2004+).
  All results are null or underpowered: quarterly data and two-quarter lags cap the MDE (about 0.24 in single-series TS).
- **OI/gamma (9 tests, 5 of 9 REOPENED).** NQ/ES range plus line trades, 2020+. `gex-range-es` is REOPENED. Gamma as a pooled
  forecast-miss term across the 7 OI instruments has not been run.
- **MAC (5 tests).** All US or German single-series (copper→GDP, IFO→DAX, the regime screen, recession). **There is no
  cross-country macro test.** Non-US macro is not point-in-time (DATA.md §1d.1).

## 2. Combinations

### 2a. Tested driver × target (tests; standing validated)

| Driver | → FX | → Equities | → Rates/bond CFDs | Notes |
|---|---|---|---|---|
| UST | 33 (0) | 18 (0) | – | mostly TSm direction |
| INTY (foreign yields) | 11 (0) | 3 (0) | – | TSm only |
| SR (short-rate diffs, carry) | 14 (0) | 6 (0) | – | XS 2 (rate-diff-xsmom null; fx-factor-book-v2 underpowered) |
| STIR | 6 (0) | 16 (0) | 2 | TS1, 2024–26 |
| CRED | 6 (0) | 7 (0) | – | POOL/TSm; credit as *target* never |
| FUND | 7 (0) | 6 (0) | – | |
| XCCY | 7 (0) | 1 (0) | – | TS1/POOL |
| NLIQ | 5 (0) | 7 (0) | – | |
| BIS | 9 (0) across Yahoo FX and equity outcomes | | – | XS 4 (panel FX/equity, funding exposure), TS1 5 |
| VIX family | 21 (5) | 38 (9) | – | **where the value is** |
| CMEIV / CVOL | 7 (3) / 9 (1) | 5 (3) / 6 (1) | – | range forecasting only |
| MOVE | 1 (0) | 4 (0) | – | range only |
| COT | 7 (1) | 21 (1) | – | |
| OI | 4 (0) | 8 (0) | – | |
| SURP / CB | 5 (0) / 9 (0) | 1 (0) / 4 (0) | 2 / 2 | EVT only |
| CMD | 3 (0) | 2 (0) | 2 (0) | |
| MAC | 2 (0) | 2 (0) | – | |

### 2b. Tested driver × driver combinations
UST×INTY 12 (yield-spread sleeves, non-US gap); UST×CB 7 (FOMC); UST×SR 7; UST×VIX 6; CVOL×VIX 6 (rule A, combined-range ✓);
CMD×UST 5 (oil/crack→breakevens); NLIQ×CRED×UST 5 (macro-confluence ×3, analogue-weeks, forecast-miss-scan; the confluence
tests are flagged defective in DIRECTION.md); CAL×VIX 5 (vol-curve-front ✓); COT×UST/SR 4 (crowding p8–p10, macro driver);
CMEIV×VIX 4 (✓ iv-forecast, forecast-pick); TFF×UST 3; MOVE×VIX 3; COT×CAL 2 (✓ positioning-into-release); DSPX×VIX 2;
BIS×VIX 2; NOW×SURP 2; COT×trend/price throughout the crowding programme. Everything else (credit×XCCY, MOVE×NLIQ, …) appears
together only once, inside the 17-condition `forecast-miss-scan`.

### 2c. Untested combinations the engine tiers call for (data in hand marked ●, needs a keyless fetch ◐)
| Combination | Status | Data |
|---|---|---|
| Economy surprises × FX **cross-section / pooled relative drift** | never (SURP is EVT-on-one-pair only) | ● `backfill/surprise_backfill.json` (26,403 FF rows 2007-01→2025-04, 8+ ccys); ● FRED H.10 `review/work_direction/fred/DEX*.csv` |
| CB decisions (non-Fed) × FX drift, pooled across 6 banks | never (FOMC only) | ● rate-decision rows in the same FF backfill; ● H.10 daily |
| Cross-asset implied vol beyond VIX/VXN/GVZ (OVX, VXTLT, VXEEM, VXEWZ, VXFXI, SKEW, VIX1D) × FX/index range | never | ● `analysis/surfaces/cboe/*.csv`; ● `analysis/output/vf3_stage_b/part1_lines.parquet` |
| FX option skew (CVOL skew, CME RR) × range asymmetry (OH vs OL) or × XS direction | never (skew-fade tested a line trade only) | ● `js/data/cmeCvolEod.json`, ● `oi_research_book/data/iv_daily_*.parquet`, ● vf3 panel |
| Real-rate / curve-slope differential **levels** × FX XS; value/REER | never | ● H.10 + `analysis/output/ys_long/fred/` 3m rates; ◐ OECD CPI / IRLTLT / BIS REER |
| Relative growth/inflation momentum × FX/bonds/equities XS | never | ◐ OECD MEI on FRED (latest vintage; register an ALFRED confirm) |
| Market-state composite × XS carry (regime-conditioned factors) | never | ● `analysis/output/rate_xsmom/monthly_returns.csv`, ● `analysis/surfaces/cboe/VIX*.csv`, ● `analysis/output/cog_yield_dir/fred/BAA10Y.csv` |
| Liquidity (net liq) × credit spreads as the **target** | never (credit only as a signal) | ● BAA/AAA CSVs; ◐ WALCL/WTREGEN/RRPONTSYD |
| OI/gamma × pooled vol-forecast miss (7 OI instruments) | never in the forecast-miss design | ● `oi_research_book/data/daily_master_near_*.parquet` + vf3 panel |
| Funding/xccy basis × FX cross-section | never (basis tests are TS per pair) | ● `analysis/output/xccy-basis/basis_daily.csv` (EUR/GBP/JPY/CHF only, so a 4-name XS is weak) |
| GPR / non-Fed CB balance sheets × vol or FX | never | KV `gpr_v1` / `js/globalLiquidityEngine.js` series ◐ |

## 3. Highest-value next uses of data already held (ranked)

Ranking = (a) the design is one that has produced standing results here, or one DIRECTION.md shows has power at plausible
effects, × (b) the data is in this container or a keyless fetch away, × (c) no banked test exists. Power numbers are from
`DIRECTION.md` §TL;DR/§D and the proposal §0. The lockbox applies to all of them (score nothing after 2026-08-21).

1. **Pooled relative post-release drift across 8 economies (`release-relative-drift`, DIRECTION D3).** Signal: the surprise z
   from `backfill/surprise_backfill.json`. Outcome: currency vs equal-weight basket, D+1..D+5, from FRED H.10 daily
   (`/tmp/claude-0/-home-user-MacroFXModel/7ea4abce-c1f1-5243-a82a-043dd4b3b942/scratchpad/review/work_direction/fred/DEX*.csv`), so it does not need M1. About 2,000+ distinct release days give
   an MDE of about 0.06σ, against ρ 0.17–0.24 for the US-only 526-event test. SURP is REOPENED-HEAVY and has only ever been
   run as single-pair EVT. This is the economy→FX link the engine most lacks.
2. **Pooled post-decision drift across 6 central banks (proposal H3).** Data: the FF backfill rate-decision rows +
   `analysis/fomc_event_study/stage1_events.csv` + H.10 daily. 80 FOMC events become about 1,000 (MDE ≈ 0.09σ). It replaces
   the REOPENED `post-fomc-usd-drift` with a design that can judge it.
3. **Cross-asset implied-vol terms on the forecast-miss panel.** Data: `analysis/output/vf3_stage_b/part1_lines.parquet`
   (34 instruments, OOS 2020-08→2026-08) + `analysis/surfaces/cboe/{OVX,VXTLT,VXEEM,VXEWZ,VXFXI,SKEW,VIX1D}.csv`.
   Prespecify the mapping: OVX→USDCAD/oil-linked, VXTLT→JPY/rates-sensitive, VXEEM/VXFXI→AUD/NZD, SKEW→indices. This is the
   same design and harness that produced 5 standing results (`forecast-miss-shock-*`, `drawdown-*`, `month-end`). These indices
   are already downloaded and have never been read. VXTLT also replaces MOVE, whose store stops on 2026-09-21. Range, not direction.
4. **FX option skew → range asymmetry.** Does CVOL skew or CME RR predict which side (OH vs OL) of the shipped ladder
   overshoots? Data: `js/data/cmeCvolEod.json` (6 FX + gold, 2016/2018+), `oi_research_book/data/iv_daily_*.parquet` (RR,
   2020+), vf3 panel. This extends the one data type that is PROVEN (implied vol) along a dimension never scored. The XS-skew
   direction version is a weaker secondary: 6 names give an MDE of about 0.07+.
5. **XS value / real-rate gap on the long G10 panel (DIRECTION D1).** Held: H.10 `DEX*` (18 ccy) and 3m rates
   (`analysis/output/ys_long/fred/`, `scripts/rate_xsmom/`). Needs: OECD CPI (keyless). MDE IC 0.043 (G10 1976+), against
   published value ICs of 0.04–0.08. The EM7 holdout universe is also in hand (DEXBZUS, DEXINUS, DEXKOUS, DEXMXUS, DEXSIUS, DEXTHUS, DEXSFUS).
6. **Regime-conditioned XS carry (DIRECTION D4).** All inputs are held: `analysis/output/rate_xsmom/monthly_returns.csv`,
   Cboe VIX/VIX3M, `cog_yield_dir/fred/BAA10Y.csv`. It is cheap, but expect UNDERPOWERED (MDE ≈ 0.7%/month). Run it alongside #5.
7. **XS macro momentum (DIRECTION D2).** Pooled per-country signals give an MDE IC of 0.035–0.043. It needs an OECD MEI fetch,
   and the series are latest-vintage, so an ALFRED confirm should be registered. This is the only design that can judge the
   dashboard's per-country economic engine.
8. **OI/gamma as a pooled forecast-miss term (7 OI instruments).** `oi_research_book/data/daily_master_near_*.parquet` + vf3 panel.
   Do this only after the REOPENED `gex-range-es` is fixed. Gamma has 9 tests, but none on the design that produced standing range results.
9. **Market-state composite into the forward ledger (DIRECTION D5).** Costs nothing. Historical reconstruction cannot pass
   (pooled common-signal MDE 0.07–0.10), so the forward record is the judge.
10. **Liquidity → credit spreads (credit as the target).** Weekly 2003+ single series (MDE r ≈ 0.08). BAA/AAA are held; WALCL/TGA/RRP
    are a keyless fetch. Lower prior, but it fills the liquidity × credit tier gap that the defective macro-confluence tests left.

**Stop or deprioritise:** more STIR lead-lag on the 2024–26 window (17 nulls, power-capped); more single-instrument UST/yield
direction (44 tests, half REOPENED); more COT×trend variants (27 tests); BIS quarterly TS (MDE about 0.24). The non-PIT non-US macro
engines, the Cboe option-chain archive (since 2026-10-19) and QuikStrike IV term (since 2026-07-30) are too short to test yet.
Bank them as forward records.
