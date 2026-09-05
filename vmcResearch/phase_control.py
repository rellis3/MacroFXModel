"""phase_control.py - is the "@pullback" edge VuManChu, or just the pullback?

The main scan's matched baseline controls for session, volatility and
prior-move size, but NOT for the price phase. That gap shows up unmistakably in
the results: `zone=OS1@pullback` and `zone=OB2@pullback` both score about
+2.6pp, and oversold and overbought cannot both mean "more likely to continue".
What they have in common is not a VuManChu state - it is that both are subsets
of `phase == pullback`, which on its own is worth roughly +1.9pp.

So this rescores every phase-conditioned cell against the base rate INSIDE ITS
OWN PHASE. That subtracts the price-structure effect and leaves only what the
VuManChu state adds on top of it, which is the quantity the brief actually
asked about.

  python vmcResearch/phase_control.py
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vmcResearch import cells as C  # noqa: E402
from vmcResearch import events  # noqa: E402
from vmcResearch.run_analysis import build_cells, phase_conditioned  # noqa: E402
from vmcResearch.stats import N_BLOCKS, batch_means_se, make_blocks  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
INSTRUMENTS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf',
               'eurjpy', 'gbpjpy', 'audjpy', 'eurgbp', 'xauusd', 'nq']
PHASES = {'impulse': 1, 'pullback': 2, 'range': 0, 'broken': 3}


def run():
    rows = []
    for inst in INSTRUMENTS:
        f = os.path.join(DATA, 'panel_%s.parquet' % inst)
        if not os.path.exists(f):
            continue
        p = events.add_events(pd.read_parquet(f))
        base = build_cells(p)
        pc = phase_conditioned(p, base)
        ph = p['phase'].to_numpy()
        blocks = make_blocks(p.index, N_BLOCKS)

        r48 = p['resolve_48'].to_numpy()
        outcomes = {
            'cont48': np.where(r48 == 1, 1.0, np.where(r48 == -1, 0.0, np.nan)),
            'dir20': p['fwd_sig_20'].to_numpy(float),
        }

        for oname, y in outcomes.items():
            for pname, pcode in PHASES.items():
                inph = (ph == pcode) & np.isfinite(y)
                if inph.sum() < 2000:
                    continue
                # THE baseline: the phase's own rate, not the global one.
                phase_base = float(np.mean(y[inph]))
                for lbl, m in pc.items():
                    if not lbl.endswith('@' + pname):
                        continue
                    mm = m & np.isfinite(y)
                    if mm.sum() < 400:
                        continue
                    val = float(np.mean(y[mm]))
                    se = batch_means_se(y[mm] - phase_base, blocks[mm])
                    rows.append({
                        'instrument': inst, 'outcome': oname, 'phase': pname,
                        'cell': lbl, 'n': int(mm.sum()), 'value': val,
                        'phase_base': phase_base, 'delta': val - phase_base,
                        't': (val - phase_base) / se if se and se > 0 else np.nan,
                    })
        print('  [%s] done' % inst, flush=True)

    d = pd.DataFrame(rows)
    d.to_parquet(os.path.join(DATA, 'phase_controlled.parquet'))

    print('\nVuManChu edge measured INSIDE its own phase (price-structure removed)')
    for oname in ('cont48', 'dir20'):
        s = d[d.outcome == oname]
        if s.empty:
            continue
        g = s.groupby('cell').agg(n_inst=('delta', 'size'), med_n=('n', 'median'),
                                  mean_delta=('delta', 'mean'), sd=('delta', 'std'))
        g['cross_t'] = g['mean_delta'] / (g['sd'] / np.sqrt(g['n_inst']))
        cons = s.groupby('cell')['delta'].apply(lambda x: int((np.sign(x) == np.sign(x.mean())).sum()))
        g['consist'] = cons
        g = g[g.n_inst >= 10].reindex(g[g.n_inst >= 10]['mean_delta'].abs()
                                      .sort_values(ascending=False).index)
        print('\n=== %s : largest VuManChu effects WITHIN phase ===' % oname)
        print('  %-42s %8s %10s %8s %6s' % ('cell', 'med n', 'delta', 'crossT', 'sign'))
        for k, r in g.head(18).iterrows():
            print('  %-42s %8d %+10.4f %8.2f %3d/%-3d'
                  % (k[:42], r.med_n, r.mean_delta, r.cross_t, r.consist, r.n_inst))


if __name__ == '__main__':
    run()
