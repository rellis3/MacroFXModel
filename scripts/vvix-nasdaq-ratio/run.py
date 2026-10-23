"""vvix-nasdaq-ratio: the registered run (forge/VVIX_NASDAQ_RATIO_PREREG.md). First read of outcomes."""
import os, sys, json
import numpy as np, pandas as pd
from statsmodels.stats.multitest import multipletests
from scipy.stats import norm
sys.path.insert(0, os.path.dirname(__file__))
from model import fit

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'analysis', 'output', 'vvix-nasdaq-ratio')
P = pd.read_parquet(os.path.join(OUT, 'panel.parquet'))
rng = np.random.default_rng(20261023); NPLAC = int(os.environ.get('NPLAC', 200))
lnN, lnV = np.log(P['NDX']), np.log(P['VIX']); r = lnN.diff()
Y = {
    'ret5': (lnN.shift(-6) - lnN.shift(-1)), 'ret20': (lnN.shift(-21) - lnN.shift(-1)),
    'range20': np.log(r[::-1].rolling(20).std()[::-1].shift(-2) * np.sqrt(252) * 100 / P['VXN']),      # realised vol over d+2..d+21 vs VXN at d
    'dvix20': (lnV.shift(-21) - lnV.shift(-1)),
}
H = {'ret5': 5, 'ret20': 20, 'range20': 20, 'dvix20': 20}
for k, v in Y.items(): Y[k] = (v / v.std()).to_numpy()
splits = P['split'].to_numpy()
cells = []
for k in ('R_a', 'R_b', 'R_c'):
    for tail in ('hi', 'lo'):
        for o in Y:
            b, t, n = fit(P, Y[o], k, tail, H[o])
            per = {s: fit(P, Y[o], k, tail, H[o], mask=(splits == s)) for s in ('discover', 'validate', 'test')}
            cells.append(dict(construction=k, tail=tail, outcome=o, beta_sd=b, t=t, n=n, p=float(2 * norm.sf(abs(t))), lo=b - 1.96 * b / t if t else np.nan, hi=b + 1.96 * b / t if t else np.nan,
                              **{f'{s}_beta': per[s][0] for s in per}, **{f'{s}_t': per[s][1] for s in per}))
C = pd.DataFrame(cells)
C['ci_lo'] = np.minimum(C['lo'], C['hi']); C['ci_hi'] = np.maximum(C['lo'], C['hi'])
C['holm'] = multipletests(C['p'], 0.05, 'holm')[0]
C['same_sign_3'] = [all(np.sign(c[f'{s}_beta']) == np.sign(c['beta_sd']) for s in ('discover', 'validate', 'test')) for _, c in C.iterrows()]
# selection-aware placebo: roll each ratio series >= 252 sessions, recompute its percentile + flags, refit
PL = {i: [] for i in range(len(C))}
from features import PCT_WIN, EXT
for d in range(NPLAC):
    sh = int(rng.integers(252, len(P) - 252)); Q = P.copy()
    for k in ('R_a', 'R_b', 'R_c'):
        x = np.roll(P[k].to_numpy(), sh); pc = pd.Series(x, index=P.index).rolling(PCT_WIN, min_periods=200).rank(pct=True)
        Q[f'{k}_hi'] = (pc >= 1 - EXT).astype(float).where(pc.notna()); Q[f'{k}_lo'] = (pc <= EXT).astype(float).where(pc.notna())
    for i, c in C.iterrows():
        PL[i].append(abs(fit(Q, Y[c['outcome']], c['construction'], c['tail'], H[c['outcome']])[1]))
C['placebo_t95'] = [float(np.nanpercentile(PL[i], 95)) for i in range(len(C))]
C['beats_placebo'] = C['t'].abs() > C['placebo_t95']
C['gate'] = C['holm'] & C['same_sign_3'] & C['beats_placebo']
C['verdict_cell'] = np.where(C['gate'], 'validated', np.where((C['ci_lo'] > -0.2) & (C['ci_hi'] < 0.2), 'null', 'underpowered'))
# descriptive: event study around entries into each tail (first tail day after >= 20 sessions outside)
ev = {}
for k in ('R_a', 'R_b', 'R_c'):
    for tail in ('hi', 'lo'):
        f = P[f'{k}_{tail}'].fillna(0).to_numpy(); idx = []
        last = -999
        for i in range(len(f)):
            if f[i] == 1 and (i == 0 or f[i - 1] == 0) and i - last >= 20: idx.append(i)
            if f[i] == 1: last = i
        paths = {}
        for nm, s in (('NDX', lnN), ('VIX', lnV), ('VVIX', np.log(P['VVIX']))):
            arr = np.array([[s.iloc[i + j] - s.iloc[i] if 0 <= i + j < len(s) else np.nan for j in range(-20, 21)] for i in idx]) * 100
            paths[nm] = dict(mean=list(np.nanmean(arr, 0)), se=list(np.nanstd(arr, 0) / np.sqrt(np.isfinite(arr).sum(0))))
        ev[f'{k}|{tail}'] = dict(n_events=len(idx), dates=[str(P.index[i].date()) for i in idx], paths=paths)
ts = {k: dict(t=[str(d.date()) for d in P.index[::5]], v=[None if not np.isfinite(x) else round(float(x), 3) for x in P[k].to_numpy()[::5]]) for k in ('R_a', 'R_b', 'R_c')}
res = dict(id='vvix-nasdaq-ratio', seed=20261023, nplacebo=NPLAC, cells=C.to_dict('records'), events=ev, timeseries=ts,
           outcome_sd={k: float(np.nanstd(v)) for k, v in {'ret5': (lnN.shift(-6) - lnN.shift(-1)), 'ret20': (lnN.shift(-21) - lnN.shift(-1)), 'dvix20': (lnV.shift(-21) - lnV.shift(-1))}.items()})
def clean(o):
    if isinstance(o, dict): return {str(a): clean(b) for a, b in o.items()}
    if isinstance(o, (list, tuple)): return [clean(v) for v in o]
    if isinstance(o, (float, np.floating)): return None if not np.isfinite(o) else float(o)
    if isinstance(o, (np.integer,)): return int(o)
    if isinstance(o, np.bool_): return bool(o)
    return o
json.dump(clean(res), open(os.path.join(OUT, 'results.json'), 'w'))
pd.set_option('display.width', 250)
print(C[['construction', 'tail', 'outcome', 'n', 'beta_sd', 't', 'ci_lo', 'ci_hi', 'discover_beta', 'validate_beta', 'test_beta', 'placebo_t95', 'holm', 'same_sign_3', 'gate', 'verdict_cell']].round(3).to_string())
print({k: v['n_events'] for k, v in ev.items()})
