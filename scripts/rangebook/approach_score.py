"""EURUSD Approach Book scorer — forge/APPROACH_BOOK_EURUSD_PREREG.md.
    python scripts/rangebook/approach_score.py > analysis/output/rangebook/eurusd_APPROACH_RESULTS.md
"""
import json, math, random, sys, collections
import numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier as HGBC, HistGradientBoostingRegressor as HGBR

PAIR = (sys.argv[1] if len(sys.argv) > 1 else 'eurusd').lower()
SPLIT = '2023-01-01'
GBM = dict(max_depth=3, learning_rate=0.05, max_iter=300, l2_regularization=1.0, min_samples_leaf=100, random_state=0)
YEARS = [2023, 2024, 2025, 2026]
FEATS = ['mv5', 'mv15', 'mv60', 'accel', 'er15', 'er60', 'barSize', 'wt1m', 'wtSlope', 'wtWith', 'wtSinceCross',
         'wt15m', 'wt1h', 'mf', 'relVol5', 'relVol15', 'relVol60', 'volTrend', 'vwapDist', 'minsSincePrev']
LABEL = {'mv5': 'move last 5 min', 'mv15': 'move last 15 min', 'mv60': 'move last 60 min', 'accel': 'acceleration',
         'er15': 'efficiency 15 min', 'er60': 'efficiency 60 min', 'barSize': 'bar size vs normal', 'wt1m': 'WaveTrend 1m',
         'wtSlope': 'WaveTrend 1m slope', 'wtWith': 'WaveTrend crossed with the move', 'wtSinceCross': 'bars since WT cross',
         'wt15m': 'WaveTrend 15m', 'wt1h': 'WaveTrend 1h', 'mf': 'VuManChu money flow', 'relVol5': 'rel. volume 5 min',
         'relVol15': 'rel. volume 15 min', 'relVol60': 'rel. volume 60 min', 'volTrend': 'volume rising into line',
         'vwapDist': 'line beyond VWAP', 'minsSincePrev': 'mins since previous line'}
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']

