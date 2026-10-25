# dax-ifo-lookahead — does the IFO month-on-month sign predict the DAX once the trade only uses a published reading?

**Pre-registered 2026-10-25. Not blind:** an earlier cloud-session review (not committed) already reported honest
re-runs (−5.2% CAGR, t −0.95 and −6.7% CAGR). This prereg fixes the definitions and verdict rules before *this*
session computes any honest-timing number, so the banked verdict rests on a committed, reproducible check rather than
an uncommitted review. Expectation is stated accordingly.

| | |
|---|---|
| ID / ledger id | `dax-ifo-lookahead` |
| Branch | `claude/overnight-hold-dax-ifo-retro` |
| Register row | `plans/RESEARCH_REGISTER.md` → `dax-ifo-lookahead` |
| Data | `Dax Base IFO System/System/data/RAWDATA.csv` (IFO business climate by reference month, 2005-02 → 2026-06) and `dax_raw.csv` (DAX daily closes → 2026-07-20). Ends before the 2026-08-21 lockbox. |
| Seed | `20261025` |
| Uncertainty | stationary block bootstrap on monthly returns, mean block 6 months, B = 10,000; plus the plain t-stat for comparison with the original |
| Scripts / outputs | `scripts/dax-ifo-lookahead/check.py` → `analysis/output/dax-ifo-lookahead/` |
| Harness | own script (monthly data, 3 timings, nothing in `runStudy` fits) |

## 1. The claim (required)

`Dax Base IFO System/System/README.md`: "IFO increases from prior month: Long DAX. IFO decreases: Short DAX. IFO is
released around the 25th of each month, allowing same-month positioning." Claimed 9.4% CAGR, −27% max DD, 0.32
Sharpe vs buy & hold 7.6% / −52% / 0.21 (`output/COG run/`). Source tagged as the owner's earlier work in the C.OG
course style; "august analysis.md" files it as "decayed 2020+".

## 2. Why it is not already settled (required)

No Evidence Book entry exists for IFO or the DAX. The nearest are macro-surprise entries (`surprise-size`) and
`growth-vs-yields`, which test different signals. The "decayed 2020+" label was never a test result.

The suspected fault: `02_base_ifo_strategy.py` sets the position for month M from IFO(M) − IFO(M−1) and earns the DAX
return from the end of M−1 to the end of M. IFO(M) is published around the 24th–25th of month M, so about three
quarters of the return it is credited with had already happened.

## 3. Definitions, fixed in advance (required)

- **Months.** DAX month-end close = last daily close in the calendar month. Monthly return = close-to-close.
- **Signal.** s(M) = +1 if IFO(M) > IFO(M−1), else −1 (ties −1, as the original). Long/flat variant: +1 / 0.
- **Timings:**
  - **(A) original, same month:** position s(M) earns return of month M. *Reproduction only; known lookahead.*
  - **(B) next month:** s(M) earns the return of month M+1 (fully published before M+1 starts).
  - **(C) at release:** release day of IFO(M) approximated as the first DAX trading day on or after the 25th of M;
    s(M) earns the return from that day's close to the close of the next release day. Sensitivity: day 22 and day 27.
- **Outcome.** Mean monthly strategy return (%), CAGR, max drawdown, Sharpe with a 0% and with a 3.8% risk-free rate
  (the original's), t-stat. No costs in the scored cells (costs can only lower it); one flip costing 0.10% reported.
- **Control.** DAX buy & hold over the same months.

## 4. Hypotheses, expectation first (required)

| # | Question | Expectation |
|---|---|---|
| A | Does (A) reproduce the claimed 9.42% / −27.4% / 0.32? | **Yes** (reproduction check; if it fails, stop and find out why) |
| B | (B) long/short mean monthly return > 0? | **No.** Expected negative, as the uncommitted review found |
| C | (C) long/short mean return per release-to-release period > 0? | **No** |
| — | **THE GATE (VALIDATED)** | (B) and (C) both: mean > 0 with bootstrap 95% CI excluding 0, Holm-adjusted across the two, and positive in both halves |
| — | **THE MIRROR** | the long/flat variant (does the "up" signal alone carry anything); descriptive |

**Verdicts:** VALIDATED as above. **NULL** if the gate fails and the 95% CI of (B)'s mean monthly return lies below
+0.5% a month (the edge the claimed 9.4% CAGR vs 7.6% buy & hold would need, roughly). **UNDERPOWERED** otherwise.

## 5. Power (required)

DAX monthly return SD ≈ 5% (control sample, buy & hold). ~255 months, block bootstrap design effect ≈ 1.2 →
SE ≈ 5 / √(255/1.2) ≈ 0.34%/month; MDE (80%, α 0.025) ≈ 1.0%/month. The NULL rule needs the interval below +0.5%,
which a point estimate near or below zero achieves; a small positive point estimate would read UNDERPOWERED.

| Cell | n | SD | MDE | Pass bar | Verdict |
|---|---|---|---|---|---|
| (B) next month | ~255 | ~5% | ~1.0%/mo | CI > 0 | POWERED only for a large effect; NULL decided by interval vs +0.5% |

## 6. Multiplicity (required)

Scored: (B) and (C), Holm at 0.05. (A), long/flat, day-22/27 sensitivity, costs: descriptive.

## 7. What this does NOT test (required)

Whether IFO *surprises* (vs consensus) move the DAX on release day; whether IFO levels carry regime information;
any intraday reaction. Only the published rule.

## 8. What each verdict changes (required)

- **NULL** → ledger null; "august analysis.md" line changed from "decayed 2020+" to "lookahead, never tradable";
  `Dax Base IFO System/` README gets a warning header.
- **VALIDATED** → its own forward-test prereg; nothing live.
- **UNDERPOWERED** → archived with the honest numbers.

## Amendments

*(none)*

## RESULTS

*In `analysis/output/dax-ifo-lookahead/RESULTS.md`.*
