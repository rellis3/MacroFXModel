"""div_study.py - does divergence pay, at the horizon it is actually traded?

The outcome is SIGNED BY THE DIVERGENCE'S OWN DIRECTION, so bullish and bearish
pool into one statistic: a bearish divergence must predict down and a bullish
one up for the number to come out positive. That is the trader's claim stated
so it can fail.

  signed = fwd_sig_h * sign(divergence)

Positive => the pattern paid. Zero => it did not. Negative => it is inverted,
and fading the faders would have been the trade.

Everything is measured against the instrument's own unconditional drift at that
horizon, with a batch-means SE over time blocks, and split in half by time so
in-sample and out-of-sample can be compared rather than averaged.

  python vmcResearch/div_study.py --instrument xauusd
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vmcResearch.stats import N_BLOCKS, batch_means_se, make_blocks  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
TFS = (1, 3, 5, 15)
SERIES = ('wt', 'wt2', 'mf', 'vwap')
PIVOTS = (3, 5)
HORIZONS = (5, 10, 20, 30, 60)


def evaluate(y, sgn, mask, blocks, is_mask, label, min_n=300):
    """Mean signed outcome for the rows where the divergence fired."""
    m = mask & np.isfinite(y) & (sgn != 0)
    n = int(m.sum())
    if n < min_n:
        return None
    v = y[m] * sgn[m]
    val = float(np.mean(v))
    se = batch_means_se(v, blocks[m])
    is_v = float(np.mean(v[is_mask[m]])) if is_mask[m].sum() > min_n // 4 else np.nan
    oos_v = float(np.mean(v[~is_mask[m]])) if (~is_mask[m]).sum() > min_n // 4 else np.nan
    return {'cell': label, 'n': n, 'signed': val,
            't': val / se if se and se > 0 else np.nan,
            'is': is_v, 'oos': oos_v,
            'ok': bool(np.isfinite(is_v) and np.isfinite(oos_v) and np.sign(is_v) == np.sign(oos_v))}


def run(instrument, exhaustion_only=False):
    p = pd.read_parquet(os.path.join(DATA, 'fast_%s.parquet' % instrument))
    blocks = make_blocks(p.index, N_BLOCKS)
    is_mask = np.arange(len(p)) < int(len(p) * 0.6)
    prior = p['prior_60'].to_numpy(float)
    hour = p['hour'].to_numpy()

    rows = []
    for tf in TFS:
        for s in SERIES:
            for pn in PIVOTS:
                col = 'tf%d_div_%s_n%d_reg' % (tf, s, pn)
                if col not in p.columns:
                    continue
                d = p[col].to_numpy(float)
                sgn = np.sign(np.nan_to_num(d))
                fired = sgn != 0
                for hz in HORIZONS:
                    y = p['fwd_sig_%d' % hz].to_numpy(float)
                    r = evaluate(y, sgn, fired, blocks, is_mask,
                                 'tf%d/%s/n%d/h%d' % (tf, s, pn, hz))
                    if r:
                        r.update(tf=tf, series=s, pivot=pn, horizon=hz, cond='all')
                        rows.append(r)
                    # THE exhaustion setup: price extended, divergence against it.
                    exh = fired & (np.abs(prior) > 1.0) & (np.sign(prior) == -sgn)
                    r2 = evaluate(y, sgn, exh, blocks, is_mask,
                                  'tf%d/%s/n%d/h%d EXH' % (tf, s, pn, hz))
                    if r2:
                        r2.update(tf=tf, series=s, pivot=pn, horizon=hz, cond='exhaustion')
                        rows.append(r2)
                    # Late-NY, where the main study's one robust effect lived.
                    nyl = fired & (hour >= 17)
                    r3 = evaluate(y, sgn, nyl, blocks, is_mask,
                                  'tf%d/%s/n%d/h%d NYlate' % (tf, s, pn, hz))
                    if r3:
                        r3.update(tf=tf, series=s, pivot=pn, horizon=hz, cond='nylate')
                        rows.append(r3)

    d = pd.DataFrame(rows)
    d['instrument'] = instrument
    d.to_parquet(os.path.join(DATA, 'div_%s.parquet' % instrument))
    return d


def report(d, instrument):
    print('=' * 84)
    print('DIVERGENCE, SIGNED BY ITS OWN DIRECTION  -  %s' % instrument.upper())
    print('positive = the pattern paid.  units = forward sigma.  %d tests.' % len(d))
    print('=' * 84)

    for cond in ('all', 'exhaustion', 'nylate'):
        s = d[d.cond == cond]
        if s.empty:
            continue
        print('\n--- condition: %s ---' % cond)
        print('  mean signed outcome across all %d tests: %+.4f sigma' % (len(s), s.signed.mean()))
        print('  tests positive: %d / %d   |t|>3: %d   IS/OOS sign agrees: %d'
              % ((s.signed > 0).sum(), len(s), (s.t.abs() > 3).sum(), s.ok.sum()))
        top = s.reindex(s.t.abs().sort_values(ascending=False).index).head(10)
        print('  %-26s %8s %9s %7s %8s %8s %s' % ('cell', 'n', 'signed', 't', 'IS', 'OOS', 'ok'))
        for _, r in top.iterrows():
            print('  %-26s %8s %+9.4f %7.2f %+8.4f %+8.4f %s'
                  % (r['cell'][:26], format(int(r['n']), ','), r['signed'], r['t'],
                     r['is'] if np.isfinite(r['is']) else 0,
                     r['oos'] if np.isfinite(r['oos']) else 0, 'Y' if r['ok'] else '.'))

    print('\n--- by oscillator series (mean signed outcome, all conditions) ---')
    print(d.groupby('series')['signed'].agg(['mean', 'count']).round(5).to_string())
    print('\n--- by timeframe ---')
    print(d.groupby('tf')['signed'].agg(['mean', 'count']).round(5).to_string())
    print('\n--- by horizon (minutes) ---')
    print(d.groupby('horizon')['signed'].agg(['mean', 'count']).round(5).to_string())


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='xauusd')
    a = ap.parse_args()
    report(run(a.instrument), a.instrument)
