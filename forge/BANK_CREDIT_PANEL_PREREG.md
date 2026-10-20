# bank-credit-panel — Across countries, does faster cross-border bank borrowing (as known at publication) predict weaker next-quarter equity and currency returns relative to other countries?

**Pre-registered 2026-10-20, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `bank-credit-panel-equity`, `bank-credit-panel-fx` (two scored cells) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `bank-credit-panel` |
| Data | BIS LBS (`WS_LBS_D_PUB`, latest vintage, SDMX API): cross-border claims of all reporting countries on each borrower country, all currencies, all sectors (`Q.{S,F}.C.A.TO1.A.5J.A.5A.A.{CC}.N`). Yahoo monthly closes: one main equity index per country (local currency, price index) and the currency vs USD. Outcome quarters run up to 2026-Q2, before the lockbox. |
| Seed | `20261020` |
| Uncertainty | Moving-block bootstrap over **quarters** (each quarter's whole cross-section is resampled together), block 4, B = 2000 |
| Scripts / outputs | `scripts/bank-credit-panel/` → `analysis/output/bank-credit-panel/` |
| Harness | Own script. This is a quarterly cross-country panel, which fits neither the event-study nor the daily-feature harness. |

## 1. The claim (required)

The credit-boom literature (Schularick and Taylor 2012; Baron and Xiong 2017, "Credit Expansion and Neglected Crash Risk"; Mian, Sufi and Verner 2017) finds that fast credit growth is followed by **lower** equity returns and higher crash risk. `bank-credit-dollar-nasdaq` found the same sign on one global series (r −0.16), but the result rested on two episodes (A2). The only way to retest it with real power is across countries: does a country whose cross-border bank borrowing is growing faster than other countries' then underperform them?

## 2. Why it is not already settled (required)

- `bank-credit-dollar-nasdaq` (context) uses one global series, has 165 quarters, and rests on 2000 and 2008. This study removes the global factor entirely (each quarter is demeaned across countries), so the 2000 and 2008 crashes cannot drive it by themselves.
- `credit-leads-equities` (null) uses credit **spreads**, at a daily horizon, in the US only.
- No Evidence Book entry uses BIS borrower-country data.

## 3. Definitions, fixed in advance (required)

- **Countries and outcome tickers** (fixed; any country lacking BIS data or prices in a quarter simply drops out of that quarter):
  - Equity: GB ^FTSE, JP ^N225, DE ^GDAXI, FR ^FCHI, CA ^GSPTSE, AU ^AXJO, HK ^HSI, KR ^KS11, BR ^BVSP, MX ^MXX, IN ^BSESN, CH ^SSMI, ES ^IBEX, IT FTSEMIB.MI, NL ^AEX, TW ^TWII, SG ^STI, US ^GSPC, ID ^JKSE, TR XU100.IS, BE ^BFX, AT ^ATX, MY ^KLSE, TH ^SET.BK, PH PSEI.PS, NZ ^NZ50, NO OBX.OL, SE ^OMX.
  - FX vs USD: EUR area as one (EURUSD=X) for DE, FR, ES, IT, NL, BE and AT, plus GBP, JPY, CAD, AUD, CHF, KRW, BRL, MXN, INR, TWD, SGD, IDR, TRY, MYR, THB, PHP, NZD, NOK, SEK and HKD (pegged; dropped from the FX cell). Each FX return is signed so that **+ = the local currency strengthened against USD**. For the FX cell, euro-area members are collapsed to one observation per quarter using the BIS euro-area borrower aggregate (`5C`).
- **Signal.** `g(c,q)` = 4-quarter FX-adjusted growth of cross-border claims on country c (sum of four F flows ÷ stock four quarters back × 100). Winsorised at the 1st and 99th percentiles of the pooled panel (small borrowers can have extreme growth).
- **Knowable when?** At the end of quarter q+2, the same conservative 6-month rule as `bank-credit-dollar`. It predicts quarter q+3.
- **Outcome.** The log return over quarter q+3 (equity in local currency; FX in USD terms as signed above), from monthly closes.
- **Cross-sectional design.** Each quarter, both the signal and the outcome are demeaned across the countries present, so the global factor is removed. The statistic is the pooled correlation of demeaned g with demeaned return (IC). A quarter needs at least 8 countries.
- **Controls.**
  - A placebo that shuffles country labels within each quarter (signal reassigned at random, 1000 shuffles). The observed IC must lie outside the placebo's central 95%.
  - Leave-one-country-out: the IC must keep its sign when any single country is dropped.
  - The global-series sign check is reported, not scored.
- **Sample.** Outcome quarters 1987-Q1 → 2026-Q2 (equity) and 2004-Q2 → 2026-Q2 (FX, where Yahoo FX history starts). Halves split at 2008-Q1 for equity and at 2015-Q1 for FX.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | `equity`: do countries with faster cross-border borrowing underperform next quarter (IC < 0)? | **Weak negative**, IC around −0.03 to −0.05; the literature's effect works over years, not quarters. |
| b | `fx`: do their currencies underperform next quarter (IC < 0)? | **Null.** A capital-inflow boom tends to support the currency in the same period; the forward sign is unclear. |
| — | **THE GATE** (per cell): Holm CI for IC excludes 0; the same sign in both halves; outside the label-shuffle placebo 95%; and no single country flips the sign when left out. | |
| — | **THE MIRROR**: the same test at the other tail. It is a correlation over the whole cross-section, so there is no separate cell. | |

## 5. Power — what this design can and cannot find (required)

| Cell | Planned n (country-quarters) | Independent units | **MDE (IC)** | Useful bar | Verdict |
|---|---|---|---|---|---|
| equity | ≈ 3,000 (≈ 20 countries × 158 quarters) | 158 quarter clusters; after demeaning, the cross-country residuals are close to independent within a quarter (design effect about 2 assumed) | (2.24 + 0.84) / √1500 ≈ **0.08** | 0.05 | **UNDERPOWERED by design at 0.05; powered at 0.08** |
| fx | ≈ 1,400 (≈ 16 currency blocs × 89 quarters) | 89 quarter clusters, design effect about 2 | (2.24 + 0.84) / √700 ≈ **0.12** | 0.05 | **UNDERPOWERED by design** |

An IC of 0.05 on a quarterly cross-sectional tilt would be useful. These designs reliably find 0.08 (equity) and 0.12 (FX). Verdict words:
- **VALIDATED** (research-only): the full gate holds.
- **NULL**: the gate fails and the 95% CI lies inside (−0.05, +0.05).
- **UNDERPOWERED**: everything else.

## 6. Multiplicity (required)

- Scored cells: `equity` and `fx`. Holm at α = 0.05, p from `pFromCI`.
- Descriptive only: the within-country time-series version (each country demeaned over time); USD-denominated borrowing only; the non-bank sector (2014+); lags q+2 and q+4. Any slice that looks good is a candidate for its own prereg, never a result.
- Promotion: |t| ≥ 3 plus a forward record.

## 7. What this does NOT test (required)

- Multi-year crash risk (the literature's main horizon). The quarterly horizon matches the desk, not the literature.
- Tradability. Index costs, local market access and the timing of index closes are not modelled.
- Cause. A pass would show cross-sectional predictability, not why it happens.
- Point-in-time BIS data: this uses the latest vintage, so revision lookahead remains. That is why a pass needs the forward record.

## 8. What each verdict changes (required)

- **VALIDATED** → ledger entry (research-only). bank-credit.html adds a country ranking shown as "historically weaker next quarter", with its IC and CI. A forward record starts. No sizing.
- **NULL** → ledger entry. The Nasdaq context entry is updated to say the cross-country retest found nothing, and pages keep the regime wording only.
- **UNDERPOWERED** → ledger entry. The same display rule as NULL. More power would need a longer horizon (2–3 years, the literature's), which needs its own prereg.
