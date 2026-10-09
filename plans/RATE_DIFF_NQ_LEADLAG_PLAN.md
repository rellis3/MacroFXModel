# US–EU short-rate differential vs Nasdaq: lead, lag or coincident? (research plan, approved 2026-10-09)

Owner's brief: do not assume the relationship, its direction or its lag. Establish what the data supports; no trading
signal. Diagnose insignificant results instead of stopping, without forcing a relationship.

## Data (audited 2026-10-09)

- SOFR futures (CME, IBKR 15-min TRADES): SR3U6/Z6/H7/M7 2025-10-12 → 2026-10-08; expired U5/Z5/H6/M6 back to 2024-12. Clean.
- Euribor (ICE, IBKR 15-min TRADES): expired IZ5/IH6/IM6/IU6 (named pulls, clean); IZ6 clean before 2026-04-07, MIXED with
  IBKR's continuous series 2026-04-07 → 10-08 (first-pull bug) until re-pulled.
- €STR ER3U6 / FST3: Apr–Oct 2026, MIXED (same bug) until re-pulled. CME ESRM7: named, near-zero volume.
- Nasdaq: OANDA NAS100 15-min mid closes 2018 → 2026-10-07; NQ futures 1-min (local) to 2026-08-20; NQ futures 1-min
  from IBKR pending.

## Known alignment issues (handled before testing)

1. Mixed euro files → re-pull by named contract; until then the euro legs are used only before 2026-04-07.
2. TRADES closes are last trades (can be stale) vs OANDA mid at bar end → MIDPOINT re-pull; TRADES results reported
   with "bar had trades" filters meanwhile.
3. Euribor trades 00:00–20:45 UTC → differential bars only where BOTH legs have a fresh quote (no forward fill past one bar).
4. Tick size (0.25–0.5 bp) → many zero changes at 15 min → also longer horizons and "real move" filters.
5. 15-min resolution may be coarser than any lead → 1-min MIDPOINT pull (6 months) for an event-window study.
6. Rolls → differentials from matched contracts, changes always within one contract.

## Holdout

- 15-min family (15m / 30m / 1h / 4h / daily): explore 2025-10-13 → 2026-03-31; confirm 2026-04-01 → 2026-10-08
  (untouched by this study; the earlier wide scan used it, so confirmation here is weaker than fresh data).
- 1-min family (new data, Apr–Oct 2026): explore Apr–Jun, confirm Jul–Oct.
- Every specification tried is reported; the best result is compared with the best a day-shifted (scrambled) search finds.

## Specifications

- Rate series: US − EU at matched expiry (SR3Z6 − IZ6; and the generic 6–12-month-to-expiry SOFR − Euribor bucket),
  COG's pair (SR3U6 − ER3U6, after re-pull), each leg alone.
- Timeframes: 1m, 5m (1-min data), 15m, 30m, 1h, 4h, daily.
- Tests: cross-correlogram of changes at lags −16 … +16 bars both ways, day-block intervals, scrambled-day null bands;
  Granger (lag order by BIC, HAC errors) both directions; volatility lead (|Δ| vs |Δ|); release-window event study
  (1-min: which series completes half its 30-min move first).
- Transformations: Δ, σ-scaled Δ, sign, |Δ|, large moves (|z| > 2), k-bar cumulative, residual (price minus its
  rate-implied path).
- Regimes: session (Asia / London / US data + open / US afternoon), release days (calendar_events.csv: CPI, NFP, FOMC,
  PCE, GDP, ISM, ECB) vs other days, high vs low rate volatility, rolling 20-day windows, 2025 vs 2026.
- Null diagnostics: minimum detectable correlation (power), zero-change share, staleness, sign-cancelling regimes,
  sub-bar timing, nonlinearity.

Scripts `scripts/rate_diff_nq/`; output `analysis/output/rate_diff_nq/`.

## Exploration results and the finalists (fixed 2026-10-09, before the confirmation period was run)

Explore run: `analysis/output/rate_diff_nq/explore/RESULTS.md` (Oct 2025 – Mar 2026, TRADES bars, clean data).

**Finalists** (each is confirmed on 2026-04-01 → 10-08 if it has the SAME SIGN and is beyond the scrambled-day 95% band
there, or Granger p < 0.05 for the Granger items; reported for TRADES and, once pulled, MIDPOINT bars):

| # | claim | explore evidence |
|---|---|---|
| F1 | Nasdaq leads the US–EU differential (Granger price→rate) at 15m / 30m | Dec26 p 0.000 / 0.004; generic 0.000 / 0.000; reverse 0.05–0.7 |
| F2 | Nasdaq move precedes the differential by one 15-min bar (k = −1 > 0) | Dec26 +0.026★ |
| F3 | US leg moves precede Nasdaq by one 15-min bar (k = +1 > 0) | SR3Z6 +0.028★, SR3H7 +0.030★ |
| F4 | Rate rise on day d → Nasdaq lower on day d+1 (daily k = +1 < 0) | SR3Z6 −0.317★, SR3H7 −0.295★, diff −0.229★ |
| F5 | 4h: Nasdaq leads the differential by 4h (k = −1 > 0) | Dec26 +0.163★ |
| F6 | Same-bar link positive for the differential at every timeframe | +0.19 (15m) … +0.33 (4h), +0.49 daily |
| F7 | Same-bar link of each leg is strongly negative in London hours, weak or positive in US hours | SR3Z6 London −0.49 vs US open +0.10 |

Caveat fixed now: F1/F2/F5 (Nasdaq first) are what stale TRADES closes on the thinner rate leg would produce. They count
as confirmed only if they survive on MIDPOINT bars.

## Added 2026-10-09, before its exploration numbers were seen: C.OG's exact pair

The clean re-pull showed ICE ESTR ER3U6 trades a median 117 lots per 15 min (the earlier "~2" came from the mixed
continuous series), so C.OG's pair SR3U6 − ER3U6 is usable from 2025-10. It joins the exploration under the same rule:
any non-zero lag beyond the scrambled band, or Granger p < 0.05, becomes a finalist (F8+) and is judged on the
confirmation period exactly as F1–F7.
