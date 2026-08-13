#!/usr/bin/env python3
"""triangle_channel_scan.py — triangles/wedges/channels evaluation.

Third additional shape family beyond N-touches-of-a-level in the owner's
full "shape prediction" ask (flags/pennants, head & shoulders came first —
see `MD files/LEGO_MODULES.md`'s AnalogML entry). ONE detector, seven shape
types (ascending/descending/symmetrical triangle, rising/falling wedge,
channel up/down) — see `pylego/triangle_channel.py`'s docstring for the
geometry. Same honest-harness pattern as every other AnalogML scan CLI.

Usage:
  python AnalogML/triangle_channel_scan.py --pair gbpjpy --timeframe 1h --eval-years 3

Data: reads VolRangeForecaster/data/m1/<pair>_m1.parquet (must exist locally).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pattern_scan import load_bars  # noqa: E402

from pylego.barrier_race import Entry, race_grid, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402
from pylego.triangle_channel import detect_triangles_channels  # noqa: E402


def scan(args: argparse.Namespace, verbose: bool = True) -> dict:
    bars = load_bars(args.pair, args.timeframe)
    n = len(bars)
    if verbose:
        print(f"[data] {args.pair} {args.timeframe}: {n} bars, {bars.index[0]} -> {bars.index[-1]}")

    atr_arr = compute_atr(bars, period=args.atr_period)
    instances = detect_triangles_channels(
        bars, atr_arr, pivot_n=args.pivot_n, window_bars=args.window_bars,
        min_touches_per_side=args.min_touches_per_side, touch_tol_pct=args.touch_tol_pct,
        flat_slope_atr_frac=args.flat_slope_atr_frac, breakout_max_bars=args.breakout_max_bars,
    )
    if verbose:
        by_type: dict[str, int] = {}
        for tc in instances:
            by_type[tc.shape_type] = by_type.get(tc.shape_type, 0) + 1
        print(f"[instances] {len(instances)} found ({by_type})" if instances else "[instances] none found")

    eval_start_ts = bars.index[-1] - pd.Timedelta(days=args.eval_years * 365.25)
    eval_start_idx = int(bars.index.searchsorted(eval_start_ts))
    last_possible = n - 1 - args.max_bars_ahead

    eligible = [tc for tc in instances if eval_start_idx <= tc.confirm_idx <= last_possible]
    if verbose:
        print(f"[eval] {len(eligible)} instances confirmed inside the last {args.eval_years}yr "
              f"with forward runway (from {len(instances)} total)")
    if not eligible:
        raise SystemExit("no eligible confirmed instances -- widen --eval-years or loosen thresholds")

    with_expectation = [tc for tc in eligible if tc.expected_direction is not None]
    played_out_rate = (sum(1 for tc in with_expectation if tc.played_out) / len(with_expectation)
                       if with_expectation else None)
    if verbose and played_out_rate is not None:
        print(f"[eval] {played_out_rate:.1%} played out as the textbook expectation "
              f"(vs a 50% coin-flip baseline, {len(with_expectation)}/{len(eligible)} instances "
              f"have a directional expectation -- symmetrical_triangle has none)")

    pip = pip_size(args.pair)
    sl_price = args.sl_pips * pip
    cost_price = default_spread(args.pair) if args.cost else 0.0
    tp_r_grid = [float(x) for x in args.tp_r_grid.split(",")]

    signal_entries = [Entry(idx=tc.confirm_idx + 1, direction=tc.direction) for tc in eligible]
    baseline_entries = []
    for tc in eligible:
        baseline_entries.append(Entry(idx=tc.confirm_idx + 1, direction=1))
        baseline_entries.append(Entry(idx=tc.confirm_idx + 1, direction=-1))

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
        _print("BASELINE — mechanical, both directions, same confirm-bar opportunities", baseline_rows)
        _print("SIGNAL — triangle/wedge/channel-confirmed direction", signal_rows)
        print("\n[caveat] one pair, unoptimised thresholds, one sl/tp-r grid, no adaptive "
              "stop/target — a first honest read of the idea, not a validated edge.")

    return {"baseline": baseline_rows, "signal": signal_rows, "n_instances": len(instances),
            "n_eligible": len(eligible), "played_out_rate": played_out_rate}


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pair", required=True)
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--eval-years", type=float, default=3.0)
    p.add_argument("--atr-period", type=int, default=14)
    p.add_argument("--pivot-n", type=int, default=5)
    p.add_argument("--window-bars", type=int, default=120)
    p.add_argument("--min-touches-per-side", type=int, default=3)
    p.add_argument("--touch-tol-pct", type=float, default=0.0025)
    p.add_argument("--flat-slope-atr-frac", type=float, default=0.02)
    p.add_argument("--breakout-max-bars", type=int, default=40)
    p.add_argument("--sl-pips", type=float, default=20.0)
    p.add_argument("--tp-r-grid", default="1.0,1.5,2.0,3.0")
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--cost", action="store_true", default=True)
    p.add_argument("--no-cost", dest="cost", action="store_false")
    return p


def main() -> None:
    args = build_parser().parse_args()
    scan(args)


if __name__ == "__main__":
    main()
