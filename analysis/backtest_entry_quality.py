"""
backtestSystem entry-quality analyser — WHY do the losses cut deep, and can the
entry context tell winners from losers?

Joins two REAL local sources by ticket (the KV journal — the clean source — was
unreachable; these two together reconstruct it):

  1. ENTRY CONTEXT from backtestSystem.log — every trade logs a `TRADE ...
     conv=.. confirms=c/t ... atr30m=..` line and an adjacent `[Journal] Opened
     #TICKET .. features=[..]` line. We pair them (same second, TRADE then
     Opened) to get, per ticket: pair, direction, entry price, SL/TP price,
     conviction, confirms, atr30m, RR, feature list, entry date/time.
  2. OUTCOMES from an MT5 history dump (backfill_trade_history.py --out FILE):
     per position_id (== ticket): actual close price, profit, open/close time.

R is computed WITHOUT a pip table: risk = |entry - SL| (both parsed as prices
from the TRADE line), pnl_r = sign*(close - entry) / risk. Exit type is inferred
from where the close landed (near SL / near TP / between).

The point is the owner's question: "we win big but the losses cut deep." This
separates the two hypotheses — (a) EXIT asymmetry (fixed ~2R cap + wide ATR stop,
trail off → winners capped, losers full −1R) vs (b) ENTRY quality (some conv /
feature / session context systematically produces the deep losers). Costs are
netted (per-pair spread + slippage) the same way as grade_backtestsystem_journal.

House floor: any bucket with n < 30 is "no conclusion" (CLAUDE.md). One forward
month is a STEER, not proof — read it that way.

Usage:
    python analysis/backtest_entry_quality.py --mt5 backtestSystem/mt5_history.json
    python analysis/backtest_entry_quality.py           # entry-side only (no outcomes)
"""
from __future__ import annotations

import argparse
import json
import re
import statistics as st
from collections import Counter, defaultdict
from datetime import datetime, timezone

LOG = 'backtestSystem.log'

# TRADE line: the actual SL/TP PRICES + conv/confirms/atr — the entry context.
_TRADE = re.compile(
    r'TRADE  (?P<pair>\S+) (?P<dir>LONG|SHORT) @ (?P<entry>[\d.]+)  '
    r'SL=(?P<sl>[\d.]+) \((?P<slp>[\d.]+)p\)  TP=(?P<tp>[\d.]+) \((?P<tpp>[\d.]+)p\)  '
    r'RR=(?P<rr>[\d.]+)  lots=(?P<lots>[\d.]+)  atr5m=(?P<a5>[\d.]+)p  '
    r'atr30m=(?P<a30>[\d.]+)p  conv=(?P<conv>[\d.]+)  confirms=(?P<cc>\d+)/(?P<tt>\d+)')
_OPENED = re.compile(
    r"\[Journal\] Opened #(?P<ticket>\d+) (?P<pair>\S+) (?P<dir>long|short) @[\d.]+  "
    r"SL=[\d.]+p TP=[\d.]+p  features=\[(?P<features>[^\]]*)\]")
_DAY = re.compile(r'--- New day (\d{4}-\d{2}-\d{2}) ---')
_TIME = re.compile(r'^(?P<t>\d{2}:\d{2}:\d{2})\b')

FEATURE_FAMILY = {
    'macdSignal': 'trend', 'htfEma': 'trend', 'adxFilter': 'trend',
    'vwapSlope': 'trend', 'ichimokuCloud': 'trend',
    'rsiDivergence': 'divergence',
    'orderBlock': 'structure', 'fvgBias': 'structure',
    'wickRejection': 'structure', 'chochBos': 'structure',
    'rangePosition': 'other', 'weeklyPivot': 'other', 'hurstRegime': 'other',
}
_SPREAD_PIPS = {
    'EURUSD': 0.8, 'GBPUSD': 0.8, 'AUDUSD': 0.8, 'NZDUSD': 0.8, 'USDCAD': 0.8,
    'USDCHF': 0.8, 'EURGBP': 0.8, 'USDJPY': 1.0, 'GBPJPY': 1.0, 'EURJPY': 1.0,
    'XAUUSD': 0.3, 'NAS100USD': 2.0, 'USTECH100M': 2.0,
}
MIN_N = 30


