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

**C.OG-pair finalists (explore numbers seen 2026-10-09, confirmation not yet run):**

| # | claim | explore evidence |
|---|---|---|
| F8 | C.OG pair leads Nasdaq (Granger rate→price) at 15m | p 0.028 (price→rate p 0.000) |
| F9 | C.OG pair move precedes Nasdaq by one 15-min bar (k = +1 > 0) | +0.025★ (k = −1 +0.026★, k = −2 +0.025★) |
| F10 | C.OG pair up on day d → Nasdaq lower on day d+1 (daily k = +1 < 0) | −0.239★ |

## Diagnostic review (2026-10-09, written before any of these tests ran)

Owner's brief: investigate whether a genuine relationship could be hidden by the data or by the first model
specification. Every test below has a stated reason; nothing is added after results are seen. One family, BH-FDR
across it, explore/confirm splits as listed.

| # | check | why it could hide a relationship | design |
|---|---|---|---|
| T1 | Timestamps, time zones, DST, candle boundaries | A one-bar misalignment turns a lead into a "same bar" or the reverse | (a) OANDA NAS100 vs IBKR NQ 15m returns at lags −2..+2: the peak must be at 0; (b) the 50 largest 1-min Nasdaq moves: where the rate's largest move within ±3 min falls; (c) known release minutes (US CPI/NFP 12:30/13:30 UTC): both series must jump in the same minute; (d) same-bar correlation by week across US/UK DST changes |
| T2 | Rate observations vs futures-implied vs traded | The measure could be the wrong one | TRADES vs MIDPOINT (done: identical); 15m change correlations between STIR, 2y bond-futures yields and fed funds futures (ZQ). If they share > 0.7 they carry the same information and no separate lead test is justified. Daily SOFR / €STR fixings change only at policy moves, so they cannot lead intraday (not tested intraday) |
| T3 | Transformation and horizon | A level or slow signal could be invisible in 1-min changes and one year of data | DAILY US 2y (FRED DGS2) − German 2y (Bundesbank), 1997–2026, vs NASDAQ Composite. Transforms: level (Engle–Granger cointegration with the log Nasdaq level), 1-day change, 5- and 20-day momentum, 60-day z-score of the level. Horizons 1, 5, 20 days (HAC errors with overlap lags). Explore 1997–2011, confirm 2012–2026 |
| T4 | Targets other than the return | A rate signal may forecast risk, not direction | On the same daily sample: next-day and next-5-day absolute return (controlled for Nasdaq's own recent volatility, HAR-style), direction (logistic, out-of-sample AUC on the confirm half), and daily range (OANDA NAS100 2018–2026, explore 2018–2021, confirm 2022–2026). Intraday (1-min data Apr–Oct): rate move magnitude → next-hour Nasdaq realised volatility and range, controlled for Nasdaq's own last hour and last day |
| T5 | Regimes | An effect confined to one regime averages to nothing | Daily sample split by Nasdaq volatility tercile, Nasdaq trend (sign of the 50-day return), rate cycle (sign of the 6-month change in the US 2y) and announcement days (calendar_events.csv, 2014+: FOMC, CPI, NFP); the key transforms only (1-day change, 20-day momentum, z-score) |
| T6 | Power | If the pipeline cannot find a small real lead, "no lead" means little | Inject a known one-bar lead into the real 15m and 1m data (Nasdaq move += b × the rate move one bar earlier, scaled to correlations 0.01, 0.02, 0.03, 0.05) and record how often the grid procedure (FDR + confirm) finds it, 50 runs each |

**How the outcome will be classified:** insufficient data (T6 shows low power where the effect would plausibly be),
unsuitable specification (T1/T2 fail, or a transform/horizon in T3–T4 replicates where changes did not), conditional
(a regime in T5 replicates in confirm), or little predictive information (power adequate, specification checks pass,
nothing replicates).

**Additions after T1/T2 (2026-10-09, before T3-T6 were run):**
- T5 gains one regime: the **stock-rates sign regime**, the sign of the rolling 60-day correlation between daily US 2y changes and
  Nasdaq returns (past data only). Reason: T1d showed the same-bar sign flipped in March 2026 (SOFR vs Nasdaq +0.08..+0.35
  Oct-Feb, −0.15..−0.53 from Mar). Any lead may flip with it, and a "same sign in both halves" rule can then reject a real but
  regime-dependent effect. The 15-min study's halves (Oct-Mar / Apr-Oct) straddle the flip.
- **Post-hoc lead, labelled as such:** around the 50 largest 1-min Nasdaq moves, the US 2y's largest move sat 1-3 min
  BEFORE the Nasdaq move 14 times and after it 2 times. This was seen on all data, so it is checked only for (i) whether the
  pattern holds separately in Apr-Jun and Jul-Oct, and (ii) whether the rate's move direction in that window predicts the
  direction of the Nasdaq move (sign agreement vs the same-bar sign). It cannot be confirmed or rejected by more searching here.
