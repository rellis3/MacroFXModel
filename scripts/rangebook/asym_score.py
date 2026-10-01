"""Tight stop, far target — forge/ASYMMETRIC_TRADES_PREREG.md (+ IV/RV and skew amendment).
    python scripts/rangebook/asym_score.py > analysis/output/rangebook/ASYMMETRIC_TRADES_RESULTS.md
"""
import json, math
import numpy as np
from statistics import NormalDist
from crosspair_buckets import ALL

IDX = ['nq', 'spx', 'dow', 'us2000', 'de30', 'uk100']
SETS = {'16 FX + gold': ALL, '6 indices': IDX}
SPLIT = '2023-01-01'; N = NormalDist()
CELLS = [(ty, s, tg) for ty in ('HOLD', 'BREAK', 'DOPEN') for s in ('0.1', '0.2') for tg in ('r5', 'r10', 'far')]
CV = {'audusd': 'AUDUSD', 'eurusd': 'EURUSD', 'gbpusd': 'GBPUSD', 'usdcad': 'USDCAD', 'usdchf': 'USDCHF', 'usdjpy': 'USDJPY', 'gold': 'XAUUSD'}

# IV/RV and skew per CVOL instrument and London date (rows dated strictly before the date)
cv = json.load(open('js/data/cmeCvolEod.json'))['series']
ivrv, skew = {}, {}
for p, k in CV.items():
    rows = cv[k]; dates = [r['date'] for r in rows]; u = np.array([r['underlying'] or np.nan for r in rows], float)
    lr = np.diff(np.log(u)); m = {}
    for i in range(21, len(rows)):
        rv = np.nanstd(lr[i - 20:i], ddof=1) * math.sqrt(252) * 100
        m[dates[i]] = (rows[i]['cvol'] / rv if rv > 0 else None, rows[i]['skew'])
    ivrv[p] = (dates, m)
def ivinfo(p, date):
    if p not in ivrv: return None, None
    dates, m = ivrv[p]; import bisect
    i = bisect.bisect_left(dates, date) - 1
    return m.get(dates[i], (None, None)) if i >= 0 else (None, None)

def load(pairs):
    T = []
    for p in pairs:
        for t in json.load(open(f'analysis/output/rangebook/{p}_asym.json'))['rows']:
            t['inst'] = p; t['ivrv'], sk = ivinfo(p, t['date']); t['skewAl'] = None if sk is None else sk * t['dir']
            T.append(t)
    return T
def stats(v, h2):
    v = np.asarray(v, float); h2 = np.asarray(h2, bool)
    if len(v) < 3: return None
    return {'n': len(v), 'R': float(v.mean()), 't': float(v.mean() / v.std(ddof=1) * math.sqrt(len(v))),
            'h1': float(v[~h2].mean()) if (~h2).any() else None, 'h2': float(v[h2].mean()) if h2.any() else None}

res = {}
for sname, pairs in SETS.items():
    T = load(pairs); res[sname] = {}
    ivs = np.array([t['ivrv'] for t in T if t['ivrv'] is not None and t['date'] < SPLIT], float)
    ive = np.nanpercentile(ivs, [100 / 3, 200 / 3]) if len(ivs) else None
    for ty, s, tg in CELLS:
        sel = [t for t in T if t['type'] == ty and t.get('s' + s) and t['s' + s].get(tg)]
        if not sel: continue
        R = [t['s' + s][tg]['R'] for t in sel]; h2 = [t['date'] >= SPLIT for t in sel]
        st = stats(R, h2)
        st['win'] = float(np.mean([t['s' + s][tg]['out'] == 'target' for t in sel]))
        pay = [(t['s' + s][tg]['R'] + t['s' + s]['costR']) for t in sel if t['s' + s][tg]['out'] == 'target']   # gross R of a win
        st['be'] = float(1 / (1 + np.mean(pay))) if pay else None
        st['costR'] = float(np.mean([t['s' + s]['costR'] for t in sel]))
        st['short'] = stats([t['s' + s][tg]['R'] for t in sel if t['dir'] < 0], [t['date'] >= SPLIT for t in sel if t['dir'] < 0])
        st['long'] = stats([t['s' + s][tg]['R'] for t in sel if t['dir'] > 0], [t['date'] >= SPLIT for t in sel if t['dir'] > 0])
        st['reg'] = {g: (stats([t['s' + s][tg]['R'] for t in sel if t['reg'] == g], [t['date'] >= SPLIT for t in sel if t['reg'] == g]) or {}).get('R') for g in ('quiet', 'normal', 'heavy')}
        if ive is not None:
            b = lambda x: None if x is None else 'low' if x < ive[0] else 'mid' if x < ive[1] else 'high'
            st['ivrv'] = {g: (stats([t['s' + s][tg]['R'] for t in sel if b(t['ivrv']) == g], [0] * sum(b(t['ivrv']) == g for t in sel)) or {}).get('R') for g in ('low', 'mid', 'high')}
            st['skew'] = {g: (stats([t['s' + s][tg]['R'] for t in sel if t['skewAl'] is not None and (t['skewAl'] > 0) == (g == 'with')], [0] * sum(1 for t in sel if t['skewAl'] is not None and (t['skewAl'] > 0) == (g == 'with'))) or {}).get('R') for g in ('with', 'against')}
        res[sname][(ty, s, tg)] = st
    # per-instrument headline for gold / EURUSD / NQ
    for p in ('gold', 'eurusd', 'nq'):
        if p in pairs:
            Tp = [t for t in T if t['inst'] == p]
            res[sname][('alone', p)] = {f'{ty} {s}σ {tg}': (stats([t['s' + s][tg]['R'] for t in Tp if t['type'] == ty and t.get('s' + s) and t['s' + s].get(tg)],
                                                               [t['date'] >= SPLIT for t in Tp if t['type'] == ty and t.get('s' + s) and t['s' + s].get(tg)]) or {}) for ty, s, tg in CELLS}
    print(sname, 'done', flush=True)

