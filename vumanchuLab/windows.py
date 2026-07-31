"""windows.py — the two windows were chosen arbitrarily. Sweep them.

Every result in this lab uses a 60-minute prior move and a 60-minute forward
horizon. Both were picked on the first day and never revisited, which means
every number reported so far is conditional on one arbitrary cell of a 2-D
grid. If the effect only exists at 60/60 that is a fragility worth knowing; if
it is a broad plateau that is a robustness result.

Sweeps prior x horizon and reports the OS delta at each combination, plus
where the peak sits. Also reports the same for the stack cell.

READ THE SHAPE, NOT THE PEAK
────────────────────────────
The maximum of a swept grid is upward-biased by construction — it is the max of
many noisy estimates. A broad, smooth region of positive values is evidence; a
single hot cell surrounded by cold ones is noise. The output prints the whole
surface for exactly this reason, and the fraction of the grid that is positive
is the summary statistic worth reading.

  python vumanchuLab/windows.py --instrument gold
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.labcommon import add_context, get_panel, score  # noqa: E402

# Panel rows (stride 5) -> minutes = rows * 5
PRIORS = (3, 6, 12, 24, 48, 96)          # 15m .. 8h
HORIZONS = (15, 60, 240, 1440)           # the fwd_ret_* columns that exist


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='gold')
    ap.add_argument('--cell', default='wt_zone', choices=['wt_zone', 'stack_zone'])
    a = ap.parse_args()

    p = get_panel(a.instrument)
    col = 'tf1_wt_zone' if a.cell == 'wt_zone' else 'stack_zone'
    neg, pos = ('-1', '1') if a.cell == 'wt_zone' else ('-1.0', '1.0')

    print(f'\n{"="*84}')
    print(f'WINDOW SWEEP — {a.instrument}, cell = {a.cell}')
    print('rows = prior-move window, columns = forward horizon.  values = delta in pp')
    print(f'{"="*84}')

    for label, want in (('OVERSOLD / all-OS', neg), ('OVERBOUGHT / all-OB', pos)):
        grid = pd.DataFrame(index=[f'{r*5}m' for r in PRIORS],
                            columns=[f'{h}m' for h in HORIZONS], dtype=float)
        for pr in PRIORS:
            for h in HORIZONS:
                fcol = f'fwd_ret_{h}'
                if fcol not in p.columns:
                    continue
                df = add_context(p, prior_rows=pr, fwd_col=fcol)
                t = score(df, df[col].astype(str), min_n=400)
                r = t[t['cell'] == want]
                if len(r):
                    grid.loc[f'{pr*5}m', f'{h}m'] = round(100 * float(r['delta'].iloc[0]), 2)
        print(f'\n-- {label} --')
        print(grid.to_string())
        v = grid.to_numpy(dtype=float)
        v = v[np.isfinite(v)]
        if v.size:
            sign = np.sign(np.nanmedian(v))
            frac = float((np.sign(v) == sign).mean())
            print(f'   {int(frac*100)}% of the grid shares the median sign '
                  f'({"positive" if sign > 0 else "negative"}); '
                  f'median {np.median(v):+.2f}pp, max |{np.max(np.abs(v)):.2f}|')
            print('   A broad same-sign region is the evidence. A lone hot cell is not.')


if __name__ == '__main__':
    main()
