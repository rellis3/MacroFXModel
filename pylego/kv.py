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
        """GET /api/kv/get?key=… → the stored object, unwrapping the common
        ``{data, timestamp}`` envelope. Returns None if absent/blank."""
        r = self.http.get(f'{self.base}/api/kv/get', params={'key': key}, timeout=self.timeout)
        if getattr(r, 'status_code', 200) == 404:
            return None
        r.raise_for_status()
        body = r.json()
        if body is None:
            return None
        # /api/kv/get may return the raw value or {value:…}; values are often {data,timestamp}.
        val = body.get('value', body) if isinstance(body, dict) else body
        if isinstance(val, dict) and 'data' in val and 'timestamp' in val:
            return val['data']
        return val

    # ── writes ───────────────────────────────────────────────────────────────
    def put_json(self, key: str, data) -> None:
        r = self.http.post(f'{self.base}/api/kv/set',
                           json={'key': key, 'value': data}, timeout=self.timeout)
        r.raise_for_status()

    def put_status(self, key: str, status: dict, *, ts: int | None = None) -> None:
        """Write the bot's runtime status under its own ``{bot}_status`` key,
        wrapped in the dashboard's ``{data, timestamp}`` envelope (what the
        positions page unwraps). Per-bot key, so it never collides with others."""
        self.put_json(key, {'data': status, 'timestamp': ts if ts is not None else _now_ms()})


def _now_ms() -> int:
    import time
    return int(time.time() * 1000)
