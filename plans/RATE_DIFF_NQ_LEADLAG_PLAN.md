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
