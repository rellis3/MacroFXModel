"""examples.py - deliverable 18: actual historical setups, so the labels can be checked by eye.

WHY THIS IS A VALIDATION, NOT A GARNISH
---------------------------------------
Every statistic in this study rests on an algorithmic definition of "reversal"
and "continuation". If that definition does not match what a trader calls a
reversal when looking at a chart, then the whole study measured the wrong thing
and no amount of internal rigour would reveal it - the numbers would be
perfectly self-consistent and perfectly beside the point.

So this pulls the actual events out with their full multi-timeframe VuManChu
state, biggest and cleanest first, for eyeballing against the real chart.

Two sets:
  REVERSALS     the prevailing leg travelled 2 sigma AGAINST itself first
  CONTINUATIONS the prevailing leg extended 2 sigma first

Both are sampled across the whole history rather than taken from one stretch,
so a single unusual month cannot supply every example.

  python vmcResearch/examples.py --instrument eurusd --n 12
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

# Redirecting stdout to a file makes Python pick cp1252 on Windows, which dies
# on any non-ASCII glyph. Same guard the rest of the lab uses.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vmcResearch import events  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
PHASE = {0: 'range', 1: 'impulse', 2: 'pullback', 3: 'broken', 4: 'drift'}


def zone(w):
    if not np.isfinite(w):
        return '   n/a'
    if w >= 60:
        return 'OB++'
    if w >= 53:
        return 'OB  '
    if w <= -60:
        return 'OS--'
    if w <= -53:
        return 'OS  '
    return '  -  ' if abs(w) < 20 else ('  +  ' if w > 0 else '  .  ')


def pick(p, want, n, min_gap=2880):
    """Strongest examples of `want` (1=continuation, -1=reversal), spread out."""
    r = p['resolve_48'].to_numpy()
    mag = np.abs(p['trend_sig'].to_numpy(float))
    cand = np.where((r == want) & np.isfinite(mag))[0]
    cand = cand[np.argsort(mag[cand])[::-1]]
    out = []
    for i in cand:
        if all(abs(i - j) > min_gap for j in out):
            out.append(i)
        if len(out) >= n:
            break
    return sorted(out)


def render(p, idxs, title):
    lines = []
    lines.append('')
    lines.append('=' * 100)
    lines.append(title)
    lines.append('=' * 100)
    lines.append('%-17s %9s %7s %8s | %-24s | %-22s | %s'
                 % ('when (UTC)', 'price', 'leg sd', 'phase', 'WT1  5m / 15m / 1h / 4h',
                    'MF   5m / 15m / 1h/4h', 'VWAPdist 5m/15m/1h'))
    lines.append('-' * 100)
    for i in idxs:
        row = p.iloc[i]
        wts = [row['tf%d_wt1' % tf] for tf in (5, 15, 60, 240)]
        mfs = [row['tf%d_mf' % tf] for tf in (5, 15, 60, 240)]
        vws = [row['tf%d_vwap_dist' % tf] for tf in (5, 15, 60)]
        lines.append('%-17s %9.5f %7.2f %8s | %s | %s | %s'
                     % (str(p.index[i])[:16], row['close'], row['trend_sig'],
                        PHASE[int(row['phase'])],
                        ' '.join('%+6.1f' % w for w in wts),
                        ' '.join('%+5.1f' % m for m in mfs),
                        ' '.join('%+5.2f' % v for v in vws)))
        lines.append('%-17s %9s %7s %8s | %s | %s |'
                     % ('', '', '', '',
                        ' '.join(zone(w) + '  ' for w in wts),
                        ' '.join('%5s' % ('pos' if m > 0 else 'neg') for m in mfs)))
    return '\n'.join(lines)


def summarise(p, rev_idx, con_idx):
    """The eyeball test in one number: do the two sets actually look different?"""
    out = ['', '=' * 100,
           'SIDE BY SIDE - if these columns look the same, the indicator was not distinguishing them',
           '=' * 100,
           '%-26s %14s %14s %10s' % ('feature at the event', 'REVERSALS', 'CONTINUATIONS', 'gap')]
    for tf in (5, 15, 60, 240):
        for f, nm in (('wt1', 'WT1'), ('mf', 'MoneyFlow'), ('vwap_dist', 'VWAPdist')):
            col = 'tf%d_%s' % (tf, f)
            a = float(np.nanmean(p[col].to_numpy(float)[rev_idx]))
            b = float(np.nanmean(p[col].to_numpy(float)[con_idx]))
            out.append('%-26s %14.2f %14.2f %10.2f' % ('%s %s' % (nm, '%dm' % tf if tf < 60 else '%dh' % (tf // 60)), a, b, a - b))
    return '\n'.join(out)


def run(instrument, n=12):
    p = pd.read_parquet(os.path.join(DATA, 'panel_%s.parquet' % instrument))
    p = events.add_events(p, horizons=(48,))
    rev = pick(p, -1, n)
    con = pick(p, 1, n)
    print(render(p, rev, 'REVERSALS - the prevailing leg turned and ran 2 sigma the other way (%s)' % instrument.upper()))
    print(render(p, con, 'CONTINUATIONS - the prevailing leg extended 2 sigma further (%s)' % instrument.upper()))

    # Use the full population, not just the printed examples, for the comparison.
    r = p['resolve_48'].to_numpy()
    print(summarise(p, np.where(r == -1)[0], np.where(r == 1)[0]))
    return p, rev, con


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='eurusd')
    ap.add_argument('--n', type=int, default=12)
    a = ap.parse_args()
    run(a.instrument, a.n)
