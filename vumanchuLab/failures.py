"""failures.py — condition on the times the signal was WRONG.

Every other study here conditions on the signal and averages the outcome. That
tells you the tilt. It cannot tell you what a filter should look like, because
the losers are averaged in with the winners.

This inverts it: take the strongest known state (WT stretched), split into the
cases where price DID revert and the cases where it kept going, and ask what
was different at the moment of entry. Anything that separates them is a
candidate filter — and anything that doesn't is worth knowing too, because it
means the failures are not distinguishable in advance.

READING IT HONESTLY
───────────────────
This is a SEARCH over ~20 features on a pre-selected subset, so a couple of
separations at |z|>2 are expected by chance and the count is printed. A real
filter should also be checkable the other way round: if feature F separates
winners from losers, then conditioning the ORIGINAL signal on F should raise
its delta. That confirmation is run automatically for the top candidates,
which is the step that turns "these differ" into "this would have helped".

  python vumanchuLab/failures.py --instrument gold
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.labcommon import add_context, get_panel, score, tercile  # noqa: E402

FEATURES = [
    'tf1_body_frac', 'tf1_upper_wick', 'tf1_lower_wick', 'tf1_close_pos',
    'tf1_range_pct', 'tf1_wt_gap_pct', 'tf1_wt_vel3', 'tf1_wt_vel10',
    'tf1_bars_since_zero', 'tf1_bars_since_cross', 'tf1_zone_touch_n',
    'tf1_mf', 'tf1_vwap_dist', 'tf1_wt1',
    'tf5_wt1', 'tf15_wt1', 'tf5_vwap_dist', 'tf15_vwap_dist',
    'stack_n_agree', 'sigma', 'prior_sig',
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='gold')
    ap.add_argument('--zone', type=int, default=-1, choices=[-1, 1],
                    help='-1 = study oversold signals, 1 = overbought')
    a = ap.parse_args()

    df = add_context(get_panel(a.instrument))
    sig = df[(df['tf1_wt_zone'] == a.zone) & df['reverted'].notna()].copy()
    won = sig['reverted'] == 1.0
    lost = ~won
    name = 'OVERSOLD' if a.zone == -1 else 'OVERBOUGHT'

    print(f'\n{"="*94}')
    print(f'WHAT SEPARATED THE WINNERS FROM THE LOSERS? — {a.instrument}, WT {name}')
    print(f'{len(sig):,} signals · reverted {int(won.sum()):,} ({100*won.mean():.1f}%) · '
          f'continued {int(lost.sum()):,}')
    print(f'{"="*94}\n')

    rows = []
    for f in FEATURES:
        if f not in sig.columns:
            continue
        v = sig[f].astype(float)
        w, l = v[won].dropna(), v[lost].dropna()
        if len(w) < 200 or len(l) < 200:
            continue
        mw, ml = float(w.mean()), float(l.mean())
        se = float(np.sqrt(w.var(ddof=1) / len(w) + l.var(ddof=1) / len(l)))
        pooled = float(np.sqrt((w.var(ddof=1) + l.var(ddof=1)) / 2))
        rows.append({
            'feature': f,
            'when_reverted': round(mw, 4),
            'when_continued': round(ml, 4),
            'diff': round(mw - ml, 4),
            'z': round((mw - ml) / se, 2) if se > 0 else np.nan,
            'effect_d': round((mw - ml) / pooled, 3) if pooled > 0 else np.nan,
        })
    t = pd.DataFrame(rows)
    t = t.reindex(t['z'].abs().sort_values(ascending=False).index)
    print(t.to_string(index=False))

    n_tested = len(t)
    exp = n_tested * 2 * (1 - 0.9772)
    hits = t[t['z'].abs() >= 2]
    print(f'\n  {n_tested} features tested; ~{exp:.1f} expected at |z|>=2 by chance; '
          f'{len(hits)} observed.')
    print('  effect_d is Cohen\'s d — with ~100k signals almost anything clears |z|=2,')
    print('  so read effect_d. Below ~0.1 the separation is real but tiny.')

    # --- the confirmation step: does conditioning on it actually help? -------
    print(f'\n-- CONFIRMATION: does splitting the signal on these RAISE its delta? --')
    base_t = score(df, (df['tf1_wt_zone'] == a.zone).map({True: 'signal', False: 'other'}),
                   min_n=400)
    b = base_t[base_t['cell'] == 'signal']
    base_delta = float(b['delta'].iloc[0]) if len(b) else np.nan
    print(f'   unconditional {name} delta = {100*base_delta:+.2f}pp\n')

    top = t.reindex(t['effect_d'].abs().sort_values(ascending=False).index).head(5)
    for _, r in top.iterrows():
        f = r['feature']
        if f not in df.columns:
            continue
        d2 = df.copy()
        d2['_T'] = tercile(d2[f].astype(float))
        sel = d2['tf1_wt_zone'] == a.zone
        codes = np.where(sel, 'sig|T' + d2['_T'].astype(str), 'other')
        tt = score(d2, pd.Series(codes, index=d2.index), min_n=400)
        tt = tt[tt['cell'].str.startswith('sig|')]
        if tt.empty:
            continue
        best = tt.reindex(tt['delta'].abs().sort_values(ascending=False).index).iloc[0]
        lift = 100 * (abs(float(best['delta'])) - abs(base_delta))
        print(f'   {f:<24} best tercile {best["cell"][-2:]}  '
              f'delta {100*float(best["delta"]):+6.2f}pp (n {int(best["n"]):,})  '
              f'vs {100*base_delta:+.2f}pp  ->  {lift:+.2f}pp')

    print(f'\n{"-"*94}')
    print('A candidate filter is only real if the last column is meaningfully positive')
    print('AND the tercile that helps makes mechanical sense. A separation that does')
    print('not raise the delta is a difference between the groups, not a filter.')
    print('-' * 94)


if __name__ == '__main__':
    main()
