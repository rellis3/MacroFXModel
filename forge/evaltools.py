"""Evaluation toolkit for the Forecaster system (plans/FORECASTER_SYSTEM_BLUEPRINT.md) — Lessons 1 and 2.

One tested home for the statistics every layer needs, instead of each study re-deriving them:

  Lesson 1 (one path among many)
    sharpe(returns, periods)                      annualised Sharpe ratio
    sharpe_se(returns, periods)                   its standard error, with the skewness/kurtosis terms
    prob_loss(sharpe_ann, years)                  Pr(loss over a horizon) = Φ(−S·√h) under the normal model
    stationary_bootstrap(x, mean_block, reps)     resampled index sets (runs of consecutive days)
    bootstrap_paths(returns, n_paths, mean_block) cumulative-return paths a record could have produced
    cornish_fisher_var(returns, alpha)            modified VaR (normal quantile adjusted for skew and kurtosis)
  Lesson 2 (the breadth of the search enters the evidence)
    expected_max_sharpe(n_trials, sr_std)         the best Sharpe you expect from N tries of pure noise
    deflated_sharpe(returns, n_trials, sr_std)    Pr(true Sharpe > that noise maximum)
  Used across layers 3-7
    clustered_mean(values, clusters)              mean and SE with clusters (e.g. trading dates)
    clustered_ratio(num, den, clusters)           a share (Σnum/Σden) and its clustered SE (delta method)
    control_diff(real, control)                   difference of two clustered estimates, its SE and z
    halves_agree(z1, z2, bar)                     the "same sign, beyond the bar, in both halves" rule

Sources: Lo (2002) and Mertens (2002) for the Sharpe SE; Politis & Romano (1994) stationary bootstrap; Bailey & López
de Prado (2014) deflated Sharpe; Cornish & Fisher (1937). Per-period quantities unless a function says annualised.
    python -m forge.test_evaltools
"""
from __future__ import annotations

import math

import numpy as np
from scipy import stats

EULER = 0.5772156649015329


# ── Lesson 1 ──────────────────────────────────────────────────────────────────
def sharpe(returns, periods: int = 252) -> float:
    r = np.asarray(returns, float)
    return float(r.mean() / r.std(ddof=1) * math.sqrt(periods))


def sharpe_se(returns, periods: int = 252) -> float:
    """Annualised standard error of the Sharpe ratio. Per period:
    Var(Ŝ) ≈ (1 + ½Ŝ² − γ₃Ŝ + ¼(γ₄ − 3)Ŝ²) / T, γ₃ skewness, γ₄ (raw) kurtosis. Positive skew narrows it,
    fat tails widen it (Lesson 1 §03); with normal returns it reduces to √((1 + ½Ŝ²)/T)."""
    r = np.asarray(r_ := returns, float)
    T = len(r)
    s = r.mean() / r.std(ddof=1)
    g3 = float(stats.skew(r))
    g4 = float(stats.kurtosis(r, fisher=False))
    var = (1 + 0.5 * s * s - g3 * s + 0.25 * (g4 - 3) * s * s) / T
    return float(math.sqrt(max(var, 0.0)) * math.sqrt(periods))


def prob_loss(sharpe_ann: float, years: float) -> float:
    """Pr(the cumulative return over `years` is negative) under the normal model: Φ(−S·√h)."""
    return float(stats.norm.cdf(-sharpe_ann * math.sqrt(years)))


def stationary_bootstrap(n: int, mean_block: float = 10.0, reps: int = 2000, rng=None) -> np.ndarray:
    """reps × n array of indices: runs of consecutive positions with geometric lengths (mean `mean_block`), wrapping
    at the end. Keeps the short-range dependence (clustering) a plain resample would destroy."""
    rng = rng if rng is not None else np.random.default_rng(0)
    p = 1.0 / mean_block
    out = np.empty((reps, n), dtype=np.int64)
    for k in range(reps):
        start = rng.integers(0, n, n)
        new_block = rng.random(n) < p
        new_block[0] = True
        idx = np.empty(n, dtype=np.int64)
        for i in range(n):
            idx[i] = start[i] if new_block[i] else (idx[i - 1] + 1) % n
        out[k] = idx
    return out


