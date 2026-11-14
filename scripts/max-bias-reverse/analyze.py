"""max-bias-reverse (EXPLORATORY, not pre-registered): what did the charts and the desk show just before Max Cole
posted each signal, and which readings point the same way as his side more often than a coin?

Inputs (all in one data directory, nothing committed because the signals are a paid group's content):
  signal_copier_signals.json   KV signal_copier_signals (dashboard /api/kv/get?key=signal_copier_signals)
  candles/<ASSET>_1h.json      OANDA H1 mid via the dashboard /api/cog-chart/candles?asset=<ASSET>&tf=1h&count=5000
  deskrun_<YYYY-MM-DD>.json    /api/desk-run?date=<date> (optional; desk features only where present)

Output: analysis/output/max-bias-reverse/RESULTS.md + results.json, aggregates only (no trade list, no prices).

Unit: Max's FIRST signal per instrument per London day (his bias for that market that day). Crypto is skipped
(no candles on the dashboard feed). Every feature uses only H1 bars that had CLOSED before the post time.

Run: python -I scripts/max-bias-reverse/analyze.py <data_dir>
"""
import json, math, sys, os, glob, datetime as dt
from collections import defaultdict
from zoneinfo import ZoneInfo

LON = ZoneInfo('Europe/London')
SYM = {'GOLD': 'GOLD', 'XAUUSD': 'GOLD', 'NAS100': 'NAS100', 'SP500': 'SPX500', 'US30': 'US30', 'DJI30': 'US30',
       'EURUSD': 'EURUSD', 'GBPUSD': 'GBPUSD', 'USDJPY': 'USDJPY', 'USDCAD': 'USDCAD', 'AUDUSD': 'AUDUSD',
       'NZDUSD': 'NZDUSD', 'USDCHF': 'USDCHF', 'EURJPY': 'EURJPY', 'GBPJPY': 'GBPJPY'}
DESK = {'GOLD': 'GOLD', 'NAS100': 'NQ', 'SPX500': 'SPX500', 'US30': 'US30'}
GROUP = lambda a: 'gold' if a == 'GOLD' else ('indices' if a in ('NAS100', 'SPX500', 'US30') else 'fx')
# +1 if the instrument rises when the US dollar strengthens, -1 if it falls, None if not a USD instrument
USD_SIGN = {'GOLD': -1, 'EURUSD': -1, 'GBPUSD': -1, 'AUDUSD': -1, 'NZDUSD': -1, 'USDJPY': 1, 'USDCAD': 1, 'USDCHF': 1}
USD_BASKET = {'EURUSD': -1, 'GBPUSD': -1, 'AUDUSD': -1, 'NZDUSD': -1, 'USDJPY': 1, 'USDCAD': 1, 'USDCHF': 1}


def sgn(x):
    return 0 if x is None or x == 0 else (1 if x > 0 else -1)


def ema(xs, n):
    k, e = 2 / (n + 1), None
    for x in xs:
        e = x if e is None else e + k * (x - e)
    return e


def wilson(k, n, z=1.96):
    if n == 0:
        return (None, None)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


class Series:
    def __init__(self, candles):
        self.t = [c['t'] for c in candles]          # bar open, seconds UTC
        self.c = [c['c'] for c in candles]
        self.o = [c['o'] for c in candles]

    def upto(self, T):
        """index one past the last H1 bar that closed at or before T"""
        lo, hi = 0, len(self.t)
        while lo < hi:
            m = (lo + hi) // 2
            if self.t[m] + 3600 <= T:
                lo = m + 1
            else:
                hi = m
        return lo

    def close_at(self, T):
        i = self.upto(T)
        return self.c[i - 1] if i else None

    def ret(self, T, hours):
        a, b = self.close_at(T - hours * 3600), self.close_at(T)
        return None if a is None or b is None else math.log(b / a)


def h4_closes(s, i):
    """4-hour closes from H1 closes up to index i, buckets aligned to 00/04/08/... UTC"""
    out, cur = [], None
    for j in range(max(0, i - 4 * 80), i):
        b = s.t[j] // 14400
        if b != cur:
            out.append(s.c[j]); cur = b
        else:
            out[-1] = s.c[j]
    return out


def last_utc_hour_before(T, hour):
    d = dt.datetime.fromtimestamp(T, dt.timezone.utc).replace(minute=0, second=0, microsecond=0)
    cand = d.replace(hour=hour)
    if cand.timestamp() > T:
        cand -= dt.timedelta(days=1)
    while cand.weekday() >= 5:            # skip weekend anchors
        cand -= dt.timedelta(days=1)
    return int(cand.timestamp())


