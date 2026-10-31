# Data asset map: what this repo holds, what it is worth, and how to get the best from it

*2026-10-31. The owner's question: "a deep review into what data we hold and how to get the best from this repo as an
engine". Built from three inventories, with the key claims re-checked in code or data by the lead reviewer
(`analysis/output/repo-review-2026-10-31/VERIFIED_BY_LEAD.md`). The detail is in
`analysis/output/repo-review-2026-10-31/data/`:*
- *`COMMITTED.md` + `committed_datasets.csv`: 1,825 committed data files (1.64 GB), profiled and grouped into 170
  datasets.*
- *`LIVE.md` + `live_feeds.csv`: 69 live feed families. For each: the history upstream offers against what we keep,
  the store, consumers, and untapped value.*
- *`RESEARCH_DATA.md` + `research_by_data.csv` + `family_summary.csv`: every one of the 293 Evidence Book entries
  mapped to the data it used, with the audit status.*

---

## 1. The short version

1. **The repo holds far more good data than it uses.** Some of the most valuable histories have no live reader:
   - 21 Cboe vol indices with VIX from 1990
   - US/German/Japanese curves from 2005
   - the 34-market COT file from 2006
   - Yahoo daily FX for 19 crosses including EM
   - ^TNX/^FVX from 1970
   - ^MOVE from 2002
   - TGA daily
   - a HY credit proxy (HYG/JNK/IEF)
   - the 26,403-release surprise backfill (8 economies, 2007–2025, with consensus)
2. **The server downloads deep history and throws it away.**
   - `_fredCsv` fetches whole FRED series (DGS10 from 1962) and keeps 6–12 years in memory, lost on every deploy.
   - `/api/fredhistory` keeps 90 prints.
   - The only deep point-in-time store, the feature store (100 features), lives on one laptop with no R2 copy. It
     was last built 2026-10-16.
3. **Some data that exists nowhere else is being deleted (lead-verified):**
   - The CME options capture is trimmed to 365 days (`server.js:20595`, `:20711`). CME serves no history.
     Captures began 2026-07-30, so losses start July 2027.
   - The 10Y Treasury intraday capture is trimmed to 120 days (`js/yieldShapeRegimeRoutes.js:17`), so it is losing
     data now.
   - The ICE credit spreads (HY, BB, CCC, IG, EM) come from FRED's rolling 3-year window, and we hold them only
     from 2023-10-17. Every day not archived is gone.
   - Gold ETF flows are capped at 120 points and written only when the page is opened.
4. **All the proven value sits in one corner.** Every validated result that survived the audit is about **range
   and volatility**, built from implied vol, the instruments' own prices, the VIX family, the desk's forecast
   history, and conditional COT.

   Macro, rates, credit, funding, liquidity, BIS, MOVE, OI/gamma, surprises and central-bank data have **no
   standing validated result**. That is not because they are empty. They were almost always tested as
   single-instrument direction questions, the one design that cannot detect a macro edge (REPO_REVIEW §5).
5. **The thinnest tier is the one the repo was founded on: the economy.**
   - The committed calendar covers US, euro area and UK only.
   - There are no CPI or PMI vintages, and no non-US first prints in the feature store.
   - JPY, AUD, NZD and CHF surprise actuals are never filled.
6. **Duplication and bloat hide the assets.**
   - FRED CSVs are copied into up to 5 study folders; the VIX family sits in 5 places; BIS data is in 13 extracts.
   - 71% of the 1.64 GB is study intermediates; 816 MB is rebuildable from M1.

---

## 2. What we hold, tier by tier

**Legend:** ✅ held well · ◐ partial · ❌ missing. "Proven" = a validated result that stands after the audit.

### Economy / macro
- **Held:** ◐ the US first-print surprise store (ALFRED); the ForexFactory surprise backfill (8 economies,
  2007–2025, 26k releases); Cleveland/GDPNow nowcasts.
- **Missing:** ❌ PMIs; non-US CPI vintages; JPY/AUD/NZD/CHF actuals.
- **Proven:** none (8 surprise tests, event-only; nowcasts 2).
- **Unused or at risk:** the backfill drives only US-centred studies; nowcast history isn't kept.

### Rates
- **Held:** ✅ US curve 1M–30Y, real yields and term premium; US/DE/JP curves from 2005 (committed); ^TNX/^FVX from 1970.
- **Partial:** ◐ gilt/Bund/JGB 10Y (3 years kept live); monthly OECD short rates (EUR has been dead since
  2026-02-16).
