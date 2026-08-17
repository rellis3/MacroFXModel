#!/usr/bin/env python3
"""head_shoulders_scan.py — head & shoulders (regular + inverse) evaluation.

Second additional shape family beyond N-touches-of-a-level in the owner's
full "shape prediction" ask (flags/pennants was the first — see
`MD files/LEGO_MODULES.md`'s AnalogML entry). Same honest-harness pattern as
`motif_scan.py`/`flag_scan.py`:

  1. `pylego.swing_structure.atr` + `pylego.head_shoulders.detect_head_shoulders`
     scan the WHOLE pair history ONCE for regular (bearish) and inverse
     (bullish) head & shoulders instances.
  2. Filter to instances whose confirm_idx falls inside the evaluation
     window and has forward runway left for the barrier race.
  3. ONE Entry per confirmed instance, at confirm_idx+1, in the CONFIRMED
     direction — whether that matched the pattern's "textbook" reversal or
     not (played_out is a diagnostic, not a filter).
  4. Raced through the SAME shared barrier walker (`pylego.barrier_race`)
     with the SAME frozen SL-pips/TP-R grid every other AnalogML check uses.

Baseline: the SAME confirm_idx+1 bars, BOTH directions, mechanical.

Usage:
  python AnalogML/head_shoulders_scan.py --pair gbpjpy --timeframe 1h --eval-years 3

Data: reads AnalogML/data/m1/<pair>_m1.parquet (must exist locally -- see
pattern_scan.py's docstring for why this moved off
VolRangeForecaster/data/m1/ on 2026-08-17).
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
from pylego.head_shoulders import detect_head_shoulders  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402


def scan(args: argparse.Namespace, verbose: bool = True) -> dict:
    bars = load_bars(args.pair, args.timeframe)
    n = len(bars)
    if verbose:
        print(f"[data] {args.pair} {args.timeframe}: {n} bars, {bars.index[0]} -> {bars.index[-1]}")

    atr_arr = compute_atr(bars, period=args.atr_period)
    instances = detect_head_shoulders(
        bars, atr_arr, pivot_n=args.pivot_n, head_min_atr_mult=args.head_min_atr_mult,
        shoulder_tol_atr_mult=args.shoulder_tol_atr_mult,
        shoulder_prominence_atr_mult=args.shoulder_prominence_atr_mult,
        breakout_max_bars=args.breakout_max_bars,
    )
    if verbose:
        n_reg = sum(1 for hs in instances if not hs.is_inverse)
        n_inv = len(instances) - n_reg
        print(f"[instances] {len(instances)} found ({n_reg} regular, {n_inv} inverse)" if instances else "[instances] none found")

    eval_start_ts = bars.index[-1] - pd.Timedelta(days=args.eval_years * 365.25)
    eval_start_idx = int(bars.index.searchsorted(eval_start_ts))
    last_possible = n - 1 - args.max_bars_ahead

    eligible = [hs for hs in instances if eval_start_idx <= hs.confirm_idx <= last_possible]
    if verbose:
        print(f"[eval] {len(eligible)} instances confirmed inside the last {args.eval_years}yr "
              f"with forward runway (from {len(instances)} total)")
    if not eligible:
        raise SystemExit("no eligible confirmed instances -- widen --eval-years or loosen thresholds")

    played_out_rate = sum(1 for hs in eligible if hs.played_out) / len(eligible)
    if verbose:
        print(f"[eval] {played_out_rate:.1%} played out as the textbook reversal "
              f"(vs a 50% coin-flip baseline)")

    pip = pip_size(args.pair)
    sl_price = args.sl_pips * pip
    cost_price = default_spread(args.pair) if args.cost else 0.0
    tp_r_grid = [float(x) for x in args.tp_r_grid.split(",")]

    signal_entries = [Entry(idx=hs.confirm_idx + 1, direction=hs.direction) for hs in eligible]
    baseline_entries = []
    for hs in eligible:
        baseline_entries.append(Entry(idx=hs.confirm_idx + 1, direction=1))
        baseline_entries.append(Entry(idx=hs.confirm_idx + 1, direction=-1))

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
        _print("SIGNAL — head & shoulders-confirmed direction", signal_rows)
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
    p.add_argument("--head-min-atr-mult", type=float, default=1.5)
    p.add_argument("--shoulder-tol-atr-mult", type=float, default=2.0)
    p.add_argument("--shoulder-prominence-atr-mult", type=float, default=0.75)
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
