"""Offline tests for the stops brick — entry-time stop from order history, R.

Run:  python pylego/broker/stops_test.py
"""
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pylego.broker.stops import entry_stop_from_orders, r_multiple, stop_fields  # noqa: E402


class FakeMt5:
    def __init__(self, orders=None, raise_=False):
        self._orders = orders or {}
        self._raise = raise_
    def history_orders_get(self, position=None, **kw):
        if self._raise:
            raise RuntimeError('terminal gone')
        return list(self._orders.get(position, []))


O = lambda sl, tp, t: SimpleNamespace(sl=sl, tp=tp, time_setup=t)


def test_entry_stop_is_the_earliest_order():
    m = FakeMt5({7: [O(1.1040, 0, 200), O(1.0900, 1.1200, 100)]})
    assert entry_stop_from_orders(m, 7) == (1.09, 1.12)


def test_zero_stop_is_none_not_zero():
    m = FakeMt5({7: [O(0, 0, 100)]})
    assert entry_stop_from_orders(m, 7) == (None, None)


def test_no_orders_is_none():
    assert entry_stop_from_orders(FakeMt5({}), 7) == (None, None)


def test_terminal_error_never_raises():
    assert entry_stop_from_orders(FakeMt5(raise_=True), 7) == (None, None)


def test_module_without_the_call_never_raises():
    assert entry_stop_from_orders(object(), 7) == (None, None)


def test_r_long_and_short():
    assert r_multiple(1.1000, 1.1050, 1.0950, True) == 1.0
    assert r_multiple(1.1000, 1.0950, 1.1050, False) == 1.0
    assert r_multiple(1.1000, 1.0975, 1.0950, True) == -0.5
    assert r_multiple(1.1000, 1.1000, 1.0950, True) == 0.0


def test_r_undefined_cases():
    assert r_multiple(1.1, 1.105, 1.1, True) is None      # stop on entry
    assert r_multiple(None, 1.1, 1.09, True) is None
    assert r_multiple(1.1, None, 1.09, True) is None
    assert r_multiple(1.1, 1.105, None, True) is None
    assert r_multiple('x', 1.1, 1.09, True) is None       # garbage in, None out, no raise


def test_stop_fields_from_order():
    m = FakeMt5({7: [O(1.0950, 1.1100, 100)]})
    f = stop_fields(m, 7, 1.1000, 1.1050, True)
    assert f == {'sl_at_entry': 1.095, 'tp_at_entry': 1.11, 'sl_source': 'order', 'r': 1.0}, f


def test_stop_fields_falls_back_to_first_seen_and_says_so():
    m = FakeMt5({7: [O(0, 0, 100)]})
    f = stop_fields(m, 7, 1.1000, 1.1050, True, fallback_sltp=(1.0980, 1.1200))
    assert f['sl_at_entry'] == 1.098 and f['sl_source'] == 'first_seen' and f['r'] == 2.5, f


def test_stop_fields_order_beats_fallback():
    m = FakeMt5({7: [O(1.0950, 0, 100)]})
    f = stop_fields(m, 7, 1.1000, 1.1050, True, fallback_sltp=(1.0980, None))
    assert f['sl_at_entry'] == 1.095 and f['sl_source'] == 'order'


def test_stop_fields_nothing_known():
    f = stop_fields(FakeMt5({}), 7, 1.1000, 1.1050, True)
    assert f == {'sl_at_entry': None, 'tp_at_entry': None, 'sl_source': None, 'r': None}


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
