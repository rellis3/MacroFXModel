"""Flow and positioning columns scorer — forge/FLOW_COLUMNS_PREREG.md.
    python scripts/rangebook/flow_score.py > analysis/output/rangebook/FLOW_COLUMNS_RESULTS.md
"""
import json, math
import numpy as np, pandas as pd
from statistics import NormalDist
from sklearn.ensemble import HistGradientBoostingClassifier
from crosspair_buckets import ALL

SPLIT, B = '2023-01-01', 1000
FX6 = ['eurusd', 'gbpusd', 'audusd', 'usdcad', 'usdchf', 'usdjpy']
GBM = dict(max_depth=3, learning_rate=0.05, max_iter=300, l2_regularization=1.0, min_samples_leaf=100, random_state=0)
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
LTYPES = ['sessionOpens', 'prevDayOpen', 'weekOpen', 'pdhl', 'pwhl', 'prevClose', 'roundNum', 'fibGP', 'fibExt', 'poc', 'valueArea', 'nakedPOC', 'fvgM15', 'fvgH1']
APP = ['mv5', 'mv15', 'mv60', 'accel', 'er15', 'er60', 'barSize', 'wt1m', 'wtSlope', 'wtWith', 'wtSinceCross', 'wt15m', 'wt1h', 'mf', 'wtS15', 'wtS1h',
       'relVol5', 'relVol15', 'relVol60', 'volTrend', 'vwapDist', 'minsSincePrev']
N = NormalDist()
def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def usedb(u): return 4 if u is None else 0 if u < 0.5 else 1 if u < 0.8 else 2 if u < 1.0 else 3
def rr(o, dc, df, lm, c):
    f = dc / df if o == 'cont' else -1.0 if o in ('fade', 'both') else max(-1.0, min(dc / df, lm / df))
    a = df / dc if o == 'fade' else -1.0 if o in ('cont', 'both') else max(-1.0, min(df / dc, -lm / dc))
    return f - c / df, a - c / dc
J = lambda p, k: json.load(open(f'analysis/output/rangebook/{p}_{k}.json'))

