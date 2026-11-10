"""Forward-return statistics, session-block bootstrap, placebo, multiplicity.

Outcome (prereg section 3): a decision is taken at the close of box k (minute e-1, e = (k+1)B).
The reference price is the OPEN of minute e (the first price a trader can act on), and
    y_h = (close[e+h-1] - open[e]) / (sigma1 * sqrt(h)),   h in {5, 10, 15, 30, 60} minutes,
in units of the previous-20-session 1-minute sigma scaled to the horizon. Windows that run past 15:59 are
dropped and counted. A state's signed outcome is sign(state) * y_h. S = mean signed outcome.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.stats import norm

HORIZONS = (5, 10, 15, 30, 60)
SEED = 20261110
NBOOT = 2000
BLOCK = 20


def minute_matrix(mins: pd.DataFrame, col: str) -> np.ndarray:
    return mins.pivot(index="day", columns="m", values=col).sort_index().values


def add_outcomes(f: pd.DataFrame, O: np.ndarray, C: np.ndarray, B: int, day_index: np.ndarray) -> pd.DataFrame:
    """day_index maps f.day -> row of O/C (identity when O/C are pivoted on the same mins frame)."""
    f = f.copy()
    e = (f["k"].values + 1) * B
    rows = day_index[f["day"].values]
    for h in HORIZONS:
        end = e + h - 1
        ok = end <= 389
        y = np.full(len(f), np.nan)
        y[ok] = (C[rows[ok], end[ok]] - O[rows[ok], e[ok]]) / (f["sigma1"].values[ok] * math.sqrt(h))
        f[f"y{h}"] = y
    return f


# ------------------------------------------------------------------ session-block bootstrap

def block_indices(n_days: int, nboot: int = NBOOT, block: int = BLOCK, seed: int = SEED) -> np.ndarray:
    """Circular moving-block bootstrap over sessions: (nboot, n_days) index matrix."""
    rng = np.random.default_rng(seed)
    nb = int(math.ceil(n_days / block))
    starts = rng.integers(0, n_days, size=(nboot, nb))
    idx = (starts[:, :, None] + np.arange(block)[None, None, :]) % n_days
    return idx.reshape(nboot, -1)[:, :n_days]


def day_sums(df: pd.DataFrame, value: str, days: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    g = df.groupby("day")[value].agg(["sum", "count"])
    g = g.reindex(days, fill_value=0)
    return g["sum"].values.astype(float), g["count"].values.astype(float)


def boot_mean(sums: np.ndarray, cnts: np.ndarray, idx: np.ndarray) -> np.ndarray:
    return sums[idx].sum(1) / np.maximum(cnts[idx].sum(1), 1)


def summarize(est: float, boots: np.ndarray) -> dict:
    se = float(np.nanstd(boots, ddof=1))
    lo, hi = np.nanpercentile(boots, [2.5, 97.5])
    z = est / se if se > 0 else 0.0
    return {"est": float(est), "se": se, "lo": float(lo), "hi": float(hi), "z": float(z),
            "p": float(2 * (1 - norm.cdf(abs(z))))}


def signed_cell(f: pd.DataFrame, model: str, h: int, days: np.ndarray, idx: np.ndarray, sub=None):
    d = f[(f[model] != 0) & f[f"y{h}"].notna()]
    if sub is not None:
        d = d[sub(d)]
    v = np.sign(d[model]) * d[f"y{h}"]
    dd = pd.DataFrame({"day": d["day"], "v": v})
    s, c = day_sums(dd, "v", days)
    est = s.sum() / max(c.sum(), 1)
    return est, boot_mean(s, c, idx), int(c.sum())


def diff_cell(f, m1, m2, h, days, idx):
    e1, b1, n1 = signed_cell(f, m1, h, days, idx)
    e2, b2, n2 = signed_cell(f, m2, h, days, idx)
    r = summarize(e1 - e2, b1 - b2)
    r.update(n1=n1, n2=n2, est1=e1, est2=e2)
    return r


def ols_boot(f: pd.DataFrame, y: str, xs: list[str], days: np.ndarray, idx: np.ndarray) -> dict:
    """OLS with intercept; session-block bootstrap of the coefficients via per-day X'X and X'y sums."""
    d = f.dropna(subset=[y] + xs)
    X = np.column_stack([np.ones(len(d))] + [d[x].values for x in xs])
    Y = d[y].values
    pos = pd.Index(days).get_indexer(d["day"].values)
    p = X.shape[1]
    XX = np.zeros((len(days), p, p))
    XY = np.zeros((len(days), p))
    np.add.at(XX, pos, X[:, :, None] * X[:, None, :])
    np.add.at(XY, pos, X * Y[:, None])
    beta = np.linalg.solve(XX.sum(0), XY.sum(0))
    bs = np.array([np.linalg.lstsq(XX[i].sum(0), XY[i].sum(0), rcond=None)[0] for i in idx])
    out = {}
    for j, name in enumerate(["const"] + xs):
        out[name] = summarize(beta[j], bs[:, j])
    resid = Y - X @ beta
    out["_r2"] = float(1 - resid.var() / Y.var())
    out["_n"] = int(len(d))
    return out


def session_shift_placebo(f: pd.DataFrame, model: str, h: int, shifts=range(1, 21)) -> np.ndarray:
    """States of session d scored against the outcomes of session d+s at the same box index."""
    st = f[["day", "k", model]]
    yy = f[["day", "k", f"y{h}"]]
    days = np.sort(f["day"].unique())
    pos = {d: i for i, d in enumerate(days)}
    out = []
    for s in shifts:
        sh = st.copy()
        sh["day"] = [days[(pos[d] + s) % len(days)] for d in sh["day"]]
        m = sh.merge(yy, on=["day", "k"])
        m = m[(m[model] != 0) & m[f"y{h}"].notna()]
        out.append(float((np.sign(m[model]) * m[f"y{h}"]).mean()))
    return np.array(out)


# ------------------------------------------------------------------ multiplicity

def holm(pvals: list[float], alpha: float = 0.05) -> list[bool]:
    order = np.argsort(pvals)
    m = len(pvals)
    rej = [False] * m
    for r, i in enumerate(order):
        if pvals[i] <= alpha / (m - r):
            rej[i] = True
        else:
            break
    return rej


def holm_adjusted(pvals: list[float]) -> list[float]:
    m = len(pvals)
    order = np.argsort(pvals)
    adj = np.zeros(m)
    run = 0.0
    for r, i in enumerate(order):
        run = max(run, min(1.0, (m - r) * pvals[i]))
        adj[i] = run
    return adj.tolist()


def bh(pvals: list[float], q: float = 0.10) -> list[bool]:
    m = len(pvals)
    order = np.argsort(pvals)
    thr = -1
    for r, i in enumerate(order, start=1):
        if pvals[i] <= q * r / m:
            thr = r
    rej = [False] * m
    for r, i in enumerate(order, start=1):
        if r <= thr:
            rej[i] = True
    return rej


def mde(se: float, m_cells: int = 1, alpha: float = 0.05, power: float = 0.8) -> float:
    """Worst-case Holm MDE: two-sided alpha / m_cells."""
    return float(se * (norm.ppf(1 - alpha / (2 * m_cells)) + norm.ppf(power)))
