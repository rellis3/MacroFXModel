#!/usr/bin/env python3
"""motif_htf_sized.py — does sizing DOWN on a 1D-timeframe conflict improve
the portfolio, without touching entry selection or SL/TP at all?

`motif_multi_tf.py` found a real, fold-consistent effect: when the 1D
motif's direction CONFLICTS with the H1 signal, avg R drops to less than
half of when it AGREES (+0.055 vs +0.133) -- but CONFLICT trades stay net
positive, so a hard skip would throw away real expectancy. This tests the
calibrated alternative: keep every trade, just risk LESS on the ones an
independent read already says are lower-conviction.

Method (isolates ONE new variable -- position sizing -- same discipline
every other AnalogML check uses):
  1. Same FROZEN entry-selection grid (sl=20p/tp_r=1.5) `motif_portfolio_sim.py`
     already validated (Sharpe 1.61, max DD -55.1%, real diversification) --
     deliberately NOT stacked on top of the not-yet-fully-vetted adaptive
     SL/TP sizing, so a result here isn't confounded by two ideas moving
     at once.
  2. Same causal 1D-conflict bucketing as `motif_multi_tf.py` (imported,
     not re-implemented) -- most-recently-CONFIRMED 1D motif, known by the
     H1 entry's own confirm time, within a lookback window.
  3. Every trade gets a `size_mult`: 0.5 on CONFLICT, 1.0 on AGREE/NONE
     (deliberately NOT sizing UP on agreement -- motif_multi_tf.py only
     validated a conflict-side drag, sizing up on agreement is a separate,
     unvalidated claim). `pylego`-shared `simulate_portfolio` now reads
     this per-trade (see portfolio_sim.py's docstring update) -- every
     other caller that doesn't set it is unaffected.
  4. SAME motifs raced both ways: HTF-sized vs uniform sizing (all
     size_mult=1.0) -- isolates the sizing effect exactly.

Usage:
  python AnalogML/motif_htf_sized.py --all-pairs --risk-pct 0.01
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motif_multi_tf import DETECT_KW, htf_lean_at  # noqa: E402
from pattern_scan import load_bars  # noqa: E402
from portfolio_sim import (  # noqa: E402
    ALL_PAIRS,
    matched_utilization_benchmark,
    pairwise_correlation_summary,
    sharpe_and_dd,
    simulate_portfolio,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.barrier_race import Entry, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.motif_touch import detect_touch_motifs  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402


def build_pair_trades(pair: str, args: argparse.Namespace) -> list[dict]:
    """Dated frozen-grid trades for one pair, each carrying size_mult from
    the causal 1D-conflict read -- same {pair, entry_date, exit_date, r}
    contract portfolio_sim.py already consumes, plus size_mult."""
    h1 = load_bars(pair, args.timeframe)
    n_h1 = len(h1)
    atr_arr = compute_atr(h1, period=14)
    h1_motifs = detect_touch_motifs(h1, atr_arr, **DETECT_KW)
    last_possible = n_h1 - 1 - args.max_bars_ahead
    eligible = [m for m in h1_motifs if m.confirm_idx is not None and m.confirm_idx <= last_possible]
    if not eligible:
        return []

    htf_bars = load_bars(pair, args.htf)
    bar_duration = htf_bars.index[1] - htf_bars.index[0]
    htf_end = htf_bars.index + bar_duration
    htf_atr = compute_atr(htf_bars, period=14)
    htf_motifs = detect_touch_motifs(htf_bars, htf_atr, **DETECT_KW)
    htf_confirmed = sorted(
        [(m.confirm_idx, m.direction) for m in htf_motifs if m.confirm_idx is not None],
        key=lambda c: c[0])

    pip = pip_size(pair)
    sl_price = args.bench_sl_pips * pip
    cost_price = default_spread(pair)

    trades = []
    for m in eligible:
        entry_time = h1.index[m.confirm_idx]
        cutoff_idx_htf = int(htf_end.searchsorted(entry_time, side='right')) - 1
        lean = htf_lean_at(htf_confirmed, cutoff_idx_htf, args.htf_lookback_bars)
        if lean is None:
            size_mult = 1.0
        elif lean == m.direction:
            size_mult = 1.0
        else:
            size_mult = args.conflict_size_mult

        entry = Entry(idx=m.confirm_idx + 1, direction=m.direction)
        resolved = race_trades(h1, [entry], sl=sl_price, tp_r=args.bench_tp_r,
                               max_bars_ahead=args.max_bars_ahead, cost_price=cost_price,
                               min_bars_ahead=args.min_bars_ahead)
        if not resolved:
            continue
        t = resolved[0]
        trades.append({
            "pair": pair, "entry_date": h1.index[t["idx"]], "exit_date": h1.index[t["exit_idx"]],
            "r": t["r"], "size_mult": size_mult,
        })
    return trades


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None)
    p.add_argument("--all-pairs", action="store_true")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--htf", default="1D")
    p.add_argument("--htf-lookback-bars", type=int, default=20)
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--bench-sl-pips", type=float, default=20.0)
    p.add_argument("--bench-tp-r", type=float, default=1.5)
    p.add_argument("--conflict-size-mult", type=float, default=0.5)
    p.add_argument("--risk-pct", type=float, default=0.01)
    p.add_argument("--max-concurrent-risk-pct", type=float, default=0.05)
    args = p.parse_args()

    pairs = args.pairs.split(",") if args.pairs else (ALL_PAIRS if args.all_pairs else None)
    if not pairs:
        raise SystemExit("pass --pairs <a,b,c> or --all-pairs")

    print(f"[setup] {len(pairs)} pairs, HTF={args.htf}, conflict_size_mult={args.conflict_size_mult}, "
          f"risk={args.risk_pct:.2%}/trade")
    all_trades: list[dict] = []
    for pair in pairs:
        t = build_pair_trades(pair, args)
        all_trades.extend(t)
        n_conflict = sum(1 for x in t if x["size_mult"] < 1.0)
        print(f"  {pair:<8} {len(t):>5} trades ({n_conflict} downsized on 1D conflict)")

    if not all_trades:
        raise SystemExit("no trades generated")

    uniform_trades = [{**t, "size_mult": 1.0} for t in all_trades]

    for label, trades in (("HTF-SIZED (0.5x on 1D conflict)", all_trades),
                          ("UNIFORM SIZING (baseline, same motifs)", uniform_trades)):
        port = simulate_portfolio(trades, args.risk_pct, args.max_concurrent_risk_pct)
        stats = sharpe_and_dd(port["equity_curve"])
        corr = pairwise_correlation_summary(trades)
        print(f"\n== {label} == n={len(trades)}")
        print(f"  taken={port['taken']}  skipped(risk cap)={port['skipped']}  "
              f"total_return={stats['total_return']:.1%}  max_dd={stats['max_dd']:.1%}  "
              f"Sharpe={stats['sharpe']:.2f}  avg_utilization={port['avg_utilization']:.1%}")
        if corr is not None:
            print(f"  avg pairwise weekly-return correlation: {corr:+.3f}")

    n_conflict_total = sum(1 for t in all_trades if t["size_mult"] < 1.0)
    print(f"\n[coverage] {n_conflict_total}/{len(all_trades)} trades "
          f"({n_conflict_total / len(all_trades):.1%}) downsized on 1D conflict")
    print("\n[caveat] Isolates position SIZING only -- same entries, same SL/TP as the already-validated "
          "frozen-grid signal (motif_portfolio_sim.py). Only sizes DOWN on conflict, never up on "
          "agreement (that's a separate, unvalidated claim motif_multi_tf.py didn't test).")


if __name__ == "__main__":
    main()
