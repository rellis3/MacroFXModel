"""Offline tests for LocalDecisionClient (HTTP injected — no network, no
actual local_decision_engine process needed)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.local_decision import LocalDecisionClient  # noqa: E402


class _Resp:
    def __init__(self, body, status=200):
        self._body, self.status_code = body, status
        self.ok = status < 400

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _FakeEngine:
    def __init__(self, plan_data=None, healthy=True):
        self._plan_data = plan_data
        self._healthy = healthy
        self.get_calls = []

    def get(self, url, params=None, timeout=None):
        self.get_calls.append((url, params))
        if url.endswith('/health'):
            return _Resp({}, status=200 if self._healthy else 500)
        if url.endswith('/plan'):
            if self._plan_data is None:
                return _Resp({"ok": False, "error": "no data"})
            return _Resp({"ok": True, "data": self._plan_data, "timestamp": 123})
        raise ValueError(f"unexpected url {url}")


def test_get_plan_returns_the_data_object_not_the_envelope():
    engine = _FakeEngine(plan_data={"strategy": "level-atlas-vote-local", "instruments": {"eurusd": {"zones": []}}, "skipped": {}})
    ld = LocalDecisionClient("http://x", http=engine)
    plan = ld.get_plan(["eurusd", "gbpusd"])
    assert plan["strategy"] == "level-atlas-vote-local"
    assert "eurusd" in plan["instruments"]
    # pairs joined into one comma-separated query param, not repeated params
    assert engine.get_calls[-1][1] == {"pairs": "eurusd,gbpusd"}


def test_get_plan_raises_on_ok_false():
    engine = _FakeEngine(plan_data=None)
    ld = LocalDecisionClient("http://x", http=engine)
    raised = False
    try:
        ld.get_plan(["eurusd"])
    except RuntimeError:
        raised = True
    assert raised


def test_health_true_when_engine_up():
    ld = LocalDecisionClient("http://x", http=_FakeEngine(healthy=True))
    assert ld.health() is True


def test_health_false_when_engine_down():
    ld = LocalDecisionClient("http://x", http=_FakeEngine(healthy=False))
    assert ld.health() is False


def test_health_false_on_connection_error_not_a_crash():
    class _Down:
        def get(self, url, params=None, timeout=None):
            raise ConnectionError("refused")
    ld = LocalDecisionClient("http://x", http=_Down())
    assert ld.health() is False


def test_transient_error_retries_then_succeeds():
    class _FlakyThenOk:
        def __init__(self):
            self.calls = 0

        def get(self, url, params=None, timeout=None):
            self.calls += 1
            if self.calls == 1:
                raise TimeoutError("slow")
            return _Resp({"ok": True, "data": {"instruments": {}}})

    http = _FlakyThenOk()
    ld = LocalDecisionClient("http://x", http=http, retries=2, backoff=0.01, sleep=lambda _s: None)
    plan = ld.get_plan(["eurusd"])
    assert plan == {"instruments": {}}
    assert http.calls == 2


def test_non_transient_error_does_not_retry():
    class _Boom:
        def __init__(self):
            self.calls = 0

        def get(self, url, params=None, timeout=None):
            self.calls += 1
            raise ValueError("bad request")

    http = _Boom()
    ld = LocalDecisionClient("http://x", http=http, retries=3, sleep=lambda _s: None)
    raised = False
    try:
        ld.get_plan(["eurusd"])
    except ValueError:
        raised = True
    assert raised and http.calls == 1


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
