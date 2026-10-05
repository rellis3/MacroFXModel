"""LADDER CALIBRATION summary. Reads analysis/surfaces/ladder_calibration/*.csv (scripts/rangebook/ladder_calibration.mjs).

Exceedance of each Export-forecast rung against its target (p50 -> 50%, p75 -> 25%, p90 -> 10%), in-sample
(<= trained_through 2025-08-19) vs out-of-sample. Standard errors are clustered by date: each date's exceedance is
averaged across instruments first, then SE is taken across dates, because a USD or risk shock moves every
instrument at once.
    python analysis/surfaces/ladder_calibration.py [dir] [split]
e.g. the side-by-side HAR candidate on the common out-of-sample window of both param files:
    python analysis/surfaces/ladder_calibration.py analysis/surfaces/ladder_calibration_v2 2025-09-04
"""
import glob
import sys
import numpy as np
import pandas as pd

DIR = sys.argv[1] if len(sys.argv) > 1 else 'analysis/surfaces/ladder_calibration'
SPLIT = sys.argv[2] if len(sys.argv) > 2 else '2025-08-19'
CAL_END = '2026-07-02'   # calendar proxy ends; later days run with no event multiplier
TARGET = {'p50': 0.50, 'p75': 0.25, 'p90': 0.10}
Q = ['oh', 'ol', 'hl', 'oc']
INDICES = {'NQ', 'SPX500', 'DOW', 'US2000', 'DE30', 'UK100'}

df = pd.concat([pd.read_csv(f) for f in glob.glob(f'{DIR}/*.csv')], ignore_index=True)
df = df[df.nbars >= 600].copy()      # drop partial / holiday stubs
df['cls'] = np.where(df.inst.isin(INDICES), 'index', np.where(df.inst == 'GOLD', 'gold', 'fx'))
df['period'] = np.where(df.date <= SPLIT, 'IS', np.where(df.date <= CAL_END, 'OOS', 'OOS-nocal'))
for q in Q:
    for r in TARGET:
        df[f'x_{q}_{r}'] = (df[f'r_{q}'] > df[f'{q}_{r}']).astype(float)


def clustered(sub, col):
    g = sub.groupby('date')[col].mean()
    return g.mean(), g.std(ddof=1) / np.sqrt(len(g)), len(sub), len(g)


def table(sub, label):
    print(f'\n== {label}  ({len(sub)} instrument-days, {sub.date.nunique()} dates)')
    print('       ' + ''.join(f'{r} (tgt {int(t*100)}%)'.rjust(22) for r, t in TARGET.items()))
    for q in Q:
        cells = []
        for r, t in TARGET.items():
            m, se, _, _ = clustered(sub, f'x_{q}_{r}')
            z = (m - t) / se if se > 0 else 0
            flag = ' *' if abs(z) > 2 else '  '
            cells.append(f'{m*100:5.1f}% ±{se*100:4.1f} z{z:+5.1f}{flag}'.rjust(22))
        print(f'  {q.upper():4} ' + ''.join(cells))


for p in ['IS', 'OOS', 'OOS-nocal']:
    table(df[df.period == p], p)

oos = df[df.period != 'IS']
for c in ['fx', 'gold', 'index']:
    table(oos[oos.cls == c], f'OOS (all) · {c}')

print('\n== OOS by event tag: HL / OH exceedance at p50 / p75 / p90')
for ev, s in df[df.period == 'OOS'].groupby('event'):
    v = [clustered(s, f'x_{q}_{r}')[0] * 100 for q in ['hl', 'oh'] for r in TARGET]
    print(f'  {ev:8} n={len(s):5}  HL {v[0]:5.1f} {v[1]:5.1f} {v[2]:5.1f}   OH {v[3]:5.1f} {v[4]:5.1f} {v[5]:5.1f}')

print('\n== Conditional on sigma regime (sigDaily / own trailing 250d median), OOS all: HL p50 / p75 / p90')
df = df.sort_values(['inst', 'date'])
df['sig_rel'] = df.sigDaily / df.groupby('inst').sigDaily.transform(lambda s: s.rolling(250, min_periods=60).median().shift(1))
oos = df[df.period != 'IS'].dropna(subset=['sig_rel'])
oos['sreg'] = pd.qcut(oos.sig_rel, 3, labels=['low σ', 'mid σ', 'high σ'])
for g, s in oos.groupby('sreg', observed=True):
    v = [clustered(s, f'x_hl_{r}')[0] * 100 for r in TARGET]
    print(f'  {g:7} n={len(s):5}  ratio {s.sig_rel.median():.2f}   {v[0]:5.1f} {v[1]:5.1f} {v[2]:5.1f}')

print('\n== By year (all periods): HL p50 / p75 / p90, OH p90')
df['year'] = df.date.str[:4]
for y, s in df.groupby('year'):
    v = [clustered(s, f'x_hl_{r}')[0] * 100 for r in TARGET] + [clustered(s, 'x_oh_p90')[0] * 100]
    print(f'  {y} n={len(s):5}  {v[0]:5.1f} {v[1]:5.1f} {v[2]:5.1f}   OH p90 {v[3]:5.1f}')

print('\n== Does sigma scale right?  log(realised HL) on log(sigma_used), OOS, per class (slope 1 = proportional)')
oos = df[df.period != 'IS']
for c, s in oos.groupby('cls'):
    s = s[s.r_hl > 0]
    # within-instrument (demeaned) so cross-instrument level differences don't drive the slope
    x = np.log(s.sigUsed) - s.groupby('inst').sigUsed.transform(lambda v: np.log(v).mean())
    y = np.log(s.r_hl) - s.groupby('inst').r_hl.transform(lambda v: np.log(v).mean())
    b = (x * y).sum() / (x * x).sum()
    r2 = 1 - ((y - b * x) ** 2).sum() / (y * y).sum()
    print(f'  {c:6} slope {b:.2f}  within-R² {r2:.2f}  n={len(s)}')

print('\n== Worst instruments OOS (|HL p75 exceedance − 25%|, instrument-level, n days)')
rows = []
for i, s in df[df.period != 'IS'].groupby('inst'):
    rows.append((i, len(s), *(s[f'x_hl_{r}'].mean() * 100 for r in TARGET), s.x_oh_p90.mean() * 100, s.x_ol_p90.mean() * 100))
t = pd.DataFrame(rows, columns=['inst', 'n', 'hl50', 'hl75', 'hl90', 'oh90', 'ol90'])
t['dev'] = (t.hl75 - 25).abs()
print(t.sort_values('dev', ascending=False).round(1).to_string(index=False))
