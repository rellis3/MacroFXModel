"""Dashboard KV / status client (Category-B brick).

Thin wrapper over the dashboard's generic KV API + the bot-status push, so every
bot reads/writes config, plan and status the same way. The HTTP client is
injected (defaults to ``requests``) so this is offline-testable with a fake.

  kv = KvClient(base_url)
  plan = kv.get_json('volatility_bot_plan')          # {data, timestamp} unwrapped
  kv.put_json('volatility_bot_config', cfg)
  kv.put_status('volatility_bot_status', status)     # writes {data, timestamp} envelope

Network calls retry transient transport errors (read/connect timeouts, dropped
connections) with exponential backoff — a single slow response from a cold
Railway dyno must not crash a long-running bot. After the retries are exhausted
the original error is re-raised, so a genuine outage surfaces as a clear failure
(callers in the loop catch it and keep running on the last-known state).
"""
from __future__ import annotations

import time

# A transport error worth retrying: the request never got a usable HTTP response
# (timeout, connection reset, pool exhaustion). Matched by class name so this
# brick stays importable without `requests` and works with any injected client.
_TRANSIENT_HINTS = ('timeout', 'connection', 'temporarilyunavailable', 'maxretry')


def _is_transient(exc: Exception) -> bool:
    name = type(exc).__name__.lower()
    return any(h in name for h in _TRANSIENT_HINTS)


class KvClient:
    def __init__(self, base_url: str, http=None, timeout: int = 15,
                 retries: int = 3, backoff: float = 1.5, sleep=time.sleep):
        self.base = base_url.rstrip('/')
        self.timeout = timeout
        self.retries = max(1, retries)
        self.backoff = backoff
        self._sleep = sleep
        if http is None:
            import requests  # lazy — keeps the brick importable without the dep in tests
            http = requests
        self.http = http

    def _with_retries(self, fn):
        """Run `fn` (one HTTP attempt), retrying only transient transport errors
        with exponential backoff. Non-transient errors (bad status, JSON, etc.)
        propagate immediately; the last transient error is re-raised on exhaustion."""
        last = None
        for attempt in range(self.retries):
            try:
                return fn()
            except Exception as e:                 # noqa: BLE001 — re-raised below
                if not _is_transient(e):
                    raise
                last = e
                if attempt < self.retries - 1:
                    self._sleep(self.backoff * (2 ** attempt))
        raise last

    # ── reads ────────────────────────────────────────────────────────────────
    def get_json(self, key: str):
        """GET /api/kv/get?key=… → the stored value. The worker returns
        ``{data, timestamp}`` (or ``{miss: true}``); we return ``data`` — exactly
        what the dashboard's ``kvGet`` does. None if absent/blank."""
        def _do():
            r = self.http.get(f'{self.base}/api/kv/get', params={'key': key}, timeout=self.timeout)
            if getattr(r, 'status_code', 200) == 404:
                return None
            r.raise_for_status()
            body = r.json()
            if not isinstance(body, dict) or body.get('miss'):
                return None
            return body.get('data', body)
        return self._with_retries(_do)

    # ── writes ───────────────────────────────────────────────────────────────
    def put_json(self, key: str, data, *, ts: int | None = None) -> None:
        """POST /api/kv/set with the worker's body shape ``{key, data, timestamp}``
        (matches the dashboard's ``kvSet``). NOTE: keys matching
        credentials/config/override require an X-Auth-Token the BOT never sends —
        the bot only WRITES its status key (unauthenticated) and READS config."""
        def _do():
            r = self.http.post(f'{self.base}/api/kv/set',
                               json={'key': key, 'data': data, 'timestamp': ts if ts is not None else _now_ms()},
                               timeout=self.timeout)
            r.raise_for_status()
        self._with_retries(_do)

    def put_status(self, key: str, status: dict, *, ts: int | None = None) -> None:
        """Write the bot's runtime status under its own ``{bot}_status`` key. The
        worker wraps it as ``{data, timestamp}``; the positions page reads ``data``."""
        self.put_json(key, status, ts=ts)


def _now_ms() -> int:
    return int(time.time() * 1000)
