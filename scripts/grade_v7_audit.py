#!/usr/bin/env python3
"""Score the RegimeV7 audit log per config hash — the forward-validation scoreboard.

Standalone, read-only, no MT5. Pulls the `regime_bot_v7_audit_log` KV key off
the dashboard (or reads a saved JSON file; payload shape is
``{records: [...], updated_at}`` per RegimeV7/regime_bot_v7.py) and, over the
CLOSED trades (``event == 'exit'`` records), groups by ``cfg_hash`` (the
whitelisted strategy-param snapshot hash stamped on every entry) and computes
per hash:

    n · after-cost expectancy (pips AND R) · profit factor · win rate ·
    max consecutive losses · max drawdown of the cumulative-pips curve

COSTS — three record classes, handled per record and counted in the output:
  * paper, Batch-4+ (has the ``paper_cost_pips`` key): pnl_pips/pnl_r are
    ALREADY net — the bot debits the pinned backtest cost model
    (paper_cost_bp 1.2 round-trip + paper_slip_bp 0.4 on SL_HIT) at close.
  * paper, pre-Batch-4 (no ``paper_cost_pips`` key): GROSS — this script
    retro-applies that same default cost model (cost = entry_price × bp / 1e4).
  * live (``paper_mode`` false): fills paid the real broker spread — no
    extra charge (JPY/index pip sizes via the bot's own _PIP_SIZES table,
    replicated below).

House floor: a hash with n < 30 closed trades gets "no conclusion" — its
numbers are noise, not evidence (CLAUDE.md validation discipline).

Usage:
    python3 scripts/grade_v7_audit.py --url https://dashboard.example
    python3 scripts/grade_v7_audit.py --file audit.json

This tool NEVER writes to KV.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request

# Pip sizes — replicated from RegimeV7/regime_bot_v7.py _PIP_SIZES (importing
# the bot would pull MetaTrader5/requests). V7 pairs are display-style.
_PIP_SIZES = {
    'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'USD/JPY': 0.01,
    'AUD/USD': 0.0001, 'NZD/USD': 0.0001, 'USD/CAD': 0.0001,
    'USD/CHF': 0.0001, 'GBP/JPY': 0.01,   'EUR/GBP': 0.0001,
    'EUR/JPY': 0.01,   'EUR/CHF': 0.0001, 'GBP/CHF': 0.0001,
    'AUD/JPY': 0.01,   'CAD/JPY': 0.01,   'NZD/JPY': 0.01,
    'AUD/CHF': 0.0001, 'AUD/CAD': 0.0001, 'AUD/NZD': 0.0001,
    'GBP/AUD': 0.0001, 'GBP/CAD': 0.0001, 'GBP/NZD': 0.0001,
    'EUR/AUD': 0.0001, 'EUR/CAD': 0.0001, 'EUR/NZD': 0.0001,
    'CHF/JPY': 0.01,   'XAU/USD': 1.0,
    'NAS100_USD': 1.0, 'USTECH100M': 1.0, 'SPX500_USD': 1.0,
    'DE30_USD':   1.0, 'UK100_GBP':  1.0, 'US30_USD':   1.0,
    'US2000_USD': 1.0,
}
# The bot's default paper cost model (DEFAULT_CFG paper_cost_bp / paper_slip_bp,
# mirroring the regime-backtest.html pinned costs) — used ONLY to retro-cost
# pre-Batch-4 paper records that were logged gross.
_COST_BP, _SLIP_BP = 1.2, 0.4

MIN_N = 30   # the house floor: below this a hash is "no conclusion"


def fetch_audit(url: str) -> dict:
    full = f"{url.rstrip('/')}/api/kv/get?key=regime_bot_v7_audit_log"
    with urllib.request.urlopen(full, timeout=15) as resp:
        body = json.loads(resp.read())
    if not isinstance(body, dict) or body.get('miss'):
        raise SystemExit('regime_bot_v7_audit_log not found in dashboard KV')
    return body.get('data') or {}


def load_audit(args) -> dict:
    if args.file:
        with open(args.file, 'r', encoding='utf-8') as fh:
            data = json.load(fh)
        if isinstance(data, dict) and 'data' in data and 'records' not in data:
            data = data['data']            # accept a saved {data: {...}} envelope
        if not isinstance(data, dict) or not isinstance(data.get('records'), list):
            raise SystemExit('audit file must contain {records: [...]} (or {data: {records: [...]}})')
        return data
    return fetch_audit(args.url)


def paper_cost_price(entry_price: float, exit_code: str) -> float:
    """== regime_bot_v7.paper_cost_price with the DEFAULT bp config: cost_bp
    round-trip + slip_bp extra on stop exits, in PRICE units."""
    bp = _COST_BP + (_SLIP_BP if exit_code == 'SL_HIT' else 0.0)
    return entry_price * bp / 10_000.0


def closed_trades(audit: dict) -> tuple[list, dict]:
    """Exit records → after-cost trades sorted by ts. Returns (trades, cost
    accounting counts). Each trade: pair, ts, cfg_hash, net_pips, net_r (None
    when orig_sl_dist unusable), win."""
    counts = {'net_already': 0, 'retro_costed': 0, 'live': 0}
    out = []
    for rec in audit.get('records') or []:
        if rec.get('event') != 'exit' or not isinstance(rec.get('pnl_pips'), (int, float)):
            continue
        pips = float(rec['pnl_pips'])
        sl_dist = rec.get('orig_sl_dist') or 0.0
        r = float(rec['pnl_r']) if isinstance(rec.get('pnl_r'), (int, float)) and sl_dist > 0 else None
        if not rec.get('paper_mode'):
            counts['live'] += 1                       # real spread paid in the fill
        elif 'paper_cost_pips' in rec:
            counts['net_already'] += 1                # Batch-4+: bot netted at close
        else:
            # Pre-Batch-4 paper record: logged gross → retro-apply the default model.
            counts['retro_costed'] += 1
            pip = _PIP_SIZES.get(rec.get('pair'), 0.0001)
            cost = paper_cost_price(float(rec.get('entry_price') or 0.0),
                                    rec.get('exit_code') or '')
            pips -= cost / pip
            if r is not None:
                r -= cost / sl_dist
        out.append({'pair': rec.get('pair'), 'ts': rec.get('ts') or 0,
                    'cfg_hash': rec.get('cfg_hash') or '(none)',
                    'net_pips': pips, 'net_r': r})
    out.sort(key=lambda t: t['ts'])
    return out, counts


def metrics(trades: list) -> dict | None:
    """Per-hash scoreboard row: pips-based PF/win/streak/DD + expectancy in
    pips and (when SL distances allow) R."""
    if not trades:
        return None
    pips = [t['net_pips'] for t in trades]
    rs = [t['net_r'] for t in trades if t['net_r'] is not None]
    n = len(pips)
    wins = sum(1 for p in pips if p > 0)
    gw = sum(p for p in pips if p > 0)
    gl = -sum(p for p in pips if p < 0)
    pf = (gw / gl) if gl > 0 else float('inf') if gw > 0 else 0.0
    streak = max_streak = 0
    for p in pips:
        streak = streak + 1 if p <= 0 else 0
        max_streak = max(max_streak, streak)
    cum = peak = dd = 0.0
    for p in pips:
        cum += p
        peak = max(peak, cum)
        dd = max(dd, peak - cum)
    return {'n': n, 'exp_pips': sum(pips) / n,
            'exp_r': (sum(rs) / len(rs)) if rs else None, 'n_r': len(rs),
            'pf': pf, 'win_rate': wins / n, 'max_consec_loss': max_streak,
            'max_dd_pips': dd}


def verdict(m: dict | None) -> str:
    if m is None or m['n'] < MIN_N:
        return f"no conclusion (n={0 if m is None else m['n']} < {MIN_N})"
    if m['exp_pips'] > 0 and m['pf'] > 1.0:
        return f"positive after costs at n={m['n']} — forward sample, keep watching"
    return f"NOT positive after costs at n={m['n']}"


HEADER = (f"{'cfg_hash':<14} {'n':>4} {'expPips':>8} {'expR':>7} {'PF':>7} "
          f"{'win%':>7} {'maxLseq':>7} {'maxDDp':>8}")


def fmt_row(label: str, m: dict) -> str:
    pf = f"{m['pf']:.2f}" if m['pf'] != float('inf') else 'inf'
    exp_r = f"{m['exp_r']:+.3f}" if m['exp_r'] is not None else '—'
    return (f"{label:<14} {m['n']:>4} {m['exp_pips']:>+8.1f} {exp_r:>7} {pf:>7} "
            f"{m['win_rate'] * 100:>6.1f}% {m['max_consec_loss']:>7} {m['max_dd_pips']:>8.1f}")


def run(args) -> int:
    audit = load_audit(args)
    trades, counts = closed_trades(audit)
    n_entries = sum(1 for r in (audit.get('records') or []) if r.get('event') == 'entry')

    print(f"RegimeV7 audit log — {len(audit.get('records') or [])} records: "
          f"{len(trades)} closed trades, {n_entries} entry events (ignored)")
    print(f"costs: {counts['net_already']} paper already-net (Batch-4+ paper_cost_pips), "
          f"{counts['retro_costed']} pre-Batch-4 paper retro-costed at "
          f"{_COST_BP}bp (+{_SLIP_BP}bp on SL_HIT), {counts['live']} live (broker spread in the fill)\n")

    by_hash: dict[str, list] = {}
    for t in trades:
        by_hash.setdefault(t['cfg_hash'], []).append(t)

    print(HEADER)
    rows = []
    # Biggest sample first — the hash that might actually clear the floor leads.
    for h, ts in sorted(by_hash.items(), key=lambda kv: -len(kv[1])):
        m = metrics(ts)
        rows.append((h, m))
        print(fmt_row(h, m))
    if not rows:
        print('(no closed trades)')

    print(f'\nverdicts (house floor: n < {MIN_N} closed trades per hash ⇒ no conclusion):')
    for h, m in rows:
        extra = '' if m is None or m['n_r'] == m['n'] else f" [R over {m['n_r']}/{m['n']} with usable SL]"
        print(f"  {h:<14}: {verdict(m)}{extra}")
    if not rows:
        print('  (nothing to grade)')
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description='Per-cfg_hash scoreboard for the RegimeV7 audit log '
                    '(closed trades, after-cost). Read-only — never writes KV.')
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument('--url', help='dashboard base URL (fetches KV regime_bot_v7_audit_log)')
    src.add_argument('--file', help='path to a saved audit JSON ({records:[...]})')
    return run(ap.parse_args())


if __name__ == '__main__':
    sys.exit(main())
