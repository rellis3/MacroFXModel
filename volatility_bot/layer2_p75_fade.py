"""p75-only mechanical fade — no bot policy, no velocity gating.

Direct response to: everything tested so far went through volatility_bot's
LEARNED policy, which only fires on 10 narrow (line, velocity-bucket) cells —
not "every 75th-percentile touch." This strips that away and tests the simple,
visual hypothesis directly: fade EVERY touch of the 75th-percentile line
(OC75 static-off-open AND HL75 dynamic-off-extreme, both sides), full stop.
Median (OC50/HL50) lines are excluded entirely, as requested.

This is closer to Layer 1 than Layer 2 in spirit — it's mechanical (every
touch fires, no learned selectivity), but it uses the real per-day vol-scaled
band levels (not a fixed-cadence sample), and it's still gated by requiring the
session to have a valid causal sigma reading, matching the rest of this file's
family. Reuses the SAME shared session/sigma machinery as
layer2_sltp_replay.py and the SAME shared pylego.barrier_race grid + trailing
walkers — only the entry generator is new.

Usage:
  python volatility_bot/layer2_p75_fade.py --pair gold
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from pylego.instruments import pip_size  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.barrier_race import Entry, race_grid, race_trailing  # noqa: E402
from volatility_bot.layer2_sltp_replay import (  # noqa: E402
    load_plan, load_m1, session_bounds, daily_closes, sigma_proxy_series,
)

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(line_buffering=True)

_CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', 'VolRangeForecaster', 'data',
                          'vol_bot_layer2_entries')
os.makedirs(_CACHE_DIR, exist_ok=True)


@dataclass
class P75Entry:
    bar_idx: int
    entry_time: pd.Timestamp
    direction: int   # +1 long (faded a down-touch), -1 short (faded an up-touch)
    entry_price: float
    line: str        # OC75_up | OC75_dn | HL75_up | HL75_dn


def get_p75_entries_cached(pair: str, plan: dict, force: bool = False) -> tuple[pd.DataFrame, pd.DataFrame]:
    cache_path = os.path.join(_CACHE_DIR, f'{pair}_p75_entries.parquet')
    bars = load_m1(pair)
    if not force and os.path.exists(cache_path):
        return pd.read_parquet(cache_path), bars

    p = plan['pairs'][pair]
    # oc75/hl75 fractions, expressed per-unit-sigma (same derivation as the rest
    # of this file family) so they scale with each session's OWN causal sigma
    # proxy rather than being frozen at today's single reading.
    k_oc75 = p['oc75'] / p['sigma']
    k_hl75 = p['hl75'] / p['sigma']

    bounds = session_bounds(bars)
    closes = daily_closes(bars, bounds)
    sigmas = sigma_proxy_series(closes)
    idx = bars.index

    entries: list[P75Entry] = []
    for s_i, (s_start, s_end) in enumerate(bounds):
        sigma = sigmas[s_i]
        if sigma is None or sigma <= 0:
            continue
        oc75 = k_oc75 * sigma
        hl75 = k_hl75 * sigma

        window = bars.loc[s_start:s_end]
        if window.empty:
            continue
        open_px = float(window['open'].iloc[0])
        run_low = open_px
        run_high = open_px
        acted = set()   # one shot per line per session, same discipline as decide()

        for ts, row in window.iterrows():
            hi, lo = float(row['high']), float(row['low'])
            # Levels use run_low/run_high AS OF BEFORE this bar — checking a
            # bar's touch against a level the SAME bar just extended (e.g. this
            # bar's own high pushing HL75_dn closer, then its low "reaching" it)
            # is a same-bar look-ahead. Touches first, extremes updated after.
            levels = {
                'OC75_up': open_px * (1 + oc75), 'OC75_dn': open_px * (1 - oc75),
                'HL75_up': run_low * (1 + hl75), 'HL75_dn': run_high * (1 - hl75),
            }
            for name, lvl in levels.items():
                if name in acted:
                    continue
                side = name.split('_')[1]
                touched = (hi >= lvl) if side == 'up' else (lo <= lvl)
                if not touched:
                    continue
                acted.add(name)
                direction = 1 if side == 'dn' else -1   # fade: buy a down-touch, sell an up-touch
                bar_idx = idx.searchsorted(ts)
                entries.append(P75Entry(bar_idx=bar_idx, entry_time=ts, direction=direction,
                                        entry_price=lvl, line=name))

            if hi > run_high:
                run_high = hi
            if lo < run_low:
                run_low = lo

    df = pd.DataFrame([e.__dict__ for e in entries])
    df.to_parquet(cache_path)
    return df, bars


def main():
    ap = argparse.ArgumentParser(description="p75-only mechanical fade (no policy, no velocity gate)")
    ap.add_argument('--pair', default='gold')
    ap.add_argument('--sl-mult-grid', default='0.5,0.75,1.0,1.25,1.5,2.0')
    ap.add_argument('--tp-r-grid', default='0.5,1,1.5,2,3,4')
    ap.add_argument('--trail-activate-grid', default='0.15,0.3,0.5,0.75,1.0')
    ap.add_argument('--trail-r-grid', default='0.15,0.3,0.5,0.75,1.0')
    ap.add_argument('--max-hours', type=float, default=48.0)
    args = ap.parse_args()

    plan = load_plan()
    if args.pair not in plan['pairs']:
        print(f"'{args.pair}' not in plan universe")
        return
    df, bars = get_p75_entries_cached(args.pair, plan)
    pip = pip_size(args.pair)
    cost = default_spread(args.pair)

    print(f"=== {args.pair}: p75-only fade (OC75 + HL75, both sides, every touch) ===")
    print(f"{len(df)} entries, {bars.index.min()} -> {bars.index.max()}")
    print(f"By line: {df['line'].value_counts().to_dict()}")

    if df.empty:
        return

    # SL grid scale: ~0.3% of the entry price, median across entries — a
    # starting reference distance the sl-mult grid multiplies against (same
    # role as mean_sl_dist in the other scripts in this family).
    scale = float((df['entry_price'] * 0.003).median())

    entries = [Entry(idx=int(r['bar_idx']), direction=int(r['direction']), entry_price=r['entry_price'])
              for _, r in df.iterrows()]
    max_bars_ahead = int(args.max_hours * 60)

    sl_grid = [round(scale * m, 6) for m in [float(x) for x in args.sl_mult_grid.split(',')]]
    tp_r_grid = [float(x) for x in args.tp_r_grid.split(',')]
    fixed = race_grid(bars, entries, sl_grid, tp_r_grid, max_bars_ahead, cost_price=cost)
    fixed_rows = sorted(fixed, key=lambda r: -r.avg_r)
    print(f"\n--- Fixed-grid best (of {len(fixed)} combos) ---")
    for r in fixed_rows[:5]:
        print(f"  sl={r.sl:.4f}  tp_r={r.tp_r}  n={r.n}  win={r.win_rate:.1%}  avg_r={r.avg_r:+.4f}R")

    activate_grid = [float(x) for x in args.trail_activate_grid.split(',')]
    trail_grid = [float(x) for x in args.trail_r_grid.split(',')]
    trail = race_trailing(bars, entries, sl_grid, activate_grid, trail_grid, max_bars_ahead, cost_price=cost)
    trail_rows = sorted(trail, key=lambda r: -r.avg_r)
    print(f"\n--- Trailing-exit best (of {len(trail)} combos) ---")
    for r in trail_rows[:5]:
        print(f"  sl={r.initial_sl:.4f}  activate_r={r.activate_r}  trail_r={r.trail_r}  "
              f"n={r.n}  win={r.win_rate:.1%}  avg_r={r.avg_r:+.4f}R")


if __name__ == '__main__':
    main()
