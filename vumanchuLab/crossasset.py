"""crossasset.py — does a VuManChu state mean the same thing on FX, gold and an
index? And is any of it larger than the cost of acting on it?

TWO QUESTIONS, DELIBERATELY SEPARATED
─────────────────────────────────────
1. TRANSFER. Same cell, same horizon, one column per instrument. A state that
   "works" only on the instrument it was found on is a slice of noise; one that
   holds sign and rough size across asset classes is structure. Reported as
   delta vs each instrument's OWN matched baseline, so an index's upward drift
   cannot flatter it.

2. ECONOMICS. `mean_ret_sig` is in sigma units, which makes cells comparable
   but hides whether the move would survive a spread. This converts each cell's
   mean forward move into pips/points and puts the round-trip cost next to it,
   using the SAME per-asset-class defaults the live bots size off
   (`pylego.costs.DEFAULT_SPREAD_PIPS`) and the canonical pip table. No
   strategy is simulated — this is a floor check. A cell whose mean move is
   below cost cannot be traded directionally on its own no matter how
   significant it is; that is a statement about magnitude, not about whether
   the structure is real.

  python vumanchuLab/crossasset.py
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.analyse import CELL_SETS, DATA, conditional_table  # noqa: E402
from pylego.costs import DEFAULT_SPREAD_PIPS  # noqa: E402
from pylego.instruments import asset_class, pip_size  # noqa: E402

# The cells worth carrying across instruments — the fast-timeframe read, the
# money-flow leg, and the multi-timeframe stack the engine was asked for.
HEADLINE = {
    'wt_zone': ['tf1_wt_zone'],
    'mf_sign': ['tf1_mf_sign'],
    'wt_zone x mf_sign': ['tf1_wt_zone', 'tf1_mf_sign'],
    'stack_side': ['stack_side'],
    'stack_zone': ['stack_zone'],
}


def spread_pips(instrument: str) -> float:
    """Round-trip spread in pip units, from the shared per-asset-class table the
    live bots already size off — not a number invented here."""
    cls = asset_class(instrument)
    if cls == 'fx' and 'jpy' in instrument:
        return DEFAULT_SPREAD_PIPS['fx_jpy']
    return DEFAULT_SPREAD_PIPS.get(cls, DEFAULT_SPREAD_PIPS['fx'])


def transfer_table(panels: dict, cell_name: str, by, horizon: int) -> pd.DataFrame:
    out = {}
    for name, p in panels.items():
        t = conditional_table(p, by, horizon)
        if t.empty:
            continue
        out[name] = t.set_index('cell')[['n', 'delta_pp', 't', 'consistent', 'mean_ret_sig']]
    if not out:
        return pd.DataFrame()
    cells = sorted(set().union(*[set(v.index) for v in out.values()]), key=str)
    rows = []
    for c in cells:
        row = {'cell': c}
        for name, t in out.items():
            if c in t.index:
                r = t.loc[c]
                row[f'{name}_d'] = r['delta_pp']
                row[f'{name}_t'] = r['t']
                row[f'{name}_ok'] = bool(r['consistent'])
            else:
                row[f'{name}_d'] = np.nan
        rows.append(row)
    df = pd.DataFrame(rows)
    dcols = [c for c in df.columns if c.endswith('_d')]
    # Transfers = same sign everywhere it is measurable, and measurable in >1.
    sgn = np.sign(df[dcols])
    df['transfers'] = (sgn.abs().sum(axis=1) > 1) & (sgn.sum(axis=1).abs() == sgn.abs().sum(axis=1))
    return df


def economics(panels: dict, horizon: int) -> pd.DataFrame:
    """Mean move of the strongest cells, in instrument units, vs round-trip cost."""
    rows = []
    for name, p in panels.items():
        px = float(p['close'].median())
        pip = pip_size(name)
        sp = spread_pips(name)
        # sigma is the per-base-bar return std; the move over `horizon` bars
        # scales with sqrt(horizon).
        sig_ret = float(p['sigma'].median()) * np.sqrt(horizon)
        sig_pips = sig_ret * px / pip
        for cname, by in HEADLINE.items():
            t = conditional_table(p, by, horizon)
            if t.empty:
                continue
            best = t.iloc[0]
            move_pips = abs(float(best['mean_ret_sig'])) * sig_pips
            rows.append({
                'instrument': name,
                'class': asset_class(name),
                'cell_set': cname,
                'best_cell': best['cell'],
                'delta_pp': best['delta_pp'],
                'sigma_h_pips': round(sig_pips, 1),
                'mean_move_pips': round(move_pips, 3),
                'roundtrip_cost_pips': sp,
                'move_vs_cost': round(move_pips / sp, 2) if sp else np.nan,
            })
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='eurusd,gold,nq')
    ap.add_argument('--horizons', default='60,240')
    ap.add_argument('--data', default=DATA)
    a = ap.parse_args()

    names = [s.strip() for s in a.instruments.split(',') if s.strip()]
    panels = {}
    for n in names:
        p = os.path.join(a.data, f'panel_{n}.parquet')
        if os.path.exists(p):
            panels[n] = pd.read_parquet(p)
        else:
            print(f'!! missing panel for {n}')
    if not panels:
        return

    for horizon in (int(x) for x in a.horizons.split(',')):
        print(f'\n{"="*100}')
        print(f'TRANSFER ACROSS ASSET CLASSES — P(up) delta vs each instrument\'s own '
              f'matched baseline, h={horizon}m')
        print(f'{"="*100}')
        for cname, by in HEADLINE.items():
            df = transfer_table(panels, cname, by, horizon)
            if df.empty:
                continue
            print(f'\n-- {cname} --')
            print(df.to_string(index=False))

    print(f'\n{"="*100}')
    print('ECONOMIC FLOOR — is the mean move bigger than the spread it must cross?')
    print(f'{"="*100}')
    for horizon in (int(x) for x in a.horizons.split(',')):
        e = economics(panels, horizon)
        if e.empty:
            continue
        print(f'\n-- h={horizon}m --')
        print(e.to_string(index=False))
        tradeable = e[e['move_vs_cost'] >= 1.0]
        print(f'   cells whose mean move clears round-trip cost: {len(tradeable)}/{len(e)}')
    print('\nmove_vs_cost < 1 means the average move is smaller than the spread — the')
    print('structure can be real and still not be directly tradeable on its own.')


if __name__ == '__main__':
    main()
