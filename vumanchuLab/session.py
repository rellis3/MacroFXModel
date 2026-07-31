"""session.py — study the clock instead of controlling it away.

Every matched baseline in this lab stratifies on hour-of-day. That is correct
for isolating the indicator's contribution — but it means the lab has been
deliberately BLIND to session effects the whole time. If reversals genuinely
cluster around the London open or the New York handover, none of the earlier
work could have seen it.

This drops hour from the stratification (`use_hour=False`) and puts it on the
left-hand side instead. The baseline still controls volatility regime and
prior-move size, so a session result here is not just "London is more volatile".

TWO QUESTIONS
─────────────
  1. unconditional — does P(revert) itself vary by hour / session / weekday?
  2. conditional   — does the VMC signal's EDGE vary by session? A signal that
                     works only in the Asia range and not in the London trend
                     is a different animal from one that works everywhere.

The second matters more. The first is largely a fact about liquidity.

  python vumanchuLab/session.py --instrument gold
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.labcommon import add_context, get_panel, score  # noqa: E402

# UTC hour ranges. Approximate and deliberately simple — the point is whether
# the effect moves at all, not to pin an exact boundary.
SESSIONS = [
    ('Asia',        0, 7),
    ('London AM',   7, 11),
    ('London/NY',  11, 15),   # the overlap
    ('NY PM',      15, 20),
    ('Late',       20, 24),
]


def label_session(hours: pd.Series) -> pd.Series:
    out = pd.Series('?', index=hours.index)
    for name, lo, hi in SESSIONS:
        out[(hours >= lo) & (hours < hi)] = name
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='gold')
    a = ap.parse_args()

    df = add_context(get_panel(a.instrument))
    df['session'] = label_session(df['hour'].astype(int))
    df['dow'] = df.index.dayofweek

    print(f'\n{"="*86}')
    print(f'SESSION EFFECTS — {a.instrument}   (hour REMOVED from the baseline)')
    print(f'{len(df.dropna(subset=["reverted"])):,} rows · '
          f'uncond P(revert) {df["reverted"].mean():.4f}')
    print(f'{"="*86}')

    print('\n-- 1. does P(revert) itself vary by session? --')
    t = score(df, df['session'], min_n=2000, use_hour=False)
    print(t[['cell', 'n', 'value', 'base', 'delta', 't', 'consistent']].to_string(index=False))

    print('\n-- by UTC hour --')
    th = score(df, df['hour'].astype(int).astype(str), min_n=2000, use_hour=False)
    th['hr'] = th['cell'].astype(int)
    print(th.sort_values('hr')[['hr', 'n', 'delta', 't']].to_string(index=False))

    print('\n-- by weekday (0=Mon) --')
    td = score(df, df['dow'].astype(str), min_n=2000, use_hour=False)
    print(td[['cell', 'n', 'delta', 't']].to_string(index=False))

    print('\n-- 2. does the SIGNAL\'s edge vary by session? (the important one) --')
    for zone, name in ((-1, 'OVERSOLD'), (1, 'OVERBOUGHT')):
        sel = df['tf1_wt_zone'] == zone
        codes = pd.Series(np.where(sel, df['session'], 'other'), index=df.index)
        t2 = score(df, codes, min_n=1000, use_hour=False)
        t2 = t2[t2['cell'] != 'other']
        if t2.empty:
            continue
        order = [s[0] for s in SESSIONS if s[0] in set(t2['cell'])]
        t2 = t2.set_index('cell').reindex(order).reset_index()
        print(f'\n   WT {name} by session:')
        print(t2[['cell', 'n', 'delta', 't', 'consistent']].to_string(index=False))

    print(f'\n{"-"*86}')
    print('delta here is vs a baseline that controls volatility and prior-move size')
    print('but NOT hour — so a session effect is not simply "this session is busier".')
    print('-' * 86)


if __name__ == '__main__':
    main()
