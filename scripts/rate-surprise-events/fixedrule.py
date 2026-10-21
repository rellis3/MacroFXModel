"""rate-surprise-events primary statistic (shared by the power check and the registered run).
Signal direction is fixed BEFORE outcomes (no fit): EURUSD = -surprise (hawkish -> EURUSD down); NQ = -surprise x sign of NQ's
trailing 60-day daily link with the US 2y CFD (the stock-rate sign flips by regime). Incremental to the asset's own reaction:
the outcome is residualised on the reaction with a slope estimated only on EARLIER events (walk-forward), then correlated with
the signal. p from a within-family permutation of the signal (2000 draws)."""
import numpy as np, pandas as pd


def residualise(y, react, fam, min_train=30):
    """y minus the walk-forward fitted [1, react, family] prediction (earlier events only)."""
    n = len(y); out = np.full(n, np.nan)
    F = pd.get_dummies(pd.Series(fam)).to_numpy(float)[:, 1:]
    Z = np.column_stack([np.ones(n), np.clip(react, -4, 4), F])
    ok = np.isfinite(y) & np.isfinite(Z).all(1)
    for i in range(n):
        if not ok[i]: continue
        tr = np.where(ok[:i])[0]
        if len(tr) < min_train: continue
        b, *_ = np.linalg.lstsq(Z[tr], y[tr], rcond=None)
        out[i] = y[i] - Z[i] @ b
    return out


def partial_stat(resid, sig, fam, mask, rng, nperm=2000):
    k = mask & np.isfinite(resid) & np.isfinite(sig)
    r, s, f = resid[k], np.clip(sig[k], -4, 4), np.asarray(fam)[k]
    if len(r) < 15 or np.std(s) == 0: return dict(n=int(len(r)))
    c = float(np.corrcoef(r, s)[0, 1])
    perm = np.empty(nperm)
    groups = [np.where(f == g)[0] for g in np.unique(f)]
    for j in range(nperm):
        sp = s.copy()
        for g in groups: sp[g] = s[g][rng.permutation(len(g))]
        perm[j] = np.corrcoef(r, sp)[0, 1]
    p = float((np.sum(np.abs(perm) >= abs(c)) + 1) / (nperm + 1))
    return dict(n=int(len(r)), corr=c, p=p, lo=float(c - 1.96 / np.sqrt(len(r))), hi=float(c + 1.96 / np.sqrt(len(r))))
