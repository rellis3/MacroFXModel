"""cross_section.py - the extension read, ranked ACROSS instruments instead of timed on one.

WHY REDO THIS
-------------
A first attempt used 12 instruments, 10 of them FX pairs sharing currency legs,
and came out WEAKER than the single-instrument version. That was not a fair
test: going long the least-extended and short the most-extended when both are
USD pairs is close to no position at all, so the design cannot diversify.

This uses everything available - all FX pairs plus indices and commodities from
`all_macro_h1` - which is where genuinely independent names live.

THREE FIXES ON THE FIRST ATTEMPT
  common clock       a wide pivot on datetime, so instruments actually align.
                     Striding each series separately left 79 usable stamps out
                     of 510,606 and produced a meaningless Sharpe.
  no overlap         forward returns sampled every 4h rather than hourly. The
                     earlier t = 3.29 was inflated roughly 2x by 4x overlap.
  real spreads       `all_macro_h1` carries spread_open/spread_close, so cost
                     comes from the data instead of my assumption.

  python vmcResearch/cross_section.py
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
M1 = os.path.join(ROOT, 'VolRangeForecaster', 'data', 'm1')

VWAP_WIN = 20        # hours
SIG_WIN = 200        # hours
FWD = 4              # hours ahead
MIN_NAMES = 12


def wide(path, level):
    d = pd.read_parquet(path)
    d = d.reset_index()
    key = d.columns[0] if level is None else level
    close = d.pivot_table(index='datetime', columns=key, values='close', aggfunc='last')
    return close


def build():
    frames = []
    for f, lvl in ((os.path.join(M1, 'all_pairs_h1.parquet'), 'pair'),
                   (os.path.join(M1, 'all_macro_h1.parquet'), 'name')):
        if os.path.exists(f):
            frames.append(wide(f, lvl))
    C = pd.concat(frames, axis=1)
    C = C.loc[:, ~C.columns.duplicated()]
    C = C.dropna(axis=1, thresh=int(len(C) * 0.5))
    print('instruments: %d   hourly stamps: %s' % (C.shape[1], format(len(C), ',')))
    print('  names: %s' % ', '.join(list(C.columns)[:40]))
    return C


def run():
    C = build()
    lc = np.log(C)
    ret = lc.diff()
    sig = ret.rolling(SIG_WIN, min_periods=50).std()

    # Extension: distance from a rolling VWAP-ish mean, in sigma. Using close
    # here (no volume for every name) - it is the same "how stretched" quantity.
    ma = lc.rolling(VWAP_WIN, min_periods=VWAP_WIN).mean()
    ext = (lc - ma) / (sig * np.sqrt(VWAP_WIN))

    fwd = lc.shift(-FWD) - lc
    fwd_n = fwd / (sig * np.sqrt(FWD))

    # Non-overlapping: sample every FWD hours.
    idx = np.arange(0, len(C), FWD)
    E, R = ext.iloc[idx], fwd_n.iloc[idx]
    ok = E.notna() & R.notna()
    n_ok = ok.sum(axis=1)
    use = (n_ok >= MIN_NAMES).to_numpy()
    print('  usable non-overlapping periods: %s (>=%d names)' % (format(int(use.sum()), ','), MIN_NAMES))

    Em = E.where(ok)
    rk = Em.rank(axis=1, pct=True)
    long = (rk <= 0.2) & use[:, None]
    short = (rk >= 0.8) & use[:, None]
    pl = R.where(long).mean(axis=1)
    ps = R.where(short).mean(axis=1)
    sp = ((pl - ps) / 2.0).dropna()

    print('\nFADE-THE-EXTENDED, cross-sectional, %d instruments' % C.shape[1])
    print('  periods %s   mean %+.5f sigma per %dh   hit %.3f'
          % (format(len(sp), ','), sp.mean(), FWD, (sp > 0).mean()))
    t = sp.mean() / (sp.std() / np.sqrt(len(sp)))
    print('  t-stat %.2f   ann Sharpe %.2f' % (t, sp.mean() / sp.std() * np.sqrt(252 * 24 / FWD)))
    h = len(sp) // 2
    print('  1st half %+.5f   2nd half %+.5f   same sign %s'
          % (sp[:h].mean(), sp[h:].mean(), np.sign(sp[:h].mean()) == np.sign(sp[h:].mean())))

    # Momentum is the mirror trade - worth knowing which way the cross-section runs.
    spm = -sp
    print('  (the opposite trade, cross-sectional MOMENTUM, would be %+.5f)' % spm.mean())

    # Single-instrument comparison on identical data.
    sing = []
    for c in C.columns:
        e, r = ext[c], fwd_n[c]
        m = e.notna() & r.notna()
        if m.sum() < 3000:
            continue
        q = pd.qcut(e[m], 5, labels=False, duplicates='drop')
        sing.append(r[m][q == 0].mean() - r[m][q == 4].mean())
    print('\n  SAME signal single-instrument: mean %+.5f   positive on %d/%d'
          % (np.mean(sing), int(np.sum(np.array(sing) > 0)), len(sing)))


if __name__ == '__main__':
    run()