def parse_log_entries(path: str = LOG) -> dict:
    """ticket -> entry-context dict, pairing each Opened line with the preceding
    TRADE line for the same pair."""
    entries: dict[int, dict] = {}
    day = None
    last_trade: dict[str, dict] = {}          # pair -> most recent TRADE line
    with open(path, encoding='utf-8', errors='ignore') as f:
        for line in f:
            d = _DAY.search(line)
            if d:
                day = d.group(1); continue
            tm = _TIME.match(line)
            hhmmss = tm.group('t') if tm else None
            t = _TRADE.search(line)
            if t:
                g = t.groupdict()
                last_trade[g['pair']] = {
                    'pair': g['pair'], 'dir': g['dir'],
                    'entry': float(g['entry']), 'sl': float(g['sl']), 'tp': float(g['tp']),
                    'conv': float(g['conv']), 'cc': int(g['cc']), 'tt': int(g['tt']),
                    'atr30m': float(g['a30']), 'rr': float(g['rr']), 'lots': float(g['lots']),
                    'day': day, 'time': hhmmss,
                }
                continue
            o = _OPENED.search(line)
            if o:
                g = o.groupdict()
                tk = int(g['ticket'])
                base = last_trade.get(g['pair'])
                feats = [s.strip().strip("'\"") for s in g['features'].split(',') if s.strip()]
                rec = {'ticket': tk, 'pair': g['pair'], 'dir': g['dir'].upper(),
                       'features': feats, 'day': day, 'time': hhmmss}
                if base and base['pair'] == g['pair']:
                    rec.update({k: base[k] for k in
                                ('entry', 'sl', 'tp', 'conv', 'cc', 'tt', 'atr30m', 'rr', 'lots')})
                entries[tk] = rec              # last open for a ticket wins
    return entries


def load_mt5(path: str) -> dict:
    with open(path, encoding='utf-8') as f:
        arr = json.load(f)
    return {int(t['position_id']): t for t in arr}


def _norm(pair):
    return str(pair or '').upper().replace('/', '').replace('_', '')


def join(entries: dict, outcomes: dict, slip_pips: float) -> list:
    """Join by ticket → trades with real pnl_r (net of cost) + inferred exit."""
    rows = []
    for tk, oc in outcomes.items():
        e = entries.get(tk)
        if not e or 'entry' not in e or 'sl' not in e:
            continue
        entry, sl, tp = e['entry'], e['sl'], e['tp']
        risk = abs(entry - sl)
        if risk < 1e-9:
            continue
        close = float(oc['close_price'])
        # dir from the log is LONG/SHORT (the MT5 record uses BUY/SELL) — accept both.
        sign = 1.0 if e['dir'] in ('BUY', 'LONG') else -1.0
        pnl_r_gross = sign * (close - entry) / risk
        # cost in R: spread+slip over the risk distance (risk in the pair's pips)
        pip = 0.01 if _norm(e['pair']).endswith('JPY') else (1.0 if 'XAU' in _norm(e['pair']) else 0.0001)
        risk_pips = risk / pip
        cost_r = (_SPREAD_PIPS.get(_norm(e['pair']), 1.0) + slip_pips) / risk_pips if risk_pips else 0
        # exit inference: where did the close land relative to SL/TP?
        span = abs(tp - entry) + risk
        d_sl = abs(close - sl); d_tp = abs(close - tp)
        exit_type = 'sl' if d_sl <= 0.15 * span else ('tp' if d_tp <= 0.15 * span else 'mid')
        rows.append({**e, 'close': close, 'profit': oc.get('profit'),
                     'time_close': oc.get('time_close'), 'time_open': oc.get('time_open'),
                     'pnl_r': pnl_r_gross, 'net_r': pnl_r_gross - cost_r,
                     'exit_type': exit_type, 'risk_pips': risk_pips})
    rows.sort(key=lambda r: r.get('time_close') or 0)
    return rows


def stats(rs):
    if not rs:
        return None
    r = [t['net_r'] for t in rs]
    n = len(r); wins = [x for x in r if x > 0]; losses = [x for x in r if x <= 0]
    gw, gl = sum(wins), -sum(losses)
    streak = mx = 0
    for x in r:
        streak = streak + 1 if x <= 0 else 0; mx = max(mx, streak)
    return {'n': n, 'exp': sum(r) / n, 'win%': len(wins) / n * 100,
            'avg_win': (sum(wins) / len(wins)) if wins else 0,
            'avg_loss': (sum(losses) / len(losses)) if losses else 0,
            'pf': (gw / gl) if gl else float('inf'),
            'maxLseq': mx}


def row(label, m):
    if not m:
        return f'{label:<22} {"—":>4}'
    return (f'{label:<22} {m["n"]:>4} {m["exp"]:>+7.3f}R {m["win%"]:>5.0f}%  '
            f'win {m["avg_win"]:>+5.2f}R  loss {m["avg_loss"]:>+5.2f}R  PF {m["pf"]:>4.2f}  '
            f'maxLseq {m["maxLseq"]:>2}' + ('' if m['n'] >= MIN_N else '   (n<30)'))


