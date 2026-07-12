"""Offline tests for the QuoteFeed (paper-mode dashboard quote feed) — fake HTTP
client + fake clock, no network (same pattern as kv_test.py)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pylego.quotes import QuoteFeed  # noqa: E402


class _Resp:
    def __init__(self, body):
        self._body = body

    def raise_for_status(self):
        pass

    def json(self):
        return self._body


class _FakeHttp:
    def __init__(self, price=1.2345):
        self.price = price
        self.calls = []
        self.fail = False

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, dict(params or {})))
        if self.fail:
            raise ConnectionError("down")
        return _Resp({"price": self.price})


class _Clock:
    def __init__(self):
        self.t = 1_000.0

    def __call__(self):
        return self.t


def test_fetches_and_caches_within_min_interval():
    http, clock = _FakeHttp(1.10), _Clock()
    f = QuoteFeed("http://dash", http=http, min_interval=10, stale_after=90, now=clock)
    assert f.price("eurusd") == 1.10
    assert len(http.calls) == 1
    assert http.calls[0][1]["symbol"] == "EUR_USD"    # registry OANDA symbol on the wire
    clock.t += 3                                      # next 3s tick — served from cache
    assert f.price("eurusd") == 1.10
    assert len(http.calls) == 1                       # NO second HTTP call
    clock.t += 10                                     # past min_interval → re-fetch
    http.price = 1.11
    assert f.price("eurusd") == 1.11
    assert len(http.calls) == 2


def test_stale_quote_returns_none_and_recovers():
    http, clock = _FakeHttp(1.10), _Clock()
    f = QuoteFeed("http://dash", http=http, min_interval=10, stale_after=30, now=clock)
    assert f.price("eurusd") == 1.10
    http.fail = True
    clock.t += 15                                     # fetch fails → serve cache (not yet stale)
    assert f.price("eurusd") == 1.10
    clock.t += 30                                     # cache now older than stale_after → skip pair
    assert f.price("eurusd") is None
    http.fail = False
    clock.t += 15                                     # endpoint back → fresh quote again
    assert f.price("eurusd") == 1.10


def test_failed_fetch_not_hammered_every_tick():
    http, clock = _FakeHttp(), _Clock()
    http.fail = True
    f = QuoteFeed("http://dash", http=http, min_interval=10, stale_after=90, now=clock)
    assert f.price("eurusd") is None
    n = len(http.calls)
    clock.t += 3                                      # 3s tick — still inside min_interval
    assert f.price("eurusd") is None
    assert len(http.calls) == n                       # no retry before min_interval


def test_unknown_symbol_passes_through():
    http, clock = _FakeHttp(200.0), _Clock()
    f = QuoteFeed("http://dash", http=http, now=clock)
    assert f.price("mystery") == 200.0
    assert http.calls[0][1]["symbol"] == "mystery"


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
