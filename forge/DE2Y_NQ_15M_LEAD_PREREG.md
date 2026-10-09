# DE2Y-NQ-15M-LEAD: does a German 2-year yield move lead Nasdaq by one 15-minute bar? (one confirmation test)

*Pre-registered 2026-10-09, before the confirmation data was downloaded. Source: the diagnostic review
(`analysis/output/rate_diff_nq/diagnostics/DIAGNOSTIC_REVIEW.md`, T6). Pooled over Apr–Oct 2026, the German 2y yield's
15-min change one bar before a Nasdaq 15-min return had correlation −0.038 [−0.062, −0.014]. It was one of about 600
cells and did not pass FDR in either half alone, so it is a candidate. This file turns it into ONE test on data that no
search has touched.*

## Data (new, not used by any earlier test)

- **German 2y:** Eurex Schatz futures (FGBS), 1-min MIDPOINT from IBKR, expired contracts Dec'24 → Mar'26, each used as
  front from 7 days before the previous contract's expiry to 7 days before its own. Yield change in bp =
  −Δln(price) / 1.9 × 10⁴, within one contract only.
- **Nasdaq:** NAS100 1-min closes (`VolRangeForecaster/data/m1/nq_m1.parquet`, the same series family as the OANDA
  15-min data checked against IBKR NQ at 0.965 in T1).
- **Window:** from the first Schatz bar the pull returns (expected ~Sep 2024) to 2026-03-31. April 2026 onward is excluded:
  the candidate came from there.
- **Bars:** 15-min, UTC, label left, closed left. A bar counts if ≥ 12 of its minutes are present for both series.

## The test (fixed now)

- x = German 2y yield change in bar t−1; y = Nasdaq log return in bar t.
- **Statistic:** correlation of x and y with a day-clustered t (per-day sums), as in the grid.
- **Primary sample:** bars where the stock-rates sign regime matches the discovery period. The rolling 60-day correlation
  of same-bar German 2y changes and Nasdaq returns, computed from data before that day, is NEGATIVE (stocks and yields
  moving opposite, as in Apr–Oct 2026).
- **PASS:** correlation < 0 with day-clustered t ≤ −1.96, in the primary sample.

Reported, no pass weight: the full window regardless of regime; the opposite regime; the same-bar correlation in each
regime (the sign check); and the effect size in Nasdaq points per 1 bp.

## Stopping rule

One run. **PASS:** the candidate is recorded as validated on one confirmation sample. It gets a forward paper record
before anything is built, and it stays a 15-min co-movement continuation, not a trading signal, until costs are
checked. **FAIL:** the rate-differential / Nasdaq lead question closes; the same-bar link stays as context.

Output `analysis/output/rate_diff_nq/de2y_lead/RESULTS.md`; script `scripts/rate_diff_nq/de2y_lead_test.py`.

## Amendment 1 (2026-10-09, before any confirmation data was seen)

IBKR keeps expired Schatz futures only from the Dec'25 contract (expired 2025-12-08); Dec'24–Sep'25 are not served (checked
with a contract-details query). So the confirmation window becomes **the Dec'25 contract's front period (from ~100 days
before its expiry, ~Aug–Sep 2025) → 2026-03-31**, using Dec'25, Mar'26 and Jun'26. That is about 7 months instead of 18.
- **Untouched?** The German 2y series in this window was not used by any test. Nasdaq in this window was used earlier
  (Oct 2025 – Mar 2026, in the SOFR/Euribor 15-min studies), but never against the German 2y and never for this
  hypothesis.
- **Power:** at the candidate's size (−0.038) the expected |t| is about 3 on the full window. The primary
  (opposite-regime) subset may be much smaller, because the stock-rates sign looked positive in Oct 2025 – Feb 2026.
  Its size is reported, and a FAIL on a small primary sample will be described as underpowered, not as a refutation.
- Test, statistic and pass rule unchanged.
