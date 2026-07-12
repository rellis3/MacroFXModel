"""Offline tests for KvOhlcFeed (paper-mode dashboard session-bar feed) — fake
HTTP client + fake clock, no network (same pattern as quotes_test.py). The fake
serves the dashboard's real payload shape: KV envelope {data, timestamp}, data =
{values: [{datetime: London-local string, open/high/low/close: strings}]},
newest-first."""
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pylego.ohlc_feed import KvOhlcFeed, dash_sym_key, london_session_day  # noqa: E402

_LONDON = ZoneInfo("Europe/London")


def _mk_values(start_epoch, n, step=300):
    """n M5 candles from start_epoch, dashboard-shaped: London-local datetime
    strings, string OHLC, NEWEST-FIRST (the payload convention)."""
    vals = []
    for i in range(n):
        t = start_epoch + i * step
        dt = datetime.fromtimestamp(t, tz=_LONDON).strftime("%Y-%m-%d %H:%M:%S")
        vals.append({"datetime": dt, "open": f"{100 + i * 0.01:.5f}", "high": f"{100.5 + i * 0.01:.5f}",
                     "low": f"{99.5 + i * 0.01:.5f}", "close": f"{100.1 + i * 0.01:.5f}"})
    return list(reversed(vals))


class _Resp:
    def __init__(self, body, status=200):
        self._body = body
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._body


class _FakeHttp:
    def __init__(self):
        self.payloads = {}       # kv key -> data (the {values} dict)
        self.calls = []
        self.fail = False

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, dict(params or {})))
        if self.fail:
            raise ConnectionError("down")
        key = (params or {}).get("key")
        if key not in self.payloads:
            return _Resp({"miss": True})
        return _Resp({"data": self.payloads[key], "timestamp": 1})


class _Clock:
    def __init__(self, t):
        self.t = float(t)

    def __call__(self):
        return self.t


# A fixed reference session: Tue 2026-06-30, boundary 23:00 UTC (London 00:00 BST).
# Asia window = Mon 2026-06-29 23:00 UTC → Tue 05:00 UTC.
ASIA_ANCHOR = int(datetime(2026, 6, 29, 23, 0, tzinfo=timezone.utc).timestamp())
NOW = int(datetime(2026, 6, 30, 8, 0, tzinfo=timezone.utc).timestamp())   # 09:00 London
SESSION_DAY = "2026-06-30"


def _feed_with(payload_start, n, clock=None):
    http, clock = _FakeHttp(), (clock or _Clock(NOW))
    key = f"ohlc5m_EURUSD_{SESSION_DAY}"
    http.payloads[key] = {"values": _mk_values(payload_start, n),
                          "meta": {"symbol": "EUR/USD", "granularity": "M5"}}
    return KvOhlcFeed("http://dash", http=http, min_interval=120, now=clock), http, clock


def test_sym_key_and_session_day():
    assert dash_sym_key("eurusd") == "EURUSD"
    assert dash_sym_key("gold") == "XAUUSD"                    # registry display XAU/USD
    assert dash_sym_key("spx500") == "SPX500_USD"              # index displays match js/config.js
    assert dash_sym_key("nq") == "NAS100_USD"
    assert dash_sym_key("mystery/x") == "MYSTERYX"             # unknown passes through
    assert london_session_day(NOW) == SESSION_DAY
    before6 = int(datetime(2026, 6, 30, 3, 0, tzinfo=timezone.utc).timestamp())  # 04:00 London
    assert london_session_day(before6) == "2026-06-29"         # pre-06:00 → prior session day


