"""
level_frame — the calc-agnostic piece shared by every level source (COG, Original,
...). A "frame" is just {m1, daily, sigma, pct}; day_levels() slices one London day
out of it. touch_engine only ever talks to this shape, never to a specific calc.
"""
import datetime as _dt

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


def day_date(frame, day_i):
    """Calendar date ('YYYY-MM-DD') for daily index day_i, for joining touch
    records against a date-keyed external series (e.g. server.js's oi_history
    archive). frame['daily']['day_idx'][day_i] IS already days-since-epoch in
    Europe/London wall-clock terms (vol_exhaustion_lib.london_parts/
    build_london_daily), so this is a direct conversion, not a bar lookup.

    NB: the OI archive keys dates by a UTC-calendar-day + fixed boundary-hour
    rollover (server.js _rlSessionDate), not this Europe/London/BST-aware
    convention — the two can disagree by one day right at a session boundary.
    Acceptable for a day-level regime bucket study; not exact for anything
    that needs the two to agree to the minute."""
    epoch_day = int(frame['daily']['day_idx'][day_i])
    return (_dt.date(1970, 1, 1) + _dt.timedelta(days=epoch_day)).isoformat()
