"""sommi.py - the two Cipher B components this repo never implemented.

VuManChu Cipher B ships two explicitly MULTI-TIMEFRAME reversal signals that
`js/vumanchuCore.js` does not implement, so nothing in the main study could
have tested them. They are the best structural fit for "uses multi-timeframe
to call reversals", which is why they are here.

SOMMI FLAG (Pine `f_findSommiFlag`)
  bearish when, on the HTF: WT is above the overbought level, the WT VWAP
  component is falling, and the current timeframe shows a bearish WT cross
  while its own VWAP is negative. Bullish is the mirror.

SOMMI DIAMOND (Pine `f_findSommiDiamond`)
  bearish when TWO higher timeframes both sit above zero on WaveTrend and the
  current timeframe prints a bearish cross from overbought. Bullish mirrors.

Both are reproduced from the published Pine logic rather than ported from code
in this repo, since no code here implements them. They are causal: every HTF
input is step-held by bar CLOSE via `align_htf_causal`, the same discipline the
rest of the panel uses.

Tested with the STRUCTURAL label, not the barrier race - `structural.py`
established that the barrier race was the wrong question for reversal calling.

  python vmcResearch/sommi.py --instruments eurusd,xauusd,nq
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
from vmcResearch.structural import label_swings  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')

OB, OS = 53.0, -53.0


def sommi_flag(p, cur_tf, htf):
    """Bearish -1 / bullish +1 / none 0, per the Pine flag definition."""
    wt1_h = p['tf%d_wt1' % htf].to_numpy(float)
    vw_h = p['tf%d_vwap_dist' % htf].to_numpy(float)
    vw_h_prev = np.concatenate([[np.nan], vw_h[:-1]])
    sp_c = p['tf%d_wt_spread' % cur_tf].to_numpy(float)
    sp_c_prev = np.concatenate([[np.nan], sp_c[:-1]])
    vw_c = p['tf%d_vwap_dist' % cur_tf].to_numpy(float)

    cross_dn = (sp_c < 0) & (sp_c_prev >= 0)
    cross_up = (sp_c > 0) & (sp_c_prev <= 0)

    bear = (wt1_h > OB) & (vw_h < vw_h_prev) & cross_dn & (vw_c < 0)
    bull = (wt1_h < OS) & (vw_h > vw_h_prev) & cross_up & (vw_c > 0)
    return np.where(bear, -1, np.where(bull, 1, 0)).astype(np.int8)


def sommi_diamond(p, cur_tf, htf1, htf2):
    """Bearish -1 / bullish +1 / none 0, per the Pine diamond definition."""
    w1 = p['tf%d_wt1' % htf1].to_numpy(float)
    w2 = p['tf%d_wt1' % htf2].to_numpy(float)
    wc = p['tf%d_wt1' % cur_tf].to_numpy(float)
    sp = p['tf%d_wt_spread' % cur_tf].to_numpy(float)
    sp_prev = np.concatenate([[np.nan], sp[:-1]])

    cross_dn = (sp < 0) & (sp_prev >= 0)
    cross_up = (sp > 0) & (sp_prev <= 0)

    bear = (w1 > 0) & (w2 > 0) & cross_dn & (wc > OB)
    bull = (w1 < 0) & (w2 < 0) & cross_up & (wc < OS)
    return np.where(bear, -1, np.where(bull, 1, 0)).astype(np.int8)


def evaluate(instrument):
    from vmcResearch import events
    f = os.path.join(DATA, 'panel_%s.parquet' % instrument)
    if not os.path.exists(f):
        return None
    p = events.add_events(pd.read_parquet(f), horizons=(48,))

    sigs = {
        'flag 5m/1h': sommi_flag(p, 5, 60),
        'flag 15m/4h': sommi_flag(p, 15, 240),
        'flag 5m/15m': sommi_flag(p, 5, 15),
        'diamond 5m/1h+4h': sommi_diamond(p, 5, 60, 240),
        'diamond 15m/1h+4h': sommi_diamond(p, 15, 60, 240),
    }

    sw = label_swings(p)
    idx = sw['idx'].to_numpy()
    major = sw['major'].to_numpy().astype(float)
    is_high = sw['is_high'].to_numpy()
    base = float(major.mean())

    # A signal is "live" if it fired within the last hour (12 M5 bars) — a
    # trader does not require it on the exact pivot bar.
    print('\n%s   swings %s   base P(THE high) = %.3f'
          % (instrument.upper(), format(len(sw), ','), base))
    print('  %-20s %8s %10s %9s %8s' % ('signal', 'n fired', 'P(major)', 'lift', 't'))

    blocks = make_blocks(p.index, N_BLOCKS)
    rows = []
    for nm, s in sigs.items():
        live = pd.Series(np.where(s != 0, s, np.nan)).ffill(limit=12).fillna(0).to_numpy()
        at = live[idx]
        # The signal must point the right way for the pivot: bearish at a high,
        # bullish at a low. A signal that fires the wrong way is not a hit.
        agree = np.where(is_high, at < 0, at > 0)
        n = int(agree.sum())
        if n < 100:
            print('  %-20s %8d   (too few to test)' % (nm, n))
            continue
        pm = float(major[agree].mean())
        se = batch_means_se(major[agree] - base, blocks[idx][agree])
        t = (pm - base) / se if se and se > 0 else np.nan
        print('  %-20s %8s %10.3f %9.2fx %8.2f'
              % (nm, format(n, ','), pm, pm / base if base > 0 else 0, t if np.isfinite(t) else 0))
        rows.append({'instrument': instrument, 'signal': nm, 'n': n,
                     'p_major': pm, 'base': base, 'lift': pm / base, 't': t})
    return pd.DataFrame(rows)


def run(instruments):
    out = [r for i in instruments if (r := evaluate(i)) is not None and len(r)]
    if len(out) > 1:
        d = pd.concat(out, ignore_index=True)
        g = d.groupby('signal').agg(mean_lift=('lift', 'mean'), n_inst=('lift', 'size'),
                                    total_n=('n', 'sum'),
                                    consistent=('lift', lambda x: int((x > 1).sum())))
        print('\n' + '=' * 66)
        print('POOLED - do the Sommi signals beat the base rate everywhere?')
        print('=' * 66)
        print('  %-20s %10s %9s %8s %s' % ('signal', 'mean lift', 'total n', 'nInst', '>1 on'))
        for k, r in g.sort_values('mean_lift', ascending=False).iterrows():
            print('  %-20s %9.2fx %9s %8d %d/%d'
                  % (k, r['mean_lift'], format(int(r['total_n']), ','), r['n_inst'],
                     r['consistent'], r['n_inst']))
        d.to_parquet(os.path.join(DATA, 'sommi.parquet'))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='eurusd,xauusd,nq')
    a = ap.parse_args()
    run([s.strip() for s in a.instruments.split(',') if s.strip()])
