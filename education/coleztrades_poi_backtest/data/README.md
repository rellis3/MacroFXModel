# Data — ColezTrades POI-Reaction Backtest

Machine-readable outputs for the run described in `../COLEZTRADES_POI_BACKTEST.md`.

## Trade logs (one row per closed trade, all 26 pairs pooled)
Three house schemas (see `CLAUDE.md`):
- `trades_pct_returns.csv`  — `Instrument,Date,Return %,MAE %`
- `trades_r_multiples.csv`  — `instrument,date,R,MAE (R)`
- `trades_currency_pnl.csv` — `Instrument,Trade Date,PnL ($),Risk ($)`

**Account & R-unit (stated, not hidden):**
- Account size = **£10,000**; risk per trade = **1 % = £100** (the `Risk ($)` column).
- **R-unit = the per-trade stop distance = 0.5 × D1 ATR(14)**, which is
  volatility-scaled and therefore varies per trade — so the R-multiple column is
  **not** a relabelling of the % Return column (the degenerate case is avoided).
- **MAE** is read off the real M1 intra-trade path (worst adverse excursion between
  fill and exit), never approximated from the close.

## Summary
- `results.json`        — full per-pair + pooled metrics, byYear/byMonth, split date.
- `per_pair_metrics.csv`— per-pair metrics table.
- `equity.json`         — pooled cumulative-R equity curve (per trade, chronological).
- `heatmap.json`        — net R by year and by month.
- `proof_gbpusd_chartdata.json` — candles + trades + zoomed trade behind `../trade_proof_gbpusd.png`.
