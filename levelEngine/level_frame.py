"""
level_frame — the calc-agnostic piece shared by every level source (COG, Original,
...). A "frame" is just {m1, daily, sigma, pct}; day_levels() slices one London day
out of it. touch_engine only ever talks to this shape, never to a specific calc.
"""
import numpy as np


def day_levels(frame, day_i):
    """Return the fixed-for-the-day pieces needed to build the 9 level series for one
    London day: bar slice [start:end), day open, and the 4 level fractions. None if
    sigma isn't warmed up yet for this day."""
    daily = frame['daily']
    if np.isnan(frame['sigma'][day_i]):
        return None
    start, end = daily['start'][day_i], daily['end'][day_i]
    o = daily['open'][day_i]
    return dict(
        start=start, end=end, open=o,
        hl50=frame['pct']['hl50'][day_i], hl75=frame['pct']['hl75'][day_i],
        oc50=frame['pct']['oc50'][day_i], oc75=frame['pct']['oc75'][day_i],
    )