def bootstrap_paths(returns, n_paths: int = 200, mean_block: float = 10.0, rng=None) -> np.ndarray:
    """n_paths × T cumulative-return paths (simple compounding) from a stationary bootstrap of daily returns."""
    r = np.asarray(returns, float)
    idx = stationary_bootstrap(len(r), mean_block, n_paths, rng)
    return np.cumprod(1 + r[idx], axis=1) - 1


def cornish_fisher_var(returns, alpha: float = 0.01) -> float:
    """Modified VaR: the loss quantile (positive number) with the normal z adjusted for skewness and excess kurtosis."""
    r = np.asarray(returns, float)
    z = stats.norm.ppf(alpha)
    s, k = float(stats.skew(r)), float(stats.kurtosis(r, fisher=True))
    zcf = z + (z * z - 1) * s / 6 + (z ** 3 - 3 * z) * k / 24 - (2 * z ** 3 - 5 * z) * s * s / 36
    return float(-(r.mean() + zcf * r.std(ddof=1)))


# ── Lesson 2 ──────────────────────────────────────────────────────────────────
def expected_max_sharpe(n_trials: int, sr_std: float) -> float:
    """Expected maximum of n_trials Sharpe estimates when every true Sharpe is zero and the estimates spread with
    standard deviation sr_std (same periodicity as sr_std). Bailey & López de Prado (2014)."""
    if n_trials <= 1:
        return 0.0
    a = stats.norm.ppf(1 - 1.0 / n_trials)
    b = stats.norm.ppf(1 - 1.0 / (n_trials * math.e))
    return float(sr_std * ((1 - EULER) * a + EULER * b))


def deflated_sharpe(returns, n_trials: int, sr_std: float) -> float:
    """Pr(the true per-period Sharpe exceeds what the best of n_trials noise strategies would show), given this
    strategy's own skew/kurtosis and length. sr_std = per-period std of the Sharpe estimates across the trials.
    ≥ 0.95 is the usual bar."""
    r = np.asarray(returns, float)
    T = len(r)
    s = r.mean() / r.std(ddof=1)
    g3 = float(stats.skew(r))
    g4 = float(stats.kurtosis(r, fisher=False))
    s0 = expected_max_sharpe(n_trials, sr_std)
    denom = math.sqrt(max(1 - g3 * s + 0.25 * (g4 - 1) * s * s, 1e-12))
    return float(stats.norm.cdf((s - s0) * math.sqrt(T - 1) / denom))


# ── Clustered estimates (layers 3-7) ──────────────────────────────────────────
def clustered_mean(values, clusters) -> tuple[float, float]:
    """Mean and standard error treating each cluster (e.g. a trading date) as one independent draw."""
    v = np.asarray(values, float)
    c = np.asarray(clusters)
    m = v.mean()
    _, inv = np.unique(c, return_inverse=True)
    g = np.bincount(inv, weights=v - m)
    G = len(g)
    return float(m), float(math.sqrt((g ** 2).sum() * G / max(G - 1, 1)) / len(v))


def clustered_ratio(num, den, clusters) -> tuple[float, float]:
    """R = Σnum / Σden (e.g. continuation share among resolved races) with a clustered delta-method SE."""
    n_, d_ = np.asarray(num, float), np.asarray(den, float)
    _, inv = np.unique(np.asarray(clusters), return_inverse=True)
    N, D = np.bincount(inv, weights=n_), np.bincount(inv, weights=d_)
    R = N.sum() / D.sum()
    G = len(N)
    return float(R), float(math.sqrt(((N - R * D) ** 2).sum() * G / max(G - 1, 1)) / D.sum())


def control_diff(real: tuple[float, float], control: tuple[float, float]) -> dict:
    """real and control as (estimate, se). Returns diff, its SE (independent approximation — conservative when the
    two share dates) and z."""
    d = real[0] - control[0]
    se = math.hypot(real[1], control[1])
    return {"diff": d, "se": se, "z": d / se if se > 0 else 0.0}


def halves_agree(z1: float, z2: float, bar: float = 2.0) -> bool:
    """The repo's replication rule: beyond `bar` standard errors, the same sign, in both halves."""
    return abs(z1) > bar and abs(z2) > bar and np.sign(z1) == np.sign(z2)
