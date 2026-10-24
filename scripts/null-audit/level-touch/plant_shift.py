"""Step 3 read-out: how much of the planted fade reaches (a) real-line touches and (b) phantom-line
touches, comparing planted vs unplanted means (equal weight per pair) for scale 1 and each phantom.

  python plant_shift.py plant_d04 [base_tag=real]
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from indep_core import FAMS
from pool import load

tag = sys.argv[1]; base = sys.argv[2] if len(sys.argv) > 2 else 'real'
_, P = load(tag); _, R = load(base, set(P))
print(f'{tag} minus {base}: mean change per pair-average, by line scale (1.0 = the real line)')
print('family  metric   ' + ''.join(f'{s:>9}' for s in (1.0, 0.8, 0.9, 1.1, 1.2)))
for fi, fam in enumerate(FAMS):
    for m in ('edge', 'r60', 'eod'):
        row = []
        for s in (1.0, 0.8, 0.9, 1.1, 1.2):
            d = []
            for p in P:
                a = P[p]; b = R[p]
                qa = (a['fam'] == fi) & (a['scale'] == s); qb = (b['fam'] == fi) & (b['scale'] == s)
                d.append(a[m][qa].mean() - b[m][qb].mean())
            row.append(np.mean(d))
        print(f'{fam:6s}  {m:6s} ' + ''.join(f'{v:+9.4f}' for v in row))
