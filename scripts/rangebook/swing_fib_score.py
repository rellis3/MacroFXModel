"""Swing-based fib retracements at the vol lines — forge/SWING_FIB_PREREG.md.
    python scripts/rangebook/swing_fib_score.py > analysis/output/rangebook/SWING_FIB_RESULTS.md
"""
import json, math
import numpy as np, pandas as pd
from statistics import NormalDist
from crosspair_buckets import ALL
O = 'analysis/output/rangebook/'; SPLIT = '2023-01-01'; B = 1000; TOL = 0.05; N = NormalDist()
TYPES = {'gp': 'golden pocket 0.618–0.65', 'f786': '0.786', 'f886': '0.886'}
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
for p in ALL:
    seq = {f"{s['date']}|{s['line']}|{s['pass']}": s for s in json.load(open(f'{O}{p}_sequence.json'))['passes'] if not s['sameBar']}
    for r in json.load(open(f'{O}{p}_swingfib.json'))['rows']:
        if r.get('none'): continue
        s = seq[r['key']]; fo, fa = rr(s['outcome'], s['dc'], s['df'], s['lastMove'], s['costSig'])
        x = {'inst': p, 'date': s['date'], 'h2': s['date'] >= SPLIT, 'cont': s['outcome'] == 'cont', 'fol': fo, 'fad': fa,
             'cell': (FAMS.index(fam(s['line'])) * 25 + min(24, s['londonMin'] // 60)) * 5 + usedb(s['used'])}
        for ty in TYPES:
            x[ty] = r['real'][ty] is not None and r['real'][ty] <= TOL; x[ty + '_p'] = r['placebo'][ty] is not None and r['placebo'][ty] <= TOL
        rows.append(x)
D = pd.DataFrame(rows); D['day'] = pd.factorize(D['inst'] + D['date'])[0]; NC = 7 * 25 * 5; n = len(D)
rng = np.random.default_rng(20261002); ND = int(D['day'].max()) + 1; POIS = [rng.poisson(1.0, ND) for _ in range(B)]
y, cell, day, h2 = D['cont'].to_numpy(float), D['cell'].to_numpy(), D['day'].to_numpy(), D['h2'].to_numpy()
def within(flag, w):
    k = cell * 2 + flag.astype(int)
    nn = np.bincount(k, weights=w, minlength=NC * 2).reshape(NC, 2); cc = np.bincount(k, weights=w * y, minlength=NC * 2).reshape(NC, 2)
    ok = (nn[:, 0] > 0) & (nn[:, 1] > 0)
    d = cc[ok, 1] / nn[ok, 1] - cc[ok, 0] / nn[ok, 0]; ww = nn[ok, 0] * nn[ok, 1] / (nn[ok, 0] + nn[ok, 1])
    return float((d * ww).sum() / ww.sum()) if ww.sum() else float('nan')
def t1(a, ap):
    stat = lambda w: within(a, w) - within(ap, w)
    est = stat(np.ones(n)); bs = [stat(P[day].astype(float)) for P in POIS]; lo, hi = np.percentile(bs, [2.5, 97.5])
    e1, e2 = stat((~h2).astype(float)), stat(h2.astype(float))
    return est, lo, hi, e1, e2, bool((lo > 0 or hi < 0) and np.sign(e1) == np.sign(e2) == np.sign(est))
def tr(m, k):
    v = D[k].to_numpy(float)[m]; hh = h2[m]
    return {'n': int(m.sum()), 'R': float(v.mean()), 't': float(v.mean() / v.std(ddof=1) * math.sqrt(len(v))) if len(v) > 2 else 0.0, 'h1': float(v[~hh].mean()), 'h2': float(v[hh].mean())}
pp = lambda v: f'{v*100:+.1f}pp'; f3 = lambda v: f'{v:+.3f}'
print('# Swing-based fib retracements at the vol lines — results\n')
print(f'Pre-registration: forge/SWING_FIB_PREREG.md (e0086de). {n:,} passes, 16 FX/gold. H1 fractal swings, last impulse, retracement within {TOL}σ of the touched '
      'vol line; real − placebo (levels shifted 0.15–0.5σ) within-cell continue difference, day-bootstrap 95% CI.\n')
print('| level | at the line | real − placebo [95% CI] | 2016–22 | 2023–26 | REAL? | fade R at the line (halves) | follow R at the line (halves) |\n|---|---|---|---|---|---|---|---|')
tests = []
for ty, lab in TYPES.items():
    a, ap = D[ty].to_numpy(), D[ty + '_p'].to_numpy(); est, lo, hi, e1, e2, real = t1(a, ap)
    fa, fo = tr(a, 'fad'), tr(a, 'fol'); tests += [(1 - N.cdf(fa['t']), f'{lab} fade', fa), (1 - N.cdf(fo['t']), f'{lab} follow', fo)]
    print(f"| {lab} | {a.mean():.1%} | {pp(est)} [{pp(lo)}, {pp(hi)}] | {pp(e1)} | {pp(e2)} | {'**yes**' if real else 'no'} | {f3(fa['R'])} ({f3(fa['h1'])} / {f3(fa['h2'])}) | {f3(fo['R'])} ({f3(fo['h1'])} / {f3(fo['h2'])}) |")
tests.sort(key=lambda t: t[0]); M = len(tests); cut = 0
for i, t in enumerate(tests, 1):
    if t[0] <= 0.10 * i / M: cut = i
passed = [nm for _, nm, s in tests[:cut] if s['h1'] > 0 and s['h2'] > 0]
print(f"\nT2: BH 10% over {M} rows, {cut} survive; positive in both halves too: {', '.join(passed) or 'none'}.")
