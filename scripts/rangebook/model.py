"""EURUSD model step — forge/EURUSD_MODEL_PREREG.md.
    python scripts/rangebook/model.py > analysis/output/rangebook/eurusd_MODEL_RESULTS.md
Inputs: analysis/output/rangebook/eurusd.json, eurusd_touches.json (built by the book
builders) and js/data/cmeCvolEod.json. Fixed model settings; yearly walk-forward.
"""
import bisect, json, math
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier as HGBC, HistGradientBoostingRegressor as HGBR
from sklearn.linear_model import LogisticRegression, QuantileRegressor

HL = {'p50': 1.4417, 'p75': 1.8877, 'p90': 2.3967}      # EURUSD fitted hl widths (forecastLadderParams.js)
GBM = dict(max_depth=3, learning_rate=0.05, max_iter=300, l2_regularization=1.0, min_samples_leaf=100, random_state=0)
YEARS = [2023, 2024, 2025, 2026]
EMBARGO = 5
rng_boot = np.random.default_rng(7)

# ── Day table ─────────────────────────────────────────────────────────────────
recs = json.load(open('analysis/output/rangebook/eurusd.json'))['records']
touch = json.load(open('analysis/output/rangebook/eurusd_touches.json'))['rows']
reached = {}
for r in touch: reached.setdefault(r['date'], set()).add(r['line'])

D = pd.DataFrame([{'date': r['date'], 'sig': r['sigmaPct'], 'hl50': r['hl50'], 'dayRange': r['dayRange'],
                   'cfo': r['closeFromOpen'], **r['pre']} for r in recs])
D['real'] = D['dayRange'] * D['hl50']                       # realized day range, % of open
prev = D['real'].shift(1)
D['ewma_rel'] = prev.ewm(alpha=0.06, adjust=False).mean() / D['hl50']
D['yrange_rel'] = prev / D['hl50']
D['m5_rel'] = prev.rolling(5).mean() / D['hl50']
D['m20_rel'] = prev.rolling(20).mean() / D['hl50']
D['sig_rel'] = D['sig'] / D['sig'].shift(1).rolling(20).median()
D['y_cfo'] = D['cfo'].shift(1)
dt = pd.to_datetime(D['date'])
D['weekday'] = dt.dt.weekday; D['month'] = dt.dt.month
D['hmm_c'] = D['hmm'].map({'RANGE': 0, 'TREND_up': 1, 'TREND_dn': 2})
D['event_c'] = D['event'].map({'none': 0, 'high': 1, 'tier1': 2})

# Implied vol: latest CME settle dated strictly before the London day.
cv = json.load(open('js/data/cmeCvolEod.json'))['series']['EURUSD']
cdates = [x['date'] for x in cv]
def iv_for(date, lag=0):
    i = bisect.bisect_left(cdates, date) - 1 - lag
    return cv[i] if i >= 0 else None
for col in ('cvol', 'atm', 'skew', 'convexity'):
    D[col] = [(iv_for(d) or {}).get(col) for d in D['date']]
D['cvol_d1'] = D['cvol'] - [(iv_for(d, 1) or {}).get('cvol') for d in D['date']]
D['cvol_d5'] = D['cvol'] - [(iv_for(d, 5) or {}).get('cvol') for d in D['date']]
D['iv_rv'] = D['cvol'] / (D['sig'] * math.sqrt(252))

P = ['sig', 'sig_rel', 'ewma_rel', 'yrange_rel', 'm5_rel', 'm20_rel', 'y_cfo', 'hmm_c', 'event_c', 'weekday', 'month']
IV = ['cvol', 'atm', 'skew', 'convexity', 'cvol_d1', 'cvol_d5', 'iv_rv']
D = D.dropna(subset=P + IV).reset_index(drop=True)
D['year'] = pd.to_datetime(D['date']).dt.year
D['y_p50'] = (D['dayRange'] >= 1).astype(int)
D['y_p75'] = (D['dayRange'] >= HL['p75'] / HL['p50']).astype(int)
D['y_p90'] = (D['dayRange'] >= HL['p90'] / HL['p50']).astype(int)
D['y_up'] = (D['cfo'] > 0).astype(int)
D['y_oh'] = [int('OH_p50' in reached.get(d, ())) for d in D['date']]
D['y_ol'] = [int('OL_p50' in reached.get(d, ())) for d in D['date']]
D['logr'] = np.log(D['dayRange'])

def folds(df):
    """(train_idx, test_idx) per walk-forward year, with an embargo before each test year."""
    for y in YEARS:
        te = df.index[df['year'] == y]
        if not len(te): continue
        tr = df.index[df['date'] < f'{y}-01-01']
        yield tr[:-EMBARGO] if len(tr) > EMBARGO else tr, te

def walk(df, fit_predict):
    out = pd.Series(np.nan, index=df.index)
    for tr, te in folds(df):
        out.loc[te] = fit_predict(df.loc[tr], df.loc[te])
    return out

