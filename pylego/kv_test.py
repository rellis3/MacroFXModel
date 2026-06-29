"""Offline tests for the KvClient (HTTP injected — no network).

The fake mirrors the real worker contract: GET /api/kv/get returns
{data, timestamp} or {miss: true}; POST /api/kv/set takes {key, data, timestamp}.
"""
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


class _FakeWorker:
    """Emulates /api/kv/get + /api/kv/set with the {data,timestamp} envelope."""
    def __init__(self):
        self.posts = []
        self._store = {}                       # key -> {data, timestamp}

    def get(self, url, params=None, timeout=None):
        key = (params or {}).get("key")
        if key not in self._store:
            return _Resp({"miss": True})
        return _Resp(self._store[key])         # {data, timestamp}

    def post(self, url, json=None, timeout=None):
        self.posts.append(json)
        self._store[json["key"]] = {"data": json["data"], "timestamp": json.get("timestamp")}
        return _Resp({"ok": True})


def test_put_then_get_roundtrip_returns_data():
    http = _FakeWorker()
    kv = KvClient("http://x", http=http)
    kv.put_json("volatility_bot_config", {"risk_pct": 0.5})
    assert kv.get_json("volatility_bot_config") == {"risk_pct": 0.5}
    assert set(http.posts[-1]) == {"key", "data", "timestamp"}   # worker body shape


def test_get_missing_returns_none():
    kv = KvClient("http://x", http=_FakeWorker())
    assert kv.get_json("nope") is None


def test_put_status_writes_under_its_key_and_reads_back():
    http = _FakeWorker()
    kv = KvClient("http://x", http=http)
    kv.put_status("volatility_bot_status", {"running": True}, ts=999)
    assert http.posts[-1] == {"key": "volatility_bot_status", "data": {"running": True}, "timestamp": 999}
    assert kv.get_json("volatility_bot_status") == {"running": True}


def test_plan_envelope_roundtrip():
    http = _FakeWorker()
    http._store["volatility_bot_plan"] = {"data": {"universe": ["eurusd"]}, "timestamp": 1}
    kv = KvClient("http://x", http=http)
    assert kv.get_json("volatility_bot_plan") == {"universe": ["eurusd"]}


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
