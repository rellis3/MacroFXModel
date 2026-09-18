"""Local decision engine client (Category-B brick).

Thin wrapper over the local decision engine's HTTP surface
(local_decision_engine/server.mjs, localhost-only) — replaces polling a
remote, server-computed plan snapshot (KvClient.get_json("..._plan")) with
a call to a process running on the SAME machine, computed fresh at call
time. See MD files/LOCAL_DECISION_ENGINE_ARCHITECTURE.md for why.

  ld = LocalDecisionClient(base_url)          # default http://127.0.0.1:4500
  plan = ld.get_plan(['eurusd', 'gbpusd'])    # same {instruments, skipped} shape
                                               # volatility_bot_v3_plan used to have

Same injectable-HTTP-client + transient-retry contract as pylego/kv.py, for
the same reason: a bot loop that runs for days must not crash on one slow
or dropped local connection.
"""
from __future__ import annotations

import time

_TRANSIENT_HINTS = ('timeout', 'connection', 'temporarilyunavailable', 'maxretry')


def _is_transient(exc: Exception) -> bool:
    name = type(exc).__name__.lower()
    return any(h in name for h in _TRANSIENT_HINTS)


class LocalDecisionClient:
    def __init__(self, base_url: str = 'http://127.0.0.1:4500', http=None, timeout: int = 8,
                 retries: int = 2, backoff: float = 0.5, sleep=time.sleep):
        # Short timeout/backoff on purpose — this is a same-machine call, not
        # a Railway round-trip; a slow local process should fail fast so the
        # bot's own tick loop isn't stalled waiting on it.
        # 5 -> 8s, 2026-09-18: real live runs kept hitting "Read timed out"
        # even after fixing two confirmed causes of the local engine
        # blocking its own event loop (a background recompute burst, and a
        # needless book-file rewrite on every sync.mjs restart) -- a THIRD
        # cause is still unconfirmed (server.mjs now logs any compute/request
        # over 800ms to find it). Until that's nailed down, 8s trades a
        # little "fail fast" for fewer false-positive "keeping current plan"
        # fallbacks on a genuinely fine local engine that was just briefly
        # busy, not dead.
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

    def get_plan(self, pairs: list[str]) -> dict:
        """GET /plan?pairs=… → {ok, data:{strategy, generatedAt, instruments, skipped}, timestamp}.
        Returns the `data` object directly — same shape a KvClient.get_json("..._plan")
        read used to hand back, so callers don't need to change how they
        consume it, only where it comes from."""
        def _do():
            r = self.http.get(f'{self.base}/plan', params={'pairs': ','.join(pairs)}, timeout=self.timeout)
            r.raise_for_status()
            body = r.json()
            if not body.get('ok'):
                raise RuntimeError(body.get('error', 'local decision engine returned ok:false'))
            return body.get('data')
        return self._with_retries(_do)

    def health(self) -> bool:
        """True if the local engine is up at all — cheap, used to decide
        whether to even attempt get_plan() vs failing closed immediately."""
        try:
            r = self.http.get(f'{self.base}/health', timeout=self.timeout)
            return bool(getattr(r, 'ok', False) or r.status_code == 200)
        except Exception:
            return False
