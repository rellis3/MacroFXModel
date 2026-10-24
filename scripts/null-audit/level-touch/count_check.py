"""Cross-check: touches the banked JS pipeline found on planted data vs the independent
implementation (scale 1) on the same planted data, per pair and family.
  python count_check.py <tag> <js_response_dir>"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from indep_core import FAMS
from pool import load
_, P = load(sys.argv[1])
for p, r in P.items():
    j = json.load(open(os.path.join(sys.argv[2], f'{p}-response.json')))
    js = {f: 0 for f in FAMS}; je = {f: [] for f in FAMS}
    for d in j['days']:
        for t in d['touches']:
            js[t['family']] += 1; je[t['family']].append((t['maxExt'] - abs(t['maxAdv'])) / d['dayScale'])
    out = []
    for fi, f in enumerate(FAMS):
        q = (r['fam'] == fi) & (r['scale'] == 1.0)
        out.append(f'{f}:{int(q.sum())}/{js[f]} edge {r["edge"][q].mean():+.4f}/{np.mean(je[f]):+.4f}')
    print(p, ' | '.join(out))
