"""Stack test — forge/STACK_RICHIV_TREND_PREREG.md.
    python scripts/rangebook/stack_score.py > analysis/output/rangebook/STACK_RICHIV_TREND_RESULTS.md
"""
import bisect, csv, json, math
import numpy as np, pandas as pd
from statistics import NormalDist
O = 'analysis/output/rangebook/'; SPLIT = '2023-01-01'; N = NormalDist()
CV = {'eurusd': 'EURUSD', 'gbpusd': 'GBPUSD', 'audusd': 'AUDUSD', 'usdcad': 'USDCAD', 'usdchf': 'USDCHF', 'usdjpy': 'USDJPY', 'gold': 'XAUUSD'}
IXV = {'nq': 'VXN', 'spx': 'VIX', 'dow': 'VXD', 'us2000': 'RVX'}
CELLS = [('0.1', 'r5'), ('0.1', 'r10'), ('0.2', 'r5'), ('0.2', 'r10')]; C02 = [('0.2', 'r5'), ('0.2', 'r10')]
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
    m = {x: rows[i]['cvol'] / rv[x] for i, x in enumerate(d) if x in rv}; IV[p] = (sorted(m), m)
for p, s in IXV.items():
    iv = {}
    for r in csv.reader(open(f'{O}cboe/{s}.csv')):
        if r and r[0][:1].isdigit(): mm, dd, yy = r[0].split('/'); iv[f'{yy}-{mm}-{dd}'] = float(r[4])
    daily = json.load(open(f'{O}cboe/{p}_daily.json')); d = [x['date'] for x in daily]; rv = rvm(d, [x['close'] for x in daily])
    m = {x: iv[x] / rv[x] for x in rv if x in iv}; IV[p] = (sorted(m), m)
def rich(p, date, thr):
    ds, m = IV[p]; i = bisect.bisect_left(ds, date) - 1; return i >= 0 and m[ds[i]] >= thr

def load(pairs, thr):
    out = []
    for p in pairs:
        htf = {(r['date'], r['line']): r for r in json.load(open(f'{O}{p}_asym_htf.json'))['rows']}
        for t in json.load(open(f'{O}{p}_asym.json'))['rows']:
            if t['type'] != 'BREAK' or not rich(p, t['date'], thr): continue
            if not all(t.get('s' + a) and t['s' + a].get(b) for a, b in CELLS): continue
            h = htf[(t['date'], t['line'])]
            rel = lambda s: 0 if not s else (1 if s * t['dir'] > 0 else -1)         # +1 with the trend, -1 counter, 0 neutral
            out.append({'inst': p, 'date': t['date'], 'h2': t['date'] >= SPLIT, 'dir': t['dir'], 'min': t['min'], 'h1': rel(h['h1']), 'h4': rel(h['h4']),
                        'R': float(np.mean([t['s' + a][b]['R'] for a, b in CELLS])), 'R02': float(np.mean([t['s' + a][b]['R'] for a, b in C02]))})
    return pd.DataFrame(out)
def st(x, col='R'):
    v = x[col].to_numpy(float); h2 = x['h2'].to_numpy()
    if len(v) < 3: return None
    return {'n': len(v), 'R': float(v.mean()), 't': float(v.mean() / v.std(ddof=1) * math.sqrt(len(v))), 'h1': float(v[~h2].mean()) if (~h2).any() else None,
            'h2': float(v[h2].mean()) if h2.any() else None, 'short': float(v[(x['dir'] < 0).to_numpy()].mean()) if (x['dir'] < 0).any() else None}
f3 = lambda v: '–' if v is None or v != v else f'{v:+.3f}'
sets = {'FX + gold': load(list(CV), 1.27), 'Indices': load(list(IXV), 1.53)}
res, tests = {}, []
print('# Stacking H1 trend state and spread conditions on the rich-IV break rule — results\n')
print('Pre-registration: forge/STACK_RICHIV_TREND_PREREG.md (bee95be). Rich-IV break trades; R = mean of the four stop/target cells unless stated. Net of spread.\n')
for sname, D in sets.items():
    print(f'## {sname}\n\n| group | trades | net R | 2016–22 | 2023–26 | shorts |\n|---|---|---|---|---|---|')
    r = {}
    for g, m in (('all rich-IV breaks (base)', np.ones(len(D), bool)), ('H1: counter-trend break', (D['h1'] == -1).to_numpy()), ('H1: with-trend break', (D['h1'] == 1).to_numpy()),
                 ('H1: neutral', (D['h1'] == 0).to_numpy()), ('H4: counter-trend break', (D['h4'] == -1).to_numpy()), ('H4: with-trend break', (D['h4'] == 1).to_numpy()),
                 ('spread conditions: 0.2σ stops, signal ≥ 02:00', None), ('both: H1 counter × spread conditions', None)):
        if g.startswith('spread'): x = D[D['min'] >= 120]; s = st(x, 'R02')
        elif g.startswith('both'): x = D[(D['min'] >= 120) & (D['h1'] == -1)]; s = st(x, 'R02')
        else: s = st(D[m])
        r[g] = s
        if s: print(f"| {g} | {s['n']:,} | {f3(s['R'])} | {f3(s['h1'])} | {f3(s['h2'])} | {f3(s['short'])} |")
        if g.startswith('H1:') and s: tests.append((1 - N.cdf(s['t']), f'{sname} {g}', s))
    res[sname] = r; print()
tests.sort(key=lambda x: x[0]); M = len(tests); cut = 0
for i, tt in enumerate(tests, 1):
    if tt[0] <= 0.10 * i / M: cut = i
bh = {nm for _, nm, _ in tests[:cut]}
fx, ix = res['FX + gold'], res['Indices']
beats = lambda a, b: a and b and a['h1'] > b['h1'] and a['h2'] > b['h2']
p1 = (beats(fx['H1: counter-trend break'], fx['all rich-IV breaks (base)']) and fx['H1: counter-trend break']['h1'] > 0 and fx['H1: counter-trend break']['h2'] > 0
      and beats(ix['H1: counter-trend break'], ix['all rich-IV breaks (base)']) and ix['H1: counter-trend break']['h1'] > 0 and ix['H1: counter-trend break']['h2'] > 0
      and (ix['H1: counter-trend break']['short'] or -1) > 0 and 'FX + gold H1: counter-trend break' in bh)
sp = lambda r: r['spread conditions: 0.2σ stops, signal ≥ 02:00']
p2 = all(beats(sp(r), r['all rich-IV breaks (base)']) for r in (fx, ix))
print(f"BH 10% over {M} H1 rows: {cut} survive.\n\n**Test 1 (trend stack): {'PASS' if p1 else 'FAIL'}** · **Test 2 (spread conditions): {'PASS' if p2 else 'FAIL'}** · "
      f"**Test 3 (both): {'PASS' if (p1 and p2) else 'not applicable'}**")
