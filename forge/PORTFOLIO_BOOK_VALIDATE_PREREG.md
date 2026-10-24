# portfolio-book-validate — Does the portfolio-book result survive the bias checks it has not had?

**Pre-registered 2026-10-25, before any of these tests was computed.**

| | |
|---|---|
| ID / ledger id | `portfolio-book-validate` (one entry; each test reported as its own row) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `portfolio-book-validate` |
| Data | as `forge/PORTFOLIO_BOOK_PREREG.md` (feature store `px_d1_*` ×10, `vix`, `vix3m`, `rate3m_*`), scored 2008-01-02 → 2026-08-21; T8 uses 2004-05-03 → 2007-12-31; T6 adds the Cboe PUT index daily history (public CSV, cdn.cboe.com) |
| Seed | harness fixed seed `0x9e3779b9` (unchanged from the parent study) |
| Uncertainty | date-block bootstrap, block 5, B = 1,000 (`js/portfolioBook.js` → `js/harness/stats.mjs`) |
| Scripts / outputs | `scripts/portfolio-book-validate/` → `analysis/output/portfolio-book-validate/` |
| Harness | the parent's pipeline, refactored into `scripts/portfolio-book/build.mjs` so each variant is one option. The refactor must reproduce the parent's `results.json` cells exactly (T0) |

## 1. The claim

The parent study (`portfolio-book`, banked as context) reported a five-sleeve equal-risk book at net Sharpe 1.06
(registered) / 1.11 (weekend-folded). A Sharpe that high from plain risk premia is better than most published versions of
these sleeves, so the working assumption is that something flatters it. This study tests the specific biases named on
2026-10-20 that the parent never checked.

## 2. Why it is not already settled

The parent checked lookahead by design, parameter fitting, deflation, concentration and the holdout. It did **not** test
lookahead empirically, charge CFD financing, delay fills, remove the hindsight instrument (NAS100), exclude the in-sample
FOMC sleeve, compare the vol proxy with a real benchmark, test a period it never saw, or rebuild the code independently.
No ledger entry covers any of these for this book.

## 3. Definitions, fixed in advance

All tests use the weekend-folded book (parent A4) unless stated. "Book" = P1, equal risk over {S1g, S2, S3g, S4, S5g}.

| # | Test | Exact definition | Pass bar |
|---|---|---|---|
| T0 | Refactor reproduces the parent | `build.mjs` + scoring reproduces every cell of `analysis/output/portfolio-book/results.json` | every Sharpe and DSR identical to 3 dp |
| T1 | **Future-poisoning** | re-run the whole pipeline with `sample.to` cut at **2012-06-29, 2017-03-31, 2022-09-30** (Fridays). For every sleeve leg, the daily contribution on every date **strictly before** the cut must equal the full run's | 100% identical (integer 1e-8 units), zero tolerance. **Any failure stops the study until fixed** |
| T2 | **CFD financing** | on each day held, per unit of notional (|position| × calendar days / 365): index long −(r + 2.5% − d), index short +(r − 2.5%) − d; gold long −(r + 2.5%), gold short +(r − 2.5%); FX legs −1.0% either way **on top of** the harness's rate-differential carry. r = `rate3m_usd` point-in-time at the prior close; d = 1.8% SPX500, 0.9% NAS100 (constant, stated assumption: no point-in-time dividend data in the store). S5 unchanged (margin, not financed notional) | book net Sharpe > 0.66 (the parent's MDE) |
| T3 | **One-day fill delay** | every position takes effect one trading day later than in the parent: leg P&L on day i uses pos[i−2]; carry scales with the delayed position; each cost moves one day later. S5: day-t P&L uses the state decided at t−2 | book Sharpe ≥ 0.75 × the undelayed book's (drop < 25%) |
| T4 | **No NAS100** | NAS100 leg removed from S1g and S2 (sleeve = mean of the remaining legs) | book Sharpe > 0.66 |
| T5 | **No FOMC sleeve** | book over {S1g, S2, S3g, S5g} | book Sharpe > 0.66 — **not blind**: the parent's audit already printed leave-one-out 0.98. Reported, carries no weight |
| T6 | **Vol proxy vs a real benchmark** | monthly returns of S5 (ungated, scaled to 10%) vs Cboe PUT index excess return (PUT monthly return − `rate3m_usd`/12), common months 2008-02 → 2026-08 | correlation ≥ 0.6 **and** S5 Sharpe − PUT excess Sharpe ≤ 0.4 |
| T7 | Other sleeves vs published indices | **deferred**: no free trend/carry benchmark history in the repo; stated, not run | — |
| T8 | **Period it never saw** | 2004-05-03 → 2007-12-31 with the sleeves that need no VIX3M or rate vintages: S1 (ungated core beta), S2 (trend), S5 (ungated vol proxy); book = equal risk over those three | book Sharpe > 0. **UNDERPOWERED by design** (3.7 years, Sharpe SE ≈ 0.52): a sign check only |
| T9 | **Independent rebuild** | a separate agent writes a fresh Python implementation from the parquet store and a written spec, **without reading** `scripts/portfolio-book/`, `js/portfolioBook.js` or `js/harness/` | daily raw sleeve streams correlate ≥ 0.95 with the parent's for S1g, S2, S3g, S4, S5g (2014-01 → 2026-08, after the weekend-row era) |
| T10 | Forward record | the demo executor (separate build); not scored here | — |

**Combined.** T2 + T3 + T4 + T5 applied together ("all haircuts") is reported as the honest estimate. It is descriptive,
with no bar of its own.

## 4. Hypotheses, expectation first

| # | Expectation, written before running |
|---|---|
| T0 | identical |
| T1 | passes (lagged scaling and as-of reads by design) |
| T2 | book falls to ≈ 0.9–1.0 |
| T3 | small drop (< 10%); these are slow signals |
| T4 | ≈ 0.95–1.05 |
| T6 | correlation ≈ 0.6–0.8; S5 Sharpe ≈ 0.5 above PUT's, so **expected to fail** the second bar (the proxy is too clean) |
| T8 | positive (2004–07 was a calm bull market, kind to beta and short vol) |
| T9 | ≥ 0.95 on all five |
| all haircuts | ≈ 0.75–0.9 |

## 5. Power

The book's Sharpe SE over 18.5 years is ≈ 0.235 (MDE 0.66, parent §5). T2/T4 bars sit at the MDE: a haircut book that
falls below 0.66 could not be told apart from zero on this sample. T8 is underpowered by design and is a sign check only.
T1, T0 and T9 are exact or engineering checks, not statistical ones.

## 6. Multiplicity

These are robustness checks of one banked result, not new edges, so there is no family correction. They cannot promote
the parent (it stays `context`); they can only confirm or demote it. Variants beyond the table above are not run.

## 7. What this does NOT test

Live execution (T10), real option fills (T6 uses an index of monthly at-the-money put writing, not this sleeve's exact
trade), broker-specific swap tables (T2 uses a stated markup), and dividends point-in-time.

## 8. What each verdict changes

- **All bars met** → the parent's ledger entry gains the haircut estimate; the book goes to the demo forward record as
  specified.
- **T1 fails** → everything stops; the parent's numbers are withdrawn until the lookahead is found and fixed.
- **T2, T3 or T4 fails** → the parent entry is demoted in place to the haircut number, and the page shows the haircut
  book by default.
- **T6 fails** → the vol sleeve is marked "proxy overstates" on the page and excluded from any live plan until an
  instrument-true version passes.
- **T9 fails** → the gap is found before anything else is trusted.

## Amendments

## RESULTS
