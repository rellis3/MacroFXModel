"""News at the vol lines — forge/NEWS_TOUCH_PREREG.md.
    python scripts/rangebook/news_score.py > analysis/output/rangebook/NEWS_TOUCH_RESULTS.md
"""
import json, math
import numpy as np, pandas as pd
from statistics import NormalDist
from crosspair_buckets import ALL

IDX = ['nq', 'spx', 'dow', 'us2000', 'de30', 'uk100']
SPLIT, B = '2023-01-01', 1000
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
N = NormalDist()
def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def usedb(u): return 4 if u is None else 0 if u < 0.5 else 1 if u < 0.8 else 2 if u < 1.0 else 3
def rr(o, dc, df, lm, c):
    f = dc / df if o == 'cont' else -1.0 if o in ('fade', 'both') else max(-1.0, min(dc / df, lm / df))
    a = df / dc if o == 'fade' else -1.0 if o in ('cont', 'both') else max(-1.0, min(df / dc, -lm / dc))
    return f - c / df, a - c / dc

rows = []
for grp, pairs in (('FX', ALL), ('IDX', IDX)):
    for p in pairs:
        seq = {f"{s['date']}|{s['line']}|{s['pass']}": s for s in json.load(open(f'analysis/output/rangebook/{p}_sequence.json'))['passes'] if not s['sameBar']}
        for r in json.load(open(f'analysis/output/rangebook/{p}_news.json'))['rows']:
            s = seq[r['key']]; fo, fa = rr(s['outcome'], s['dc'], s['df'], s['lastMove'], s['costSig'])
            rows.append({'grp': grp, 'inst': p, 'date': s['date'], 'h2': s['date'] >= SPLIT, 'imp': r['imp'], 'zAl': r['zAl'], 'react': r['react'],
                         'cell': (FAMS.index(fam(s['line'])) * 25 + min(24, s['londonMin'] // 60)) * 5 + usedb(s['used']),
                         'cont': s['outcome'] == 'cont', 'fol': fo, 'fad': fa})
D = pd.DataFrame(rows); D['day'] = pd.factorize(D['inst'] + D['date'])[0]; n = len(D); NC = 7 * 25 * 5
rng = np.random.default_rng(20261001); POIS = [rng.poisson(1.0, int(D['day'].max()) + 1) for _ in range(B)]
print(f'loaded {n:,} rows', flush=True)

def within(y, cell, flag, w):
    k = cell * 2 + flag
    nn = np.bincount(k, weights=w, minlength=NC * 2).reshape(NC, 2); cc = np.bincount(k, weights=w * y, minlength=NC * 2).reshape(NC, 2)
    ok = (nn[:, 0] > 0) & (nn[:, 1] > 0)
    d = cc[ok, 1] / nn[ok, 1] - cc[ok, 0] / nn[ok, 0]; ww = nn[ok, 0] * nn[ok, 1] / (nn[ok, 0] + nn[ok, 1])
    return float((d * ww).sum() / ww.sum()) if ww.sum() else float('nan')
def t1(a, b):
    m = a | b; y, cell, flag, day, h2 = D['cont'].to_numpy(float)[m], D['cell'].to_numpy()[m], a[m].astype(int), D['day'].to_numpy()[m], D['h2'].to_numpy()[m]
    est = within(y, cell, flag, np.ones(len(y))); bs = [within(y, cell, flag, P[day].astype(float)) for P in POIS]; lo, hi = np.percentile(bs, [2.5, 97.5])
    e1, e2 = within(y, cell, flag, (~h2).astype(float)), within(y, cell, flag, h2.astype(float))
    return {'est': est, 'lo': float(lo), 'hi': float(hi), 'h1': e1, 'h2': e2, 'na': int(a.sum()), 'nb': int(b.sum()),
            'real': bool((lo > 0 or hi < 0) and np.sign(e1) == np.sign(e2) == np.sign(est))}
def tr(m, k):
    x = D[m]; v = x[k].to_numpy(float)
    return {'n': int(len(x)), 'cont': float(x['cont'].mean()) if len(x) else None, 'R': float(v.mean()) if len(v) else None,
            't': float(v.mean() / v.std(ddof=1) * math.sqrt(len(v))) if len(v) > 2 else 0.0,
            'h1': float(x[~x['h2']][k].mean()) if (~x['h2']).any() else None, 'h2': float(x[x['h2']][k].mean()) if x['h2'].any() else None}

z, re_ = D['zAl'].to_numpy(float), D['react'].to_numpy(float)
G, IMP = D['grp'].to_numpy(), D['imp'].to_numpy()
defs = {'S': (z >= 0.5, z <= -0.5), 'R': (re_ >= 0.1, re_ <= -0.1)}
res, tests = {}, []
for dname, (al, ag) in defs.items():
    for grp in (('FX',) if dname == 'S' else ('FX', 'IDX')):
        for imp, il in (('M', 'Major'), ('m', 'Moderate (unseen)'), (None, 'both')):
            base = (G == grp) & ((IMP == imp) if imp else True)
            key = (dname, grp, il)
            res[key] = {'T1': t1(base & al, base & ag), 'follow aligned': tr(base & al, 'fol'), 'fade against': tr(base & ag, 'fad')}
            if imp:
                for g, k in (('follow aligned', 'fol'), ('fade against', 'fad')):
                    t = res[key][g]; tests.append((1 - N.cdf(t['t']), key, g))
            print(key, f"{res[key]['T1']['est']*100:+.2f}pp", flush=True)
tests.sort(); M = len(tests); cut = 0
for i, (pv, *_) in enumerate(tests, 1):
    if pv <= 0.10 * i / M: cut = i
bh = {(k, g) for _, k, g in tests[:cut]}
verdict = []
pos2 = lambda t: t['h1'] is not None and t['h2'] is not None and t['h1'] > 0 and t['h2'] > 0
for dname in ('S', 'R'):
    for g in ('follow aligned', 'fade against'):
        mod, maj = (dname, 'FX', 'Moderate (unseen)'), (dname, 'FX', 'Major')
        # PASS: the unseen Moderate set survives BH with net R > 0 in both halves, the Major set is also > 0 in both
        # halves, and (R only) the indices are > 0.
        ok = (mod, g) in bh and pos2(res[mod][g]) and pos2(res[maj][g])
        if dname == 'R': ok = ok and (res[(dname, 'IDX', 'both')][g]['R'] or -1) > 0
        verdict.append((dname, g, ok))

# by surprise size (S, FX, both impacts)
size = {}
for lo, hi, lab in ((0.5, 1, '0.5–1'), (1, 2, '1–2'), (2, 99, '> 2')):
    a = (G == 'FX') & (np.abs(z) >= lo) & (np.abs(z) < hi)
    size[lab] = {'T1': t1(a & (z > 0), a & (z < 0)), 'follow aligned': tr(a & (z > 0), 'fol'), 'fade against': tr(a & (z < 0), 'fad')}
json.dump({'res': {'|'.join(k): v for k, v in res.items()}, 'size': size, 'verdict': verdict, 'tests': M, 'bh': cut}, open('analysis/output/rangebook/news_touch.json', 'w'))

pp = lambda v: f'{v*100:+.1f}pp'; f3 = lambda v: '–' if v is None or v != v else f'{v:+.3f}'; P = lambda v: '–' if v is None else f'{v:.0%}'
print('\n# News at the vol lines — results\n')
print(f'Pre-registration: forge/NEWS_TOUCH_PREREG.md (f24f55a). First pass of each line within 120 min after a release; {n:,} rows '
      '(16 FX/gold + 6 indices). S = surprise sign aligned with the touch (|z| ≥ 0.5); R = the first 5-minute reaction aligned (≥ 0.1σ). '
      'Within-cell continue difference aligned − against, day-bootstrap 95% CI. R net of spread.\n')
print('| def | set | releases | aligned − against [95% CI] | 2016–22 | 2023–26 | n (al / ag) | follow aligned R (halves) | fade against R (halves) |\n|---|---|---|---|---|---|---|---|---|')
for (dname, grp, il), v in res.items():
    t, a, b = v['T1'], v['follow aligned'], v['fade against']
    print(f"| {dname} | {grp} | {il} | {pp(t['est'])} [{pp(t['lo'])}, {pp(t['hi'])}]{' **real**' if t['real'] else ''} | {pp(t['h1'])} | {pp(t['h2'])} | {t['na']:,} / {t['nb']:,} | "
          f"{f3(a['R'])} ({f3(a['h1'])} / {f3(a['h2'])}) | {f3(b['R'])} ({f3(b['h1'])} / {f3(b['h2'])}) |")
print('\nBy surprise size (S, FX/gold, Major + Moderate):\n\n| |z| | aligned − against [95% CI] | n (al / ag) | aligned continue | follow aligned R | fade against R |\n|---|---|---|---|---|---|')
for lab, v in size.items():
    t = v['T1']; print(f"| {lab} | {pp(t['est'])} [{pp(t['lo'])}, {pp(t['hi'])}] | {t['na']:,} / {t['nb']:,} | {P(v['follow aligned']['cont'])} | {f3(v['follow aligned']['R'])} | {f3(v['fade against']['R'])} |")
print(f'\nBH 10% over {M} tests: {cut} survive.\n\n**Verdict (pre-registered PASS rule):** ' + '; '.join(f"{d} {g}: {'PASS' if ok else 'fail'}" for d, g, ok in verdict))
