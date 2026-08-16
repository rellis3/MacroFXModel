#!/usr/bin/env python3
"""portfolio_sim.py — does the shape-matching edge survive being a PORTFOLIO?

pattern_scan_sweep.py answered "is the per-trade edge real and broad" (yes,
26/26 pairs positive on the overlapping check, 25/26 independent). That says
nothing about what happens when a real account tries to trade all 26 pairs
at once: FX pairs share currency legs (EURUSD/EURGBP/EURJPY all carry EUR
risk), so 26 "independent" positive-PF pairs can still combine into a much
smaller number of EFFECTIVE bets, and stacking correlated risk without a cap
is how a real per-trade edge turns into a real drawdown. This is that check.

Method:
  1. For every pair, walk NON-OVERLAPPING query windows (stride == window --
     the independent-trials setting from pattern_scan_sweep.py, so a trade
     here is a genuinely separate signal, not the same window shifted a few
     bars) and take the analog-consensus direction exactly like
     pattern_scan.py, via the SAME shared bricks (pylego.analog_signal,
     pylego.barrier_race) -- no second signal implementation.
  2. Every trade gets a real entry date AND exit date (from race_trades'
     bars_held) so trades across different pairs can be merged chronologically
     -- this is what pattern_scan.py's aggregate stats never needed to do.
  3. Simulate ONE account: risk `--risk-pct` of current equity per trade
     (sized at entry, crystallized at exit -- standard sequencing, not
     mark-to-market), but REFUSE a new entry if total currently-open risk
     would exceed `--max-concurrent-risk-pct` (a real capital constraint, not
     an unlimited-leverage fantasy). Skipped trades are counted and reported,
     never silently dropped.
  4. Report Sharpe / max drawdown / total return on the pooled account, a
     same-sizing single-pair benchmark for comparison (CLAUDE.md: "name the
     benchmark before claiming improvement" -- diversification only means
     something next to the concentrated alternative), and the average
     pairwise correlation of pairs' weekly returns (a cheap "how independent
     are these 26 bets, really" check).

Usage:
  python AnalogML/portfolio_sim.py --pairs gbpjpy,eurusd,audjpy,usdjpy --risk-pct 0.01
  python AnalogML/portfolio_sim.py --all-pairs --risk-pct 0.005 --max-concurrent-risk-pct 0.05
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pattern_scan import load_bars, pick_queries  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.analog_signal import neighbor_consensus  # noqa: E402
from pylego.barrier_race import Entry, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.portfolio_sim import (  # noqa: E402
    matched_utilization_benchmark,
    pairwise_correlation_summary,
    sharpe_and_dd,
    simulate_portfolio,
)
from pylego.shape_match import rolling_shapes  # noqa: E402

ALL_PAIRS = [
    "audcad", "audchf", "audjpy", "audnzd", "audusd", "cadjpy", "chfjpy",
    "euraud", "eurcad", "eurchf", "eurgbp", "eurjpy", "eurnzd", "eurusd",
    "gbpaud", "gbpcad", "gbpchf", "gbpjpy", "gbpnzd", "gbpusd", "gold",
    "nzdjpy", "nzdusd", "usdcad", "usdchf", "usdjpy",
]


def build_pair_trades(pair: str, args: argparse.Namespace) -> list[dict]:
    """Dated trades for one pair: {pair, entry_date, exit_date, r}. Same
    causal analog-consensus direction call as pattern_scan.py's SIGNAL rows,
    just walked with stride == window (non-overlapping / independent, the
    stricter config) and carrying real dates instead of only pooled stats."""
    bars = load_bars(pair, args.timeframe)
    n = len(bars)
    closes = bars["close"].to_numpy()
    end_idx, shapes = rolling_shapes(closes, args.window)
    end_idx_set_pos = {int(e): i for i, e in enumerate(end_idx)}

    eval_start_ts = bars.index[-1] - pd.Timedelta(days=args.eval_years * 365.25)
    eval_start_idx = int(bars.index.searchsorted(eval_start_ts))
    queries = pick_queries(n, args.window, args.window, eval_start_idx,
                           args.max_bars_ahead, args.min_candidates)

    pip = pip_size(pair)
    sl_price = args.sl_pips * pip
    cost_price = default_spread(pair) if args.cost else 0.0

    trades: list[dict] = []
    for q in queries:
        pos = end_idx_set_pos.get(q)
        if pos is None:
            continue
        consensus = neighbor_consensus(
            bars, end_idx, shapes, shapes[pos], query_end=q,
            k=args.k, min_gap_bars=args.window,
            sl_price=sl_price, tp_r=args.tp_r, cost_price=cost_price,
            max_bars_ahead=args.max_bars_ahead, min_bars_ahead=args.min_bars_ahead,
        )
        if consensus.direction == 0:
            continue
        entry = Entry(idx=q + 1, direction=consensus.direction)
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
        })
    return trades


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None, help="comma-separated; default is --all-pairs")
    p.add_argument("--all-pairs", action="store_true", help="use every locally-available pair")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--window", type=int, default=64)
    p.add_argument("--k", type=int, default=20)
    p.add_argument("--eval-years", type=float, default=3.0)
    p.add_argument("--min-candidates", type=int, default=2000)
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
    print(f"[setup] {len(pairs)} pairs, window={args.window} k={args.k} (non-overlapping/independent "
          f"trades), risk={args.risk_pct:.2%}/trade, max concurrent risk={args.max_concurrent_risk_pct:.2%}")

    all_trades: list[dict] = []
    per_pair_trades: dict[str, list[dict]] = {}
    for pair in pairs:
        t = build_pair_trades(pair, args)
        per_pair_trades[pair] = t
        all_trades.extend(t)
        print(f"  {pair:<8} {len(t):>4} trades")

    if not all_trades:
        raise SystemExit("no trades generated -- check pair data / eval-years")

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

    print("\n[read this] Benchmark A is the one that made the portfolio look like it wins on both "
          "return AND drawdown -- but it wasn't running at the same capital utilization, so that "
          "comparison was confounded. Benchmark B fixes that: it's what a single pair looks like "
          "risking enough per trade to deploy the SAME average fraction of the account as the "
          "portfolio actually does. Whatever gap remains between the portfolio and benchmark B is "
          "the real diversification effect (or lack of it) -- not a capital-deployed illusion.")

    print("\n[caveat] mark-to-close only (no intra-trade floating equity), fixed risk-% sizing "
          "(not vol-scaled per pair), no live spread variation, unoptimised parameters throughout. "
          "This tests whether the ALREADY-FOUND per-trade edge survives becoming a portfolio -- it "
          "does not re-validate the per-trade edge itself (see pattern_scan_sweep.py for that).")


if __name__ == "__main__":
    main()
