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

## 3. Next, in order

### A. IBKR futures (laptop job, `scripts/rates_line/refresh_leg_bars.py`)
1. **Roll fix, urgent.** The legs are hard-coded December contracts. The Eurex legs (Schatz, Bobl, Bund, Buxl, BTP, OAT)
   expire **8 December 2026**, the US ones 19–21 December. Replace the fixed months with front + next resolved from
   `reqContractDetails`, so the legs never stop at expiry again.
2. **Add the G10 legs IBKR already serves on this account** (delayed data, checked today):
   JGB 10y (OSE), Canada 10y CGB and BAX (CDE), Australia 3y/10y and bank bills (SNFE), Swiss Conf (EUREX).
   Long Gilt resolves but returns no bars (no ICE Europe data on the account); SONIA futures did not resolve.
3. Store the same way as the existing legs (R2 `rates-legs/`).

### B. Server, free sources not yet pulled
- **CFTC TFF for currencies and rates**: asset managers vs leveraged funds for each G10 currency future. Better
  than the legacy COT split for the G10 system.
- Swiss yields (SNB data portal) and NZ (RBNZ blocks scripts; IBKR has no NZ bonds, so NZ stays OECD monthly).
- ECB: M3, bank lending to firms and households, the euro-area bank lending survey; BoE weekly balance sheet.
- US Treasury TIC (foreign holdings by country, monthly) and IMF COFER (reserve currency shares, quarterly).
- €STR percentiles and volume (ECB), TONA (BoJ), SARON (SNB), so every G10 overnight rate is held.

### C. Visualise (desk terminal)
- A **G10 rates board**: each currency's 2y and 10y, the 2y gap to US, its 20-day change, z-scored, next to the
  pair's move. This is the first input the G10 system needs.
- A **funding board**: SOFR 99th percentile minus IORB, SOFR minus TGCR, RRP, reserves, TGA, MMF repo with the Fed.
- MOVE and DXY intraday on the terminal chart once a few weeks of bars exist.

## 4. Not available free (so not planned)

- CDS indices (CDX, iTraxx) and single-name CDS: paid (Markit). Proxy: HYG/LQD/IHYG and the ICE OAS family.
- Cross-currency basis and OIS / swap curves: Bloomberg or Refinitiv. A futures-implied basis could be built from
  CME FX futures + SOFR/€STR (the existing basis study did this once from a committed CSV).
- Swaption vol (the ICE SRVIX family), CME CVOL live, FX option vols: paid. We hold our own CME settlement IV.
- PMIs (S&P Global): paid; headlines come through the calendar. Citi surprise indices: paid; we have our own
  surprise store.
- Live ICE futures data (gilts, SONIA, Brent options): needs an ICE Europe subscription on IBKR.

## 5. Running log
- 2026-11-27: §2 built and tested; DXY rebuilt and on the terminal. IBKR probe run (results in §3A).