- **Missing:** ❌ live SONIA/€STR/TONA/CORRA; OIS curves.
- **Proven:** none (44 Treasury-curve tests, 16 of 31 reopened).
- **Unused or at risk:** the daily DE/JP 2Y the flow-chain builds and drops; ^TNX history is dormant.

### Credit & funding
- **Held:** ✅ US funding plumbing as a daily point-in-time log; Moody's Baa/Aaa from 1986.
- **Partial:** ◐ ICE spreads (3-year window, not archived); HYG/JNK proxy (dormant).
- **Missing:** ❌ euro credit; CDS; cross-currency basis live (registered, never built; the committed CSV is the
  only copy).
- **Proven:** none (9 credit tests, mostly reopened; funding 8).
- **Unused or at risk:** ICE spreads **at risk**; the funding read has never been tested.

### FX
- **Held:** ✅ OANDA prices from 2002 plus financing; Yahoo daily for 19 crosses including EM (dormant).
- **Partial:** ◐ implied vol (EVZ dead, CVOL file ends 2026-08-20, QuikStrike from 2026-07-30).
- **Missing:** ❌ dollar vs majors (DTWEXAFEGS).
- **Proven:** ✅ 16 (FX prices are the base of the range work).
- **Unused or at risk:** EM FX, and FX skew (25-delta risk reversals in the OI book) never tested.

### Equities
- **Held:** ✅ index CFDs, sectors, mega-caps.
- **Missing:** ❌ breadth series; earnings revisions.
- **Proven:** ✅ 19 (index CFD range work).

### Volatility & options
- **Held:** ✅ the Cboe family (21 indices); VIX futures settles 2013–; CVOL EOD 2016–2026 (licensed, can't be
  re-pulled); CME settlement IV.
- **Partial:** ◐ MOVE (the live feed stops 2026-09-21; the committed copy from 2002 is dormant).
- **Missing:** ❌ intraday MOVE/TNX archive.
- **Proven:** ✅ VIX family 9, CME IV 3, CVOL 1.
- **Unused or at risk:** 15 of 21 Cboe indices never tested (OVX, VXTLT, SKEW, VXEEM…).

### Positioning
- **Held:** ✅ CFTC legacy COT for 34 markets 2006– (point-in-time); TFF from 2006 in the feature store; CME OI by
  strike 2020–2026 (1.87M rows, committed).
- **Partial:** ◐ live COT reads use only 3 years (`COT_LIMIT=156`).
- **Missing:** ❌ OANDA books (source withdrawn, still polled).
- **Proven:** ✅ COT 2 (conditional states); OI/gamma 0 (reopened-heavy).
- **Unused or at risk:** the OI capture is **at risk**; skew never tested.

### Liquidity & banking
- **Held:** ✅ net-liquidity legs; BIS banking stats 1977–; TGA daily 2005–.
- **Partial:** ◐ NFCI (untested); ECB/BoJ balance sheets only on request.
- **Missing:** ❌ STLFSI; EPU.
- **Proven:** none (net liquidity 7 tests, reopened-heavy; BIS 9).
- **Unused or at risk:** TGA history is dormant; net liquidity → credit never tested.

### Events
- **Held:** ✅ economic calendars 2014–2026; central-bank text.
- **Partial:** ◐ actuals missing for 4 currencies; `calendar_events.csv` holds 46,095 duplicate rows.
- **Missing:** ❌ auction results.
- **Proven:** ✅ 3 (as conditioning only).
- **Unused or at risk:** speakers and auctions never tested.

---

## 3. Where the value is, and the paradox

**Proven:**
- implied vol as σ
- VIX-curve width terms
- the stress and month-end overlay
- the desk's forecast-pick and persistence work
- extreme-in-probability
- COT state D

The forecasting machine for **how far** markets move is real and audited.

**Unproven but promising:** the macro data. Its record reads "null" because of the design, not the data:
- 44 Treasury-curve tests, almost all per-instrument direction;
- 18 short-rate-differential tests, one cross-sectional design (carry was positive there);
- surprises tested as single-event reactions, never pooled across economies or relative across currencies.

