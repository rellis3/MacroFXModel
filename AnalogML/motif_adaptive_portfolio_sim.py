#!/usr/bin/env python3
"""motif_adaptive_portfolio_sim.py — does the adaptive per-category MAE/MFE
sizing (`motif_adaptive.py`) survive becoming a 26-pair portfolio the same
way the frozen-grid entry signal already did (`motif_portfolio_sim.py`:
Sharpe 1.61, max DD -55.1%, avg pairwise correlation +0.012)?

Trade-level, motif_adaptive.py found a real but modest win (PF 1.227/avgR
+0.115 vs the frozen grid's 1.174/+0.098, 6/11 folds better) -- this is the
portfolio-level follow-up flagged as not-yet-done in that build. Reuses
`motif_adaptive.py`'s causal sizing pipeline (`collect_pair_motifs`) and
`portfolio_sim.py`'s account simulator (`simulate_portfolio`,
`sharpe_and_dd`, `matched_utilization_benchmark`,
`pairwise_correlation_summary`) verbatim -- the only new code here is
turning motif_adaptive.py's per-trade R into portfolio_sim.py's
{pair, entry_date, exit_date, r} contract, for BOTH the adaptive sizing AND
the same-motifs frozen-grid benchmark, so the portfolio comparison isolates
sizing the same way the trade-level comparison did.

Usage:
  python AnalogML/motif_adaptive_portfolio_sim.py --all-pairs --risk-pct 0.01
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motif_adaptive import collect_pair_motifs  # noqa: E402
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

from pylego.barrier_race import Entry, VariableEntry, race_trades, race_trades_variable  # noqa: E402


def build_dated_trades(all_motifs: list[dict], bars_by_pair: dict, args: argparse.Namespace):
    """Same causal global-timeline sizing as motif_adaptive.py's
    size_and_race, but emits DATED trades (entry_date, exit_date, r) for
    BOTH the adaptive sizing and the same-motifs frozen-grid benchmark --
    portfolio_sim.py's simulate_portfolio needs real dates to merge trades
    across pairs chronologically, which motif_adaptive.py's own aggregate
    stats never needed."""
    all_motifs = sorted(all_motifs, key=lambda m: m['confirm_time'])
    pool: dict[tuple, list[float]] = defaultdict(list)
    pool_mfe: dict[tuple, list[float]] = defaultdict(list)
    adaptive_trades: list[dict] = []
    frozen_trades: list[dict] = []
    n_skipped = 0

    for m in all_motifs:
        cat = m['category']
        mae_pool, mfe_pool = pool[cat], pool_mfe[cat]
        if len(mae_pool) < args.min_pool:
            n_skipped += 1
        else:
            sl_atr_mult = float(np.percentile(mae_pool, args.sl_pctile))
            tp_atr_mult = float(np.percentile(mfe_pool, args.tp_pctile))
            sl_price = sl_atr_mult * m['entry_atr']
            tp_dist = tp_atr_mult * m['entry_atr']
            if sl_price > 0 and tp_dist > 0:
                bars = bars_by_pair[m['pair']]
                a_entry_obj = VariableEntry(idx=m['entry_idx'], direction=m['direction'],
                                            sl=sl_price, tp_dist=tp_dist)
                a_trade = race_trades_variable(bars, [a_entry_obj], max_bars_ahead=args.max_bars_ahead,
                                               cost_price=m['cost_price'], min_bars_ahead=args.min_bars_ahead)
                bench_sl = args.bench_sl_pips * m['pip']
                b_entry = Entry(idx=m['entry_idx'], direction=m['direction'])
                b_trade = race_trades(bars, [b_entry], sl=bench_sl, tp_r=args.bench_tp_r,
                                      max_bars_ahead=args.max_bars_ahead, cost_price=m['cost_price'],
                                      min_bars_ahead=args.min_bars_ahead)
                if a_trade and b_trade:
                    at, bt = a_trade[0], b_trade[0]
                    adaptive_trades.append({'pair': m['pair'], 'entry_date': bars.index[at['idx']],
                                            'exit_date': bars.index[at['exit_idx']], 'r': at['r']})
                    frozen_trades.append({'pair': m['pair'], 'entry_date': bars.index[bt['idx']],
                                          'exit_date': bars.index[bt['exit_idx']], 'r': bt['r']})
        mae_pool.append(m['mae_atr'])
        mfe_pool.append(m['mfe_atr'])
    return adaptive_trades, frozen_trades, n_skipped


def _report_one(label: str, trades: list[dict], args: argparse.Namespace) -> dict:
    per_pair: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        per_pair[t['pair']].append(t)

    port = simulate_portfolio(trades, args.risk_pct, args.max_concurrent_risk_pct)
    stats = sharpe_and_dd(port['equity_curve'])
    corr = pairwise_correlation_summary(trades)
    print(f"\n== {label} == n={len(trades)}")
    print(f"  taken={port['taken']}  skipped(risk cap)={port['skipped']}  "
          f"total_return={stats['total_return']:.1%}  max_dd={stats['max_dd']:.1%}  "
          f"Sharpe={stats['sharpe']:.2f}  avg_utilization={port['avg_utilization']:.1%}")
    if corr is not None:
        print(f"  avg pairwise weekly-return correlation: {corr:+.3f}")
    return {'port': port, 'stats': stats, 'corr': corr, 'per_pair': per_pair}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None)
    p.add_argument("--all-pairs", action="store_true")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--atr-period", type=int, default=14)
    p.add_argument("--pivot-n", type=int, default=5)
    p.add_argument("--tol-atr-mult", type=float, default=1.2)
    p.add_argument("--min-retrace-atr-mult", type=float, default=2.5)
    p.add_argument("--min-bars-between-touches", type=int, default=10)
    p.add_argument("--breakout-max-bars", type=int, default=40)
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--excursion-bars", type=int, default=40)
    p.add_argument("--sl-pctile", type=float, default=35.0)
    p.add_argument("--tp-pctile", type=float, default=35.0)
    p.add_argument("--min-pool", type=int, default=50)
    p.add_argument("--bench-sl-pips", type=float, default=20.0)
    p.add_argument("--bench-tp-r", type=float, default=1.5)
    p.add_argument("--risk-pct", type=float, default=0.01)
    p.add_argument("--max-concurrent-risk-pct", type=float, default=0.05)
    args = p.parse_args()

    pairs = args.pairs.split(",") if args.pairs else (ALL_PAIRS if args.all_pairs else None)
    if not pairs:
        raise SystemExit("pass --pairs <a,b,c> or --all-pairs")

    print(f"[setup] {len(pairs)} pairs, sl_pctile={args.sl_pctile} tp_pctile={args.tp_pctile} "
          f"risk={args.risk_pct:.2%}/trade, max concurrent risk={args.max_concurrent_risk_pct:.2%}")
    all_motifs: list[dict] = []
    bars_by_pair = {}
    for pair in pairs:
        bars_by_pair[pair] = load_bars(pair, args.timeframe)
        m = collect_pair_motifs(pair, args)
        all_motifs.extend(m)
        print(f"  {pair:<8} {len(m):>5} eligible motifs")

    adaptive_trades, frozen_trades, n_skipped = build_dated_trades(all_motifs, bars_by_pair, args)
    print(f"\n[sizing] {len(adaptive_trades)} motifs sized+dated (SAME set both sides), "
          f"{n_skipped} skipped (category hadn't reached {args.min_pool} precedents yet)")

    a = _report_one("ADAPTIVE SIZING — portfolio", adaptive_trades, args)
    b = _report_one("FROZEN GRID (sl=20p/tp_r=1.5) — SAME motifs, portfolio", frozen_trades, args)

    print(f"\n[delta] Sharpe {a['stats']['sharpe']:.2f} vs {b['stats']['sharpe']:.2f}  |  "
          f"max_dd {a['stats']['max_dd']:.1%} vs {b['stats']['max_dd']:.1%}  |  "
          f"avg_utilization {a['port']['avg_utilization']:.1%} vs {b['port']['avg_utilization']:.1%}")

    print(f"\n== matched-utilization benchmark: adaptive-sized single pairs at the ADAPTIVE "
          f"portfolio's own {a['port']['avg_utilization']:.1%} utilization (first 3 pairs) ==")
    for bench_pair in pairs[:3]:
        bt = a['per_pair'].get(bench_pair, [])
        if not bt:
            continue
        m = matched_utilization_benchmark(bt, args.risk_pct, a['port']['avg_utilization'])
        if m['result'] is None:
            print(f"  {bench_pair:<8} (no trades / zero utilization, can't match)")
            continue
        r = m['result']
        print(f"  {bench_pair:<8} n={len(bt):>4}  matched_risk={m['matched_risk_pct']:>6.2%}/trade  "
              f"total_return={r['total_return']:>7.1%}  max_dd={r['max_dd']:>7.1%}  Sharpe={r['sharpe']:>5.2f}")

    print("\n[caveat] Same mark-to-close-only, fixed risk-% sizing, no live spread variation as "
          "portfolio_sim.py/motif_portfolio_sim.py. This tests whether the trade-level adaptive-sizing "
          "gain (motif_adaptive.py: PF 1.227/avgR +0.115 vs frozen 1.174/+0.098, 6/11 folds) survives "
          "becoming a portfolio -- it does not re-validate the sizing itself.")


if __name__ == "__main__":
    main()
