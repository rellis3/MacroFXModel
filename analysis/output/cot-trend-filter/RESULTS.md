# cot-trend-filter — does a COT filter improve the desk's trend system?

**Exploratory, not pre-registered.** Register row `cot-trend-filter`. The filter idea came from
`cot-extreme-duration`, which ran on the same 2007–2026 data, so even a pass would only be a lead for a
forward or lockbox test. The design is in the header of `scripts/cot-trend-filter/run.mjs`, fixed before any
outcome was computed. Seed 20261022.

## Plain English

The test took the desk's own trend system (`js/trendFollowEngine.js`, imported unchanged with its defaults)
and switched it off whenever the speculators were crowded on the same side as the trend **and** had been
stretched that way (80th+ percentile) for most of the past six months. The thinking, from
`cot-extreme-duration`: a trend whose crowd has been stretched for months has used itself up.

**It does not help.**
- **In-sample (2007–2016) it looked better:** Sharpe 0.49 → 0.57.
- **Out-of-sample (2017 to Aug 2026) it made things worse:** Sharpe 0.10 → 0.03, and the difference
  −0.07 has a 95% CI of [−0.20, +0.06].
- **Ex-10Y it was worse still:** −0.09 [−0.22, +0.04].
- **The softer version** (halve the position instead of cutting it) shows the same pattern, just smaller.
- **Trading only fresh trends** was worse in both periods.

By the rule set in advance (OOS difference > 0 with its CI above 0, and the same sign in-sample), the filter
**does not help**.

There is also a separate point. The trend system itself was weak over 2017–2026 on these 12 markets: Sharpe
0.10, against 0.49 in 2007–2016. A filter can't rescue a base with little edge in that period. That is a fact
about the base, not about COT.

## Results (all 12 markets; basket vol-targeted to 10%, 2bp costs, engine defaults)

| Arm | IS Sharpe | IS CAGR | IS max DD | OOS Sharpe | OOS CAGR | OOS max DD | OOS turnover/yr | OOS signal-days filtered |
|---|---|---|---|---|---|---|---|---|
| BASE (trend system as is) | 0.49 | 4.8% | −23.5% | 0.10 | 0.5% | −19.2% | 44.3 | — |
| FILTER_CUT | 0.57 | 5.6% | −22.4% | 0.03 | −0.3% | −17.8% | 40.1 | 11.1% |
| FILTER_HALF | 0.53 | 5.2% | −23.3% | 0.07 | 0.2% | −18.4% | 42.7 | 11.1% |
| FRESH_ONLY (descriptive) | 0.44 | 4.2% | −25.0% | 0.03 | −0.2% | −17.5% | 31.9 | 30.4% |

Sharpe difference vs BASE (95% CI, 63-day moving-block bootstrap on paired daily returns, 2000 reps):

| Arm | IS | OOS | Helps? |
|---|---|---|---|
| FILTER_CUT | +0.08 [−0.09, +0.24] | −0.07 [−0.20, +0.06] | no |
| FILTER_HALF | +0.03 [−0.04, +0.11] | −0.02 [−0.07, +0.03] | no |
| FRESH_ONLY | −0.05 [−0.34, +0.20] | −0.07 [−0.28, +0.21] | no |
| FILTER_CUT, ex-10Y | +0.08 [−0.10, +0.25] | −0.09 [−0.22, +0.04] | no |

The in-sample gain was concentrated in 2014–2016 (the filter cut losses in 2015 and 2016) and gave back 4.7 points
in 2008. Out of sample, the year-by-year differences flip sign:
- Losing years for the filter: 2017 (−2.6), 2018 (−1.7), 2020 (−1.5), 2024 (−1.8) and 2025 (−3.7). In 2025 it cut
  part of gold's long, crowded and still-running trend.
- Helping years: 2021, 2022 and 2023, each by +1 to +2.

Per market, OOS Sharpe (base → cut):
- **Helped:** 10Y 0.21 → 0.41, EUR −0.10 → −0.01, GBP −0.27 → −0.19, AUD −0.16 → −0.13.
- **Hurt:** CHF −0.54 → −0.78, gold 0.42 → 0.32, ES 0.44 → 0.34.
- **Barely filtered (≤ 1% of days):** JPY, USD, NQ. Their crowd is rarely stretched for months on the trend's side.

No market's change is large enough to stand out from the rest.

## Checks (assume code failure first)

- **Lookahead:** the COT state for day *d* uses only reports released before *d* (release = report Tuesday + 3).
  The engine holds the position decided at close *i* into *i*+1. Reports from the 2018–19 and 2025 shutdowns
  are dropped.
- **Alignment:** one common business-day grid, so the engine's index alignment matches dates exactly
  (L = grid length is asserted). No NaN closes.
- **Sign conventions:** in FX and metals the COT crowd agrees with the trend sign on 66–77% of signal days
  (specs chase trends, as `cot-extreme-duration` found); NQ, ES and the 10Y sit at 42–46%, where leveraged funds
  are the hedging or basis side. Spot check: on 2022-10-21 USD/JPY was 147 and the JPY crowd reads +1 (long USD/JPY).
- **BASE sanity:** full-sample Sharpe 0.30, IS 0.49, OOS 0.10, max DD −24%. That is an ordinary time-series
  momentum profile, including the well-documented weak 2010s–2020s stretch for FX trend.

## Caveats

- Exploratory: the filter's form came from looking at the same data.
- The OOS bootstrap CI is wide (the Sharpe difference is known to about ±0.13). A small true benefit can't be
  ruled out, but the point estimate is negative.
- Daily futures closes from Yahoo, unadjusted front month, so roll jumps hit the trend signal slightly; the same for
  every arm.
- 12 markets, most FX legs one USD trade.

## What it means for the page

Nothing changes how the COT page should be read: a long-held crowd on the trend's side is not a reason to cut a
trend position. This matches `cot-extreme-duration`: long-held extremes went flat on average, but "flat on
average" was not usable as a cut rule, because the trends it removed (gold 2025, CHF) were as likely to keep
paying as to stall.

## Files

`scripts/cot-trend-filter/prep.py` (aligned prices and point-in-time COT state → `aligned.json`) and
`scripts/cot-trend-filter/run.mjs` (imports `js/trendFollowEngine.js`, `js/metricsCore.js`, `js/statsCore.js`)
produce `results.json` and `js/cotTrendFilterData.js`.
