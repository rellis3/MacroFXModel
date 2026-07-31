"""export_table.py — freeze the lookup into a JSON artifact the live side reads.

THE ARCHITECTURE, AND WHY IT IS THIS WAY
────────────────────────────────────────
`PYTHON_LEGO.md` §3 and the `levelsV2` / `volatility_bot` precedent: the brain
is learned OFFLINE in one language and SHIPPED to the live side as a frozen
file. The live producer never recomputes it and never calls the研究 code.

Applied here:

    Python (offline)   panel -> conditional distributions -> this JSON
    JS (live)          vumanchuCore + vumanchuMtf compute the STATE, then
                       look the state's cell up in this table

The alternative — porting the lookup to JS — is exactly the bit-identical-port
drift bug the whole registry exists to prevent. The state COMPUTE already
exists in JS (`vumanchuCore`, already golden-tested against the Python brick),
so nothing needs porting: JS derives the cell key, Python owns the numbers.

WHAT THE TABLE CONTAINS
───────────────────────
One row per (instrument, horizon, level, cell):

    n                analogues behind the estimate
    p_revert         P(price reverts the prior move)
    baseline         matched (hour x vol x prior-move-size) rate
    delta_pp         the informative number
    years_same_sign  "9/11" — the stability read, because the SIZE of these
                     effects is demonstrably non-stationary while the SIGN
                     has been steady
    year_min/max_pp  the honest band

Cells below `min_n` are dropped rather than shipped with a fragile estimate.
The live side is expected to walk the levels tightest-first exactly like
`lookup.py` does, and to surface which level it matched at.

  python vumanchuLab/export_table.py --instruments eurusd,gold,nq
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.analyse import DATA  # noqa: E402
from vumanchuLab.lookup import LEVELS, enrich, matched_baseline  # noqa: E402

MIN_N = 300
HORIZONS = (30, 60, 240)


def cells_for(df: pd.DataFrame, cols: list[str], min_n: int):
    st = (df['hour'].astype(int) * 100 + df['vol_bucket'].astype(int) * 10
          + df['prior_bucket'].astype(int))
    glob = df['reverted'].groupby(st).mean()
    out = []
    for key, idx in df.groupby(cols, dropna=True).groups.items():
        m = pd.Series(False, index=df.index)
        m.loc[idx] = True
        n = int(m.sum())
        if n < min_n:
            continue
        w = st[m].value_counts(normalize=True)
        common = w.index.intersection(glob.index)
        if not len(common):
            continue
        base = float((glob.loc[common] * w.loc[common]).sum() / w.loc[common].sum())
        p = float(df.loc[m, 'reverted'].mean())
        sub = df[m]
        yrs = []
        for yr, g in sub.groupby(sub.index.year):
            if len(g) >= 40:
                yrs.append(100 * (float(g['reverted'].mean()) - base))
        keyv = key if isinstance(key, tuple) else (key,)
        out.append({
            'cell': '|'.join(str(k) for k in keyv),
            'n': n,
            'p_revert': round(p, 4),
            'baseline': round(base, 4),
            'delta_pp': round(100 * (p - base), 2),
            'years': len(yrs),
            'years_same_sign': int(sum(1 for d in yrs if np.sign(d) == np.sign(p - base))),
            'year_min_pp': round(min(yrs), 2) if yrs else None,
            'year_max_pp': round(max(yrs), 2) if yrs else None,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='eurusd,gold,nq')
    ap.add_argument('--horizons', default=','.join(str(h) for h in HORIZONS))
    ap.add_argument('--prior', type=int, default=60)
    ap.add_argument('--min-n', type=int, default=MIN_N)
    ap.add_argument('--out', default=os.path.join(DATA, 'vumanchu_state_table.json'))
    a = ap.parse_args()

    table = {
        '_generated_by': 'vumanchuLab/export_table.py',
        '_contract': ('JS computes the state via vumanchuCore/vumanchuMtf and looks the '
                      'cell up here, walking levels tightest-first. It must surface which '
                      'level matched and the n behind it. Never recompute these numbers '
                      'in JS.'),
        '_outcome': 'P(price reverts the prior `prior_min` move over the next `horizon` min)',
        '_read': ('delta_pp is the informative number; p_revert alone is meaningless '
                  'without its matched baseline. years_same_sign is the stability read — '
                  'the SIGN of these effects has been stable, the SIZE has not.'),
        'prior_min': a.prior,
        'levels': [{'id': lab.split()[0], 'label': lab, 'keys': cols}
                   for lab, cols in LEVELS],
        'instruments': {},
    }

    for inst in [s.strip() for s in a.instruments.split(',') if s.strip()]:
        p = os.path.join(DATA, f'panel_{inst}.parquet')
        if not os.path.exists(p):
            print(f'!! no panel for {inst}, skipping'); continue
        table['instruments'][inst] = {}
        for h in (int(x) for x in a.horizons.split(',')):
            print(f'  {inst} h={h}m ...', end='', flush=True)
            df = enrich(inst, h, a.prior)
            block = {'uncond_p_revert': round(float(df['reverted'].mean()), 4),
                     'rows': len(df), 'levels': {}}
            total = 0
            for lab, cols in LEVELS:
                if not all(c in df.columns for c in cols):
                    continue
                rows = cells_for(df, cols, a.min_n)
                block['levels'][lab.split()[0]] = rows
                total += len(rows)
            table['instruments'][inst][str(h)] = block
            print(f' {total} cells')

    with open(a.out, 'w') as fh:
        json.dump(table, fh, separators=(',', ':'))
    print(f'\nwrote {a.out} ({os.path.getsize(a.out)/1024:.0f} KB)')


if __name__ == '__main__':
    main()
