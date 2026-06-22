"""
sweep.py — multi-pair random-search sweep over the forecaster-backtest.html
config space, using the numba-jitted engine.py port (validated bit-identical
against the JS reference, see validate.py).

Methodology mirrors /tmp/test_friend_compare.mjs (the JS script that produced
the previously-discussed EUR/USD comparison against the friend's reported
"forexaster" numbers), generalized to run over every pair with local M1
parquet data:

  1. Load M1 data from --data-start through --hold-to.
  2. Compute daily bars, walk-forward GARCH/RS-EWMA forecasts (90-day warmup),
     ATR (14-period / 30-min, the un-optimized defaults), and momentum Z once
     per pair — these don't change across trials since atrPeriod/slAtrTfMin/
     warmupDays are excluded from the optimizer's search space.
  3. Run a baseline config (dirop / ATR stop / MFE trail) on TRAIN + HOLDOUT
     for context.
  4. Run --trials random-search trials on the TRAIN window only, using
     sampleTrialConfig's exact grid-snap sampling, with tpMode forced to
     --tp-mode (default 'none') and beAfterR forced random in [0.1, 3.0]
     (the same bias used in the validated friend-comparison run, since
     fixed-R/trailing-TP exits trivially blow up Calmar by capping every
     loss). Pass --tp-mode level to instead force the opposite-side
     structural-level target mode on every trial, as a separate comparison.
  5. Keep trials with >= --min-trades and a finite Calmar.
  6. Rank by Calmar twice: once unconstrained, once filtered to configs
     where the stop-loss actually fires on >= --sl-hit-min of trades (so
     the winner isn't just a stop so wide it never triggers).
  7. Take the #1 "real stop" TRAIN config, run it unchanged on HOLDOUT.
  8. Write one JSON file per pair to --out-dir, then a cross-pair
     results/summary.json + leaderboard.

Usage:
  python3 sweep.py --pairs all --trials 600 --workers 4
  python3 sweep.py --pairs eurusd,gbpusd,usdjpy --trials 300
  python3 sweep.py --summarize-only          # rebuild summary.json from
                                              # whatever per-pair files exist

Requires: numpy, pandas, pyarrow, numba  (pip install numpy pandas pyarrow numba)
"""

import argparse
import json
import math
import random
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import pandas as pd

import engine as E

HERE = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = HERE.parent / "VolRangeForecaster" / "data" / "m1"
DEFAULT_OUT_DIR = HERE / "results"

ALL_PAIRS = [
    "eurusd", "gbpusd", "usdjpy", "audusd", "nzdusd", "usdcad", "usdchf",
    "gbpjpy", "eurgbp", "eurjpy", "eurcad", "euraud", "eurchf", "eurnzd",
    "audjpy", "audcad", "audchf", "audnzd", "gbpaud", "gbpcad", "gbpchf",
    "gbpnzd", "cadjpy", "chfjpy", "nzdjpy", "gold",
]


def ts_of(date_str):
    return int(pd.Timestamp(date_str + "T00:00:00Z").timestamp())


def ts_of_eod(date_str):
    return int(pd.Timestamp(date_str + "T23:59:59Z").timestamp())


def exit_counts(reason):
    return {
        "SL": int((reason == E.EXIT_SL).sum()),
        "TP": int((reason == E.EXIT_TP).sum()),
        "TRAIL": int((reason == E.EXIT_TRAIL).sum()),
        "EOD": int((reason == E.EXIT_EOD).sum()),
    }


def stats_to_json(stats, reason):
    out = {k: (None if isinstance(v, float) and not math.isfinite(v) else v) for k, v in stats.items()}
    out["exits"] = exit_counts(reason)
    return out


def run_one(m1, atr_arr, mom_arr, fc_lookup, cfg, from_ts, to_ts, pip_size):
    entry_ts, exit_ts, pnl_pct, win, reason = E.run_backtest(m1, atr_arr, mom_arr, fc_lookup, cfg, from_ts, to_ts, pip_size)
    stats = E.compute_analytics(entry_ts, exit_ts, pnl_pct, win, reason)
    return stats, reason, len(pnl_pct)


