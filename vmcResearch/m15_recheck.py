"""m15_recheck.py - is the M15 OB/OS finding real, or the clock in disguise?

THE DOUBT
  Phase 1 reported M15 overbought/oversold in a RANGE regime at -1.5pp on
  P(continuation), 12/12 instruments, |t| to 6.9 - and noted it was strongest
  in "late NY". But `stats.build_strata` matches on only FOUR coarse session
  buckets, and the bucket "NY-late 17-24 UTC" spans hours whose own reversal
  rates differ enormously (19:00 +0.6pp vs 21:00 +10.1pp on EURUSD, see
  [[project_reversal_hour_window]]). So the cell could be inheriting the hour
  rather than carrying oscillator information.

TWO TESTS
  1. COMPOSITION  do these events concentrate in the reversal-prone hours? If
                  they are spread evenly the confound cannot operate.
  2. HOUR-MATCHED do the deltas survive when the baseline is re-weighted on 24
                  NY hours (DST-aware) instead of 4 UTC session buckets?

A finding that shrinks toward zero under hour matching was the clock. One that
holds is the oscillator.
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vmcResearch import events as EV  # noqa: E402
from vmcResearch.stats import N_BLOCKS, batch_means_se, make_blocks, tercile  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
INSTRUMENTS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf',
               'eurjpy', 'gbpjpy', 'audjpy', 'eurgbp', 'xauusd', 'nq']
OB1, OB2, OS1, OS2 = 53.0, 60.0, -53.0, -60.0


def strata(p, by_hour):
    """Confounder key. `by_hour=False` reproduces the ORIGINAL 4-session
    matching; True upgrades it to 24 DST-aware New York hours."""
    vol_t = tercile(p['sigma_price'].to_numpy(float) / p['close'].to_numpy(float))
    mag_t = tercile(np.abs(p['trend_sig'].to_numpy(float)))
    if by_hour:
        h = p.index.tz_convert('America/New_York').hour.to_numpy()
    else:
        u = p['hour'].to_numpy()
        h = np.select([u < 7, u < 12, u < 17], [0, 1, 2], default=3)
    return h.astype(np.int32) * 100 + vol_t.astype(np.int32) * 10 + mag_t.astype(np.int32)


def score(y, mask, st, blocks, min_n=400):
    m = mask & np.isfinite(y)
    n = int(m.sum())
    if n < min_n:
        return None
    ok = np.isfinite(y)
    glob = pd.Series(y[ok]).groupby(st[ok]).mean()
    w = pd.Series(st[m]).value_counts(normalize=True)
    common = w.index.intersection(glob.index)
    if not len(common):
        return None
    base = float((glob.loc[common] * w.loc[common]).sum() / w.loc[common].sum())
    val = float(np.mean(y[m]))
    se = batch_means_se(y[m] - base, blocks[m])
    return {'n': n, 'delta': val - base, 't': (val - base) / se if se and se > 0 else np.nan}


def run():
    cells_def = {
        'tf15/zone=OS2@range': lambda p: (p['tf15_wt1'].to_numpy(float) <= OS2) & (p['phase'].to_numpy() == 0),
        'tf15/zone=OS1@range': lambda p: (p['tf15_wt1'].to_numpy(float) <= OS1) & (p['tf15_wt1'].to_numpy(float) > OS2) & (p['phase'].to_numpy() == 0),
        'tf15/zone=OB2@range': lambda p: (p['tf15_wt1'].to_numpy(float) >= OB2) & (p['phase'].to_numpy() == 0),
        'tf15/cross_from_OS@range': lambda p: (p['tf15_bars_since_cross'].to_numpy(float) <= 1) &
                                              (p['tf15_last_cross_dir'].to_numpy(float) > 0) &
                                              (p['tf15_wt1'].to_numpy(float) <= OS1) & (p['phase'].to_numpy() == 0),
    }
    comp, rows = [], []
    for inst in INSTRUMENTS:
        f = os.path.join(DATA, 'panel_%s.parquet' % inst)
        if not os.path.exists(f):
            continue
        p = EV.add_events(pd.read_parquet(f), horizons=(48,))
        r48 = p['resolve_48'].to_numpy()
        y = np.where(r48 == 1, 1.0, np.where(r48 == -1, 0.0, np.nan))
        blocks = make_blocks(p.index, N_BLOCKS)
        st_sess = strata(p, False)
        st_hour = strata(p, True)
        nyh = p.index.tz_convert('America/New_York').hour.to_numpy()
        for name, fn in cells_def.items():
            m = fn(p)
            a = score(y, m, st_sess, blocks)
            b = score(y, m, st_hour, blocks)
            if a is None or b is None:
                continue
            rows.append({'instrument': inst, 'cell': name, 'n': a['n'],
                         'delta_session': a['delta'], 't_session': a['t'],
                         'delta_hour': b['delta'], 't_hour': b['t']})
            if name == 'tf15/zone=OS2@range':
                # Composition: share of these events in the reversal-prone window.
                comp.append({'instrument': inst,
                             'cell_in_16_19ET': float(np.mean((nyh[m] >= 16) & (nyh[m] < 19))),
                             'all_in_16_19ET': float(np.mean((nyh >= 16) & (nyh < 19)))})
        print('  done %s' % inst, flush=True)

    d = pd.DataFrame(rows)
    c = pd.DataFrame(comp)
    d.to_parquet(os.path.join(DATA, 'm15_recheck.parquet'))

    print('\n1. COMPOSITION - do these events cluster in the reversal-prone hours (16-19 ET)?')
    print('   %-9s %14s %14s %8s' % ('inst', 'cell share', 'baseline share', 'ratio'))
    for _, r in c.iterrows():
        print('   %-9s %13.3f %14.3f %8.2fx'
              % (r.instrument.upper(), r.cell_in_16_19ET, r.all_in_16_19ET,
                 r.cell_in_16_19ET / max(r.all_in_16_19ET, 1e-9)))
    print('   mean ratio %.2fx  (1.00 = no clustering, so no confound possible)'
          % (c.cell_in_16_19ET / c.all_in_16_19ET).mean())

    print('\n2. HOUR-MATCHED RESCORE - does the delta survive 24 NY hours vs 4 sessions?')
    print('   %-26s %7s %12s %12s %9s %9s'
          % ('cell', 'nInst', 'delta SESS', 'delta HOUR', 'shrink', 'sign kept'))
    for name, g in d.groupby('cell'):
        ds, dh = g.delta_session.mean(), g.delta_hour.mean()
        keep = int((np.sign(g.delta_hour) == np.sign(g.delta_session)).sum())
        print('   %-26s %7d %11.4f %11.4f %8.0f%% %6d/%d'
              % (name, len(g), ds, dh, 100 * (1 - abs(dh) / max(abs(ds), 1e-9)), keep, len(g)))
    print('\n   per-instrument sign consistency of the HOUR-matched delta:')
    for name, g in d.groupby('cell'):
        neg = int((g.delta_hour < 0).sum())
        print('   %-26s  negative on %d/%d   mean |t| %.2f'
              % (name, neg, len(g), g.t_hour.abs().mean()))


if __name__ == '__main__':
    run()
