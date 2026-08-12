#!/usr/bin/env python3
"""motif_scan.py — N-touches-of-a-level structural motif evaluation.

Phase 3 of the AnalogML structural-motif build (see `MD files/LEGO_MODULES.md`'s
AnalogML entry, "null banked 2026-08-12"): the fixed-window k-NN shape-matching
method in `pattern_scan.py` tested null across the full 26-pair universe once
a self-adjacency bug was fixed. This is a genuinely different idea, not more
tuning of that null method — instead of comparing every 64-bar window to
every other window regardless of what either looks like, this recognizes a
SPECIFIC, NAMED structural event (2-3 touches of a level, a real retracement
between each) and only signals on the entry that event actually implies: the
close that confirms a direction after the last touch.

Method:
  1. `pylego.swing_structure.atr` + `pylego.motif_touch.detect_touch_motifs`
     scan the WHOLE pair history ONCE for double/triple top/bottom instances
     (regenerated from js/patternEngine.js's detectExtremesOneSide — see that
     module's docstring for why this doesn't need a per-query causal re-scan
     the way the k-NN method does: a touch-run's pivots/segments only ever
     reference bars between ITS OWN touches, never an unrelated future).
  2. Filter to motifs whose confirm_idx falls inside the evaluation window
     and has forward runway left for the barrier race.
  3. ONE Entry per confirmed motif, at confirm_idx+1 (same "enter next bar's
     open" convention as pattern_scan.py), in the CONFIRMED direction —
     whether that matched the "textbook" reversal or not (played_out is a
     diagnostic, not a filter: the entry is whatever the market actually
     confirmed).
  4. Raced through the SAME shared barrier walker (`pylego.barrier_race`)
     with the SAME frozen SL-pips/TP-R grid every other AnalogML check
     uses — isolating the ONE new variable (motif-based entry selection)
     instead of also introducing a new risk-sizing idea in the same test
     (that's Phase 1, deliberately deferred).

Baseline (CLAUDE.md: "name the benchmark before claiming improvement"): the
SAME confirm_idx+1 bars, BOTH directions, mechanical — same "opportunity
count, no signal" comparison pattern_scan.py uses, so a motif that just
happens to confirm at generically-favorable-volatility moments (regardless
of which direction it calls) doesn't get credited as real direction-picking.

Usage:
  python AnalogML/motif_scan.py --pair gbpjpy --timeframe 1h --eval-years 3

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
from pylego.motif_touch import detect_touch_motifs  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402


def scan(args: argparse.Namespace, verbose: bool = True) -> dict:
    """Runs the motif evaluation and returns a results dict (mirrors
    pattern_scan.py's scan() return shape so a future sweep script can reuse
    the same reporting/aggregation code)."""
    bars = load_bars(args.pair, args.timeframe)
    n = len(bars)
    if verbose:
        print(f"[data] {args.pair} {args.timeframe}: {n} bars, {bars.index[0]} -> {bars.index[-1]}")

    atr_arr = compute_atr(bars, period=args.atr_period)
    motifs = detect_touch_motifs(
        bars, atr_arr, pivot_n=args.pivot_n, tol_atr_mult=args.tol_atr_mult,
        min_retrace_atr_mult=args.min_retrace_atr_mult,
        min_bars_between_touches=args.min_bars_between_touches,
        breakout_max_bars=args.breakout_max_bars,
    )
    n_tops = sum(1 for m in motifs if m.is_top)
    n_bottoms = len(motifs) - n_tops
    n_confirmed = sum(1 for m in motifs if m.confirm_idx is not None)
    if verbose:
        print(f"[motifs] {len(motifs)} touch-runs found ({n_tops} tops, {n_bottoms} bottoms), "
              f"{n_confirmed} confirmed within {args.breakout_max_bars} bars "
              f"({n_confirmed / len(motifs):.1%} resolve rate)" if motifs else "[motifs] none found")

    eval_start_ts = bars.index[-1] - pd.Timedelta(days=args.eval_years * 365.25)
    eval_start_idx = int(bars.index.searchsorted(eval_start_ts))
    last_possible = n - 1 - args.max_bars_ahead

    eligible = [m for m in motifs if m.confirm_idx is not None
               and eval_start_idx <= m.confirm_idx <= last_possible]
    if verbose:
        print(f"[eval] {len(eligible)} motifs confirmed inside the last {args.eval_years}yr "
              f"with forward runway (from {len(motifs)} total)")
    if not eligible:
        raise SystemExit("no eligible confirmed motifs -- widen --eval-years or loosen thresholds")

    played_out_rate = sum(1 for m in eligible if m.played_out) / len(eligible)
    n_touches_2 = sum(1 for m in eligible if m.n_touches == 2)
    n_touches_3 = len(eligible) - n_touches_2
    if verbose:
        print(f"[eval] {played_out_rate:.1%} played out as the textbook reversal "
              f"(vs a 50% coin-flip baseline) -- {n_touches_2} double, {n_touches_3} triple")

    pip = pip_size(args.pair)
    sl_price = args.sl_pips * pip
    cost_price = default_spread(args.pair) if args.cost else 0.0
    tp_r_grid = [float(x) for x in args.tp_r_grid.split(",")]

    signal_entries = [Entry(idx=m.confirm_idx + 1, direction=m.direction) for m in eligible]
    baseline_entries = []
    for m in eligible:
        baseline_entries.append(Entry(idx=m.confirm_idx + 1, direction=1))
        baseline_entries.append(Entry(idx=m.confirm_idx + 1, direction=-1))

    # NOTE: near-identical to pattern_scan.py's/backtest_export.py's/
    # portfolio_sim.py's own per-entries-list summarize helper -- a real
    # candidate for consolidation into a shared pylego brick (4th copy now),
    # not done here since this build is about proving the idea has signal
    # first, not a refactor pass.
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
        _print("SIGNAL — motif-confirmed direction", signal_rows)
        print("\n[caveat] one pair, unoptimised thresholds, one sl/tp-r grid, no adaptive "
              "stop/target (Phase 1, deliberately deferred) — a first honest read of the "
              "idea, not a validated edge (CLAUDE.md: built != works != has edge).")

    return {"baseline": baseline_rows, "signal": signal_rows, "n_motifs": len(motifs),
            "n_confirmed": n_confirmed, "n_eligible": len(eligible),
            "played_out_rate": played_out_rate}


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pair", required=True)
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--eval-years", type=float, default=2.0)
    p.add_argument("--atr-period", type=int, default=14)
    p.add_argument("--pivot-n", type=int, default=5, help="pivot-detection half-window (bars either side)")
    p.add_argument("--tol-atr-mult", type=float, default=1.2, help="how close touches must be, in ATR")
    p.add_argument("--min-retrace-atr-mult", type=float, default=2.5,
                   help="min genuine pullback between touches, in ATR")
    p.add_argument("--min-bars-between-touches", type=int, default=10)
    p.add_argument("--breakout-max-bars", type=int, default=40,
                   help="bars to wait for a breakout confirmation after the last touch")
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
