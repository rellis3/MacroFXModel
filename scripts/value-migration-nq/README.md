# value-migration-nq — standalone research module

A reproducible test of a NASDAQ intraday auction method (Fabio Valentini, as relayed by the owner 2026-11-10):
volume-profile **value migration** for direction, **delta / absorption** for confirmation, **repeated 1:1 scalps
or a box-trailing stop** for management. Standalone: nothing in MacroFXModel imports it.

- Pre-registration (hypotheses, exact definitions, power, gates): `forge/VALUE_MIGRATION_NQ_PREREG.md`
- Evidence report: `analysis/output/value-migration-nq/RESULTS.md`
- Dashboard: `analysis/output/value-migration-nq/dashboard.html` (open from disk)

## Run it

```bash
pip install pandas numpy scipy pyarrow          # matplotlib not needed
python scripts/value-migration-nq/fetch_data.py         # free NQ 1-min OHLCV 2015-2025 -> data/value-migration-nq/ (gitignored), sha256-checked
python scripts/value-migration-nq/tests/test_vmig.py    # profile, no-look-ahead, null and planted controls (~10 s)
python scripts/value-migration-nq/data_quality.py       # dataset checks + proxy-vs-true-delta validation
python scripts/value-migration-nq/run_study.py --mode power   # control-only counts / SE / MDE (reads no setup outcome)
python scripts/value-migration-nq/run_study.py --mode score   # the registered run (~15 min)
python scripts/value-migration-nq/run_grid.py           # 27-point grid, walk-forward, box size (~10 min, 4 cores)
python scripts/value-migration-nq/make_dashboard.py     # dashboard.html from the JSON outputs
```

Seed 20261110 everywhere. Outputs: `analysis/output/value-migration-nq/`.

## Layout

| File | What it does |
|---|---|
| `vmig/data.py` | Loading, RTH sessionisation (New York), session drops, the tier-T adapter `trades_to_minutes` for aggressor-flagged trades (Databento `trades`, NT8 ticks) |
| `vmig/profile.py` | Box volume profile: POC, 70% value area, VAH, VAL (uniform spread for OHLCV, exact for footprints) |
| `vmig/features.py` | Scales from the previous 20 sessions, delta proxy (bulk volume classification), boxes, migration, cumulative delta, delta acceleration, absorption (divergence and effort-vs-result), model states A_POC / A / B / C / D and price twins |
| `vmig/stats.py` | Forward outcomes, session-block bootstrap, signed-outcome cells, OLS with bootstrap, session-shift placebo, Holm, BH, MDE |
| `vmig/backtest.py` | Event-driven minute engine: pullback and continuation entries, 1:1, 2:1 and box-trailing exits, costs, conservative fills, matched random-entry replays |
| `vmig/metrics.py` | Win rate, PF, expectancy, average winner and loser, Sharpe and Sortino (all sessions, zero-filled), drawdown, MAE/MFE, long vs short, bootstrap CIs |
| `vmig/study.py` | Sample object, IS/OOS split, regime labels (ex-ante and ex-post) |
| `vmig/synthetic.py` | Synthetic sessions for null and planted-signal controls |

Every parameter is in `features.Params` and `backtest.Costs`. Changing one and re-running is a new, unregistered
variant: log it in a prereg amendment before reading its result.

## Data tiers: what each can answer

| Quantity | 1-min OHLCV (tier P, used here) | Tick trades + aggressor flag (tier T) | Order book (MBP-10 / MBO) |
|---|---|---|---|
| POC / VAH / VAL | approximate (volume spread over each minute's range) | exact footprint | exact |
| Value migration | yes | yes | yes |
| Bid/ask delta, cumulative delta, delta acceleration | **proxy only** (a function of price) | exact | exact |
| Absorption as aggression without price impact | **proxy only** (effort vs result, delta-proxy divergence) | yes | yes |
| Stacked imbalances, large prints | no | yes | yes |
| Passive absorption, iceberg refills, pulled liquidity | no | no | yes |

On the one NQ session in the repo with real per-minute buy/sell volume, the OHLCV delta proxy correlates 0.60 with
true delta at 15 minutes, but only 0.10 with the part of true delta that price does not explain. That part is the
absorption signal (`data_quality.json`).

To run tier T: build a minute frame with `trades_to_minutes(trades)` (columns `ts_utc, price, size, side`), pass
its footprint to `build_boxes(mins, B, footprint=fp)`, and run the same `states` / `run` calls. The Databento pull
script for NQ RTH trades is `oi_recon/databento_nq_rth_pull.py` (quote first: owner spend rule).

## Safeguards built in

- No look-ahead: every scale comes from previous sessions. A box is used only after its last minute closes, and
  entries fill at the next minute's open. The tests overwrite all data after a cutoff with garbage and require
  bit-identical earlier features and entries; a deliberately injected look-ahead fails them.
- Overlap: one position per strategy at a time. Overlapping statistical windows are handled by the session-block bootstrap.
- Chronological IS (2015–19) and OOS (2020–25), walk-forward, a parameter grid reported in full, block bootstrap,
  session-shift placebos, price twins, matched random entries.
- Known engine limit: stop fills assume no overshoot inside the minute (gross mode), and stop + target in the same
  minute resolves to the stop. The random-entry control shares both, so comparisons against it are unbiased.
