"""levels.py - section 18: price arriving at a location that matters.

The brief's practical question is not "what does a red dot mean" but "price is
at resistance - does the multi-timeframe VuManChu state tell me whether it
rejects, continues or reverses". That needs locations defined WITHOUT
VuManChu and without hindsight.

Levels used, all from COMPLETED periods only:
  pdh/pdl   prior day's high/low
  pwh/pwl   prior week's high/low
  n20h/n20l 20-day extreme (a swing level in the ordinary sense)

A "touch" is the first bar in a while to come within `tol` sigma of the level,
approached from the correct side. The re-arm window stops one slow drift along
a level from being counted as 200 independent touches, which would otherwise
dominate every statistic it appears in.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

TOL_SIGMA = 1.0
REARM_BARS = 48


def _prior_period_extremes(panel, freq):
    """High/low of the PREVIOUS completed period, step-held forward."""
    g = panel.groupby(panel.index.to_period(freq))
    hi = g['high'].max().shift(1)
    lo = g['low'].min().shift(1)
    per = panel.index.to_period(freq)
    return hi.reindex(per).to_numpy(), lo.reindex(per).to_numpy()


def _rolling_extreme(panel, days, base_per_day=288):
    w = int(days * base_per_day)
    hi = panel['high'].rolling(w, min_periods=w // 4).max().shift(1).to_numpy()
    lo = panel['low'].rolling(w, min_periods=w // 4).min().shift(1).to_numpy()
    return hi, lo


def build_levels(panel):
    out = {}
    out['pdh'], out['pdl'] = _prior_period_extremes(panel, 'D')
    out['pwh'], out['pwl'] = _prior_period_extremes(panel, 'W')
    out['n20h'], out['n20l'] = _rolling_extreme(panel, 20)
    return out


def touches(panel, level, is_resistance, tol=TOL_SIGMA, rearm=REARM_BARS):
    """Boolean mask of re-armed touches of `level`.

    Resistance is touched from below: the bar's high reaches the level while
    the previous close was under it. Support mirrors. Requiring the approach
    side stops a level that price is already living above from registering as
    a resistance test on every single bar.
    """
    h = panel['high'].to_numpy(float)
    l = panel['low'].to_numpy(float)
    c = panel['close'].to_numpy(float)
    s = panel['sigma_price'].to_numpy(float)
    lv = np.asarray(level, float)
    prev_c = np.concatenate([[np.nan], c[:-1]])

    if is_resistance:
        near = (h >= lv - tol * s) & (prev_c < lv)
    else:
        near = (l <= lv + tol * s) & (prev_c > lv)
    near &= np.isfinite(lv) & np.isfinite(s) & (s > 0)

    out = np.zeros(len(panel), dtype=bool)
    last = -10**9
    for i in np.where(near)[0]:
        if i - last >= rearm:
            out[i] = True
            last = i
    return out


def level_outcome(panel, level, is_resistance, horizon=48, k=2.0):
    """What happened after the touch, in the level's own frame.

    reject   = price moved away from the level by k sigma without first
               closing k sigma beyond it
    breakout = the opposite
    Returned as +1 breakout / -1 reject / 0 unresolved, so 'continue vs
    reverse' is stated relative to the LEVEL rather than to a prevailing trend.
    """
    h = panel['high'].to_numpy(float)
    l = panel['low'].to_numpy(float)
    c = panel['close'].to_numpy(float)
    s = panel['sigma_price'].to_numpy(float)
    n = len(c)
    out = np.zeros(n, dtype=np.int8)

    up_b = c + k * s
    dn_b = c - k * s
    chunk = 150000
    for lo_i in range(0, n, chunk):
        hi_i = min(lo_i + chunk, n - horizon)
        if hi_i <= lo_i:
            break
        sh = np.lib.stride_tricks.sliding_window_view(h[lo_i + 1:hi_i + horizon], horizon)
        sl = np.lib.stride_tricks.sliding_window_view(l[lo_i + 1:hi_i + horizon], horizon)
        u = sh >= up_b[lo_i:hi_i, None]
        d = sl <= dn_b[lo_i:hi_i, None]
        big = horizon + 1
        fu = np.where(u.any(axis=1), u.argmax(axis=1), big)
        fd = np.where(d.any(axis=1), d.argmax(axis=1), big)
        res = np.where(fu < fd, 1, np.where(fd < fu, -1, 0))
        res[(fu >= big) & (fd >= big)] = 0
        out[lo_i:hi_i] = res
    # At resistance, up = breakout. At support, down = breakout.
    return (out if is_resistance else -out).astype(np.int8)


def all_touches(panel):
    """Every level test, tagged, with its own breakout/reject label."""
    lv = build_levels(panel)
    rows = {}
    for name, is_res in (('pdh', True), ('pdl', False), ('pwh', True),
                         ('pwl', False), ('n20h', True), ('n20l', False)):
        t = touches(panel, lv[name], is_res)
        o = level_outcome(panel, lv[name], is_res)
        rows[name] = (t, o, is_res)
    return rows
