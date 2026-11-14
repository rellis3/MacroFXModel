"""h4-trend-hold (EXPLORATORY, not pre-registered; owner 2026-11-14).

Rule, per instrument:
  07:00 London: if flat, enter in the direction of the 4h EMA20 slope (EMA20 of 4h closes now minus 3 4h-bars ago,
                4h buckets 00/04/08/... UTC from closed H1 bars; the same reading as max-bias-reverse).
                Entry = open of the 07:00 London H1 bar. Risk 1R = stop at 1 x daily sigma (stdev of the last 20
                daily (24h) log returns, known at entry) from entry.
  Intraday:     the stop is checked on every H1 high/low (stop first, no target).
  21:00 London: variant DAY  -> always exit at the 21:00 bar open.
                variant HOLD -> re-read the 4h slope from bars closed by 21:00; same sign = hold overnight (stop
                unchanged), else exit. Every position is closed at Friday 21:00 London (no weekend holds).
  Costs:        0.03R per round trip.

Comparison with Max Cole: on the instrument-days where he posted (first signal per instrument per London day, crypto
excluded), the R of our trade entered that morning (held to its exit) vs his scored R that day (Signal Copier outcomes,
one spread charged). Aggregates only.

Inputs: <data_dir>/candles/<ASSET>_1h.json (dashboard /api/cog-chart/candles, OANDA H1 mid) and
<data_dir>/signal_copier_signals.json. Output: analysis/output/h4-trend-hold/RESULTS.md + results.json.
Run: python -I scripts/h4-trend-hold/backtest.py <data_dir>
"""
import json, math, os, sys, glob, random, datetime as dt
from collections import defaultdict
from zoneinfo import ZoneInfo

LON = ZoneInfo('Europe/London')
COST = 0.03
LOCKBOX = dt.date(2026, 8, 21)
MAX_START = dt.date(2026, 10, 7)
SYM = {'GOLD': 'GOLD', 'XAUUSD': 'GOLD', 'NAS100': 'NAS100', 'SP500': 'SPX500', 'US30': 'US30', 'DJI30': 'US30',
       'EURUSD': 'EURUSD', 'GBPUSD': 'GBPUSD', 'USDJPY': 'USDJPY', 'USDCAD': 'USDCAD', 'AUDUSD': 'AUDUSD',
       'NZDUSD': 'NZDUSD', 'USDCHF': 'USDCHF', 'EURJPY': 'EURJPY', 'GBPJPY': 'GBPJPY'}
GROUP = lambda a: 'gold' if a == 'GOLD' else ('indices' if a in ('NAS100', 'SPX500', 'US30') else 'fx')


def ema(xs, n):
    k, e = 2 / (n + 1), None
    for x in xs:
        e = x if e is None else e + k * (x - e)
    return e


class S:
    def __init__(self, c):
        self.t = [x['t'] for x in c]; self.o = [x['o'] for x in c]; self.h = [x['h'] for x in c]
        self.l = [x['l'] for x in c]; self.c = [x['c'] for x in c]
        self.idx = {t: i for i, t in enumerate(self.t)}

    def upto(self, T):
        lo, hi = 0, len(self.t)
        while lo < hi:
            m = (lo + hi) // 2
            if self.t[m] + 3600 <= T: lo = m + 1
            else: hi = m
        return lo

    def close_at(self, T):
        i = self.upto(T)
        return self.c[i - 1] if i else None

    def slope(self, T):
        i = self.upto(T)
        if i < 400: return 0
        out, cur = [], None
        for j in range(i - 320, i):
            b = self.t[j] // 14400
            if b != cur: out.append(self.c[j]); cur = b
            else: out[-1] = self.c[j]
        d = ema(out, 20) - ema(out[:-3], 20)
        return 0 if d == 0 else (1 if d > 0 else -1)

    def sigma(self, T):
        xs = [self.close_at(T - k * 86400) for k in range(0, 22)]
        if any(x is None for x in xs): return None
        r = [math.log(xs[k] / xs[k + 1]) for k in range(21)]
        m = sum(r) / len(r)
        return math.sqrt(sum((x - m) ** 2 for x in r) / (len(r) - 1))


def lon_ts(d, hour):
    return int(dt.datetime(d.year, d.month, d.day, hour, tzinfo=LON).timestamp())


