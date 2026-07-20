"""volatility_bot Layer 2 — regime-conditional SL/TP (dynamic-exit hypothesis A).

Layer 1 already showed no stable universal best fixed SL/TP across time windows
(the "instability map"). This asks a sharper question: does a STABLE best combo
emerge once real entries are segmented by regime — weekday, month, or a
volatility tier (from the same causal sigma-proxy already computed per session)?
If yes and it clears the OOS floor, that's a principled selector (Lego Principle
4: "the brain is a selector, not more knobs") — a genuinely dynamic exit, not
just a bigger grid.

Caches raw real entries per pair to VolRangeForecaster/data/vol_bot_layer2_entries/
so this — and any future regime cut — never re-walks M1 through decide() again.
That walk is the expensive part (~76min for 25 pairs); grouping cached entries
and re-running the shared barrier_race grid on each group is seconds.

Usage:
  python volatility_bot/layer2_regime_split.py --pair gold
  python volatility_bot/layer2_regime_split.py --pair gold,audnzd,eurchf --segment-by weekday,vol_tier
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from pylego.costs import default_spread  # noqa: E402
from pylego.barrier_race import Entry, race_grid  # noqa: E402
from volatility_bot.layer2_sltp_replay import (  # noqa: E402
    load_plan, load_m1, replay_entries,
)

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(line_buffering=True)

_CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', 'VolRangeForecaster', 'data',
                          'vol_bot_layer2_entries')
os.makedirs(_CACHE_DIR, exist_ok=True)
_MIN_SEGMENT_N = 30   # CLAUDE.md floor for any strategy claim


def get_entries_cached(pair: str, plan: dict, force: bool = False) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (entries_df, bars). Entries are cached to parquet after the first
    (expensive) replay; bars are always re-loaded (cheap, memory-mapped parquet)
    since race_grid needs the real M1 path, not just the entry list."""
    cache_path = os.path.join(_CACHE_DIR, f'{pair}_entries.parquet')
    bars = load_m1(pair)
    if not force and os.path.exists(cache_path):
        return pd.read_parquet(cache_path), bars

    p = plan['pairs'][pair]
    frac_k = {k: p[k] / p['sigma'] for k in ('hl50', 'hl75', 'ocMed', 'oc75')}
    entries = replay_entries(pair, bars, frac_k, plan['policy'])
    cost = default_spread(pair)
    df = pd.DataFrame([{
        'bar_idx': e.bar_idx, 'entry_time': e.entry_time, 'direction': e.direction,
        'entry_price': e.entry_price, 'bot_sl_dist': e.bot_sl_dist, 'bot_tp_dist': e.bot_tp_dist,
        'decision': e.decision, 'line': e.line, 'sigma': e.sigma,
    } for e in entries])
    df = df[df['bot_sl_dist'] > cost].reset_index(drop=True)   # drop degenerate entries once, at cache time
    df.to_parquet(cache_path)
    return df, bars


