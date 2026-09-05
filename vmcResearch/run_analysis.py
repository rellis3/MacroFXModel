"""run_analysis.py - score every state against both outcome families, per instrument.

Writes one long-format result table per instrument so the pooling step can ask
the only question that really matters for a study with this many cells: does a
state replicate on instruments it was not found on?

TWO OUTCOMES, DELIBERATELY DIFFERENT
------------------------------------
dir20   mean forward return over 20 M5 bars (100 min) in sigma units. Signed
        by actual price direction, so a cell whose label says bullish must
        come out positive. Answers "does this state predict direction".

cont48  P(the prevailing move extends before it retraces), among rows where
        one of the two barriers was actually touched inside 4h. Answers the
        brief's question - continue or reverse - and unlike raw direction it
        has a stable base rate to beat.

No striding. Event cells (a cross is one bar wide) would lose 5 of every 6
occurrences to a stride and the rare-cell results would be sampling noise.

  python vmcResearch/run_analysis.py --instruments eurusd,gbpusd,...
"""
from __future__ import annotations

import argparse
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vmcResearch import cells as C  # noqa: E402
from vmcResearch import events  # noqa: E402
from vmcResearch.stats import Scorer, fmt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')


def build_cells(p):
    """All sections, tagged so the report can be assembled by brief section."""
    out = {}
    out.update(C.all_single_tf(p))
    out.update(C.mtf_alignment(p))
    out.update(C.pullback_sequence(p))
    for tf in C.TFS:
        out.update(C.price_vs_mf(p, tf))
        out.update(C.divergence_context(p, tf))
    return out


def phase_conditioned(p, base_cells):
    """The brief's core thesis: the same state means different things in
    different regimes. Re-scored inside each phase, so a state that is null
    pooled can still show up where it is supposed to work."""
    ph = p['phase'].to_numpy()
    keep = ('tf5/cross=', 'tf15/cross=', 'tf5/zone=', 'tf15/zone=', 'tf60/zone=',
            'tf5/div=', 'tf15/div=', 'tf60/div=', 'tf5/mf=', 'tf5/vwap=', 'mtf=')
    out = {}
    for pcode, pname in ((1, 'impulse'), (2, 'pullback'), (0, 'range'), (3, 'broken')):
        pm = ph == pcode
        for lbl, m in base_cells.items():
            if lbl.startswith(keep):
                out['%s@%s' % (lbl, pname)] = m & pm
    return out


def run_one(inst, min_n=400, null_shuffles=8, verbose=True):
    t0 = time.time()
    p = pd.read_parquet(os.path.join(DATA, 'panel_%s.parquet' % inst))
    p = events.add_events(p)

    base = build_cells(p)
    allc = dict(base)
    allc.update(phase_conditioned(p, base))

    r48 = p['resolve_48'].to_numpy()
    cont = np.where(r48 == 1, 1.0, np.where(r48 == -1, 0.0, np.nan))

    frames = []
    for oname, y in (('dir20', p['fwd_sig_20'].to_numpy(float)), ('cont48', cont)):
        sc = Scorer(p, y, min_n=min_n)
        df = sc.scan(allc)
        if df.empty:
            continue
        df['outcome'] = oname
        df['instrument'] = inst
        df['grand'] = sc.grand
        nt = sc.null_threshold({k: allc[k] for k in list(df['cell'])[:200]},
                               n_shuffles=null_shuffles)
        df['null_max_t_p90'] = nt['null_max_t_p90'] if isinstance(nt, dict) else np.nan
        frames.append(df)
        if verbose:
            print('  %-7s %d cells scored, null |t| p90 = %.2f'
                  % (oname, len(df), df['null_max_t_p90'].iloc[0]))

    res = pd.concat(frames, ignore_index=True)
    res.to_parquet(os.path.join(DATA, 'res_%s.parquet' % inst))
    if verbose:
        print('  [%s] %d rows in %.0fs' % (inst, len(res), time.time() - t0))
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='eurusd')
    ap.add_argument('--min-n', type=int, default=400)
    ap.add_argument('--null-shuffles', type=int, default=8)
    a = ap.parse_args()
    for inst in [s.strip() for s in a.instruments.split(',') if s.strip()]:
        print('[%s]' % inst)
        try:
            run_one(inst, min_n=a.min_n, null_shuffles=a.null_shuffles)
        except Exception as e:
            print('  FAILED: %r' % (e,))


if __name__ == '__main__':
    main()