def simulate(s, days, variant):
    """returns trades: dict(entry_day, side, r, exit_reason, nights)"""
    trades, pos = [], None
    for d in days:
        t7, t21 = lon_ts(d, 7), lon_ts(d, 21)
        i7 = s.idx.get(t7)
        if pos is None and i7 is not None:
            side, sg = s.slope(t7), s.sigma(t7)
            if side != 0 and sg:
                e = s.o[i7]
                pos = {'entry_day': d, 'side': side, 'entry': e, 'stop': e * (1 - side * sg), 'risk': e * sg, 'nights': 0}
        if pos is None:
            continue
        # walk H1 bars from the later of entry or 00:00 today to 21:00
        start = lon_ts(d, 7) if pos['entry_day'] == d else lon_ts(d, 0) - 3 * 3600
        j = s.upto(start)
        stopped = False
        while j < len(s.t) and s.t[j] < t21:
            if s.t[j] >= start:
                if (pos['side'] == 1 and s.l[j] <= pos['stop']) or (pos['side'] == -1 and s.h[j] >= pos['stop']):
                    trades.append({**pos, 'r': -1 - COST, 'exit': 'stop'}); pos = None; stopped = True; break
            j += 1
        if stopped:
            continue
        i21 = s.idx.get(t21)
        px = s.o[i21] if i21 is not None else s.close_at(t21)
        if px is None:
            continue
        hold = variant == 'HOLD' and d.weekday() != 4 and s.slope(t21) == pos['side']
        if hold:
            pos['nights'] += 1
        else:
            trades.append({**pos, 'r': pos['side'] * (px - pos['entry']) / pos['risk'] - COST, 'exit': 'review' if variant == 'HOLD' else 'close21'})
            pos = None
    return trades


def summ(rs):
    n = len(rs)
    if not n: return {'n': 0}
    m = sum(rs) / n
    sd = math.sqrt(sum((x - m) ** 2 for x in rs) / (n - 1)) if n > 1 else 0
    return {'n': n, 'sum': sum(rs), 'mean': m, 'se': sd / math.sqrt(n) if n > 1 else None, 'win': sum(x > 0 for x in rs) / n}


