"""
touch_engine — for every COG level, every day: find the FIRST touch, then label
what happened next with a causal two-barrier race (continuation vs reversion vs
no-react), same discipline as volatilityExhaustion/measure.py's two-barrier test
(theta*sigma barriers, driftless null = 50/50 if the level carries no information).

A "touch" = intrabar high/low crosses a level that was already established using
bars strictly BEFORE the current one (so the level can't be touched by the same
bar that creates it — no lookahead).

Continuation = price extends theta*sigma further in the level's own direction
before it retraces theta*sigma back through the level (reversion). Whichever
barrier is hit first, within `horizon_min` minutes, wins; neither hit -> no_react.
"""
import numpy as np
from level_frame import day_levels

LEVELS = ['proj_H_75', 'proj_H_med', 'close_up_75', 'close_up_med',
          'open', 'close_dn_med', 'close_dn_75', 'proj_L_med', 'proj_L_75']
UPSIDE = {'proj_H_75', 'proj_H_med', 'close_up_75', 'close_up_med'}
DOWNSIDE = {'close_dn_med', 'close_dn_75', 'proj_L_med', 'proj_L_75'}


def _level_series(dl, high, low):
    """Build the 9 level price series for one day's bars (vectorized), each dynamic
    per-bar where the pine script is dynamic (Proj H/L) and flat where it isn't
    (Close bands, Open)."""
    n = high.size
    prior_low = np.empty(n)
    prior_low[0] = dl['open']
    if n > 1:
        prior_low[1:] = np.minimum.accumulate(low)[:-1]
    prior_high = np.empty(n)
    prior_high[0] = dl['open']
    if n > 1:
        prior_high[1:] = np.maximum.accumulate(high)[:-1]

    o = dl['open']
    return {
        'proj_H_75':    prior_low * (1 + dl['hl75']),
        'proj_H_med':   prior_low * (1 + dl['hl50']),
        'close_up_75':  np.full(n, o * (1 + dl['oc75'])),
        'close_up_med': np.full(n, o * (1 + dl['oc50'])),
        'open':         np.full(n, o),
        'close_dn_med': np.full(n, o * (1 - dl['oc50'])),
        'close_dn_75':  np.full(n, o * (1 - dl['oc75'])),
        'proj_L_med':   prior_high * (1 - dl['hl50']),
        'proj_L_75':    prior_high * (1 - dl['hl75']),
    }


def _first_touch(level, series, high, low):
    hit = (high >= series) if level in UPSIDE else (low <= series)
    idx = np.flatnonzero(hit)
    return int(idx[0]) if idx.size else None


def _race(level, series, touch_idx, high, low, barrier_price, horizon_min):
    """theta*sigma two-barrier race starting the bar AFTER the touch bar."""
    n = high.size
    lo_bound = touch_idx + 1
    hi_bound = min(n, touch_idx + 1 + horizon_min)
    if lo_bound >= n:
        return 'no_react', 0
    level_px = series[touch_idx]
    if level in UPSIDE:
        cont_px = level_px + barrier_price
        rev_px = level_px - barrier_price
        cont_hit = np.flatnonzero(high[lo_bound:hi_bound] >= cont_px)
        rev_hit = np.flatnonzero(low[lo_bound:hi_bound] <= rev_px)
    else:
        cont_px = level_px - barrier_price
        rev_px = level_px + barrier_price
        cont_hit = np.flatnonzero(low[lo_bound:hi_bound] <= cont_px)
        rev_hit = np.flatnonzero(high[lo_bound:hi_bound] >= rev_px)

    c = cont_hit[0] if cont_hit.size else None
    r = rev_hit[0] if rev_hit.size else None
    bars_avail = hi_bound - lo_bound
    if c is None and r is None:
        return 'no_react', bars_avail
    if r is None or (c is not None and c < r):
        return 'continuation', int(c)
    if c is None or (r is not None and r < c):
        return 'reversion', int(r)
    return 'ambiguous', int(c)   # same-bar tie, both barriers hit in one candle


def scan_day(frame, day_i, theta=0.25, horizon_min=60):
    """Return a list of {level, outcome, day_i} records, one per level touched
    (skipped if the level is never touched that day, or sigma isn't warmed up)."""
    dl = day_levels(frame, day_i)
    if dl is None:
        return []
    m1 = frame['m1']
    s, e = dl['start'], dl['end']
    high, low = m1['high'][s:e], m1['low'][s:e]
    if high.size < 2:
        return []

    series_by_level = _level_series(dl, high, low)
    sigma_i = frame['sigma'][day_i]
    barrier_price = theta * sigma_i * dl['open']

    out = []
    for level in LEVELS:
        series = series_by_level[level]
        touch_idx = _first_touch(level, series, high, low)
        if touch_idx is None:
            continue
        outcome, _ = _race(level, series, touch_idx, high, low, barrier_price, horizon_min)
        out.append(dict(level=level, outcome=outcome, day_i=int(day_i),
                         touch_min=int(touch_idx), level_px=float(series[touch_idx]),
                         barrier_price=float(barrier_price)))
    return out


def scan_all(frame, theta=0.25, horizon_min=60):
    n_days = frame['daily']['day_idx'].size
    records = []
    for day_i in range(n_days):
        records.extend(scan_day(frame, day_i, theta, horizon_min))
    return records