def process_pair(pair, args):
    t_start = time.time()
    log = []

    def out(msg):
        line = f"[{pair}] {msg}"
        print(line, flush=True)
        log.append(line)

    parquet_path = Path(args.data_dir) / f"{pair}_m1.parquet"
    if not parquet_path.exists():
        out(f"SKIP — no data file at {parquet_path}")
        return None

    df = pd.read_parquet(parquet_path)
    df = df.loc[args.data_start: args.hold_to]
    if len(df) == 0:
        out("SKIP — no rows in requested date range")
        return None

    times = (df.index.values.astype("int64") // 1_000_000_000).astype(np.int64)
    opens = df["open"].values.astype(np.float64)
    highs = df["high"].values.astype(np.float64)
    lows = df["low"].values.astype(np.float64)
    closes = df["close"].values.astype(np.float64)
    out(f"loaded {len(df)} M1 bars ({args.data_start}..{args.hold_to})")

    asset_class = E.asset_class_for_pairkey(pair)
    pip_size = E.pip_size_for_pairkey(pair)

    day_keys, d_open, d_high, d_low, d_close = E.aggregate_daily(times, opens, highs, lows, closes)
    fc_valid, fc_hl75, fc_hlmed, fc_oc75, fc_ocmed = E.compute_walkforward_forecast_series(
        d_open, d_high, d_low, d_close, asset_class, min_warmup=90
    )
    fc_lookup = E.build_forecast_lookup(day_keys, fc_valid, fc_hl75, fc_hlmed, fc_oc75, fc_ocmed)

    base_cfg = dict(E.PARAM_DEFS)
    base_cfg.update(strategy="dirop", slMode="atr", tpMode="trail")

    atr_arr = E.compute_atr_for_tf(times, opens, highs, lows, closes, base_cfg["atrPeriod"], base_cfg["slAtrTfMin"])
    mom_arr = E.compute_momentum_z(closes)
    m1 = (times, opens, highs, lows, closes)

    train_ts = (ts_of(args.train_from), ts_of_eod(args.train_to))
    hold_ts = (ts_of(args.hold_from), ts_of_eod(args.hold_to))

    base_train_stats, base_train_reason, base_train_n = run_one(m1, atr_arr, mom_arr, fc_lookup, base_cfg, *train_ts, pip_size)
    base_hold_stats, base_hold_reason, base_hold_n = run_one(m1, atr_arr, mom_arr, fc_lookup, base_cfg, *hold_ts, pip_size)
    out(f"baseline (dirop/atr/trail) — TRAIN trades={base_train_n} "
        f"{'calmar='+format(base_train_stats['calmar'],'.2f') if base_train_stats else '(too few trades)'}  "
        f"HOLDOUT trades={base_hold_n} "
        f"{'calmar='+format(base_hold_stats['calmar'],'.2f') if base_hold_stats else '(too few trades)'}")

    rng = random.Random(args.seed + ALL_PAIRS.index(pair) if pair in ALL_PAIRS else args.seed)
    results = []
    t_opt0 = time.time()
    for trial in range(args.trials):
        trial_cfg = E.sample_trial_config(base_cfg, rng)
        trial_cfg["tpMode"] = args.tp_mode
        trial_cfg["beAfterR"] = round(0.1 + rng.random() * 2.9, 1)
        stats, reason, n_trades = run_one(m1, atr_arr, mom_arr, fc_lookup, trial_cfg, *train_ts, pip_size)
        if n_trades >= args.min_trades and stats is not None and math.isfinite(stats["calmar"]):
            results.append(dict(cfg=trial_cfg, stats=stats, reason=reason, n_trades=n_trades))
        if (trial + 1) % 50 == 0:
            elapsed = time.time() - t_opt0
            best = max((r["stats"]["calmar"] for r in results), default=float("nan"))
            out(f"trial {trial+1}/{args.trials} — {elapsed:.0f}s elapsed — {len(results)} valid — best calmar so far: {best:.2f}")

    out(f"optimizer loop done in {time.time()-t_opt0:.1f}s — {len(results)}/{args.trials} valid trials")

    results.sort(key=lambda r: r["stats"]["calmar"], reverse=True)
    top_unconstrained = results[: args.top_n]
    real_sl = [r for r in results if r["stats"]["slHitRate"] >= args.sl_hit_min]
    real_sl.sort(key=lambda r: r["stats"]["calmar"], reverse=True)
    top_real_sl = real_sl[: args.top_n]

    holdout_result = None
    if top_real_sl:
        winner_cfg = top_real_sl[0]["cfg"]
        hold_stats, hold_reason, hold_n = run_one(m1, atr_arr, mom_arr, fc_lookup, winner_cfg, *hold_ts, pip_size)
        out(f"HOLDOUT on #1 real-SL train winner — trades={hold_n} "
            f"{'calmar='+format(hold_stats['calmar'],'.2f') if hold_stats else '(too few trades)'}")
        holdout_result = dict(cfg=winner_cfg, stats=stats_to_json(hold_stats, hold_reason) if hold_stats else None, n_trades=hold_n)

    def pack(rlist):
        return [dict(cfg=r["cfg"], stats=stats_to_json(r["stats"], r["reason"]), n_trades=r["n_trades"]) for r in rlist]

    payload = dict(
        pair=pair, asset_class=asset_class, pip_size=pip_size,
        bars=len(df), trials=args.trials, valid_trials=len(results),
        elapsed_sec=round(time.time() - t_start, 1),
        baseline_train=dict(stats=stats_to_json(base_train_stats, base_train_reason) if base_train_stats else None, n_trades=base_train_n),
        baseline_hold=dict(stats=stats_to_json(base_hold_stats, base_hold_reason) if base_hold_stats else None, n_trades=base_hold_n),
        top_unconstrained=pack(top_unconstrained),
        top_real_sl=pack(top_real_sl),
        holdout=holdout_result,
        log=log,
    )

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{pair}_sweep.json"
    out_path.write_text(json.dumps(payload, indent=2))
    out(f"wrote {out_path} ({time.time()-t_start:.1f}s total)")
    return payload


def build_summary(args):
    out_dir = Path(args.out_dir)
    rows = []
    for p in out_dir.glob("*_sweep.json"):
        try:
            data = json.loads(p.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        winner = data.get("top_real_sl", [None])
        winner = winner[0] if winner else None
        hold = data.get("holdout")
        rows.append(dict(
            pair=data["pair"],
            train_calmar=winner["stats"]["calmar"] if winner else None,
            train_sharpe=winner["stats"]["sharpe"] if winner else None,
            train_trades=winner["n_trades"] if winner else None,
            hold_calmar=(hold["stats"]["calmar"] if hold and hold["stats"] else None),
            hold_sharpe=(hold["stats"]["sharpe"] if hold and hold["stats"] else None),
            hold_trades=hold["n_trades"] if hold else None,
            valid_trials=data.get("valid_trials"),
        ))
    rows.sort(key=lambda r: (r["hold_calmar"] is None, -(r["hold_calmar"] or 0)))
    (out_dir / "summary.json").write_text(json.dumps(rows, indent=2))

    print("\n=== CROSS-PAIR SUMMARY (sorted by holdout Calmar) ===")
    print(f"{'pair':8} {'trnCalmar':>10} {'trnSharpe':>10} {'trnTr':>6} {'holdCalmar':>11} {'holdSharpe':>11} {'holdTr':>7} {'valid':>6}")
    for r in rows:
        def f(x, n=2):
            return "n/a" if x is None else f"{x:.{n}f}"
        print(f"{r['pair']:8} {f(r['train_calmar']):>10} {f(r['train_sharpe']):>10} {str(r['train_trades']):>6} "
              f"{f(r['hold_calmar']):>11} {f(r['hold_sharpe']):>11} {str(r['hold_trades']):>7} {str(r['valid_trials']):>6}")
    print(f"\nwrote {out_dir / 'summary.json'}")


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pairs", default="all", help="Comma-separated pair keys (e.g. eurusd,gbpusd) or 'all'")
    ap.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    ap.add_argument("--trials", type=int, default=600)
    ap.add_argument("--min-trades", type=int, default=20)
    ap.add_argument("--sl-hit-min", type=float, default=0.15)
    ap.add_argument("--tp-mode", choices=["none", "level"], default="none",
                     help="TP mode forced for every random-search trial. 'none' (default) is the "
                          "established honest SL/EOD-only comparison. 'level' tests the opposite-side "
                          "structural-level target mode instead.")
    ap.add_argument("--top-n", type=int, default=5)
    ap.add_argument("--data-start", default="2017-09-01")
    ap.add_argument("--train-from", default="2018-01-01")
    ap.add_argument("--train-to", default="2023-12-31")
    ap.add_argument("--hold-from", default="2024-01-01")
    ap.add_argument("--hold-to", default="2026-04-30")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--workers", type=int, default=1, help="Parallel pairs via multiprocessing (1 = sequential)")
    ap.add_argument("--summarize-only", action="store_true", help="Skip backtesting; just rebuild summary.json from existing per-pair files")
    return ap.parse_args()


def main():
    args = parse_args()
    if args.summarize_only:
        build_summary(args)
        return

    pairs = ALL_PAIRS if args.pairs == "all" else [p.strip().lower() for p in args.pairs.split(",") if p.strip()]
    print(f"Sweeping {len(pairs)} pair(s): {', '.join(pairs)}")
    print(f"trials={args.trials} min_trades={args.min_trades} sl_hit_min={args.sl_hit_min} workers={args.workers}")

    t0 = time.time()
    if args.workers <= 1:
        for pair in pairs:
            process_pair(pair, args)
    else:
        with ProcessPoolExecutor(max_workers=args.workers) as ex:
            futs = {ex.submit(process_pair, pair, args): pair for pair in pairs}
            for fut in as_completed(futs):
                pair = futs[fut]
                try:
                    fut.result()
                except Exception as e:
                    print(f"[{pair}] FAILED: {e}", flush=True)

    print(f"\nAll pairs done in {time.time()-t0:.1f}s")
    build_summary(args)


if __name__ == "__main__":
    main()
