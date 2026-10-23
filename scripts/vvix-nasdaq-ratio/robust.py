"""vvix-nasdaq-ratio: POST-HOC robustness of the two passing cells (R_a hi, R_b hi -> dvix20). Demote-only (Amendment A1)."""
import os, sys, json
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
import model as M

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'analysis', 'output', 'vvix-nasdaq-ratio')
P = pd.read_parquet(os.path.join(OUT, 'panel.parquet'))
lnV = np.log(P['VIX']); y = (lnV.shift(-21) - lnV.shift(-1)); y = (y / y.std()).to_numpy()
P['c_dvix20_past'] = lnV.diff(20); P['c_vvix_pct'] = P['VVIX'].rolling(252, min_periods=200).rank(pct=True)
P['c_dvix5_past'] = lnV.diff(5); P['c_vix_z'] = (lnV - lnV.rolling(252, min_periods=200).mean()) / lnV.rolling(252, min_periods=200).std()
out = {}
base_controls = list(M.CONTROLS)
for k in ('R_a', 'R_b'):
    rows = {}
    for lab, extra in (('as registered', []), ('+ VIX 20d change', ['c_dvix20_past']), ('+ VIX 5d & 20d change + VVIX pct + VIX z', ['c_dvix20_past', 'c_dvix5_past', 'c_vvix_pct', 'c_vix_z'])):
        M.CONTROLS = base_controls + extra; rows[lab] = M.fit(P, y, k, 'hi', 20)
    M.CONTROLS = base_controls + ['c_dvix20_past', 'c_dvix5_past', 'c_vvix_pct', 'c_vix_z']
    loyo = {}
    for yr in range(2010, 2027):
        loyo[yr] = M.fit(P, y, k, 'hi', 20, mask=np.asarray(P.index.year != yr))[:2]
    # linear vs extreme: replace flags with the continuous percentile
    Q = P.copy(); Q[f'{k}_hi'] = P[f'{k}_pct']
    lin = M.fit(Q, y, k, 'hi', 20)
    M.CONTROLS = base_controls
    out[k] = dict(controls={a: dict(beta=b[0], t=b[1], n=b[2]) for a, b in rows.items()}, leave_one_year_out={str(a): dict(beta=b[0], t=b[1]) for a, b in loyo.items()},
                  linear_percentile=dict(beta=lin[0], t=lin[1]))
    print(k, {a: (round(b[0], 3), round(b[1], 2)) for a, b in rows.items()})
    print('  leave-one-year-out t range', round(min(v[1] for v in loyo.values()), 2), '..', round(max(v[1] for v in loyo.values()), 2), '| weakest year dropped:', min(loyo, key=lambda z: abs(loyo[z][1])))
    print('  continuous percentile instead of top-decile flag:', round(lin[0], 3), round(lin[1], 2))
json.dump(out, open(os.path.join(OUT, 'robustness.json'), 'w'), indent=1, default=float)
