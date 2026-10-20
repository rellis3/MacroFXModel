# gamma-regime-trades-fx — Does the daily hedge plan (fade on calm days, follow on fast days) make money on FX?

**Pre-registered 2026-10-20, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `gamma-regime-trades-fx` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `gamma-regime-trades-fx` |
| Data | EUR/USD, GBP/USD, AUD/USD CFD 1-minute bars (`VolRangeForecaster/data/m1/<pair>_m1.parquet`), London sessions; lines from `analysis/output/forecast_history/<PAIR>.csv` (live ladder); regime = net GEX sign, ≤45-DTE CME surface (`oi_research_book/data/daily_master_near[_<pair>].parquet`). Window 2020-09 → 2026-08-21 (lockbox). |
| Seed | `20261020` |
| Uncertainty | stationary block bootstrap over sessions, mean block 10, 5,000 reps (pooled: resample dates, all three pairs together) |
| Scripts / outputs | `scripts/gamma-regime-trades-fx/run.py` → `analysis/output/gamma-regime-trades-fx/` |
| Harness | own script; reuses `scripts/forecast_history/gamma_regime_trades.py` (Test A trade engine, costs, freshness cap) unchanged |

## 1. Claim

The rules the OI page now publishes every morning (`js/hedgingPlan.js`): on days when dealers are long gamma, fade
the first touch of a p75 line (stop p90, target p50); on short-gamma days, follow it (stop p50, target p90). One
trade a day, entries 08:00–20:00 London, flat at 22:00, 0.01% round-trip cost. On FX this earns positive R per trade,
and better than always fading or always following.

## 2. Why this is not already settled

`gamma-regime-trades` (null) tested this on **NQ only**, with a regime available on 813 sessions. FX has a daily
≤45-DTE book with no gaps (~1,500 sessions per pair), so it is a far better-powered test of the same rule on other
markets. `gex-fx-crossmatch` found the gamma-range effect weak on FX (+0.04, n.s.); that was range, not a traded rule.
Inverted pairs (USD/JPY, USD/CAD, USD/CHF) are excluded: the research book's sign convention for them is unverified
(`gex-fx-crossmatch` used the same three primaries for the same reason).

## 3. Definitions

Exactly `gamma_regime_trades.py` Test A, variant 1: regime = sign of `net_gex_sum` dated ≤ 2 business days before
the session and no older than 4 days; lines = the session open × (1 ± live_oh/ol p50/p75/p90 %); same-minute stop and
target = stop. Sessions with no fresh regime are dropped and counted.

## 4. Hypotheses

- **THE GATE:** switch strategy (SW) pooled across the three pairs: mean net R per trade > 0 with the 95% interval
  above 0, **and** SW − always-FADE and SW − always-FOLLOW both with intervals above 0, **and** SW > 0 on at least
  2 of 3 pairs, **and** SW > 0 in both halves (≤ 2022-12-31, ≥ 2023-01-01).
- **THE MIRROR:** the regime label circularly shifted 125 sessions within each pair: if it scores SW within half
  the real SW or better, NULL.

## 5. Power

~1,500 sessions per pair with a p75 touch on roughly 40% → ~1,800 trades pooled. With a per-trade s.d. of ~0.9 R
(NQ run), the pooled 95% half-width is about ±0.05 R, so an edge of +0.07 R per trade or more would show. Smaller
than that is UNDERPOWERED, not NULL.

## 6. Multiplicity

One rule, three pairs pooled, one gate. Per-pair and per-arm numbers are reported, not tested.

## 7. What it does not test

Inverted pairs, gold, commodities, the Cboe book, the zero-gamma break (Test B), any parameter change to the rule.

## 8. What each verdict changes

- VALIDATED → the FX plan becomes a candidate system: costed walk-forward with spreads per pair, then a demo
  forward run alongside the paper record.
- NULL → the FX plan stays on the page as context only, labelled with this result; no system is built from it.
- UNDERPOWERED → keep the paper record; no build.

## Amendments

(none)
