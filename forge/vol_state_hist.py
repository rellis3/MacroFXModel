"""Historical, point-in-time vol-state fields (vol-layer L1, forge/VOL_LAYER_REACTION_PREREG.md).

Every function takes one instrument's session series, oldest first, and returns arrays where index i is what was known
BEFORE session i opened: it uses sessions < i only. forge/vol_state_hist_test.py proves prefix invariance for each.

    har_state(lrv)      HAR on log realised variance, refit on an expanding window: expected change, distance from the
                        model's long-run level, and the one-step residual
    hmm_filtered(x)     filtered P(high state) from a 2-state Gaussian HMM, refit on an expanding window. Never smoothed
                        and never Viterbi
    ewma_before(x)      EWMA of x stamped to the next session

A refit at session i only uses rows whose target is complete before i, so a 5-day target can't peek.
"""
from __future__ import annotations

import numpy as np

REFIT = 63
MIN_TRAIN = 250


def _har_x(lrv: np.ndarray) -> np.ndarray:
    """[1, daily, weekly mean, monthly mean] at each t, using lrv up to and including t. NaN until 22 values exist."""
    n = len(lrv)
    X = np.full((n, 4), np.nan)
    cs = np.nancumsum(lrv)
    cnt = np.cumsum(np.isfinite(lrv))

    def mean_back(w):
        a = cs.copy()
        c = cnt.astype(float).copy()
        a[w:] = cs[w:] - cs[:-w]
        c[w:] = cnt[w:] - cnt[:-w]
        return np.where(c >= max(1, w * 0.6), a / np.maximum(c, 1), np.nan)

    X[:, 0] = 1.0
    X[:, 1] = lrv
    X[:, 2] = mean_back(5)
    X[:, 3] = mean_back(22)
    X[:21] = np.nan
    return X


def _ols(X: np.ndarray, y: np.ndarray):
    ok = np.isfinite(X).all(axis=1) & np.isfinite(y)
    if ok.sum() < X.shape[1] * 10:
        return None
    return np.linalg.lstsq(X[ok], y[ok], rcond=None)[0]


def har_state(lrv, refit: int = REFIT, min_train: int = MIN_TRAIN) -> dict:
    """For session i, from sessions < i:
    p1[i]  forecast of lrv[i];  p5[i]  forecast of the mean of lrv[i..i+4];  dsig[i] = p5 - p1;
    sig_rel[i] = p1 minus the model's unconditional mean;  res[i] = lrv[i-1] minus p1[i-1] (last session's miss)."""
    lrv = np.asarray(lrv, float)
    n = len(lrv)
    X = _har_x(lrv)
    y1 = np.full(n, np.nan)
    y5 = np.full(n, np.nan)
    y1[:-1] = lrv[1:]
    for t in range(n - 5):
        w = lrv[t + 1:t + 6]
        if np.isfinite(w).sum() >= 3:
            y5[t] = np.nanmean(w)
    p1, p5, rel = np.full(n, np.nan), np.full(n, np.nan), np.full(n, np.nan)
    b1 = b5 = None
    for i in range(1, n):
        if i >= min_train and (i - min_train) % refit == 0:
            # row t has target lrv[t+1]: complete before i needs t+1 <= i-1. y5 needs t+5 <= i-1.
            b1 = _ols(X[: i - 1], y1[: i - 1])
            b5 = _ols(X[: i - 5], y5[: i - 5])
        if b1 is None or b5 is None or not np.isfinite(X[i - 1]).all():
            continue
        p1[i] = X[i - 1] @ b1
        p5[i] = X[i - 1] @ b5
        d = 1.0 - b1[1:].sum()
        if d > 0.02:
            rel[i] = p1[i] - b1[0] / d
    res = np.full(n, np.nan)
    res[1:] = lrv[:-1] - p1[:-1]
    return {"p1": p1, "p5": p5, "dsig": p5 - p1, "sig_rel": rel, "res": res}


def _em2(x: np.ndarray, iters: int = 40, by: str = "mean"):
    """2-state Gaussian HMM by Baum-Welch on finite x. Returns (A, mu, var, pi) with state 1 = 'high'."""
    n = len(x)
    q = np.quantile(x, [0.3, 0.7])
    mu = q.copy()
    var = np.array([x.var(), x.var()]) + 1e-8
    if by == "var":
        mu = np.array([x.mean(), x.mean()])
        var = np.array([x.var() * 0.5, x.var() * 1.5]) + 1e-8
    A = np.array([[0.95, 0.05], [0.05, 0.95]])
    pi = np.array([0.5, 0.5])
    for _ in range(iters):
        e = np.exp(-0.5 * (x[:, None] - mu) ** 2 / var) / np.sqrt(2 * np.pi * var) + 1e-300
        al = np.zeros((n, 2))
        c = np.zeros(n)
        al[0] = pi * e[0]
        c[0] = al[0].sum()
        al[0] /= c[0]
        for t in range(1, n):
            al[t] = (al[t - 1] @ A) * e[t]
            c[t] = al[t].sum()
            al[t] /= c[t]
        be = np.ones((n, 2))
        for t in range(n - 2, -1, -1):
            be[t] = (A * e[t + 1] * be[t + 1]).sum(axis=1) / c[t + 1]
        g = al * be
        g /= g.sum(axis=1, keepdims=True)
        xi = np.zeros((2, 2))
        for t in range(n - 1):
            m = al[t][:, None] * A * (e[t + 1] * be[t + 1])[None, :] / c[t + 1]
            xi += m
        A = xi / xi.sum(axis=1, keepdims=True)
        w = g.sum(axis=0) + 1e-12
        mu = (g * x[:, None]).sum(axis=0) / w
        var = (g * (x[:, None] - mu) ** 2).sum(axis=0) / w + 1e-8
        pi = g[0]
    hi = int(np.argmax(var if by == "var" else mu))
    if hi == 0:
        A = A[::-1, ::-1]
        mu, var, pi = mu[::-1], var[::-1], pi[::-1]
    return A, mu, var, pi


def hmm_filtered(x, refit: int = REFIT, min_train: int = MIN_TRAIN, by: str = "mean") -> np.ndarray:
    """P[i] = filtered P(high state) given x[0..i-1], with parameters fitted on data before the block containing i.
    A NaN observation is a predict-only step. `by` picks what 'high' means: larger mean, or larger variance."""
    x = np.asarray(x, float)
    n = len(x)
    P = np.full(n, np.nan)
    starts = range(min_train, n, refit)
    for s in starts:
        hist = x[:s]
        hist = hist[np.isfinite(hist)]
        if len(hist) < min_train * 0.8:
            continue
        A, mu, var, pi = _em2(hist, by=by)
        al = pi.copy()
        stop = min(s + refit, n)
        for t in range(stop - 1):            # filter from the start with these params; keep only this block
            pred = al @ A if t else al
            if np.isfinite(x[t]):
                e = np.exp(-0.5 * (x[t] - mu) ** 2 / var) / np.sqrt(2 * np.pi * var) + 1e-300
                al = pred * e
                al = al / al.sum()
            else:
                al = pred
            if t + 1 >= s:
                P[t + 1] = al[1]
    return P


def ewma_before(x, halflife: float) -> np.ndarray:
    """EWMA of x (NaN skipped) stamped to the next session: value i uses x[0..i-1]."""
    x = np.asarray(x, float)
    a = 1 - 0.5 ** (1.0 / halflife)
    out = np.full(len(x), np.nan)
    m = np.nan
    for i, v in enumerate(x):
        out[i] = m
        if np.isfinite(v):
            m = v if not np.isfinite(m) else a * v + (1 - a) * m
    return out
