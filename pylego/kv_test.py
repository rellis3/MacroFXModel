"""Offline tests for the KvClient (HTTP injected — no network)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.kv import KvClient  # noqa: E402


class _Resp:
    def __init__(self, body, status=200):
        self._body, self.status_code = body, status

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _FakeHttp:
    def __init__(self):
        self.posts, self.puts = [], []
        self._store = {}

    def get(self, url, params=None, timeout=None):
        key = (params or {}).get("key")
        if key not in self._store:
            return _Resp(None, status=404)
        return _Resp({"value": self._store[key]})

    def post(self, url, json=None, timeout=None):
        self.posts.append(json)
        self._store[json["key"]] = json["value"]
        return _Resp({"ok": True})

    def put(self, url, json=None, timeout=None):
        self.puts.append(json)
        return _Resp({"ok": True})


def test_put_then_get_roundtrip_and_unwrap():
    http = _FakeHttp()
    kv = KvClient("http://x", http=http)
    kv.put_json("volatility_bot_config", {"risk_pct": 0.5})
    assert kv.get_json("volatility_bot_config") == {"risk_pct": 0.5}


def test_get_unwraps_data_timestamp_envelope():
    http = _FakeHttp()
    http._store["volatility_bot_plan"] = {"data": {"universe": ["eurusd"]}, "timestamp": 123}
    kv = KvClient("http://x", http=http)
    assert kv.get_json("volatility_bot_plan") == {"universe": ["eurusd"]}


def test_get_missing_returns_none():
    kv = KvClient("http://x", http=_FakeHttp())
    assert kv.get_json("nope") is None


def test_put_status_wraps_envelope():
    http = _FakeHttp()
    kv = KvClient("http://x", http=http)
    kv.put_status("volatility_bot_status", {"running": True}, ts=999)
    sent = http.posts[-1]
    assert sent["key"] == "volatility_bot_status"
    assert sent["value"] == {"data": {"running": True}, "timestamp": 999}


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
