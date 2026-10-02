"""H1 / H4 trend state at the vol lines — forge/MACRO_TREND_WEEKDAY_PREREG.md section B (Q1).
    python scripts/rangebook/htf_score.py > analysis/output/rangebook/HTF_TREND_RESULTS.md
"""
import json, math
import numpy as np, pandas as pd
from statistics import NormalDist
from crosspair_buckets import ALL
O = 'analysis/output/rangebook/'; SPLIT = '2023-01-01'; B = 1000; N = NormalDist()
IDX = ['nq', 'spx', 'dow', 'us2000', 'de30', 'uk100']
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def usedb(u): return 4 if u is None else 0 if u < 0.5 else 1 if u < 0.8 else 2 if u < 1.0 else 3
def rr(o, dc, df, lm, c):
    f = dc / df if o == 'cont' else -1.0 if o in ('fade', 'both') else max(-1.0, min(dc / df, lm / df))
    a = df / dc if o == 'fade' else -1.0 if o in ('cont', 'both') else max(-1.0, min(df / dc, -lm / dc))
    return f - c / df, a - c / dc
rows = []
for p in ALL + IDX:
    seq = {f"{s['date']}|{s['line']}|{s['pass']}": s for s in json.load(open(f'{O}{p}_sequence.json'))['passes'] if not s['sameBar']}
    for r in json.load(open(f'{O}{p}_htf.json'))['rows']:
        s = seq[r['key']]; up = 1 if s['line'].startswith(('OH_', 'CloseUp', 'ProjH')) else -1
        fo, fa = rr(s['outcome'], s['dc'], s['df'], s['lastMove'], s['costSig'])
        rows.append({'inst': p, 'grp': 'IDX' if p in IDX else 'FX', 'date': s['date'], 'h2': s['date'] >= SPLIT, 'cont': s['outcome'] == 'cont', 'fol': fo, 'fad': fa,
                     'h1': (r['h1'] or 0) * up, 'h4': (r['h4'] or 0) * up,            # +1 touch heads with the trend, -1 against, 0 neutral
                     'cell': (FAMS.index(fam(s['line'])) * 25 + min(24, s['londonMin'] // 60)) * 5 + usedb(s['used'])})
D = pd.DataFrame(rows); D['day'] = pd.factorize(D['inst'] + D['date'])[0]; NC = 7 * 25 * 5
rng = np.random.default_rng(20261002); ND = int(D['day'].max()) + 1
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
    return {'n': len(v), 'cont': float(X[m]['cont'].mean()), 'R': float(v.mean()), 't': float(v.mean() / v.std(ddof=1) * math.sqrt(len(v))) if len(v) > 2 else 0.0,
            'h1': float(v[~h2].mean()) if (~h2).any() else None, 'h2': float(v[h2].mean()) if h2.any() else None,
            'short': float(v[~X[m]['up'].to_numpy()].mean()) if 'up' in X else None}
pp = lambda v: f'{v*100:+.1f}pp'
f3 = lambda v: '–' if v is None or v != v else f'{v:+.3f}'
print('# H1 / H4 trend state at the vol lines (Q1) — results\n')
print('Pre-registration: forge/MACRO_TREND_WEEKDAY_PREREG.md (2479b62), section B. Trend = EMA20/EMA50 structure on completed H1 / H4 bars before '
      'the touch. "With" = the touch heads the way of the trend (an up line in an uptrend); "against" = a counter-trend touch, so fading it is the '
      'with-trend pullback entry. Within-cell continue differences, day-bootstrap 95% CI. R net of spread.\n')
tests = []
for tfk, lab in (('h4', 'H4'), ('h1', 'H1')):
    print(f'## {lab} trend\n')
    print('| set | with − against [95% CI] | 2016–22 | 2023–26 | n (with / against / neutral) | REAL? |\n|---|---|---|---|---|---|')
    for sname, X in (('16 FX + gold', D[D['grp'] == 'FX']), ('6 indices', D[D['grp'] == 'IDX'])):
        a, b = (X[tfk] == 1).to_numpy(), (X[tfk] == -1).to_numpy(); t = t1(X, a, b)
        print(f"| {sname} | {pp(t['est'])} [{pp(t['lo'])}, {pp(t['hi'])}] | {pp(t['h1'])} | {pp(t['h2'])} | {t['na']:,} / {t['nb']:,} / {int((X[tfk] == 0).sum()):,} | {'**yes**' if t['real'] else 'no'} |")
    print(f'\n| set | group | passes | continue | follow R (halves) | fade R (halves) |\n|---|---|---|---|---|---|')
    for sname, X in (('16 FX + gold', D[D['grp'] == 'FX']), ('6 indices', D[D['grp'] == 'IDX'])):
        for g, m in (('with the trend', X[tfk] == 1), ('neutral', X[tfk] == 0), ('against the trend (fade = with-trend pullback)', X[tfk] == -1)):
            fo, fa = tr(X, m.to_numpy(), 'fol'), tr(X, m.to_numpy(), 'fad')
            if g.startswith('with'): tests.append((1 - N.cdf(fo['t']), f'{lab} {sname} follow-with', fo))
            if g.startswith('against'): tests.append((1 - N.cdf(fa['t']), f'{lab} {sname} fade-against', fa))
            print(f"| {sname} | {g} | {fo['n']:,} | {fo['cont']:.0%} | {f3(fo['R'])} ({f3(fo['h1'])} / {f3(fo['h2'])}) | {f3(fa['R'])} ({f3(fa['h1'])} / {f3(fa['h2'])}) |")
    print()
tests.sort(key=lambda x: x[0]); M = len(tests); cut = 0
for i, tt in enumerate(tests, 1):
    if tt[0] <= 0.10 * i / M: cut = i
passed = [nm for pv, nm, s in tests[:cut] if s['h1'] is not None and s['h2'] is not None and s['h1'] > 0 and s['h2'] > 0]
print(f"T2: BH 10% over {M} rows, {cut} survive; also positive in both halves: {', '.join(passed) or 'none'}.")