def test_parses_payload_to_broker_bars():
    # Payload reaching back 2h before the Asia anchor, through "now".
    feed, http, _ = _feed_with(ASIA_ANCHOR - 7200, (7200 + 6 * 3600 + 3 * 3600) // 300)
    bars = feed.bars("eurusd")
    assert bars is not None
    assert bars[0]["time"] == ASIA_ANCHOR - 7200               # oldest-first after reversal
    assert bars[1]["time"] - bars[0]["time"] == 300            # epoch conversion is exact (BST)
    assert isinstance(bars[0]["open"], float)                  # strings → floats
    assert http.calls[0][1]["key"] == f"ohlc5m_EURUSD_{SESSION_DAY}"


def test_window_bars_covered_window():
    feed, _, _ = _feed_with(ASIA_ANCHOR - 7200, (7200 + 6 * 3600 + 3 * 3600) // 300)
    wb = feed.window_bars("eurusd", ASIA_ANCHOR, 6 * 3600)
    assert wb is not None
    assert wb[0]["time"] == ASIA_ANCHOR                        # first bar AT the window open
    assert wb[-1]["time"] == ASIA_ANCHOR + 6 * 3600 - 300      # last bar label 05:55
    assert len(wb) == 6 * 12


def test_partial_window_returns_none_never_fakes():
    # Payload starts 2h AFTER the window open → a ladder from it would use a
    # wrong range low/high. Must refuse (None), not truncate.
    feed, _, _ = _feed_with(ASIA_ANCHOR + 7200, (4 * 3600 + 3 * 3600) // 300)
    assert feed.window_bars("eurusd", ASIA_ANCHOR, 6 * 3600) is None


def test_unclosed_window_returns_none():
    # Payload ends an hour into the window (feed lag) → window not covered yet.
    feed, _, _ = _feed_with(ASIA_ANCHOR - 3600, (3600 + 3600) // 300)
    assert feed.window_bars("eurusd", ASIA_ANCHOR, 6 * 3600) is None


def test_gap_at_window_end_ok_when_payload_spans_past():
    # Venue break at the end of the window (last in-window bar 1h early) but the
    # payload continues past the window end → the gap is a real market gap, accept.
    http, clock = _FakeHttp(), _Clock(NOW)
    key = f"ohlc5m_EURUSD_{SESSION_DAY}"
    pre = _mk_values(ASIA_ANCHOR, (5 * 3600) // 300)                       # window bars minus last hour
    post = _mk_values(ASIA_ANCHOR + 6 * 3600 + 600, (2 * 3600) // 300)     # bars after the window
    http.payloads[key] = {"values": post + pre}                            # newest-first overall
    feed = KvOhlcFeed("http://dash", http=http, min_interval=120, now=clock)
    wb = feed.window_bars("eurusd", ASIA_ANCHOR, 6 * 3600)
    assert wb is not None and wb[-1]["time"] == ASIA_ANCHOR + 5 * 3600 - 300


def test_missing_key_logs_once_and_respects_min_interval():
    http, clock = _FakeHttp(), _Clock(NOW)
    logged = []

    class _Log:
        def warning(self, msg):
            logged.append(msg)

        def info(self, msg):
            logged.append(msg)

    feed = KvOhlcFeed("http://dash", http=http, min_interval=120, now=clock, log=_Log())
    assert feed.window_bars("eurusd", ASIA_ANCHOR, 6 * 3600) is None
    n_calls, n_logs = len(http.calls), len(logged)
    clock.t += 3                                                # 3s tick — inside min_interval
    assert feed.window_bars("eurusd", ASIA_ANCHOR, 6 * 3600) is None
    assert len(http.calls) == n_calls                           # no hammering
    assert len(logged) == n_logs                                # fail-loud ONCE, not per tick
    # KV key appears (someone loaded the pair on the dashboard) → recovers.
    http.payloads[f"ohlc5m_EURUSD_{SESSION_DAY}"] = {
        "values": _mk_values(ASIA_ANCHOR - 3600, (3600 + 9 * 3600) // 300)}
    clock.t += 120
    assert feed.window_bars("eurusd", ASIA_ANCHOR, 6 * 3600) is not None
    assert len(logged) == n_logs + 1                            # one recovery line


def test_monday_window_resamples_downstream():
    # 24h Monday window straight through — enough M5 bars for the engine to
    # 15m-resample downstream (the feed only guarantees M5 coverage).
    manchor = int(datetime(2026, 6, 28, 23, 0, tzinfo=timezone.utc).timestamp())  # Mon session (London)
    feed, _, _ = _feed_with(manchor, (24 * 3600 + 9 * 3600) // 300)
    wb = feed.window_bars("eurusd", manchor, 24 * 3600)
    assert wb is not None and len(wb) == 24 * 12


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
