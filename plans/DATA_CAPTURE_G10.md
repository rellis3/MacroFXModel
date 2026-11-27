# Data capture for the G10 / rates / funding work

*2026-11-27. Owner's ask: capture everything useful for G10 moves, yields, vol, spreads, repo / reverse repo,
banking and credit now, store it in R2, visualise what is useful, so future systems (the G10 system first) have
the history. This file is the list and the plan. `plans/DATA_ASSET_MAP.md` is the wider audit it builds on.*

Rule for everything here: **capture first, test later.** A series in the archive with no reader is a candidate
for study, not a result. Nothing below changes a live calc.

---

## 1. What we already held before today

All of it is written daily to R2 by `_archiveDaily` (server.js), append-only, under `archive/series/<source>/<id>.json`.

| Area | Held |
|---|---|
| US curve | 1M–30Y, TIPS 5/10Y, breakevens, 5y5y, ACM term premium, ^TNX/^FVX since 1970 |
| Other curves | DE/JP 2y+10y, UK 10y (daily, `rates/`); OECD monthly 10y and 3M for AU/CA/CH/DE/GB/JP |
| Policy and overnight | Fed funds, IORB, SOFR, SOFR volume, €STR, SONIA, CORRA; BIS daily policy rates for 40+ banks |
| Plumbing | Fed balance sheet, reserves, TGA (daily statement), RRP, liquidity swaps, foreign custody, H.8 |
| Credit | ICE BofA HY, BB, B, CCC, IG, BBB, EM, euro HY; Moody's Baa/Aaa; HYG/JNK/LQD/IEF/TLT |
| Vol | 21 Cboe indices (VIX from 1990), MOVE daily from 2002, CME settlement IV and risk reversals |
| Positioning | COT for 36 markets from 2006, TFF leveraged-fund Treasury futures, CME OI by strike |
| FX | OANDA from 2002, Yahoo daily for 20 crosses including EM, the Fed broad dollar |
| Banking | BIS locational banking stats (quarterly) |
| IBKR (laptop, 1-min) | SOFR, Euribor, €STR, ZQ, Treasury futures, Bund family, BTP/OAT, DX, VIX futures |

## 2. Added today (live from the next daily archive run)

`js/macroCapture.js`, tested in `js/macroCapture.test.mjs`, run inside `_archiveDaily`.

| Family | Series | From | R2 |
|---|---|---|---|
| G10 yields, daily | CA 2/5/10/long · AU 2/3/5/10 + 10y real · SE 2/5/10 · NO 3/5/10 · EA AAA 2/5/10/30 · JP 2/5/10/30 · UK gilt 5/10/20 | 2000 (AU 2013, NO 2019) | `series/g10_yields/` |
| NY Fed money markets | SOFR, BGCR, TGCR, EFFR, OBFR: rate, 1st/25th/75th/99th percentile, volume; ON RRP take-up | 2018 (RRP 2014) | `series/nyfed/` |
| OFR repo | DVP, GCF, tri-party rate and volume (daily); MMF total, Treasuries, repo, repo with Fed, repo via FICC (monthly) | 2010–2018 | `series/ofr/` |
| Treasury auctions | every Bill/Note/Bond/TIPS/FRN auction: yield, bid-to-cover, size, indirect/direct/dealer share | last ~250 per type, growing | `tables/ust_auctions/` |
| Intraday 15-min | MOVE, ICE DXY, ^TNX/^FVX/^TYX/^IRX, ZT/ZN/ZB, SR3, ZQ, VIX, HYG, LQD, KRE | from today (Yahoo keeps ~60 days) | `i15_<ID>/<YYYY>/<date>.json` |
| Yahoo daily | real ICE DXY, ^TYX, ^IRX, Treasury and STIR futures (front), TIP, SHY, BIL, EMB, BKLN, euro HY, KRE, KBE, EUFN | full Yahoo history | `series/yahoo/` |
| FRED | STLFSI4, NFCI, ANFCI, G10 dollar (DTWEXAFEGS), ECB and BoJ balance sheets, Fed Treasuries/MBS, M2, C&I loans, deposits, loan-officer tightening, AAA/AA/A, HY and IG effective yields, EM HY/IG | full | `series/fred/` |
| Desk terminal | ICE DXY rebuilt daily from six OANDA legs (`js/dxyIce.js`) and USD/SEK, on the Insight boards | 2020 | drill bundle |

## 3. The plan: pull, store, roll

Five phases, in order. Rule throughout: **store every contract on its own and build continuous series from the
stored contracts.** A continuous series made at pull time fixes one roll rule forever; one built from the stored
contracts can be rebuilt with any rule.

### Phase 1. IBKR contract roll (urgent: US bonds and gold 30 Nov, Eurex 8 Dec)

**Where it stands (checked on main 2026-11-27):**

