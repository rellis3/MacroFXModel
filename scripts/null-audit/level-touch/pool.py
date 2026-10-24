"""Pool the phantom-level placebo: REAL-line touches minus PHANTOM-line touches, per family and
metric, equal weight per instrument, with a calendar-date cluster bootstrap (Poisson weights
shared across instruments on the same date, so cross-instrument correlation is respected).

  python pool.py <tag> [--pairs a,b,c]
Writes analysis/output/null-audit/level-touch/phantom/<tag>/pooled.json and prints a table.
"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from indep_core import FAMS

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SEED, B = 20260910, 1000
METRICS = ['edge', 'r5', 'r15', 'r60', 'eod', 'lim0', 'line15']


def load(tag, pairs=None):
    d = os.path.join(ROOT, 'analysis', 'output', 'null-audit', 'level-touch', 'phantom', tag)
    out = {}
    for f in sorted(os.listdir(d)):
        if not f.endswith('.npz'): continue
        p = f[:-4]
        if pairs and p not in pairs: continue
        z = np.load(os.path.join(d, f), allow_pickle=False)
        r = {k: z[k] for k in z.files if k != 'meta'}
        r['line15'] = r['r15'] + r['lim0']          # 15-min return measured FROM THE LINE (limit fill)
        out[p] = r
    return d, out


def main(tag, pairs=None):
    d, data = load(tag, pairs)
    dates = sorted(set(np.concatenate([v['date'] for v in data.values()]).tolist()))
    di = {x: i for i, x in enumerate(dates)}
    rng = np.random.default_rng(SEED)
    W = rng.poisson(1.0, size=(B, len(dates))).astype(np.float64)
    res = {}
    for fi, fam in enumerate(FAMS):
        res[fam] = {}
        for m in METRICS:
            per_pair, boots, signs, nreal, nph = [], [], 0, 0, 0
            cmp = {}
            for p, r in data.items():
                sel = r['fam'] == fi
                if sel.sum() == 0: continue
                idx = np.array([di[x] for x in r['date'][sel]])
                val = r[m][sel]; sc = r['scale'][sel]
                real = sc == 1.0; ph = ~real
                if real.sum() < 30 or ph.sum() < 30: continue
                sr = np.bincount(idx[real], weights=val[real], minlength=len(dates))
                nr = np.bincount(idx[real], minlength=len(dates)).astype(float)
                sp = np.bincount(idx[ph], weights=val[ph], minlength=len(dates))
                npn = np.bincount(idx[ph], minlength=len(dates)).astype(float)
                diff = sr.sum() / nr.sum() - sp.sum() / npn.sum()
                per_pair.append(diff); signs += diff > 0; nreal += int(real.sum()); nph += int(ph.sum())
                boots.append((W @ sr) / (W @ nr) - (W @ sp) / (W @ npn))
                for s in (0.8, 0.9, 1.1, 1.2):
                    q = sc == s
                    cmp.setdefault(s, []).append(val[q].mean() - val[real].mean() if q.sum() else np.nan)
            if not per_pair: continue
            est = float(np.mean(per_pair)); bt = np.mean(np.vstack(boots), axis=0)
            se = float(np.std(bt, ddof=1))
            res[fam][m] = dict(k=len(per_pair), n_real=nreal, n_phantom=nph,
                               real_minus_phantom=est, se_date_cluster=se, z=est / se if se > 0 else None,
                               ci95=[float(np.percentile(bt, 2.5)), float(np.percentile(bt, 97.5))],
                               pairs_pos=int(signs), mde80=2.8 * se,
                               phantom_minus_real_by_scale={str(s): float(np.nanmean(v)) for s, v in cmp.items()})
    json.dump(res, open(os.path.join(d, 'pooled.json'), 'w'), indent=1)
    print(f'tag={tag}  pairs={len(data)}  (real - phantom, expected-day-ranges; SE = date-cluster bootstrap)')
    print('family  metric     k   n_real   real-ph      se       z    pairs+   mde80')
    for fam in FAMS:
        for m in METRICS:
            v = res[fam].get(m)
            if not v: continue
            print(f'{fam:6s}  {m:7s} {v["k"]:3d} {v["n_real"]:8d} {v["real_minus_phantom"]:+9.4f} {v["se_date_cluster"]:8.4f} '
                  f'{v["z"]:+7.2f}  {v["pairs_pos"]:3d}/{v["k"]:<3d} {v["mde80"]:7.4f}')


if __name__ == '__main__':
    pairs = None
    if '--pairs' in sys.argv: pairs = set(sys.argv[sys.argv.index('--pairs') + 1].split(','))
    main(sys.argv[1], pairs)
