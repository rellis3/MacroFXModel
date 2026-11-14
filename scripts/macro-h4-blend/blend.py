"""macro-h4-blend (EXPLORATORY, not pre-registered; owner 2026-11-14: "the 4h rule should add into the weight but the
macro analysis should be the stronger factor").

Each London weekday with a Global Read row published before 07:00 London, per instrument:
  macro score = sign(Global Read card pUpStory - 0.5)  (|.| < 0.002 counts as no view)
              + sign(desk rating)                       (LONG +1, SHORT -1, FLAT/absent 0; desk runs from 2026-11-03)
  macro side  = sign(macro score)                       (0 = no macro view)
  h4 side     = sign of the 4h EMA20 slope from closed H1 bars (as in max-bias-reverse / h4-trend-hold)
Variants (all enter 07:00 London at the H1 open, exit 21:00 London or at a 1 x daily sigma stop, 0.03R cost):
  MACRO      macro side, 1R; no macro view = no trade
  H4         h4 side, 1R
  BLEND      macro side; 1R if h4 agrees, 0.5R if it disagrees; no macro view = no trade
  BLEND+     as BLEND, and on no-macro-view days the h4 side at 0.5R
Max Cole: his scored R (all filled signals) on the same instruments and days, Signal Copier outcomes. Aggregates only.

Inputs: <data_dir>/grrec.json (/api/global-read/record), deskrun_<date>.json, candles/<ASSET>_1h.json,
signal_copier_signals.json. Output: analysis/output/macro-h4-blend/RESULTS.md + results.json.
Run: python -I scripts/macro-h4-blend/blend.py <data_dir>
"""
import json, math, os, sys, glob, importlib.util, datetime as dt
from collections import defaultdict
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('h4', os.path.join(HERE, '..', 'h4-trend-hold', 'backtest.py'))
h4 = importlib.util.module_from_spec(spec); spec.loader.exec_module(h4)

LON = ZoneInfo('Europe/London')
COST = 0.03
GR2ASSET = {'GOLD': 'GOLD', 'NQ': 'NAS100', 'EURUSD': 'EURUSD', 'GBPUSD': 'GBPUSD', 'USDJPY': 'USDJPY',
            'AUDUSD': 'AUDUSD', 'USDCAD': 'USDCAD', 'USDCHF': 'USDCHF', 'NZDUSD': 'NZDUSD'}
DESKKEY = {'GOLD': 'GOLD', 'NAS100': 'NQ'}


def sgn(x):
    return 0 if not x else (1 if x > 0 else -1)


def day_trade(s, d, side, size, t7=None):
    """entry at t7 (default 07:00 London) -> 21:00 London, 1 daily sigma stop; R x size, cost included, or None"""
    t7, t21 = (t7 or h4.lon_ts(d, 7)), h4.lon_ts(d, 21)
    i7 = s.idx.get(t7)
    sg = s.sigma(t7)
    if i7 is None or not sg or side == 0:
        return None
    e = s.o[i7]; stop = e * (1 - side * sg); risk = e * sg
    j = i7
    while j < len(s.t) and s.t[j] < t21:
        if (side == 1 and s.l[j] <= stop) or (side == -1 and s.h[j] >= stop):
            return size * (-1 - COST)
        j += 1
    i21 = s.idx.get(t21)
    px = s.o[i21] if i21 is not None else s.close_at(t21)
    return None if px is None else size * (side * (px - e) / risk - COST)


def summ(rs):
    n = len(rs)
    if not n: return {'n': 0, 'sum': 0.0, 'mean': None, 'se': None}
    m = sum(rs) / n
    sd = math.sqrt(sum((x - m) ** 2 for x in rs) / (n - 1)) if n > 1 else 0
    return {'n': n, 'sum': sum(rs), 'mean': m, 'se': sd / math.sqrt(n) if n > 1 else None, 'win': sum(x > 0 for x in rs) / n}


