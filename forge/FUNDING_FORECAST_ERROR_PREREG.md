# funding-forecast-error — On days when short-term credit is dear or leverage is building, do markets move further than the desk's shipped range forecast says?

**Pre-registered 2026-10-22, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `funding-forecast-error-squeeze`, `funding-forecast-error-cpstress`, `funding-forecast-error-levbuild` (three scored cells) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `funding-forecast-error` |
| Data | Forecast and outcome: `analysis/output/vf3_stage_b/part1_lines.parquet`, out-of-sample rows only (`oos = 1`): 34 instruments, London sessions 2020-08-20 → 2026-08-20 (before the lockbox). Funding (feature store, point-in-time): `sofr`, `iorb` + FRED `IOER` before 2021-07-29 (cached in `analysis/output/quarter-end-funding/fred_IOER.json`), `cp_fin_3m`, `tff_lev_ust_notional`. |
| Seed | `20261022` |
| Uncertainty | Block bootstrap over session dates (each date's whole cross-section of instruments is resampled together), block 21 sessions, B = 2000 |
| Scripts / outputs | `scripts/funding-forecast-error/` → `analysis/output/funding-forecast-error/` |
| Harness | Own script; it reads the forecast-history table directly. |

## 1. The claim (required)

The owner, 2026-10-22: when short-term credit is dear or scarce, or when leverage is building, it changes how people trade. The desk version: those conditions should make markets move **further** than the forecast expects, because leveraged positions get cut and dealers have less balance sheet to absorb flows. The Education Bank says the same in its own terms: "Liquidity & market microstructure — markets move where liquidity is thin" (Companion Insights), and in the funding-stress sections of Currency Markets & Global Flows.

This asks **how far**, not **which way**. It is the version of the credit thread with the best chance, because it tests whether funding explains the **errors** of a forecaster that is already validated (`forecast-pick`, `forecast-persistence-fix`).

## 2. Why it is not already settled (required)

- `funding-stress` (null) measured the next-week range after SOFR-above-floor episodes or Standing Repo Facility draws, **against a matched control**. It did not score against the desk forecast, and it used episode flags, not continuous funding conditions.
- `forecast-record-pit` (context) found a busy/quiet regime miss; `forecast-persistence-fix` (validated) corrected it. Whether funding explains what is **left** after that correction is untested.
- `one-range-forecast` (null): market-state flags and gamma sign add nothing on top of SI. Funding variables were not among them.
- `nbfi-rates-vol` and `tff-basis-rates-vol` (underpowered) used quarterly/weekly Treasury vol beyond its own persistence, not the desk's multi-asset daily forecast.

## 3. Definitions, fixed in advance (required)

- **Shipped forecast.** `SI_hl_p50` where present, otherwise `S_hl_p50` (the `forecast-pick` rule). This is the median high-low range forecast for the London session, in % of the open.
- **Error.** `e = ln(r_hl / forecast_p50)` per instrument-session. Positive means the market moved further than forecast.
- **Date-level error.** The mean of e across instruments that session. The cells are scored on dates, so 34 correlated instruments don't count as 34 observations.
- **Funding signals**, each known before the London session opens (asof ≤ session date 00:00 UTC):
  - `squeeze`: the mean of (SOFR − floor) in bp over the last 5 SOFR prints known. Floor = IOER before 2021-07-29, then IORB. This measures **the price of overnight secured credit** relative to the Fed's own rate.
  - `cpstress`: the mean of (90-day AA financial CP − SOFR) in bp over the last 5 prints known. This is **unsecured bank funding cost over secured**, the closest local proxy to the course's OIS–SOFR stress spread.
  - `levbuild`: the 13-week change in the CFTC leveraged-fund net Treasury futures position, sign-flipped so that **+ = the short (the leverage) is growing**, divided by the SD of 13-week changes over the trailing 156 weeks.
- **Statistic, per cell.** The mean date-level error on **top-tercile** signal days minus **bottom-tercile** days. Terciles are cut on the signal over the full scored sample. Reported in log points and as % = 100 × (exp(diff) − 1).
- **Controls.**
  - **Placebo:** circular shifts of the date-level signal by at least 63 sessions (every 5th shift); the observed value must lie outside the central 95%.
  - **Halves:** 2020-08-20 → 2023-08-20 and 2023-08-21 → 2026-08-20.
  - **Asset classes:** FX (majors + crosses) and indices are each computed separately and must have the same sign.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | `squeeze`: do high-SOFR-over-floor days move further than forecast? | **Small positive**, +1% to +4%. Much of the time this spread is month-end and mid-month calendar noise (see `funding-stress`). |
| b | `cpstress`: do high CP-over-SOFR days move further than forecast? | **Positive**, +2% to +6%. This is the most "stress"-like of the three. |
| c | `levbuild`: do fast leverage build-ups move further than forecast? | **Small positive or none.** `tff-basis-rates-vol` found nothing in Treasury vol. |
| — | **THE GATE** (per cell): Holm CI excludes 0 with a positive sign; positive in both halves; above the shift placebo's 95th percentile; the same sign in FX and in indices. | |
| — | **THE MIRROR**: easy-credit days (bottom tercile) moving **less** than forecast. The top-minus-bottom difference covers both sides. | |

## 5. Power (required)

From the outcome SD alone (no funding data): the daily cross-instrument mean error has SD 0.218 and day-to-day autocorrelation 0.13; the monthly mean has SD 0.056 over 73 months. The funding signals are slow (they change over weeks and months), so the honest unit is about one month. With about 24 months per tercile, the SE of the difference is 0.056 × √(2/24) ≈ 0.016. MDE at 80% power with Holm across 3 cells (first α 0.0167): (2.39 + 0.84) × 0.016 ≈ **0.053 log points, about 5.4%**.

| Cell | Dates (sessions) | Effective units | MDE | Useful bar | Verdict |
|---|---|---|---|---|---|
| squeeze | ~1,558 | ~73 months | ≈ 5.4 % | 3 % | **UNDERPOWERED by design at 3%; powered at ~5.5%** |
| cpstress | ~1,558 | ~73 months | ≈ 5.4 % | 3 % | same |
| levbuild | ~1,558 | ~73 months | ≈ 5.4 % | 3 % | same |

A 3% systematic miss would justify widening the bands on those days, and this sample can only reliably see about 5.5%. Verdict words: VALIDATED if the gate holds; NULL if the CI lies inside (−3%, +3%); UNDERPOWERED otherwise.

## 6. Multiplicity (required)

- Scored cells: `squeeze`, `cpstress`, `levbuild` (Holm at α 0.05, p from `pFromCI`).
- Descriptive only: overnight RRP level (log); 4-week change in reserves; SOFR volume 4-week growth; net liquidity 4-week change (`js/netLiquidity.js` units); HY OAS 20-day change; the p75 exceedance rate (should be 25%) by tercile; gold separately; each cell excluding month-end ±2 sessions (the calendar part of `squeeze`).
- Promotion: |t| ≥ 3 on the scored cell plus a forward record before any band is ever widened.

## 7. What this does NOT test (required)

- Direction. This is about size only.
- Intraday timing, or whether a funding shock **on** the day explains that day (the signals are known before the open).
- Whether any band adjustment would survive a live forward test, or what it would be worth in trading.
- Margin debt and the cross-currency basis (not in the store yet).

## 8. What each verdict changes (required)

- **VALIDATED (any cell)** → ledger entry (research-only). The funding block on today.html shows "tight-funding day: ranges have historically run about x% above forecast", with its CI. A shadow band adjustment is logged side by side with the shipped forecast and **never** replaces it (the side-by-side rule). Promotion needs |t| ≥ 3 and the forward record.
- **NULL** → ledger entry. Funding is recorded as **not** explaining forecast misses, and the forecaster stays as it is.
- **UNDERPOWERED** → ledger entry. The CI shows how big a miss is still possible. The forward record continues via funding_read_v1.
