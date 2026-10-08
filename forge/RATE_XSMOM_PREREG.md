# RATE-XSMOM: cross-sectional momentum in short-term rate differentials (FX) + a rates rule for NASDAQ

*Pre-registered 2026-10-08, before any return was computed. Source: C.OG, Discord 2026-10-08: "even something like a
cross sectional momentum making use of short term rate differentials and the Nasdaq could honestly put you ahead of a
worryingly large % of retail traders." Related but different: the yield-spread book (`forge/YS_LONG_CONFIRM_PREREG.md`,
PASS 1976–2014) trades MEAN REVERSION of the 2y spread level, one pair at a time. This ranks currencies against each
other by the TREND in their short-rate differential. Monthly, so no intraday data is involved.*

## Data (FRED, keyless; `analysis/output/ys_long/fred/`, `scripts/rate_xsmom/fetch.mjs`)

| ccy | spot (noon NY, daily) | 3-month rate (monthly) |
|---|---|---|
| USD | — | IR3TIB01USM156N |
| EUR | DEXUSEU (from 1999) | IR3TIB01DEM156N |
| JPY | DEXJPUS | IRSTCI01JPM156N to 2002-03, then IR3TIB01JPM156N |
| GBP | DEXUSUK | IR3TIB01GBM156N (ends 2026-01: GBP leaves the set after) |
| AUD | DEXUSAL | IR3TIB01AUM156N |
| CAD | DEXCAUS | IR3TIB01CAM156N |
| CHF | DEXSZUS | IRSTCI01CHM156N to 1999-06, then IR3TIB01CHM156N |
| NZD | DEXUSNZ | IR3TIB01NZM156N |
| NOK | DEXNOUS | IR3TIB01NOM156N |
| SEK | DEXSDUS | IR3TIB01SEM156N |

**No look-ahead:** a monthly rate dated the 1st of month M is used only from M + 45 days (the yield-spread book's rule):
at the end of month t the newest usable rate is month t − 1's. A currency is in the set from the month it has spot, its
rate and the US rate for the whole look-back, and leaves when its rate is more than 3 months stale.

## The FX book (primary)

- Differential d_i = r_i − r_US. **Signal:** the change in d_i over the last **L = 3 months** (primary; L = 1, 6, 12
  reported).
- Each month-end: rank the currencies in the set by the signal. **Long the top third, short the bottom third**
  (rounded down, at least 2 each side), equal weight, each against USD, so the dollar cancels. Held one month.
- **Return** of currency i against USD = spot log return + carry (d_i ÷ 12 ÷ 100, the forward points a rolled FX
  position earns or pays). Cost 0.02% per unit of turnover each rebalance (the yield-spread book's cost).
- **Periods:** 1976-01 → 2014-12 (the long confirmation sample) and 2015-01 → 2026-09 (recent). Monthly returns,
  12-month block bootstrap, 2,000 reps.

**PASS (all three):**
1. 1976–2014: mean monthly return > 0 with its 95% interval above 0;
2. 2015–2026: mean monthly return > 0 (point estimate; ~140 months cannot give a tight interval);
3. **it is not just carry or momentum in disguise:** regressed on the two standard FX factors built the same way
   (CARRY: rank by d_i level; FX MOMENTUM: rank by the last 3 months' spot return; both long top third / short bottom
   third), the intercept over 1976–2026 is > 0 with t ≥ 2 (Newey-West, 6 lags).

Reported: annualised Sharpe and max drawdown per period, each L, correlation with carry, FX momentum and the yield-spread
book's monthly returns (where they overlap), long-only and short-only halves.

## The NASDAQ rule (secondary)

NASDAQ Composite (NASDAQCOM, daily close; month-end to month-end). **Rule A (primary):** long NASDAQ next month when the
US 3-month T-bill rate (TB3MS, same 45-day rule) is lower than 3 months earlier; otherwise in T-bills (earning TB3MS ÷ 12).
**Rule B:** the same using the US rate minus the average of the other nine (the US short-rate differential).
Cost 0.05% per switch.

**PASS A:** over 1976–2026, the rule's Sharpe (excess of T-bills) minus buy-and-hold's has a 95% interval above 0
(12-month block bootstrap), and that difference is positive in both 1976–2014 and 2015–2026.

## Stopping rule

One run. No parameter changes after it: L = 3 and the top/bottom-third split are the result; the other L are context.
Output `analysis/output/rate_xsmom/RESULTS.md`; script `scripts/rate_xsmom/study.py`.