def tag_regime(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df['weekday'] = df['entry_time'].dt.day_name()
    df['month'] = df['entry_time'].dt.month
    # Vol tier from THIS pair's own sigma distribution across its real entries —
    # tertiles, not a fixed threshold, so it's relative to the pair's own regime.
    try:
        df['vol_tier'] = pd.qcut(df['sigma'], 3, labels=['low', 'mid', 'high'])
    except ValueError:
        df['vol_tier'] = 'mid'   # too few distinct sigma values to tertile
    return df


def eval_group(bars: pd.DataFrame, group: pd.DataFrame, sl_mult_grid: list[float],
               tp_r_grid: list[float], max_hours: float, cost: float) -> dict | None:
    n = len(group)
    if n < _MIN_SEGMENT_N:
        return None
    mean_sl_dist = float(group['bot_sl_dist'].mean())
    max_bars_ahead = int(max_hours * 60)

    # Own-exit baseline for this segment.
    own_r = []
    for _, e in group.iterrows():
        tp_r = e['bot_tp_dist'] / e['bot_sl_dist']
        one = race_grid(bars, [Entry(idx=int(e['bar_idx']), direction=int(e['direction']),
                                     entry_price=e['entry_price'])],
                        sl_grid=[e['bot_sl_dist']], tp_r_grid=[tp_r],
                        max_bars_ahead=max_bars_ahead, cost_price=cost)
        if one:
            own_r.append(one[0].avg_r)

    # Swept grid for this segment.
    sl_grid = [round(mean_sl_dist * m, 6) for m in sl_mult_grid]
    entries = [Entry(idx=int(e['bar_idx']), direction=int(e['direction']), entry_price=e['entry_price'])
              for _, e in group.iterrows()]
    grid_results = race_grid(bars, entries, sl_grid, tp_r_grid, max_bars_ahead, cost_price=cost)
    best = max(grid_results, key=lambda r: r.avg_r) if grid_results else None

    return {
        'n': n,
        'own_avg_r': round(float(np.mean(own_r)), 4) if own_r else None,
        'best_sl_mult': round(best.sl / mean_sl_dist, 2) if best else None,
        'best_tp_r': best.tp_r if best else None,
        'best_avg_r': round(best.avg_r, 4) if best else None,
    }


def main():
    ap = argparse.ArgumentParser(description="volatility_bot Layer 2: regime-conditional SL/TP")
    ap.add_argument('--pair', default='gold', help="Pair key, comma-separated list, or 'all'")
    ap.add_argument('--segment-by', default='weekday,month,vol_tier',
                    help='Comma-separated: weekday, month, vol_tier')
    ap.add_argument('--sl-mult-grid', default='0.5,0.75,1.0,1.25,1.5,2.0')
    ap.add_argument('--tp-r-grid', default='1,1.5,2,3,4')
    ap.add_argument('--max-hours', type=float, default=48.0)
    ap.add_argument('--force-replay', action='store_true', help='Ignore cached entries, re-walk M1')
    args = ap.parse_args()

    plan = load_plan()
    if args.pair == 'all':
        from volatility_bot.layer2_sltp_replay import resolve_available_pairs
        pairs = resolve_available_pairs(plan)
    else:
        pairs = [a.strip() for a in args.pair.split(',') if a.strip()]
    dims = [d.strip() for d in args.segment_by.split(',') if d.strip()]
    sl_mult_grid = [float(x) for x in args.sl_mult_grid.split(',')]
    tp_r_grid = [float(x) for x in args.tp_r_grid.split(',')]

    for pair in pairs:
        if pair not in plan['pairs']:
            print(f"skip {pair}: not in plan universe")
            continue
        cost = default_spread(pair)
        df, bars = get_entries_cached(pair, plan, force=args.force_replay)
        df = tag_regime(df)
        print(f"\n=== {pair} === {len(df)} entries (cached at {_CACHE_DIR}/{pair}_entries.parquet)")

        # Baseline: whole-pair own-exit, for comparison.
        whole = eval_group(bars, df, sl_mult_grid, tp_r_grid, args.max_hours, cost)
        if whole:
            print(f"  [whole pair] n={whole['n']}  own={whole['own_avg_r']:+.4f}R  "
                  f"best_swept={whole['best_avg_r']:+.4f}R (sl_mult={whole['best_sl_mult']}, tp_r={whole['best_tp_r']})")

        for dim in dims:
            if dim not in df.columns:
                print(f"  unknown segment dim: {dim}")
                continue
            print(f"  --- by {dim} ---")
            for val, group in df.groupby(dim, observed=True):
                r = eval_group(bars, group, sl_mult_grid, tp_r_grid, args.max_hours, cost)
                if r is None:
                    print(f"    {str(val):<12} n={len(group):<6} (below {_MIN_SEGMENT_N}-trade floor, skipped)")
                    continue
                print(f"    {str(val):<12} n={r['n']:<6} own={r['own_avg_r']:+.4f}R  "
                      f"best_swept={r['best_avg_r']:+.4f}R (sl_mult={r['best_sl_mult']}, tp_r={r['best_tp_r']})")


if __name__ == '__main__':
    main()
