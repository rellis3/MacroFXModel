"""IV ÷ RV in the book, the rich-IV break rule on indices, COT at the lines — forge/IVRV_COT_PREREG.md.
    python scripts/rangebook/ivrv_cot_score.py > analysis/output/rangebook/IVRV_COT_RESULTS.md
"""
import bisect, csv, json, math
import numpy as np, pandas as pd
from statistics import NormalDist

SPLIT, B = '2023-01-01', 1000; N = NormalDist()
CV = {'audusd': 'AUDUSD', 'eurusd': 'EURUSD', 'gbpusd': 'GBPUSD', 'usdcad': 'USDCAD', 'usdchf': 'USDCHF', 'usdjpy': 'USDJPY', 'gold': 'XAUUSD'}
IXV = {'nq': 'VXN', 'spx': 'VIX', 'dow': 'VXD', 'us2000': 'RVX'}
COTP = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf', 'nzdusd', 'gold']
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
CELLS = [('0.1', 'r5'), ('0.1', 'r10'), ('0.2', 'r5'), ('0.2', 'r10')]
O = 'analysis/output/rangebook/'
def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def usedb(u): return 4 if u is None else 0 if u < 0.5 else 1 if u < 0.8 else 2 if u < 1.0 else 3
def rr(o, dc, df, lm, c):
    f = dc / df if o == 'cont' else -1.0 if o in ('fade', 'both') else max(-1.0, min(dc / df, lm / df))
    a = df / dc if o == 'fade' else -1.0 if o in ('cont', 'both') else max(-1.0, min(df / dc, -lm / dc))
    return f - c / df, a - c / dc
def rv_map(dates, px):
    lr = np.diff(np.log(np.asarray(px, float))); m = {}
    for i in range(21, len(dates)):
        v = np.nanstd(lr[i - 20:i], ddof=1) * math.sqrt(252) * 100
        if v > 0: m[dates[i]] = v
    return m
def prior(sorted_dates, m, date):           # value from the latest key strictly before `date`
    i = bisect.bisect_left(sorted_dates, date) - 1
    return (m[sorted_dates[i]], sorted_dates[i]) if i >= 0 else (None, None)

# IV ÷ RV maps
IVRV = {}
cv = json.load(open('js/data/cmeCvolEod.json'))['series']
for p, k in CV.items():
    rows = cv[k]; d = [r['date'] for r in rows]; rv = rv_map(d, [r['underlying'] or np.nan for r in rows])
    m = {x: rows[i]['cvol'] / rv[x] for i, x in enumerate(d) if x in rv}; IVRV[p] = (sorted(m), m)
for p, s in IXV.items():
    iv = {}
    for r in csv.reader(open(f'{O}cboe/{s}.csv')):
        if not r or not r[0][:1].isdigit(): continue
        mm, dd, yy = r[0].split('/'); iv[f'{yy}-{mm}-{dd}'] = float(r[4])
    daily = json.load(open(f'{O}cboe/{p}_daily.json')); d = [x['date'] for x in daily]; rv = rv_map(d, [x['close'] for x in daily])
    m = {x: iv[x] / rv[x] for x in rv if x in iv}; IVRV[p] = (sorted(m), m)
COT = {p: (lambda s: ([x['from'] for x in s], s))(json.load(open(f'{O}cot/cot_series.json'))[p]) for p in COTP}
def cot_pct(p, date):
    fr, s = COT[p]; i = bisect.bisect_right(fr, date) - 1       # latest report usable on or before this London date
    return s[i]['pct'] if i >= 0 else None

