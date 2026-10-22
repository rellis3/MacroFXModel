"""Divergence / reaction / A2 / ceiling scorer — forge/DIVERGENCE_REACTION_PREREG.md.
    python scripts/rangebook/div_score.py > analysis/output/rangebook/DIVERGENCE_REACTION_RESULTS.md
"""
import json, math
import numpy as np, pandas as pd
from statistics import NormalDist
from sklearn.ensemble import HistGradientBoostingClassifier
from crosspair_buckets import ALL

SPLIT, B = '2023-01-01', 500
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

rows = []
for p in ALL:
    seq = {f"{s['date']}|{s['line']}|{s['pass']}": s for s in json.load(open(f'analysis/output/rangebook/{p}_sequence.json'))['passes'] if not s['sameBar']}
    ap = {a['key'] if 'key' in a else f"{a['date']}|{a['line']}|{a['pass']}": a for a in json.load(open(f'analysis/output/rangebook/{p}_approach.json'))['rows']}
    lv = json.load(open(f'analysis/output/rangebook/{p}_levels.json')); li = {c: i for i, c in enumerate(lv['cols'])}
    lvk = {f'{r[0]}|{r[1]}|{r[2]}': r for r in lv['rows']}
    for r in json.load(open(f'analysis/output/rangebook/{p}_div.json'))['rows']:
        s = seq[r['key']]; a = ap.get(r['key'], {}); L = lvk.get(r['key'])
        fo, fa = rr(s['outcome'], s['dc'], s['df'], s['lastMove'], s['costSig'])
        x = {'inst': p, 'date': s['date'], 'h2': s['date'] >= SPLIT, 'fam': FAMS.index(fam(s['line'])), 'hour': min(24, s['londonMin'] // 60),
             'usedb': usedb(s['used']), 'used': s['used'], 'londonMin': s['londonMin'], 'pass': s['pass'], 'dc': s['dc'], 'df': s['df'],
             'be': s['df'] / (s['dc'] + s['df']), 'cont': s['outcome'] == 'cont', 'fadeO': s['outcome'] in ('fade', 'both'), 'fol': fo, 'fad': fa,
             'd1m5': r['d1m5'], 'd1m15': r['d1m15'], 'd2': r['d2'], 'roc240': r['roc240'], 'atrRatio': r['atrRatio'], 'explosion': r['explosion'], 'vwapBand': r['vwapBand']}
        if r['d2race']: x.update(d2o=r['d2race']['o'], d2fol=r['d2race']['fol'], d2fad=r['d2race']['fad'])
        for m in (5, 15, 30):
            q = r.get(f'r{m}')
            if q and q['race']: x.update({f'r{m}now': q['now'], f'r{m}ext': q['ext'], f'r{m}speed': q['speed'], f'r{m}o': q['race']['o'], f'r{m}fol': q['race']['fol'], f'r{m}fad': q['race']['fad']})
        for k in APP: x[k] = a.get(k)
        for t in LTYPES: x['lv_' + t] = L[li[t]] if L else None
        rows.append(x)
D = pd.DataFrame(rows); n = len(D)
D['cell'] = (D['fam'] * 25 + D['hour']) * 5 + D['usedb']; D['day'] = pd.factorize(D['inst'] + D['date'])[0]
NC, ND = 7 * 25 * 5, D['day'].max() + 1
rng = np.random.default_rng(20261001); POIS = [rng.poisson(1.0, ND) for _ in range(B)]
print(f'loaded {n:,} passes', flush=True)

def within(y, cell, flag, w):
    k = cell * 2 + flag
    nn = np.bincount(k, weights=w, minlength=NC * 2).reshape(NC, 2); cc = np.bincount(k, weights=w * y, minlength=NC * 2).reshape(NC, 2)
    ok = (nn[:, 0] > 0) & (nn[:, 1] > 0)
    d = cc[ok, 1] / nn[ok, 1] - cc[ok, 0] / nn[ok, 0]; ww = nn[ok, 0] * nn[ok, 1] / (nn[ok, 0] + nn[ok, 1])
    return float((d * ww).sum() / ww.sum()) if ww.sum() else float('nan')
def t1(sub, a_mask, b_mask, ycol):
    """Within-cell continue difference a vs b (rows outside a|b dropped)."""
    m = (a_mask | b_mask) & sub
    y = D['cont'].to_numpy(float) if ycol == 'cont' else (D[ycol] == 'cont').to_numpy(float)
    y, cell, flag, day, h2 = y[m], D['cell'].to_numpy()[m], a_mask[m].astype(int), D['day'].to_numpy()[m], D['h2'].to_numpy()[m]
    est = within(y, cell, flag, np.ones(len(y)))
    bs = [within(y, cell, flag, P[day]) for P in POIS]; lo, hi = np.percentile(bs, [2.5, 97.5])
    e1, e2 = within(y, cell, flag, (~h2).astype(float)), within(y, cell, flag, h2.astype(float))
    return {'est': est, 'lo': float(lo), 'hi': float(hi), 'h1': e1, 'h2': e2, 'na': int(a_mask[m].sum()), 'nb': int(b_mask[m].sum()),
            'real': bool((lo > 0 or hi < 0) and np.sign(e1) == np.sign(e2) == np.sign(est))}
def trade(m, fol='fol', fad='fad', o='cont'):
    x = D[m]; out = {'n': len(x), 'cont': float(x['cont'].mean() if o == 'cont' else (x[o] == 'cont').mean())}
    for k, c in (('fol', fol), ('fad', fad)):
        v = x[c].to_numpy(float); out[k] = float(v.mean()); out[k + 't'] = float(v.mean() / v.std(ddof=1) * math.sqrt(len(v)))
        out[k + '_h1'] = float(x[~x['h2']][c].mean()); out[k + '_h2'] = float(x[x['h2']][c].mean())
    return out

ALLM = np.ones(n, bool); col = lambda c: D[c].to_numpy()
res, tests = {}, []
def add(name, cmp, groups, outcol='cont', fol='fol', fad='fad', avail=ALLM):
    res[name] = {'T1': t1(avail, *cmp, outcol), 'groups': {g: trade(m & avail, fol, fad, outcol) for g, m in groups.items()}}
    for g, t in res[name]['groups'].items():
        for d in ('fol', 'fad'): tests.append((1 - N.cdf(t[d + 't']), name, g, d))
    t = res[name]['T1']; print(f"{name}: {t['est']*100:+.1f}pp [{t['lo']*100:+.1f},{t['hi']*100:+.1f}] real={t['real']}", flush=True)

for tf in ('d1m5', 'd1m15'):
    c = col(tf)
    add(f'{tf}: divergence vs new extreme without it', (c == 'div', c == 'newExtNoDiv'), {'divergence': c == 'div', 'new extreme, no divergence': c == 'newExtNoDiv', 'no new extreme': c == 'noNewExt'})
has2 = D['d2o'].notna().to_numpy(); c = col('d2')
add('d2: confirmed divergence vs confirmed turn without it', (c == 'div', c == 'noDiv'), {'confirmed divergence': (c == 'div') & has2, 'confirmed turn, no divergence': (c == 'noDiv') & has2,
    'turn at a lower extreme': (c == 'lowerExt') & has2}, 'd2o', 'd2fol', 'd2fad', has2)
for m in (5, 15, 30):
    hv = D[f'r{m}o'].notna().to_numpy(); now = D[f'r{m}now'].to_numpy(float)
    add(f'r{m}: back inside vs still beyond ({m} min after)', (now < -0.1, now > 0.1), {'back inside (>0.1σ)': (now < -0.1) & hv, 'at the line': (np.abs(now) <= 0.1) & hv, 'still beyond (>0.1σ)': (now > 0.1) & hv},
        f'r{m}o', f'r{m}fol', f'r{m}fad', hv)
for k in ('roc240', 'atrRatio', 'explosion'):
    v = D[k].to_numpy(float); e = np.nanpercentile(v[~D['h2'].to_numpy() & ~np.isnan(v)], [100 / 3, 200 / 3])
    add(f'{k}: top vs bottom third', (v >= e[1], v < e[0]), {f'low (<{e[0]:.2f})': v < e[0], 'mid': (v >= e[0]) & (v < e[1]), f'high (≥{e[1]:.2f})': v >= e[1]})
v = D['vwapBand'].to_numpy(float)
add('vwapBand: beyond 2σ vs inside 1σ', (v > 2, v < 1), {'inside 1σ': v < 1, '1–2σ': (v >= 1) & (v < 2), '2–3σ': (v >= 2) & (v < 3), 'beyond 3σ': v >= 3})

tests.sort(); M = len(tests); cut = 0
for i, (pv, *_) in enumerate(tests, 1):
    if pv <= 0.10 * i / M: cut = i
bh = {(a, b, c) for _, a, b, c in tests[:cut]}
for name, r in res.items():
    for g, t in r['groups'].items(): t['pass'] = [d for d in ('fol', 'fad') if (name, g, d) in bh and t[d + '_h1'] > 0 and t[d + '_h2'] > 0]

# ── T3 ceiling: one GBM on every feature, walk-forward 2023-2026, 7-day embargo ──
FE = ['fam', 'londonMin', 'used', 'pass', 'dc', 'df', *APP, *['lv_' + t for t in LTYPES], 'roc240', 'atrRatio', 'explosion', 'vwapBand', 'd1m5c', 'd1m15c']
code = {'div': 0, 'newExtNoDiv': 1, 'noNewExt': 2, 'noSwing': 3}
D['d1m5c'] = D['d1m5'].map(code); D['d1m15c'] = D['d1m15'].map(code)
X = D[FE].astype(float); dates = pd.to_datetime(D['date'])
D['p_cont'] = np.nan; D['p_fade'] = np.nan; D['base_cont'] = np.nan; D['base_fade'] = np.nan
for y in (2023, 2024, 2025, 2026):
    te = (dates.dt.year == y).to_numpy(); tr = (dates < pd.Timestamp(f'{y}-01-01') - pd.Timedelta(days=7)).to_numpy()
    if not te.any(): continue
    for tgt, pc, bc in (('cont', 'p_cont', 'base_cont'), ('fadeO', 'p_fade', 'base_fade')):
        mdl = HistGradientBoostingClassifier(**GBM).fit(X[tr], D[tgt][tr].astype(int))
        D.loc[te, pc] = mdl.predict_proba(X[te])[:, 1]
        cr = D[tr].groupby('cell')[tgt].mean(); D.loc[te, bc] = D.loc[te, 'cell'].map(cr).fillna(D[tgt][tr].mean()).to_numpy()
    print('fold', y, flush=True)
T = D[D['p_cont'].notna()].copy()
def bss(p, b, yv): return 1 - ((p - yv) ** 2).sum() / ((b - yv) ** 2).sum()
ceil = {}
for tgt, pc, bc in (('cont', 'p_cont', 'base_cont'), ('fadeO', 'p_fade', 'base_fade')):
    yv = T[tgt].astype(float).to_numpy(); p, b, dd = T[pc].to_numpy(), T[bc].to_numpy(), pd.factorize(T['day'])[0]
    bs = []
    for P in POIS[:300]:
        w = P[:dd.max() + 1][dd]; bs.append(1 - (w * (p - yv) ** 2).sum() / (w * (b - yv) ** 2).sum())
    ceil[tgt] = {'bss': bss(p, b, yv), 'ci': [float(x) for x in np.percentile(bs, [2.5, 97.5])]}
yrs = T['date'].str[:4]
fol_sel = (T['p_cont'] - T['be']) > 0.05; fad_sel = (T['p_fade'] - (1 - T['be'])) > 0.05
for nm, sel, c in (('follow when predicted continue beats break-even by 5+', fol_sel, 'fol'), ('fade when predicted fade beats break-even by 5+', fad_sel, 'fad')):
    x = T[sel]
    ceil[nm] = {'n': int(len(x)), 'R': float(x[c].mean()) if len(x) else None, 'R_2324': float(x[yrs[sel].isin(['2023', '2024'])][c].mean()) if len(x) else None,
                'R_2526': float(x[yrs[sel].isin(['2025', '2026'])][c].mean()) if len(x) else None}
    ceil[nm]['pass'] = bool(len(x) and ceil[nm]['R_2324'] > 0 and ceil[nm]['R_2526'] > 0)
# calibration: how far does the model move continue odds?
T['dec'] = pd.qcut(T['p_cont'] - T['base_cont'], 10, labels=False, duplicates='drop')
ceil['deciles'] = [{'shift': float(g['p_cont'].mean() - g['base_cont'].mean()), 'actual_minus_base': float(g['cont'].mean() - g['base_cont'].mean()),
                    'be_gap': float(g['cont'].mean() - g['be'].mean()), 'n': int(len(g))} for _, g in T.groupby('dec')]
json.dump({'res': res, 'ceiling': ceil, 'tests': M, 'bh': cut}, open('analysis/output/rangebook/divergence_reaction.json', 'w'))

pp = lambda x: f'{x*100:+.1f}pp'; P_ = lambda x: f'{x:.0%}'
print('\n# WaveTrend divergence, the reaction after the touch, and the all-features ceiling — results\n')
print(f'Pre-registration: forge/DIVERGENCE_REACTION_PREREG.md (9c00342). {n:,} passes, 16 instruments. Effects are within-cell (line family × London hour × '
      'range used) continue-rate differences with a day-bootstrap 95% CI; REAL = CI excludes 0 and both halves agree. R is net of spread; '
      'for D2 and R1 the race and R start at the decision bar.\n')
print('## T1 — does it change continue vs fade?\n\n| column | comparison | effect [95% CI] | 2016–22 | 2023–26 | n (a / b) | REAL? |\n|---|---|---|---|---|---|---|')
for name, r in res.items():
    t = r['T1']; a, b = name.split(': ', 1)
    print(f"| {a} | {b} | {pp(t['est'])} [{pp(t['lo'])}, {pp(t['hi'])}] | {pp(t['h1'])} | {pp(t['h2'])} | {t['na']:,} / {t['nb']:,} | {'**yes**' if t['real'] else 'no'} |")
print('\n## T2 — can you trade it?\n\n| column | group | passes | continue | follow R | fade R | follow halves | fade halves | PASS |\n|---|---|---|---|---|---|---|---|---|')
for name, r in res.items():
    for g, t in r['groups'].items():
        print(f"| {name.split(':')[0]} | {g} | {t['n']:,} | {P_(t['cont'])} | {t['fol']:+.3f} | {t['fad']:+.3f} | {t['fol_h1']:+.3f} / {t['fol_h2']:+.3f} | {t['fad_h1']:+.3f} / {t['fad_h2']:+.3f} | {'+'.join(t['pass']) or '–'} |")
print(f'\nBH 10% over {M} tests: {cut} survive before the both-halves check.\n')
print('## T3 — everything combined (walk-forward 2023–2026)\n')
for tgt, lab in (('cont', 'continue'), ('fadeO', 'fade')):
    c = ceil[tgt]; print(f"- Brier skill predicting **{lab}** vs the book's cell rates: {c['bss']*100:+.1f}% [{c['ci'][0]*100:+.1f}, {c['ci'][1]*100:+.1f}]")
for nm in ('follow when predicted continue beats break-even by 5+', 'fade when predicted fade beats break-even by 5+'):
    c = ceil[nm]; f3 = lambda v: '–' if v is None or v != v else f'{v:+.3f}'
    print(f"- {nm}: {c['n']:,} passes, net {f3(c['R'])}R (2023–24 {f3(c['R_2324'])}, 2025–26 {f3(c['R_2526'])}) — {'**PASS**' if c['pass'] else 'fail'}")
print('\nHow far the combined model moves the odds (deciles of predicted shift):\n\n| decile | predicted shift | actual shift vs book | continue − break-even | passes |\n|---|---|---|---|---|')
for i, d in enumerate(ceil['deciles'], 1):
    print(f"| {i} | {pp(d['shift'])} | {pp(d['actual_minus_base'])} | {pp(d['be_gap'])} | {d['n']:,} |")
