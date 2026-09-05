"""report.py - assemble every table the study produced into one text dump.

Deliberately dumb: it reads the artefacts the other modules wrote and prints
them. No statistics are computed here, so a number in the report can always be
traced to the module that produced it.

  python vmcResearch/report.py > vmcResearch/RESULTS.txt
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vmcResearch import pool  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')


def h(title):
    print('\n' + '=' * 78)
    print(title)
    print('=' * 78)


def section_replication():
    h('CROSS-INSTRUMENT REPLICATION  (sections 15, 19)')
    df = pool.load_all()
    insts = sorted(df.instrument.unique())
    print('instruments: %s  (%d)' % (', '.join(insts), len(insts)))
    nulls = df.groupby('outcome')['null_max_t_p90'].mean()
    print('\nnull |t| bar from block-shuffled labels (p90 of max |t| across the scan):')
    for o, v in nulls.items():
        print('  %-8s %.2f' % (o, v))
    for o in ('dir20', 'cont48'):
        p = pool.pool(df, o)
        if p.empty:
            continue
        print('\n--- %s : top cells by cross-instrument t ---' % o)
        print(pool.fmt(p, 20))
        s = pool.survivors(p)
        print('\n  SURVIVORS (|cross_t|>=3, >=75%% sign-consistent, non-FX agrees, OOS holds): %d of %d'
              % (len(s), len(p)))
        if len(s):
            print(pool.fmt(s, 30))


def section_levels():
    f = os.path.join(DATA, 'pooled_touch.parquet')
    if not os.path.exists(f):
        return
    h('LEVEL TOUCHES, POOLED  (section 18)')
    d = pd.read_parquet(f)
    base = d[d.state == 'ALL']
    tot_n = int(base['n'].sum())
    tot_p = float((base['p_breakout'] * base['n']).sum() / base['n'].sum())
    print('resolved touches pooled: %s   base P(breakout) = %.4f' % (format(tot_n, ','), tot_p))
    print('SE on a proportion at this n = %.4f, so anything under ~%.3f is noise'
          % (np.sqrt(0.25 / tot_n), 3 * np.sqrt(0.25 / tot_n)))
    g = d[d.state != 'ALL'].groupby('state').apply(
        lambda x: pd.Series({'n': x['n'].sum(),
                             'p_breakout': (x['p_breakout'] * x['n']).sum() / x['n'].sum(),
                             'n_inst': len(x)}), include_groups=False).reset_index()
    g['delta'] = g['p_breakout'] - tot_p
    g['z'] = g['delta'] / np.sqrt(0.25 / g['n'])
    g = g.reindex(g['z'].abs().sort_values(ascending=False).index)
    print('\n  %-24s %9s %10s %9s %7s' % ('state at touch', 'n', 'P(break)', 'delta', 'z'))
    for _, r in g.head(24).iterrows():
        print('  %-24s %9s %10.4f %+9.4f %7.2f'
              % (r['state'][:24], format(int(r['n']), ','), r['p_breakout'], r['delta'], r['z']))


def section_path():
    f = os.path.join(DATA, 'pooled_path.parquet')
    if not os.path.exists(f):
        return
    h('MFE / MAE BY STATE  (section 14/16)')
    d = pd.read_parquet(f)
    for hz in sorted(d.h.unique()):
        s = d[d.h == hz]
        base = s[s.state == 'ALL']
        b_mfe = float((base['mfe'] * base['n']).sum() / base['n'].sum())
        b_mae = float((base['mae'] * base['n']).sum() / base['n'].sum())
        print('\n--- horizon %d bars (%d min): baseline MFE %+.3f  MAE %+.3f  ratio %.3f ---'
              % (hz, hz * 5, b_mfe, b_mae, b_mfe / abs(b_mae)))
        g = s[s.state != 'ALL'].groupby('state').apply(
            lambda x: pd.Series({'n': x['n'].sum(),
                                 'mfe': (x['mfe'] * x['n']).sum() / x['n'].sum(),
                                 'mae': (x['mae'] * x['n']).sum() / x['n'].sum(),
                                 't_mfe': (x['t_mfe'] * x['n']).sum() / x['n'].sum()}),
            include_groups=False).reset_index()
        g['ratio'] = g['mfe'] / g['mae'].abs()
        g['edge'] = g['ratio'] - b_mfe / abs(b_mae)
        g = g.reindex(g['edge'].abs().sort_values(ascending=False).index)
        print('  %-24s %10s %8s %8s %7s %8s' % ('state', 'n', 'MFE', 'MAE', 'ratio', 'vs base'))
        for _, r in g.head(14).iterrows():
            print('  %-24s %10s %8.3f %8.3f %7.3f %+8.3f'
                  % (r['state'][:24], format(int(r['n']), ','), r['mfe'], r['mae'],
                     r['ratio'], r['edge']))


def section_reversal():
    f = os.path.join(DATA, 'pooled_rev.parquet')
    if not os.path.exists(f):
        return
    h('REVERSAL vs CONTINUATION: WHICH STATES WERE PRESENT  (section 10)')
    d = pd.read_parquet(f)
    g = d.groupby(['state', 'outcome']).apply(
        lambda x: (x['share'] * x['n']).sum() / x['n'].sum(), include_groups=False).unstack()
    if 'reversal' not in g or 'continuation' not in g:
        return
    g['lift'] = g['reversal'] - g['continuation']
    g = g.reindex(g['lift'].abs().sort_values(ascending=False).index)
    print('  share of rows in which the state was present, by what happened next')
    print('  a state that discriminates has a LARGE gap; equal shares mean it says nothing')
    print('\n  %-24s %12s %12s %8s' % ('state', 'in reversals', 'in contins', 'gap'))
    for st, r in g.head(22).iterrows():
        print('  %-24s %12.4f %12.4f %+8.4f' % (st[:24], r['reversal'], r['continuation'], r['lift']))


if __name__ == '__main__':
    section_replication()
    section_levels()
    section_path()
    section_reversal()
