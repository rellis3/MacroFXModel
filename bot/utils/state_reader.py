import time
import requests
from datetime import datetime, timezone

DASHBOARD_URL = 'https://macrofxmodel-production.up.railway.app'
STALE_THRESHOLD_S = 60 * 60  # 60 minutes — bot proactively refreshes KV every state cycle


class StaleDataError(Exception):
    pass


def fetch_state(base_url: str = DASHBOARD_URL, timeout: int = 30) -> dict:
    # On Windows, the first HTTPS connection triggers a slow CA-bundle load that
    # can receive a spurious KeyboardInterrupt from the terminal. Retry once.
    for attempt in range(2):
        try:
            resp = requests.get(f'{base_url}/api/state', timeout=timeout)
            resp.raise_for_status()
            state = resp.json()
            # Fetch gold model separately (pushed by browser after FRED refresh)
            # and attach it to regime_snapshot for gold_macro_module to consume.
            _attach_gold_model(state, base_url, timeout)
            # Fetch per-pair ARIMA price stability (pushed by browser on each alert tick)
            _attach_arima_price(state, base_url, timeout)
            return state
        except KeyboardInterrupt:
            if attempt == 0:
                time.sleep(0.5)
                continue
            raise


def _attach_gold_model(state: dict, base_url: str, timeout: int) -> None:
    """Fetches gold model from KV and injects into regime_snapshot.gold_model."""
    try:
        resp = requests.get(f'{base_url}/api/kv/get?key=ai_goldmodel', timeout=timeout)
        if resp.status_code != 200:
            return
        j = resp.json()
        if j.get('miss') or not j.get('data'):
            return
        snap = state.setdefault('regime_snapshot', {})
        snap['gold_model'] = j['data']
    except Exception:
        pass  # non-critical — gold_macro_module will handle missing data gracefully


def _attach_arima_price(state: dict, base_url: str, timeout: int) -> None:
    """
    Fetches per-pair ARIMA price stability from KV and injects into
    regime_snapshot.pairs[sym].arima for regime_confidence_module to consume.

    Keys are written by the browser dashboard (alerts.js) every 5 min per pair:
      arima_price_EURUSD, arima_price_XAUUSD, arima_price_GBPUSD, etc.
    """
    snap       = state.setdefault('regime_snapshot', {})
    pairs_snap = snap.setdefault('pairs', {})

    for sym in list(pairs_snap.keys()):
        kv_key = f'arima_price_{sym.replace("/", "")}'
        try:
            resp = requests.get(f'{base_url}/api/kv/get?key={kv_key}', timeout=timeout)
            if resp.status_code != 200:
                continue
            j = resp.json()
            if j.get('miss') or not j.get('data'):
                continue
            pairs_snap[sym].setdefault('arima', {}).update(j['data'])
        except Exception:
            pass  # non-critical — regime_confidence_module defaults gracefully


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


def fetch_quote(pair: str, base_url: str = DASHBOARD_URL, timeout: int = 5) -> float | None:
    """Fetches current price from dashboard /api/quote. Used as MT5-less fallback."""
    try:
        resp = requests.get(
            f'{base_url}/api/quote?symbol={pair}',
            timeout=timeout,
        )
        resp.raise_for_status()
        price = float(resp.json().get('price') or 0)
        return price if price > 0 else None
    except Exception:
        return None


def trigger_refresh(base_url: str = DASHBOARD_URL, timeout: int = 15) -> tuple[bool, list]:
    """Ask the server to touch KV entry timestamps so the staleness gate passes."""
    try:
        resp = requests.post(f'{base_url}/api/refresh', timeout=timeout)
        if resp.status_code == 200:
            data = resp.json()
            return True, data.get('refreshed', [])
        return False, []
    except Exception:
        return False, []


def push_bot_status(status: dict, base_url: str = DASHBOARD_URL, timeout: int = 5) -> None:
    """Non-critical — swallows all errors so status reporting never kills the bot."""
    try:
        requests.put(f'{base_url}/api/bot/status', json=status, timeout=timeout)
    except Exception:
        pass
