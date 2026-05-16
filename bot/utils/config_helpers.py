from datetime import datetime, timezone

_TIER_MIN_STARS = {
    'strict':     4,
    'balanced':   3,
    'loose':      2,
    'aggressive': 1,
}


def resolve_min_stars(exec_cfg: dict) -> int:
    """Resolves tier name → min star count. Falls back to explicit min_stars or 3."""
    tier = (exec_cfg.get('tier') or 'balanced').lower()
    if tier == 'auto':
        return exec_cfg.get('min_stars', 3)
    return _TIER_MIN_STARS.get(tier, exec_cfg.get('min_stars', 3))


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
