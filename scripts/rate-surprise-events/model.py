"""rate-surprise-events: the event models, shared by the power check (planted.py) and the registered run (run.py).
Walk-forward OLS over events in time order: each event is forecast by a fit on all EARLIER events of that asset (min 40)."""
import numpy as np, pandas as pd
from scipy.stats import norm, spearmanr

FAMS = ('FOMC', 'CPI', 'NFP')


def design(X, asset, model):
    """columns for one model. B1 = own reaction + the hour into the release + family dummies; signals added on top."""
    cols = {'react': X[f'{asset}_react'].to_numpy(float), 'pre': X[f'{asset}_pre_react'].to_numpy(float)}
    for f in FAMS[1:]:
        cols[f'fam_{f}'] = (X['family'] == f).to_numpy(float)
    if model in ('M_RS', 'M_ALL'): cols['rs2'] = X['rs2'].to_numpy(float)
    if model in ('M_DS', 'M_ALL'): cols['ds'] = np.nan_to_num(X['ds'].to_numpy(float))          # missing consensus = no data surprise
    if model == 'M_RS10': cols['rs10'] = X['rs10'].to_numpy(float)
    if model == 'B0': cols = {f'fam_{f}': (X['family'] == f).to_numpy(float) for f in FAMS[1:]}
    return np.column_stack(list(cols.values())), list(cols.keys())


def walk_forward(X, y, asset, model, min_train=40, clip=4.0):
    """returns the forecast per event (NaN where not forecastable). Inputs are clipped at +-clip sigma (fat-tailed events)."""
    Z, _ = design(X, asset, model)
    Z = np.clip(Z, -clip, clip)
    n = len(y); f = np.full(n, np.nan)
    ok = np.isfinite(Z).all(1) & np.isfinite(y)
    okz = np.isfinite(Z).all(1)
    for i in range(n):
        if not okz[i]: continue
        tr = np.where(ok[:i])[0]
        if len(tr) < min_train: continue
        A = np.column_stack([np.ones(len(tr)), Z[tr]])
        b, *_ = np.linalg.lstsq(A, y[tr], rcond=None)
        f[i] = b[0] + Z[i] @ b[1:]
    return f


def nw_t(x, lag=1):
    x = x[np.isfinite(x)]; n = len(x)
    if n < 15: return np.nan
    e = x - x.mean(); s = e @ e / n
    for k in range(1, lag + 1): s += 2 * (1 - k / (lag + 1)) * (e[k:] @ e[:-k] / n)
    return x.mean() / np.sqrt(s / n) if s > 0 else np.nan


def score(y, f_base, f_model, mask, lag=1):
    k = mask & np.isfinite(y) & np.isfinite(f_base) & np.isfinite(f_model)
    y, a, b = y[k], f_base[k], f_model[k]
    if len(y) < 15: return dict(n=int(len(y)))
    e1, e2 = y - a, y - b
    cw = e1 ** 2 - (e2 ** 2 - (a - b) ** 2); t = nw_t(cw, lag)
    ic = spearmanr(b, y).correlation if np.std(b) > 0 else np.nan
    return dict(n=int(len(y)), r2_gain=float(1 - np.sum(e2 ** 2) / np.sum(e1 ** 2)), cw_t=float(t), cw_p=float(norm.sf(t)) if np.isfinite(t) else np.nan,
                ic=float(ic) if np.isfinite(ic) else np.nan, ic_se=float(1 / np.sqrt(len(y))), hit=float(np.mean(np.sign(b) == np.sign(y))))
