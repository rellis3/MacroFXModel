from datetime import datetime, timedelta, timezone

try:                                    # tzdata may be absent (bare Windows)
    from zoneinfo import ZoneInfo
    _LONDON_TZ = ZoneInfo('Europe/London')
    _NY_TZ     = ZoneInfo('America/New_York')
except Exception:                       # noqa: BLE001 — any tz failure → manual rule
    _LONDON_TZ = None
    _NY_TZ     = None

# Unified grade → min confluence stars.  A single min_grade config key
# replaces the old tier + min_stars + tg_mode.min_grade trio.
_GRADE_MIN_STARS = {
    'A':  4,   # strict — highest-conviction only
    'B':  3,   # balanced (default)
    'C':  2,   # loose — more setups, more noise
    'D':  1,   # permissive — any confluence present
}

_GRADE_ORDER = {'A+': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'SKIP': 0}


def resolve_grade_thresholds(exec_cfg: dict) -> tuple[str, int]:
    """Returns (min_grade, min_stars) from the unified min_grade config key."""
    grade = (exec_cfg.get('min_grade') or 'B').upper()
    if grade not in _GRADE_MIN_STARS:
        grade = 'B'
    return grade, _GRADE_MIN_STARS[grade]


# ── DST-correct session clocks (Batch 6) ─────────────────────────────────────
# The old windows were fixed UTC hours (London open 07-09 UTC year-round),
# which drift one hour off for the ~7 months of BST. Sessions are defined by
# LOCAL market clocks, so compute them in Europe/London / America/New_York via
# zoneinfo, falling back to the manual last-Sunday DST rules (mirrors
# volatility_bot.engine._london_offset_hours) when tzdata is unavailable.

def _last_sunday_utc(year: int, month: int) -> datetime:
    d = datetime(year, month, 31, tzinfo=timezone.utc)   # Mar & Oct have 31 days
    return d - timedelta(days=(d.weekday() + 1) % 7)     # step back to Sunday


def _london_offset_hours(dt_utc: datetime) -> int:
    """UK clock offset from UTC at this instant: +1 during BST, 0 during GMT.
    Manual fallback rule — last Sunday of March 01:00 UTC → last Sunday of
    October 01:00 UTC (same rule as volatility_bot.engine)."""
    if _LONDON_TZ is not None:
        return int(dt_utc.astimezone(_LONDON_TZ).utcoffset().total_seconds() // 3600)
    bst_start = _last_sunday_utc(dt_utc.year, 3).replace(hour=1)
    bst_end   = _last_sunday_utc(dt_utc.year, 10).replace(hour=1)
    return 1 if bst_start <= dt_utc < bst_end else 0


def _nth_sunday_utc(year: int, month: int, n: int) -> datetime:
    d = datetime(year, month, 1, tzinfo=timezone.utc)
    first_sunday = d + timedelta(days=(6 - d.weekday()) % 7)
    return first_sunday + timedelta(days=7 * (n - 1))


def _ny_offset_hours(dt_utc: datetime) -> int:
    """US Eastern offset from UTC: −4 during EDT, −5 during EST.
    Manual fallback rule — 2nd Sunday of March 07:00 UTC → 1st Sunday of
    November 06:00 UTC."""
    if _NY_TZ is not None:
        return int(dt_utc.astimezone(_NY_TZ).utcoffset().total_seconds() // 3600)
    edt_start = _nth_sunday_utc(dt_utc.year, 3, 2).replace(hour=7)
    edt_end   = _nth_sunday_utc(dt_utc.year, 11, 1).replace(hour=6)
    return -4 if edt_start <= dt_utc < edt_end else -5


def session_threshold_mult(now_utc: datetime | None = None) -> float:
    """
    Returns a composite_threshold multiplier based on the LOCAL session clocks.
    London open (07-09 Europe/London) and NY open (08-10 America/New_York —
    the old 13-15 UTC winter window) are highest-probability windows.
    The Asian session (22-06 London time) is lowest probability.
    """
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)
    elif now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    lon_h = (now_utc.hour + _london_offset_hours(now_utc)) % 24
    ny_h  = (now_utc.hour + _ny_offset_hours(now_utc)) % 24
    if 7 <= lon_h < 9 or 8 <= ny_h < 10:
        return 0.90   # session opens — slightly more permissive
    if 22 <= lon_h or lon_h < 6:
        return 1.15   # Asian session — tighten threshold
    return 1.0        # main session hours


def pair_currencies(pair: str) -> set[str]:
    """Returns the set of currency codes involved in a pair."""
    _MAP = {
        'EUR/USD': {'EUR', 'USD'}, 'GBP/USD': {'GBP', 'USD'},
        'USD/JPY': {'USD', 'JPY'}, 'AUD/USD': {'AUD', 'USD'},
        'XAU/USD': {'USD'},        'EUR/GBP': {'EUR', 'GBP'},
        'USD/CAD': {'USD', 'CAD'}, 'USD/CHF': {'USD', 'CHF'},
        'GBP/JPY': {'GBP', 'JPY'}, 'NAS100_USD': {'USD'},
    }
    return _MAP.get(pair, set())


# Maps Finnhub country codes → currency codes
COUNTRY_CURRENCY = {
    'US': 'USD', 'EU': 'EUR', 'DE': 'EUR', 'FR': 'EUR', 'IT': 'EUR', 'ES': 'EUR',
    'GB': 'GBP', 'UK': 'GBP', 'JP': 'JPY', 'AU': 'AUD', 'CA': 'CAD',
    'CH': 'CHF', 'NZ': 'NZD', 'CN': 'CNY',
}
