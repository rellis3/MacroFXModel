"""structural.py - the reversal question asked the way a chart reader asks it.

WHY THIS TEST EXISTS
--------------------
The main study labelled a "reversal" as a barrier race: from THIS bar, does 2
sigma against the leg arrive before 2 sigma with it. That is bar-local and
tradeable, but `examples.py` showed what it costs - the largest reversals and
the largest continuations in ten years sit five minutes apart with nearly
identical VuManChu readings, because each bar carries its own barriers.

A trader pointing at a chart means something else entirely: the swing high
FORMED there, price made a lower high, the trend changed. Structural, not
bar-local. A signal can predict one and not the other, so the null from the
first framing says nothing about the second.

THE QUESTION, SHARPENED
-----------------------
Every swing high is obvious in hindsight; the skill claim is telling them apart
in advance. So this splits confirmed swing highs into two groups:

  MAJOR  price never regained this high within `horizon`, and fell `k` sigma
  MINOR  price traded back above it - just another pullback high

and asks whether the VuManChu state AT THE PIVOT BAR separates them. That is
exactly "is this the top, or just a pause".

Causality: a pivot needs `pivot_n` bars after it to be confirmed, but the
FEATURES are read at the pivot bar itself, which is the moment a trader would
have to act. Nothing here reads the future except the MAJOR/MINOR label, which
is the thing being predicted.

  python vmcResearch/structural.py --instruments eurusd,xauusd,nq
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vmcResearch.stats import N_BLOCKS, batch_means_se, make_blocks  # noqa: E402
from vmcResearch.vmcfeat import pivots  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')

PIVOT_N = 24          # M5 bars either side = 2h swing
HORIZON = 288         # 24h to decide major vs minor
K_SIGMA = 2.0
TFS = (5, 15, 60, 240)


def label_swings(p, pivot_n=PIVOT_N, horizon=HORIZON, k=K_SIGMA):
    """Confirmed swing highs/lows, split into MAJOR (held) and MINOR (broken)."""
    h = p['high'].to_numpy(float)
    l = p['low'].to_numpy(float)
    c = p['close'].to_numpy(float)
    s = p['sigma_price'].to_numpy(float)
    n = len(p)

    ph = np.where(pivots(h, pivot_n, high=True))[0]
    pl = np.where(pivots(l, pivot_n, high=False))[0]

    rows = []
    for idx, is_high in ((ph, True), (pl, False)):
        for i in idx:
            end = min(i + horizon, n - 1)
            if end <= i + pivot_n or not np.isfinite(s[i]) or s[i] <= 0:
                continue
            fwd_h = h[i + 1:end + 1]
            fwd_l = l[i + 1:end + 1]
            if fwd_h.size == 0:
                continue
            if is_high:
                regained = fwd_h.max() > h[i]
                travelled = (h[i] - fwd_l.min()) / s[i]
            else:
                regained = fwd_l.min() < l[i]
                travelled = (fwd_h.max() - l[i]) / s[i]
            major = (not regained) and travelled >= k
            rows.append({'idx': i, 'is_high': is_high, 'major': bool(major),
                         'travelled': travelled})
    return pd.DataFrame(rows)


def evaluate(p, sw, instrument):
    """Does the VuManChu state at the pivot separate MAJOR from MINOR?"""
    blocks = make_blocks(p.index, N_BLOCKS)
    idx = sw['idx'].to_numpy()
    major = sw['major'].to_numpy().astype(float)
    is_high = sw['is_high'].to_numpy()

    print('\n%s  swings found: %s   MAJOR (held + ran %.0f sigma): %s (%.1f%%)'
          % (instrument.upper(), format(len(sw), ','), K_SIGMA,
             format(int(major.sum()), ','), 100 * major.mean()))
    print('  %-30s %10s %10s %9s %8s' % ('feature at the pivot bar', 'MAJOR', 'MINOR', 'gap', 't'))

    rows = []
    for tf in TFS:
        for f in ('wt1', 'wt_spread', 'mf', 'vwap_dist', 'wt1_slope'):
            col = 'tf%d_%s' % (tf, f)
            if col not in p.columns:
                continue
            v = p[col].to_numpy(float)[idx]
            # Sign-flip lows so "extreme in the direction that would confirm a
            # top" is positive for both highs and lows, letting them pool.
            v = np.where(is_high, v, -v)
            a, b = v[major == 1], v[major == 0]
            ok = np.isfinite(v)
            if ok.sum() < 200:
                continue
            diff = float(np.nanmean(a)) - float(np.nanmean(b))
            se = batch_means_se(np.where(major == 1, v, np.nan)[ok], blocks[idx][ok])
            se2 = batch_means_se(np.where(major == 0, v, np.nan)[ok], blocks[idx][ok])
            sed = np.sqrt((se or 0) ** 2 + (se2 or 0) ** 2)
            t = diff / sed if sed and sed > 0 else np.nan
            rows.append({'instrument': instrument, 'feature': col, 'major': float(np.nanmean(a)),
                         'minor': float(np.nanmean(b)), 'gap': diff, 't': t})
    d = pd.DataFrame(rows).reindex(pd.DataFrame(rows)['t'].abs().sort_values(ascending=False).index)
    for _, r in d.head(12).iterrows():
        print('  %-30s %10.2f %10.2f %9.2f %8.2f'
              % (r['feature'], r['major'], r['minor'], r['gap'], r['t'] if np.isfinite(r['t']) else 0))
    return d


def run(instruments):
    from vmcResearch import events
    allr = []
    for inst in instruments:
        f = os.path.join(DATA, 'panel_%s.parquet' % inst)
        if not os.path.exists(f):
            continue
        p = events.add_events(pd.read_parquet(f), horizons=(48,))
        sw = label_swings(p)
        allr.append(evaluate(p, sw, inst))
    if len(allr) > 1:
        d = pd.concat(allr, ignore_index=True)
        g = d.groupby('feature').agg(mean_gap=('gap', 'mean'), n_inst=('gap', 'size'),
                                     consistent=('gap', lambda x: int((np.sign(x) == np.sign(x.mean())).sum())))
        g = g.reindex(g['mean_gap'].abs().sort_values(ascending=False).index)
        print('\n' + '=' * 70)
        print('POOLED - does any feature separate MAJOR from MINOR on every instrument?')
        print('=' * 70)
        print('  %-30s %10s %8s %s' % ('feature', 'mean gap', 'nInst', 'sign-consistent'))
        for k, r in g.head(12).iterrows():
            print('  %-30s %10.2f %8d %d/%d' % (k, r['mean_gap'], r['n_inst'], r['consistent'], r['n_inst']))
        d.to_parquet(os.path.join(DATA, 'structural.parquet'))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='eurusd,xauusd,nq')
    a = ap.parse_args()
    run([s.strip() for s in a.instruments.split(',') if s.strip()])
