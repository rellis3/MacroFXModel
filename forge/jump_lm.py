"""Lee-Mykland burst detector on a 5-minute London grid, causal, no forward-filled zeros (forge/JUMP_AFTER_PREREG.md).

C is a sessions x slots matrix of last closes (NaN = empty slot). Value [i, s] uses data up to and including that slot,
with the time-of-day factor and local vol drawn only from what came before it. On 5-minute bars these are bursts rather
than true discontinuities (Christensen, Oomen, Podolskij 2014).
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

K = 270
ALPHA = 0.01
N_SLOT = 264
FLOOR = 0.25
C_BP = math.sqrt(2.0 / math.pi)


def threshold(n: int = N_SLOT, alpha: float = ALPHA) -> float:
    """Gumbel critical value for max|L| over n returns (Lee & Mykland 2008)."""
    ln_n = math.log(n)
    s2 = math.sqrt(2.0 * ln_n)
    c_n = s2 / C_BP - (math.log(math.pi) + math.log(ln_n)) / (2.0 * C_BP * s2)
    s_n = 1.0 / (C_BP * s2)
    return c_n + s_n * (-math.log(-math.log(1.0 - alpha)))


def grid_returns(C: np.ndarray) -> np.ndarray:
    r = np.full_like(C, np.nan, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        r[:, 1:] = np.log(C[:, 1:] / C[:, :-1])              # NaN across a hole: dropped, never zero-filled
    return r


def tod_factor(r: np.ndarray, win: int = 250, min_periods: int = 120, floor: float = FLOOR) -> np.ndarray:
    """Per-slot median |r| over the previous `win` sessions, normalised to mean square 1 across the day, floored."""
    med = pd.DataFrame(np.abs(r)).rolling(win, min_periods=min_periods).median().shift(1).to_numpy()
    with np.errstate(invalid="ignore", divide="ignore"):
        norm = np.sqrt(np.nanmean(med ** 2, axis=1, keepdims=True))
        f = med / norm
    f = np.where(np.isfinite(f), np.maximum(f, floor), np.nan)
    return f


def local_sigma(rt: np.ndarray, k: int = K) -> np.ndarray:
    """sqrt(mean |x_t||x_t-1|) over the previous k grid steps, strictly before each bar. Sessions are laid end to end;
    the first slot of a session is NaN, so no product spans the overnight gap."""
    x = np.abs(rt).ravel()
    prod = np.full_like(x, np.nan)
    prod[1:] = x[1:] * x[:-1]
    s = pd.Series(prod).rolling(k, min_periods=k // 2).mean().shift(1).to_numpy()
    return np.sqrt(s).reshape(rt.shape)


def detect(C: np.ndarray, alpha: float = ALPHA) -> dict:
    """Returns r, L (standardised return), flag (|L| over the critical value) and crit. Sessions without a usable
    time-of-day factor yet are NaN, so unflagged."""
    r = grid_returns(C)
    f = tod_factor(r)
    rt = r / f
    # local vol is built on factor-adjusted returns, with no factor yet giving NaN
    sig = local_sigma(rt)
    with np.errstate(invalid="ignore", divide="ignore"):
        L = rt / sig
    crit = threshold(C.shape[1], alpha)
    return {"r": r, "L": L, "flag": np.abs(L) > crit, "crit": crit}


def first_flags(flag: np.ndarray) -> np.ndarray:
    """Slot of the first flag per session, -1 if none."""
    any_ = flag.any(axis=1)
    return np.where(any_, flag.argmax(axis=1), -1)
