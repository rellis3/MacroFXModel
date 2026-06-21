# ForecasterOptimizer — multi-pair config sweep

A numba-jitted Python port of the backtest engine inlined in
`forecaster-backtest.html`, built to run the same random-search optimizer
across all 26 locally-available pairs without the per-trial overhead of a
browser/Node JS engine. `engine.py` is validated bit-identical to the JS
reference (see `validate.py`) — same trade-by-trade output, same analytics.

## Setup

```bash
cd ForecasterOptimizer
pip install -r requirements.txt
```

Needs the M1 parquet files already present in `../VolRangeForecaster/data/m1/`
(`<pair>_m1.parquet`, e.g. `eurusd_m1.parquet`) — these aren't tracked in git,
so make sure you've fetched them locally first (same data the HTML backtester
uses).

## Run

```bash
# all 26 pairs, 600 trials each, sequential
python3 sweep.py --pairs all --trials 600

# a handful of pairs in parallel (one process per pair)
python3 sweep.py --pairs eurusd,gbpusd,usdjpy,gold --trials 600 --workers 4

# rebuild the cross-pair leaderboard from existing results/ without rerunning
python3 sweep.py --summarize-only
```

`--workers N` runs N pairs concurrently via multiprocessing — use this if you
have spare cores, since the optimizer loop is single-threaded per pair.

### Timing

After numba's one-time JIT warmup (~5s on first call), a TRAIN-window trial
on EUR/USD's full 2018–2023 span (~2.1M M1 bars) runs in well under a second.
Budget roughly **1–2 min per 100 trials per pair** on the TRAIN window. At the
600-trial default that's ~5–10 min/pair sequentially, ~2–4 hrs for all 26
pairs with `--workers 1`, or proportionally less with more workers.

### What it does

Same methodology as the EUR/USD friend-comparison run already validated in
this repo's history:

1. Per pair: load M1 data, compute daily bars + walk-forward GARCH(1,1)/
   RS-EWMA forecasts (90-day warmup), 14-period/30-min ATR, momentum Z-score —
   all once, since `atrPeriod`/`slAtrTfMin`/`warmupDays` aren't part of the
   optimizer's search space.
2. Run a baseline config (`dirop` / ATR stop / MFE trail) on TRAIN + HOLDOUT
   for context.
3. Random-search `--trials` configs on the TRAIN window only, using the exact
   grid-snap sampling from `sampleTrialConfig` in the HTML page, with
   `tpMode` forced to `'none'` and `beAfterR` forced random in `[0.1, 3.0]`
   (fixed-R/trailing TP modes trivially inflate Calmar by capping every
   loss — forcing pure SL/EOD exits with a breakeven stop is the
   apples-to-apples comparison against a strategy that actually takes full
   stop-outs).
4. Rank by Calmar twice: unconstrained, and filtered to configs where the
   stop-loss fires on ≥15% of trades (`--sl-hit-min`) — otherwise the
   top-ranked config is often just a stop so wide it never triggers, which
   isn't a real risk control.
5. Take the #1 "real stop" TRAIN config and run it unchanged on HOLDOUT
   (2024–2026) — the honest out-of-sample number.

### Output

One JSON file per pair in `results/<pair>_sweep.json`:
`baseline_train`/`baseline_hold`, `top_unconstrained` (top 5 by Calmar),
`top_real_sl` (top 5 with a real stop, this is the one that matters),
`holdout` (the #1 real-stop config run on the holdout window), plus trial
counts and a console log.

`results/summary.json` + a printed leaderboard table aggregate every pair's
best holdout Calmar/Sharpe across pairs once the sweep finishes (or whenever
you run `--summarize-only`).

Send back `results/summary.json` and the `results/*_sweep.json` files (or
just the whole `results/` folder) for review.
