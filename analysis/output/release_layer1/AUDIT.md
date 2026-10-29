# Release Reaction: audit of what exists at each layer (2026-10-26)

Exploratory and descriptive. Nothing here is pre-registered and nothing predicts anything. Re-derived by `scripts/release_layer1/audit.py` (facts in `AUDIT_FACTS.json`).
C.OG's frame (Discord 19 Oct 2026): Layer 1 what happened, Layer 2 why (classify the other factors), Layer 3 how unusual (conditional normalisation).

## Layer 1: what happened. BUILT, live

**What it is.** 75 US releases, 1 May 2024 to 15 Oct 2026 (NFP 28, core CPI 25, Fed decision 19, core retail sales 2, core PCE 1). For each: the move in the SOFR Sep26 leg, Euribor Mar27 leg and their line (bp), the US 2y and 10y note futures, the dollar index future and Nasdaq (log %), at 1, 5, 15, 30, 60, 120 and 240 minutes, with the 30-minute run-up, the peak, time to half the peak, and whether the move held. A days view adds the 10y real yield, 10y breakeven and 2y/10y yields (US Treasury daily curves), dollar and Nasdaq-100 daily closes: run-up (5 days before), release day, +1, +2, +5 trading days. Live page `release-reaction.html`, refreshed every 5 minutes from the laptop; forward releases fill in as they happen.

**Verified in this audit**
- One release recomputed by hand from the raw parquet (14 Oct 2026 core CPI, SOFR leg at +30 min): page 4.5 bp, by hand 4.5 bp. Same release, 10y yield at +1 day from the raw Treasury CSV: page -11.0 bp, by hand -11.0 bp.
- Clock: the largest 1-minute SOFR move sits in the stamped release minute in 62 of 73 releases; the other 11 are mostly quiet releases (median peak 3.5 bp vs 6 bp).
- 15-minute CFD fallback (2y and 10y before September 2026) vs 1-minute futures: 2y, 7 releases with both, same direction in 7 of 7, correlation 0.89. The 10y has no overlap, so the 10y CFD is **not** cross-checked.
- Euribor leg unchanged at +30 minutes in 9 of 73 releases with quotes present throughout: a real non-reaction at the 0.5 bp tick, not stale data.
- Daily Nasdaq-100 release-day sign matches the 30-minute Nasdaq sign in 63% of 74 releases. Plausible (the day contains the 30 minutes plus everything else); it is a sanity check, not a result.

**Gaps and limits (state these when handing it on)**
- 1-minute data for the 2y exists for 13 of the 75 releases (all 2026), the 10y for 6, the dollar for 6. Earlier releases use 15-minute CFD for 2y/10y and have **no dollar**. The 1- and 5-minute cells are blank there, not guessed.
- The release list is incomplete after July 2026 (it comes from a thin surprise store): core CPI is missing for Jul, Aug, Sep 2026 and payrolls for Aug and Sep 2026. CPI Nov and Dec 2025 and payrolls Oct 2025 are also absent; the autumn-2025 federal shutdown is the likely cause for some of these but I have not confirmed which. Core PCE has 1 release, retail sales 2, GDP none, so those families are too small to say anything.
- Cells are small: 25 CPI, 28 NFP, 19 FOMC. Any split by a second variable leaves single-digit cells.
- Real yield and breakeven are daily closes only. No intraday series exists for them here.
- The Euribor future stops trading before a US evening decision, so its FOMC release-day cell is blank.

**Descriptive facts from the table (not tests)**
- Median 30-minute SOFR move: CPI 4.5 bp, payrolls 5.0 bp, Fed decision 2.0 bp. Euribor 1.0 / 2.0 / 1.0 bp. Nasdaq 0.27% / 0.28% / 0.18%.
- All four rates assets (SOFR, Euribor, 2y, 10y) moved the same way at +30 min in 19 of 23 CPI, 21 of 24 payroll and 12 of 13 FOMC releases that had all four.
- Median +1 day / +5 day absolute move, 2y yield: CPI 4/6 bp, payrolls 7/8 bp, FOMC 8/11 bp. 10y real yield: 4/4, 5/6, 6/10 bp. 10y breakeven: 3/2, 2/3.5, 3/4 bp. Nasdaq-100: 1.3/2.1%, 1.2/1.7%, 1.1/2.7%.
- On CPI days where the SOFR leg moved up (hawkish) at +30 min, Nasdaq fell in 4 of 7. Where it moved down (dovish), Nasdaq rose in 16 of 18. Payrolls: dovish 9 of 15 up. FOMC: 5 of 9 up. The CPI-dovish cell is a **lead to pre-register, not a finding**: one cell among many looked at, 18 releases, and the 30-minute window only.

## Layer 2: why. NOT BUILT

- The one piece in place: a **raw surprise** (actual minus consensus) column, which is a record of the event, not a model. 27 of 73 releases have a surprise of exactly zero (almost all of them Fed decisions: only 1 of 19 has a non-zero surprise), 46 non-zero; 1 release has no actual and 2 have no consensus.
- Nothing classifies shock type, going-in positioning, liquidity, volatility state or any other factor. No factor sheet exists yet.
- Plan (agreed direction, not yet started): keep Layer 1 and Layer 2 as separate pages; going-in factors (known before the release) kept apart from shock labels (read from the reaction afterwards); factor register of ChatGPT's 77 items marked have/partial/missing/not observable; a wide scan on the long daily history with a holdout and false-discovery control, minute data kept descriptive.

