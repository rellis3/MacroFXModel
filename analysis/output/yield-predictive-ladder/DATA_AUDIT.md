# yield-predictive-ladder: data-quality and provenance audit

Deliverable 1 of the brief. Computed before any outcome. Window 2005-01-03 → 2026-08-21 (2004 = warm-up).

| series | what | timestamp | start | end | n | missing on US bdays | unchanged | robust-z > 8 changes | max gap (days) | extra publication lag used (bdays) |
|---|---|---|---|---|---|---|---|---|---|---|
| DGS3MO | US 3m nominal | end of day New York (H.15 / Treasury) | 2004-01-02 | 2026-08-21 | 5664 | 4.1% | 31.0% | 121 | 4 | 0 |
| DGS2 | US 2y nominal | end of day New York (H.15 / Treasury) | 2004-01-02 | 2026-08-21 | 5664 | 4.1% | 18.5% | 26 | 4 | 0 |
| DGS5 | US 5y nominal | end of day New York (H.15 / Treasury) | 2004-01-02 | 2026-08-21 | 5664 | 4.1% | 8.9% | 2 | 4 | 0 |
| DGS10 | US 10y nominal | end of day New York (H.15 / Treasury) | 2004-01-02 | 2026-08-21 | 5664 | 4.1% | 7.9% | 1 | 4 | 0 |
| DFII10 | US 10y real (TIPS) | end of day New York (H.15 / Treasury) | 2004-01-02 | 2026-08-21 | 5664 | 4.1% | 9.2% | 4 | 4 | 0 |
| T10YIE | US 10y breakeven | end of day New York (H.15 / Treasury) | 2004-01-02 | 2026-08-21 | 5664 | 4.1% | 16.4% | 5 | 4 | 0 |
| THREEFYTP10 | US 10y term premium (Kim-Wright) | model estimate, posted with a few days lag, revisable | 2004-01-02 | 2026-08-21 | 5664 | 4.1% | 0.2% | 1 | 4 | 5 |
| DEXUSEU | EURUSD (noon NY buying rate) | 12:00 New York | 2004-01-02 | 2026-08-21 | 5675 | 3.9% | 0.9% | 2 | 5 | 0 |
| NASDAQ100 | Nasdaq-100 cash close | 16:00 New York close | 2004-01-02 | 2026-08-21 | 5696 | 3.6% | 0.0% | 275 | 5 | 0 |
| VIXCLS | VIX close | 16:15 New York close | 2004-01-02 | 2026-08-21 | 5728 | 3.0% | 0.5% | 46 | 5 | 0 |
| DCOILWTICO | WTI spot | spot close (EIA), known bad prints | 2004-01-06 | 2026-08-21 | 5485 | 7.1% | 0.5% | 12 | 8 | 0 |
| DTWEXBGS | Broad dollar index (H.10) | daily values, published weekly (Mon) | 2006-01-02 | 2026-08-21 | 5174 | 12.4% | 0.0% | 4 | 7 | 6 |
| DE2 | Germany 2y par yield (Bundesbank Svensson, BBSIS R02XX) | end of day Frankfurt | 2005-01-03 | 2026-08-21 | 5497 | 6.9% | 21.0% | 9 | 6 | 0 |
| DE10 | Germany 10y par yield (Bundesbank Svensson, BBSIS R10XX) | end of day Frankfurt | 2005-01-03 | 2026-08-21 | 5497 | 6.9% | 12.0% | 0 | 6 | 0 |

## Panel: eurusd

- rows 5422 (2005-01-03 → 2026-08-21); rows with every model input present: 5401.
- release-day share (2007-07 → 2026-07): 15.1%.

| input | coverage |
|---|---|
| r_US2_d5 | 100.0% |
| r_US2_d20 | 100.0% |
| r_REAL10_d5 | 100.0% |
| r_REAL10_d20 | 100.0% |
| r_BE10_d5 | 100.0% |
| r_BE10_d20 | 100.0% |
| r_TP10_d5 | 100.0% |
| r_TP10_d20 | 100.0% |
| r_SLOPE_d5 | 100.0% |
| r_SLOPE_d20 | 100.0% |
| r_DIFF2_d5 | 99.9% |
| r_DIFF2_d20 | 99.6% |
| r_DIFF10_d5 | 99.9% |
| r_DIFF10_d20 | 99.6% |
| b_ret1 | 100.0% |
| b_ret5 | 100.0% |
| b_ret20 | 100.0% |
| b_ret60 | 100.0% |
| b_rv20 | 100.0% |
| b_lvix | 100.0% |
| b_dvix5 | 100.0% |
| m_oil5 | 100.0% |
| m_oil20 | 100.0% |
| m_de2_d20 | 99.6% |

## Panel: nq

- rows 5444 (2005-01-03 → 2026-08-21); rows with every model input present: 5167.
- release-day share (2007-07 → 2026-07): 14.9%.

| input | coverage |
|---|---|
| r_US2_d5 | 100.0% |
| r_US2_d20 | 100.0% |
| r_REAL10_d5 | 100.0% |
| r_REAL10_d20 | 100.0% |
| r_BE10_d5 | 100.0% |
| r_BE10_d20 | 100.0% |
| r_TP10_d5 | 100.0% |
| r_TP10_d20 | 100.0% |
| r_SLOPE_d5 | 100.0% |
| r_SLOPE_d20 | 100.0% |
| b_ret1 | 100.0% |
| b_ret5 | 100.0% |
| b_ret20 | 100.0% |
| b_ret60 | 100.0% |
| b_rv20 | 100.0% |
| b_lvix | 100.0% |
| b_dvix5 | 100.0% |
| m_oil5 | 100.0% |
| m_oil20 | 100.0% |
| m_usd5 | 95.2% |
| m_usd20 | 94.9% |

## Point-in-time rules applied

- **Every model input for row d is dated ≤ d−1.** Changes are taken over each series' own observations, then joined as-of; anything staler than 7 days is missing, never interpolated.
- **Extra publication lags (A1):** the broad dollar (weekly H.10) uses d−7; the Kim–Wright term premium uses d−6 and is revisable, so every model is also run without it.
- **Targets** run from the day-d print: EURUSD at noon New York (FRED DEXUSEU), Nasdaq-100 at the close.
- **Calendars differ** (US and German holidays). The as-of join uses the last value each market actually printed. Same-day descriptive correlations use exact-date matches only.
- **Oil:** WTI is floored at 1 before taking logs (the 2020-04-20 negative print). All features are winsorised inside each training window (A1).
- **Revisions:** H.15 Treasury yields, TIPS and breakevens are not revised. The Bundesbank Svensson curve is a fitted curve, not traded quotes. The Kim–Wright term premium is model-revised (flagged above).