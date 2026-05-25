from datetime import datetime, timezone

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


def session_threshold_mult(now_utc: datetime | None = None) -> float:
    """
    Returns a composite_threshold multiplier based on UTC hour.
    London open (07-09) and NY open (13-15) are highest-probability windows.
    Asian session (22-06) is lowest probability.
    """
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)
    h = now_utc.hour
    if 7 <= h < 9 or 13 <= h < 15:
        return 0.90   # session opens — slightly more permissive
    if 22 <= h or h < 6:
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
