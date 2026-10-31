"""vmc-nq-vol-increment shared pieces: feature sets, the frozen models (prereg 3.5), the paired block bootstrap (3.6)."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats as sps
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import features as F  # noqa: E402

SEED = 20261031
B = 2000
BLOCK = 20
HGB = dict(max_iter=400, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=500, l2_regularization=1.0,
           early_stopping=False, random_state=SEED)
CAT = ["c_hh", "c_dow", "c_sess"]
C = CAT + ["c_since_open", "c_brk"]
K = ["k_in_window", "k_recent", "k_mins_next"]
V = F.V_COLS
SV = ["s" + c for c in F.V_COLS]
PVD = F.PVD_COLS


def p_cols(t):
    return [c for c in t.columns if c.startswith("p_")]


def sets(t, h=12):
    P = p_cols(t)
    c = C if h == 12 else CAT + ["c_since_open", "c_brk48"]
    k = K if h == 12 else ["k_in_window48", "k_recent", "k_mins_next"]
    return {"C": c, "P": P, "K": k, "V": V, "SV": SV, "PVD": PVD}


def load(tf):
    return pd.read_parquet(F.DATA / f"tf{tf}.parquet")


def train_rows(t, mask, tf):
    """Eligible fit rows; every 3rd bar on 1m and 3m (prereg 3.5), the same rows for every model compared."""
    idx = np.where(mask)[0]
    return idx[idx % 3 == 0] if tf in (1, 3) else idx


def fit(t, rows, cols, y, cls=False):
    X = t.iloc[rows][cols].to_numpy(np.float32)
    cat = np.array([c in CAT for c in cols])
    if cls:
        m = HistGradientBoostingClassifier(loss="log_loss", categorical_features=cat, **HGB)
    else:
        m = HistGradientBoostingRegressor(loss="squared_error", categorical_features=cat, **HGB)
    m.fit(X, y)
    return m


def predict(m, t, rows, cols, cls=False):
    X = t.iloc[rows][cols].to_numpy(np.float32)
    return m.predict_proba(X)[:, 1] if cls else m.predict(X)


def ols(t, fit_rows, test_rows, cols, y_fit):
    """Secondary model: OLS with the clock categoricals as dummies."""
    def design(rows):
        d = t.iloc[rows][cols].astype(float)
        dum = [pd.get_dummies(d.pop(c).astype(int), prefix=c, dtype=float) for c in cols if c in CAT]
        return pd.concat([d] + dum, axis=1)
    a, b = design(fit_rows), design(test_rows)
    b = b.reindex(columns=a.columns, fill_value=0.0)
    mu, sd = a.mean(), a.std().replace(0, 1)
    A = np.c_[np.ones(len(a)), ((a - mu) / sd).to_numpy()]
    beta = np.linalg.lstsq(A, y_fit, rcond=None)[0]
    return np.c_[np.ones(len(b)), ((b - mu) / sd).to_numpy()] @ beta


class Boot:
    """Blocks of 20 consecutive test trade dates, resampled with replacement; one draw matrix shared by every
    comparison on a timeframe, so all comparisons are paired."""

    def __init__(self, dates):
        u = np.unique(dates)
        self.u = u
        self.nb = len(u) // BLOCK + (len(u) % BLOCK > 0)
        rng = np.random.default_rng(SEED)
        self.W = np.stack([np.bincount(rng.integers(0, self.nb, self.nb), minlength=self.nb) for _ in range(B)]).astype(float)

    def blocks(self, dates):
        return np.searchsorted(self.u, dates) // BLOCK

    def sums(self, blk, x):
        return np.bincount(blk, weights=x, minlength=self.nb)

    def ratio_skill(self, blk, ea, eb):
        """skill = 1 - sum(ea)/sum(eb), with bootstrap draws."""
        sa, sb = self.sums(blk, ea), self.sums(blk, eb)
        est = 1 - sa.sum() / sb.sum()
        bs = 1 - (self.W @ sa) / (self.W @ sb)
        return summarise(est, bs)

    def diff_skill(self, blk, e1, e2, eb):
        """(sum e2 - sum e1) / sum eb: how much better model 1 is than model 2, in base-MSE units."""
        s1, s2, sb = self.sums(blk, e1), self.sums(blk, e2), self.sums(blk, eb)
        est = (s2.sum() - s1.sum()) / sb.sum()
        bs = (self.W @ s2 - self.W @ s1) / (self.W @ sb)
        return summarise(est, bs)

    def means(self, blk, x, groups):
        """Per-group means with draws: {g: (est, draws)}."""
        out = {}
        for g, m in groups.items():
            s, n = self.sums(blk[m], x[m]), np.bincount(blk[m], minlength=self.nb).astype(float)
            out[g] = (s.sum() / max(n.sum(), 1), (self.W @ s) / np.maximum(self.W @ n, 1), int(m.sum()))
        return out


def summarise(est, bs):
    se = float(np.std(bs, ddof=1))
    lo, hi = np.percentile(bs, [2.5, 97.5])
    return {"est": float(est), "lo": float(lo), "hi": float(hi), "se": se,
            "p_one_sided": float(sps.norm.sf(est / se)) if se > 0 else 0.5}


def abs_errors(y, yhat):
    e = y - yhat
    rmse = float(np.sqrt(np.mean(e ** 2)))
    return {"mse": float(np.mean(e ** 2)), "rmse": rmse, "mae": float(np.mean(np.abs(e))), "bias": float(np.mean(e)),
            "pct_range_error": float(np.exp(rmse) - 1)}


def calibration(y, yhat):
    q = np.quantile(yhat, np.linspace(0, 1, 11))
    b = np.clip(np.searchsorted(q, yhat, side="right") - 1, 0, 9)
    dec = [{"decile": int(i), "mean_pred": float(yhat[b == i].mean()), "mean_y": float(y[b == i].mean()),
            "n": int((b == i).sum())} for i in range(10)]
    slope, icpt = np.polyfit(yhat, y, 1)
    return {"deciles": dec, "mz_slope": float(slope), "mz_intercept": float(icpt)}


def brier_block(y, p, p_clim):
    from sklearn.metrics import roc_auc_score
    q = np.linspace(0, 1, 11)
    b = np.clip(np.searchsorted(q, p, side="right") - 1, 0, 9)
    rel = [{"bin": int(i), "mean_p": float(p[b == i].mean()) if (b == i).any() else None,
            "freq": float(y[b == i].mean()) if (b == i).any() else None, "n": int((b == i).sum())} for i in range(10)]
    return {"brier": float(np.mean((p - y) ** 2)), "brier_climatology": float(np.mean((p_clim - y) ** 2)),
            "auc": float(roc_auc_score(y, p)) if 0 < y.mean() < 1 else None, "reliability": rel, "base_rate": float(y.mean())}


def shuffle_within_date(y, dates, rng):
    out = y.copy()
    for idx in pd.Series(np.arange(len(y))).groupby(dates).indices.values():
        out[idx] = y[rng.permutation(idx)]
    return out