def book(pairs):
    rows = []
    for p in pairs:
        for s in json.load(open(f'{O}{p}_sequence.json'))['passes']:
            if s['sameBar']: continue
            fo, fa = rr(s['outcome'], s['dc'], s['df'], s['lastMove'], s['costSig'])
            iv, used = prior(*IVRV[p], s['date']) if p in IVRV else (None, None)
            assert used is None or used < s['date']                    # look-ahead guard
            rows.append({'inst': p, 'date': s['date'], 'h2': s['date'] >= SPLIT, 'up': s['line'].startswith(('OH_', 'CloseUp', 'ProjH')),
                         'cell': (FAMS.index(fam(s['line'])) * 25 + min(24, s['londonMin'] // 60)) * 5 + usedb(s['used']),
                         'cont': s['outcome'] == 'cont', 'fol': fo, 'fad': fa, 'ivrv': iv, 'cot': cot_pct(p, s['date']) if p in COT else None})
    D = pd.DataFrame(rows); D['day'] = pd.factorize(D['inst'] + D['date'])[0]; return D

NC = 7 * 25 * 5; rng = np.random.default_rng(20261002)
def within(y, cell, flag, w):
    k = cell * 2 + flag
    nn = np.bincount(k, weights=w, minlength=NC * 2).reshape(NC, 2); cc = np.bincount(k, weights=w * y, minlength=NC * 2).reshape(NC, 2)
    ok = (nn[:, 0] > 0) & (nn[:, 1] > 0)
    d = cc[ok, 1] / nn[ok, 1] - cc[ok, 0] / nn[ok, 0]; ww = nn[ok, 0] * nn[ok, 1] / (nn[ok, 0] + nn[ok, 1])
    return float((d * ww).sum() / ww.sum()) if ww.sum() else float('nan')
def t1(D, a, b):
    m = a | b; y, cell, flag, day, h2 = D['cont'].to_numpy(float)[m], D['cell'].to_numpy()[m], a[m].astype(int), D['day'].to_numpy()[m], D['h2'].to_numpy()[m]
    est = within(y, cell, flag, np.ones(len(y))); nd = int(D['day'].max()) + 1
    bs = [within(y, cell, flag, rng.poisson(1.0, nd)[day].astype(float)) for _ in range(B)]; lo, hi = np.percentile(bs, [2.5, 97.5])
    e1, e2 = within(y, cell, flag, (~h2).astype(float)), within(y, cell, flag, h2.astype(float))
    return {'est': est, 'lo': float(lo), 'hi': float(hi), 'h1': e1, 'h2': e2, 'na': int(a.sum()), 'nb': int(b.sum()),
            'real': bool((lo > 0 or hi < 0) and np.sign(e1) == np.sign(e2) == np.sign(est))}
def tr(D, m, k):
    x = D[m]; v = x[k].to_numpy(float)
    return {'n': len(v), 'cont': float(x['cont'].mean()), 'R': float(v.mean()), 't': float(v.mean() / v.std(ddof=1) * math.sqrt(len(v))),
            'h1': float(x[~x['h2']][k].mean()), 'h2': float(x[x['h2']][k].mean())}
pp = lambda v: f'{v*100:+.1f}pp'; f3 = lambda v: '–' if v is None or v != v else f'{v:+.3f}'; P = lambda v: f'{v:.0%}'
out, tests = [], []

# ── A: IV/RV in the book, 7 CVOL instruments ──
A = book(list(CV)); e = (1.05, 1.27); iv = A['ivrv'].to_numpy(float)
top, bot, mid = iv >= e[1], iv < e[0], (iv >= e[0]) & (iv < e[1])
TA = t1(A, top, bot); out.append('## A — IV ÷ RV as a column in the book (7 CVOL instruments)\n')
out.append(f"Rich (top third, ≥ {e[1]}) vs cheap (bottom, < {e[0]}) implied vol: continue {pp(TA['est'])} [{pp(TA['lo'])}, {pp(TA['hi'])}], "
           f"2016–22 {pp(TA['h1'])}, 2023–26 {pp(TA['h2'])}, n {TA['na']:,} / {TA['nb']:,} — {'**real**' if TA['real'] else 'not real'}.\n")
out.append('| third | passes | continue | follow R (halves) | fade R (halves) |\n|---|---|---|---|---|')
for nm, m in (('cheap', bot), ('middle', mid), ('rich', top)):
    a, b = tr(A, m, 'fol'), tr(A, m, 'fad'); tests += [(1 - N.cdf(a['t']), 'A', nm, 'follow', a), (1 - N.cdf(b['t']), 'A', nm, 'fade', b)]
    out.append(f"| {nm} | {a['n']:,} | {P(a['cont'])} | {f3(a['R'])} ({f3(a['h1'])} / {f3(a['h2'])}) | {f3(b['R'])} ({f3(b['h1'])} / {f3(b['h2'])}) |")

# ── B: rich-IV break rule on the indices ──
T = []
for p in IXV:
    for t in json.load(open(f'{O}{p}_asym.json'))['rows']:
        if t['type'] != 'BREAK': continue
        R = [t['s' + s][tg]['R'] for s, tg in CELLS if t.get('s' + s) and t['s' + s].get(tg)]
        if len(R) != 4: continue
        v, used = prior(*IVRV[p], t['date']); assert used is None or used < t['date']
        T.append({'inst': p, 'date': t['date'], 'dir': t['dir'], 'Rm': float(np.mean(R)), 'ivrv': v})
X = pd.DataFrame(T).dropna(subset=['ivrv']); ex = np.percentile(X.loc[X['date'] < SPLIT, 'ivrv'], [100 / 3, 200 / 3])
xt, xb = X[X['ivrv'] >= ex[1]], X[X['ivrv'] < ex[0]]
cB = {'top third net R > 0': xt['Rm'].mean() > 0, 'top > bottom': xt['Rm'].mean() > xb['Rm'].mean(), 'shorts alone > 0': xt[xt['dir'] < 0]['Rm'].mean() > 0}
out.append(f"\n## B — the rich-IV break rule on NQ, SPX, DOW, US2000 (confirmation of forge/BREAK_IVRV_PREREG.md)\n\n"
           f"Index IV ÷ RV edges (2016–22): {ex[0]:.2f} / {ex[1]:.2f}. Top third {f3(xt['Rm'].mean())}R (n={len(xt):,}), middle "
           f"{f3(X[(X['ivrv'] >= ex[0]) & (X['ivrv'] < ex[1])]['Rm'].mean())}, bottom {f3(xb['Rm'].mean())} (n={len(xb):,}); top-third longs "
           f"{f3(xt[xt['dir'] > 0]['Rm'].mean())}, shorts {f3(xt[xt['dir'] < 0]['Rm'].mean())}. Per index (top third): "
           + ', '.join(f"{k.upper()} {f3(v)}" for k, v in xt.groupby('inst')['Rm'].mean().items()) + '.\n')
out.append('| condition | holds? |\n|---|---|\n' + '\n'.join(f"| {k} | {'yes' if v else '**no**'} |" for k, v in cB.items()))
out.append(f"\n**B: {'CONFIRMED' if all(cB.values()) else 'NOT CONFIRMED'}**\n")
I = book(list(IXV)); ivi = I['ivrv'].to_numpy(float); TI = t1(I, ivi >= ex[1], ivi < ex[0])
out.append(f"Index book race, rich vs cheap: continue {pp(TI['est'])} [{pp(TI['lo'])}, {pp(TI['hi'])}] (2016–22 {pp(TI['h1'])}, 2023–26 {pp(TI['h2'])}).\n")

# ── C: COT at the lines ──
C = book(COTP); pc, up = C['cot'].to_numpy(float), C['up'].to_numpy()
crowdL, crowdS = pc >= 80, pc <= 20
withC = (up & crowdL) | (~up & crowdS); agC = (up & crowdS) | (~up & crowdL)
TC = t1(C, withC, agC)
out.append('## C — COT positioning at the lines (8 instruments)\n')
out.append(f"Touch heading the way speculators are crowded vs against them: continue {pp(TC['est'])} [{pp(TC['lo'])}, {pp(TC['hi'])}], "
           f"2016–22 {pp(TC['h1'])}, 2023–26 {pp(TC['h2'])}, n {TC['na']:,} / {TC['nb']:,} — {'**real**' if TC['real'] else 'not real'}.\n")
out.append('| group | passes | continue | follow R (halves) | fade R (halves) |\n|---|---|---|---|---|')
for nm, m in (('with the crowd', withC), ('against the crowd', agC), ('no crowding', ~withC & ~agC & ~np.isnan(pc))):
    a, b = tr(C, m, 'fol'), tr(C, m, 'fad')
    if nm != 'no crowding': tests += [(1 - N.cdf(a['t']), 'C', nm, 'follow', a), (1 - N.cdf(b['t']), 'C', nm, 'fade', b)]
    out.append(f"| {nm} | {a['n']:,} | {P(a['cont'])} | {f3(a['R'])} ({f3(a['h1'])} / {f3(a['h2'])}) | {f3(b['R'])} ({f3(b['h1'])} / {f3(b['h2'])}) |")

tests.sort(key=lambda x: x[0]); M = len(tests); cut = 0
for i, t in enumerate(tests, 1):
    if t[0] <= 0.10 * i / M: cut = i
passed = [f"{t[1]} {t[2]} {t[3]}" for t in tests[:cut] if t[4]['h1'] > 0 and t[4]['h2'] > 0]
print('# IV ÷ RV in the book, the rich-IV break rule on indices, COT at the lines — results\n')
print('Pre-registration: forge/IVRV_COT_PREREG.md (bac14d5). Within-cell (line family × London hour × range used) continue differences, '
      'day-bootstrap 95% CI. R net of spread. Every IV ÷ RV value is asserted to come from a date before the pass.\n')
print('\n'.join(out))
print(f"\nT2 (A + C): BH 10% over {M} rows, {cut} survive; passing both halves too: {', '.join(passed) or 'none'}.")
