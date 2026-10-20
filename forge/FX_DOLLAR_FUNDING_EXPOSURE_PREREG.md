# fx-dollar-funding-exposure — In risk-off weeks, do currencies whose countries borrow more of their cross-border bank debt in US dollars fall harder against the dollar, and does that continue the next week?

**Pre-registered 2026-10-21, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `fx-dollar-funding-exposure-hit` (same week), `fx-dollar-funding-exposure-follow` (next week) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `fx-dollar-funding-exposure` |
| Data | BIS LBS (latest vintage): cross-border claims on each country, USD and all currencies (stocks, measure S). Yahoo daily FX closes → Friday-to-Friday weekly returns. VIX from the feature store (`vix`, FRED VIXCLS, close+1h). Weeks 2004-01 → 2026-08-21 (lockbox cut). |
| Seed | `20261021` |
| Uncertainty | Moving-block bootstrap over **weeks** (each week's whole cross-section is resampled together), block 8, B = 2000 |
| Scripts / outputs | `scripts/fx-dollar-funding-exposure/` → `analysis/output/fx-dollar-funding-exposure/` |
| Harness | Own script. This is a weekly cross-currency panel with a quarterly exposure variable. |

## 1. The claim (required)

This is project B from the 2026-10-20 research list. The currency composition of a country's foreign borrowing may matter more than its total. A country whose banks and firms owe dollars has to buy dollars when funding tightens, so its currency should fall harder in risk-off weeks (the "original sin" and dollar-funding literature: Bruno and Shin 2015; Avdjiev, Du, Koch and Shin 2019, "The Dollar, Bank Leverage and the Deviation from Covered Interest Parity"). The desk use is risk mapping: **which currencies to size down when risk-off arrives.** It is not a direction call on its own.

## 2. Why it is not already settled (required)

- `bank-credit-panel-fx` (null) tested borrowing **growth** against the next quarter's currency return, unconditionally. This study uses borrowing **composition** (the USD share), conditional on risk-off weeks, at a weekly horizon.
- `bank-credit-dollar-dxy` (underpowered) uses one global series against DXY.
- `funding-stress` (null) concerns US repo plumbing episodes, not cross-currency exposure.

## 3. Definitions, fixed in advance (required)

- **Currencies (19)**: the euro area (BIS `5C`, EURUSD), GBP, AUD, NZD, JPY, CAD, CHF, KRW, BRL, MXN, INR, TWD, SGD, IDR, TRY, MYR, THB, PHP, NOK, SEK. Yahoo tickers and signs are the same as in `bank-credit-panel`: + = the local currency strengthened against USD. HKD is excluded (pegged).
- **Exposure.** `E(c,q)` = USD-denominated cross-border claims on country c ÷ all-currency cross-border claims on c (BIS LBS stocks, all sectors), × 100. It is known at the end of q+2, so it is applied to **every week in quarter q+3** (the conservative two-quarter rule).
- **Risk-off week.** The Friday-to-Friday change in VIX is in the **top 20%** of all weeks in the sample. This is the same-week definition: it says *in* a risk-off week, not before one.
- **Weekly return.** The log change of the Friday close (100 × log).
- **Cross-sectional IC per week.** Exposure and return are each demeaned across the currencies present that week (at least 12), then correlated in the pooled panel.
- **Cell `hit`.** The IC in risk-off weeks minus the IC in all other weeks. **Expected negative**: high-USD-share currencies underperform more when risk is off.
- **Cell `follow`.** The IC of exposure against the **next** week's demeaned return, in weeks that follow a risk-off week. **Expected negative** if the selling continues; around 0 if it is a one-week shock.
- **Placebo.** The risk-off labels are randomly reassigned to the same number of weeks (1000 draws); the observed statistic must lie outside the placebo's central 95%. Also leave-one-currency-out: no single currency may flip the sign.
- **Halves.** 2004-2014 and 2015-2026.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | `hit`: in risk-off weeks, do higher-USD-share currencies fall harder than in other weeks? | **Yes, negative**, IC difference about −0.05 to −0.15. This is the cleanest prediction in the literature. |
| b | `follow`: does that relative weakness continue the next week? | **Probably null**. FX tends to absorb a shock within the week. |
| — | **THE GATE** (per cell): Holm CI excludes 0 with the expected (negative) sign; both halves negative; outside the label placebo; no currency flips it. | |
| — | **THE MIRROR**: in risk-ON weeks (bottom 20% of VIX change), high-USD-share currencies should **outperform**. Reported descriptively as a coherence check. | |

## 5. Power (required)

There are about 1,170 weeks, about 234 risk-off weeks and about 19 currencies, so the risk-off sample is about 4,400 currency-weeks. Cross-currency correlation that survives demeaning plus week clustering is taken as a design effect of about 4, giving about 1,100 effective units. MDE for an IC at 80% power, Holm α 0.025: (2.24 + 0.84) / √1100 ≈ **0.09**. The `follow` cell is the same size.

| Cell | n (currency-weeks) | Effective n | MDE (IC) | Useful bar | Verdict |
|---|---|---|---|---|---|
| hit | ~4,400 risk-off vs ~17,800 other | ~1,100 | 0.09 | 0.10 | POWERED |
| follow | ~4,400 | ~1,100 | 0.09 | 0.10 | POWERED |

Verdict words: VALIDATED if the gate holds; NULL if the CI lies inside (−0.10, +0.10); UNDERPOWERED otherwise.

## 6. Multiplicity (required)

- Scored cells: `hit` and `follow` (Holm at α 0.05, p from `pFromCI`).
- Descriptive only: the risk-on mirror; risk-off defined by the broad dollar instead of VIX (DXY weekly change in its top 20%); EUR and JPY borrowing shares; total borrowing growth as a control; the share of borrowing owed by non-bank borrowers.
- Promotion: |t| ≥ 3 plus a forward record.

## 7. What this does NOT test (required)

- Predicting risk-off. The `hit` cell conditions on a week that is only known once it is over. It maps exposure; it does not time anything.
- Unconditional currency direction, carry, or interest differentials (`yield-spread-sleeve` covers those).
- Costs and execution. Several of these currencies are expensive or restricted to trade.
- Point-in-time BIS data (latest vintage only, so revision lookahead remains; shares move slowly, which limits the damage).

## 8. What each verdict changes (required)

- **`hit` VALIDATED** → ledger entry. The Global Read currency notes and bank-credit.html show each currency's USD-funding exposure as "historically hit harder in risk-off weeks", with the effect size. Desk Watch adds the exposure ranking to its risk-off triggers (VIX inversion) as context. No sizing until |t| ≥ 3.
- **`follow` VALIDATED** → the same, plus a forward record of post-risk-off weeks. Any trading use needs its own cost-on prereg.
- **NULL / UNDERPOWERED** → ledger entries. The exposure is shown as a description only, or not at all.
