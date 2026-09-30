"""Theory-lab features at the levels — scorer (forge/THEORY_FEATURES_LEVELS_PREREG.md).
    python scripts/rangebook/theory_score.py > analysis/output/rangebook/THEORY_FEATURES_RESULTS.md
Baseline features/settings are the approach book's (approach_score.py).
"""
import json, math
import numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier as HGBC, HistGradientBoostingRegressor as HGBR
from daytable import GBM, YEARS

SPLIT = '2023-01-01'
OLD = ['mv5', 'mv15', 'mv60', 'accel', 'er15', 'er60', 'barSize', 'wt1m', 'wtSlope', 'wtWith', 'wtSinceCross',
       'wt15m', 'wt1h', 'mf', 'relVol5', 'relVol15', 'relVol60', 'volTrend', 'vwapDist', 'minsSincePrev']
NEW = ['factorMove', 'ownMove', 'ownShare', 'vr', 'jump', 'skew']
LABEL = {'factorMove': 'dollar-driven move into the line (60 min)', 'ownMove': 'euro-only move into the line (60 min)',
         'ownShare': 'share of the move that is euro-only', 'vr': 'variance ratio (trending > 1)',
         'jump': 'jump ratio (spike into the line)', 'skew': 'options skew toward the line'}
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']

df = pd.DataFrame(json.load(open('analysis/output/rangebook/eurusd_approach.json'))['rows'])
th = json.load(open('analysis/output/rangebook/eurusd_theory.json'))
for c in NEW: df[c] = [th.get(f"{d}|{l}|{p}", {}).get(c) for d, l, p in zip(df['date'], df['line'], df['pass'])]
def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def rr(r):
    o, dc, dF, lm, c = r.outcome, r.dc, r.df, r.lastMove, r.costSig
    if o == 'cont': f, a = dc / dF, -1.0
    elif o == 'fade': f, a = -1.0, dF / dc
    elif o == 'both': f, a = -1.0, -1.0
    else: f, a = max(-1.0, min(dc / dF, lm / dF)), max(-1.0, min(dF / dc, -lm / dc))
    return f - c / dF, a - c / dc
df[['follow', 'fadeR']] = pd.DataFrame([rr(r) for r in df.itertuples()], index=df.index)
df['fam'] = df['line'].map(fam); df['train'] = df['date'] < SPLIT; df['cont'] = (df['outcome'] == 'cont').astype(int)
df['year'] = pd.to_datetime(df['date']).dt.year; df['pb'] = df['pass'].clip(upper=3)
df['fam_c'] = df['fam'].map({f: i for i, f in enumerate(FAMS)})
df['side'] = df['line'].str.split('_').str[0].isin(['OH', 'CloseUp', 'ProjH']).astype(int)
tr0 = df[df['train']]
edges = {f: tr0[f].quantile([1 / 3, 2 / 3]).to_list() for f in NEW}
for f in NEW:
    lo, hi = edges[f]
    df['b_' + f] = [None if v is None or (isinstance(v, float) and math.isnan(v)) else 'low' if v < lo else 'mid' if v < hi else 'high' for v in df[f]]
tr, te = df[df['train']], df[~df['train']]

def st(x):
    x = np.asarray(x, float); n = len(x)
    return (x.mean(), x.mean() / x.std(ddof=1) * math.sqrt(n) if n > 1 and x.std(ddof=1) > 0 else 0.0, n) if n else (0.0, 0.0, 0)

print('# Theory-lab features at the levels — EURUSD\n')
print(f'Rule: forge/THEORY_FEATURES_LEVELS_PREREG.md. {len(df):,} passes of every line; train 2016–2022, test 2023–2026-08. '
      'Net R after spread.\n')
print('## 1. Continue rate by each new feature (train → test)\n')
print('| feature | low third | mid third | high third |'); print('|---|---|---|---|')
for f in NEW:
    cells = [f"{df[(df['b_' + f] == b) & df['train']]['cont'].mean():.0%} → {df[(df['b_' + f] == b) & ~df['train']]['cont'].mean():.0%}" for b in ('low', 'mid', 'high')]
    print(f'| {LABEL[f]} | ' + ' | '.join(cells) + ' |')

# T1
def select(d, kf='follow', ka='fadeR'):
    out = []
    for f in NEW:
        for (fm, b), x in d.groupby(['fam', 'b_' + f]):
            for dr, key in (('follow', kf), ('fade', ka)):
                m, t, n = st(x[key])
                if n >= 100 and m > 0 and t >= 2.5: out.append((fm, f, b, dr, m, t, n))
    return out
