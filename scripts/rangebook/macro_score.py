"""Macro state (A) and weekday (C) at the vol lines — forge/MACRO_TREND_WEEKDAY_PREREG.md.
    python scripts/rangebook/macro_score.py > analysis/output/rangebook/MACRO_WEEKDAY_RESULTS.md
"""
import bisect, csv, json, math, datetime as D
import numpy as np, pandas as pd
from statistics import NormalDist
from crosspair_buckets import ALL
O = 'analysis/output/rangebook/'; SPLIT = '2023-01-01'; B = 1000; N = NormalDist()
IDX = ['nq', 'spx', 'dow', 'us2000']; USDQ = ['eurusd', 'gbpusd', 'audusd', 'nzdusd']; USDB = ['usdjpy', 'usdcad', 'usdchf']
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def usedb(u): return 4 if u is None else 0 if u < 0.5 else 1 if u < 0.8 else 2 if u < 1.0 else 3
def rr(o, dc, df, lm, c):
    f = dc / df if o == 'cont' else -1.0 if o in ('fade', 'both') else max(-1.0, min(dc / df, lm / df))
    a = df / dc if o == 'fade' else -1.0 if o in ('cont', 'both') else max(-1.0, min(df / dc, -lm / dc))
    return f - c / df, a - c / dc

# series: name -> (dates, values, lag days)
def fred(name):
    d, v = [], []
    for r in csv.reader(open(f'{O}macro/{name}.csv')):
        if len(r) == 2 and r[0][:1].isdigit() and r[1] not in ('.', ''):
            d.append(r[0]); v.append(float(r[1]))
    return d, np.array(v)
SER = {k: (*fred(k), 2) for k in ('DFII10', 'DGS10', 'DGS2', 'BAMLH0A0HYM2')}
vd, vv = fred('VIXCLS'); SER['VIX'] = (vd, vv, 1)
y = json.load(open(f'{O}macro/DXY_yahoo.json'))['chart']['result'][0]
dd = [D.datetime.fromtimestamp(t, D.timezone.utc).strftime('%Y-%m-%d') for t in y['timestamp']]
cl = y['indicators']['quote'][0]['close']; keep = [i for i, c in enumerate(cl) if c is not None]
SER['DXY'] = ([dd[i] for i in keep], np.array([cl[i] for i in keep]), 1)

CH = {}
for k, (d, v, lag) in SER.items():
    ch = np.full(len(v), np.nan); ch[5:] = v[5:] - v[:-5]
    thr = np.full(len(v), np.nan)
    for i in range(30, len(v)):
        w = np.abs(ch[max(5, i - 252):i]); w = w[~np.isnan(w)]
        if len(w) >= 20: thr[i] = np.median(w)
    CH[k] = (d, ch, thr, lag)
def signal(k, date):
    d, ch, thr, lag = CH[k]
    ref = (D.date.fromisoformat(date) - D.timedelta(days=lag)).isoformat()
    i = bisect.bisect_right(d, ref) - 1
    if i < 0 or np.isnan(ch[i]) or np.isnan(thr[i]) or abs(ch[i]) < thr[i]: return 0
    return 1 if ch[i] > 0 else -1
def bull(k, p):           # sign of a RISE in the series for the instrument (+1 bullish, -1 bearish, None = not used)
    if p == 'gold': return {'DFII10': -1, 'DXY': -1}.get(k)
    if p in IDX: return {'DGS10': -1, 'BAMLH0A0HYM2': -1, 'VIX': -1}.get(k)
    if p in USDQ: return {'DXY': -1, 'DGS2': -1}.get(k)
    if p in USDB: return {'DXY': 1, 'DGS2': 1}.get(k)
    return None

