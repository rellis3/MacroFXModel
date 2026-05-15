import time
import requests
from datetime import datetime, timezone

DASHBOARD_URL = 'https://macrofxmodel-production.up.railway.app'
STALE_THRESHOLD_S = 15 * 60  # 15 minutes — dashboard must be open to keep fresh


class StaleDataError(Exception):
    pass


def fetch_state(base_url: str = DASHBOARD_URL, timeout: int = 30) -> dict:
    resp = requests.get(f'{base_url}/api/state', timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def check_staleness(regime_snapshot: dict) -> float:
    """Returns age in seconds. Raises StaleDataError if too old."""
    pushed_at = regime_snapshot.get('pushed_at')
    if not pushed_at:
        raise StaleDataError('No pushed_at timestamp — dashboard has never written entries to KV')

    try:
        pushed_ts = datetime.fromisoformat(pushed_at.replace('Z', '+00:00')).timestamp()
    except (ValueError, TypeError):
        raise StaleDataError(f'Cannot parse pushed_at timestamp: {pushed_at!r}')

    age_s = time.time() - pushed_ts
    if age_s > STALE_THRESHOLD_S:
        raise StaleDataError(
            f'Dashboard data is {age_s / 60:.1f} min old '
            f'(limit {STALE_THRESHOLD_S // 60} min) — open the dashboard to refresh'
        )
    return age_s


def push_bot_status(status: dict, base_url: str = DASHBOARD_URL, timeout: int = 5) -> None:
    """Non-critical — swallows all errors so status reporting never kills the bot."""
    try:
        requests.put(f'{base_url}/api/bot/status', json=status, timeout=timeout)
    except Exception:
        pass
