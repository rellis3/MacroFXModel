#!/usr/bin/env python3
"""LEAN-TRADE-RULE — the lean traded as a real trade, with a stop.

Design frozen in MD files/LEAN_TRADE_RULE_PREREG.md and committed (79330b7) BEFORE
this was written. study.mjs bank checks that against git.

The rule, as the owner described someone actually trading it:
    enter 08:00 UK on the lean · 1.5 ATR stop · exit 21:00 UK · net of spread

WHY THIS IS NOT THE PAIR LEDGER. The ledger scores the same leans as a SIGN CHECK --
sign(close - call price), no stop, no fixed hours. This is the trade.

THE UNIT IS THE DAY, NOT THE LEG. Six yen legs on one dollar day is one bet. Every
day's trades are averaged into a single observation before anything is tested, and
the bootstrap resamples DAYS. A leg tally once read one move as six successes here.
"""
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'analysis' / 'output' / 'lean_trade_rule.json'
H1 = ROOT / 'VolRangeForecaster' / 'data' / 'm1' / 'all_pairs_h1.parquet'
BASE = 'https://macrofxmodel-production.up.railway.app'

# ── pre-registered constants, matching the prereg exactly ───────────────────
STOP_ATR = 1.5
ENTRY_HOUR, EXIT_HOUR = 8, 20      # London; the 20:00 bar completes at 21:00
MIN_DAY_BETS = 30
REPS = 4000


def ledger_rows():
    """Every directional row. The no-pair call returns a summary only, so this walks
    byPair — which also gives the pair list without hard-coding one."""
    s = json.load(urllib.request.urlopen(f'{BASE}/api/ledger', timeout=90))['summary']
    pairs = list((s.get('byPair') or {}).keys())
    rows = []
    for p in pairs:
        try:
            j = json.load(urllib.request.urlopen(f'{BASE}/api/ledger?pair={p}', timeout=90))
            rows += (j.get('rows') or [])
        except Exception as e:
            print(f'  {p}: ledger fetch failed ({e})')
    out = [r for r in rows if r.get('dir') in ('up', 'down')
           and all(r.get(k) is not None for k in ('atr', 'spread', 'pair', 'd'))
           and r['atr'] > 0]
    print(f'ledger: {len(rows)} rows across {len(pairs)} pairs -> {len(out)} directional')
    return out


