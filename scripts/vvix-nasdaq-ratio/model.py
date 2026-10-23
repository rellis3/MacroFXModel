"""vvix-nasdaq-ratio: the registered regression, shared by the power check and the run.
outcome_d ~ 1 + flag_hi + flag_lo + controls (VIX percentile, VIX>VIX3M, VIX9D/VIX, Nasdaq 20d return, Nasdaq rv20/VXN), OLS,
Newey-West (lag = horizon) standard errors. Returns the coefficient on the requested flag, its t, and n."""
import numpy as np, pandas as pd

CONTROLS = ['c_vix_pct', 'c_inverted', 'c_front', 'c_ret20', 'c_rv20_over_vxn']


def design(P, k):
    X = pd.DataFrame({'const': 1.0, 'hi': P[f'{k}_hi'], 'lo': P[f'{k}_lo']}, index=P.index)
    for c in CONTROLS: X[c] = P[c]
    return X


def nw_cov(X, e, lag):
    n = len(e); Xe = X * e[:, None]; S = Xe.T @ Xe / n
    for l in range(1, lag + 1):
        G = Xe[l:].T @ Xe[:-l] / n; S += (1 - l / (lag + 1)) * (G + G.T)
    XtX_inv = np.linalg.inv(X.T @ X / n)
    return XtX_inv @ S @ XtX_inv / n


def fit(P, y, k, which='hi', h=5, mask=None):
    X = design(P, k)
    ok = np.isfinite(y) & np.isfinite(X.to_numpy()).all(1)
    if mask is not None: ok &= mask
    Xm, ym = X.to_numpy()[ok], np.asarray(y)[ok]
    if len(ym) < 100: return np.nan, np.nan, int(len(ym))
    b = np.linalg.lstsq(Xm, ym, rcond=None)[0]; e = ym - Xm @ b
    V = nw_cov(Xm, e, max(1, h)); j = list(X.columns).index(which)
    return float(b[j]), float(b[j] / np.sqrt(V[j, j])), int(len(ym))
