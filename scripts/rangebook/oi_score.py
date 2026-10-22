"""OI walls at the vol lines — forge/CONFLUENCE_LEVELS_PREREG.md amendment (6 FX pairs, 2020-09 →).
Same T1 (real − placebo within-cell continue difference, day bootstrap) and T2 (net R, both halves,
BH 10% over its own 2 tests) as levels_score.py.
    python scripts/rangebook/oi_score.py >> analysis/output/rangebook/CONFLUENCE_RESULTS.md
"""
import json, math
import numpy as np
from statistics import NormalDist

PAIRS = ['eurusd', 'gbpusd', 'audusd', 'usdcad', 'usdchf', 'usdjpy']
SPLIT, TOL, B = '2023-01-01', 0.05, 1000
FAMS = ['OHOL_p50', 'OHOL_p75', 'OHOL_p90', 'Close_p50', 'Close_p75', 'Proj_p50', 'Proj_p75']
N = NormalDist()
def fam(line):
    f, rung = line.split('_')
    return ('OHOL' if f in ('OH', 'OL') else 'Close' if f.startswith('Close') else 'Proj') + '_' + rung
def sess(m): return 0 if m < 420 else 1 if m < 780 else 2 if m < 1020 else 3
def usedb(u): return 4 if u is None else 0 if u < 0.5 else 1 if u < 0.8 else 2 if u < 1.0 else 3
def rr(o, dc, df, lm, c):
    f = dc / df if o == 'cont' else -1.0 if o in ('fade', 'both') else max(-1.0, min(dc / df, lm / df))
    a = df / dc if o == 'fade' else -1.0 if o in ('cont', 'both') else max(-1.0, min(df / dc, -lm / dc))
    return f - c / df, a - c / dc

day, cell, cont, h2, fol, fad, near, nearP, pairs = [], [], [], [], [], [], [], [], []
dayid = {}
for p in PAIRS:
    seq = {f"{s['date']}|{s['line']}|{s['pass']}": s for s in json.load(open(f'analysis/output/rangebook/{p}_sequence.json'))['passes'] if not s['sameBar']}
    for r in json.load(open(f'analysis/output/rangebook/{p}_oiwalls.json'))['rows']:
        s = seq[f'{r[0]}|{r[1]}|{r[2]}']
        day.append(dayid.setdefault(p + r[0], len(dayid)))
        cell.append((FAMS.index(fam(s['line'])) * 4 + sess(s['londonMin'])) * 5 + usedb(s['used']))
        cont.append(s['outcome'] == 'cont'); h2.append(r[0] >= SPLIT); pairs.append(p)
        a, b = rr(s['outcome'], s['dc'], s['df'], s['lastMove'], s['costSig']); fol.append(a); fad.append(b)
        near.append(np.nan if r[3] is None else r[3]); nearP.append(np.nan if r[5] is None else r[5])
day, cell, h2 = np.array(day), np.array(cell), np.array(h2)
cont = np.array(cont, float); fol, fad = np.array(fol), np.array(fad); near, nearP = np.array(near), np.array(nearP)
n, NC = len(cont), 7 * 4 * 5

def within(flag, w=None, mask=None):
    w = np.ones(n) if w is None else w
    if mask is not None: w = w * mask
    k = cell * 2 + flag.astype(int)
    nn = np.bincount(k, weights=w, minlength=NC * 2).reshape(NC, 2); cc = np.bincount(k, weights=w * cont, minlength=NC * 2).reshape(NC, 2)
    ok = (nn[:, 0] > 0) & (nn[:, 1] > 0)
    d = cc[ok, 1] / nn[ok, 1] - cc[ok, 0] / nn[ok, 0]; ww = nn[ok, 0] * nn[ok, 1] / (nn[ok, 0] + nn[ok, 1])
    return float((d * ww).sum() / ww.sum())

at, atP = near <= TOL, nearP <= TOL
rng = np.random.default_rng(20261001)
bs = []
for _ in range(B):
    P = rng.poisson(1.0, len(dayid))[day]; bs.append(within(at, P) - within(atP, P))
lo, hi = np.percentile(bs, [2.5, 97.5]); est = within(at) - within(atP)
e1 = within(at, mask=~h2) - within(atP, mask=~h2); e2 = within(at, mask=h2) - within(atP, mask=h2)
real = bool((lo > 0 or hi < 0) and np.sign(e1) == np.sign(e2) == np.sign(est))

def trade(m):
    o = {'n': int(m.sum()), 'cont': float(cont[m].mean())}
    for k, x in (('fol', fol), ('fad', fad)):
        v = x[m]; o[k] = float(v.mean()); o[k + 't'] = float(v.mean() / v.std(ddof=1) * math.sqrt(len(v)))
        o[k + '_h1'] = float(x[m & ~h2].mean()); o[k + '_h2'] = float(x[m & h2].mean())
    return o
T, TP = trade(at), trade(atP)
ps = sorted((1 - N.cdf(T[k + 't']), k) for k in ('fol', 'fad'))
bh = {k for i, (pv, k) in enumerate(ps, 1) if all(q <= 0.10 * j / 2 for j, (q, _) in enumerate(ps[:i], 1))}
T['pass'] = [k for k in ('fol', 'fad') if k in bh and T[k + '_h1'] > 0 and T[k + '_h2'] > 0 and real]
res = {'n': n, 'share': float(at.mean()), 'shareP': float(atP.mean()), 'within_real': within(at), 'within_placebo': within(atP),
       'T1': {'est': est, 'lo': float(lo), 'hi': float(hi), 'h1': e1, 'h2': e2, 'real': real}, 'trade': T, 'trade_placebo': TP,
       'per_pair': {p: within(at, mask=np.array(pairs) == p) for p in PAIRS}}
json.dump(res, open('analysis/output/rangebook/confluence_oiwalls.json', 'w'))
pp = lambda x: f'{x * 100:+.1f}pp'
print(f"\n## OI walls (amendment: 6 FX pairs with a CME option archive, 2020-09 → 2026-08)\n\n{n:,} passes; a wall within {TOL}σ on {at.mean():.1%} "
      f"(placebo {atP.mean():.1%}).\n\n| | effect (real) | effect (placebo) | real − placebo [95% CI] | 2020–22 | 2023–26 | REAL? |\n|---|---|---|---|---|---|---|\n"
      f"| OI walls (top-5 strikes) | {pp(within(at))} | {pp(within(atP))} | {pp(est)} [{pp(lo)}, {pp(hi)}] | {pp(e1)} | {pp(e2)} | {'**yes**' if real else 'no'} |\n")
print(f"T2: {T['n']:,} at-wall passes, continue {T['cont']:.0%}, follow {T['fol']:+.3f}R ({T['fol_h1']:+.3f} / {T['fol_h2']:+.3f}), "
      f"fade {T['fad']:+.3f}R ({T['fad_h1']:+.3f} / {T['fad_h2']:+.3f}); placebo follow {TP['fol']:+.3f} / fade {TP['fad']:+.3f}. PASS: {'+'.join(T['pass']) or 'none'}.")
print('\nPer pair (real effect, within-cell): ' + ', '.join(f'{p.upper()} {pp(v)}' for p, v in res['per_pair'].items()))
