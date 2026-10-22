"""Post-hoc audit of the confluence T1 'REAL' results (not pre-registered): redo the real − placebo
within-cell statistic with HOURLY cells (line family × London hour × range used) instead of 4 sessions,
because level availability depends on the clock (session opens exist only after their time; the
previous close jumps to today's NY close at 22:00 London).
    python scripts/rangebook/levels_hour_audit.py
"""
import json
import numpy as np
from crosspair_buckets import ALL

FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def usedb(u): return 4 if u is None else 0 if u < 0.5 else 1 if u < 0.8 else 2 if u < 1.0 else 3
TYPES = ['sessionOpens', 'prevClose', 'fvgH1', 'fvgM15', 'pwhl', 'naked' 'POC']
TYPES = ['sessionOpens', 'prevClose', 'fvgH1', 'fvgM15', 'pwhl', 'nakedPOC']
day, cell, cont, h2, X, dayid = [], [], [], [], {}, {}
for p in ALL:
    seq = {f"{s['date']}|{s['line']}|{s['pass']}": s for s in json.load(open(f'analysis/output/rangebook/{p}_sequence.json'))['passes'] if not s['sameBar']}
    lv = json.load(open(f'analysis/output/rangebook/{p}_levels.json')); ci = {c: i for i, c in enumerate(lv['cols'])}
    for r in lv['rows']:
        s = seq[f'{r[0]}|{r[1]}|{r[2]}']
        day.append(dayid.setdefault(p + r[0], len(dayid)))
        cell.append((FAMS.index(fam(s['line'])) * 25 + min(24, s['londonMin'] // 60)) * 5 + usedb(s['used']))
        cont.append(s['outcome'] == 'cont'); h2.append(r[0] >= '2023-01-01')
        for ty in TYPES:
            for c in (ty, ty + '_p'): X.setdefault(c, []).append(np.nan if r[ci[c]] is None else r[ci[c]])
day, cell, cont, h2 = np.array(day), np.array(cell), np.array(cont, float), np.array(h2)
X = {k: np.array(v, float) for k, v in X.items()}; n, NC = len(cont), 7 * 25 * 5
def within(flag, w=None, mask=None):
    w = np.ones(n) if w is None else w
    if mask is not None: w = w * mask
    k = cell * 2 + flag.astype(int)
    nn = np.bincount(k, weights=w, minlength=NC * 2).reshape(NC, 2); cc = np.bincount(k, weights=w * cont, minlength=NC * 2).reshape(NC, 2)
    ok = (nn[:, 0] > 0) & (nn[:, 1] > 0)
    d = cc[ok, 1] / nn[ok, 1] - cc[ok, 0] / nn[ok, 0]; ww = nn[ok, 0] * nn[ok, 1] / (nn[ok, 0] + nn[ok, 1])
    return float((d * ww).sum() / ww.sum())
rng = np.random.default_rng(7); POIS = [rng.poisson(1.0, len(dayid))[day] for _ in range(300)]
def show(name, a, b):
    est = within(a) - within(b); bs = [within(a, P) - within(b, P) for P in POIS]; lo, hi = np.percentile(bs, [2.5, 97.5])
    e1 = within(a, mask=~h2) - within(b, mask=~h2); e2 = within(a, mask=h2) - within(b, mask=h2)
    ok = (lo > 0 or hi < 0) and np.sign(e1) == np.sign(e2) == np.sign(est)
    print(f'| {name} | {est*100:+.1f}pp [{lo*100:+.1f}, {hi*100:+.1f}] | {e1*100:+.1f} | {e2*100:+.1f} | {"survives" if ok else "gone"} |', flush=True)
print('| level | real − placebo, hourly cells [95% CI] | 2016–22 | 2023–26 | |\n|---|---|---|---|---|')
for ty in TYPES: show(ty, X[ty] <= 0.05, X[ty + '_p'] <= 0.05)
ALLT = ['sessionOpens', 'prevDayOpen', 'weekOpen', 'pdhl', 'pwhl', 'prevClose', 'roundNum', 'fibGP', 'fibExt', 'poc', 'valueArea', 'nakedPOC', 'fvgM15', 'fvgH1']