def main():
    ap = argparse.ArgumentParser(description='backtestSystem entry-quality / loss-asymmetry analyser')
    ap.add_argument('--mt5', help='MT5 history JSON from backfill_trade_history.py --out')
    ap.add_argument('--slip-pips', type=float, default=0.2)
    ap.add_argument('--log', default=LOG)
    args = ap.parse_args()

    entries = parse_log_entries(args.log)
    with_ctx = [e for e in entries.values() if 'conv' in e]
    print(f'Log: {len(entries)} opened tickets, {len(with_ctx)} with full entry context '
          f'({entries and min((e["day"] for e in entries.values() if e.get("day")), default="?")} '
          f'.. {entries and max((e["day"] for e in entries.values() if e.get("day")), default="?")})')

    if not args.mt5:
        print('\n(no --mt5 outcomes given — entry-context summary only)')
        convs = [e['conv'] for e in with_ctx]
        if convs:
            print(f'conviction: min {min(convs):.2f}  median {st.median(convs):.2f}  '
                  f'max {max(convs):.2f}  stdev {st.pstdev(convs):.3f}')
        print('per-pair:', Counter(e['pair'] for e in with_ctx).most_common())
        return

    outcomes = load_mt5(args.mt5)
    rows = join(entries, outcomes, args.slip_pips)
    joined = len(rows); unmatched = len(outcomes) - joined
    print(f'MT5: {len(outcomes)} round-trips → {joined} joined to entry context '
          f'({unmatched} unmatched by ticket)')
    if not rows:
        print('No joined trades — check ticket/position_id alignment.'); return
    # SANITY GUARD: computed pnl_r sign must agree with MT5 profit$ sign. A high
    # count here means the direction/sign logic is wrong (this exact bug bit once:
    # dir is LONG/SHORT not BUY/SELL). Break-even/partial trades can differ slightly.
    mm = sum(1 for t in rows if t['profit'] is not None and (t['profit'] > 0) != (t['pnl_r'] > 0))
    flag = '' if mm <= max(2, joined * 0.03) else '  <-- WARNING: sign logic likely wrong'
    print(f'sanity: pnl_r-vs-profit$ sign mismatches = {mm}/{joined}{flag}\n')

    # ── headline: the win-big/lose-deep asymmetry ────────────────────────────
    o = stats(rows)
    print('=' * 78)
    print('OVERALL (net of cost):')
    print(row('ALL', o))
    aw, al = o['avg_win'], o['avg_loss']
    print(f'\n>>> avg win {aw:+.2f}R vs avg loss {al:+.2f}R  '
          f'(payoff ratio {abs(aw / al):.2f} : 1) — need win% > {abs(al) / (abs(al) + aw) * 100:.0f}% to break even')
    print(f'>>> worst 5 losers (net R): {sorted(t["net_r"] for t in rows)[:5]}')

    print('\nby EXIT TYPE (inferred from where the close landed):')
    for et in ('tp', 'sl', 'mid'):
        print(row(f'exit={et}', stats([t for t in rows if t['exit_type'] == et])))

    print('\nby CONVICTION bucket:')
    for lbl, pred in [('conv <0.25', lambda c: c < 0.25), ('conv 0.25–0.4', lambda c: 0.25 <= c < 0.4),
                      ('conv >=0.4', lambda c: c >= 0.4)]:
        print(row(lbl, stats([t for t in rows if 'conv' in t and pred(t['conv'])])))

    print('\nby CONFIRMS (family votes):')
    for lbl, pred in [('confirms <=4', lambda t: t['cc'] <= 4), ('confirms 5', lambda t: t['cc'] == 5),
                      ('confirms >=6', lambda t: t['cc'] >= 6)]:
        print(row(lbl, stats([t for t in rows if 'cc' in t and pred(t)])))

    print('\nby FEATURE FAMILY fired (a trade appears in each family it has):')
    for fam in ('trend', 'divergence', 'structure', 'other'):
        sel = [t for t in rows if any(FEATURE_FAMILY.get(f) == fam for f in t.get('features', []))]
        print(row(f'has {fam}', stats(sel)))
    print('  divergence present vs ABSENT (the mean-reversion tell):')
    print(row('  has divergence', stats([t for t in rows if 'rsiDivergence' in t.get('features', [])])))
    print(row('  NO divergence', stats([t for t in rows if 'rsiDivergence' not in t.get('features', [])])))

    print('\nby PAIR:')
    for p in sorted({t['pair'] for t in rows}):
        print(row(p, stats([t for t in rows if t['pair'] == p])))
    print('=' * 78)
    print('n<30 buckets are "no conclusion". One forward month = a steer, not proof.')


if __name__ == '__main__':
    main()
