# Pre-registration: line tag × persistence at the p75 line

Committed 2026-10-03 before any number of this test was computed. Results will go in
`analysis/surfaces/TAG_X_PERSISTENCE_RESULTS.md` in a separate commit that cites this one.

## Why

Two descriptive results (neither pre-registered) say fade vs continue at the Vol Forecast lines depends on
information outside the touch itself:

- **Tag** (analysis/exhaustion_residual/RESIDUAL_MECHANISM_CHECK.md): implied vol ÷ the lines' σ.
  - In its top third the p75 range line is passed about 35% of days. In its bottom third, about 13%. The design rate is 25%.
- **Persistence** (analysis/surfaces/PERSISTENCE_CHECK.md): the 4-hour variance ratio over the previous 20 London days.
  - After a "giving back" stretch, p75 touches continued 2–4pp more often, in both halves.

The two come from different data (options vs the price path's autocorrelation). This test asks whether they **add up**
to a tradeable edge at the line, net of costs, where neither alone has.

## Data

- **Instruments (7):** EURUSD, GBPUSD, USDJPY, XAUUSD (CME CVOL from 2016-01) and AUDUSD, USDCAD, USDCHF
  (CVOL from 2018-10). Source: `cme_cvol_eod_available_history.parquet`.
- **Bars:** M1 from `VolRangeForecaster/data/m1/<inst>_m1.parquet`, 2016-01 → 2026-08-20.
- **Day:** London day, 00:00–24:00 Europe/London, weekdays.
- **Halves:** **A = 2016-01 → 2022-12**, **B = 2023-01 → 2026-08**.

## Definitions (all inputs dated before the London day)

- **σ_t:** Yang-Zhang 10-day volatility on London-day OHLC through day t−1.
- **Lines:** OH/OL p50/p75/p90 = open_t × (1 ± k·σ_t). k is a per-instrument quantile of (H−O)/O/σ and (O−L)/O/σ
  fitted on half A (calibration constants, as production fits them).
- **Tag:**
  - ratio_t = (CVOL from the last CVOL date before day t) / 100 / √252 / σ_t.
  - Tercile cut-offs per instrument, fitted on half A.
  - EXHAUST = bottom third, FAIR = middle third, CONTINUE = top third.
- **Persistence:**
  - VR_q,t = Σ(sum of q consecutive 5-min returns)² / Σ(5-min return²), over the 20 London days through t−1.
  - **Primary horizon: q = 48 (4 h).** Secondary, reported only: q = 12 (1 h).
  - Tercile cut-offs per instrument fitted on half A. GIVING BACK = bottom third, MIDDLE, EXTENDING = top third.
- **Touch:** the first M1 bar of the day whose high ≥ OH p75 (or whose low ≤ OL p75). Each side is counted once per day.
- **Follow trade** (with the break):
  - Entry at the p75 line. If the touch bar opened beyond the line, entry is at that open.
  - Target p90, stop p50. Resolution starts on the bar after the touch. If both are hit on the same bar, the stop counts.
  - An unresolved trade exits at the day's last M1 close.
  - R unit = |p75 − p50| (from the entry price for gapped entries).
- **Fade trade** (against the break):
  - Entry as above. Target p50, stop p90. Same resolution rules.
  - R unit = |p90 − entry|.
- **Costs** (`js/perLineStrategy.js`, % of price, converted to R per trade):
  - Round trip: EURUSD 0.008, GBPUSD 0.010, USDJPY 0.009, USDCHF 0.011, USDCAD 0.011, AUDUSD 0.011, XAUUSD 0.020.
  - Follow entries also pay slippage: fx 0.006, gold 0.012.

## Hypotheses and pass rules

**H1 (primary, follow):**
- The cell CONTINUE × GIVING BACK has mean net follow-R > 0 in **both** halves, **and**
- that mean is above the CONTINUE × (MIDDLE or EXTENDING) mean in both halves.

**H2 (secondary, fade):** the cell EXHAUST × EXTENDING has mean net fade-R > 0 in both halves.

Each hypothesis passes only if **all** of the following hold:

1. Its direction holds in both halves.
2. The day-clustered bootstrap 97.5% CI of the pooled (A+B) cell mean excludes 0. That is 2,000 resamples of days, at a
   Bonferroni level across H1 and H2.
3. At least 5 of the 7 instruments have a positive pooled cell mean.
4. The pooled cell mean beats the 95th percentile of a shuffled benchmark: VR terciles permuted within instrument × year,
   500 times, tag kept.
5. It still has a positive pooled mean at **2× costs**.

Reported but **not** pass criteria:
- Every tag × VR cell's continue / fade / stall rates and mean net R, for follow and fade, per half.
- The 1-h horizon.
- Per-instrument means.
- A logistic regression of continue on tag and VR terciles.

## What each outcome means

- **H1 passes:** the combined context becomes a candidate paper rule. It would be logged on the Rich-Vol Break Record as
  a separate column, not traded, until forward data confirms it.
- **H1 fails but the cells order the way the hypothesis says:** both reads stay context on today.html and the Daily Read,
  with that ordering stated, and nothing is promoted.
- **H2 is the first fade hypothesis with an out-of-price mechanism** (cheap options + extending moves = lines too wide
  and moves exhausted). A pass would be the first fade rule; a fail is recorded on the Fade/Continue ledger.

## Multiple-testing ledger

This adds 2 primary tests (H1, H2) to the running ledger.

The descriptive checks behind it were not pre-registered and are excluded from it:
- residual mechanism
- absorption
- persistence
- the order-book first look
