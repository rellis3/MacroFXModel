"""volatility.py — predict the SIZE of the next move, not its direction.

WHY THIS EXISTS
───────────────
Three separate times this lab found "it's volatility, not direction" and filed
it as a disappointment:

  * WT+VWAP co-divergence on eurusd/nq — MAE as large as MFE
  * the larger excursion after co-divergence
  * wide-range bars clustering around signals

That was the wrong reading. Realised volatility is substantially more
predictable than direction — it clusters, it mean-reverts, it responds to
state. "A bigger move is coming, direction unclear" is real information: it
sets expectations, it says whether to be involved at all, and it is exactly
what a fade needs to know about the risk it is taking.

Nothing else in this lab predicts range. This asks the same conditioning
questions with the outcome swapped.

OUTCOMES
────────
  fwd_range   realised high-low range over the next h bars, in sigma units
  expansion   that range divided by the TRAILING range — >1 means the market
              got busier than it had been. This is the one to read: raw range
              is dominated by the volatility regime the bar sat in, and the
              baseline already controls for that, but the ratio is the
              cleaner question.
  fwd_absret  absolute move, ignoring direction

Same matched baseline (hour x vol x prior-move-size) and batch-means SEs as
every other study here, so the numbers are comparable to the direction ones.

  python vumanchuLab/volatility.py --instrument gold
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Redirecting stdout to a file makes Python pick the locale codec (cp1252 on
# Windows), which dies on the sigma/arrow glyphs this module prints. Force
# UTF-8 so `> out.txt` behaves the same as the console.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from vumanchuLab.labcommon import add_context, get_panel, score, tercile  # noqa: E402

CELLS = {
    'wt_zone':              ['tf1_wt_zone'],
    'stack_zone':           ['stack_zone'],
    'wt_zone x mf_sign':    ['tf1_wt_zone', 'tf1_mf_sign'],
    'wt_gap tercile':       ['tf1_wt_gap_pct_T'],
    'body_frac tercile':    ['tf1_body_frac_T'],
    'range_pct tercile':    ['tf1_range_pct_T'],
    'zone_touch_n':         ['tf1_zone_touch_n'],
    'wt_vel3 tercile':      ['tf1_wt_vel3_T'],
    'agree_zone_1v15':      ['agree_zone_1v15'],
}


def add_vol_outcomes(df: pd.DataFrame, horizons=(12, 36, 72)) -> pd.DataFrame:
    """Forward range / expansion / |return|. Labels — allowed to see the future."""
    hi, lo, c = df['high_r'], df['low_r'], df['close']
    sig = df['sigma'].to_numpy(float)
    out = df.copy()
    for h in horizons:
        fwd_hi = hi.rolling(h).max().shift(-h).to_numpy()
        fwd_lo = lo.rolling(h).min().shift(-h).to_numpy()
        rng = (fwd_hi - fwd_lo) / c.to_numpy()
        trail = ((hi.rolling(h).max() - lo.rolling(h).min()) / c).to_numpy()
        with np.errstate(divide='ignore', invalid='ignore'):
            out[f'fwd_range_{h}'] = rng / (sig * np.sqrt(h))
            out[f'expansion_{h}'] = np.where(trail > 0, rng / trail, np.nan)
            out[f'fwd_absret_{h}'] = np.abs(
                (c.shift(-h) / c - 1.0).to_numpy()) / (sig * np.sqrt(h))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='gold')
    ap.add_argument('--horizon', type=int, default=36)
    ap.add_argument('--outcome', default='expansion',
                    choices=['expansion', 'fwd_range', 'fwd_absret'])
    a = ap.parse_args()

    print(f'Loading {a.instrument} ...')
    p = get_panel(a.instrument)
    # The panel keeps close but not high/low; rebuild them off the M1 grid.
    from vumanchuLab.panel import load_m1, resample
    base = resample(load_m1(a.instrument), 1).reindex(p.index)
    p['high_r'], p['low_r'] = base['high'], base['low']
    df = add_vol_outcomes(add_context(p), horizons=(a.horizon,))
    for f in ('tf1_wt_gap_pct', 'tf1_body_frac', 'tf1_range_pct', 'tf1_wt_vel3'):
        if f in df.columns:
            df[f + '_T'] = tercile(df[f])

    col = f'{a.outcome}_{a.horizon}'
    d = df.dropna(subset=[col])
    print(f'  {len(d):,} rows · outcome {col} · mean {d[col].mean():.3f}')

    print(f'\n{"="*88}')
    print(f'CAN VMC STATE PREDICT THE SIZE OF THE NEXT MOVE? — {a.instrument}, '
          f'{a.horizon*5}m forward')
    print(f'outcome = {a.outcome}   (expansion > 1 means busier than the trailing window)')
    print(f'{"="*88}')

    any_hit = False
    for name, by in CELLS.items():
        if not all(b in df.columns for b in by):
            continue
        codes = df[by[0]].astype(str) if len(by) == 1 else \
            df[by[0]].astype(str) + '|' + df[by[1]].astype(str)
        t = score(df, codes, outcome=col, min_n=500)
        if t.empty:
            continue
        hits = t[(t['t'].abs() >= 2) & t['consistent']]
        any_hit |= len(hits) > 0
        print(f'\n-- {name} --')
        print(t.head(5).to_string(index=False))
        if len(hits):
            print(f'   -> {len(hits)} cell(s) |t|>=2 AND IS/OOS-consistent')

    print(f'\n{"-"*88}')
    print('delta = cell mean minus its matched baseline. For `expansion`, a positive')
    print('delta means the market got BUSIER than usual from that state — a')
    print('directionless but genuinely useful read.')
    if not any_hit:
        print('NOTE: nothing cleared |t|>=2 with IS/OOS consistency here.')
    print('-' * 88)


if __name__ == '__main__':
    main()
