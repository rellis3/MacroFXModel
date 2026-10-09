# Rates vs Nasdaq / C.OG's rate-differential idea — what has been done and tried (7–9 Oct 2026)

Every test was pre-registered before it ran (forge/ or plans/), committed, and logged in the Evidence Book
(js/deskEvidence.js). Results files are listed per item.

## Data built

| what | where | notes |
|---|---|---|
| SOFR futures 15-min (U5…M7), Euribor (IZ5…IZ6), €STR ICE / Eurex / CME | analysis/output/stir/ | IBKR; archive merges on each pull; expired contracts back to Dec 2024 |
| MIDPOINT 15-min (SOFR U6–M7, Euribor IZ6, €STR ER3U6) | analysis/output/stir_mid15/ | rules out stale last-trade prices |
| 1-min MIDPOINT Apr–Oct 2026: SOFR Z6/H7/U6, Euribor IZ6, €STR ER3U6, NQ futures M6/U6/Z6, US 2y (CBOT ZT U6/Z6), German 2y (Eurex Schatz) | analysis/output/stir_1m/ | Fridays re-pulled after a bug |
| Expired Schatz 1-min (Dec'25, Mar'26, Jun'26) | analysis/output/stir_1m_hist/ | for the final confirmation test |
| Daily US 2y (FRED DGS2 1976–), German 2y (Bundesbank 1997–), NASDAQ Composite (1971–), 9-currency FX + 3-month rates | analysis/output/ys_long/fred/, policy_direction/ | |

## Tests, in order

| # | idea | result | file |
|---|---|---|---|
| 1 | Price catches up with the SOFR/Euribor-implied move within 1h / 4h (bond-CFD version had failed) | FAIL on its placebo rule; leaned positive (b +0.19, all 5 markets) | forge/STIR_RESIDUAL_PREREG.md |
| 2 | Rates move first (lead-lag, 15m) | no lead; same-bar only | same |
| 3 | Friday's rate line draws Monday's Nasdaq (C.OG's chart) | passed narrowly, but it is afternoon direction, not turn times; minute moves −0.01 | same; viewer artifact |
| 4 | Wide scan: 48,600 combinations of 12 rate series × 9 features × 18 markets × 5 horizons × 5 sessions | no single result beats chance; the top-30 sign held 25/30 (borderline) → Fed-path-slope cluster | forge/STIR_WIDE_SCAN_PROTOCOL.md |
| 5 | That cluster on untouched Oct 2025 – Apr 2026 | FAIL (t +1.43, needs 2.0) | forge/FED_PATH_LEAD_PREREG.md |
| 6 | C.OG: cross-sectional momentum in short-rate differentials (9 currencies, 1976–2026) and Nasdaq only while US rates fall | both FAIL (Sharpe 0.13; Nasdaq rule worse than holding). Carry itself works (Sharpe 0.54) | forge/RATE_XSMOM_PREREG.md |
| 7 | Contract map: which part of the curve moves markets, % per bp, follow-through after sharp moves | SOFR 6–12 months out matters most; ~50% follow-through (none); stock sign flipped 2025 → 2026 | analysis/output/stir_contract_map/, stir_maturity_map/ |
| 8 | US−EU differential vs Nasdaq, 15m family, explore Oct–Mar / confirm Apr–Oct, TRADES and MIDPOINT, C.OG's pair included (10 candidates fixed in advance) | none confirmed; same-bar differential link collapsed Apr–Oct | plans/RATE_DIFF_NQ_LEADLAG_PLAN.md, analysis/output/rate_diff_nq/ |
| 9 | Same at 1 min + release windows | no rates lead; Nasdaq leads rate quotes by ~1 min at sub-tick size; at releases both move in the same minute | rate_diff_nq/one_minute/ |
| 10 | Full grid with a SMOOTH spread (US 2y − German 2y from bond futures): 5 series × 1–60 min × lags ±12, distributed-lag both ways, levels / error correction, conditional, rolling | 0 of 600 cells survive; out-of-sample forecasts no better; the 2y spread ~0 even same-bar (legs cancel) | rate_diff_nq/full/ + Lead-Lag Atlas artifact |
| 11 | Diagnostic review: timestamps/DST, rate measures, transforms and horizons on 29 years of daily data, volatility / range / direction targets, regimes, power | alignment correct; nothing replicates; the grid had little power at 15m → intervals; one candidate (DE 2y, 15m, −0.038) | rate_diff_nq/diagnostics/DIAGNOSTIC_REVIEW.md |
| 12 | That candidate, once, on new data (Sep 2025 – Mar 2026) | FAIL: primary regime only 16 days (underpowered); full window −0.008 [−0.035, +0.020] excludes the candidate's −0.038 → lead question CLOSED | forge/DE2Y_NQ_15M_LEAD_PREREG.md |

## What holds so far

- Rates and Nasdaq move together **in the same bar**, through each rate leg (−0.13 to −0.36 intraday). The **sign of that
  link changes with the regime** (flipped Mar 2026; daily +0.31 in 1997–2011, +0.09 since).
- The **US−EU differential** carries little of it: both legs usually move together and cancel.
- **No lead in either direction** has replicated at any horizon from 1 minute to a month. At 1–5 min and daily the data
  rules out anything meaningful. At 15–60 min, six months of data can't rule out a small effect (interval up to about
  ±0.05).

## Tools built

- pine/rate_overlay.pine (auto-picks SOFR / €STR / Euribor / yield feeds, raw pane like C.OG's, lag profile; not yet
  confirmed to compile).
- "Rate Spread vs Nasdaq" viewer: https://claude.ai/artifact/SwgKJPCD2hatiKDebpNvWF
- "Rate Spread Lead–Lag Atlas": https://claude.ai/artifact/N6jnsQLsd53cBBkJfvJ1Ub
- IBKR pull scripts: scratchpad/ibkr_stir_pull.py, scratchpad/ibkr_hf_pull.py.

## Bugs found and fixed along the way (mine)

- First euro pulls saved IBKR's continuous series under single-contract names, mixed into the named contracts →
  re-pulled. The earlier "€STR barely trades" was wrong.
- The `--end` option shipped without its imports (fixed by another session).
- The 1-min pull missed every Friday after 06:30 UTC → re-pulled.
- The first Rate Overlay used the wrong contracts and a rolling fit that bent the line → rebuilt.

## Still open

- Re-run the euro rows of tests 1, 4 and 7 on the clean euro data.
- The same questions against EURUSD (where the differential is the natural variable).
- calendar_events.csv ends 2026-07-02.

## Built from the lessons (2026-10-09)

**Rates vs Nasdaq regime read + alerts.** Context only, no forecasting.

- **Engine:** `js/ratesRegime.js`, tested by `js/ratesRegime.test.mjs`.
- **Server job:** `ratesRegime`, every 15 minutes, using OANDA's US 2y bond CFD and NAS100 at 15-min. It computes:
  - the rolling 20-day same-bar link and its regime band (strong / moderate / weak, opposite / together);
  - Nasdaq % per bp of yield;
  - a sign-flip check;
  - today's and the last hour's move attribution.
- **Telegram** (master switch `tgMaster.ratesRegime`) on a band change, a sign flip, or a ≥ 2σ 15-min rate shock. The
  first run after a deploy is silent.
- **Where to see it:** `/api/rates-regime`; the rates.html card "Who is driving Nasdaq — rates, or not?"; KV
  `rates_regime_v1` holds the daily history (the forward record: does the band persist?).
- **Check on the research data:** 2026-10-07 gives −0.41, −0.063% per bp, strong-opposite.
