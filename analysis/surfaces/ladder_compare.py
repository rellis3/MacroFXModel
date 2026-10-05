"""LADDER CALIBRATION head-to-head (forge/LADDER_CALIBRATION_PREREG.md): live ladder vs a side-by-side candidate.

Joins analysis/surfaces/ladder_calibration/ (live) and a candidate folder on (instrument, date), keeps the
common out-of-sample window, buckets every day by the LIVE sigma's ratio to its trailing 250-day median, and
applies the pre-registered rules. Date-clustered SEs throughout.
    python analysis/surfaces/ladder_compare.py [candidate_dir] [window_start]
"""
import glob
import sys
import numpy as np
import pandas as pd

CAND = sys.argv[1] if len(sys.argv) > 1 else 'analysis/surfaces/ladder_calibration_v2'
START = sys.argv[2] if len(sys.argv) > 2 else '2025-09-05'
TARGET = {'p50': 0.50, 'p75': 0.25, 'p90': 0.10}
Q = ['oh', 'ol', 'hl', 'oc']
INDICES = {'NQ', 'SPX500', 'DOW', 'US2000', 'DE30', 'UK100'}


def load(d):
    df = pd.concat([pd.read_csv(f) for f in glob.glob(f'{d}/*.csv')], ignore_index=True)
    return df[df.nbars >= 600]


live, cand = load('analysis/surfaces/ladder_calibration'), load(CAND)
# regime from the LIVE sigma, computed on full history so the trailing median exists at the window start
live = live.sort_values(['inst', 'date'])
live['rel'] = live.sigDaily / live.groupby('inst').sigDaily.transform(
    lambda s: s.rolling(250, min_periods=60).median().shift(1))
keys = live[['inst', 'date', 'rel']]
both = {}
for name, df in [('live', live.drop(columns='rel')), ('cand', cand)]:
    m = df.merge(keys, on=['inst', 'date'])
    both[name] = m
common = both['live'][['inst', 'date']].merge(both['cand'][['inst', 'date']])
common = common[common.date >= START]
for name in both:
    m = both[name].merge(common, on=['inst', 'date'])
    m = m.dropna(subset=['rel'])
    for q in Q:
        for r in TARGET:
            m[f'x_{q}_{r}'] = (m[f'r_{q}'] > m[f'{q}_{r}']).astype(float)
    both[name] = m
edges = np.quantile(both['live'].rel, [0.2, 0.4, 0.6, 0.8])
for name in both:
    both[name]['quint'] = np.searchsorted(edges, both[name].rel.values)


def rate(sub, col):
    g = sub.groupby('date')[col].mean()
    return g.mean(), g.std(ddof=1) / np.sqrt(len(g))


L, C = both['live'], both['cand']
print(f'Window {START} -> {L.date.max()}: {len(L)} instrument-days, {L.date.nunique()} dates, '
      f'{L.inst.nunique()} instruments (candidate rows joined: {len(C)})')

print('\n== Unconditional exceedance (live | candidate), target in header')
dev = {'live': [], 'cand': []}
for q in Q:
    line = f'  {q.upper():3}'
    for r, t in TARGET.items():
        a, b = rate(L, f'x_{q}_{r}')[0], rate(C, f'x_{q}_{r}')[0]
        dev['live'].append(abs(a - t)); dev['cand'].append(abs(b - t))
        line += f'   {r}: {a*100:5.1f} | {b*100:5.1f}'
    print(line)
gl, gc = np.mean(dev['live']) * 100, np.mean(dev['cand']) * 100
guard = gc <= gl + 1.0
print(f'  mean |exceed-target| over 12 rungs: live {gl:.2f}pp  candidate {gc:.2f}pp  -> GUARD {"PASS" if guard else "FAIL"}')

print('\n== By sigma quintile (live sigma / trailing 250d median): HL p75 | HL p90 exceedance, live vs candidate')
cdev = {'live': [], 'cand': []}
fixed = True
for k in range(5):
    l, c = L[L.quint == k], C[C.quint == k]
    row = f'  Q{k+1} rel~{l.rel.median():.2f} n={len(l):4}'
    for r in ['p75', 'p90']:
        (a, sa), (b, sb) = rate(l, f'x_hl_{r}'), rate(c, f'x_hl_{r}')
        row += f'   HL {r}: {a*100:5.1f}±{sa*100:3.1f} | {b*100:5.1f}±{sb*100:3.1f}'
        if abs(b - TARGET[r]) > 0.03:
            fixed = False
    print(row)
    for q in ['hl', 'oh', 'ol']:
        for r in ['p75', 'p90']:
            cdev['live'].append(abs(rate(l, f'x_{q}_{r}')[0] - TARGET[r]))
            cdev['cand'].append(abs(rate(c, f'x_{q}_{r}')[0] - TARGET[r]))
pl, pc = np.mean(cdev['live']) * 100, np.mean(cdev['cand']) * 100
primary = pc < pl
print(f'  PRIMARY mean |exceed-target| over 30 cells: live {pl:.2f}pp  candidate {pc:.2f}pp -> {"PASS" if primary else "FAIL"}')
print(f'  TARGET BAR (every quintile within ±3pp at HL p75/p90): {"MET" if fixed else "NOT MET"}')

print('\n== Slope of log(realised HL) on log(sigma_used), within instrument (1 = proportional)')
for name, df in [('live', L), ('cand', C)]:
    for cls, s in df.assign(cls=np.where(df.inst.isin(INDICES), 'index', np.where(df.inst == 'GOLD', 'gold', 'fx'))).groupby('cls'):
        s = s[s.r_hl > 0]
        x = np.log(s.sigUsed) - s.groupby('inst').sigUsed.transform(lambda v: np.log(v).mean())
        y = np.log(s.r_hl) - s.groupby('inst').r_hl.transform(lambda v: np.log(v).mean())
        print(f'  {name:4} {cls:5} slope {(x*y).sum()/(x*x).sum():.2f}')

print('\n== Per instrument HL p75 exceedance (target 25): live | candidate')
t = pd.DataFrame({'live': L.groupby('inst').x_hl_p75.mean() * 100, 'cand': C.groupby('inst').x_hl_p75.mean() * 100}).round(1)
print(t.to_string())

print(f'\nVERDICT: PRIMARY {"PASS" if primary else "FAIL"} · GUARD {"PASS" if guard else "FAIL"} · TARGET BAR {"MET" if fixed else "NOT MET"}')
