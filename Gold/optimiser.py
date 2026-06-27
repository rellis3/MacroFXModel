"""
Gold Bot — Adaptive Parameter Optimiser

Backtests the last N days of journal data to find the parameter combination
with the highest expected value per trade. Pushes winning params to KV
under key `gold_bot_config` so the bot picks them up on its next config reload.

What is optimised (can be evaluated from journal without replaying ticks):
  min_zone_score     — raise this to take only the highest-conviction zones
  vu_min_components  — require 3/3 VuManChu vs the default 2/3

What is NOT optimised here (needs tick data to re-simulate):
  sl_atr_mult, tp2_r — execution params; left at current config values

The optimiser also writes a `gold_perf_snapshot` key with 30-day P&L stats
that the performance dashboard reads for the live WR vs historical comparison.

Usage (run from project root):
  python Gold/optimiser.py
  python Gold/optimiser.py --journal Gold/logs/gold_journal.jsonl
  python Gold/optimiser.py --days 60 --min-trades 8
  python Gold/optimiser.py --dry-run
"""

from __future__ import annotations
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from itertools import product
from statistics import stdev, mean

import requests
from dotenv import load_dotenv

load_dotenv()

DASHBOARD_URL = os.getenv('DASHBOARD_URL', 'https://macrofxmodel-production.up.railway.app')

# ── Grid search space ─────────────────────────────────────────────────────────

PARAM_GRID = {
    'min_zone_score':    [2.5, 3.0, 3.5, 4.0, 5.0],
    'vu_min_components': [1, 2, 3],
}

MIN_TRADES = 5   # minimum closed trades required to evaluate a combination


# ── Journal reader ────────────────────────────────────────────────────────────

def _read_journal(path: str) -> list[dict]:
    events: list[dict] = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events


