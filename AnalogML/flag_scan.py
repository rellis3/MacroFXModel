#!/usr/bin/env python3
"""flag_scan.py — flag/pennant structural-motif evaluation.

The first additional shape family beyond N-touches-of-a-level in the
owner's full "shape prediction" ask (see `MD files/LEGO_MODULES.md`'s
AnalogML entry): flags and pennants, per that ask's suggested build order
(minimal-DOF-first — validate ONE new family standalone on one timeframe
before multi-timeframe or adaptive sizing).

Method (same honest-harness pattern as `motif_scan.py`):
  1. `pylego.swing_structure.atr` + `pylego.flag_pennant.detect_flags_pennants`
     scan the WHOLE pair history ONCE for bull/bear flag AND pennant
     instances (regenerated from js/patternEngine.js's detectFlagsPennants —
     see that module's docstring for why this doesn't need a per-query
     causal re-scan the way the retired k-NN method did).
  2. Filter to instances whose confirm_idx falls inside the evaluation
     window and has forward runway left for the barrier race.
  3. ONE Entry per confirmed instance, at confirm_idx+1 (same "enter next
     bar's open" convention as pattern_scan.py/motif_scan.py), in the
     CONFIRMED direction — whether that matched the pole's "textbook"
     continuation or not (played_out is a diagnostic, not a filter).
  4. Raced through the SAME shared barrier walker (`pylego.barrier_race`)
     with the SAME frozen SL-pips/TP-R grid every other AnalogML check
     uses — isolating the ONE new variable (flag/pennant-based entry
     selection) instead of also introducing a new risk-sizing idea in the
     same test (that's Phase 1, deliberately deferred — see
     pylego/flag_pennant.py's docstring).

Baseline (CLAUDE.md: "name the benchmark before claiming improvement"): the
SAME confirm_idx+1 bars, BOTH directions, mechanical — same "opportunity
count, no signal" comparison pattern_scan.py/motif_scan.py use, so an
instance that just happens to confirm at generically-favorable-volatility
moments (regardless of which direction it calls) doesn't get credited as
real direction-picking.

Usage:
  python AnalogML/flag_scan.py --pair gbpjpy --timeframe 1h --eval-years 3

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
from pylego.flag_pennant import detect_flags_pennants  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402


def scan(args: argparse.Namespace, verbose: bool = True) -> dict:
    """Runs the flag/pennant evaluation and returns a results dict (mirrors
    motif_scan.py's scan() return shape so a sweep script can reuse the
    same reporting/aggregation code)."""
    bars = load_bars(args.pair, args.timeframe)
    n = len(bars)
    if verbose:
        print(f"[data] {args.pair} {args.timeframe}: {n} bars, {bars.index[0]} -> {bars.index[-1]}")

    atr_arr = compute_atr(bars, period=args.atr_period)
    instances = detect_flags_pennants(
        bars, atr_arr,
        pole_min_bars=args.pole_min_bars, pole_max_bars=args.pole_max_bars,
        pole_min_atr_mult=args.pole_min_atr_mult, pole_min_efficiency=args.pole_min_efficiency,
        consol_min_bars=args.consol_min_bars, consol_max_bars=args.consol_max_bars,
        consol_pivot_n=args.consol_pivot_n, max_retrace_pct=args.max_retrace_pct,
        breakout_max_bars=args.breakout_max_bars, parallel_tol_pct=args.parallel_tol_pct,
        flag_flat_slope_atr_frac=args.flag_flat_slope_atr_frac,
        touch_tol_pct=args.touch_tol_pct, min_touches_total=args.min_touches_total,
    )
    if verbose:
        by_label: dict[str, int] = {}
        for fp in instances:
            by_label[fp.label] = by_label.get(fp.label, 0) + 1
        label_str = ", ".join(f"{k}={v}" for k, v in sorted(by_label.items()))
        print(f"[instances] {len(instances)} found ({label_str})" if instances else "[instances] none found")

    eval_start_ts = bars.index[-1] - pd.Timedelta(days=args.eval_years * 365.25)
    eval_start_idx = int(bars.index.searchsorted(eval_start_ts))
    last_possible = n - 1 - args.max_bars_ahead

    eligible = [fp for fp in instances if eval_start_idx <= fp.confirm_idx <= last_possible]
    if verbose:
        print(f"[eval] {len(eligible)} instances confirmed inside the last {args.eval_years}yr "
              f"with forward runway (from {len(instances)} total)")
    if not eligible:
        raise SystemExit("no eligible confirmed instances -- widen --eval-years or loosen thresholds")

    played_out_rate = sum(1 for fp in eligible if fp.played_out) / len(eligible)
    n_flags = sum(1 for fp in eligible if "flag" in fp.label)
    n_pennants = len(eligible) - n_flags
    if verbose:
        print(f"[eval] {played_out_rate:.1%} played out as the pole's textbook continuation "
              f"(vs a 50% coin-flip baseline) -- {n_flags} flags, {n_pennants} pennants")

    pip = pip_size(args.pair)
    sl_price = args.sl_pips * pip
    cost_price = default_spread(args.pair) if args.cost else 0.0
    tp_r_grid = [float(x) for x in args.tp_r_grid.split(",")]

    signal_entries = [Entry(idx=fp.confirm_idx + 1, direction=fp.direction) for fp in eligible]
    baseline_entries = []
    for fp in eligible:
        baseline_entries.append(Entry(idx=fp.confirm_idx + 1, direction=1))
        baseline_entries.append(Entry(idx=fp.confirm_idx + 1, direction=-1))

    # NOTE: near-identical to motif_scan.py's/pattern_scan.py's own
    # per-entries-list summarize helper -- flagged there already as a real
    # consolidation candidate (not done here, same reasoning: proving the
    # idea has signal first, not a refactor pass).
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
        _print("SIGNAL — flag/pennant-confirmed direction", signal_rows)
        print("\n[caveat] one pair, unoptimised thresholds, one sl/tp-r grid, no adaptive "
              "stop/target (Phase 1, deliberately deferred) — a first honest read of the "
              "idea, not a validated edge (CLAUDE.md: built != works != has edge).")

    return {"baseline": baseline_rows, "signal": signal_rows, "n_instances": len(instances),
            "n_eligible": len(eligible), "played_out_rate": played_out_rate}


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pair", required=True)
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--eval-years", type=float, default=3.0)
    p.add_argument("--atr-period", type=int, default=14)
    p.add_argument("--pole-min-bars", type=int, default=4)
    p.add_argument("--pole-max-bars", type=int, default=20)
    p.add_argument("--pole-min-atr-mult", type=float, default=3.0)
    p.add_argument("--pole-min-efficiency", type=float, default=0.55)
    p.add_argument("--consol-min-bars", type=int, default=5)
    p.add_argument("--consol-max-bars", type=int, default=50)
    p.add_argument("--consol-pivot-n", type=int, default=2)
    p.add_argument("--max-retrace-pct", type=float, default=0.65)
    p.add_argument("--breakout-max-bars", type=int, default=30)
    p.add_argument("--parallel-tol-pct", type=float, default=0.35)
    p.add_argument("--flag-flat-slope-atr-frac", type=float, default=0.05)
    p.add_argument("--touch-tol-pct", type=float, default=0.003)
    p.add_argument("--min-touches-total", type=int, default=5)
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
