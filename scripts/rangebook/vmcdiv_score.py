"""Cipher B divergence at the vol lines — forge/VMC_DIVERGENCE_INDICES_PREREG.md.
    python scripts/rangebook/vmcdiv_score.py > analysis/output/rangebook/VMC_DIVERGENCE_RESULTS.md
"""
import json, math
import numpy as np, pandas as pd
from statistics import NormalDist
from crosspair_buckets import ALL

SETS = {'NQ': ['nq'], 'confirmation (SPX, DOW, US2000, DE30, UK100)': ['spx', 'dow', 'us2000', 'de30', 'uk100'], '16 FX + gold': ALL}
SPLIT, B = '2023-01-01', 1000
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
N = NormalDist()
def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def usedb(u): return 4 if u is None else 0 if u < 0.5 else 1 if u < 0.8 else 2 if u < 1.0 else 3

def load(pairs, lev):
    rows = []
    for p in pairs:
        seq = {f"{s['date']}|{s['line']}|{s['pass']}": s for s in json.load(open(f'analysis/output/rangebook/{p}_sequence.json'))['passes'] if not s['sameBar']}
        for r in json.load(open(f'analysis/output/rangebook/{p}_vmcdiv.json'))['rows']:
            g, rc = r.get('g' + lev), r.get('r' + lev)
            if g not in ('div', 'noDiv') or not rc: continue
            s = seq[r['key']]
            rows.append({'inst': p, 'date': s['date'], 'h2': s['date'] >= SPLIT, 'line': s['line'], 'div': g == 'div',
                         'cell': (FAMS.index(fam(s['line'])) * 25 + min(24, s['londonMin'] // 60)) * 5 + usedb(s['used']),
                         'cont': rc['o'] == 'cont', 'fade': rc['o'] == 'fade', 'fol': rc['fol'], 'fad': rc['fad'], 'gap': r.get('gap' + lev)})
    D = pd.DataFrame(rows); D['day'] = pd.factorize(D['inst'] + D['date'])[0]
    return D

def within(y, cell, flag, w, NC=7 * 25 * 5):
    k = cell * 2 + flag
    nn = np.bincount(k, weights=w, minlength=NC * 2).reshape(NC, 2); cc = np.bincount(k, weights=w * y, minlength=NC * 2).reshape(NC, 2)
    ok = (nn[:, 0] > 0) & (nn[:, 1] > 0)
    d = cc[ok, 1] / nn[ok, 1] - cc[ok, 0] / nn[ok, 0]; ww = nn[ok, 0] * nn[ok, 1] / (nn[ok, 0] + nn[ok, 1])
    return float((d * ww).sum() / ww.sum()) if ww.sum() else float('nan')

rng = np.random.default_rng(20261001)
res, tests = {}, []
for sname, pairs in SETS.items():
    for lev, lab in (('p', 'OB 45 / OS −65 (Pine default)'), ('s', 'OB 25 / OS −25')):
        D = load(pairs, lev)
        y, cell, flag, day, h2 = D['cont'].to_numpy(float), D['cell'].to_numpy(), D['div'].to_numpy(int), D['day'].to_numpy(), D['h2'].to_numpy()
        est = within(y, cell, flag, np.ones(len(y)))
        bs = [within(y, cell, flag, rng.poisson(1.0, day.max() + 1)[day]) for _ in range(B)]; lo, hi = np.percentile(bs, [2.5, 97.5])
        e1, e2 = within(y, cell, flag, (~h2).astype(float)), within(y, cell, flag, h2.astype(float))
        out = {'T1': {'est': est, 'lo': float(lo), 'hi': float(hi), 'h1': e1, 'h2': e2, 'real': bool((lo > 0 or hi < 0) and np.sign(e1) == np.sign(e2) == np.sign(est))}}
        for g, m in (('divergence', D['div']), ('no divergence', ~D['div'])):
            x = D[m]; t = {'n': len(x), 'cont': float(x['cont'].mean()), 'fade': float(x['fade'].mean())}
            for k in ('fol', 'fad'):
                v = x[k].to_numpy(float); t[k] = float(v.mean()); t[k + 't'] = float(v.mean() / v.std(ddof=1) * math.sqrt(len(v)))
                t[k + '_h1'] = float(x[~x['h2']][k].mean()); t[k + '_h2'] = float(x[x['h2']][k].mean())
                if g == 'divergence': tests.append((1 - N.cdf(t[k + 't']), sname, lev, k))
            out[g] = t
        # big-gap divergences (wt2 drop >= 10, like the owner's example)
        x = D[D['div'] & (D['gap'] >= 10)]
        out['big gap (≥10)'] = {'n': len(x), 'cont': float(x['cont'].mean()) if len(x) else None, 'fade': float(x['fade'].mean()) if len(x) else None,
                                'fad': float(x['fad'].mean()) if len(x) else None, 'fad_h1': float(x[~x['h2']]['fad'].mean()) if len(x) else None,
                                'fad_h2': float(x[x['h2']]['fad'].mean()) if len(x) else None}
        res[(sname, lev)] = (lab, out)
        print(sname, lev, len(D), f"{est*100:+.1f}pp", flush=True)
tests.sort(); M = len(tests); cut = 0
for i, (pv, *_) in enumerate(tests, 1):
    if pv <= 0.10 * i / M: cut = i
bh = {(a, b, c) for _, a, b, c in tests[:cut]}
conf = 'confirmation (SPX, DOW, US2000, DE30, UK100)'
for (sname, lev), (lab, out) in res.items():
    t = out['divergence']; t['pass'] = [k for k in ('fol', 'fad') if (sname, lev, k) in bh and t[k + '_h1'] > 0 and t[k + '_h2'] > 0]
    if sname == 'NQ':
        c = res[(conf, lev)][1]['divergence']; t['pass'] = [k for k in t['pass'] if c[k + '_h1'] > 0 and c[k + '_h2'] > 0]

pp = lambda v: f'{v*100:+.1f}pp'; f3 = lambda v: '–' if v is None or v != v else f'{v:+.3f}'; P = lambda v: '–' if v is None else f'{v:.0%}'
print('\n# Cipher B WaveTrend divergence at the vol lines — results\n')
print('Pre-registration: forge/VMC_DIVERGENCE_INDICES_PREREG.md (9b6d7d0). Event: the first qualifying wt2 fractal top (bottom for down lines) '
      'at or beyond a vol line, confirmed within 60 min of the touch; race and R from the confirmation bar. Divergence vs a qualifying top at the line '
      'without one. Within-cell (line family × London hour × range used); day-bootstrap 95% CI.\n')
print('| set | OB level | divergence: continue / fade | no divergence: continue / fade | continue effect [95% CI] | 2016–22 | 2023–26 | REAL? | fade R (16–22 / 23–26) | follow R | PASS |')
print('|---|---|---|---|---|---|---|---|---|---|---|')
for (sname, lev), (lab, out) in res.items():
    a, b, t = out['divergence'], out['no divergence'], out['T1']
    print(f"| {sname} | {lab} | {P(a['cont'])} / {P(a['fade'])} (n={a['n']:,}) | {P(b['cont'])} / {P(b['fade'])} (n={b['n']:,}) | {pp(t['est'])} [{pp(t['lo'])}, {pp(t['hi'])}] | "
          f"{pp(t['h1'])} | {pp(t['h2'])} | {'**yes**' if t['real'] else 'no'} | {f3(a['fad'])} ({f3(a['fad_h1'])} / {f3(a['fad_h2'])}) | {f3(a['fol'])} | {'+'.join(a['pass']) or '–'} |")
print('\nBig divergences only (wt2 gap ≥ 10, like the 2026-10-01 NQ example) — descriptive, added after pre-registration, not a test:\n\n| set | OB level | n | continue | fade | fade R (16–22 / 23–26) |\n|---|---|---|---|---|---|')
for (sname, lev), (lab, out) in res.items():
    x = out['big gap (≥10)']
    print(f"| {sname} | {lab} | {x['n']:,} | {P(x['cont'])} | {P(x['fade'])} | {f3(x['fad'])} ({f3(x['fad_h1'])} / {f3(x['fad_h2'])}) |")
print(f'\nBH 10% over {M} tests: {cut} survive before the both-halves (and, for NQ, confirmation) check.')