def run():
    rows = ledger_rows()
    if not rows:
        return {'id': 'lean-trade-rule', 'verdict': 'UNTESTABLE', 'reason': 'no ledger rows'}

    bars = pd.read_parquet(H1)
    bars = bars.tz_convert('Europe/London', level='datetime') \
        if bars.index.get_level_values('datetime').tz is not None else bars
    bspan = bars.index.get_level_values('datetime')
    lspan = (min(r['d'] for r in rows), max(r['d'] for r in rows))
    n_day = len({r['d'] for r in rows})
    print(f'bars: {len(bars):,}  {bspan.min().date()} -> {bspan.max().date()}')
    print(f'ledger span: {lspan[0]} -> {lspan[1]}  ({n_day} days)')

    # BLOCKER 1 — the intraday file does not reach the ledger. A 1.5 ATR stop needs the
    # PATH through the session; a daily bar cannot say whether the stop was touched inside
    # 08:00-21:00 rather than overnight in Asia. Swapping to daily bars here would be a
    # silent deviation from a prereg that named H1, so it is refused rather than fudged.
    if str(bspan.max().date()) < lspan[0]:
        return {'id': 'lean-trade-rule', 'verdict': 'BLOCKED',
                'reason': f'H1 bars end {bspan.max().date()}, ledger starts {lspan[0]} — no overlap',
                'barsTo': str(bspan.max().date()), 'ledgerFrom': lspan[0], 'ledgerTo': lspan[1],
                'dayBets': n_day, 'minDayBets': MIN_DAY_BETS,
                'alsoUntestable': n_day < MIN_DAY_BETS,
                'note': ('TWO independent blockers. Even with perfect bars this is UNTESTABLE: '
                         f'{n_day} day-bets against a floor of {MIN_DAY_BETS}. The SAMPLE is the '
                         'binding constraint, not the data gap — the ledger needs about six weeks '
                         'more before the question can be asked at all.')}

    trades = []
    for r in rows:
        pair = r['pair']
        try:
            px = bars.xs(pair, level='pair')
        except KeyError:
            continue
        day = px[px.index.normalize() == pd.Timestamp(r['d'], tz='Europe/London')]
        if day.empty:
            continue
        hrs = day.index.hour
        ent = day[hrs == ENTRY_HOUR]
        if ent.empty:
            continue
        entry = float(ent['open'].iloc[0])
        sign = 1 if r['dir'] == 'up' else -1
        stop = entry - sign * STOP_ATR * r['atr']

        # walk the session in order; first touch fills AT the stop
        path = day[(hrs >= ENTRY_HOUR) & (hrs <= EXIT_HOUR)]
        exit_px, stopped = None, False
        for _, b in path.iterrows():
            if (sign == 1 and float(b['low']) <= stop) or (sign == -1 and float(b['high']) >= stop):
                exit_px, stopped = stop, True
                break
        if exit_px is None:
            fin = path[path.index.hour == EXIT_HOUR]
            if fin.empty:
                continue
            exit_px = float(fin['close'].iloc[0])

        gross = (exit_px - entry) * sign
        net = gross - r['spread']
        trades.append({'d': r['d'], 'pair': pair, 'dir': r['dir'], 'stopped': stopped,
                       'grossAtr': gross / r['atr'], 'netAtr': net / r['atr'],
                       'win': net > 0})

    if not trades:
        return {'id': 'lean-trade-rule', 'verdict': 'UNTESTABLE', 'reason': 'no trades matched bars'}

    t = pd.DataFrame(trades)
    # THE DAY IS THE UNIT. Average each day's legs into one observation first.
    byday = t.groupby('d').agg(netAtr=('netAtr', 'mean'), grossAtr=('grossAtr', 'mean'),
                               legs=('netAtr', 'size'), stopped=('stopped', 'sum')).reset_index()
    n_days = len(byday)
    vals = byday['netAtr'].to_numpy()

    rng = np.random.default_rng(11)
    boot = vals[rng.integers(0, n_days, (REPS, n_days))].mean(axis=1)
    lo, hi = np.percentile(boot, [2.5, 97.5])

    res = {
        'id': 'lean-trade-rule', 'ranAt': pd.Timestamp.utcnow().isoformat(),
        'rule': f'enter {ENTRY_HOUR}:00 UK, {STOP_ATR} ATR stop, exit {EXIT_HOUR+1}:00 UK, net of spread',
        'minDayBets': MIN_DAY_BETS,
        'trades': len(t), 'dayBets': n_days,
        'span': [byday['d'].min(), byday['d'].max()],
        'stoppedPct': round(100 * float(t['stopped'].mean()), 1),
        'winRateLegs': round(100 * float(t['win'].mean()), 1),
        'meanNetAtrPerLeg': round(float(t['netAtr'].mean()), 4),
        'meanGrossAtrPerDayBet': round(float(byday['grossAtr'].mean()), 4),
        'meanNetAtrPerDayBet': round(float(vals.mean()), 4),
        'ci': [round(float(lo), 4), round(float(hi), 4)],
    }
    res['clearsZero'] = bool(lo > 0 or hi < 0)
    # the gate, from the prereg: net per day-bet clears zero on >= MIN_DAY_BETS
    res['verdict'] = ('UNTESTABLE' if n_days < MIN_DAY_BETS
                      else 'REAL' if (lo > 0) else 'NULL')
    return res


if __name__ == '__main__':
    r = run()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(r, indent=1))
    print()
    if r.get('verdict') == 'BLOCKED':
        print('BLOCKED — ' + r['reason'])
        print('  ' + r['note'])
        print(f'written {OUT.relative_to(ROOT)}')
        raise SystemExit(0)
    print(f"rule      {r.get('rule')}")
    print(f"trades    {r.get('trades')}  over {r.get('dayBets')} DAY-BETS  {r.get('span')}")
    print(f"stopped   {r.get('stoppedPct')}% of trades hit the {STOP_ATR} ATR stop")
    print(f"win rate  {r.get('winRateLegs')}% of legs (not the verdict -- a stop splits hit rate from expectancy)")
    print(f"net/day   {r.get('meanNetAtrPerDayBet')} ATR  CI {r.get('ci')}   gross {r.get('meanGrossAtrPerDayBet')}")
    print(f"VERDICT   {r.get('verdict')}"
          + (f" — {r.get('dayBets')} day-bets against a floor of {MIN_DAY_BETS}. NOT a null."
             if r.get('verdict') == 'UNTESTABLE' else ''))
    print(f'written {OUT.relative_to(ROOT)}')