| Script | Contracts | Rolls today? |
|---|---|---|
| `scripts/rates_line/refresh_leg_bars.py` `IB_SPEC` (30-min job) | SOFR/Euribor/€STR strips, ZQ months, ZT/ZF/ZN/ZB/UB, Schatz/Bobl/Bund/Buxl, BTP, OAT, DX, VIX futures, NQ, ES, 6E/6B/6J, GC | **no: fixed months** |
| `scripts/release_layer1/live_push.py` | reads `IB_SPEC` | follows it |
| `scripts/rates_line/refresh_cog_line.py` | own fixed SOFR/Euribor list (SR3U6 already expired) | **no** |
| `refresh_cb_expectations.py`, `refresh_options_skew.py`, `refresh_xccy_basis.py` | CB strips, CME option chains, CME FX futures | yes, resolved live |
| `scripts/footprint/ib_footprint.py` | NQ, month passed by hand | manual |
| `build_leg_bars.py` `ROLLING` | stitched I2! and SR32! | yes, those two only |

**What expires next:**

| Leg | Expiry | Liquidity moves to the next contract |
|---|---|---|
| ZT/ZF/ZN/ZB/UB Dec | 19–21 Dec | **first notice 30 Nov: rolling now** |
| GC Dec | 29 Dec | first notice 30 Nov (active month already Feb) |
| Schatz/Bobl/Bund/Buxl, BTP, OAT Dec | **8 Dec** | ~1–5 Dec |
| DX Dec | 14 Dec | ~7 Dec |
| NQ, ES, 6E/6B/6J Dec | 18–19 Dec | Thu 10 Dec |
| Euribor IZ6 / SOFR SR3Z6 | 14 / 15 Dec | strip contracts, no roll (I2! already moves to IM7) |
| VIX Dec | 16 Dec | Nov contract already gone |

**Build:**
1. **One contract registry**, `scripts/ibkr/contracts.py`, shared by every IBKR script. Per *root* (ZN, GBL, SOFR3...):
   symbol, exchange, currency, tradingClass, cycle (quarterly HMUZ / monthly / GC's GJMQVZ), `depth` (how many live
   contracts to keep pulling), bar type (MIDPOINT, or TRADES for indices), roll rule.
2. **Resolve, don't hard-code.** Each run calls `reqContractDetails` with no month, sorts the live contracts by
   expiry and takes the first `depth` (the method `refresh_cb_expectations.py` already uses). Depth 2 (front + next,
   both always pulled so the roll window has both sides) for bond/index/FX futures; 8 quarterlies for the rate strips
   (SOFR, Euribor, €STR, SONIA, BAX, bank bills); 7 months for ZQ; 3 for VIX.
3. **Roll rule is a calendar, applied only when the continuous series is built:**

   | Contracts | Roll |
   |---|---|
   | US Treasuries, CGB, gold | 2 business days before first notice |
   | Eurex bonds | 3 business days before last trade |
   | JGB | 5 business days before last trade |
   | ASX 3y/10y | 3 days before the 15th |
   | Equity and FX futures | the Thursday 8 days before expiry |
   | DX | 5 days before expiry |
   | VIX | at expiry |
   | Rate strips | never; ranked 1st/2nd/... quarterly, as I2! and SR32! are today |

4. **Storage stays per contract.** Files are named by local symbol (`stir_1m_deep/EUREX_FGBLH7.parquet`).
   `legs_r2.py` already uploads every file to `rates-legs/m1/<stem>/<date>.parquet`, so new months need no change there.
5. **Continuous series from stored contracts.** Generalise `build_leg_bars.ROLLING` from 2 roots to all. Each root gets:
   - `<ROOT>1` (front) and `<ROOT>2` (next), unadjusted, for the chart;
   - a back-adjusted (difference) version for returns and research;
   - a roll log `rates-legs/rolls.json` (root, date, from, to, price gap at the roll), so research never takes a return across a roll.
6. **Old names keep working.** The chart and release-reaction pages ask for `ZNZ6`, `FGBL2612`... Those become
   aliases of `ZN1`, `GBL1`..., so pages draw straight through the roll. Expired months stay on disk and in R2 as history.
7. `refresh_cog_line.py` and `live_push.py` read the registry instead of their own lists. `ib_footprint.py` defaults to front NQ.
8. **Expiry guard.** `legs_r2.py push` writes `rates-legs/_health.json`: each root's newest bar and the business days
   to its front contract's roll. `/api/services` shows it and flags a root when:
   - its newest bar is more than one trading day old; or
   - it is inside its roll window and the next contract has no bars.

   This prevents another silent stop at expiry like the Schatz on 9 Oct.
9. **Tests:**
   - contract selection on a fake contract-details list;
   - each roll rule against known 2026 dates;
   - the alias mapping;
   - a stitch across a roll, with the gap logged.
10. **Backfill:** `pull_deep_history.py` with `includeExpired` for each new root. IBKR serves expired futures for about
   two years, so every roll from late 2024 can be rebuilt.

