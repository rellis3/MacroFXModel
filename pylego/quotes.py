"""Dashboard quote feed for paper mode (Category-B brick).

The PaperBroker has no market feed — ``price()`` only returns what the loop fed
it. When a bot runs paper (no MT5), this brick supplies the feed the same way
every MT5-less bot already gets prices: ``GET {dashboard}/api/quote?symbol=…``
(server.js proxies /api/* to the worker, which returns the OANDA M1 mid) —
exactly the fallback in bot/utils/state_reader.fetch_quote and the regime bots.

Cheap by design for a ~3s tick loop: each pair is re-fetched at most every
``min_interval`` seconds (cached value returned in between), a failing fetch is
not retried before the same interval, and a quote older than ``stale_after``
returns None so the caller SKIPS the pair that tick. Missing/stale ↔ fresh
transitions are logged once per state change, never per tick.

  feed = QuoteFeed(base_url, log=log)
  px = feed.price("eurusd")        # float, or None (stale/missing → skip pair)

The HTTP client is injected (defaults to ``requests``) so this is
offline-testable with a fake, like KvClient.
"""
from __future__ import annotations

import logging
import time

from pylego.instruments import oanda_symbol


class QuoteFeed:
    def __init__(self, base_url: str, http=None, timeout: int = 5,
                 min_interval: float = 10.0, stale_after: float = 90.0,
                 log: logging.Logger | None = None, now=time.time):
        self.base = base_url.rstrip('/')
        self.timeout = timeout
        self.min_interval = float(min_interval)
        self.stale_after = float(stale_after)
        self.log = log or logging.getLogger("pylego.quotes")
        self._now = now
        if http is None:
            import requests  # lazy — keeps the brick importable without the dep in tests
            http = requests
        self.http = http
        self._cache: dict[str, tuple[float, float]] = {}   # pair -> (price, fetched_at)
        self._last_try: dict[str, float] = {}              # pair -> last fetch attempt
        self._ok: dict[str, bool] = {}                     # pair -> last logged state

    def _sym(self, pair: str) -> str:
        """/api/quote symbol for a pair — the registry's OANDA symbol (already
        carries the DE30_EUR quirk); unknown symbols pass through as-is."""
        try:
            return oanda_symbol(pair)
        except Exception:
            return pair

    def _fetch(self, pair: str):
        try:
            r = self.http.get(f"{self.base}/api/quote",
                              params={"symbol": self._sym(pair)}, timeout=self.timeout)
            r.raise_for_status()
            px = float((r.json() or {}).get("price") or 0)
            return px if px > 0 else None
        except Exception:
            return None

    def _log_state(self, pair: str, ok: bool) -> None:
        if self._ok.get(pair) is ok:
            return                                       # once per state CHANGE, not per tick
        self._ok[pair] = ok
        if ok:
            self.log.info(f"quote feed {pair}: live again")
        else:
            self.log.warning(f"quote feed {pair}: stale/missing — pair skipped until it recovers")

    def price(self, pair: str):
        """Fresh-enough dashboard quote for ``pair``, or None (stale/missing).
        Never fetches the same pair more often than ``min_interval``."""
        now = self._now()
        cached = self._cache.get(pair)
        if cached is not None and now - cached[1] < self.min_interval:
            return cached[0]                             # still fresh — no HTTP
        if now - self._last_try.get(pair, -1e18) >= self.min_interval:
            self._last_try[pair] = now
            px = self._fetch(pair)
            if px is not None:
                self._cache[pair] = (px, now)
                self._log_state(pair, True)
                return px
        # No fresh fetch this tick — serve the cache while it isn't stale.
        if cached is not None and now - cached[1] <= self.stale_after:
            return cached[0]
        self._log_state(pair, False)
        return None
