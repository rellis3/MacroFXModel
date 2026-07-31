"""discover.py — unguided search: enumerate the condition space, then make
survival hard enough that what comes out the other end is worth reading.

WHY THIS EXISTS
───────────────
Every earlier slice tested a hypothesis somebody framed by hand. That does not
scale and it biases the search toward whatever a human happened to notice on a
chart. This module enumerates thousands of conditions automatically and lets
the data nominate the interesting ones.

THE PROBLEM WITH DOING THAT NAIVELY
───────────────────────────────────
Search hard enough over a wide space and you WILL find cells with |t| > 3. At
2,000 candidates, ~45 clear |t| >= 2 by chance alone. A ranked list of "top
findings" from an unguarded sweep is a list of noise sorted by luck.

So the bar is a FUNNEL, and every stage is a genuine holdout:

  stage 0   enumerate — singles, then pairs, on the discovery instrument
  stage 1   IN-SAMPLE (first 60% by time): |t| >= t_in
  stage 2   OUT-OF-SAMPLE (last 40%, never touched in stage 1): same sign,
            and |t| >= t_out
  stage 3   CROSS-INSTRUMENT: same sign on BOTH other instruments, which were
            never used to select anything

A cell that clears all three has survived a time holdout and two independent
markets. The report prints the chance expectation at every stage next to the
actual count — if survivors ≈ expectation, the honest headline is "nothing
here", and the module says so itself rather than presenting the top of a
ranked list as a discovery.

WHAT IT SEARCHES
────────────────
Discrete VMC state (WT side/dir/zone per timeframe, MF sign/slope, VWAP slope,
the agreement modes, the stack reads) plus continuous features cut into
terciles (WT level, MF, VWAP distance, bars-since-cross, realised vol), as
singles and as all pairs. Outcome is REVERT-vs-CONTINUE against the prior
move, scored on a baseline stratified by hour x vol x prior-move-size.

  python vumanchuLab/discover.py --discover gold --confirm eurusd,nq
"""
from __future__ import annotations

import argparse
import itertools
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.analyse import DATA  # noqa: E402

PRIOR_ROWS = 12       # panel rows (stride 5 => 12 rows = 60 min)
FWD = 'fwd_ret_60'
MIN_PRIOR = 0.5       # sigma; below this "revert" is meaningless
MIN_N = 400
N_BLOCKS = 40
IS_FRAC = 0.6
MAX_CELLS_PER_PAIR = 40

DISCRETE = [
    'tf1_wt_side', 'tf1_wt_dir', 'tf1_wt_zone', 'tf1_mf_sign', 'tf1_mf_slope',
    'tf1_vwap_slope', 'tf5_wt_side', 'tf5_wt_zone', 'tf15_wt_side', 'tf15_wt_zone',
    'agree_direction_1v5', 'agree_level_1v5', 'agree_zone_1v5',
    'agree_level_1v15', 'agree_zone_1v15',
    'stack_side', 'stack_zone', 'stack_n_agree',
]
CONTINUOUS = ['tf1_wt1', 'tf1_mf', 'tf1_vwap_dist', 'tf1_bars_since_cross',
              'tf15_wt1', 'tf15_vwap_dist', 'sigma']


def prepare(path: str) -> pd.DataFrame:
    df = pd.read_parquet(path)
    c = df['close']
    sig = df['sigma'].to_numpy(float)
    with np.errstate(divide='ignore', invalid='ignore'):
        prior = (c / c.shift(PRIOR_ROWS) - 1.0).to_numpy() / (sig * np.sqrt(PRIOR_ROWS * 5))
    df['prior_sig'] = prior
    fwd = df[FWD].to_numpy(float)
    rev = (np.sign(fwd) != np.sign(prior)).astype(float)
    rev[~np.isfinite(fwd) | ~np.isfinite(prior)] = np.nan
    rev[np.abs(prior) < MIN_PRIOR] = np.nan
    df['reverted'] = rev
    df['prior_bucket'] = (pd.Series(np.abs(prior), index=df.index)
                          .rolling(20000, min_periods=2000).rank(pct=True)
                          .mul(3).clip(0, 2.999).fillna(-1).astype(int))
    # terciles for the continuous features, causally ranked
    for f in CONTINUOUS:
        if f not in df.columns:
            continue
        df[f + '_T'] = (df[f].rolling(20000, min_periods=2000).rank(pct=True)
                        .mul(3).clip(0, 2.999).fillna(-1).astype(int))
    df = df.dropna(subset=['reverted'])
    return df


