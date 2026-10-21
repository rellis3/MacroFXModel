"""rate-surprise-events: power check BEFORE registration (no real outcome is read). Synthetic outcomes are planted on the real
event features: y = rho * z(signal) + sqrt(1-rho^2) * t4 noise; the registered primary statistic (fixed-direction signal, outcome
residualised walk-forward on the asset's own reaction, analytic p) and the full gate are scored on the real splits.
Writes analysis/output/rate-surprise-events/power.json"""
import os, sys, json
import numpy as np, pandas as pd
from scipy.stats import norm
sys.path.insert(0, os.path.dirname(__file__))
from fixedrule import residualise

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'analysis', 'output', 'rate-surprise-events')
X = pd.read_parquet(os.path.join(OUT, 'events.parquet')).sort_values('t').reset_index(drop=True)
rng = np.random.default_rng(20261022); R = 400; fam = X['family'].to_numpy(); sp = X['split'].to_numpy()
HOLM16 = 0.05 / 16                    # worst-case Holm bar for the smallest p among 16 scored cells
res = {}
for asset in ('eurusd', 'nq'):
    react = X[f'{asset}_react'].to_numpy(float)
    for sig in ('rs2', 'ds'):
        s = -(np.nan_to_num(X[sig].to_numpy(float)) if sig == 'ds' else X[sig].to_numpy(float))
        z = (s - np.nanmean(s)) / np.nanstd(s)
        for rho in (0.05, 0.10, 0.15, 0.20, 0.25, 0.30):
            hp = hg = 0
            for _ in range(R):
                y = rho * np.nan_to_num(z) + np.sqrt(1 - rho ** 2) * rng.standard_t(4, len(X)) / np.sqrt(2); y[~np.isfinite(z)] = np.nan
                r = residualise(y, react, fam); k = np.isfinite(r) & np.isfinite(s)
                c = np.corrcoef(r[k], np.clip(s[k], -4, 4))[0, 1]; p = 2 * norm.sf(abs(c) * np.sqrt(k.sum()))
                sg = [np.corrcoef(r[k & (sp == q)], s[k & (sp == q)])[0, 1] for q in ('discover', 'validate', 'test')]
                hp += p < 0.05; hg += (p < HOLM16) and all(np.sign(v) == np.sign(c) for v in sg)
            res[f'{asset}|{sig}|{rho}'] = dict(pooled_p05=hp / R, full_gate=hg / R, n=int(k.sum()))
            print(asset, sig, rho, res[f'{asset}|{sig}|{rho}'], flush=True)
json.dump(res, open(os.path.join(OUT, 'power.json'), 'w'), indent=1)
