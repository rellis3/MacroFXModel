"""null-audit yield-ladder-eurusd: WHY is the study's ladder blind to a planted rho = 0.10 at 5 days?
Re-runs the study's own ladder (imports run.py) on EURUSD with the study's planted feature (planted.py recipe),
h = 5 and 20, rho in {0.05, 0.10}, 5 reps, under four variants:
  as_coded      : the registered ladder (CV lambda from 10^-2..10^3, penalty lam*n on standardised inputs)
  lam_fixed_0.1 : same, lambda forced to 0.1 (shrink factor ~0.9)
  aligned_rows  : as coded, but M1 is trained/scored on exactly M3's rows (removes the intercept gap)
  m3_small      : M3 = baseline + the planted feature only (no 14 rate + 3 macro noise features)
Reports CW t (M3 vs M1, OOS 2015-26), detection (t > 1.645), Spearman IC of M3, of M3-M1, and within-year IC of M3.
Writes analysis/output/null-audit/yield-ladder-eurusd/planted_mech.json"""
import os, sys, json
import numpy as np, pandas as pd
from scipy.stats import spearmanr

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'yield-predictive-ladder'))
import run as L

OUT = os.path.join(ROOT, 'analysis', 'output', 'null-audit', 'yield-ladder-eurusd')
P0 = pd.read_parquet(os.path.join(L.OUT, 'panel_eurusd.parquet'))
rng = np.random.default_rng(20261024 + 7)
orig_choose = L.choose_lambda


def wy_ic(f, y, m, idx):
    k = m & np.isfinite(f) & np.isfinite(y); s = pd.Series(f[k], index=idx[k])
    return float(spearmanr((s - s.groupby(s.index.year).transform('mean')).to_numpy(), y[k]).correlation)


out = {}
for h in (5, 20):
    for rho in (0.05, 0.10):
        for variant in ('as_coded', 'lam_fixed_0.1', 'aligned_rows', 'm3_small'):
            res = []
            for rep in range(5):
                P = P0.copy(); y = P[f'y{h}'].to_numpy(); z = (y - np.nanmean(y)) / np.nanstd(y)
                P['r_PLANT_d5'] = rho * np.nan_to_num(z) + np.sqrt(1 - rho ** 2) * rng.standard_normal(len(P))
                L.choose_lambda = (lambda X, yy, hh: 0.1) if variant == 'lam_fixed_0.1' else orig_choose
                rate, rate20, base, macro = L.model_sets(P, 'eurusd')
                m3feats = base + ['r_PLANT_d5'] if variant == 'm3_small' else base + rate + macro
                F3, C3 = L.walk_forward(P, m3feats, h, keep_coef=True)
                if variant == 'aligned_rows':
                    Q = P.copy(); bad = ~np.isfinite(Q[m3feats].to_numpy(float)).all(1); Q.loc[bad, base] = np.nan
                    F1, _ = L.walk_forward(Q, base, h)
                else:
                    F1, _ = L.walk_forward(P, base, h)
                m = L.periods_mask(P.index, 'oos')
                s = L.score(y, F1.to_numpy(), F3.to_numpy(), h, m)
                d = (F3 - F1).to_numpy(); k = m & np.isfinite(d) & np.isfinite(y)
                res.append(dict(cw_t=s['cw_t'], ic_M3=s['ic'], ic_M3_minus_M1=float(spearmanr(d[k], y[k]).correlation), wy_ic_M3=wy_ic(F3.to_numpy(), y, m, P.index),
                                lam=[C3[yr]['lam'] for yr in sorted(C3)]))
            L.choose_lambda = orig_choose
            key = f'h{h}|rho{rho}|{variant}'
            out[key] = dict(detected_of_5=int(sum(r['cw_t'] > 1.645 for r in res)), cw_t=float(np.mean([r['cw_t'] for r in res])),
                            ic_M3=float(np.mean([r['ic_M3'] for r in res])), ic_M3_minus_M1=float(np.mean([r['ic_M3_minus_M1'] for r in res])),
                            within_year_ic_M3=float(np.mean([r['wy_ic_M3'] for r in res])), lam_rep0=res[0]['lam'])
            print(key, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in out[key].items()}, flush=True)
json.dump(out, open(os.path.join(OUT, 'planted_mech.json'), 'w'), indent=1)