The data in hand supports the designs where macro direction usually shows up (DIRECTION.md: cross-sectional MDE
IC ≈ 0.04 against a plausible 0.05–0.10), and they have not been run.

**Never touched:**
- the GPR index
- non-Fed balance sheets
- QuikStrike IV term
- Cboe option chains
- 15 Cboe indices
- the funding read
- Myfxbook
- the Fed path as a daily state
- auction and speaker calendars
- EM/IG credit sub-series

---

## 4. How to get the best from it, in order

### A. Stop the losses (urgent, small)
1. Copy the CME options capture to R2 nightly and remove the 365-day trim (`server.js:20595`, `:20711`). The data
   is irreplaceable.
2. Archive the daily ICE spread prints (HY, BB, CCC, IG, EM OAS) to R2. About 40 KB a year.
3. Remove the 120-day trim on the ^TNX intraday capture, or archive it to R2.
4. Write gold ETF flows on a schedule, not on page view.
5. Keep nowcast and GPR history (one row a day) instead of the latest value only.

### B. Keep the history we already download (one deep, point-in-time store)
6. Write each FRED CSV `_fredCsv` already downloads to R2, and serve `/api/fredhistory` and the engine from it. This
   needs no extra FRED calls and is about 15 MB raw.
7. Put the feature-store build on a schedule with an R2 copy. Today it exists only on a laptop.
8. Store COT at full depth (about 1,000 weeks) instead of 156.
9. Keep the daily DE/JP 2Y, the ECB deposit rate and Bank Rate that the flow-chain builds from 2005. Add €STR, SONIA,
   TONA and CORRA with full history. These replace the dying monthly OECD rates.

### C. Put dormant assets to work in the engine (state.html)
- **Global banner:**
  - VIX term from 1990 (percentile against the real history, not 90 days)
  - MOVE from 2002
  - TGA as a liquidity drain
  - the HYG/IEF credit proxy
- **Economies panel:**
  - the surprise backfill as each economy's surprise history (8 economies, 2007–)
  - non-US 2Y / policy rates once stored (B9)
- **Vol layer:** the 15 untested Cboe indices as context (OVX for oil, VXTLT for bonds, VXEEM for EM, SKEW).
- **FX layer:** EM FX daily (19 crosses); FX skew from the OI book.

### D. Research on data already held (ranked; each a fresh pre-registration, none a banked null in new clothes)
1. Pooled relative post-release drift across 8 economies (surprise backfill + FRED H.10), MDE ≈ 0.06σ.
2. Post-decision drift pooled across 6 central banks (about 1,000 events, MDE ≈ 0.09σ).
3. The extra Cboe vol indices as forecast-miss terms, in the harness behind 5 standing results.
4. FX skew → which side of the range overshoots (CVOL EOD + OI-book IV).
5. G10 cross-sectional value / real-rate gap from 1976 (MDE IC 0.043). Needs a keyless OECD CPI fetch.
6. Cross-sectional macro momentum (MDE IC ≈ 0.035–0.043). Needs OECD MEI.
7. Market-state composite into the forward ledger, now.

**Worth stopping:**
- STIR lead-lag on the current 2-year window
- single-instrument Treasury direction
- more COT × trend variants
- BIS quarterly time series

### E. Clean up (after A and B)
- **Remove bloat:**
  - de-duplicate the FRED CSVs, VIX family and BIS extracts into one `data/` home with a manifest;
  - move the 816 MB of rebuildable study intermediates out of git (R2 or regenerate);
  - gitignore `cron-worker/.wrangler`.
- **Remove what is collected but dead:**
  - stop polling OANDA books (withdrawn);
  - drop the ISM `NAPM` request;
  - retire the consumers of dead feeds (EVZ, `rate3m_eur`/`rate3m_aud`, the frozen CVOL and Cboe JSON files).
- **Fix data quality:**
  - de-duplicate `calendar_events.csv`;
  - drop weekend rows in the futures panel;
  - fill the TGA gap (2021-10 → 2022-04).

---

## 5. Decisions for the owner
1. **Approve A (stop the losses) now.** It is small and every day costs data. R2 write access from the server
   already exists for the M1 archive.
2. **B6/B7:** confirm R2 is the home for the deep store.
3. **E:** removing 816 MB from git needs the owner's say. History rewriting is not proposed; the files would stop
   being tracked going forward.
4. **D:** which of the research items to pre-register first. Suggested: D1, D3, D7.