df = pd.DataFrame(json.load(open(f'analysis/output/rangebook/{PAIR}_approach.json'))['rows'])
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
df['fam'] = df['line'].map(fam); df['train'] = df['date'] < SPLIT
df['cont'] = (df['outcome'] == 'cont').astype(int)
df['year'] = pd.to_datetime(df['date']).dt.year
df['pb'] = df['pass'].clip(upper=3)
df['hour'] = (df['londonMin'] // 60).astype(int)
tr = df[df['train']]
edges = {f: tr[f].quantile([1 / 3, 2 / 3]).to_list() for f in FEATS if f != 'wtWith'}
def bucket(f, v):
    if v is None or (isinstance(v, float) and math.isnan(v)): return None
    if f == 'wtWith': return 'with' if v == 1 else 'against'
    lo, hi = edges[f]; return 'low' if v < lo else 'mid' if v < hi else 'high'
for f in FEATS: df['b_' + f] = [bucket(f, v) for v in df[f]]
tr = df[df['train']]                                           # re-slice: now carries the bucket columns

def st(x):
    x = np.asarray(x, float); n = len(x)
    return (x.mean(), x.mean() / x.std(ddof=1) * math.sqrt(n) if n > 1 and x.std(ddof=1) > 0 else 0.0, n) if n else (0.0, 0.0, 0)

print(f'# {PAIR.upper()} Approach Book — how price arrives at the line\n')
print(f'Rule: forge/APPROACH_BOOK_EURUSD_PREREG.md. {len(df):,} passes of every line (OH/OL, Close, dynamic Proj H/L). '
      'Features from bars before the pass only. Train 2016-03 → 2022-12, test 2023-01 → 2026-08. R net of spread.\n')

# ── Descriptive: continue % by tercile, key features, all lines pooled ──
print('## 1. Continue rate by approach, all lines pooled (train → test)\n')
print('Low / mid / high = the feature\'s thirds on train. Continue = reaches the next line out before the line behind.\n')
print('| feature | low | mid | high |'); print('|---|---|---|---|')
for f in FEATS:
    cells = []
    for b in (('against', 'with') if f == 'wtWith' else ('low', 'mid', 'high')):
        a = df[(df['b_' + f] == b) & df['train']]['cont'].mean(); c = df[(df['b_' + f] == b) & ~df['train']]['cont'].mean()
        cells.append(f'{a:.0%} → {c:.0%}')
    if f == 'wtWith': cells.append('')
    print(f"| {LABEL[f]}{' (against / with)' if f == 'wtWith' else ''} | " + ' | '.join(cells) + ' |')

# ── Test 1 ──
def select(d, kf='follow', ka='fadeR'):
    out = []
    for f in FEATS:
        g = d.groupby(['fam', 'b_' + f])
        for (fm, b), x in g:
            for dr, key in (('follow', kf), ('fade', ka)):
                m, t, n = st(x[key])
                if n >= 100 and m > 0 and t >= 2.5: out.append((fm, f, b, dr, m, t, n))
    return out
real = select(tr)
rnd = np.random.default_rng(7); chance = []
for _ in range(20):
    sh = tr.copy(); perm = rnd.permutation(len(sh))
    sh['sf'] = sh['follow'].to_numpy()[perm]; sh['sa'] = sh['fadeR'].to_numpy()[perm]
    chance.append(len(select(sh, 'sf', 'sa')))
chance.sort()
te = df[~df['train']]
print(f'\n## 2. Test 1 — each feature alone (pre-registered)\n')
print(f'Cells selected on train: **{len(real)}**. Shuffled outcomes (20 runs): median {chance[10]}, 95th pct {chance[18]}, max {chance[-1]}.\n')
confirmed = 0
if real:
    print('| line | feature = third | trade | train net R (t, n) | test net R (t, n) | confirmed? |'); print('|---|---|---|---|---|---|')
    for fm, f, b, dr, m, t, n in sorted(real, key=lambda x: -x[5]):
        tm, tt, tn = st(te[(te['fam'] == fm) & (te['b_' + f] == b)]['follow' if dr == 'follow' else 'fadeR'])
        ok = tn >= 20 and tm > 0 and tt >= 2.0; confirmed += ok
        print(f"| {fm} | {LABEL[f]} = {b} | {dr} | {m:+.3f} ({t:+.1f}, {n}) | {tm:+.3f} ({tt:+.1f}, {tn}) | {'**YES**' if ok else 'no'} |")
print(f"\n**Test 1 verdict: {'PASS' if confirmed > chance[18] else 'FAIL'}** — {confirmed} confirmed vs chance 95th pct {chance[18]}.\n")

# ── Test 2 ──
df['fam_c'] = df['fam'].map({f: i for i, f in enumerate(FAMS)})
df['side'] = df['line'].str.split('_').str[0].isin(['OH', 'CloseUp', 'ProjH']).astype(int)
CTX = ['fam_c', 'side', 'pb', 'londonMin', 'used', 'dc', 'df']
COLS = CTX + FEATS
CATS = [c in ('fam_c', 'side') for c in COLS]
def folds():
    for y in YEARS:
        te_i = df.index[df['year'] == y]
        tr_i = df.index[df['date'] < f'{y - 1}-12-24']          # ~5 trading-day embargo before 1 January
        if len(te_i): yield tr_i, te_i
p_base = pd.Series(np.nan, index=df.index); p_gbm = p_base.copy(); pf = p_base.copy(); pa = p_base.copy()
for tr_i, te_i in folds():
    T, E = df.loc[tr_i], df.loc[te_i]
    freq = T.groupby(['fam', 'pb', 'hour'])['cont'].agg(['sum', 'count'])
    fam_rate = T.groupby('fam')['cont'].mean()
    p_base.loc[te_i] = [((freq.loc[k, 'sum'] + 1) / (freq.loc[k, 'count'] + 2)) if k in freq.index and freq.loc[k, 'count'] >= 50 else fam_rate[k[0]]
                        for k in zip(E['fam'], E['pb'], E['hour'])]
    p_gbm.loc[te_i] = HGBC(**GBM, categorical_features=CATS).fit(T[COLS], T['cont']).predict_proba(E[COLS])[:, 1]
    pf.loc[te_i] = HGBR(**GBM, categorical_features=CATS).fit(T[COLS], T['follow']).predict(E[COLS])
    pa.loc[te_i] = HGBR(**GBM, categorical_features=CATS).fit(T[COLS], T['fadeR']).predict(E[COLS])
W = df[df['year'].isin(YEARS)].copy()
# walk-forward p_cont / p_base per pass, consumed by forge/COMBO_EURUSD_PREREG.md
json.dump({f'{d}|{ln}|{ps}': [float(p_gbm[i]), float(p_base[i])]
           for i, d, ln, ps in zip(W.index, W['date'], W['line'], W['pass'])},
          open(f'analysis/output/rangebook/{PAIR}_pred_pass.json', 'w'))
W['lb'] = (p_base[W.index] - W['cont']) ** 2; W['lg'] = (p_gbm[W.index] - W['cont']) ** 2
g = W.groupby('date')[['lg', 'lb']].sum(); a, b = g['lg'].to_numpy(), g['lb'].to_numpy()
point = 1 - a.sum() / b.sum(); ix = np.random.default_rng(7).integers(0, len(a), (1000, len(a)))
vals = np.sort(1 - a[ix].sum(1) / b[ix].sum(1)); lo, hi = vals[25], vals[974]
print('## 3. Test 2 — all features together (walk-forward gradient boosting, 2023–2026)\n')
print(f'**2a. Does the approach predict continuation?** Brier skill vs line × pass × London-hour base rates: '
      f'**{point:+.4f}** (95% {lo:+.4f} to {hi:+.4f}) — {"**informative**" if lo > 0 else "not informative"}.\n')
W['pf'], W['pa'] = pf[W.index], pa[W.index]
W['taken'] = np.where((W['pf'] > 0) & (W['pf'] >= W['pa']), W['follow'], np.where((W['pa'] > 0) & (W['pa'] > W['pf']), W['fadeR'], np.nan))
print('**2b. Does it pay?** Take whichever of follow / fade the model predicts positive.\n')
print('| year | passes | taken | win % | net R per trade | t |'); print('|---|---|---|---|---|---|')
for y in YEARS + ['all']:
    s = W if y == 'all' else W[W['year'] == y]
    x = s['taken'].dropna(); m, t, n = st(x)
    print(f'| {y} | {len(s)} | {n} | {(x > 0).mean():.0%} | {m:+.3f} | {t:+.1f} |')
m, t, n = st(W['taken'].dropna())
print(f"\nFor reference: every pass followed {W['follow'].mean():+.3f}R, every pass faded {W['fadeR'].mean():+.3f}R.\n")
print(f"**Test 2b verdict: {'PASS' if m > 0 and t >= 2.0 else 'FAIL'}** (net R {m:+.3f}, t {t:+.1f}, n {n}).")