real = select(tr); rng = np.random.default_rng(7); chance = []
for _ in range(20):
    sh = tr.copy(); perm = rng.permutation(len(sh)); sh['sf'] = sh['follow'].to_numpy()[perm]; sh['sa'] = sh['fadeR'].to_numpy()[perm]
    chance.append(len(select(sh, 'sf', 'sa')))
chance.sort(); confirmed = 0
print(f'\n## 2. T1 — each new feature alone\n\nSelected on train: **{len(real)}**; shuffled chance median {chance[10]}, 95th pct {chance[18]}.\n')
if real:
    print('| line | feature = third | trade | train (t, n) | test (t, n) | confirmed? |'); print('|---|---|---|---|---|---|')
    for fm, f, b, dr, m, t, n in sorted(real, key=lambda x: -x[5]):
        tm, tt, tn = st(te[(te['fam'] == fm) & (te['b_' + f] == b)]['follow' if dr == 'follow' else 'fadeR'])
        ok = tn >= 20 and tm > 0 and tt >= 2.0; confirmed += ok
        print(f"| {fm} | {LABEL[f]} = {b} | {dr} | {m:+.3f} ({t:+.1f}, {n}) | {tm:+.3f} ({tt:+.1f}, {tn}) | {'**YES**' if ok else 'no'} |")
t1 = confirmed > chance[18]
print(f"\n**T1: {'PASS' if t1 else 'FAIL'}** ({confirmed} confirmed vs chance 95th pct {chance[18]}).\n")

# T2
CTX = ['fam_c', 'side', 'pb', 'londonMin', 'used', 'dc', 'df']
BASE, FULL = CTX + OLD, CTX + OLD + NEW
cats = lambda cols: [c in ('fam_c', 'side') for c in cols]
def walk(fit):
    out = pd.Series(np.nan, index=df.index)
    for y in YEARS:
        te_i = df.index[df['year'] == y]; tr_i = df.index[df['date'] < f'{y - 1}-12-24']
        if len(te_i): out.loc[te_i] = fit(df.loc[tr_i], df.loc[te_i])
    return out
pb = walk(lambda T, E: HGBC(**GBM, categorical_features=cats(BASE)).fit(T[BASE], T['cont']).predict_proba(E[BASE])[:, 1])
pn = walk(lambda T, E: HGBC(**GBM, categorical_features=cats(FULL)).fit(T[FULL], T['cont']).predict_proba(E[FULL])[:, 1])
W = df[df['year'].isin(YEARS)].copy()
W['lb'] = (pb[W.index] - W['cont']) ** 2; W['ln'] = (pn[W.index] - W['cont']) ** 2
g = W.groupby('date')[['ln', 'lb']].sum(); a, b = g['ln'].to_numpy(), g['lb'].to_numpy()
pt = 1 - a.sum() / b.sum(); ix = np.random.default_rng(7).integers(0, len(a), (1000, len(a))); v = np.sort(1 - a[ix].sum(1) / b[ix].sum(1))
t2a = v[25] > 0
print('## 3. T2 — on top of the existing approach features (walk-forward 2023–2026)\n')
print(f'**T2a (information):** Brier skill of approach + theory features vs approach features alone: **{pt:+.4f}** '
      f'(95% {v[25]:+.4f} to {v[974]:+.4f}) — {"informative" if t2a else "adds nothing measurable"}.\n')
pf = walk(lambda T, E: HGBR(**GBM, categorical_features=cats(FULL)).fit(T[FULL], T['follow']).predict(E[FULL]))
pa = walk(lambda T, E: HGBR(**GBM, categorical_features=cats(FULL)).fit(T[FULL], T['fadeR']).predict(E[FULL]))
W['pf'], W['pa'] = pf[W.index], pa[W.index]
W['taken'] = np.where((W['pf'] > 0) & (W['pf'] >= W['pa']), W['follow'], np.where((W['pa'] > 0) & (W['pa'] > W['pf']), W['fadeR'], np.nan))
print('| year | taken | win % | net R | t |'); print('|---|---|---|---|---|')
for y in YEARS + ['all']:
    s = W if y == 'all' else W[W['year'] == y]; x = s['taken'].dropna(); m, t, n = st(x)
    print(f'| {y} | {n} | {(x > 0).mean():.0%} | {m:+.3f} | {t:+.1f} |')
m, t, n = st(W['taken'].dropna()); t2b = m > 0 and t >= 2.0
print(f"\n**T2b (trading): {'PASS' if t2b else 'FAIL'}** (net R {m:+.3f}, t {t:+.1f}, n {n}). "
      'This is the 12th pre-registered level test on these lines; any pass would need a deflated-Sharpe adjustment before use.')
