"""STATE MEASURES per watch item, frozen definitions from DATA_AGENT.md section 2. All CAUSAL: the percentile and the
robust z of today's value use only observations STRICTLY BEFORE today (inside the trailing window), and nothing after
the as-of date is ever read (the caller truncates; this module also never indexes past the last element).

  value        latest value (as-of date)
  pct[W]       percentile (mid-rank, 0-100) of today's value among the W prior observations; None = 'building' (fewer
               than ceil(minPriorFraction*W) prior observations)
  z            robust z of the level: (x - median) / (1.4826 MAD) over the prior first-window observations
  chg[k]       change over k observations (log change for price-like series, difference otherwise)
  chgZ[k]      robust z of that change against the prior first-window k-changes (ending before today)
"""
from __future__ import annotations

import math

import numpy as np

MAD_SCALE = 1.4826


def _robust_z(x, prior, min_n):
    if prior.size < min_n:
        return None
    med = float(np.median(prior))
    mad = float(np.median(np.abs(prior - med))) * MAD_SCALE
    if mad <= 0:
        return None
    return (x - med) / mad


def percentile_prior(x: float, prior: np.ndarray, need: int):
    if prior.size < need or prior.size == 0:
        return None
    return 100.0 * (float((prior < x).sum()) + 0.5 * float((prior == x).sum())) / prior.size


def change_array(v: np.ndarray, k: int, kind: str) -> np.ndarray:
    """k-observation changes ending at index k..n-1."""
    if v.size <= k:
        return np.array([])
    if kind == "log":
        with np.errstate(divide="ignore", invalid="ignore"):
            out = np.log(v[k:] / v[:-k])
        return out
    return v[k:] - v[:-k]


def compute_measures(dates, values, *, cadence: str, change_kind: str, cfg: dict) -> dict:
    v = np.asarray(values, dtype=float)
    n = int(v.size)
    if n == 0:
        return {"status": "missing", "nObs": 0}
    windows = cfg["windows"][cadence]
    horizons = cfg["changeHorizons"][cadence]
    frac = cfg["minPriorFraction"]
    cur = float(v[-1])
    out = {"status": "ok", "value": cur, "asOfDate": dates[-1], "nObs": n, "cadence": cadence,
           "windows": windows, "percentileLabel": "roe, causal (prior observations only, today excluded)"}
    pct = {}
    for w in windows:
        prior = v[max(0, n - 1 - w): n - 1]
        pct[str(w)] = percentile_prior(cur, prior, math.ceil(frac * w))
    out["pct"] = pct
    prior_lvl = v[max(0, n - 1 - windows[0]): n - 1]
    out["z"] = _robust_z(cur, prior_lvl, math.ceil(frac * windows[0]))
    chg, chgz = {}, {}
    for k in horizons:
        ca = change_array(v, k, change_kind)
        if ca.size == 0 or not np.isfinite(ca[-1]):
            chg[str(k)], chgz[str(k)] = None, None
            continue
        chg[str(k)] = float(ca[-1])
        prior_c = ca[:-1][-windows[0]:]
        prior_c = prior_c[np.isfinite(prior_c)]
        chgz[str(k)] = _robust_z(float(ca[-1]), prior_c, math.ceil(frac * windows[0]) - k if windows[0] > k else 1)
    out["chg"], out["chgZ"] = chg, chgz
    out["changeKind"] = change_kind
    if pct[str(windows[0])] is None:
        out["status"] = "building"
    return out