def boot_skill(loss_a, loss_b, groups):
    """1 - sum(a)/sum(b) with a day-bootstrap 95% interval (rows grouped by date)."""
    g = pd.DataFrame({'a': loss_a, 'b': loss_b, 'g': groups}).groupby('g').sum()
    a, b = g['a'].to_numpy(), g['b'].to_numpy()
    point = 1 - a.sum() / b.sum()
    idx = rng_boot.integers(0, len(a), (1000, len(a)))
    vals = np.sort(1 - a[idx].sum(1) / b[idx].sum(1))
    return point, vals[25], vals[974]

fmt = lambda s: f'{s[0]:+.3f} ({s[1]:+.3f} to {s[2]:+.3f})' + (' ✔' if s[1] > 0 else '')

# ── Classifiers for the reach / direction targets ──
def m0(tr, te, y): return np.full(len(te), tr[y].mean())
def m1(tr, te, y):
    lr = LogisticRegression().fit(np.log(tr[['ewma_rel']]), tr[y]); return lr.predict_proba(np.log(te[['ewma_rel']]))[:, 1]
def gbm(cols):
    cats = [c in ('hmm_c', 'event_c', 'weekday') for c in cols]
    return lambda tr, te, y: HGBC(**GBM, categorical_features=cats).fit(tr[cols], tr[y]).predict_proba(te[cols])[:, 1]

T = D[D['year'].isin(YEARS)]
print('# EURUSD model step — results\n')
print(f'Rule: forge/EURUSD_MODEL_PREREG.md. Walk-forward by year {YEARS[0]}–{YEARS[-1]} (to 2026-08-20), '
      f'{EMBARGO}-day embargo, fixed gradient-boosting settings. {len(T)} test days. Skill = 1 − loss ÷ reference loss, '
      'with a 95% day-bootstrap interval; ✔ = interval entirely above 0.\n')
print('## 1. Day size and direction, at the London open (Brier skill)\n')
print('| target | base rate (test) | M3 vs your lines (M0) | M3 vs EWMA (M1) | IV added: M3 vs M2 | M2 vs M0 |')
print('|---|---|---|---|---|---|')
verdict = {}
for y, lab in (('y_p50', 'day range ≥ hl p50'), ('y_p75', 'day range ≥ hl p75'), ('y_p90', 'day range ≥ hl p90'),
               ('y_up', 'close above open'), ('y_oh', 'OH p50 reached (up side)'), ('y_ol', 'OL p50 reached (down side)')):
    pr = {k: walk(D, lambda tr, te, f=f: f(tr, te, y)) for k, f in
          (('m0', m0), ('m1', m1), ('m2', gbm(P)), ('m3', gbm(P + IV)))}
    yt = D[y]
    loss = {k: ((v - yt) ** 2)[T.index] for k, v in pr.items()}
    s30, s31, s32, s20 = (boot_skill(loss['m3'], loss[b], T['date']) for b in ('m0', 'm1', 'm2')), None, None, None
    s30 = boot_skill(loss['m3'], loss['m0'], T['date']); s31 = boot_skill(loss['m3'], loss['m1'], T['date'])
    s32 = boot_skill(loss['m3'], loss['m2'], T['date']); s20 = boot_skill(loss['m2'], loss['m0'], T['date'])
    verdict[y] = (s30, s31, s32)
    print(f'| {lab} | {yt[T.index].mean():.0%} | {fmt(s30)} | {fmt(s31)} | {fmt(s32)} | {fmt(s20)} |')

# ── Quantiles of log(day range ÷ hl p50) ──
print('\n## 2. Day size as a continuous forecast (pinball-loss skill on log range)\n')
print('| quantile | M3 vs your lines as drawn | M3 vs EWMA (M1) | IV added: M3 vs M2 |'); print('|---|---|---|---|')
pin = lambda y, q, tau: np.maximum(tau * (y - q), (tau - 1) * (y - q))
for tau, rung in ((0.5, 'p50'), (0.75, 'p75'), (0.9, 'p90')):
    const = math.log(HL[rung] / HL['p50'])
    q0 = pd.Series(const, index=D.index)
    q1 = walk(D, lambda tr, te: QuantileRegressor(quantile=tau, alpha=0, solver='highs')
              .fit(np.log(tr[['ewma_rel']]), tr['logr']).predict(np.log(te[['ewma_rel']])))
    mk = lambda cols: walk(D, lambda tr, te: HGBR(loss='quantile', quantile=tau, **GBM).fit(tr[cols], tr['logr']).predict(te[cols]))
    q2, q3 = mk(P), mk(P + IV)
    if tau == 0.75:   # walk-forward q75 per day, consumed by forge/COMBO_EURUSD_PREREG.md
        json.dump({d: (None if np.isnan(v) else float(v)) for d, v in zip(D['date'], q3)},
                  open('analysis/output/rangebook/eurusd_pred_q75.json', 'w'))
    L = {k: pin(D['logr'], q, tau)[T.index] for k, q in (('q0', q0), ('q1', q1), ('q2', q2), ('q3', q3))}
    print(f"| {tau:.2f} ({rung} line) | {fmt(boot_skill(L['q3'], L['q0'], T['date']))} | "
          f"{fmt(boot_skill(L['q3'], L['q1'], T['date']))} | {fmt(boot_skill(L['q3'], L['q2'], T['date']))} |")