def main(data):
    SS = {os.path.basename(p).split('_')[0]: h4.S(json.load(open(p))['candles']) for p in glob.glob(os.path.join(data, 'candles', '*_1h.json'))}
    gr = json.load(open(os.path.join(data, 'grrec.json')))['rows']
    desks = {}
    for p in glob.glob(os.path.join(data, 'deskrun_*.json')):
        try:
            x = json.load(open(p))
            if x.get('head', {}).get('book'): desks[os.path.basename(p)[8:18]] = x['head']['book']
        except Exception:
            pass
    R = json.load(open(os.path.join(data, 'signal_copier_signals.json')))['data']['records']
    maxr = defaultdict(float)
    for r in R:
        a = h4.SYM.get(r['symbol']); o = r.get('out') or {}
        if a and o.get('state') == 'done' and o.get('r') is not None:
            maxr[(dt.datetime.fromtimestamp(r['posted_ts'], LON).date(), a)] += o['r']

    rows, skipped_late = [], 0
    for g in gr:
        d = dt.date.fromisoformat(g['day'])
        at = dt.datetime.fromisoformat(g['at'].replace('Z', '+00:00')).timestamp()
        t_in = h4.lon_ts(d, 7)
        if at >= t_in:              # read published after 07:00 London: enter at the first H1 open after publication
            t_in = (int(at) // 3600 + 1) * 3600
            skipped_late += 1
        if t_in >= h4.lon_ts(d, 12):
            continue
        book = desks.get(g['day'])
        for k, card in g['cards'].items():
            a = GR2ASSET.get(k)
            if not a or a not in SS: continue
            s = SS[a]
            story = card.get('pUpStory')
            ms = 0 if story is None or abs(story - 0.5) < 0.002 else sgn(story - 0.5)
            ds = 0
            if book:
                c = book.get('instruments', {}).get(DESKKEY.get(a, a))
                if c:
                    rt = str(c.get('rating', '')).upper()
                    ds = 1 if 'LONG' in rt else (-1 if 'SHORT' in rt else 0)
            macro = sgn(ms + ds)
            h = s.slope(t_in)
            rows.append({'d': d, 'a': a, 'macro': macro, 'h4': h, 'story': ms, 'desk': ds,
                         'MACRO': day_trade(s, d, macro, 1, t_in) if macro else None,
                         'H4': day_trade(s, d, h, 1, t_in) if h else None,
                         'BLEND': day_trade(s, d, macro, 1 if h == macro else 0.5, t_in) if macro else None,
                         'BLEND+': (day_trade(s, d, macro, 1 if h == macro else 0.5, t_in) if macro else day_trade(s, d, h, 0.5, t_in) if h else None),
                         'max': maxr.get((d, a))})

    V = ('MACRO', 'H4', 'BLEND', 'BLEND+')
    res = {'study': 'macro-h4-blend', 'status': 'EXPLORATORY (not pre-registered)',
           'days': sorted({r['d'].isoformat() for r in rows}), 'instrument_days': len(rows), 'gr_rows_after_0700_entry_moved': skipped_late,
           'macro_view_share': sum(1 for r in rows if r['macro']) / len(rows) if rows else None,
           'macro_h4_agree_share': (sum(1 for r in rows if r['macro'] and r['h4'] == r['macro']) / max(1, sum(1 for r in rows if r['macro'] and r['h4']))),
           'all_days': {v: summ([r[v] for r in rows if r[v] is not None]) for v in V},
           'max_days': {}}
    md = [r for r in rows if r['max'] is not None]
    res['max_days'] = {'n': len(md), 'max': summ([r['max'] for r in md]),
                       **{v: summ([r[v] for r in md if r[v] is not None]) for v in V}}
    out = 'analysis/output/macro-h4-blend'
    os.makedirs(out, exist_ok=True)
    json.dump(res, open(os.path.join(out, 'results.json'), 'w'), indent=1, default=str)

    f = lambda x: '—' if x is None else f'{x:+.3f}'
    pc = lambda x: '—' if x is None else f'{100 * x:.0f}%'
    L = ['# macro-h4-blend: macro sets the side, the 4h trend sets the size', '',
         f"**EXPLORATORY, not pre-registered** (owner 2026-11-14). {len(res['days'])} London days "
         f"({res['days'][0]} to {res['days'][-1]}), {len(rows)} instrument-days on {len(set(r['a'] for r in rows))} instruments. "
         f"Macro had a view on {pc(res['macro_view_share'])} of them; where both spoke, the 4h trend agreed with macro "
         f"{pc(res['macro_h4_agree_share'])}. Days whose Global Read came after 07:00 London (entry moved to the first H1 open after publication): {skipped_late}. "
         'Day trades from 07:00 London (or the first hour after the read) to 21:00, 1 daily σ stop, 0.03R cost. Aggregates only.', '',
         '## Every instrument-day', '', '| Variant | Trades | Total R | Mean R [±1 SE] | Win |', '|---|---|---|---|---|']
    for v in V:
        x = res['all_days'][v]
        if x['n']: L.append(f"| {v} | {x['n']} | {x['sum']:+.1f} | {f(x['mean'])} [±{x['se']:.3f}] | {pc(x.get('win'))} |")
    m = res['max_days']
    L += ['', f"## On the instrument-days Max traded ({m['n']})", '', '| Who | Trades | Total R | Mean R |', '|---|---|---|---|',
          f"| Max (all his filled signals those days) | {m['max']['n']} | {m['max']['sum']:+.1f} | {f(m['max']['mean'])} |"]
    for v in V:
        x = m[v]
        L.append(f"| {v} | {x['n']} | {x['sum']:+.1f} | {f(x['mean'])} |")
    open(os.path.join(out, 'RESULTS.md'), 'w').write('\n'.join(L) + '\n')
    print('\n'.join(L))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
