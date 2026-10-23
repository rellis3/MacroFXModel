"""vvix-nasdaq-ratio: planted-signal power check BEFORE registration (no real outcome read). Synthetic h-day outcomes are built from
fat-tailed daily shocks summed over h days (the overlap real outcomes have), with a planted shift of beta (in outcome SD units) on
days in the top decile of each construction; the registered regression (flags + controls, Newey-West lag h) must find it.
Writes analysis/output/vvix-nasdaq-ratio/power.json"""
import os, sys, json
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
from model import fit

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'analysis', 'output', 'vvix-nasdaq-ratio')
P = pd.read_parquet(os.path.join(OUT, 'panel.parquet'))
rng = np.random.default_rng(20261023); REPS = 300; res = {}
for k in ('R_a', 'R_c'):
    for h in (5, 20):
        for beta in (0.1, 0.2, 0.3, 0.5):
            hit, hit_holm = 0, 0
            for _ in range(REPS):
                e = rng.standard_t(4, len(P) + h) / np.sqrt(2)
                y = pd.Series(e).rolling(h).sum().shift(-h + 1).to_numpy()[:len(P)]; y = y / np.nanstd(y)
                y = y + beta * np.nan_to_num(P[f'{k}_hi'].to_numpy())
                b, t, n = fit(P, y, k, 'hi', h)
                hit += abs(t) > 1.96; hit_holm += abs(t) > 3.25          # Holm worst case across 24 cells: alpha 0.05/24 two-sided -> |t| 3.25
            res[f'{k}|h{h}|beta{beta}'] = dict(p05=hit / REPS, holm24=hit_holm / REPS)
            print(k, h, beta, res[f'{k}|h{h}|beta{beta}'], flush=True)
json.dump(res, open(os.path.join(OUT, 'power.json'), 'w'), indent=1)
