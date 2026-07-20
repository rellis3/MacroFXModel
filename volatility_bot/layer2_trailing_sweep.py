"""volatility_bot Layer 2 — trailing-exit sweep (dynamic-exit hypothesis B).

Hypothesis A (fixed SL/TP, conditioned on regime) found nothing distinguishable
from zero — see PYTHON_LEGO.md §8. This tests hypothesis B directly: Cog's real
payout shape (33% win rate, wins 2.6x losses) is a trend/let-winners-run
signature, structurally opposite to volatility_bot's fixed-target exit (~51%
win rate, wins < losses). A trailing exit — cut losers at a hard stop, let
winners run, only lock profit once ahead — is the shape that COULD reproduce
that signature from the SAME real entries.

Reuses the cached real entries from layer2_regime_split.py's cache (no M1
re-walk) and the shared pylego.barrier_race.race_trailing walker.

Usage:
  python volatility_bot/layer2_trailing_sweep.py --pair gold
  python volatility_bot/layer2_trailing_sweep.py --pair all --json-out VolRangeForecaster/data/vol_bot_trailing_sweep.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from pylego.costs import default_spread  # noqa: E402
from pylego.barrier_race import Entry, race_trailing  # noqa: E402
from volatility_bot.layer2_sltp_replay import load_plan, load_m1, resolve_available_pairs  # noqa: E402
from volatility_bot.layer2_regime_split import get_entries_cached  # noqa: E402

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(line_buffering=True)


def sweep_pair(pair: str, plan: dict, initial_sl_mult_grid: list[float], activate_r_grid: list[float],
              trail_r_grid: list[float], max_hours: float, verbose: bool = True) -> dict | None:
    df, bars = get_entries_cached(pair, plan)
    if df.empty:
        return None
    cost = default_spread(pair)
    mean_sl_dist = float(df['bot_sl_dist'].mean())
    initial_sl_grid = [round(mean_sl_dist * m, 6) for m in initial_sl_mult_grid]
    entries = [Entry(idx=int(r['bar_idx']), direction=int(r['direction']), entry_price=r['entry_price'])
              for _, r in df.iterrows()]

    t0 = time.time()
    results = race_trailing(bars, entries, initial_sl_grid, activate_r_grid, trail_r_grid,
                            max_bars_ahead=int(max_hours * 60), cost_price=cost)
    elapsed = time.time() - t0

    rows = [{'sl_mult': round(r.initial_sl / mean_sl_dist, 2), 'activate_r': r.activate_r,
            'trail_r': r.trail_r, 'n': r.n, 'win_rate': round(r.win_rate, 3),
            'avg_r': round(r.avg_r, 4), 'median_r': round(r.median_r, 4)} for r in results]
    best = max(rows, key=lambda r: r['avg_r']) if rows else None
    if verbose:
        print(f"  {pair}: {len(entries)} entries, {len(rows)} combos in {elapsed:.0f}s")
        if best:
            print(f"    best trail: avg_r={best['avg_r']:+.4f}R  win_rate={best['win_rate']:.1%}  "
                  f"n={best['n']}  (sl_mult={best['sl_mult']}, activate_r={best['activate_r']}, trail_r={best['trail_r']})")
    return {'pair': pair, 'n_entries': len(entries), 'grid': rows, 'best': best, 'elapsed_s': round(elapsed, 1)}


def main():
    ap = argparse.ArgumentParser(description="volatility_bot Layer 2: trailing-exit sweep")
    ap.add_argument('--pair', default='gold')
    ap.add_argument('--sl-mult-grid', default='0.5,1.0,1.5,2.0')
    ap.add_argument('--activate-r-grid', default='0.3,0.5,0.75,1.0')
    ap.add_argument('--trail-r-grid', default='0.3,0.5,0.75,1.0')
    ap.add_argument('--max-hours', type=float, default=48.0)
    ap.add_argument('--json-out', default=None)
    args = ap.parse_args()

    plan = load_plan()
    pairs = resolve_available_pairs(plan) if args.pair == 'all' else \
        [a.strip() for a in args.pair.split(',') if a.strip()]

    initial_sl_mult_grid = [float(x) for x in args.sl_mult_grid.split(',')]
    activate_r_grid = [float(x) for x in args.activate_r_grid.split(',')]
    trail_r_grid = [float(x) for x in args.trail_r_grid.split(',')]
    print(f"Grid: {len(initial_sl_mult_grid)}x{len(activate_r_grid)}x{len(trail_r_grid)} = "
          f"{len(initial_sl_mult_grid)*len(activate_r_grid)*len(trail_r_grid)} combos/pair")

    all_results = []
    for pair in pairs:
        if pair not in plan['pairs']:
            print(f"skip {pair}: not in plan universe")
            continue
        r = sweep_pair(pair, plan, initial_sl_mult_grid, activate_r_grid, trail_r_grid, args.max_hours)
        if r:
            all_results.append(r)
            if args.json_out:
                with open(args.json_out, 'w') as f:
                    json.dump({'results': all_results}, f)

    if all_results:
        print(f"\n{'PAIR':<8}{'N':>6}{'BEST avg_r':>12}{'win%':>7}{'sl_mult':>9}{'activ_r':>9}{'trail_r':>9}")
        for r in sorted(all_results, key=lambda r: -(r['best']['avg_r'] if r['best'] else -99)):
            b = r['best']
            if not b:
                continue
            print(f"{r['pair']:<8}{r['n_entries']:>6}{b['avg_r']:>+12.4f}{b['win_rate']*100:>6.1f}%"
                  f"{b['sl_mult']:>9}{b['activate_r']:>9}{b['trail_r']:>9}")
    if args.json_out:
        print(f"\nWritten -> {args.json_out}")


if __name__ == '__main__':
    main()