rows = []
for p in ALL + IDX:
    for s in json.load(open(f'{O}{p}_sequence.json'))['passes']:
        if s['sameBar']: continue
        up = 1 if s['line'].startswith(('OH_', 'CloseUp', 'ProjH')) else -1
        fo, fa = rr(s['outcome'], s['dc'], s['df'], s['lastMove'], s['costSig'])
        r = {'inst': p, 'date': s['date'], 'h2': s['date'] >= SPLIT, 'cont': s['outcome'] == 'cont', 'fol': fo, 'fad': fa,
             'wd': D.date.fromisoformat(s['date']).weekday(),
             'cell': (FAMS.index(fam(s['line'])) * 25 + min(24, s['londonMin'] // 60)) * 5 + usedb(s['used'])}
        for k in SER:
            b = bull(k, p); r[k] = signal(k, s['date']) * b * up if b else 0     # +1 with the touch, -1 against, 0 none
        rows.append(r)
Dd = pd.DataFrame(rows); Dd['day'] = pd.factorize(Dd['inst'] + Dd['date'])[0]; NC = 7 * 25 * 5
rng = np.random.default_rng(20261002); ND = int(Dd['day'].max()) + 1

def within(y, cell, flag, w):
    k = cell * 2 + flag
    nn = np.bincount(k, weights=w, minlength=NC * 2).reshape(NC, 2); cc = np.bincount(k, weights=w * y, minlength=NC * 2).reshape(NC, 2)
    ok = (nn[:, 0] > 0) & (nn[:, 1] > 0)
    d = cc[ok, 1] / nn[ok, 1] - cc[ok, 0] / nn[ok, 0]; ww = nn[ok, 0] * nn[ok, 1] / (nn[ok, 0] + nn[ok, 1])
    return float((d * ww).sum() / ww.sum()) if ww.sum() else float('nan')
def t1(X, a, b):
    m = a | b; X = X[m]; flag = a[m].astype(int)
    y, cell, day, h2 = X['cont'].to_numpy(float), X['cell'].to_numpy(), X['day'].to_numpy(), X['h2'].to_numpy()
    est = within(y, cell, flag, np.ones(len(y)))
    bs = [within(y, cell, flag, rng.poisson(1.0, ND)[day].astype(float)) for _ in range(B)]
    lo, hi = np.percentile(bs, [2.5, 97.5]); e1, e2 = within(y, cell, flag, (~h2).astype(float)), within(y, cell, flag, h2.astype(float))
    return {'est': est, 'lo': float(lo), 'hi': float(hi), 'h1': e1, 'h2': e2, 'na': int(a.sum()), 'nb': int(b.sum()),
            'real': bool((lo > 0 or hi < 0) and np.sign(e1) == np.sign(e2) == np.sign(est))}
def tr(X, m, k):
    v = X[m][k].to_numpy(float); h2 = X[m]['h2'].to_numpy()
    return {'n': len(v), 'R': float(v.mean()), 't': float(v.mean() / v.std(ddof=1) * math.sqrt(len(v))) if len(v) > 2 else 0.0,
            'h1': float(v[~h2].mean()) if (~h2).any() else None, 'h2': float(v[h2].mean()) if h2.any() else None}

pp = lambda v: f'{v*100:+.1f}pp'
f3 = lambda v: '–' if v is None or v != v else f'{v:+.3f}'
out, tests = [], []
SETS = {'gold': ['gold'], '4 US indices': IDX, '7 USD pairs': USDQ + USDB}
out.append('## A — macro state\n')
out.append('| set | series (5-obs change) | with − against [95% CI] | 2016–22 | 2023–26 | n (with / against) | REAL? | follow R when with (halves) | fade R when against (halves) |')
out.append('|---|---|---|---|---|---|---|---|---|')
for sname, pairs in SETS.items():
    X = Dd[Dd['inst'].isin(pairs)]
    for k in SER:
        if not any(bull(k, p) for p in pairs): continue
        a, b = (X[k] == 1).to_numpy(), (X[k] == -1).to_numpy()
        if a.sum() < 200 or b.sum() < 200: continue
        t = t1(X, a, b); fw, fg = tr(X, a, 'fol'), tr(X, b, 'fad')
        tests += [(1 - N.cdf(fw['t']), f'A {sname} {k} follow-with', fw), (1 - N.cdf(fg['t']), f'A {sname} {k} fade-against', fg)]
        out.append(f"| {sname} | {k} | {pp(t['est'])} [{pp(t['lo'])}, {pp(t['hi'])}] | {pp(t['h1'])} | {pp(t['h2'])} | {t['na']:,} / {t['nb']:,} | "
                   f"{'**yes**' if t['real'] else 'no'} | {f3(fw['R'])} ({f3(fw['h1'])} / {f3(fw['h2'])}) | {f3(fg['R'])} ({f3(fg['h1'])} / {f3(fg['h2'])}) |")
out.append('\n## C — weekday (16 FX/gold + 6 indices)\n')
out.append('| weekday | passes | continue | follow R | fade R |\n|---|---|---|---|---|')
for w, nm in enumerate(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']):
    X = Dd[Dd['wd'] == w]
    out.append(f"| {nm} | {len(X):,} | {X['cont'].mean():.0%} | {f3(X['fol'].mean())} | {f3(X['fad'].mean())} |")
tw = Dd['wd'].isin([1, 2]).to_numpy(); t = t1(Dd, tw, ~tw); fw, fg = tr(Dd, tw, 'fol'), tr(Dd, tw, 'fad')
tests += [(1 - N.cdf(fw['t']), 'C Tue-Wed follow', fw), (1 - N.cdf(fg['t']), 'C Tue-Wed fade', fg)]
out.append(f"\nTue–Wed vs other days: continue {pp(t['est'])} [{pp(t['lo'])}, {pp(t['hi'])}] ({pp(t['h1'])} / {pp(t['h2'])}) — "
           f"{'**real**' if t['real'] else 'not real'}; follow R {f3(fw['R'])} ({f3(fw['h1'])} / {f3(fw['h2'])}), fade R {f3(fg['R'])} ({f3(fg['h1'])} / {f3(fg['h2'])}).")
tests.sort(key=lambda x: x[0]); M = len(tests); cut = 0
for i, tt in enumerate(tests, 1):
    if tt[0] <= 0.10 * i / M: cut = i
passed = [nm for pv, nm, s in tests[:cut] if s['h1'] is not None and s['h2'] is not None and s['h1'] > 0 and s['h2'] > 0]
print('# Macro state and weekday at the vol lines — results\n')
print('Pre-registration: forge/MACRO_TREND_WEEKDAY_PREREG.md (2479b62). FRED series read with a 2-day lag, DXY/VIX closes with a 1-day lag; '
      'a 5-observation change counts only above its trailing-year median size. Within-cell continue differences, day-bootstrap 95% CI. R net of spread.\n')
print('\n'.join(out))
print(f"\nT2 (A + C): BH 10% over {M} rows, {cut} survive; also positive in both halves: {', '.join(passed) or 'none'}.")
