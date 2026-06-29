"""Dashboard KV / status client (Category-B brick).

Thin wrapper over the dashboard's generic KV API + the bot-status push, so every
bot reads/writes config, plan and status the same way. The HTTP client is
injected (defaults to ``requests``) so this is offline-testable with a fake.

  kv = KvClient(base_url)
  plan = kv.get_json('volatility_bot_plan')          # {data, timestamp} unwrapped
  kv.put_json('volatility_bot_config', cfg)
  kv.put_status('volatility_bot_status', status)     # writes {data, timestamp} envelope
"""
from __future__ import annotations


class KvClient:
    def __init__(self, base_url: str, http=None, timeout: int = 10):
        self.base = base_url.rstrip('/')
        self.timeout = timeout
        if http is None:
            import requests  # lazy — keeps the brick importable without the dep in tests
            http = requests
        self.http = http

    # ── reads ────────────────────────────────────────────────────────────────
    def get_json(self, key: str):
        """GET /api/kv/get?key=… → the stored value. The worker returns
        ``{data, timestamp}`` (or ``{miss: true}``); we return ``data`` — exactly
        what the dashboard's ``kvGet`` does. None if absent/blank."""
        r = self.http.get(f'{self.base}/api/kv/get', params={'key': key}, timeout=self.timeout)
        if getattr(r, 'status_code', 200) == 404:
            return None
        r.raise_for_status()
        body = r.json()
        if not isinstance(body, dict) or body.get('miss'):
            return None
        return body.get('data', body)

    # ── writes ───────────────────────────────────────────────────────────────
    def put_json(self, key: str, data, *, ts: int | None = None) -> None:
        """POST /api/kv/set with the worker's body shape ``{key, data, timestamp}``
        (matches the dashboard's ``kvSet``). NOTE: keys matching
        credentials/config/override require an X-Auth-Token the BOT never sends —
        the bot only WRITES its status key (unauthenticated) and READS config."""
        r = self.http.post(f'{self.base}/api/kv/set',
                           json={'key': key, 'data': data, 'timestamp': ts if ts is not None else _now_ms()},
                           timeout=self.timeout)
        r.raise_for_status()

    def put_status(self, key: str, status: dict, *, ts: int | None = None) -> None:
        """Write the bot's runtime status under its own ``{bot}_status`` key. The
        worker wraps it as ``{data, timestamp}``; the positions page reads ``data``."""
        self.put_json(key, status, ts=ts)


def _now_ms() -> int:
    import time
    return int(time.time() * 1000)
