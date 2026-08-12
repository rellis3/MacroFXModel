#!/usr/bin/env python3
"""flag_scan_sweep.py — full pair-universe check + calendar IS/OOS split for
flag/pennant instances, same discipline as motif_scan.py's own 26-pair sweep
(see `MD files/LEGO_MODULES.md`'s AnalogML entry).

Two questions a single-pair `flag_scan.py` run can't answer on its own:
  1. Was the pair picked lucky? Runs the FROZEN default detector params
     (the JS engine's untouched defaults — not tuned on this data) across
     every locally-available pair and reports, per pair, whether the
     flag/pennant-confirmed direction beat the mechanical both-directions
     baseline and cleared PF>1.0, at ONE fixed sl/tp-r cell.
  2. Does it decay out of sample? Pools every pair's per-trade R (with its
     own real confirm-bar timestamp) into ONE table and splits it on a
     REAL calendar cutoff (not a fitted split) into IS/OOS.

Usage:
  python AnalogML/flag_scan_sweep.py --pairs gbpjpy,eurusd,audjpy,usdjpy
  python AnalogML/flag_scan_sweep.py --all-pairs
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

from pylego.barrier_race import Entry, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.flag_pennant import detect_flags_pennants  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402

ALL_PAIRS = [
    "audcad", "audchf", "audjpy", "audnzd", "audusd", "cadjpy", "chfjpy",
    "euraud", "eurcad", "eurchf", "eurgbp", "eurjpy", "eurnzd", "eurusd",
    "gbpaud", "gbpcad", "gbpchf", "gbpjpy", "gbpnzd", "gbpusd", "gold",
    "nzdjpy", "nzdusd", "usdcad", "usdchf", "usdjpy",
]


def _pair_trades(pair: str, timeframe: str, sl_pips: float, tp_r: float, cost: bool,
                 max_bars_ahead: int, min_bars_ahead: int) -> tuple[list[dict], list[dict]]:
    """Returns (signal_trades, baseline_trades) for one pair, each trade a
    dict with pair/confirm_time/r, using the FULL available history (no
    --eval-years window here -- the sweep's own IS/OOS split does that
    calendar work instead)."""
    bars = load_bars(pair, timeframe)
    atr_arr = compute_atr(bars, period=14)
    instances = detect_flags_pennants(bars, atr_arr)
    n = len(bars)
    last_possible = n - 1 - max_bars_ahead
    eligible = [fp for fp in instances if fp.confirm_idx <= last_possible]
    if not eligible:
        return [], []

    pip = pip_size(pair)
    sl_price = sl_pips * pip
    cost_price = default_spread(pair) if cost else 0.0

    signal_entries = [Entry(idx=fp.confirm_idx + 1, direction=fp.direction) for fp in eligible]
    baseline_entries = []
    for fp in eligible:
        baseline_entries.append(Entry(idx=fp.confirm_idx + 1, direction=1))
        baseline_entries.append(Entry(idx=fp.confirm_idx + 1, direction=-1))

    signal_raw = race_trades(bars, signal_entries, sl=sl_price, tp_r=tp_r,
                             max_bars_ahead=max_bars_ahead, cost_price=cost_price,
                             min_bars_ahead=min_bars_ahead)
    baseline_raw = race_trades(bars, baseline_entries, sl=sl_price, tp_r=tp_r,
                               max_bars_ahead=max_bars_ahead, cost_price=cost_price,
                               min_bars_ahead=min_bars_ahead)
    signal_trades = [{"pair": pair, "time": bars.index[t["idx"]], "r": t["r"]} for t in signal_raw]
    baseline_trades = [{"pair": pair, "time": bars.index[t["idx"]], "r": t["r"]} for t in baseline_raw]
    return signal_trades, baseline_trades


def run_sweep(pairs: list[str], timeframe: str, sl_pips: float, tp_r: float, cost: bool,
             oos_cutoff: str, max_bars_ahead: int, min_bars_ahead: int) -> dict:
    per_pair_rows = []
    all_signal: list[dict] = []
    all_baseline: list[dict] = []
    for pair in pairs:
        try:
            signal_trades, baseline_trades = _pair_trades(
                pair, timeframe, sl_pips, tp_r, cost, max_bars_ahead, min_bars_ahead)
        except SystemExit as e:
            print(f"  [skip] {pair}: {e}")
            continue
        if not signal_trades:
            print(f"  [skip] {pair}: no eligible instances")
            continue
        sig_stats = summarize_r(t["r"] for t in signal_trades)
        base_stats = summarize_r(t["r"] for t in baseline_trades)
        per_pair_rows.append({
            "pair": pair, "n": sig_stats["n"],
            "signal_pf": sig_stats["profit_factor"], "baseline_pf": base_stats["profit_factor"],
            "beats_baseline": sig_stats["profit_factor"] > base_stats["profit_factor"],
            "pf_over_1": sig_stats["profit_factor"] > 1.0,
        })
        all_signal.extend(signal_trades)
        all_baseline.extend(baseline_trades)

    print(f"\n=== Per-pair (sl={sl_pips}p, tp_r={tp_r}, cost={'on' if cost else 'off'}) ===")
    print(f"  {'pair':>8}  {'n':>5}  {'signal_PF':>10}  {'baseline_PF':>12}  {'beats_base':>11}  {'PF>1':>5}")
    for row in per_pair_rows:
        print(f"  {row['pair']:>8}  {row['n']:>5d}  {row['signal_pf']:>10.2f}  {row['baseline_pf']:>12.2f}  "
              f"{str(row['beats_baseline']):>11}  {str(row['pf_over_1']):>5}")

    n_pairs = len(per_pair_rows)
    n_pf_over_1 = sum(1 for r in per_pair_rows if r["pf_over_1"])
    n_beats_baseline = sum(1 for r in per_pair_rows if r["beats_baseline"])
    print(f"\n{n_pf_over_1}/{n_pairs} pairs signal PF>1.0 ({n_pf_over_1/n_pairs:.1%}), "
          f"{n_beats_baseline}/{n_pairs} beat the mechanical baseline ({n_beats_baseline/n_pairs:.1%})" if n_pairs else "no pairs evaluated")
    losers = [r["pair"] for r in per_pair_rows if not r["pf_over_1"]]
    if losers:
        print(f"Negative (PF<=1.0): {', '.join(losers)}")

    # Pooled calendar IS/OOS split, real costs, all pairs together.
    cutoff = pd.Timestamp(oos_cutoff, tz="UTC")
    all_df = pd.DataFrame(all_signal)
    is_r = all_df.loc[all_df["time"] < cutoff, "r"]
    oos_r = all_df.loc[all_df["time"] >= cutoff, "r"]
    is_stats = summarize_r(is_r) if len(is_r) else None
    oos_stats = summarize_r(oos_r) if len(oos_r) else None
    print(f"\n=== Pooled calendar IS/OOS split (cutoff {oos_cutoff}, all {n_pairs} pairs, "
          f"sl={sl_pips}p, tp_r={tp_r}, cost={'on' if cost else 'off'}) ===")
    if is_stats:
        print(f"  IS  (< {oos_cutoff}): n={is_stats['n']:>6d}  PF={is_stats['profit_factor']:.2f}  "
              f"WR={is_stats['win_rate']:.1%}  avg_R={is_stats['avg_r']:.3f}")
    if oos_stats:
        print(f"  OOS (>={oos_cutoff}): n={oos_stats['n']:>6d}  PF={oos_stats['profit_factor']:.2f}  "
              f"WR={oos_stats['win_rate']:.1%}  avg_R={oos_stats['avg_r']:.3f}")

    return {"per_pair": per_pair_rows, "n_pf_over_1": n_pf_over_1, "n_beats_baseline": n_beats_baseline,
            "n_pairs": n_pairs, "is_stats": is_stats, "oos_stats": oos_stats}


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--pairs", help="comma-separated pair list")
    g.add_argument("--all-pairs", action="store_true")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--sl-pips", type=float, default=20.0)
    p.add_argument("--tp-r", type=float, default=1.5)
    p.add_argument("--oos-cutoff", default="2023-01-01")
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--cost", action="store_true", default=True)
    p.add_argument("--no-cost", dest="cost", action="store_false")
    return p


def main() -> None:
    args = build_parser().parse_args()
    pairs = ALL_PAIRS if args.all_pairs else [p.strip() for p in args.pairs.split(",")]
    run_sweep(pairs, args.timeframe, args.sl_pips, args.tp_r, args.cost,
             args.oos_cutoff, args.max_bars_ahead, args.min_bars_ahead)


if __name__ == "__main__":
    main()
