"""trade_window — "is now inside the bot's trading hours", parsed rather than
compared as text.

Every bot wrote this the same way:

    now = datetime.now(timezone.utc).strftime('%H:%M')
    return cfg.get('trade_window_start', '07:00') <= now <= cfg.get('trade_window_end', '20:00')

That is a LEXICOGRAPHIC comparison on strings. It happens to be correct only
because every value involved is zero-padded to exactly HH:MM. A config holding
`"7:00"` — which any human editing JSON would write without a second thought —
silently compares as greater than `"20:00"` ('7' > '2'), and the window closes
permanently with nothing logged and no error raised. The failure is total and
invisible, which is the worst combination.

Parsing to minutes-since-midnight removes the class of bug entirely, and lets
the same helper handle a window that wraps past midnight (start > end), which
the string form got wrong too.

    from pylego.trade_window import within_window
    within_window(cfg.get('trade_window_start'), cfg.get('trade_window_end'))

Run tests:  python pylego/trade_window_test.py
"""
from __future__ import annotations

from datetime import datetime, timezone


def parse_hhmm(value, default_minutes: int | None = None) -> int | None:
    """'HH:MM' (or 'H:MM', or 'HH') -> minutes since midnight.

    Returns `default_minutes` for anything unparseable, so a malformed config
    falls back to a stated default instead of silently comparing as text. An
    int/float input is accepted as an HOUR (several configs store window_start
    as a bare hour number).
    """
    if value is None:
        return default_minutes
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        h = int(value)
        return h * 60 if 0 <= h <= 24 else default_minutes
    text = str(value).strip()
    if not text:
        return default_minutes
    parts = text.split(':')
    try:
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
    except (ValueError, IndexError):
        return default_minutes
    if not (0 <= h <= 24 and 0 <= m < 60):
        return default_minutes
    return h * 60 + m


def within_window(start, end, now=None, default_start='00:00', default_end='23:59') -> bool:
    """True when `now` (UTC, defaults to the real clock) is inside [start, end].

    Inclusive at both ends, matching the `start <= now <= end` the bots used.
    A window whose start is AFTER its end is treated as wrapping past midnight
    (e.g. 22:00 -> 04:00), which the string comparison silently got wrong.
    """
    now = datetime.now(timezone.utc) if now is None else now
    now_min = now.hour * 60 + now.minute
    s = parse_hhmm(start, parse_hhmm(default_start, 0))
    e = parse_hhmm(end, parse_hhmm(default_end, 24 * 60 - 1))
    if s <= e:
        return s <= now_min <= e
    return now_min >= s or now_min <= e      # wraps midnight
