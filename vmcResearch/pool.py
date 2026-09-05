"""pool.py - section 19: does anything replicate on instruments it was not found on?

With 656 cells scored per instrument, the in-sample winners on any ONE
instrument are mostly the tail of a distribution. The test that matters is
whether a cell that looked good on EURUSD also looks good on eleven pairs it
was never tuned against.

The reported cross-instrument t-stat treats instruments as replicates, which
OVERSTATES independence: EURUSD, GBPUSD and AUDUSD all carry the same USD leg,
so a USD-driven effect shows up three times and looks like three confirmations.
The sign-consistency count is the more trustworthy column for exactly that
reason, and a genuinely robust cell should hold on the two non-FX instruments
(XAUUSD, NQ) as well as on the pairs.
"""
from __future__ import annotations

import glob
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
NON_FX = {'xauusd', 'nq'}


def load_all():
    frames = []
    for f in sorted(glob.glob(os.path.join(DATA, 'res_*.parquet'))):
        frames.append(pd.read_parquet(f))
    if not frames:
        raise SystemExit('no res_*.parquet yet')
    return pd.concat(frames, ignore_index=True)


def pool(df, outcome, min_inst=6):
    d = df[df.outcome == outcome]
    rows = []
    for cell, g in d.groupby('cell'):
        g = g[np.isfinite(g['delta'])]
        if len(g) < min_inst:
            continue
        deltas = g['delta'].to_numpy()
        mean = deltas.mean()
        se = deltas.std(ddof=1) / np.sqrt(len(deltas))
        same = int(np.sum(np.sign(deltas) == np.sign(mean)))
        nf = g[g.instrument.isin(NON_FX)]
        nf_ok = bool(len(nf) and np.all(np.sign(nf['delta'].to_numpy()) == np.sign(mean)))
        rows.append({
            'cell': cell, 'n_inst': len(g), 'mean_delta': mean,
            'cross_t': mean / se if se > 0 else np.nan,
            'sign_consistent': same, 'frac_consistent': same / len(g),
            'nonfx_agrees': nf_ok,
            'median_n': int(g['n'].median()),
            'mean_oos_delta': float(np.nanmean(g['oos_delta'].to_numpy())),
            'oos_sign_ok': bool(np.sign(np.nanmean(g['oos_delta'].to_numpy())) == np.sign(mean)),
        })
    return pd.DataFrame(rows).sort_values('cross_t', key=np.abs, ascending=False).reset_index(drop=True)


def fmt(p, top=25):
    out = ['  %-40s %5s %10s %7s %7s %6s %6s' %
           ('cell', 'nInst', 'meanDelta', 'crossT', 'consist', 'nonFX', 'oosOK')]
    for _, r in p.head(top).iterrows():
        out.append('  %-40s %5d %10.4f %7.2f %4d/%-2d %6s %6s'
                   % (r['cell'][:40], r['n_inst'], r['mean_delta'], r['cross_t'],
                      r['sign_consistent'], r['n_inst'],
                      'Y' if r['nonfx_agrees'] else '.', 'Y' if r['oos_sign_ok'] else '.'))
    return '\n'.join(out)


def survivors(p, min_t=3.0, min_frac=0.75):
    """Cells that clear the cross-instrument bar AND hold out-of-sample AND
    agree on the non-FX instruments. Deliberately strict: the point of this
    study is to find what is real, not to maximise the length of a list."""
    return p[(p.cross_t.abs() >= min_t) & (p.frac_consistent >= min_frac)
             & p.nonfx_agrees & p.oos_sign_ok]


if __name__ == '__main__':
    df = load_all()
    print('instruments scored: %s' % ', '.join(sorted(df.instrument.unique())))
    for o in ('dir20', 'cont48'):
        p = pool(df, o)
        if p.empty:
            continue
        print('\n=== %s : pooled across instruments (%d cells) ===' % (o, len(p)))
        print(fmt(p, 22))
        s = survivors(p)
        print('\n  SURVIVORS (|cross_t|>=3, >=75%% sign-consistent, non-FX agrees, OOS sign holds): %d' % len(s))
        if len(s):
            print(fmt(s, 25))
        p.to_parquet(os.path.join(DATA, 'pooled_%s.parquet' % o))
