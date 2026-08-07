"""Offline tests for the ServerClock brick.

No MT5, no network — the module and the wall clock are both injected, so the
weekend/stale-quote path and a broker DST switch are exercised deterministically.

Run:  python pylego/broker/clock_test.py   (or pytest)
"""
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pylego.broker.clock import ServerClock, measure_offset_sec  # noqa: E402

NOW = 1785741600          # 2026-08-03 07:20:00 UTC
H3 = 3 * 3600


class FakeMt5:
    """Returns a tick per symbol; `times` maps symbol -> tick.time (0 = no tick)."""

    def __init__(self, times=None, raises=()):
        self.times = times or {}
        self.raises = set(raises)
        self.calls = 0

    def symbol_info_tick(self, sym):
        self.calls += 1
        if sym in self.raises:
            raise RuntimeError("symbol not selected")
        t = self.times.get(sym)
        return None if t is None else SimpleNamespace(time=t, bid=1.1, ask=1.1001)


def test_measures_a_plus_3h_broker():
    # Every major quotes at NOW+3h on the broker clock -> +10800.
    mt5 = FakeMt5({s: NOW + H3 for s in ('EURUSD', 'GBPUSD', 'USDJPY')})
    assert measure_offset_sec(mt5, ('EURUSD', 'GBPUSD', 'USDJPY'), NOW) == H3


def test_rounds_tick_latency_to_the_quarter_hour():
    # A tick is always a few seconds old; the offset must not inherit that jitter.
    mt5 = FakeMt5({'EURUSD': NOW + H3 - 47})
    assert measure_offset_sec(mt5, ('EURUSD',), NOW) == H3


def test_freshest_symbol_wins():
    # Thin/closed symbols carry stale ticks. Taking the max avoids reading a
    # stale quote as a smaller offset.
    mt5 = FakeMt5({'EURUSD': NOW + H3 - 5400, 'GBPUSD': NOW + H3, 'XAUUSD': NOW})
    assert measure_offset_sec(mt5, ('EURUSD', 'GBPUSD', 'XAUUSD'), NOW) == H3


def test_stale_weekend_quotes_are_refused_not_rounded_to_zero():
    # Friday's last tick read on a Sunday is days old. That is "unknown", and
    # must NOT be reported as an offset (0 would silently un-shift every stamp).
    mt5 = FakeMt5({'EURUSD': NOW - 2 * 86400})
    assert measure_offset_sec(mt5, ('EURUSD',), NOW) is None


def test_no_ticks_and_no_module_are_unknown():
    assert measure_offset_sec(FakeMt5({}), ('EURUSD',), NOW) is None
    assert measure_offset_sec(None, ('EURUSD',), NOW) is None


def test_symbol_errors_do_not_abort_the_measurement():
    mt5 = FakeMt5({'GBPUSD': NOW + H3}, raises=('EURUSD',))
    assert measure_offset_sec(mt5, ('EURUSD', 'GBPUSD'), NOW) == H3


def test_offset_is_cached_between_remeasures():
    mt5 = FakeMt5({'EURUSD': NOW + H3})
    t = [NOW]
    c = ServerClock(mt5, ('EURUSD',), clock=lambda: t[0], remeasure_secs=3600)
    assert c.offset_sec() == H3
    first = mt5.calls
    t[0] += 600
    assert c.offset_sec() == H3
    assert mt5.calls == first          # inside the window: no re-probe


def test_broker_dst_switch_is_picked_up_after_the_window():
    mt5 = FakeMt5({'EURUSD': NOW + H3})
    t = [NOW]
    c = ServerClock(mt5, ('EURUSD',), clock=lambda: t[0], remeasure_secs=3600)
    assert c.offset_sec() == H3
    t[0] += 7200                        # EEST -> EET: broker falls back an hour
    mt5.times['EURUSD'] = t[0] + 2 * 3600
    assert c.offset_sec() == 2 * 3600


def test_closed_market_keeps_the_last_good_offset():
    # Measured on Friday, re-probed on Sunday: the stale tick yields None and the
    # clock must hold +3h rather than fall back to "unknown" (or to zero).
    mt5 = FakeMt5({'EURUSD': NOW + H3})
    t = [NOW]
    c = ServerClock(mt5, ('EURUSD',), clock=lambda: t[0], remeasure_secs=1)
    assert c.offset_sec() == H3
    t[0] += 2 * 86400                   # weekend; tick.time unchanged -> stale
    assert c.offset_sec() == H3


def test_conversions_round_trip_and_never_guess():
    mt5 = FakeMt5({'EURUSD': NOW + H3})
    c = ServerClock(mt5, ('EURUSD',), clock=lambda: NOW)
    assert c.to_utc(NOW + H3) == NOW
    assert c.to_server(NOW) == NOW + H3
    assert c.to_utc(c.to_server(NOW)) == NOW
    assert c.to_utc(None) is None and c.to_server(None) is None

    blind = ServerClock(FakeMt5({}), ('EURUSD',), clock=lambda: NOW)
    assert blind.offset_sec() is None
    assert blind.to_utc(NOW + H3) == NOW + H3      # unknown -> unchanged, not 0-shifted
    assert blind.to_server(NOW) == NOW


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
