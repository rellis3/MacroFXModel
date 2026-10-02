"""Three fade setups — forge/THREE_FADE_SETUPS_PREREG.md.
    python scripts/rangebook/three_fades_score.py > analysis/output/rangebook/THREE_FADE_SETUPS_RESULTS.md
"""
import bisect, csv, json, math
import numpy as np, pandas as pd
from statistics import NormalDist
from crosspair_buckets import ALL
O = 'analysis/output/rangebook/'; SPLIT = '2023-01-01'; N = NormalDist()
IDX = ['nq', 'spx', 'dow', 'us2000', 'de30', 'uk100']
CV = {'audusd': 'AUDUSD', 'eurusd': 'EURUSD', 'gbpusd': 'GBPUSD', 'usdcad': 'USDCAD', 'usdchf': 'USDCHF', 'usdjpy': 'USDJPY', 'gold': 'XAUUSD'}
IXV = {'nq': 'VXN', 'spx': 'VIX', 'dow': 'VXD', 'us2000': 'RVX'}
def rvm(d, px):
    lr = np.diff(np.log(np.asarray(px, float))); m = {}
    for i in range(21, len(d)):
        v = np.nanstd(lr[i - 20:i], ddof=1) * math.sqrt(252) * 100
        if v > 0: m[d[i]] = v
    return m
IV = {}
cv = json.load(open('js/data/cmeCvolEod.json'))['series']
for p, k in CV.items():
    rows = cv[k]; d = [r['date'] for r in rows]; rv = rvm(d, [r['underlying'] or np.nan for r in rows])
    m = {x: rows[i]['cvol'] / rv[x] for i, x in enumerate(d) if x in rv}; IV[p] = (sorted(m), m, 1.05, 1.27)
for p, s in IXV.items():
    iv = {}
    for r in csv.reader(open(f'{O}cboe/{s}.csv')):
        if r and r[0][:1].isdigit(): mm, dd, yy = r[0].split('/'); iv[f'{yy}-{mm}-{dd}'] = float(r[4])
    daily = json.load(open(f'{O}cboe/{p}_daily.json')); d = [x['date'] for x in daily]; rv = rvm(d, [x['close'] for x in daily])
    m = {x: iv[x] / rv[x] for x in rv if x in iv}; IV[p] = (sorted(m), m, 1.17, 1.53)
def volstate(p, date):
    if p not in IV: return None
    ds, m, lo, hi = IV[p]; i = bisect.bisect_left(ds, date) - 1
    if i < 0: return None
    v = m[ds[i]]; return 'cheap' if v < lo else 'rich' if v >= hi else 'mid'

rows = []
for p in ALL + IDX:
    seq = {f"{s['date']}|{s['line']}|{s['pass']}": s for s in json.load(open(f'{O}{p}_sequence.json'))['passes'] if not s['sameBar']}
    htf = {r['key']: r['h1'] for r in json.load(open(f'{O}{p}_htf.json'))['rows']}
    for r in json.load(open(f'{O}{p}_div.json'))['rows']:
        q = r.get('r15')
        if not q or not q['race']: continue
        s = seq[r['key']]; up = 1 if s['line'].startswith(('OH_', 'CloseUp', 'ProjH')) else -1
        h1 = htf.get(r['key']); rel = None if h1 is None else (0 if h1 == 0 else (1 if h1 * up > 0 else -1))
        rows.append({'inst': p, 'grp': 'IDX' if p in IDX else 'FX', 'date': s['date'], 'h2': s['date'] >= SPLIT, 'line': s['line'], 'rung': s['line'].split('_')[1],
                     'ohol': s['line'].startswith(('OH_', 'OL_')), 'min': s['londonMin'], 'rel': rel, 'vol': volstate(p, s['date']),
                     'back': q['now'] < -0.1, 'fad': q['race']['fad'], 'win': q['race']['o'] == 'fade'})
D = pd.DataFrame(rows)
def st(x):
    v = x['fad'].to_numpy(float); h2 = x['h2'].to_numpy()
    if len(v) < 3: return None
    return {'n': len(v), 'win': float(x['win'].mean()), 'R': float(v.mean()), 't': float(v.mean() / v.std(ddof=1) * math.sqrt(len(v))),
            'h1': float(v[~h2].mean()) if (~h2).any() else None, 'h2': float(v[h2].mean()) if h2.any() else None}
f3 = lambda v: '–' if v is None or v != v else f'{v:+.3f}'
base = D['back'] & D['ohol']
SET = {
  'A counter-trend exhaustion': (base & (D['rel'] == -1), {'control: with the trend': base & (D['rel'] == 1), 'control: p50 counter-trend': None}),
  'B London close 16:00–17:00': (base & (D['min'] >= 960) & (D['min'] < 1020), {'control: 13:00–16:00': base & (D['min'] >= 780) & (D['min'] < 960)}),
  'C cheap vol': (base & (D['vol'] == 'cheap'), {'control: rich vol': base & (D['vol'] == 'rich')}),
}
print('# Three fade setups — results\n')
print('Pre-registration: forge/THREE_FADE_SETUPS_PREREG.md. Rejection = back inside the line by > 0.1σ 15 min after the touch; fade entered '
      'there, target the line behind, stop the next line out. R net of spread.\n')
print('| setup | line | set | fades | win | net R | 2016–22 | 2023–26 |\n|---|---|---|---|---|---|---|---|')
tests, res = [], {}
for name, (m, ctrls) in SET.items():
    for rung in ('p90', 'p75'):
        for grp in ('FX', 'IDX'):
            x = D[m & (D['rung'] == rung) & (D['grp'] == grp)]; s = st(x); res[(name, rung, grp)] = s
            if s:
                print(f"| {name} | {rung} | {grp} | {s['n']:,} | {s['win']:.0%} | {f3(s['R'])} | {f3(s['h1'])} | {f3(s['h2'])} |")
                if grp == 'FX': tests.append((1 - N.cdf(s['t']), f'{name} {rung}', s))
        for cn, cm in ctrls.items():
            if cm is None: cm = base & (D['rel'] == -1); rung_c = 'p50'
            else: rung_c = rung
            x = D[cm & (D['rung'] == rung_c) & (D['grp'] == 'FX')]; s = st(x)
            if s: print(f"| {name} — {cn} | {rung_c} | FX | {s['n']:,} | {s['win']:.0%} | {f3(s['R'])} | {f3(s['h1'])} | {f3(s['h2'])} |")
tests.sort(key=lambda t: t[0]); M = len(tests); cut = 0
for i, t in enumerate(tests, 1):
    if t[0] <= 0.10 * i / M: cut = i
bh = {nm for _, nm, _ in tests[:cut]}
verdict = []
for name in SET:
    for rung in ('p90', 'p75'):
        fx, ix = res.get((name, rung, 'FX')), res.get((name, rung, 'IDX'))
        ok = fx and fx['h1'] is not None and fx['h2'] is not None and fx['h1'] > 0 and fx['h2'] > 0 and ix and ix['R'] > 0 and f'{name} {rung}' in bh
        verdict.append(f"{name} {rung}: {'PASS' if ok else 'fail'}")
print(f"\nBH 10% over {M} FX rows: {cut} survive.\n\n**Verdicts:** " + '; '.join(verdict))