rows = []
for p in ALL + ['nq']:
    seq = {f"{s['date']}|{s['line']}|{s['pass']}": s for s in J(p, 'sequence')['passes'] if not s['sameBar']}
    fl = {r['key']: r for r in J(p, 'flow')['rows']}
    book = p != 'nq'
    if book:
        ap = {f"{a['date']}|{a['line']}|{a['pass']}": a for a in J(p, 'approach')['rows']}
        lv = J(p, 'levels'); li = {c: i for i, c in enumerate(lv['cols'])}; lvk = {f'{r[0]}|{r[1]}|{r[2]}': r for r in lv['rows']}
        dv = {r['key']: r for r in J(p, 'div')['rows']}
    for key, s in seq.items():
        f = fl.get(key)
        if f is None: continue
        fo, fa = rr(s['outcome'], s['dc'], s['df'], s['lastMove'], s['costSig'])
        x = {'inst': p, 'book': book, 'date': s['date'], 'h2': s['date'] >= SPLIT, 'fam': FAMS.index(fam(s['line'])), 'hour': min(24, s['londonMin'] // 60),
             'usedb': usedb(s['used']), 'used': s['used'], 'londonMin': s['londonMin'], 'pass': s['pass'], 'dc': s['dc'], 'df': s['df'],
             'be': s['df'] / (s['dc'] + s['df']), 'cont': s['outcome'] == 'cont', 'fadeO': s['outcome'] in ('fade', 'both'), 'fol': fo, 'fad': fa, **{k: f[k] for k in f if k != 'key'}}
        if book:
            a = ap.get(key, {}); L = lvk.get(key); d = dv.get(key, {})
            for k in APP: x[k] = a.get(k)
            for t in LTYPES: x['lv_' + t] = L[li[t]] if L else None
            for k in ('roc240', 'atrRatio', 'explosion', 'vwapBand'): x[k] = d.get(k)
            x['d1m5c'] = {'div': 0, 'newExtNoDiv': 1, 'noNewExt': 2, 'noSwing': 3}.get(d.get('d1m5'))
            mv = abs(a['mv15']) if a.get('mv15') is not None else None
            x['absorb'] = a['relVol15'] / max(mv, 0.02) if a.get('relVol15') is not None and mv is not None else None
        rows.append(x)
D = pd.DataFrame(rows); n = len(D)
D['cell'] = (D['fam'] * 25 + D['hour']) * 5 + D['usedb']; D['day'] = pd.factorize(D['inst'] + D['date'])[0]
NC, ND = 7 * 25 * 5, int(D['day'].max()) + 1
rng = np.random.default_rng(20261001); POIS = [rng.poisson(1.0, ND) for _ in range(B)]
print(f'loaded {n:,} passes', flush=True)

def within(y, cell, flag, w):
    k = cell * 2 + flag
    nn = np.bincount(k, weights=w, minlength=NC * 2).reshape(NC, 2); cc = np.bincount(k, weights=w * y, minlength=NC * 2).reshape(NC, 2)
    ok = (nn[:, 0] > 0) & (nn[:, 1] > 0)
    d = cc[ok, 1] / nn[ok, 1] - cc[ok, 0] / nn[ok, 0]; ww = nn[ok, 0] * nn[ok, 1] / (nn[ok, 0] + nn[ok, 1])
    return float((d * ww).sum() / ww.sum()) if ww.sum() else float('nan')
def t1(a, b, ctrl=None):
    """a vs b within-cell continue difference (minus the same for a placebo pair ctrl=(a2, b2) if given)."""
    def stat(w):
        s = lambda A, Bm: within(D['cont'].to_numpy(float)[A | Bm], D['cell'].to_numpy()[A | Bm], A[A | Bm].astype(int), w[A | Bm])
        v = s(a, b); return v - s(*ctrl) if ctrl else v
    one = np.ones(n); dd = D['day'].to_numpy(); h2 = D['h2'].to_numpy()
    est = stat(one); bs = [stat(P[dd].astype(float)) for P in POIS]; lo, hi = np.percentile(bs, [2.5, 97.5])
    e1, e2 = stat((~h2).astype(float)), stat(h2.astype(float))
    return {'est': est, 'lo': float(lo), 'hi': float(hi), 'h1': e1, 'h2': e2, 'na': int(a.sum()), 'nb': int(b.sum()),
            'real': bool((lo > 0 or hi < 0) and np.sign(e1) == np.sign(e2) == np.sign(est))}
def trade(m):
    x = D[m]; out = {'n': int(len(x)), 'cont': float(x['cont'].mean())}
    for k in ('fol', 'fad'):
        v = x[k].to_numpy(float); out[k] = float(v.mean()); out[k + 't'] = float(v.mean() / v.std(ddof=1) * math.sqrt(len(v))) if len(v) > 1 else 0.0
        out[k + '_h1'] = float(x[~x['h2']][k].mean()); out[k + '_h2'] = float(x[x['h2']][k].mean())
    return out

V = lambda c: D[c].to_numpy(float)
inst = D['inst'].to_numpy(); bk = D['book'].to_numpy()
res, tests = {}, []
def add(name, a, b, labels, ctrl=None):
    res[name] = {'T1': t1(a, b, ctrl), 'groups': {labels[0]: trade(a), labels[1]: trade(b)}}
    for g, t in res[name]['groups'].items():
        for d in ('fol', 'fad'): tests.append((1 - N.cdf(t[d + 't']), name, g, d))
    t = res[name]['T1']; print(f"{name}: {t['est']*100:+.2f}pp [{t['lo']*100:+.2f},{t['hi']*100:+.2f}] real={t['real']}", flush=True)

gx = V('gex')
add('G: dealer gamma, NQ (long vs short)', (inst == 'nq') & (gx > 0), (inst == 'nq') & (gx < 0), ('long gamma', 'short gamma'))
fx6 = np.isin(inst, FX6)
add('G: dealer gamma, 6 FX (long vs short)', fx6 & (gx > 0), fx6 & (gx < 0), ('long gamma', 'short gamma'))
pin, pinP = V('pin'), V('pinP'); hasx = ~np.isnan(pin)
add('E: expiring strike at the line, NQ + 6 FX (real − placebo)', hasx & (pin <= 0.05), hasx & (pin > 0.05), ('pinned', 'not pinned'), ctrl=(hasx & (pinP <= 0.05), hasx & (pinP > 0.05)))
cat, cz = V('cat'), V('catZ')
add('C: catalyst within 60 min (16 book)', bk & (cat == 1), bk & (cat == 0), ('catalyst', 'no catalyst'))
add('C: surprise aligned vs against the touch (16 book)', bk & (cz >= 0.5), bk & (cz <= -0.5), ('aligned', 'against'))
fix, me = V('fix'), V('monthEnd')
add('F: fix window, month-end vs other days (16 book)', bk & (fix == 1) & (me == 1), bk & (fix == 1) & (me == 0), ('month-end fix', 'other fix'))
ab = V('absorb'); e = np.nanpercentile(ab[bk & ~D['h2'].to_numpy() & ~np.isnan(ab)], [100 / 3, 200 / 3])
add('A: absorption, absorbed vs vacuum (16 book)', bk & (ab >= e[1]), bk & (ab < e[0]), ('absorbed (top third)', 'vacuum (bottom third)'))
hq = V('hmmQuiet')
add('H: intraday HMM, quiet vs active (16 book)', bk & (hq > 0.7), bk & (hq < 0.3), ('quiet', 'active'))

tests.sort(); M = len(tests); cut = 0
for i, (pv, *_) in enumerate(tests, 1):
    if pv <= 0.10 * i / M: cut = i
bhs = {(a, b, c) for _, a, b, c in tests[:cut]}
for name, r in res.items():
    for g, t in r['groups'].items(): t['pass'] = [d for d in ('fol', 'fad') if (name, g, d) in bhs and t[d + '_h1'] > 0 and t[d + '_h2'] > 0]

# T3: all-features model with and without the new columns (16 book instruments; walk-forward 2023-2026)
B16 = D[D['book']].copy()
OLD = ['fam', 'londonMin', 'used', 'pass', 'dc', 'df', *APP, *['lv_' + t for t in LTYPES], 'roc240', 'atrRatio', 'explosion', 'vwapBand', 'd1m5c']
NEW = OLD + ['gex', 'gexRel', 'pin', 'cat', 'catZ', 'fix', 'monthEnd', 'absorb', 'hmmQuiet']
dates = pd.to_datetime(B16['date']); t3 = {}
for nm, FE in (('previous features', OLD), ('+ flow columns', NEW)):
    X = B16[FE].astype(float); pc = np.full(len(B16), np.nan); base = np.full(len(B16), np.nan)
    for y in (2023, 2024, 2025, 2026):
        te = (dates.dt.year == y).to_numpy(); tr = (dates < pd.Timestamp(f'{y}-01-01') - pd.Timedelta(days=7)).to_numpy()
        if not te.any(): continue
        mdl = HistGradientBoostingClassifier(**GBM).fit(X[tr], B16['cont'][tr].astype(int)); pc[te] = mdl.predict_proba(X[te])[:, 1]
        cr = B16[tr].groupby('cell')['cont'].mean(); base[te] = B16.loc[te, 'cell'].map(cr).fillna(B16['cont'][tr].mean()).to_numpy()
    m = ~np.isnan(pc); yv = B16['cont'].to_numpy(float)[m]
    sel = m & ((pc - B16['be'].to_numpy()) > 0.05)
    yrs = B16['date'].str[:4].to_numpy()
    t3[nm] = {'bss': float(1 - ((pc[m] - yv) ** 2).sum() / ((base[m] - yv) ** 2).sum()), 'n_sel': int(sel.sum()),
              'R': float(B16['fol'].to_numpy()[sel].mean()) if sel.any() else None,
              'R_2324': float(B16['fol'].to_numpy()[sel & np.isin(yrs, ['2023', '2024'])].mean()) if sel.any() else None,
              'R_2526': float(B16['fol'].to_numpy()[sel & np.isin(yrs, ['2025', '2026'])].mean()) if sel.any() else None}
    print(nm, t3[nm], flush=True)
json.dump({'res': res, 't3': t3, 'tests': M, 'bh': cut}, open('analysis/output/rangebook/flow_columns.json', 'w'))

pp = lambda v: f'{v*100:+.1f}pp'; f3 = lambda v: '–' if v is None or v != v else f'{v:+.3f}'; P = lambda v: f'{v:.0%}'
print('\n# Flow and positioning columns at the vol lines — results\n')
print('Pre-registration: forge/FLOW_COLUMNS_PREREG.md (24ca164). Within-cell (line family × London hour × range used) continue-rate '
      'differences, day-bootstrap 95% CI; REAL = CI excludes 0 and both halves agree (G and E: 2020–22 vs 2023–26). R net of spread.\n')
print('## T1\n\n| column | comparison | effect [95% CI] | first half | 2023–26 | n (a / b) | REAL? |\n|---|---|---|---|---|---|---|')
for name, r in res.items():
    t = r['T1']; a, b = name.split(': ', 1)
    print(f"| {a} | {b} | {pp(t['est'])} [{pp(t['lo'])}, {pp(t['hi'])}] | {pp(t['h1'])} | {pp(t['h2'])} | {t['na']:,} / {t['nb']:,} | {'**yes**' if t['real'] else 'no'} |")
print('\n## T2\n\n| column | group | passes | continue | follow R | fade R | follow halves | fade halves | PASS |\n|---|---|---|---|---|---|---|---|---|')
for name, r in res.items():
    for g, t in r['groups'].items():
        print(f"| {name.split(' (')[0]} | {g} | {t['n']:,} | {P(t['cont'])} | {f3(t['fol'])} | {f3(t['fad'])} | {f3(t['fol_h1'])} / {f3(t['fol_h2'])} | {f3(t['fad_h1'])} / {f3(t['fad_h2'])} | {'+'.join(t['pass']) or '–'} |")
print(f'\nBH 10% over {M} tests: {cut} survive before the both-halves check.\n')
print('## T3 — stacking them on the all-features model (16 book instruments, walk-forward 2023–2026)\n\n| model | Brier skill vs book cells | selective follows | net R | 2023–24 | 2025–26 |\n|---|---|---|---|---|---|')
for nm, v in t3.items():
    print(f"| {nm} | {v['bss']*100:+.2f}% | {v['n_sel']:,} | {f3(v['R'])} | {f3(v['R_2324'])} | {f3(v['R_2526'])} |")
