#!/usr/bin/env python3
"""motif_portfolio_sim.py — does the touches motif's edge survive being a
PORTFOLIO? Same question `AnalogML/portfolio_sim.py` asked for the retired
k-NN method, now asked of `motif_scan.py`'s signal — the outstanding
validation debt flagged since that method's first read (see
`MD files/LEGO_MODULES.md`'s AnalogML entry: "Still not portfolio-tested
(task pending) and still just one sl/tp-r cell").

Uses the SAME shared portfolio-simulation engine as the k-NN check
(`pylego.portfolio_sim`) — no second implementation of the event-driven
account/risk-cap/benchmark logic, only the trade-building step differs
(touch-motif detection instead of shape-matching consensus).

Supports `--n-touches` to test the sharper, disaggregation-confirmed
subset (doubles only, n_touches=2 — see the AnalogML entry's "lifecycle
disaggregation" note: doubles carry almost all of the edge, triples read
close to a coin flip both IS and OOS) alongside the full pooled signal,
since testing the diluted full signal alone would understate what's
actually been validated.

Usage:
  python AnalogML/motif_portfolio_sim.py --all-pairs --risk-pct 0.01
  python AnalogML/motif_portfolio_sim.py --all-pairs --n-touches 2 --risk-pct 0.01
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pattern_scan import load_bars  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.barrier_race import Entry, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.motif_touch import detect_touch_motifs  # noqa: E402
from pylego.portfolio_sim import (  # noqa: E402
    matched_utilization_benchmark,
    pairwise_correlation_summary,
    sharpe_and_dd,
    simulate_portfolio,
)
from pylego.swing_structure import atr as compute_atr  # noqa: E402

ALL_PAIRS = [
    "audcad", "audchf", "audjpy", "audnzd", "audusd", "cadjpy", "chfjpy",
    "euraud", "eurcad", "eurchf", "eurgbp", "eurjpy", "eurnzd", "eurusd",
    "gbpaud", "gbpcad", "gbpchf", "gbpjpy", "gbpnzd", "gbpusd", "gold",
    "nzdjpy", "nzdusd", "usdcad", "usdchf", "usdjpy",
]


def build_pair_trades(pair: str, args: argparse.Namespace) -> list[dict]:
    """Dated trades for one pair: {pair, entry_date, exit_date, r,
    n_touches}. Same causal touch-motif confirmed-direction call as
    motif_scan.py's SIGNAL rows, just carrying real dates instead of only
    pooled stats, and evaluated over the FULL available history (not
    eval-years-limited) so the portfolio simulation sees as many concurrent
    opportunities as actually happened."""
    bars = load_bars(pair, args.timeframe)
    n = len(bars)
    atr_arr = compute_atr(bars, period=args.atr_period)
    motifs = detect_touch_motifs(
        bars, atr_arr, pivot_n=args.pivot_n, tol_atr_mult=args.tol_atr_mult,
        min_retrace_atr_mult=args.min_retrace_atr_mult,
        min_bars_between_touches=args.min_bars_between_touches,
        breakout_max_bars=args.breakout_max_bars,
    )
    last_possible = n - 1 - args.max_bars_ahead
    eligible = [m for m in motifs if m.confirm_idx is not None and m.confirm_idx <= last_possible]
    if args.n_touches is not None:
        eligible = [m for m in eligible if m.n_touches == args.n_touches]

    pip = pip_size(pair)
    sl_price = args.sl_pips * pip
    cost_price = default_spread(pair) if args.cost else 0.0

    trades: list[dict] = []
    for m in eligible:
        entry = Entry(idx=m.confirm_idx + 1, direction=m.direction)
        resolved = race_trades(bars, [entry], sl=sl_price, tp_r=args.tp_r,
                               max_bars_ahead=args.max_bars_ahead, cost_price=cost_price,
                               min_bars_ahead=args.min_bars_ahead)
        if not resolved:
            continue
        t = resolved[0]
        trades.append({
            "pair": pair,
            "entry_date": bars.index[t["idx"]],
            "exit_date": bars.index[t["exit_idx"]],
            "r": t["r"],
            "n_touches": m.n_touches,
        })
    return trades


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None, help="comma-separated; default is --all-pairs")
    p.add_argument("--all-pairs", action="store_true", help="use every locally-available pair")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--atr-period", type=int, default=14)
    p.add_argument("--pivot-n", type=int, default=5)
    p.add_argument("--tol-atr-mult", type=float, default=1.2)
    p.add_argument("--min-retrace-atr-mult", type=float, default=2.5)
    p.add_argument("--min-bars-between-touches", type=int, default=10)
    p.add_argument("--breakout-max-bars", type=int, default=40)
    p.add_argument("--n-touches", type=int, default=None,
                   help="filter to only this touch count (e.g. 2 for doubles only); default: all")
    p.add_argument("--sl-pips", type=float, default=20.0)
    p.add_argument("--tp-r", type=float, default=1.5)
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--cost", action="store_true", default=True)
    p.add_argument("--no-cost", dest="cost", action="store_false")
    p.add_argument("--risk-pct", type=float, default=0.01, help="fraction of equity risked per trade")
    p.add_argument("--max-concurrent-risk-pct", type=float, default=0.05,
                   help="hard cap on total simultaneously-open risk, as a fraction of equity")
    args = p.parse_args()

    pairs = args.pairs.split(",") if args.pairs else ALL_PAIRS
    filt = f", n_touches={args.n_touches}" if args.n_touches is not None else " (all touch counts)"
    print(f"[setup] {len(pairs)} pairs, sl={args.sl_pips}p tp_r={args.tp_r}{filt}, "
          f"risk={args.risk_pct:.2%}/trade, max concurrent risk={args.max_concurrent_risk_pct:.2%}")

    all_trades: list[dict] = []
    per_pair_trades: dict[str, list[dict]] = {}
    for pair in pairs:
        t = build_pair_trades(pair, args)
        per_pair_trades[pair] = t
        all_trades.extend(t)
        print(f"  {pair:<8} {len(t):>4} trades")

    if not all_trades:
        raise SystemExit("no trades generated -- check pair data / filters")

    print(f"\n[portfolio] {len(all_trades)} total signals across {len(pairs)} pairs")
    port = simulate_portfolio(all_trades, args.risk_pct, args.max_concurrent_risk_pct)
    stats = sharpe_and_dd(port["equity_curve"])
    print(f"  taken={port['taken']}  skipped(risk cap)={port['skipped']}  "
          f"final_equity={port['final_equity']:.3f}x  total_return={stats['total_return']:.1%}  "
          f"max_dd={stats['max_dd']:.1%}  Sharpe={stats['sharpe']:.2f}  "
          f"avg_utilization={port['avg_utilization']:.1%}")

    corr = pairwise_correlation_summary(all_trades)
    if corr is not None:
        print(f"  avg pairwise weekly-return correlation across pairs: {corr:+.3f} "
              f"(0 = independent, 1 = same bet)")

    print(f"\n== benchmark A: same sizing ({args.risk_pct:.2%}/trade), ONE pair alone "
          f"(cap rarely binds -> LOWER utilization than the portfolio, not a fair comparison) ==")
    for bench_pair in pairs[:3]:
        bt = per_pair_trades.get(bench_pair, [])
        if not bt:
            continue
        bp = simulate_portfolio(bt, args.risk_pct, args.max_concurrent_risk_pct)
        bs = sharpe_and_dd(bp["equity_curve"])
        print(f"  {bench_pair:<8} n={len(bt):>4}  total_return={bs['total_return']:>7.1%}  "
              f"max_dd={bs['max_dd']:>7.1%}  Sharpe={bs['sharpe']:>5.2f}  "
              f"avg_utilization={bp['avg_utilization']:>5.1%}")

    print(f"\n== benchmark B: SAME AVERAGE UTILIZATION as the portfolio ({port['avg_utilization']:.1%}) -- "
          f"risk_pct scaled up per pair so capital deployed is genuinely comparable ==")
    for bench_pair in pairs[:3]:
        bt = per_pair_trades.get(bench_pair, [])
        if not bt:
            continue
        m = matched_utilization_benchmark(bt, args.risk_pct, port["avg_utilization"])
        if m["result"] is None:
            print(f"  {bench_pair:<8} (no trades / zero utilization, can't match)")
            continue
        r = m["result"]
        print(f"  {bench_pair:<8} n={len(bt):>4}  matched_risk={m['matched_risk_pct']:>6.2%}/trade  "
              f"total_return={r['total_return']:>7.1%}  max_dd={r['max_dd']:>7.1%}  Sharpe={r['sharpe']:>5.2f}  "
              f"achieved_utilization={m['achieved_utilization']:>5.1%}")

    print("\n[caveat] mark-to-close only (no intra-trade floating equity), fixed risk-% sizing "
          "(not vol-scaled per pair), no live spread variation, unoptimised parameters throughout. "
          "This tests whether the ALREADY-FOUND per-trade edge survives becoming a portfolio -- it "
          "does not re-validate the per-trade edge itself (see motif_scan.py's 26-pair sweep for that).")


if __name__ == "__main__":
    main()
