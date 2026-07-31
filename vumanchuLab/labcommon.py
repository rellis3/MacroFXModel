"""labcommon.py — the shared plumbing every study in this lab repeats.

Extracted once so six modules do not each carry their own copy of the panel
prep, the matched baseline and the batch-means SE. Same reason the JS side has
`LEGO_MODULES.md`: two copies of a baseline calculation that drift are worse
than no baseline at all.

Nothing here is new logic — it is the machinery already proven in
`analyse.py` / `discover.py`, in one place.
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.analyse import DATA, batch_means_se  # noqa: E402
from vumanchuLab.panel import TIMEFRAMES, build_panel  # noqa: E402

N_BLOCKS = 40
PRIOR_ROWS = 12          # panel rows (stride 5) -> 60 min
MIN_PRIOR = 0.5


def get_panel(inst: str, cache_dir: str | None = None, stride: int = 5,
              verbose: bool = False) -> pd.DataFrame:
    """Panel from disk if it exists, else built. Panels are optional on disk —
    `scale.py` discards them by default — so every study can run standalone."""
    p = os.path.join(cache_dir or DATA, f'panel_{inst}.parquet')
    if os.path.exists(p):
        return pd.read_parquet(p)
    return build_panel(inst, timeframes=TIMEFRAMES, stride=stride, verbose=verbose)


def add_context(df: pd.DataFrame, prior_rows: int = PRIOR_ROWS,
                fwd_col: str = 'fwd_ret_60', min_prior: float = MIN_PRIOR) -> pd.DataFrame:
    """Prior move, revert/continue label, and the buckets the baseline needs."""
    c = df['close']
    sig = df['sigma'].to_numpy(float)
    with np.errstate(divide='ignore', invalid='ignore'):
        prior = (c / c.shift(prior_rows) - 1.0).to_numpy() / (sig * np.sqrt(prior_rows * 5))
    out = df.copy()
    out['prior_sig'] = prior
    out['prior_dir'] = np.sign(prior)
    fwd = out[fwd_col].to_numpy(float)
    rev = (np.sign(fwd) != np.sign(prior)).astype(float)
    rev[~np.isfinite(fwd) | ~np.isfinite(prior)] = np.nan
    rev[np.abs(prior) < min_prior] = np.nan
    out['reverted'] = rev
    out['prior_bucket'] = (pd.Series(np.abs(prior), index=out.index)
                           .rolling(20000, min_periods=2000).rank(pct=True)
                           .mul(3).clip(0, 2.999).fillna(-1).astype(int))
    return out


def strata(df: pd.DataFrame, use_hour: bool = True) -> pd.Series:
    """The confounders a cell can smuggle in. `use_hour=False` when hour is the
    thing being STUDIED rather than controlled (see session.py)."""
    s = df['vol_bucket'].fillna(-1).astype(int) * 10 + df['prior_bucket'].astype(int)
    if use_hour:
        s = df['hour'].astype(int) * 100 + s
    return s


def score(df: pd.DataFrame, codes: pd.Series, outcome: str = 'reverted',
          min_n: int = 400, use_hour: bool = True) -> pd.DataFrame:
    """Per-cell mean of `outcome` vs its matched baseline, batch-means SE.

    Works for a 0/1 outcome (probability) or a continuous one (mean), so the
    same scorer serves the revert study and the volatility study.
    """
    d = df.dropna(subset=[outcome])
    if d.empty:
        return pd.DataFrame()
    codes = codes.reindex(d.index)
    y = d[outcome]
    st = strata(d, use_hour)
    glob = y.groupby(st).mean()
    blocks = pd.Series(np.minimum((np.arange(len(d)) * N_BLOCKS) // len(d), N_BLOCKS - 1),
                       index=d.index)
    split = int(len(d) * 0.6)
    is_mask = pd.Series(np.arange(len(d)) < split, index=d.index)

    rows = []
    for key, idx in codes.groupby(codes).groups.items():
        m = pd.Series(False, index=d.index)
        m.loc[idx] = True
        n = int(m.sum())
        if n < min_n:
            continue
        w = st[m].value_counts(normalize=True)
        common = w.index.intersection(glob.index)
        if not len(common):
            continue
        base = float((glob.loc[common] * w.loc[common]).sum() / w.loc[common].sum())
        p = float(y[m].mean())
        se = batch_means_se(y[m] - base, blocks[m])
        d_is = float(y[m & is_mask].mean()) - base if (m & is_mask).sum() > min_n // 3 else np.nan
        d_oos = float(y[m & ~is_mask].mean()) - base if (m & ~is_mask).sum() > min_n // 3 else np.nan
        rows.append({
            'cell': str(key), 'n': n,
            'value': round(p, 4), 'base': round(base, 4),
            'delta': round(p - base, 4),
            't': round((p - base) / se, 2) if se and se > 0 else np.nan,
            'is_d': round(d_is, 4) if np.isfinite(d_is) else np.nan,
            'oos_d': round(d_oos, 4) if np.isfinite(d_oos) else np.nan,
        })
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    out['consistent'] = (np.sign(out['is_d']) == np.sign(out['oos_d'])) & \
                        out[['is_d', 'oos_d']].notna().all(axis=1)
    return out.sort_values('delta', key=abs, ascending=False).reset_index(drop=True)


def tercile(s: pd.Series, window: int = 20000, minp: int = 2000) -> pd.Series:
    """Causal tercile of a continuous series."""
    return (s.rolling(window, min_periods=minp).rank(pct=True)
            .mul(3).clip(0, 2.999).fillna(-1).astype(int))
