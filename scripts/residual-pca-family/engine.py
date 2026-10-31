"""residual-pca-family: the shared engine (micro bank q1, generalised).

The model is the lesson's slide-32 loop as implemented in
education/residual_pca_currency_test/scripts/residual_test.py, unchanged in every setting
(window 120, K from the noise-band rule on IS windows, dead band 0.2, cap 1.5, inverse-vol
sizing, factor + basket neutralising, gross 1). Two generalisations only:

  * any universe of instruments (columns of a log-return frame `r`); x = r minus the
    equal-weight cross-sectional mean (the basket), as in q1;
  * `lag`: the outcome is the residual `lag` days after the signal day. lag = 1 is q1
    (signal at close t, outcome t -> t+1). lag = 2 skips a day (signal at close t, outcome
    t+1 -> t+2), used where a close can be stale (index CFDs, see the prereg).

Per signal day t (window = the 120 rows of x ending at t, nothing after t):
  disp[t, i] = z-score of the cumulative residual path (the displacement)
  e[t, i]    = residual of x[t+lag] with loadings, mean and sd frozen at t, in residual-sd units
  s[t, i]    = -disp[t, i] * e[t, i]   (positive = the residual moved back toward home)
"""
import numpy as np
import pandas as pd

WINDOW = 120
DEAD_BAND = 0.2
CAP = 1.5
NOISE_SIMS = 500
NOISE_PCTL = 95


def basket(r):
    return r.sub(r.mean(axis=1), axis=0)


def std_window(X):
    mu = X.mean(axis=0)
    sd = X.std(axis=0, ddof=1)
    return (X - mu) / sd, mu, sd


def eig_desc(Z):
    C = np.corrcoef(Z, rowvar=False)
    w, V = np.linalg.eigh(C)
    o = np.argsort(w)[::-1]
    return w[o], V[:, o]


def noise_band(n_obs, n_ser, sims=NOISE_SIMS, pctl=NOISE_PCTL, seed=7):
    """Same procedure as q1 (seed 7 kept so the FX8 band reproduces q1 exactly)."""
    rng = np.random.default_rng(seed)
    shares = np.empty((sims, n_ser))
    for s in range(sims):
        e = rng.standard_normal((n_obs, n_ser))
        e = e - e.mean(axis=1, keepdims=True)
        w, _ = eig_desc(std_window(e)[0])
        shares[s] = w / w.sum()
    return np.percentile(shares, pctl, axis=0)


def k_beating_noise(share, band):
    k = 0
    while k < len(share) and share[k] > band[k]:
        k += 1
    return k


def choose_k(x, n_is):
    """Pre-registered K rule (q1): median count of components above the noise band over the IS windows."""
    band = noise_band(WINDOW, x.shape[1])
    X = x.values[:n_is]
    ks = []
    for t in range(WINDOW - 1, len(X)):
        w, _ = eig_desc(std_window(X[t - WINDOW + 1: t + 1])[0])
        ks.append(k_beating_noise(w / w.sum(), band))
    ks = np.array(ks)
    return int(np.median(ks)), {int(k): int((ks == k).sum()) for k in np.unique(ks)}, band


