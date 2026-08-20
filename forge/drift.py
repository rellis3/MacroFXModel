"""drift — conditioning the one-sided O-H / O-L rungs on trailing drift.

## The measurement that motivates this

The shipped ladder fits O-H and O-L separately, which captures each instrument's
STRUCTURAL asymmetry (equity indices fall harder than they rise). It does not know
which way the market has been leaning lately. Measured across drift terciles on 2,982
OOS days over 10 instruments:

    trailing drift    O-H p50    O-H p75    O-L p50    O-L p75
    down third          42.1%      18.3%      55.4%      33.1%
    flat third          50.5%      23.1%      45.9%      20.6%
    up   third          56.6%      30.7%      44.0%      18.9%
    (targets)           50.0%      25.0%      50.0%      25.0%

A 14.5pp swing on O-H p50, and proportionally larger at p75. So the rung labelled
"the high reaches here on 25% of days" means 18% of days in a downtrend and 31% in an
uptrend. Worth fixing: these are the levels that get faded.

## Two candidate forms, chosen by out-of-sample pinball loss

    linear   level = m * (1 + beta*d) * sigma          two free parameters (m, beta)
    bm       level = s * Q(d, p) * sigma               one free parameter (s)

`Q(d, p)` is the p-th quantile of the running maximum of a Brownian motion with
drift d — the textbook result, so the SHAPE of the drift response comes from theory
and only its level is fit. This is the same function the old v2 export lines used
(`_bmMaxQuantile` in js/volForecast.js); what was wrong there was never the shape, it
was the magnitude, which came from `oc_50_corr` — a constant fit for CLOSE
displacement and now orphaned everywhere else.

Both are fit on train only and scored OOS on pinball loss, the same proper scoring
rule the estimator selection uses. A third arm, `none` (the shipped drift-blind
fit), is always in the comparison so the honest outcome "drift conditioning does not
earn its keep here" remains reachable.

## Sign convention

`d > 0` is an uptrend. It widens O-H and narrows O-L, so the O-L side is fit against
`-d`. That mirrors the reflection the analytic form already performs and keeps a
single fitted object per side.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import norm

from forge.vol import SQRT252, fit_width_multiplier, pinball_loss

DRIFT_WIN = 14          # matches js/volForecast.js `_driftD`
DRIFT_CLIP = 2.0
BETA_GRID = np.round(np.arange(-0.20, 1.01, 0.05), 4)


def bm_max_quantile(d: float | np.ndarray, p: float) -> np.ndarray:
    """p-th quantile of max_{t<=1} of a BM with drift d and unit variance.

    Bisection on the closed-form CDF
        F(x) = Phi(x - d) - exp(2 d x) * Phi(-x - d)
    Vectorised over d; a direct port of `_bmMaxQuantile` in js/volForecast.js, kept
    numerically identical so the live page and the fit cannot disagree.
    """
    d = np.atleast_1d(np.asarray(d, dtype=float))
    lo = np.zeros_like(d)
    hi = np.abs(d) + 6.0
    for _ in range(64):
        mid = (lo + hi) / 2.0
        f = norm.cdf(mid - d) - np.exp(np.clip(2 * d * mid, -700, 700)) * norm.cdf(-mid - d)
        below = f < p
        lo = np.where(below, mid, lo)
        hi = np.where(below, hi, mid)
    return (lo + hi) / 2.0


def mu_series(daily: pd.DataFrame, win: int = DRIFT_WIN) -> pd.Series:
    """Mean of the last `win` close-to-close log returns, as of each bar's CLOSE —
    the same causal convention the volatility estimators use, so the same
    `as_of_yesterday` shift applies to it."""
    c = daily["close"].to_numpy(dtype=float)
    r = np.full(len(c), np.nan)
    r[1:] = np.log(c[1:] / c[:-1])
    return pd.Series(pd.Series(r).rolling(win).mean().to_numpy(), index=daily.index)


def frame_drift(frame: pd.DataFrame, daily: pd.DataFrame, estimator: str,
                win: int = DRIFT_WIN) -> np.ndarray:
    """Forecast-ready d = mu / sigma per FRAME row.

    Both halves are shifted one bar so the value on row t uses only information
    available before bar t traded — mu from closes through t-1, and the frame's sigma
    column, which `build_forecast_frame` has already shifted. Clipped to +/-2, the
    same bound js/volForecast.js `_driftD` applies.
    """
    from forge.vol import as_of_yesterday
    mu = mu_series(daily, win).reindex(pd.DatetimeIndex(frame["date"])).to_numpy()
    mu = as_of_yesterday(mu)                       # mu as of the PREVIOUS close
    sig_d = frame[f"sigma_{estimator}"].to_numpy() / SQRT252 / 100.0   # already shifted
    with np.errstate(divide="ignore", invalid="ignore"):
        d = np.where(sig_d > 0, mu / sig_d, np.nan)
    return np.clip(d, -DRIFT_CLIP, DRIFT_CLIP)


# ── the three candidate forms ────────────────────────────────────────────────

def _fit_none(sig: np.ndarray, actual: np.ndarray, d: np.ndarray, tau: float) -> dict:
    return {"form": "none", "m": fit_width_multiplier(sig, actual, tau)}


def _fit_linear(sig: np.ndarray, actual: np.ndarray, d: np.ndarray, tau: float) -> dict:
    """Grid over beta; for each, the multiplier is the tau-quantile of
    realized / (sigma * (1 + beta*d)). Pick the beta with the lowest TRAIN pinball."""
    best = None
    for beta in BETA_GRID:
        adj = 1.0 + beta * d
        ok = np.isfinite(adj) & (adj > 0.1)
        if ok.sum() < 60:
            continue
        m = fit_width_multiplier(sig[ok] * adj[ok], actual[ok], tau)
        if not np.isfinite(m):
            continue
        pred = m * sig * adj
        loss = float(np.nanmean(pinball_loss(actual[ok], pred[ok], tau)))
        if best is None or loss < best["loss"]:
            best = {"form": "linear", "m": float(m), "beta": float(beta), "loss": loss}
    return best or {"form": "linear", "m": float("nan"), "beta": 0.0}


def _fit_bm(sig: np.ndarray, actual: np.ndarray, d: np.ndarray, tau: float) -> dict:
    """Shape from the drifted-BM running-max quantile; only the scale is fit."""
    q = bm_max_quantile(np.nan_to_num(d, nan=0.0), tau)
    ok = np.isfinite(q) & (q > 1e-6)
    if ok.sum() < 60:
        return {"form": "bm", "s": float("nan")}
    s = fit_width_multiplier(sig[ok] * q[ok], actual[ok], tau)
    return {"form": "bm", "s": float(s)}


def predict(spec: dict, sig: np.ndarray, d: np.ndarray, tau: float) -> np.ndarray:
    if spec["form"] == "none":
        return spec["m"] * sig
    if spec["form"] == "linear":
        return spec["m"] * sig * (1.0 + spec["beta"] * d)
    q = bm_max_quantile(np.nan_to_num(d, nan=0.0), tau)
    return spec["s"] * sig * q


def fit_and_score(frame: pd.DataFrame, daily: pd.DataFrame, estimator: str,
                  split: pd.Timestamp, taus=(0.50, 0.75, 0.90)) -> dict:
    """Fit all three forms per side per rung on train; score each on test.

    Returns the per-rung winner by OOS pinball loss, alongside every arm's numbers so
    a marginal win is visible as marginal rather than presented as a result.
    """
    sig = frame[f"sigma_{estimator}"].to_numpy() / SQRT252     # daily sigma, % of price
    d = frame_drift(frame, daily, estimator)

    dates = pd.DatetimeIndex(frame["date"])
    tr = dates < split
    te = ~tr
    out = {"n_train": int(tr.sum()), "n_test": int(te.sum()), "rungs": {}}

    for side, col in (("oh", "oh_pct"), ("ol", "ol_pct")):
        if col not in frame:
            continue
        actual = frame[col].to_numpy()
        dd = d if side == "oh" else -d          # an uptrend narrows the downside
        for tau in taus:
            key = f"{side}_p{int(tau * 100)}"
            arms = {}
            for name, fn in (("none", _fit_none), ("linear", _fit_linear), ("bm", _fit_bm)):
                spec = fn(sig[tr], actual[tr], dd[tr], tau)
                scale = spec.get("m", spec.get("s"))
                if scale is None or not np.isfinite(scale):
                    continue                      # this arm could not be fit; skip it
                pred = predict(spec, sig[te], dd[te], tau)
                ok = np.isfinite(pred) & np.isfinite(actual[te])
                if ok.sum() < 30:
                    continue
                arms[name] = {
                    **spec,
                    "oos_pinball": float(np.mean(pinball_loss(actual[te][ok], pred[ok], tau))),
                    "oos_exceed": float((actual[te][ok] > pred[ok]).mean()),
                }
            if not arms:
                continue
            win = min(arms, key=lambda k: arms[k]["oos_pinball"])
            out["rungs"][key] = {"winner": win, "arms": arms}
    return out


def exceed_by_drift_tercile(frame: pd.DataFrame, daily: pd.DataFrame, estimator: str,
                            spec_by_rung: dict, split: pd.Timestamp) -> dict:
    """The acceptance test: does each rung hit its nominal rate in EVERY drift
    bucket, not just on average? A form that fixes the mean while leaving the
    terciles spread has not fixed anything a trader would notice."""
    sig = frame[f"sigma_{estimator}"].to_numpy() / SQRT252
    d = frame_drift(frame, daily, estimator)
    dates = pd.DatetimeIndex(frame["date"])
    te = dates >= split
    lo, hi = np.nanquantile(d[te], [1 / 3, 2 / 3])
    buckets = {"down": d <= lo, "flat": (d > lo) & (d < hi), "up": d >= hi}
    out = {}
    for key, spec in spec_by_rung.items():
        side, p = key.split("_p")
        tau = int(p) / 100
        actual = frame[f"{side}_pct"].to_numpy()
        dd = d if side == "oh" else -d
        pred = predict(spec, sig, dd, tau)
        out[key] = {}
        for b, sel in buckets.items():
            m = sel & te & np.isfinite(pred) & np.isfinite(actual)
            out[key][b] = round(float((actual[m] > pred[m]).mean()), 4) if m.sum() > 20 else None
    return out
