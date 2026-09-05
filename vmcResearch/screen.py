"""screen.py - the landscape pass. Every VuManChu column against every outcome.

Before slicing anything into cells it is worth knowing whether these features
carry ANY monotone information, and how much. This computes a rank IC
(Spearman) per feature per outcome, with a batch-means standard error over
time blocks so the number is not the sqrt(48)-inflated fantasy that a raw
Pearson on 792k overlapping rows would give.

Two outcome families, because they answer different questions:

  DIRECTIONAL     fwd_sig_h - does the state predict up versus down at all?
  TREND-RELATIVE  resolve_H - does it predict the prevailing move extending
                  versus giving way? This is the brief's actual question and
                  it has a stable base rate; raw direction does not.

An IC that is large in-sample and flips sign out-of-sample is noise, so both
halves are reported side by side rather than averaged into one comforting
number.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats as sps

from vmcResearch.stats import IS_FRAC, N_BLOCKS, make_blocks

# Columns that are outcomes, identifiers or raw price - never inputs.
EXCLUDE_PREFIX = ('fwd_', 'mfe_', 'mae_', 't_mfe_', 't_mae_', 'resolve_', 't_resolve_')
EXCLUDE_EXACT = {'open', 'high', 'low', 'close', 'instrument', 'sigma_price',
                 'trend_sig', 'trend_dir', 'retrace', 'phase', 'net_move',
                 'trend_sig_slow', 'trend_dir_slow', 'retrace_slow', 'phase_slow'}


def feature_columns(panel):
    out = []
    for c in panel.columns:
        if c in EXCLUDE_EXACT or any(c.startswith(p) for p in EXCLUDE_PREFIX):
            continue
        if panel[c].dtype.kind not in 'fiu':
            continue
        out.append(c)
    return out


def block_ic(x, y, blocks, min_n=2000):
    """Spearman IC plus a batch-means SE from per-block ICs.

    The per-block IC is the honest unit of replication here: within a block the
    rows are near-duplicates, across blocks they are close to independent.
    """
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < min_n:
        return np.nan, np.nan, np.nan
    ic = sps.spearmanr(x[ok], y[ok]).statistic
    per = []
    for b in np.unique(blocks[ok]):
        m = ok & (blocks == b)
        if m.sum() < 200:
            continue
        v = x[m]
        if np.unique(v).size < 5:
            continue
        r = sps.spearmanr(v, y[m]).statistic
        if np.isfinite(r):
            per.append(r)
    if len(per) < 8:
        return ic, np.nan, np.nan
    per = np.asarray(per)
    se = per.std(ddof=1) / np.sqrt(per.size)
    return ic, se, ic / se if se > 0 else np.nan


def run(panel, outcomes=('fwd_sig_20', 'fwd_sig_48', 'resolve_48'), min_abs_t=0.0):
    blocks = make_blocks(panel.index, N_BLOCKS)
    cut = int(len(panel) * IS_FRAC)
    is_m = np.arange(len(panel)) < cut
    feats = feature_columns(panel)
    rows = []
    for f in feats:
        x = panel[f].to_numpy(float)
        if np.unique(x[np.isfinite(x)]).size < 5:
            continue
        row = {'feature': f}
        for o in outcomes:
            y = panel[o].to_numpy(float)
            ic, se, t = block_ic(x, y, blocks)
            row[o + '_ic'] = ic
            row[o + '_t'] = t
            ic_is, _, _ = block_ic(x[is_m], y[is_m], blocks[is_m])
            ic_oos, _, _ = block_ic(x[~is_m], y[~is_m], blocks[~is_m])
            row[o + '_is'] = ic_is
            row[o + '_oos'] = ic_oos
            row[o + '_ok'] = bool(np.isfinite(ic_is) and np.isfinite(ic_oos)
                                  and np.sign(ic_is) == np.sign(ic_oos))
        rows.append(row)
    df = pd.DataFrame(rows)
    return df


def fmt(df, outcome, top=20):
    key = outcome + '_t'
    d = df.reindex(df[key].abs().sort_values(ascending=False).index)
    out = ['  %-30s %8s %7s %8s %8s %s' % ('feature', 'IC', 't', 'IC_is', 'IC_oos', 'sign_ok')]
    for _, r in d.head(top).iterrows():
        out.append('  %-30s %8.4f %7.2f %8.4f %8.4f %s'
                   % (r['feature'][:30], r[outcome + '_ic'], r[key] if np.isfinite(r[key]) else 0,
                      r[outcome + '_is'], r[outcome + '_oos'], 'Y' if r[outcome + '_ok'] else '.'))
    return '\n'.join(out)