tests = sorted((1 - N.cdf(v['t']), sname, k) for sname, r in res.items() for k, v in r.items() if k[0] != 'alone')
M = len(tests); cut = 0
for i, (pv, *_) in enumerate(tests, 1):
    if pv <= 0.10 * i / M: cut = i
bh = {(a, b) for _, a, b in tests[:cut]}
other = {'16 FX + gold': '6 indices', '6 indices': '16 FX + gold'}
for sname, r in res.items():
    for k, v in r.items():
        if k[0] == 'alone': continue
        o = res[other[sname]].get(k)
        ok = (sname, k) in bh and v['h1'] is not None and v['h1'] > 0 and v['h2'] > 0 and o and o['R'] > 0
        if sname == '6 indices': ok = ok and v['short'] and v['short']['h1'] > 0 and v['short']['h2'] > 0
        v['pass'] = bool(ok)

f3 = lambda x: '–' if x is None or x != x else f'{x:+.3f}'; P = lambda x: '–' if x is None else f'{x:.0%}'
TN = {'r5': '5R', 'r10': '10R', 'far': 'far p75 level'}; TY = {'HOLD': 'hold at the line', 'BREAK': 'break of the line', 'DOPEN': 'daily open retest'}
print('# Tight stop, far target at the forecast levels — results\n')
print('Pre-registration: forge/ASYMMETRIC_TRADES_PREREG.md (3c9c4da, amendment 4b0e584). Entries 00:00–10:00 London; stop = level ± 0.1σ / 0.2σ; '
      'exit at target, stop or day end; R net of spread. Win = target hit; break-even = the win rate that pays at the average win size.\n')
for sname, r in res.items():
    print(f'## {sname}\n\n| entry | stop | target | trades | win | break-even | net R | 2016–22 | 2023–26 | longs / shorts | spread R | quiet / normal / heavy vol | IV÷RV low / mid / high | skew with / against | PASS |')
    print('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for k, v in r.items():
        if k[0] == 'alone': continue
        ty, s, tg = k; rg = v['reg']; iv = v.get('ivrv', {}); sk = v.get('skew', {})
        print(f"| {TY[ty]} | {s}σ | {TN[tg]} | {v['n']:,} | {P(v['win'])} | {P(v['be'])} | {f3(v['R'])} | {f3(v['h1'])} | {f3(v['h2'])} | "
              f"{f3((v['long'] or {}).get('R'))} / {f3((v['short'] or {}).get('R'))} | {v['costR']:.2f} | {f3(rg['quiet'])} / {f3(rg['normal'])} / {f3(rg['heavy'])} | "
              f"{' / '.join(f3(iv.get(g)) for g in ('low', 'mid', 'high')) if iv else '–'} | {' / '.join(f3(sk.get(g)) for g in ('with', 'against')) if sk else '–'} | {'**PASS**' if v['pass'] else '–'} |")
    print()
print('## Gold, EURUSD and NQ alone (net R, 2016–22 / 2023–26)\n')
for sname, r in res.items():
    for k, v in r.items():
        if k[0] != 'alone': continue
        print(f'**{k[1].upper()}**: ' + '; '.join(f"{c}: {f3(x.get('R'))} ({f3(x.get('h1'))} / {f3(x.get('h2'))})" for c, x in v.items() if x) + '\n')
print(f'BH 10% over {M} cells: {cut} survive before the both-halves, cross-set and short-side checks.')