def strata(df: pd.DataFrame) -> pd.Series:
    return (df['hour'].astype(int) * 100
            + df['vol_bucket'].fillna(-1).astype(int) * 10
            + df['prior_bucket'].astype(int))


def score(df: pd.DataFrame, codes: pd.Series, min_n=MIN_N) -> pd.DataFrame:
    """delta vs matched baseline, with batch-means SE, for every cell of `codes`."""
    y = df['reverted']
    st = strata(df)
    glob = y.groupby(st).mean()
    blocks = pd.Series(np.minimum((np.arange(len(df)) * N_BLOCKS) // len(df), N_BLOCKS - 1),
                       index=df.index)
    rows = []
    for key, g in codes.groupby(codes).groups.items():
        m = pd.Series(False, index=df.index)
        m.loc[g] = True
        n = int(m.sum())
        if n < min_n:
            continue
        w = st[m].value_counts(normalize=True)
        common = w.index.intersection(glob.index)
        if not len(common):
            continue
        base = float((glob.loc[common] * w.loc[common]).sum() / w.loc[common].sum())
        p = float(y[m].mean())
        per = (y[m] - base).groupby(blocks[m]).mean().dropna()
        se = float(per.std(ddof=1) / np.sqrt(len(per))) if len(per) >= 5 else np.nan
        rows.append({'cell': str(key), 'n': n, 'delta': p - base,
                     't': (p - base) / se if se and se > 0 else np.nan})
    return pd.DataFrame(rows)


def candidates(df: pd.DataFrame):
    """Every single feature, then every pair. Yields (name, code series)."""
    feats = [f for f in DISCRETE if f in df.columns]
    feats += [f + '_T' for f in CONTINUOUS if f + '_T' in df.columns]
    for f in feats:
        yield f, df[f].astype(str)
    for a, b in itertools.combinations(feats, 2):
        combo = df[a].astype(str) + '|' + df[b].astype(str)
        if combo.nunique() <= MAX_CELLS_PER_PAIR:
            yield f'{a} × {b}', combo


def sweep(df: pd.DataFrame, split=True):
    """Score every candidate cell, optionally on the IS/OOS halves separately."""
    n = len(df)
    cut = int(n * IS_FRAC)
    is_df, oos_df = df.iloc[:cut], df.iloc[cut:]
    out = []
    for name, codes in candidates(df):
        if split:
            a = score(is_df, codes.iloc[:cut], min_n=int(MIN_N * IS_FRAC))
            if a.empty:
                continue
            b = score(oos_df, codes.iloc[cut:], min_n=int(MIN_N * (1 - IS_FRAC)))
            if b.empty:
                continue
            m = a.merge(b, on='cell', suffixes=('_is', '_oos'))
            m['feature'] = name
            out.append(m)
        else:
            a = score(df, codes)
            if a.empty:
                continue
            a['feature'] = name
            out.append(a)
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--discover', default='gold')
    ap.add_argument('--confirm', default='eurusd,nq')
    ap.add_argument('--t-in', type=float, default=2.5)
    ap.add_argument('--t-out', type=float, default=1.0)
    ap.add_argument('--data', default=DATA)
    ap.add_argument('--top', type=int, default=20)
    a = ap.parse_args()

    print(f'Loading discovery instrument: {a.discover}')
    df = prepare(os.path.join(a.data, f'panel_{a.discover}.parquet'))
    print(f'  {len(df):,} usable rows (prior move >= {MIN_PRIOR}σ), '
          f'uncond P(revert) = {df["reverted"].mean():.4f}')

    print('  sweeping candidate conditions (singles + pairs) ...')
    res = sweep(df)
    if res.empty:
        print('no cells met the size floor'); return

    n_tested = len(res)
    # Stage 1: in-sample
    s1 = res[res['t_is'].abs() >= a.t_in]
    # Stage 2: out-of-sample — same sign AND independently significant
    s2 = s1[(np.sign(s1['delta_is']) == np.sign(s1['delta_oos']))
            & (s1['t_oos'].abs() >= a.t_out)]

    exp1 = n_tested * 2 * (1 - 0.9938)          # |t|>=2.5 two-sided
    exp2 = len(s1) * 0.5 * 2 * (1 - 0.8413)     # sign agrees AND |t_oos|>=1

    print(f'\n{"="*100}')
    print(f'UNGUIDED SWEEP — {a.discover}, outcome = P(revert | cell) vs matched baseline')
    print(f'{"="*100}')
    print(f'  stage 0  enumerated                 {n_tested:6,} cells')
    print(f'  stage 1  |t_IS| >= {a.t_in}                {len(s1):6,}   (chance ≈ {exp1:.0f})')
    print(f'  stage 2  + OOS same sign, |t| >= {a.t_out}  {len(s2):6,}   (chance ≈ {exp2:.0f})')

    if s2.empty:
        print('\nNothing survived the time holdout. Stopping — there is no stage 3.')
        return

    # Stage 3: cross-instrument confirmation
    confirm = [c.strip() for c in a.confirm.split(',') if c.strip()]
    conf_maps = {}
    for inst in confirm:
        p = os.path.join(a.data, f'panel_{inst}.parquet')
        if not os.path.exists(p):
            print(f'  !! no panel for {inst}, skipping'); continue
        print(f'  confirming on {inst} ...')
        d2 = prepare(p)
        full = sweep(d2, split=False)
        conf_maps[inst] = full.set_index(['feature', 'cell'])['delta'].to_dict()

    s2 = s2.copy()
    for inst, mp in conf_maps.items():
        s2[f'{inst}_delta'] = [mp.get((f, c), np.nan)
                               for f, c in zip(s2['feature'], s2['cell'])]
    dcols = [f'{i}_delta' for i in conf_maps]
    if dcols:
        sgn = np.sign(s2['delta_is'])
        agree = np.ones(len(s2), dtype=bool)
        for c in dcols:
            agree &= (np.sign(s2[c]) == sgn) | s2[c].isna()
            agree &= s2[c].notna()
        s3 = s2[agree]
        exp3 = len(s2) * (0.5 ** len(dcols))
        print(f'  stage 3  + same sign on {len(dcols)} other market(s)  {len(s3):6,}   '
              f'(chance ≈ {exp3:.0f})')
    else:
        s3 = s2; exp3 = np.nan

    print(f'\n{"-"*100}')
    if len(s3) <= exp3:
        print('READ: survivors are at or below the chance count. Nothing here has')
        print('separated itself from noise — do not read the list below as findings.')
    else:
        print(f'READ: {len(s3)} survivors vs ~{exp3:.0f} expected by chance.')
        print('Still a SEARCH result: these were selected by looking, so they need a')
        print('forward test before they are anything more than leads.')
    print('-' * 100)

    show = s3.reindex(s3['delta_oos'].abs().sort_values(ascending=False).index)
    cols = ['feature', 'cell', 'n_is', 'delta_is', 't_is', 'n_oos', 'delta_oos',
            't_oos'] + dcols
    out = show[cols].head(a.top).copy()
    for c in out.columns:
        if out[c].dtype.kind == 'f':
            out[c] = (out[c] * (100 if 'delta' in c else 1)).round(2)
    out = out.rename(columns={c: c.replace('delta', 'Δpp') for c in out.columns})
    print(out.to_string(index=False))


if __name__ == '__main__':
    main()
