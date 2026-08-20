"""stats_util — the honesty layer every analysis module in this package routes
through, in the spirit of `forge.discover` (whose docstring is worth reading:
40,000 hypotheses tested at p<0.05 hands you 2,000 fake "edges").

Two defences used everywhere in this package:

  1. **Benjamini-Hochberg FDR** (`bh_fdr`) across the WHOLE pool of cells the
     study ran, not just the ones that looked interesting after the fact.

  2. **Circular-shift null** (`circular_shift_pvalue`), not a plain shuffle.
     Gold's volatility is regime-clustered — quiet in 2017, wild in 2020,
     wild again in 2025-26 — so a predecessor-session's range and a
     successor-session's range can be correlated simply because they landed
     in the same volatility regime, with no session-handoff mechanism at all.
     A plain (fully shuffled) null destroys that regime clustering too and so
     is trivially easy to beat — it would make a spurious "handoff" look real.
     Shifting one series by a random offset with wraparound instead preserves
     each series' own autocorrelation/regime structure while breaking the
     SPECIFIC day-to-day alignment being tested. If the real pairing still
     beats this null, the finding survives the one confound most likely to
     produce a beautiful fake result here.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats as sstats


def bh_fdr(pvalues: pd.Series | np.ndarray, q: float = 0.10) -> np.ndarray:
    """Benjamini-Hochberg step-up. Returns a boolean pass/fail array aligned
    to the input order. NaN p-values never pass."""
    p = np.asarray(pvalues, dtype=float)
    m = len(p)
    out = np.zeros(m, dtype=bool)
    valid_idx = np.flatnonzero(np.isfinite(p))
    if valid_idx.size == 0:
        return out
    pv = p[valid_idx]
    order = np.argsort(pv)
    ranks = np.arange(1, pv.size + 1)
    thresh = q * ranks / m           # m = full pool size, including invalid cells
    sorted_p = pv[order]
    passed_sorted = sorted_p <= thresh
    if passed_sorted.any():
        cutoff = sorted_p[passed_sorted].max()
        passed = pv <= cutoff
    else:
        passed = np.zeros_like(pv, dtype=bool)
    out[valid_idx] = passed
    return out


def circular_shift_pvalue(x: np.ndarray, y: np.ndarray, statistic_fn, n_perm: int = 1000,
                          rng: np.random.Generator | None = None, min_shift: int = 5) -> tuple[float, float]:
    """Observed `statistic_fn(x, y)` plus a two-sided p-value against a
    circular-shift null of `y` (see module docstring).

    `min_shift` keeps the null from ever trivially reproducing the true
    alignment (shift=0) or its near neighbours.
    """
    rng = rng or np.random.default_rng(0)
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    mask = np.isfinite(x) & np.isfinite(y)
    x, y = x[mask], y[mask]
    n = len(x)
    if n < 2 * min_shift + 10:
        return float("nan"), float("nan")
    observed = float(statistic_fn(x, y))
    lo, hi = min_shift, n - min_shift
    shifts = rng.integers(lo, hi, size=n_perm)
    null_stats = np.empty(n_perm)
    for i, k in enumerate(shifts):
        null_stats[i] = statistic_fn(x, np.roll(y, int(k)))
    p = float((np.abs(null_stats) >= abs(observed)).mean())
    return observed, p


def spearman_stat(x: np.ndarray, y: np.ndarray) -> float:
    rho, _ = sstats.spearmanr(x, y)
    return float(rho) if np.isfinite(rho) else 0.0


def mean_diff_stat(x: np.ndarray, y: np.ndarray) -> float:
    """Mean of y where x is in its own top tercile minus mean of y where x is
    in its own bottom tercile — the statistic `circular_shift_pvalue` shifts y
    against, so terciles are recomputed inside on the (possibly shifted) pair."""
    try:
        hi_cut, lo_cut = np.nanpercentile(x, [66.7, 33.3])
    except Exception:
        return 0.0
    hi = y[x >= hi_cut]
    lo = y[x <= lo_cut]
    if len(hi) < 5 or len(lo) < 5:
        return 0.0
    return float(np.nanmean(hi) - np.nanmean(lo))


def spike_reversal_stat(pre: np.ndarray, post: np.ndarray, quantile: float = 0.75) -> float:
    """Reversal-rate(top |pre| quartile) - reversal-rate(rest). Recomputes the
    quartile cut inside the function so a circular-shift null (which passes a
    scrambled `post`) still compares like-for-like spike/non-spike buckets
    rather than reusing the real data's split on shuffled outcomes."""
    cut = np.nanpercentile(np.abs(pre), quantile * 100)
    spike = np.abs(pre) >= cut
    non = ~spike
    if spike.sum() < 5 or non.sum() < 5:
        return 0.0
    rev_spike = float((np.sign(post[spike]) != np.sign(pre[spike])).mean())
    rev_non = float((np.sign(post[non]) != np.sign(pre[non])).mean())
    return rev_spike - rev_non


def prop_diff_z(k1: int, n1: int, k2: int, n2: int) -> tuple[float, float]:
    """Two-proportion z-test. Returns (z, two_sided_p)."""
    if n1 == 0 or n2 == 0:
        return float("nan"), float("nan")
    p1, p2 = k1 / n1, k2 / n2
    p_pool = (k1 + k2) / (n1 + n2)
    se = np.sqrt(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2))
    if se == 0:
        return 0.0, 1.0
    z = (p1 - p2) / se
    p = 2 * sstats.norm.sf(abs(z))
    return float(z), float(p)


def binom_p(k: int, n: int, p0: float = 0.5) -> float:
    if n == 0:
        return float("nan")
    return float(sstats.binomtest(k, n, p0, alternative="two-sided").pvalue)
