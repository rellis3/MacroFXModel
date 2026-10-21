"""yield-predictive-ladder: positive control (mechanics check, not a scored test). Plant one synthetic rate feature
with a known forward correlation to the target and confirm the ladder recovers it (M3 vs M1 Clark-West, IC).
Writes analysis/output/yield-predictive-ladder/planted.json"""
import os, sys, json
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
import run as L

out = {}
rng = np.random.default_rng(L.SEED + 99)
for asset in ('eurusd', 'nq'):
    P0 = pd.read_parquet(os.path.join(L.OUT, f'panel_{asset}.parquet'))
    for h in (1, 5):
        for rho in (0.0, 0.03, 0.05, 0.10):
            res = []
            for rep in range(3):
                P = P0.copy(); y = P[f'y{h}'].to_numpy()
                z = (y - np.nanmean(y)) / np.nanstd(y)
                noise = rng.standard_normal(len(P))
                feat = rho * np.nan_to_num(z) + np.sqrt(1 - rho ** 2) * noise          # correlation rho with the FUTURE return, known at d (a planted lead)
                P['r_PLANT_d5'] = feat
                F, sets, _ = L.ladder(P, asset, h)
                s = L.score(y, F['M1'].to_numpy(), F['M3'].to_numpy(), h, L.periods_mask(P.index, 'oos'))
                res.append(dict(cw_t=s['cw_t'], ic=s['ic'], r2=s['r2_gain']))
            out[f'{asset}|h{h}|rho{rho}'] = dict(cw_t=float(np.mean([r['cw_t'] for r in res])), ic=float(np.mean([r['ic'] for r in res])), r2=float(np.mean([r['r2'] for r in res])),
                                                detected=int(sum(r['cw_t'] > 1.645 for r in res)))
            print(asset, h, rho, out[f'{asset}|h{h}|rho{rho}'], flush=True)
json.dump(out, open(os.path.join(L.OUT, 'planted.json'), 'w'), indent=1)
