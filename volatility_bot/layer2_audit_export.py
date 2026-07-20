"""volatility_bot Layer 2 AUDIT export — the "see the trades on the candles" JSON.

Layer 2 (`layer2_sltp_replay.py`) already reports the pooled SL/TP grid per pair,
and the honest headline is that the vol system's real entries are net-negative on
every pair after cost. This script exists because a table isn't believable — it
exports the underlying trades so the viewer (`layer2-vol-audit.html`) can draw
each one on the real candles, and adds the OVER-TIME cut (per-6-month grid) the
distribution brief asked for.

Two products in one JSON, per pair:
  • DETAIL — a candle window (resampled to `--tf` minutes) plus every real entry
    inside it, each resolved by the SHARED `pylego.barrier_race.race_trades`
    walker for EVERY grid cell (sl_mult × tp_r). The viewer flips the cell and
    redraws instantly — same first-touch logic as the aggregate grid, so what you
    see per trade and what the table counts can never disagree.
  • OVER-TIME — the full-history entries bucketed into 6-month periods, each
    scored with `race_grid`, so you can watch whether the fade was EVER positive
    in some regime or has just been steadily negative.

Honest scope is inherited from `layer2_sltp_replay.py`: this is TODAY's learned
policy replayed on historical prices (not what the bot decided each day), with a
causal σ-proxy approximation, and the exit is a swept UNIFORM fixed SL/TP (not the
bot's own adaptive exit). It maps terrain; it is not a live-forward claim.

Usage:
  python volatility_bot/layer2_audit_export.py --pair gold
  python volatility_bot/layer2_audit_export.py --pair eurusd --detail-months 6 --tf 60
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(line_buffering=True)

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from pylego.instruments import pip_size  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.barrier_race import Entry, race_grid, race_trades  # noqa: E402
from volatility_bot.layer2_sltp_replay import (  # noqa: E402
    load_m1, load_plan, replay_entries,
)

_OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'VolRangeForecaster', 'data')


def period_label(ts: pd.Timestamp) -> str:
    """6-month bucket label, e.g. '2019 H1' / '2019 H2'."""
    return f"{ts.year} H{1 if ts.month <= 6 else 2}"


def resample_ohlc(bars: pd.DataFrame, tf_min: int) -> pd.DataFrame:
    """M1 → tf-minute candles for display (right-labelled, gaps dropped)."""
    o = bars['open'].resample(f'{tf_min}min').first()
    h = bars['high'].resample(f'{tf_min}min').max()
    lo = bars['low'].resample(f'{tf_min}min').min()
    c = bars['close'].resample(f'{tf_min}min').last()
    out = pd.DataFrame({'open': o, 'high': h, 'low': lo, 'close': c}).dropna()
    return out


def cell_key(sl_mult: float, tp_r: float) -> str:
    return f'{sl_mult:g}|{tp_r:g}'


def build(pair: str, plan: dict, sl_mult_grid: list[float], tp_r_grid: list[float],
          max_hours: float, detail_months: float, tf_min: int) -> dict:
    p = plan['pairs'][pair]
    frac_k = {k: p[k] / p['sigma'] for k in ('hl50', 'hl75', 'ocMed', 'oc75')}
    ac = p.get('assetClass', 'fx')
    bars = load_m1(pair)
    pip = pip_size(pair)
    cost = default_spread(pair)
    max_bars = int(max_hours * 60)
    print(f"=== {pair} ({ac}) === {len(bars):,} M1 bars {bars.index.min().date()} -> {bars.index.max().date()}")

    t0 = time.time()
    entries = replay_entries(pair, bars, frac_k, plan['policy'])
    # Same degenerate-SL filter as layer2_sltp_replay (a σ-proxy artefact where a
    # very quiet stretch collapses the band geometry to an SL tighter than spread).
    entries = [e for e in entries if e.bot_sl_dist > cost]
    if not entries:
        print("  no real entries — skipping")
        return None
    idx = bars.index
    ent_ts = [idx[e.bar_idx] for e in entries]
    mean_sl_dist = float(np.mean([e.bot_sl_dist for e in entries]))
    by_decision: dict[str, int] = {}
    for e in entries:
        by_decision[e.decision] = by_decision.get(e.decision, 0) + 1
    print(f"  {len(entries)} real entries in {time.time()-t0:.0f}s  mean_sl_dist={mean_sl_dist:.6f}  decisions={by_decision}")

    sl_grid = [round(mean_sl_dist * m, 8) for m in sl_mult_grid]
    grid_cells = [{'sl_mult': m, 'tp_r': r} for m in sl_mult_grid for r in tp_r_grid]

    # ── OVER-TIME: bucket by 6-month period, grid each ───────────────────────
    buckets: dict[str, list[int]] = {}
    for i, ts in enumerate(ent_ts):
        buckets.setdefault(period_label(ts), []).append(i)
    periods = sorted(buckets.keys(), key=lambda s: (int(s[:4]), s[-1]))
    overtime_grid: dict[str, list] = {}
    best_by_period: dict[str, dict] = {}
    for per in periods:
        es = [Entry(idx=entries[i].bar_idx, direction=entries[i].direction,
                    entry_price=entries[i].entry_price) for i in buckets[per]]
        rows = race_grid(bars, es, sl_grid, tp_r_grid, max_bars, cost_price=cost)
        g = [{'sl_mult': round(r.sl / mean_sl_dist, 2), 'tp_r': r.tp_r, 'n': r.n,
              'win_rate': round(r.win_rate, 4), 'sl_rate': round(r.sl_rate, 4),
              'timeout_rate': round(r.timeout_rate, 4), 'avg_r': round(r.avg_r, 5)} for r in rows]
        overtime_grid[per] = g
        best_by_period[per] = max(g, key=lambda r: r['avg_r']) if g else None

    # Pooled (all history) grid — matches layer2_sltp_replay's per-pair grid.
    pooled_rows = race_grid(bars, [Entry(idx=e.bar_idx, direction=e.direction, entry_price=e.entry_price)
                                   for e in entries], sl_grid, tp_r_grid, max_bars, cost_price=cost)
    pooled = [{'sl_mult': round(r.sl / mean_sl_dist, 2), 'tp_r': r.tp_r, 'n': r.n,
               'win_rate': round(r.win_rate, 4), 'sl_rate': round(r.sl_rate, 4),
               'timeout_rate': round(r.timeout_rate, 4), 'avg_r': round(r.avg_r, 5)} for r in pooled_rows]
    pooled_best = max(pooled, key=lambda r: r['avg_r']) if pooled else None
    print(f"  over-time: {len(periods)} periods  pooled best avg_r={pooled_best['avg_r'] if pooled_best else 'n/a'}")

    # ── DETAIL: last `detail_months` of candles + the entries inside them ────
    detail_to = idx.max()
    detail_from = detail_to - pd.Timedelta(days=int(detail_months * 30))
    # Extend the drawn candles past the window end so exits (up to max_hours out)
    # stay on-chart.
    cand_to = detail_to + pd.Timedelta(hours=max_hours)
    cand = resample_ohlc(bars.loc[detail_from:cand_to], tf_min)
    candles = [{'t': int(t.timestamp()), 'o': round(float(r.open), 8), 'h': round(float(r.high), 8),
                'l': round(float(r.low), 8), 'c': round(float(r.close), 8)}
               for t, r in cand.iterrows()]

    det_i = [i for i, ts in enumerate(ent_ts) if detail_from <= ts <= detail_to]
    det_entries = [entries[i] for i in det_i]
    det_ts = [ent_ts[i] for i in det_i]
    # Resolve each detail entry for EVERY grid cell (shared per-trade walker).
    per_cell_trades: dict[str, list[dict]] = {}
    race_ents = [Entry(idx=e.bar_idx, direction=e.direction, entry_price=e.entry_price) for e in det_entries]
    for m in sl_mult_grid:
        sl = round(mean_sl_dist * m, 8)
        for r in tp_r_grid:
            per_cell_trades[cell_key(m, r)] = race_trades(bars, race_ents, sl, r, max_bars, cost_price=cost)

    # Assemble trades: static entry info + a by_cell outcome map (exit time/price/r).
    trades = []
    for j, e in enumerate(det_entries):
        by_cell = {}
        for m in sl_mult_grid:
            for r in tp_r_grid:
                lst = per_cell_trades[cell_key(m, r)]
                tr = lst[j] if j < len(lst) else None
                if tr is None or tr['idx'] != e.bar_idx:
                    # race_trades drops entries without runway; align by idx.
                    tr = next((x for x in lst if x['idx'] == e.bar_idx), None)
                if tr is None:
                    continue
                by_cell[cell_key(m, r)] = {
                    'outcome': tr['outcome'],
                    't_exit': int(idx[tr['exit_idx']].timestamp()) if tr['exit_idx'] < len(idx) else None,
                    'exit': round(tr['exit_price'], 8),
                    'r': round(tr['r'], 4),
                }
        trades.append({
            't_entry': int(det_ts[j].timestamp()),
            'dir': e.direction, 'entry': round(e.entry_price, 8),
            'decision': e.decision, 'line': e.line,
            'by_cell': by_cell,
        })
    print(f"  detail: {len(candles)} candles ({tf_min}m), {len(trades)} trades in window {detail_from.date()}..{detail_to.date()}")

    return {
        'pair': pair, 'asset_class': ac, 'generated_from_plan': plan.get('generatedAt'),
        'pip': pip, 'cost_price': cost, 'mean_sl_dist': round(mean_sl_dist, 8),
        'tf_minutes': tf_min, 'max_hours': max_hours,
        'grid_cells': grid_cells, 'sl_mult_grid': sl_mult_grid, 'tp_r_grid': tp_r_grid,
        'summary': {'n_entries_total': len(entries), 'n_detail_trades': len(trades), 'by_decision': by_decision},
        'detail': {'from': int(detail_from.timestamp()), 'to': int(detail_to.timestamp()),
                   'candles': candles, 'trades': trades},
        'overtime': {'periods': periods, 'grid': overtime_grid, 'best_by_period': best_by_period,
                     'pooled': pooled, 'pooled_best': pooled_best},
    }


def main():
    ap = argparse.ArgumentParser(description="volatility_bot Layer 2 audit export (trades-on-candles + over-time)")
    ap.add_argument('--pair', default='gold', help="Pair key or comma list")
    ap.add_argument('--sl-mult-grid', default='0.5,0.75,1.0,1.25,1.5,2.0')
    ap.add_argument('--tp-r-grid', default='1,1.5,2,3,4')
    ap.add_argument('--max-hours', type=float, default=48.0)
    ap.add_argument('--detail-months', type=float, default=6.0)
    ap.add_argument('--tf', type=int, default=60, help='Display candle timeframe in minutes (default 60=H1)')
    ap.add_argument('--out-dir', default=_OUT_DIR)
    args = ap.parse_args()

    plan = load_plan()
    sl_mult_grid = [float(x) for x in args.sl_mult_grid.split(',')]
    tp_r_grid = [float(x) for x in args.tp_r_grid.split(',')]
    pairs = [a.strip() for a in args.pair.split(',') if a.strip()]

    index = []
    for pair in pairs:
        if pair not in plan['pairs']:
            print(f"skip {pair}: not in plan universe")
            continue
        try:
            data = build(pair, plan, sl_mult_grid, tp_r_grid, args.max_hours, args.detail_months, args.tf)
        except FileNotFoundError as e:
            print(f"skip {pair}: {e}")
            continue
        if not data:
            continue
        out_path = os.path.join(args.out_dir, f'vol_bot_layer2_audit_{pair}.json')
        with open(out_path, 'w') as f:
            json.dump(data, f)
        print(f"  written -> {out_path}  ({os.path.getsize(out_path)/1024:.0f} KB)\n")
        index.append({'pair': pair, 'asset_class': data['asset_class'],
                      'n_entries': data['summary']['n_entries_total'],
                      'pooled_best_avg_r': data['overtime']['pooled_best']['avg_r'] if data['overtime']['pooled_best'] else None})
    if index:
        idx_path = os.path.join(args.out_dir, 'vol_bot_layer2_audit_index.json')
        # Merge into any existing index so multiple runs accumulate pairs.
        existing = {}
        if os.path.exists(idx_path):
            try:
                for row in json.load(open(idx_path)).get('pairs', []):
                    existing[row['pair']] = row
            except Exception:
                pass
        for row in index:
            existing[row['pair']] = row
        with open(idx_path, 'w') as f:
            json.dump({'pairs': sorted(existing.values(), key=lambda r: r['pair'])}, f)
        print(f"index -> {idx_path} ({len(existing)} pairs)")


if __name__ == '__main__':
    main()