def features(S, asset, T, desk):
    s = S[asset]
    i = s.upto(T)
    if i < 500:
        return None
    px = s.c[i - 1]
    f = {}
    h1 = s.c[i - 200:i]
    f['h1_trend (close vs EMA20, 1h)'] = sgn(px - ema(h1, 20))
    h4 = h4_closes(s, i)
    e4 = ema(h4, 20)
    e4_prev = ema(h4[:-3], 20)
    f['h4_trend (close vs EMA20, 4h)'] = sgn(h4[-1] - e4)
    f['h4_slope (EMA20 rising/falling, 4h)'] = sgn(e4 - e4_prev)
    f['h4_ema50 (close vs EMA50, 4h)'] = sgn(h4[-1] - ema(h4, 50))
    f['ret_24h'] = sgn(s.ret(T, 24))
    f['ret_5d (120h)'] = sgn(s.ret(T, 120))
    f['ret_20d (480h)'] = sgn(s.ret(T, 480))
    c21 = last_utc_hour_before(T, 21)                 # ~ the New York close in winter
    prev_c21 = last_utc_hour_before(c21 - 1, 21)
    a, b = s.close_at(prev_c21), s.close_at(c21)
    f['prev_day (21:00 UTC to 21:00 UTC)'] = sgn(None if a is None or b is None else b - a)
    f['overnight (since 21:00 UTC to post)'] = sgn(None if b is None else px - b)
    # US dollar overnight move from the FX basket, mapped onto this instrument
    if asset in USD_SIGN:
        usd = []
        for p, w in USD_BASKET.items():
            if p in S:
                sp = S[p]
                x0, x1 = sp.close_at(c21), sp.close_at(T)
                if x0 and x1:
                    usd.append(w * math.log(x1 / x0))
        f['usd_overnight (basket, mapped)'] = sgn(USD_SIGN[asset] * sum(usd)) if usd else None
        usd5 = []
        for p, w in USD_BASKET.items():
            if p in S:
                r = S[p].ret(T, 120)
                if r is not None:
                    usd5.append(w * r)
        f['usd_5d (basket, mapped)'] = sgn(USD_SIGN[asset] * sum(usd5)) if usd5 else None
    if desk:
        inst = desk['head']['book'].get('instruments', {})
        k = DESK.get(asset, asset)
        if k in inst:
            r = str(inst[k].get('rating', '')).upper()
            f['desk_rating (LONG/SHORT; FLAT = none)'] = 1 if 'LONG' in r else (-1 if 'SHORT' in r else None)
        cur = desk['head']['book'].get('currencies', {})
        if len(asset) == 6 and asset[:3] in cur and asset[3:] in cur:
            bb, qb = cur[asset[:3]].get('bias'), cur[asset[3:]].get('bias')
            if bb is not None and qb is not None:
                f['desk_ccy (base bias - quote bias)'] = sgn(bb - qb) or None
        if asset == 'GOLD' and 'USD' in cur and cur['USD'].get('bias') is not None:
            f['desk_ccy (base bias - quote bias)'] = sgn(-cur['USD']['bias']) or None
    return f