def _cutoff_iso(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _extract_trades(events: list[dict], days: int) -> list[dict]:
    """
    Return one dict per closed trade (tp2_hit or sl_hit) within the last N days.
    Fields: zone_id, tf, direction, score, vu_components, htf_aligned,
            has_npoc, has_anchor, result, pnl_r, timestamp
    """
    cutoff = _cutoff_iso(days)

    zone_entries: dict[str, dict] = {}
    trades: list[dict] = []

    for ev in events:
        ts    = ev.get('timestamp', '')
        etype = ev.get('event', ev.get('type', ''))

        if etype == 'ENTRY_SIGNAL':
            zid = ev.get('zone_id', '')
            if not zid:
                continue
            vu   = ev.get('vumanchu', {})
            comp = str(ev.get('composition', []))
            zone_entries[zid] = {
                'zone_id':       zid,
                'timestamp':     ts,
                'tf':            ev.get('tf', '?'),
                'direction':     ev.get('direction', '?'),
                'score':         float(ev.get('score', 0)),
                'vu_components': int(vu.get('components_aligned', ev.get('vu_components', 0))),
                'entry_price':   float(ev.get('entry_price') or ev.get('price') or 0),
                'sl':            float(ev.get('sl') or 0),
                'tp2':           float(ev.get('tp2') or 0),
                'htf_aligned':   'HTF' in comp,
                'has_npoc':      'nPOC' in comp,
                'has_anchor':    'VWAP anchor' in comp,
                'has_poc':       'POC' in comp and 'nPOC' not in comp,
                'has_hvn':       'HVN' in comp,
            }

        elif etype == 'TRADE_CLOSED':
            zid    = ev.get('zone_id', '')
            reason = ev.get('reason') or ev.get('result', '')
            if zid not in zone_entries:
                continue
            if reason == 'TP2_HIT':
                entry = zone_entries.pop(zid)
                if entry['timestamp'] < cutoff:
                    continue
                sl_dist  = abs(entry['entry_price'] - entry['sl'])
                tp2_dist = abs(entry['tp2'] - entry['entry_price'])
                pnl_r    = round(tp2_dist / sl_dist, 3) if sl_dist > 0 else 0.0
                trades.append({**entry, 'result': 'WIN', 'pnl_r': pnl_r})
            elif reason == 'SL_HIT':
                entry = zone_entries.pop(zid)
                if entry['timestamp'] < cutoff:
                    continue
                trades.append({**entry, 'result': 'LOSS', 'pnl_r': -1.0})
            # EXPIRED / breakeven / other reasons: drop the open entry, no trade
            else:
                zone_entries.pop(zid, None)

    return trades


# ── Metrics ───────────────────────────────────────────────────────────────────

def _ev(trades: list[dict]) -> float:
    """Mean R per closed trade."""
    if not trades:
        return float('-inf')
    return mean(t['pnl_r'] for t in trades)


def _sharpe(trades: list[dict]) -> float:
    """EV / StdDev — penalises high variance."""
    if len(trades) < 2:
        return float('-inf')
    rs = [t['pnl_r'] for t in trades]
    ev = mean(rs)
    sd = stdev(rs)
    return ev / sd if sd > 0 else ev


# ── Grid search ───────────────────────────────────────────────────────────────

def grid_search(trades: list[dict], min_trades: int = MIN_TRADES) -> tuple[dict, list[dict]]:
    """
    Enumerate all param combinations, filter historical trades to what would
    have been taken under each combo, score by Sharpe.
    Returns (best_params, all_results_sorted_by_sharpe).
    """
    keys = list(PARAM_GRID.keys())
    vals = [PARAM_GRID[k] for k in keys]
    results: list[dict] = []

    for combo in product(*vals):
        params  = dict(zip(keys, combo))
        subset  = [
            t for t in trades
            if t['score']          >= params['min_zone_score']
            and t['vu_components'] >= params['vu_min_components']
        ]
        if len(subset) < min_trades:
            continue

        wins = sum(1 for t in subset if t['result'] == 'WIN')
        ev   = _ev(subset)
        sh   = _sharpe(subset)
        results.append({
            'params':   params,
            'trades':   len(subset),
            'wins':     wins,
            'win_rate': round(wins / len(subset), 3),
            'ev':       round(ev, 3),
            'sharpe':   round(sh, 3),
        })

    results.sort(key=lambda x: -x['sharpe'])
    best = results[0]['params'] if results else {}
    return best, results


# ── Performance snapshot ──────────────────────────────────────────────────────

def _days_span(trades: list[dict]) -> int:
    tss = [t['timestamp'] for t in trades if t.get('timestamp')]
    if not tss:
        return 0
    try:
        tss = sorted(tss)
        first = datetime.fromisoformat(tss[0].replace('Z', '+00:00'))
        last  = datetime.fromisoformat(tss[-1].replace('Z', '+00:00'))
        return max(1, (last - first).days + 1)
    except Exception:
        return 0


def build_perf_snapshot(trades: list[dict], best_params: dict, days: int) -> dict:
    """Summary dict pushed to KV as gold_perf_snapshot."""
    now_iso = datetime.now(timezone.utc).isoformat()
    if not trades:
        return {
            'generated_at': now_iso, 'days_window': days,
            'total_trades': 0, 'best_params': best_params,
        }

    wins     = [t for t in trades if t['result'] == 'WIN']
    losses   = [t for t in trades if t['result'] == 'LOSS']
    total_r  = sum(t['pnl_r'] for t in trades)
    win_rate = len(wins) / len(trades)

    by_tf: dict[str, dict] = {}
    for t in trades:
        d = by_tf.setdefault(t['tf'], {'trades': 0, 'wins': 0})
        d['trades'] += 1
        if t['result'] == 'WIN':
            d['wins'] += 1

    return {
        'generated_at':  now_iso,
        'days_window':   days,
        'days_data':     _days_span(trades),
        'total_trades':  len(trades),
        'wins':          len(wins),
        'losses':        len(losses),
        'win_rate':      round(win_rate, 3),
        'total_r':       round(total_r, 2),
        'avg_r':         round(total_r / len(trades), 3),
        'best_params':   best_params,
        'by_tf': {
            tf: {
                'trades':   d['trades'],
                'wins':     d['wins'],
                'win_rate': round(d['wins'] / d['trades'], 3) if d['trades'] else 0,
            }
            for tf, d in by_tf.items()
        },
    }


# ── KV helpers ────────────────────────────────────────────────────────────────

def _kv_get(key: str, base_url: str) -> dict | None:
    try:
        r = requests.get(f'{base_url}/api/kv/get?key={key}', timeout=10)
        if r.status_code == 200:
            j = r.json()
            if not j.get('miss') and j.get('data'):
                return j['data']
    except Exception:
        pass
    return None


def _kv_put(key: str, data: dict, base_url: str) -> bool:
    try:
        r = requests.post(
            f'{base_url}/api/kv/set',
            json={'key': key, 'data': data, 'timestamp': int(time.time() * 1000)},
            timeout=10,
        )
        return r.status_code == 200
    except Exception as exc:
        print(f'  [KV] PUT {key} failed: {exc}')
        return False


# ── Console report ────────────────────────────────────────────────────────────

def _print_report(trades: list[dict], best: dict, results: list[dict], days: int) -> None:
    sep = '─' * 74
    print(f'\n{sep}')
    print(f'GOLD OPTIMISER  last {days} days  {len(trades)} closed trades')
    print(sep)

    if not results:
        print(f'  Insufficient data: need {MIN_TRADES}+ closed trades per combination.')
        print(sep)
        return

    print(f'  {"SCORE":>7}  {"VU":>4}  {"N":>5}  {"WR%":>6}  {"EV":>7}  {"SHARPE":>8}')
    print(f'  {"─"*7}  {"─"*4}  {"─"*5}  {"─"*6}  {"─"*7}  {"─"*8}')
    for row in results[:12]:
        p   = row['params']
        tag = ' ◄' if p == best else ''
        print(
            f'  {p["min_zone_score"]:>7.1f}  {p["vu_min_components"]:>4}  '
            f'{row["trades"]:>5}  {row["win_rate"]*100:>6.1f}  '
            f'{row["ev"]:>+7.3f}R  {row["sharpe"]:>+8.3f}{tag}'
        )

    print(f'\n  Recommended: min_zone_score={best.get("min_zone_score")}  '
          f'vu_min_components={best.get("vu_min_components")}')
    print(sep)


# ── Entry point ───────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Gold Bot adaptive parameter optimiser')
    p.add_argument('--journal',       default='gold_journal.jsonl',
                   help='Path to gold_journal.jsonl (default: ./gold_journal.jsonl)')
    p.add_argument('--days',          type=int, default=30,
                   help='Days of history to analyse (default: 30)')
    p.add_argument('--min-trades',    type=int, default=MIN_TRADES,
                   help='Minimum trades per combo to include (default: 5)')
    p.add_argument('--dry-run',       action='store_true',
                   help='Print results but do not write to KV')
    p.add_argument('--dashboard-url', default=DASHBOARD_URL,
                   help='Dashboard base URL for KV access')
    return p.parse_args()


if __name__ == '__main__':
    args = _parse_args()

    if not os.path.exists(args.journal):
        print(f'Journal not found: {args.journal}')
        sys.exit(1)

    print(f'Reading journal: {args.journal}  (last {args.days} days)')
    events = _read_journal(args.journal)
    trades = _extract_trades(events, args.days)
    print(f'Closed trades in window: {len(trades)}')

    if len(trades) < args.min_trades:
        print(f'Too few trades to optimise (need {args.min_trades}+). Exiting.')
        sys.exit(0)

    best, results = grid_search(trades, min_trades=args.min_trades)
    _print_report(trades, best, results, args.days)

    snapshot = build_perf_snapshot(trades, best, args.days)

    if args.dry_run:
        print('Dry run — not writing to KV.')
        print(f'  Would push gold_bot_config:    {best}')
        sys.exit(0)

    # Merge best filtering params with existing config (preserve paper_mode, enabled, etc.)
    existing_cfg = _kv_get('gold_bot_config', args.dashboard_url) or {}
    new_cfg = {**existing_cfg, **best}

    ok1 = _kv_put('gold_bot_config',      new_cfg,   args.dashboard_url)
    ok2 = _kv_put('gold_optimiser_last',  snapshot,  args.dashboard_url)
    ok3 = _kv_put('gold_perf_snapshot',   snapshot,  args.dashboard_url)

    print(f'  gold_bot_config     → {"OK" if ok1 else "FAIL"}')
    print(f'  gold_optimiser_last → {"OK" if ok2 else "FAIL"}')
    print(f'  gold_perf_snapshot  → {"OK" if ok3 else "FAIL"}')
    print()
