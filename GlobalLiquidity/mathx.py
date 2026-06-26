"""
GlobalLiquidity — small causal time-series helpers.

Everything here is strictly causal: value at index i uses only data at
indices <= i. This is the difference between a model that backtests and one
that lies. numpy-only, no pandas.
"""

from __future__ import annotations

import numpy as np


def ffill(a: np.ndarray) -> np.ndarray:
    """Forward-fill NaNs (causal). Leading NaNs stay NaN."""
    a = np.asarray(a, dtype=float).copy()
    last = np.nan
    for i in range(len(a)):
        if np.isnan(a[i]):
            a[i] = last
        else:
            last = a[i]
    return a


def lag(a: np.ndarray, k: int) -> np.ndarray:
    """Shift forward by k (introduce k NaNs at the front). Models publication
    delay: at week i you only see data from week i-k."""
    if k <= 0:
        return np.asarray(a, dtype=float).copy()
    out = np.full_like(np.asarray(a, dtype=float), np.nan)
    out[k:] = a[:-k]
    return out


def sma(a: np.ndarray, win: int) -> np.ndarray:
    """Causal simple moving average; partial windows at the start."""
    a = np.asarray(a, dtype=float)
    out = np.full(len(a), np.nan)
    for i in range(len(a)):
        lo = max(0, i - win + 1)
        seg = a[lo:i + 1]
        seg = seg[~np.isnan(seg)]
        if seg.size:
            out[i] = seg.mean()
    return out


def rolling_z(a: np.ndarray, win: int, min_periods: int) -> np.ndarray:
    """Causal rolling z-score: (x - mean_win) / std_win using only the past."""
    a = np.asarray(a, dtype=float)
    out = np.full(len(a), np.nan)
    for i in range(len(a)):
        lo = max(0, i - win + 1)
        seg = a[lo:i + 1]
        seg = seg[~np.isnan(seg)]
        if seg.size >= min_periods:
            mu = seg.mean()
            sd = seg.std(ddof=1)
            if sd > 1e-12:
                out[i] = (a[i] - mu) / sd
            else:
                out[i] = 0.0
    return out


def roc(a: np.ndarray, k: int) -> np.ndarray:
    """k-period rate of change (difference of the level). NaN-safe."""
    a = np.asarray(a, dtype=float)
    out = np.full(len(a), np.nan)
    out[k:] = a[k:] - a[:-k]
    return out


def nan_to_zero(a: np.ndarray) -> np.ndarray:
    a = np.asarray(a, dtype=float).copy()
    a[np.isnan(a)] = 0.0
    return a


def annualised_sharpe(weekly_returns: np.ndarray, weeks_per_year: int = 52) -> float:
    r = np.asarray(weekly_returns, dtype=float)
    r = r[~np.isnan(r)]
    if r.size < 4 or r.std(ddof=1) < 1e-12:
        return 0.0
    return float(r.mean() / r.std(ddof=1) * np.sqrt(weeks_per_year))


def max_drawdown(equity: np.ndarray) -> float:
    e = np.asarray(equity, dtype=float)
    peak = np.maximum.accumulate(e)
    dd = (e - peak) / peak
    return float(dd.min())
