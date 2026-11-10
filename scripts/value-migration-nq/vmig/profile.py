"""Volume profile of one box: POC, VAH, VAL.

Definitions (fixed in the prereg, section 3):
  * Price grid: the NQ tick, 0.25 points.
  * Tier P (OHLCV): each minute's volume is spread evenly over every tick from its low to its high inclusive.
    Tier T (footprint): each minute's volume sits at the prices it actually traded at.
  * POC = the tick with the most volume. Ties -> the tied tick nearest the box VWAP (VWAP from the same
    distribution), then the lower one.
  * Value area = 70% of box volume, built CBOT-style one tick at a time: start at the POC, compare the next tick
    above with the next tick below and add the larger (tie -> above), until the area holds >= 70%.
  * VAH / VAL = the top / bottom tick of that area.
  * A box with zero volume (no prints at all) takes POC = VAH = VAL = its close.
All inputs are the box's own minutes, so the profile of box k is known at the close of box k's last minute.
"""
from __future__ import annotations

import numpy as np

from .data import TICK

VA_FRACTION = 0.70


def _distribution_uniform(lows, highs, vols):
    lo_t = np.round(lows / TICK).astype(np.int64)
    hi_t = np.round(highs / TICK).astype(np.int64)
    base = lo_t.min()
    n = int(hi_t.max() - base + 1)
    diff = np.zeros(n + 1)
    width = hi_t - lo_t + 1
    per = vols / width
    np.add.at(diff, lo_t - base, per)
    np.add.at(diff, hi_t - base + 1, -per)
    return base, np.cumsum(diff[:-1])


def _distribution_footprint(levels):
    """levels: list of (prices, buy, sell) per minute."""
    p = np.concatenate([x[0] for x in levels])
    v = np.concatenate([x[1] + x[2] for x in levels])
    t = np.round(p / TICK).astype(np.int64)
    base = t.min()
    out = np.zeros(int(t.max() - base + 1))
    np.add.at(out, t - base, v)
    return base, out


def profile_from_distribution(base: int, vol: np.ndarray, frac: float = VA_FRACTION):
    """Return (poc, vah, val) in points from a tick-indexed volume distribution."""
    total = vol.sum()
    n = len(vol)
    if total <= 0 or n == 0:
        return None
    idx = np.arange(n)
    vwap_i = (idx * vol).sum() / total
    mx = vol.max()
    tied = np.flatnonzero(vol >= mx - 1e-12 * max(mx, 1.0))
    poc = int(tied[np.argmin(np.abs(tied - vwap_i) + 1e-9 * tied)])  # nearest VWAP, then lower
    target = frac * total
    lo = hi = poc
    acc = vol[poc]
    while acc < target - 1e-9:
        up = vol[hi + 1] if hi + 1 < n else -1.0
        dn = vol[lo - 1] if lo - 1 >= 0 else -1.0
        if up < 0 and dn < 0:
            break
        if up >= dn:
            hi += 1
            acc += up
        else:
            lo -= 1
            acc += dn
    return ((base + poc) * TICK, (base + hi) * TICK, (base + lo) * TICK)


def box_profile(lows, highs, vols, closes, footprint_levels=None, frac: float = VA_FRACTION):
    if footprint_levels:
        base, dist = _distribution_footprint(footprint_levels)
    else:
        if vols.sum() <= 0:
            c = float(closes[-1])
            return c, c, c
        base, dist = _distribution_uniform(np.asarray(lows, float), np.asarray(highs, float), np.asarray(vols, float))
    r = profile_from_distribution(base, dist, frac)
    if r is None:
        c = float(closes[-1])
        return c, c, c
    return r
