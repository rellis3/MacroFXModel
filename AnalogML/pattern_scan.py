#!/usr/bin/env python3
"""pattern_scan.py — historical-analog / "shape matching" evaluation.

Implements the analog-search idea plainly: normalize a window of price into a
price-level-free, unit-vol SHAPE (pylego.shape_match), search history for the
most similar shapes, and look at what happened after each one. The novelty
claimed for this idea is the retrieval method, not the exit — so outcomes are
scored with the SAME shared barrier walker every other SL/TP study in this
repo uses (pylego.barrier_race), never a second copy.

This is an EVALUATION, not a live signal generator: it walks a sample of
historical bars, and at each one asks "if I'd only used the shapes visible
BEFORE this bar to pick a direction, how would that have done" — a genuine
walk-forward test of the idea, not a demo of "here are today's analogs."

Method per query bar q:
  1. normalize_window(closes[q-window+1 : q+1])                  -> shape
  2. find_analogs(shape, ..., exclude_after=q)                   -> k neighbours
     strictly BEFORE q (no lookahead — this is the only leakage guard the
     shape_match brick owns; this script additionally never looks past `q`
     for anything else about that query either).
  3. race_trades on those neighbours, BOTH directions, one small "consensus"
     SL/TP cell -> average realised R long vs short across the neighbours.
     Direction = whichever side the neighbours did better on. This is the
     "63% of similar setups reached +1R before -1R" idea turned into an
     actual entry rule instead of a marketing sentence.
  4. That direction becomes ONE Entry at bar q+1, pooled with every other
     query's Entry into a single pylego.barrier_race.race_grid call — the
     honest aggregate report (n, total R, win rate, profit factor per
     tp_r cell).

Baseline (CLAUDE.md: "name the benchmark before claiming improvement"): the
SAME query bars, BOTH directions, mechanical (no shape signal at all) — Layer
1's own recipe (VolRangeForecaster/sltp_distribution.py), scored through the
same race_grid call. The analog signal only means something if it beats this,
on realistic costs, out of sample.

Usage:
  python pattern_scan.py --pair gbpjpy --timeframe 1h --window 64 --k 20 \
      --stride 24 --eval-years 2

Data: reads AnalogML/data/m1/<pair>_m1.parquet (must exist locally; topped
up by refresh_m1.py, R2-persisted there -- see its docstring). Moved off
VolRangeForecaster/data/m1/ on 2026-08-17: that directory is ALSO written
by js/volBacktestM1Engine.js's book-rebuild pipeline, in a different
parquet schema (a 'time' COLUMN vs. this pipeline's DatetimeIndex) --
sharing it was a live, undiscovered file-format collision between two
independently-built systems. AnalogML now owns its own copy entirely;
nothing here reads or writes VolRangeForecaster's directory anymore.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.analog_signal import neighbor_consensus  # noqa: E402
from pylego.barrier_race import Entry, race_grid, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.shape_match import rolling_shapes  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402

M1_DIR = REPO_ROOT / "AnalogML" / "data" / "m1"


def load_bars(pair: str, timeframe: str) -> pd.DataFrame:
    path = M1_DIR / f"{pair.lower()}_m1.parquet"
    if not path.exists():
        raise SystemExit(f"no local M1 data for {pair!r} at {path}")
    m1 = pd.read_parquet(path, columns=["open", "high", "low", "close"])
    bars = m1.resample(timeframe).agg(
        {"open": "first", "high": "max", "low": "min", "close": "last"}
    ).dropna()
    return bars


def pick_queries(n_bars: int, window: int, stride: int, eval_start_idx: int,
                 max_bars_ahead: int, min_candidates: int) -> list[int]:
    """End-bar indices (0-based, into `bars`) eligible as query points: far
    enough into the series to have `min_candidates` earlier windows to search,
    inside the evaluation region, and with enough forward runway left for the
    barrier race to resolve."""
    first_possible = max(window - 1 + min_candidates, eval_start_idx)
    last_possible = n_bars - 1 - max_bars_ahead
    return list(range(first_possible, last_possible, stride))


def scan(args: argparse.Namespace, verbose: bool = True) -> dict:
    """Runs the shape-matching evaluation and returns a results dict (used
    directly by the CLI and reused programmatically by pattern_scan_sweep.py
    so a parameter sweep doesn't reimplement this loop)."""
    bars = load_bars(args.pair, args.timeframe)
    n = len(bars)
    if verbose:
        print(f"[data] {args.pair} {args.timeframe}: {n} bars, {bars.index[0]} -> {bars.index[-1]}")

    closes = bars["close"].to_numpy()
    end_idx, shapes = rolling_shapes(closes, args.window)
    if verbose:
        print(f"[shapes] {len(end_idx)} normalized {args.window}-bar windows")

    eval_start_ts = bars.index[-1] - pd.Timedelta(days=args.eval_years * 365.25)
    eval_start_idx = int(bars.index.searchsorted(eval_start_ts))
    queries = pick_queries(n, args.window, args.stride, eval_start_idx,
                           args.max_bars_ahead, args.min_candidates)
    if not queries:
        raise SystemExit("no eligible query bars -- widen --eval-years or shrink --min-candidates")
    if verbose:
        print(f"[eval] {len(queries)} query bars from {bars.index[queries[0]]} to {bars.index[queries[-1]]} "
              f"(stride={args.stride})")

    pip = pip_size(args.pair)
    sl_price = args.sl_pips * pip
    cost_price = default_spread(args.pair) if args.cost else 0.0
    tp_r_grid = [float(x) for x in args.tp_r_grid.split(",")]

    end_idx_set_pos = {int(e): i for i, e in enumerate(end_idx)}

    signal_entries: list[Entry] = []
    baseline_entries: list[Entry] = []
    scored, skipped_flat, skipped_no_analogs = 0, 0, 0
    consensus_margins: list[float] = []
    signal_directions: list[int] = []

    for q in queries:
        baseline_entries.append(Entry(idx=q + 1, direction=1))
        baseline_entries.append(Entry(idx=q + 1, direction=-1))

        pos = end_idx_set_pos.get(q)
        if pos is None:
            skipped_flat += 1
            continue

        consensus = neighbor_consensus(
            bars, end_idx, shapes, shapes[pos], query_end=q,
            k=args.k, min_gap_bars=args.min_gap_bars,
            sl_price=sl_price, tp_r=args.consensus_tp_r, cost_price=cost_price,
            max_bars_ahead=args.max_bars_ahead, min_bars_ahead=args.min_bars_ahead,
        )
        if consensus.margin is None:
            skipped_no_analogs += 1
            continue
        consensus_margins.append(consensus.margin)
        if consensus.direction == 0:
            skipped_flat += 1
            signal_directions.append(0)
            continue
        signal_directions.append(consensus.direction)
        signal_entries.append(Entry(idx=q + 1, direction=consensus.direction))
        scored += 1

    if verbose:
        print(f"[signal] {scored} directional calls, {skipped_flat} flat (both sides non-positive), "
              f"{skipped_no_analogs} skipped (too few/degenerate analogs)")

    def _summarize(entries: list[Entry]) -> list[dict]:
        if not entries:
            return []
        grid = race_grid(bars, entries, sl_grid=[sl_price], tp_r_grid=tp_r_grid,
                         max_bars_ahead=args.max_bars_ahead, cost_price=cost_price,
                         min_bars_ahead=args.min_bars_ahead)
        rows = []
        for r in grid:
            trades = race_trades(bars, entries, sl=sl_price, tp_r=r.tp_r,
                                 max_bars_ahead=args.max_bars_ahead, cost_price=cost_price,
                                 min_bars_ahead=args.min_bars_ahead)
            rows.append({"tp_r": r.tp_r, **summarize_r(t["r"] for t in trades)})
        return rows

    def _print(label: str, rows: list[dict]) -> None:
        print(f"\n== {label} (sl={args.sl_pips}p, cost={'on' if args.cost else 'off'}) ==")
        if not rows:
            print("  (no entries)")
            return
        print(f"  {'tp_r':>6}  {'n':>6}  {'total_R':>9}  {'WR':>7}  {'PF':>6}  {'avg_R':>7}")
        for s in rows:
            print(f"  {s['tp_r']:>6.2f}  {s['n']:>6d}  {s['total_r']:>9.2f}  {s['win_rate']:>6.1%}  "
                  f"{s['profit_factor']:>6.2f}  {s['avg_r']:>7.3f}")

    baseline_rows = _summarize(baseline_entries)
    signal_rows = _summarize(signal_entries)
    if verbose:
        _print("BASELINE — mechanical, both directions, no shape signal", baseline_rows)
        _print("SIGNAL — analog-consensus direction", signal_rows)

    auc = None
    if len(consensus_margins) >= 10:
        try:
            from sklearn.metrics import roc_auc_score
            aligned_trades = race_trades(
                bars, signal_entries, sl=sl_price, tp_r=args.consensus_tp_r,
                max_bars_ahead=args.max_bars_ahead, cost_price=cost_price,
                min_bars_ahead=args.min_bars_ahead,
            )
            won = np.array([1 if t["r"] > 0 else 0 for t in aligned_trades])
            margins_for_signal = np.array(
                [abs(m) for m, d in zip(consensus_margins, signal_directions) if d != 0]
            )
            if len(won) == len(margins_for_signal) and len(set(won.tolist())) > 1:
                auc = float(roc_auc_score(won, margins_for_signal))
                if verbose:
                    print(f"\n[diagnostic] AUC of |neighbour long/short R margin| vs win/loss "
                          f"@ tp_r={args.consensus_tp_r}: {auc:.3f}  (0.5 = no discrimination)")
        except Exception as e:  # pragma: no cover - diagnostic only
            if verbose:
                print(f"[diagnostic] AUC calc skipped: {e}")

    if verbose:
        print("\n[caveat] one instrument, one window length, one k, unoptimised — a first honest "
              "read of the idea, not a validated edge (CLAUDE.md: built != works != has edge).")

    return {"baseline": baseline_rows, "signal": signal_rows, "auc": auc,
            "n_queries": len(queries), "scored": scored}


def build_parser() -> argparse.ArgumentParser:
    """Shared with pattern_scan_sweep.py: `build_parser().parse_args([...])`
    gets a fully-defaulted Namespace for programmatic use without a second
    copy of every default value."""
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pair", required=True)
    p.add_argument("--timeframe", default="1h", help="pandas resample rule, e.g. 1h, 4h, D")
    p.add_argument("--window", type=int, default=64, help="bars per shape window")
    p.add_argument("--k", type=int, default=20, help="neighbours per query")
    p.add_argument("--min-gap-bars", type=int, default=0,
                   help="min bar gap between chosen neighbours (default = --window)")
    p.add_argument("--stride", type=int, default=24, help="bars between query points")
    p.add_argument("--eval-years", type=float, default=2.0, help="evaluate only the last N years")
    p.add_argument("--min-candidates", type=int, default=2000,
                   help="min historical windows required before a bar is eligible as a query")
    p.add_argument("--sl-pips", type=float, default=20.0)
    p.add_argument("--tp-r-grid", default="1.0,1.5,2.0,3.0")
    p.add_argument("--consensus-tp-r", type=float, default=1.5,
                   help="tp_r used only to score neighbour consensus direction")
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--cost", action="store_true", default=True)
    p.add_argument("--no-cost", dest="cost", action="store_false")
    return p


def main() -> None:
    args = build_parser().parse_args()
    if args.min_gap_bars <= 0:
        args.min_gap_bars = args.window
    scan(args)


if __name__ == "__main__":
    main()
