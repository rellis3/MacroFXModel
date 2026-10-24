"""How much a per-touch t-stat (the banked study's) overstates precision: naive iid SE of the
pooled real-touch mean edge vs a calendar-date cluster bootstrap SE (dates shared across pairs).
  python cluster_inflation.py real"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from indep_core import FAMS
from pool import load
_, D = load(sys.argv[1])
dates = sorted(set(np.concatenate([v['date'] for v in D.values()]).tolist())); di = {x: i for i, x in enumerate(dates)}
W = np.random.default_rng(20260910).poisson(1.0, size=(1000, len(dates))).astype(float)
print('family  n_touch  naiveSE   clusterSE  ratio')
for fi, f in enumerate(FAMS):
    S = np.zeros(len(dates)); N = np.zeros(len(dates)); allv = []
    for r in D.values():
        q = (r['fam'] == fi) & (r['scale'] == 1.0)
        idx = np.array([di[x] for x in r['date'][q]])
        S += np.bincount(idx, weights=r['edge'][q], minlength=len(dates)); N += np.bincount(idx, minlength=len(dates))
        allv.append(r['edge'][q])
    v = np.concatenate(allv); naive = v.std(ddof=1) / np.sqrt(len(v))
    cl = np.std((W @ S) / (W @ N), ddof=1)
    print(f'{f:6s} {len(v):8d} {naive:9.4f} {cl:10.4f} {cl / naive:6.2f}')
