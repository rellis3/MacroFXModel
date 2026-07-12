#!/usr/bin/env python3
"""Grade the backtestSystem trade journal — the Quant-Macro L1.7 metrics table.

Standalone, read-only, no MT5. Pulls the `backtestsystem_journal` KV key off the
dashboard (or reads a saved JSON file) and computes, over CLOSED trades only:

    after-cost expectancy (R) · profit factor · win rate ·
    max consecutive losses · max drawdown (R, cumulative) · trade count

— overall, by conviction bucket (<0.3 / 0.3–0.5 / >0.5, the journal's
`conviction` field), and by feature FAMILY fired (families per
backtestSystem/engine.py FEATURE_FAMILY; a trade's `features` list holds every
feature that voted — confirms AND conflicts, see backtestSystem/main.py — so a
trade can appear in several family rows).

COSTS: the journal's `pnl_r` is GROSS — backtestSystem/journal.py computes
raw-price-move ÷ SL-distance with no spread/slippage. This script nets every
trade with the SAME per-pair round-trip spread model as bot/backtest.py
(_SPREAD_PIPS, replicated below because importing bot/backtest.py drags in
MetaTrader5/requests) plus --slip-pips of slippage on EVERY trade (entry type
isn't recorded, same conservative rule as bot/backtest.py). The output states
the model used.

House floor: any bucket with n < 30 gets "no conclusion" — per-bucket numbers
below that are noise, not evidence (CLAUDE.md validation discipline).

Usage:
    python3 scripts/grade_backtestsystem_journal.py --url https://dashboard.example
    python3 scripts/grade_backtestsystem_journal.py --file journal.json
    python3 scripts/grade_backtestsystem_journal.py --file journal.json --slip-pips 0.5
    python3 scripts/grade_backtestsystem_journal.py --file journal.json --spread "EURUSD=0.6"

This tool NEVER writes to KV.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request

# ── Cost model — replicated from bot/backtest.py (_SPREAD_PIPS /
# _DEFAULT_SPREAD_PIPS; import would drag in MetaTrader5+requests). Keys are
# normalized (upper, no '/' or '_') because this journal stores MT5-style
# broker symbols (EURUSD, XAUUSD, USTECH100M), not display symbols.
_SPREAD_PIPS = {
    'EURUSD': 0.8, 'GBPUSD': 0.8, 'AUDUSD': 0.8, 'NZDUSD': 0.8,
    'USDCAD': 0.8, 'USDCHF': 0.8, 'EURGBP': 0.8,
    'USDJPY': 1.0, 'GBPJPY': 1.0, 'EURJPY': 1.0,
    'XAUUSD': 0.3,
    'NAS100USD': 2.0, 'USTECH100M': 2.0, 'USTECH100': 2.0,
}
_DEFAULT_SPREAD_PIPS = 1.0
COST_MODEL_NOTE = ('cost model: per-pair round-trip spread REPLICATED from '
                   'bot/backtest.py _SPREAD_PIPS (majors 0.8p, JPY 1.0p, gold 0.3, '
                   f'indices 2.0, unknown {_DEFAULT_SPREAD_PIPS}) + slippage on ALL '
                   'trades (entry type not recorded)')

# Feature → family, per backtestSystem/engine.py FEATURE_FAMILY (replicated —
# engine.py imports the bot-local `indicators` module, not importable from here).
FEATURE_FAMILY = {
    'macdSignal':    'trend',
    'htfEma':        'trend',
    'adxFilter':     'trend',
    'vwapSlope':     'trend',
    'ichimokuCloud': 'trend',
    'rsiDivergence': 'divergence',
    'orderBlock':    'structure',
    'fvgBias':       'structure',
    'wickRejection': 'structure',
    'chochBos':      'structure',
    'rangePosition': 'other',
    'weeklyPivot':   'other',
    'hurstRegime':   'other',
}

CONVICTION_BUCKETS = [('conv <0.3', lambda c: c is not None and c < 0.3),
                      ('conv 0.3–0.5', lambda c: c is not None and 0.3 <= c <= 0.5),
                      ('conv >0.5', lambda c: c is not None and c > 0.5),
                      ('conv n/a', lambda c: c is None)]

MIN_N = 30   # the house floor: below this a bucket is "no conclusion"


def _norm_pair(pair: str) -> str:
    return str(pair or '').upper().replace('/', '').replace('_', '')


def spread_pips_for(pair: str, override: dict) -> float:
    key = _norm_pair(pair)
    if key in override:
        return float(override[key])
    if '*' in override:
        return float(override['*'])
    return _SPREAD_PIPS.get(key, _DEFAULT_SPREAD_PIPS)


def parse_spread_override(arg: str | None) -> dict:
    """--spread: bare number = all pairs; comma list PAIR=pips otherwise
    (same syntax as bot/backtest.py; pair keys normalized)."""
    if not arg:
        return {}
    arg = arg.strip()
    if '=' not in arg:
        return {'*': float(arg)}
    out: dict = {}
    for part in arg.split(','):
        pair, _, val = part.strip().partition('=')
        if pair and val:
            out[_norm_pair(pair)] = float(val)
    return out


def fetch_journal(url: str) -> list:
    full = f"{url.rstrip('/')}/api/kv/get?key=backtestsystem_journal"
    with urllib.request.urlopen(full, timeout=15) as resp:
        body = json.loads(resp.read())
    if not isinstance(body, dict) or body.get('miss'):
        raise SystemExit('backtestsystem_journal not found in dashboard KV')
    data = body.get('data')
    if not isinstance(data, list):
        raise SystemExit(f'unexpected journal payload type: {type(data).__name__}')
    return data


def load_journal(args) -> list:
    if args.file:
        with open(args.file, 'r', encoding='utf-8') as fh:
            data = json.load(fh)
        # Accept either the bare journal list or a saved {data: [...]} envelope.
        if isinstance(data, dict):
            data = data.get('data', data)
        if not isinstance(data, list):
            raise SystemExit('journal file must contain a list (or {data: [...]})')
        return data
    return fetch_journal(args.url)


def closed_trades(journal: list, spread_override: dict, slip_pips: float) -> list:
    """CLOSED records with a numeric gross pnl_r, netted of costs, in
    chronological CLOSE order (streaks/drawdown need the realized sequence)."""
    out = []
    for rec in journal:
        if rec.get('status') != 'closed' or not isinstance(rec.get('pnl_r'), (int, float)):
            continue
        risk_pips = rec.get('sl_dist_pips')
        if not risk_pips:
            pip = rec.get('pip') or 0.0001
            ep, sl = rec.get('entry_price'), rec.get('sl')
            risk_pips = abs(ep - sl) / pip if (ep and sl) else 0.0
        if not risk_pips or risk_pips < 0.001:
            continue                                # unusable SL → can't cost or R-scale
        spread = spread_pips_for(rec.get('pair'), spread_override)
        cost_r = (spread + slip_pips) / float(risk_pips)
        out.append({**rec, 'cost_r': cost_r, 'net_r': float(rec['pnl_r']) - cost_r})
    out.sort(key=lambda r: (r.get('exit_time') or '', r.get('entry_ts_ms') or 0))
    return out


def metrics(trades: list) -> dict | None:
    """The L1.7 table row over net-of-cost R, in close order."""
    if not trades:
        return None
    rs = [t['net_r'] for t in trades]
    n = len(rs)
    wins = sum(1 for r in rs if r > 0)
    gross_win = sum(r for r in rs if r > 0)
    gross_loss = -sum(r for r in rs if r < 0)
    pf = (gross_win / gross_loss) if gross_loss > 0 else float('inf') if gross_win > 0 else 0.0
    streak = max_streak = 0
    for r in rs:
        streak = streak + 1 if r <= 0 else 0
        max_streak = max(max_streak, streak)
    cum = peak = 0.0
    max_dd = 0.0
    for r in rs:
        cum += r
        peak = max(peak, cum)
        max_dd = max(max_dd, peak - cum)
    return {'n': n, 'exp_r': sum(rs) / n, 'pf': pf, 'win_rate': wins / n,
            'max_consec_loss': max_streak, 'max_dd_r': max_dd}


def verdict(m: dict | None) -> str:
    if m is None or m['n'] < MIN_N:
        return f"no conclusion (n={0 if m is None else m['n']} < {MIN_N})"
    if m['exp_r'] > 0 and m['pf'] > 1.0:
        return f"positive after costs at n={m['n']} — still forward-sample, not proof"
    return f"NOT positive after costs at n={m['n']}"


def fmt_row(label: str, m: dict | None) -> str:
    if m is None:
        return f"{label:<18} {'—':>4} {'—':>8} {'—':>7} {'—':>7} {'—':>7} {'—':>8}"
    pf = f"{m['pf']:.2f}" if m['pf'] != float('inf') else 'inf'
    return (f"{label:<18} {m['n']:>4} {m['exp_r']:>+8.3f} {pf:>7} "
            f"{m['win_rate'] * 100:>6.1f}% {m['max_consec_loss']:>7} {m['max_dd_r']:>8.2f}")


HEADER = f"{'bucket':<18} {'n':>4} {'expR':>8} {'PF':>7} {'win%':>7} {'maxLseq':>7} {'maxDD_R':>8}"


def run(args) -> int:
    journal = load_journal(args)
    spread_override = parse_spread_override(args.spread)
    trades = closed_trades(journal, spread_override, args.slip_pips)
    n_open = sum(1 for r in journal if r.get('status') == 'open')
    n_skip = sum(1 for r in journal if r.get('status') == 'closed') - len(trades)

    print(f"backtestSystem journal — {len(journal)} records: {len(trades)} closed & costed, "
          f"{n_open} open, {n_skip} closed-but-unusable (no pnl_r / no SL)")
    print(COST_MODEL_NOTE + f"; slip = {args.slip_pips}p"
          + (f"; spread override = {spread_override}" if spread_override else ''))
    print("journal pnl_r is GROSS (backtestSystem/journal.py) — all numbers below are NET of the model above.\n")

    print(HEADER)
    overall = metrics(trades)
    print(fmt_row('ALL', overall))

    print('\nby conviction bucket:')
    print(HEADER)
    bucket_ms = []
    for label, pred in CONVICTION_BUCKETS:
        sel = [t for t in trades if pred(t.get('conviction'))]
        if label == 'conv n/a' and not sel:
            continue
        m = metrics(sel)
        bucket_ms.append((label, m))
        print(fmt_row(label, m))

    print('\nby feature family fired (a trade may appear in several rows — '
          'features include confirming AND conflicting votes):')
    print(HEADER)
    fam_ms = []
    for fam in sorted(set(FEATURE_FAMILY.values())):
        sel = [t for t in trades
               if any(FEATURE_FAMILY.get(f, 'other') == fam for f in (t.get('features') or []))]
        m = metrics(sel)
        fam_ms.append((fam, m))
        print(fmt_row(f'family {fam}', m))

    print('\nverdicts (house floor: n < 30 ⇒ no conclusion):')
    print(f"  ALL              : {verdict(overall)}")
    for label, m in bucket_ms + fam_ms:
        print(f"  {label:<17}: {verdict(m)}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description='Grade the backtestSystem journal (closed trades, after-cost, '
                    'Quant-Macro L1.7 metrics). Read-only — never writes KV.')
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument('--url', help='dashboard base URL (fetches KV backtestsystem_journal)')
    src.add_argument('--file', help='path to a saved journal JSON (list or {data:[...]})')
    ap.add_argument('--slip-pips', type=float, default=0.2,
                    help='slippage pips charged on every trade (default 0.2, as bot/backtest.py)')
    ap.add_argument('--spread', default=None,
                    help="spread override: '0.6' for all pairs or 'EURUSD=0.6,USDJPY=0.9'")
    return run(ap.parse_args())


if __name__ == '__main__':
    sys.exit(main())