# ── 3. Touch trading ──
def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj'), int(rung[1:])
rows = []
for r in touch:
    if r['sameBar']: continue
    o, dc, df, lm, c = r['outcome'], r['dc'], r['df'], r['lastMove'], r['costSig']
    if o == 'cont': f, a = dc / df, -1.0
    elif o == 'fade': f, a = -1.0, df / dc
    elif o == 'both': f, a = -1.0, -1.0
    else: f, a = max(-1.0, min(dc / df, lm / df)), max(-1.0, min(df / dc, -lm / dc))
    fm, rung = fam(r['line'])
    rows.append({'date': r['date'], 'fam_c': {'OHOL': 0, 'Close': 1, 'Proj': 2}[fm], 'rung': rung,
                 'side': int(r['line'].split('_')[0] in ('OH', 'CloseUp', 'ProjH')), 'londonMin': r['londonMin'],
                 'used': r['used'], 'linesBefore': r['linesBefore'], 'mom60': r['mom60'], 'dc': dc, 'df': df,
                 'follow': f - c / df, 'fade': a - c / dc})
X = pd.DataFrame(rows).merge(D[['date', 'year'] + P + IV], on='date', how='inner').reset_index(drop=True)
TC = ['fam_c', 'rung', 'side', 'londonMin', 'used', 'linesBefore', 'mom60', 'dc', 'df']
cols = TC + P + IV
cats = [c in ('fam_c', 'side', 'hmm_c', 'event_c', 'weekday') for c in cols]
pf = walk(X, lambda tr, te: HGBR(**GBM, categorical_features=cats).fit(tr[cols], tr['follow']).predict(te[cols]))
pa = walk(X, lambda tr, te: HGBR(**GBM, categorical_features=cats).fit(tr[cols], tr['fade']).predict(te[cols]))
XT = X[X['year'].isin(YEARS)].copy()
XT['pf'], XT['pa'] = pf[XT.index], pa[XT.index]
take = np.where((XT['pf'] > 0) & (XT['pf'] >= XT['pa']), XT['follow'], np.where((XT['pa'] > 0) & (XT['pa'] > XT['pf']), XT['fade'], np.nan))
XT['taken'] = take
def tstat(x):
    x = x[~np.isnan(x)]; return (x.mean(), x.mean() / x.std(ddof=1) * math.sqrt(len(x)) if len(x) > 1 else 0, len(x))
print('\n## 3. Touch trading from the model (walk-forward)\n')
print('Take a touch in whichever direction the model predicts positive net R (skip if neither).\n')
print('| year | touches | taken | follows / fades | win % | net R per trade | t |'); print('|---|---|---|---|---|---|---|')
for y in YEARS + ['all']:
    s = XT if y == 'all' else XT[XT['year'] == y]
    m, t, n = tstat(s['taken'].to_numpy())
    nf = int(((s['pf'] > 0) & (s['pf'] >= s['pa'])).sum()); na = int(((s['pa'] > 0) & (s['pa'] > s['pf'])).sum())
    w = (s['taken'] > 0).sum() / max(1, n)
    print(f'| {y} | {len(s)} | {n} | {nf} / {na} | {w:.0%} | {m:+.3f} | {t:+.1f} |')
ma, ta, na_ = tstat(XT['taken'].to_numpy())
print(f"\nFor reference, every touch followed: {XT['follow'].mean():+.3f}R; every touch faded: {XT['fade'].mean():+.3f}R.\n")

# ── Verdicts ──
ok = lambda k, i: all(verdict[y][i][1] > 0 for y in ('y_p50', 'y_p75', 'y_p90'))
print('## Verdicts (pre-registered)\n')
print(f"1. Day size beyond your lines (M3 > M0 on p50, p75, p90): **{'PASS' if ok(0, 0) else 'FAIL'}**")
print(f"2. Implied vol adds information (M3 > M2): **{'PASS' if ok(0, 2) else 'FAIL'}**")
print(f"3. Beyond the simple average (M3 > M1): **{'PASS' if ok(0, 1) else 'FAIL'}**")
print(f"4. Direction (close > open, M3 > M0): **{'PASS' if verdict['y_up'][0][1] > 0 else 'FAIL'}**")
print(f"5. Touch trading: **{'PASS' if ma > 0 and ta >= 2.0 else 'FAIL'}** (net R {ma:+.3f}, t {ta:+.1f}, n {na_})")