### Phase 2. Add the G10 legs IBKR serves (delayed data, checked 2026-11-27)

Into the registry, so they roll from day one.

| Country | Contracts | Venue |
|---|---|---|
| Japan | JGB 10y | OSE.JPN |
| Canada | CGB 10y, BAX (3M CORRA strip) | CDE |
| Australia | 3y and 10y bonds, 90-day bank bills | SNFE |
| Switzerland | Conf | EUREX |
| UK | SONIA 3M strip (`SONIA.N`, class `SO3`), 1-minute; today the CB-expectations script reads it as a strip snapshot only | ICEEU |
| FX futures | 6A, 6C, 6S, 6N (NZ's only intraday market we can get), beside 6E/6B/6J | CME |
| Not available | Long Gilt (no ICE Europe data); SR1 1-month SOFR (did not resolve) | |

Cost: about 10 s per contract per run (IBKR pacing). The ~14 new contracts add about 2.5 minutes to the 30-minute job.
If that is too slow, run them as a separate hourly task.

### Phase 3. Server, free sources not yet pulled (`js/macroCapture.js`, same `_archiveDaily`)

| Source | What | R2 |
|---|---|---|
| CFTC TFF | asset managers vs leveraged funds for each G10 currency and rate future, weekly from 2006 | `series/cftc_tff/` |
| SNB | Swiss yields 2/5/10, SARON | `series/g10_yields/`, `series/overnight/` |
| ECB | €STR percentiles and volume, M3, lending to firms and households, bank lending survey | `series/ecb/` |
| BoJ / BoE | TONA; BoE weekly balance sheet and reserves | `series/overnight/`, `series/boe/` |
| US Treasury TIC | foreign holdings of Treasuries by country, monthly | `tables/tic/` |
| IMF COFER | reserve currency shares, quarterly | `series/imf/` |

Each gets a parser test on a real response cut down, and a `js/dataCatalogue.js` entry, as in §2.

### Phase 4. A daily IBKR record in the server archive
`legs_r2.py push` also writes one close per day per continuous root to `archive/series/ibkr/` (ZN1, GBL1, JGB1...).
The G10 system then reads each country's bond future from the same place as its cash yields. Yahoo's `=F` fronts
(rolled by Yahoo's own, unstated rule; this also applies to the `i15_` intraday futures) can be checked against a
series whose rolls we know.

### Phase 5. Visualise (desk terminal)
- **G10 rates board.** For each currency:
  - 2y and 10y yields;
  - the 2y gap to the US;
  - the 20-day change, z-scored;
  - the bond future's intraday move;
  - next to the pair's move.
- **Funding board:**
  - SOFR 99th percentile minus IORB;
  - SOFR minus TGCR;
  - reverse repo;
  - reserves;
  - TGA;
  - money-fund repo with the Fed;
  - the tail and bid-to-cover of the last 2y/10y/30y auction.
- **Roll health table** (phase 1.8) on the services page.
- MOVE and DXY intraday on the terminal chart once a few weeks of `i15_` bars exist.

### Order

| Phase | Size | Must land by |
|---|---|---|
| 1. Roll | ~1 session | **30 Nov** (US bonds, gold); 8 Dec (Eurex) |
| 2. G10 legs | small, after 1 | then backfill |
| 3. Server sources | ~1 session | none (history downloadable later) |
| 4. Daily IBKR record | small | after 1 |
| 5. Boards | ~1 session | after 3 |

Phase 1 edits the rate-legs session's files (`refresh_leg_bars.py`, `build_leg_bars.py`, `refresh_cog_line.py`):
additive (new registry, old names kept as aliases), requested by the owner 2026-11-27.

## 4. Not available free (so not planned)

- CDS indices (CDX, iTraxx) and single-name CDS: paid (Markit). Proxy: HYG/LQD/IHYG and the ICE OAS family.
- Cross-currency basis and OIS / swap curves: Bloomberg or Refinitiv. A futures-implied basis could be built from
  CME FX futures + SOFR/€STR (the existing basis study did this once from a committed CSV).
- Swaption vol (the ICE SRVIX family), CME CVOL live, FX option vols: paid. We hold our own CME settlement IV.
- PMIs (S&P Global): paid; headlines come through the calendar. Citi surprise indices: paid; we have our own
  surprise store.
- Live ICE futures data (gilts, SONIA, Brent options): needs an ICE Europe subscription on IBKR.

## 5. Running log
- 2026-11-27: §2 built and tested; DXY rebuilt and on the terminal. IBKR probe run (results in §3 phase 2).
- 2026-11-27: §3 rewritten as the full pull/store/roll plan after checking every IBKR script on main. Correction:
  SONIA futures DO resolve (`SONIA.N`, class `SO3`, as `refresh_cb_expectations.py` uses); the first probe used the wrong symbol.