def main(data):
    random.seed(20261114)
    SS = {os.path.basename(p).split('_')[0]: S(json.load(open(p))['candles']) for p in glob.glob(os.path.join(data, 'candles', '*_1h.json'))}
    R = json.load(open(os.path.join(data, 'signal_copier_signals.json')))['data']['records']
    first_day = max(dt.datetime.fromtimestamp(s.t[0] + 30 * 86400, dt.timezone.utc).date() for s in SS.values())
    last_day = min(dt.datetime.fromtimestamp(s.t[-1], dt.timezone.utc).date() for s in SS.values()) - dt.timedelta(days=1)
    days = [first_day + dt.timedelta(k) for k in range((last_day - first_day).days + 1)]
    days = [d for d in days if d.weekday() < 5]

    res = {'study': 'h4-trend-hold', 'status': 'EXPLORATORY (not pre-registered)', 'seed': 20261114,
           'span': [first_day.isoformat(), last_day.isoformat()], 'cost_r': COST, 'windows': {}}
    T = {v: {a: simulate(s, days, v) for a, s in SS.items()} for v in ('DAY', 'HOLD')}

    windows = {'pre-lockbox': (first_day, LOCKBOX - dt.timedelta(1)),
               'lockbox-to-max': (LOCKBOX, MAX_START - dt.timedelta(1)),
               'max-period': (MAX_START, last_day)}
    for w, (a0, a1) in windows.items():
        res['windows'][w] = {'from': a0.isoformat(), 'to': a1.isoformat()}
        for v in ('DAY', 'HOLD'):
            allr = [t['r'] for a in T[v] for t in T[v][a] if a0 <= t['entry_day'] <= a1]
            by = {g: summ([t['r'] for a in T[v] if GROUP(a) == g for t in T[v][a] if a0 <= t['entry_day'] <= a1]) for g in ('gold', 'fx', 'indices')}
            nights = [t['nights'] for a in T[v] for t in T[v][a] if a0 <= t['entry_day'] <= a1]
            res['windows'][w][v] = {'all': summ(allr), 'by_group': by, 'mean_nights': (sum(nights) / len(nights) if nights else None),
                                    'instruments': len(SS)}

    # Head to head on Max's instrument-days
    first = {}
    maxr = defaultdict(float)
    for r in sorted(R, key=lambda r: r['posted_ts']):
        a = SYM.get(r['symbol'])
        if not a or a not in SS: continue
        d = dt.datetime.fromtimestamp(r['posted_ts'], LON).date()
        first.setdefault((d, a), r)
        o = r.get('out') or {}
        if o.get('state') == 'done' and o.get('r') is not None:
            maxr[(d, a)] += o['r']
    h2h = {}
    for v in ('DAY', 'HOLD'):
        ours = {(t['entry_day'], a): t for a in T[v] for t in T[v][a]}
        rows = []
        for (d, a), r in first.items():
            o = r.get('out') or {}
            if (d, a) in ours and o.get('state') == 'done':
                rows.append({'ours': ours[(d, a)]['r'], 'max_first': o['r'], 'max_day': maxr[(d, a)],
                             'same_side': ours[(d, a)]['side'] == (1 if r['side'] == 'BUY' else -1), 'g': GROUP(a)})
        h2h[v] = {'n': len(rows), 'ours': summ([x['ours'] for x in rows]), 'max_first_signal': summ([x['max_first'] for x in rows]),
                  'max_all_signals_that_day': summ([x['max_day'] for x in rows]),
                  'same_side_share': (sum(x['same_side'] for x in rows) / len(rows) if rows else None)}
    res['head_to_head_max_days'] = h2h
    # Max's own totals over the period on these instruments (all filled signals, any day)
    allmax = [((r.get('out') or {}).get('r')) for r in R if SYM.get(r['symbol']) in SS and (r.get('out') or {}).get('state') == 'done']
    res['max_total_period'] = summ([x for x in allmax if x is not None])

    out = 'analysis/output/h4-trend-hold'
    os.makedirs(out, exist_ok=True)
    json.dump(res, open(os.path.join(out, 'results.json'), 'w'), indent=1, default=str)

    f = lambda x, p=2: '—' if x is None else f'{x:+.{p}f}'
    pc = lambda x: '—' if x is None else f'{100 * x:.0f}%'
    L = ['# h4-trend-hold: 07:00 entry on the 4h trend, 21:00 review, vs Max Cole', '',
         '**EXPLORATORY, not pre-registered** (owner 2026-11-14). OANDA H1 mid from the dashboard feed, '
         f"{len(SS)} instruments (gold, 9 FX, NAS100/SPX500/US30), {res['span'][0]} to {res['span'][1]}. 1R = 1 daily σ stop; "
         f'{COST}R cost per round trip. Rule and readings in the script docstring. Aggregates only.', '',
         '## All instruments, every weekday', '',
         '| Window | Variant | Trades | Total R | Mean R [±1 SE] | Win | Avg nights held | Gold / FX / Indices mean R |',
         '|---|---|---|---|---|---|---|---|']
    for w in windows:
        for v in ('DAY', 'HOLD'):
            x = res['windows'][w][v]; a = x['all']; b = x['by_group']
            if not a.get('n'): continue
            L.append(f"| {w} ({res['windows'][w]['from']} → {res['windows'][w]['to']}) | {v} | {a['n']} | {a['sum']:+.1f} | "
                     f"{a['mean']:+.3f} [±{a['se']:.3f}] | {pc(a['win'])} | {f(x['mean_nights'], 1)} | "
                     f"{f(b['gold'].get('mean'), 3)} / {f(b['fx'].get('mean'), 3)} / {f(b['indices'].get('mean'), 3)} |")
    L += ['', "## Head to head on Max's instrument-days (his first signal per instrument per day, crypto excluded)", '',
          '| Variant | Instrument-days | Our R (total, mean) | Max first signal R (total, mean) | Max all signals that day (total) | Same side |',
          '|---|---|---|---|---|---|']
    for v in ('DAY', 'HOLD'):
        x = h2h[v]
        if not x['n']: continue
        L.append(f"| {v} | {x['n']} | {x['ours']['sum']:+.1f}, {x['ours']['mean']:+.3f} | {x['max_first_signal']['sum']:+.1f}, "
                 f"{x['max_first_signal']['mean']:+.3f} | {x['max_all_signals_that_day']['sum']:+.1f} | {pc(x['same_side_share'])} |")
    m = res['max_total_period']
    L += ['', f"Max's whole record on these instruments over the period (every filled signal): {m['n']} trades, "
          f"{m['sum']:+.1f}R, mean {m['mean']:+.3f}R.", '']
    open(os.path.join(out, 'RESULTS.md'), 'w').write('\n'.join(L) + '\n')
    print('\n'.join(L))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
