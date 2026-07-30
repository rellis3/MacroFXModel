"""sweep_size.py — does the reversal definition change the answer?

`events.py` calls a reversal "the extreme of a +/-`pivot_bars` window with a
move of >= `min_swing` sigma both into and out of it". Both numbers are a
choice, and the honest response to "we only want reversals above a certain
size" is to sweep them rather than defend one setting.

Reports, per (pivot window x min_swing):
  * how many reversals qualify, and their MEDIAN ACTUAL SIZE IN PIPS/POINTS, so
    the threshold is tangible rather than an abstract sigma
  * the headline lifts, so you can see whether the conclusions hold as the bar
    is raised to only large, unambiguous turns

The specific worry worth testing: divergences might genuinely mark BIG
reversals while being noise at small ones. Pooling every 1-sigma wiggle would
hide that. This is the disaggregation `CLAUDE.md` asks for before declaring a
null — with the multiple-testing caveat that sweeping 12 cells and picking the
best is exactly how noise gets promoted.

  python vumanchuLab/sweep_size.py --instrument eurusd
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.events import (  # noqa: E402
    build_events, component_frame, contrast, describe_events,
)
from pylego.instruments import asset_class, pip_size  # noqa: E402

WATCH = [
    'wt_stretched',        # the only reversal-marking feature found so far
    'wt_cross_back',       # the counter-intuitive continuation marker
    'div_wt_warns',        # divergence arguing the move is exhausted
    'div_wt_regular',
    'div_wt_hidden',
    'div_vwap_warns',
    'mf_against',
]


def swing_pips(close: np.ndarray, idx: np.ndarray, k: int, pip: float) -> float:
    """Median realised size of the qualifying turns, in pips/points: the larger
    of the swing in and the swing out."""
    if len(idx) == 0:
        return float('nan')
    into = np.abs(close[idx] - close[idx - k])
    out = np.abs(close[np.minimum(idx + k, len(close) - 1)] - close[idx])
    return float(np.median(np.maximum(into, out)) / pip)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='eurusd')
    ap.add_argument('--event-tf', type=int, default=5)
    ap.add_argument('--pivots', default='12,36')          # 1h and 3h windows
    ap.add_argument('--swings', default='1.0,1.5,2.0,3.0')
    ap.add_argument('--start', default=None)
    a = ap.parse_args()

    df, series = component_frame(a.instrument, a.event_tf, start=a.start)
    close = series['close']
    sigma = df['sigma'].to_numpy(float)
    pip = pip_size(a.instrument)
    unit = 'pips' if asset_class(a.instrument) == 'fx' else 'pts'

    rows = []
    for k in (int(x) for x in a.pivots.split(',')):
        for ms in (float(x) for x in a.swings.split(',')):
            (ri, rd), (ci, cd) = build_events(close, series['high'], series['low'],
                                              sigma, k, ms)
            if len(ri) < 200:
                print(f'  skip pivot={k} swing={ms}: only {len(ri)} reversals')
                continue
            rev = describe_events(df, series, ri, -rd, k)
            con = describe_events(df, series, ci, cd, k)
            if rev.empty or con.empty:
                continue
            c = contrast(rev, con, WATCH).set_index('feature')
            row = {'pivot_bars': k, 'window_min': k * a.event_tf, 'min_swing_sig': ms,
                   'n_rev': len(rev), 'n_con': len(con),
                   f'median_size_{unit}': round(swing_pips(close, ri, k, pip), 1)}
            for f in WATCH:
                row[f] = c.loc[f, 'lift'] if f in c.index else np.nan
                row[f + '_z'] = c.loc[f, 'z'] if f in c.index else np.nan
            # The "2 of 3 parts" reading, swept alongside.
            pr = float((rev['n_components'] == 2).mean())
            pc = float((con['n_components'] == 2).mean())
            row['two_parts'] = round(pr / pc, 3) if pc > 0 else np.nan
            rows.append(row)

    out = pd.DataFrame(rows)
    lift_cols = ['n_rev', f'median_size_{unit}'] + WATCH + ['two_parts']

    print(f'\n{"="*104}')
    print(f'REVERSAL-SIZE SWEEP — {a.instrument} ({asset_class(a.instrument)}), '
          f'{a.event_tf}m grid')
    print('lift = P(feature | REVERSAL) / P(feature | CONTINUATION); 1.00 = no discrimination')
    print(f'{"="*104}\n')
    print(out[['pivot_bars', 'window_min', 'min_swing_sig'] + lift_cols].to_string(index=False))

    print(f'\n-- the same, with z-scores for the divergence question --')
    zc = ['div_wt_warns', 'div_wt_warns_z', 'div_wt_regular', 'div_wt_regular_z',
          'div_wt_hidden', 'div_wt_hidden_z']
    print(out[['pivot_bars', 'min_swing_sig', 'n_rev'] + zc].to_string(index=False))

    print(f'\nREAD: if a lift only appears at one (pivot, swing) setting it is a slice of')
    print(f'noise — {len(out)} settings were swept, so ~{len(out)*2*0.0228:.1f} would show |z|>2 by chance.')


if __name__ == '__main__':
    main()
