"""vix-nasdaq-beta: the registered run (forge/VIX_NASDAQ_BETA_PREREG.md). First read of outcomes."""
import os, sys, json
import numpy as np, pandas as pd
from statsmodels.stats.multitest import multipletests
from scipy.stats import norm
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'vvix-nasdaq-ratio'))
import model as M

OUT = os.path.join(ROOT, 'analysis', 'output', 'vix-nasdaq-beta')
P = pd.read_parquet(os.path.join(OUT, 'panel.parquet'))
rng = np.random.default_rng(20261023); NPLAC = int(os.environ.get('NPLAC', 200))
lnN, lnV = np.log(P['NDX']), np.log(P['VIX']); r = lnN.diff()
Y = {'ret5': lnN.shift(-6) - lnN.shift(-1), 'ret20': lnN.shift(-21) - lnN.shift(-1),
     'range20': np.log(r[::-1].rolling(20).std()[::-1].shift(-2) * np.sqrt(252) * 100 / P['VXN']), 'dvix20': lnV.shift(-21) - lnV.shift(-1)}
H = {'ret5': 5, 'ret20': 20, 'range20': 20, 'dvix20': 20}
SD = {k: float(v.std()) for k, v in Y.items()}
Y = {k: (v / v.std()).to_numpy() for k, v in Y.items()}
BASE = list(M.CONTROLS); EXTRA = {'B_level': ['R_b_hi', 'R_b_lo'], 'B_change': []}
split = P['split'].to_numpy()


def cell(Q, k, tail, o, mask=None, extra=None):
    M.CONTROLS = BASE + (EXTRA[k] if extra is None else extra)
    out = M.fit(Q, Y[o], k, tail, H[o], mask=mask); M.CONTROLS = BASE; return out


rows = []
for k in ('B_level', 'B_change'):
    for tail in ('hi', 'lo'):
        for o in Y:
            b, t, n = cell(P, k, tail, o)
            per = {s: cell(P, k, tail, o, mask=(split == s)) for s in ('discover', 'validate', 'test')}
            nob = cell(P, k, tail, o, extra=[]) if k == 'B_level' else (np.nan, np.nan, 0)
            rows.append(dict(construction=k, tail=tail, outcome=o, beta_sd=b, t=t, n=n, p=float(2 * norm.sf(abs(t))), ci_lo=b - 1.96 * abs(b / t), ci_hi=b + 1.96 * abs(b / t),
                             **{f'{s}_beta': per[s][0] for s in per}, without_Rb_beta=nob[0], without_Rb_t=nob[1]))
C = pd.DataFrame(rows)
C['holm'] = multipletests(C['p'], 0.05, 'holm')[0]
C['same_sign_3'] = [all(np.sign(c[f'{s}_beta']) == np.sign(c['beta_sd']) for s in ('discover', 'validate', 'test')) for _, c in C.iterrows()]
PL = {i: [] for i in range(len(C))}
for d in range(NPLAC):
    sh = int(rng.integers(252, len(P) - 252)); Q = P.copy()
    for k in ('B_level', 'B_change'):
        pc = pd.Series(np.roll(P[k].to_numpy(), sh), index=P.index).rolling(252, min_periods=200).rank(pct=True)
        Q[f'{k}_hi'] = (pc >= 0.9).astype(float).where(pc.notna()); Q[f'{k}_lo'] = (pc <= 0.1).astype(float).where(pc.notna())
    for i, c in C.iterrows(): PL[i].append(abs(cell(Q, c['construction'], c['tail'], c['outcome'])[1]))
C['placebo_t95'] = [float(np.nanpercentile(PL[i], 95)) for i in range(len(C))]
C['gate'] = C['holm'] & C['same_sign_3'] & (C['t'].abs() > C['placebo_t95'])
C['verdict_cell'] = np.where(C['gate'], 'validated', np.where((C['ci_lo'] > -0.2) & (C['ci_hi'] < 0.2), 'null', 'underpowered'))
json.dump(dict(id='vix-nasdaq-beta', seed=20261023, nplacebo=NPLAC, outcome_sd=SD, cells=json.loads(C.to_json(orient='records'))), open(os.path.join(OUT, 'results.json'), 'w'), indent=1)
pd.set_option('display.width', 250)
print(C[['construction', 'tail', 'outcome', 'beta_sd', 't', 'ci_lo', 'ci_hi', 'discover_beta', 'validate_beta', 'test_beta', 'without_Rb_beta', 'without_Rb_t', 'placebo_t95', 'holm', 'same_sign_3', 'gate', 'verdict_cell']].round(3).to_string())