def walk(x, r, K, cost_rt_pct, lag=1, cost_mult=1.0, mask=None):
    """One pass per signal day. cost_rt_pct: round-trip cost in % of price per column.
    mask (optional, DataFrame of bool like x): False -> that instrument's target is set to 0
    on that day (used by the conditional book variants; never by the signal statistics).
    Returns disp, e (both indexed by signal date t) and the loop records (indexed by the
    date the P&L is earned, t+lag)."""
    X, R = x.values, r.values
    n, m = X.shape
    ones = np.ones(m)
    cvec = np.array([cost_rt_pct[c] / 100.0 / 2.0 for c in x.columns]) * cost_mult
    M = None if mask is None else mask.reindex(index=x.index, columns=x.columns).fillna(False).values
    w_prev = np.zeros(m)
    D, E, recs, sig_idx = [], [], [], []
    for t in range(WINDOW - 1, n - lag):
        win = X[t - WINDOW + 1: t + 1]
        Z, mu, sd = std_window(win)
        _, V = eig_desc(Z)
        VK = V[:, :K]
        P = VK @ VK.T
        res = Z - Z @ P
        c = np.cumsum(res, axis=0)
        disp = (c[-1] - c.mean(axis=0)) / c.std(axis=0, ddof=1)
        z1 = (X[t + lag] - mu) / sd
        e1 = (z1 - P @ z1) / res.std(axis=0, ddof=1)
        D.append(disp)
        E.append(e1)
        sig_idx.append(x.index[t])

        target = -disp
        target[np.abs(disp) < DEAD_BAND] = 0.0
        target = np.clip(target, -CAP, CAP)
        if M is not None:
            target = np.where(M[t], target, 0.0)
        w = target / sd
        B = np.column_stack([sd[:, None] * VK, ones])
        w = w - B @ np.linalg.lstsq(B, w, rcond=None)[0]
        g = np.abs(w).sum()
        w = w / g if g > 0 else w
        turnover = np.abs(w - w_prev)
        cost = float(turnover @ cvec)
        gross = float(w @ R[t + lag])
        recs.append({"date": x.index[t + lag], "gross": gross, "cost": cost, "net": gross - cost,
                     "turnover": float(turnover.sum()),
                     "max_abs_exp_post": float(np.abs((sd[:, None] * VK).T @ w).max())})
        w_prev = w
    disp = pd.DataFrame(D, index=sig_idx, columns=x.columns)
    e = pd.DataFrame(E, index=sig_idx, columns=x.columns)
    return disp, e, pd.DataFrame(recs).set_index("date")


# ---------------------------------------------------------------- statistics
def daily_ic(disp, e):
    a = -disp.values
    b = e.values
    a = a - a.mean(axis=1, keepdims=True)
    b = b - b.mean(axis=1, keepdims=True)
    num = (a * b).sum(axis=1)
    den = np.sqrt((a * a).sum(axis=1) * (b * b).sum(axis=1))
    return pd.Series(num / den, index=disp.index)


def tstat(s, nw_lag=0):
    s = pd.Series(s).dropna().values
    n = len(s)
    mu = s.mean()
    ee = s - mu
    var = (ee @ ee) / n
    for L in range(1, nw_lag + 1):
        var += 2 * (1 - L / (nw_lag + 1)) * (ee[L:] @ ee[:-L]) / n
    return mu / np.sqrt(var / n)


def perf(pnl):
    pnl = pnl.dropna()
    if len(pnl) < 2 or pnl.std() == 0:
        return {"days": int(len(pnl)), "sharpe": None}
    eq = (1 + pnl).cumprod()
    dd = (eq / eq.cummax() - 1).min()
    return {"days": int(len(pnl)), "sharpe": round(float(pnl.mean() / pnl.std() * np.sqrt(252)), 3),
            "ann_ret_pct": round(float(pnl.mean() * 252 * 100), 3),
            "ann_vol_pct": round(float(pnl.std() * np.sqrt(252) * 100), 3),
            "max_dd_pct": round(float(dd * 100), 2)}


def block_starts(n, block, rng):
    k = int(np.ceil(n / block))
    st = rng.integers(0, n - block + 1, size=k)
    idx = (st[:, None] + np.arange(block)[None, :]).ravel()[:n]
    return idx


def within_contrast(s, tagA, tagB, rows=None):
    """Within-instrument contrast: sum_c nA_c (mean s|A,c - mean s|B,c) / sum_c nA_c, over
    instruments with >= 1 obs in both A and B. s, tagA, tagB: 2-D arrays (days x instruments)."""
    if rows is not None:
        s, tagA, tagB = s[rows], tagA[rows], tagB[rows]
    nA = tagA.sum(0)
    nB = tagB.sum(0)
    ok = (nA > 0) & (nB > 0)
    if not ok.any():
        return np.nan
    mA = np.where(ok, (s * tagA).sum(0) / np.maximum(nA, 1), 0)
    mB = np.where(ok, (s * tagB).sum(0) / np.maximum(nB, 1), 0)
    return float((nA[ok] * (mA[ok] - mB[ok])).sum() / nA[ok].sum())


def boot_se(fn, n_days, block, B, rng):
    vals = np.empty(B)
    for b in range(B):
        vals[b] = fn(block_starts(n_days, block, rng))
    vals = vals[np.isfinite(vals)]
    return float(vals.std(ddof=1)), vals
