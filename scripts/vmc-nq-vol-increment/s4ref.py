"""vmc-nq-vol-increment Stage 4 percentile references (prereg 3.1 and 3.9). NO OUTCOMES are scored here.

p at bar t = where t's own 12-bar log range sits among the 12-bar log ranges ending at the same NY half-hour on the 20
previous trade dates. An element counts only if its own 12-bar window lies inside one segment AND it comes from the
same feed source as bar t; p is defined only when >= 15 of the 20 dates supply a valid element. Ties (equal to 1e-10
in log-range units) count one half.
"""
import numpy as np
import pandas as pd

NDATES, MIN_DATES = 20, 15


def percentile(t):
    """t: a features table (s4_r12, s4_bar, seg, src, c_hh, trade_date). Returns p (NaN where undefined)."""
    n = len(t)
    # log ranges equal to 1e-10 are ties: otherwise float rounding (~1e-16) could flip the order of near-equal ranges
    v = np.round(t.s4_r12.to_numpy(float), 10)
    valid = (t.seg.to_numpy() >= 0) & (t.s4_bar.to_numpy() >= 11) & np.isfinite(v)
    ud, di = np.unique(pd.to_datetime(t.trade_date).to_numpy(), return_inverse=True)
    p = np.full(n, np.nan)
    src, hh = t.src.to_numpy(), t.c_hh.to_numpy()
    for (s, h), idx in pd.Series(np.arange(n)).groupby([src, hh]):
        idx = idx.to_numpy()
        ev = idx[valid[idx]]                        # elements of this (source, half-hour), date-sorted
        ed, eval_ = di[ev], v[ev]
        assert (src[ev] == s).all()
        qv = idx[valid[idx]]
        qd = di[qv]
        for d in np.unique(qd):
            q = qv[np.searchsorted(qd, d, "left"):np.searchsorted(qd, d, "right")]
            a, b = np.searchsorted(ed, d - NDATES), np.searchsorted(ed, d)
            if b - a == 0 or len(np.unique(ed[a:b])) < MIN_DATES:
                continue
            pool = np.sort(eval_[a:b])
            lo = np.searchsorted(pool, v[q], side="left")
            hi = np.searchsorted(pool, v[q], side="right")
            p[q] = (lo + 0.5 * (hi - lo)) / len(pool)
    return p


def states(t, p):
    """p_t, p_{t-12}, p_f (window t+1..t+12 = bar t+12), p_24 (bar t+24), all inside t's segment."""
    seg = t.seg.to_numpy()
    n = len(t)
    out = {"p_t": p}
    for name, k in (("p_m12", -12), ("p_f", 12), ("p_24", 24)):
        j = np.arange(n) + k
        ok = (j >= 0) & (j < n)
        x = np.full(n, np.nan)
        x[ok] = np.where(seg[j[ok]] == seg[ok], p[j[ok]], np.nan)
        out[name] = x
    return pd.DataFrame(out, index=t.index)