## Layer 3: how unusual. PARTLY, and narrower than C.OG's version

- What exists: a `z (cond.)` figure in each release's detail table: the 30-minute move divided by the typical move in the **same clock window on the 40 previous weekdays with no release**. That conditions on time of day only.
- It exists for the SOFR leg, Euribor leg, line and Nasdaq (72 to 73 of 75 releases, all 1-minute) but only 10 of 75 for the 2y, 2 for the 10y and 6 for the dollar.
- Not done: normalising conditional on **state** (volatility regime, positioning, liquidity, where the policy path sits), which is what "conditional normalisation" asks for. That depends on the Layer 2 factors.

## What each layer needs next
1. Layer 1: more assets (EUR/USD, GBP/USD, USD/JPY, gold, VIX/VXN, ES). Data situation: the local M1 cache for FX, gold and CFDs ends 20 Aug 2026; VIX/VXN/VVIX 1-minute history starts 24 Aug 2026. History comes from the cache, September to October from IB futures pulls, so there is a gap to fill. Also complete the release list (CPI and payrolls Jul to Sep 2026).
2. Layer 2: the factor register, then the going-in factor sheet.
3. Layer 3: after Layer 2 fixes the conditioning states.

## Addendum 2026-10-26: Layer 1 asset groups added (after the audit above)
EUR/USD, GBP/USD, USD/JPY, gold and the S&P 500 now sit beside the original assets (1-minute OANDA CFD mid from `data/m1_bidask`, to 19 Oct 2026, then CME/COMEX futures pulled from IB; the yen future is inverted to USD/JPY); VIX and VXN from the IB index feed. Coverage across the 75 releases: EUR/USD, GBP/USD, USD/JPY, S&P 500 75 each, gold 74, **VIX only 6 (24 Aug 2026 onward), VXN 1** (VXN prints only in the New York cash session, so a 08:30 ET release has no pre-release bars). Daily paths for all of them, built from the same minute sources by chaining returns (no level splice); VIX/VXN daily from Yahoo, in points. The 7-asset coverage and clock figures above are unchanged; the Layer 3 `z (cond.)` coverage now also exists for the five new minute assets (75 of 75 cells except gold 74). The audit's cell counts for the assets that existed before are as stated above.

## Addendum 2026-10-26 (later): Layer 2 built, and what the data says so far (descriptive, exploratory)
**Layer 2 now exists** as a separate page, `release-why.html`: the 77-item register (23 on the sheet, 5 data exists, 27 partial, 14 missing, 3 not observable, 5 read-after planned) and a 31-measure going-in factor sheet (known before the release) joined to Layer 1 outcomes by release id. Shock labels read after the move are **not built**. Layer 3 conditional-on-state normalisation is **not built**.

**How the assets respond (Layer 1, 75 releases; rank correlation of each asset's 30-minute move with the SOFR-leg 30-minute move, hawkish = up)**
- Rates and FX follow the rates reaction closely and in the expected direction: 2y and 10y note futures -0.96 / -0.96 (price down when rates up), EUR/USD -0.87, GBP/USD -0.84, USD/JPY +0.89, gold -0.66.
- Equities are looser and depend on the release type: Nasdaq -0.24 pooled, but -0.44 on core CPI (n 25), -0.63 on Fed decisions (n 19), and +0.14 on payrolls (n 28). That is consistent with payrolls carrying a growth read that offsets the rate read, but the CPI-vs-payrolls difference has not been tested, and the noise band at these counts is about +-0.40 to +-0.46.
- Size relative to a normal clock window (median |z (cond.)| at +30 min): SOFR leg 2.6 to 3.4 across CPI, payrolls and Fed; EUR/USD, GBP/USD, USD/JPY about 1.7 to 2.6; Nasdaq 1.4 (CPI), 1.6 (payrolls), 0.8 (Fed); gold 1.0 to 1.1 on CPI and payrolls but 2.1 on the Fed.
- Persistence of the 30-minute direction: SOFR leg same sign at +1 day in 76% of 68 releases and at +5 days in 64%; Nasdaq 68% and 66% (n 74); S&P 60% / 58%; EUR/USD 59% / 57%; USD/JPY 53% / 47%; gold 55% / 55% (coin-flip territory for the last three). The day moves contain the 30 minutes, so these overstate independent persistence.

**What the factor sheet says so far.** A wide scan of 31 factors against six assets (Nasdaq, S&P, EUR/USD, USD/JPY, gold, VIX) at 30 minutes, +1 day and +5 days, for all releases and for CPI, payrolls and Fed decisions separately: 1,972 factor-outcome pairs, 117 outside the 95% noise band (5.9%, against about 5% expected by chance). The pairs overlap (outcomes and assets are correlated), so this is not an exact test, but nothing stands out beyond chance at these sample sizes. The factors that crossed the band most often (days since and to the Fed decision across all releases, the 3m10y curve on Fed decisions, the 5-day change in the SOFR strip slope) mix release types or are tied to the calendar structure, so they are not read as findings.
**Leads to pre-register, not findings:** the core CPI dovish-SOFR-reaction cell (Nasdaq up in 16 of 18); Nasdaq's link to the rates reaction differing between CPI/Fed decisions and payrolls.