def main(data):
    R = json.load(open(os.path.join(data, 'signal_copier_signals.json')))['data']['records']
    S = {}
    for p in glob.glob(os.path.join(data, 'candles', '*_1h.json')):
        a = os.path.basename(p).split('_')[0]
        S[a] = Series(json.load(open(p))['candles'])
    desks = {}
    for p in glob.glob(os.path.join(data, 'deskrun_*.json')):
        try:
            d = json.load(open(p))
            if d.get('head', {}).get('book'):
                desks[os.path.basename(p)[8:18]] = d
        except Exception:
            pass

    first = {}
    for r in sorted(R, key=lambda r: r['posted_ts']):
        a = SYM.get(r['symbol'])
        if not a or a not in S:
            continue
        day = dt.datetime.fromtimestamp(r['posted_ts'], LON).date().isoformat()
        key = (day, a)
        if key not in first:
            first[key] = r

    rows = []
    for (day, a), r in first.items():
        f = features(S, a, r['posted_ts'], desks.get(day))
        if f is None:
            continue
        side = 1 if r['side'] == 'BUY' else -1
        out = r.get('out') or {}
        rows.append({'day': day, 'asset': a, 'group': GROUP(a), 'side': side, 'style': r.get('style'),
                     'r': out.get('r') if out.get('state') == 'done' else None, 'f': f})

    feats = sorted({k for x in rows for k in x['f']})
    table = []
    for k in feats:
        res = {}
        for g in ('all', 'gold', 'fx', 'indices'):
            sub = [x for x in rows if (g == 'all' or x['group'] == g) and x['f'].get(k) not in (None, 0)]
            n = len(sub)
            agree = sum(1 for x in sub if x['f'][k] == x['side'])
            lo, hi = wilson(agree, n)
            ra = [x['r'] for x in sub if x['f'][k] == x['side'] and x['r'] is not None]
            rd = [x['r'] for x in sub if x['f'][k] != x['side'] and x['r'] is not None]
            res[g] = {'n': n, 'agree': agree, 'pct': (agree / n if n else None), 'ci': [lo, hi],
                      'r_when_agree': (sum(ra) / len(ra) if ra else None), 'n_r_agree': len(ra),
                      'r_when_disagree': (sum(rd) / len(rd) if rd else None), 'n_r_disagree': len(rd)}
        table.append({'feature': k, **res})

    # Majority of the price features (trend-following vote), a simple "chart reader"
    price_keys = [k for k in feats if not k.startswith('desk')]
    vote_rows = []
    for x in rows:
        v = sum(x['f'][k] for k in price_keys if x['f'].get(k) not in (None,))
        if v != 0:
            vote_rows.append((sgn(v), x))
    va = sum(1 for v, x in vote_rows if v == x['side'])

    days = sorted({x['day'] for x in rows})
    res = {'study': 'max-bias-reverse', 'status': 'EXPLORATORY (not pre-registered)', 'seed': None,
           'n_instrument_days': len(rows), 'n_days': len(days), 'first_day': days[0] if days else None,
           'last_day': days[-1] if days else None,
           'by_group': {g: sum(1 for x in rows if x['group'] == g) for g in ('gold', 'fx', 'indices')},
           'buy_share': sum(1 for x in rows if x['side'] == 1) / len(rows) if rows else None,
           'features': table,
           'price_vote': {'n': len(vote_rows), 'agree': va, 'pct': va / len(vote_rows) if vote_rows else None,
                          'ci': list(wilson(va, len(vote_rows)))}}
    out = 'analysis/output/max-bias-reverse'
    os.makedirs(out, exist_ok=True)
    json.dump(res, open(os.path.join(out, 'results.json'), 'w'), indent=1)

    def pc(v):
        return '—' if v is None else f'{100 * v:.0f}%'

    def rr(v):
        return '—' if v is None else f'{v:+.2f}'

    L = ['# max-bias-reverse: what the charts showed when Max picked his side', '',
         '**EXPLORATORY, not pre-registered.** Owner question 2026-11-14. Aggregates only: his signals are a paid',
         "group's content, so no trade list or prices are stored here.", '',
         f"- Unit: his first signal per instrument per London day, crypto excluded: **{len(rows)} instrument-days over "
         f"{len(days)} days** ({res['first_day']} to {res['last_day']}); gold {res['by_group']['gold']}, FX "
         f"{res['by_group']['fx']}, indices {res['by_group']['indices']}. Buys {pc(res['buy_share'])}.",
         '- Every reading uses only OANDA H1 bars that had closed before he posted (dashboard feed).',
         '- "Agree" = the reading points the same way as his side. 50% = a coin. Above 50% = he follows it; below = he fades it.',
         '- Days are not independent (one view runs across several instruments on a day), so the intervals are too narrow.', '',
         '| Reading | All: agree (n) [95% CI] | Gold | FX | Indices | R when agree / disagree (all) |',
         '|---|---|---|---|---|---|']
    for t in sorted(table, key=lambda t: -abs((t['all']['pct'] or 0.5) - 0.5)):
        a = t['all']
        ci = '' if a['ci'][0] is None else f" [{100 * a['ci'][0]:.0f}–{100 * a['ci'][1]:.0f}]"
        L.append(f"| {t['feature']} | {pc(a['pct'])} ({a['n']}){ci} | {pc(t['gold']['pct'])} ({t['gold']['n']}) | "
                 f"{pc(t['fx']['pct'])} ({t['fx']['n']}) | {pc(t['indices']['pct'])} ({t['indices']['n']}) | "
                 f"{rr(a['r_when_agree'])} ({a['n_r_agree']}) / {rr(a['r_when_disagree'])} ({a['n_r_disagree']}) |")
    pv = res['price_vote']
    L += ['', f"**Simple chart reader** (majority vote of all the price readings above): agrees with his side "
          f"{pc(pv['pct'])} of {pv['n']} instrument-days [{100 * (pv['ci'][0] or 0):.0f}–{100 * (pv['ci'][1] or 0):.0f}].", '']
    open(os.path.join(out, 'RESULTS.md'), 'w').write('\n'.join(L) + '\n')
    print('\n'.join(L))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
