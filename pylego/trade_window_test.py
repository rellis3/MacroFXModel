"""Offline tests for the trade_window brick. The clock is injected, so every
case is deterministic.

Run:  python pylego/trade_window_test.py   (or pytest)
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.trade_window import parse_hhmm, within_window  # noqa: E402


def at(h, m=0):
    return datetime(2026, 8, 3, h, m, tzinfo=timezone.utc)


def test_parses_the_normal_forms():
    assert parse_hhmm('07:00') == 420
    assert parse_hhmm('20:00') == 1200
    assert parse_hhmm('00:00') == 0
    assert parse_hhmm('06:05') == 365


def test_parses_the_forms_the_string_compare_broke_on():
    # The whole point: an unpadded hour must mean 07:00, not sort after '20:00'.
    assert parse_hhmm('7:00') == parse_hhmm('07:00')
    assert parse_hhmm('7') == 420
    assert parse_hhmm(7) == 420          # bare hour number, as some configs store it


def test_unparseable_falls_back_to_the_stated_default():
    assert parse_hhmm('', 99) == 99
    assert parse_hhmm(None, 99) == 99
    assert parse_hhmm('not a time', 99) == 99
    assert parse_hhmm('25:00', 99) == 99   # out of range, not silently wrapped
    assert parse_hhmm('12:75', 99) == 99


def test_normal_window():
    assert within_window('07:00', '20:00', now=at(12)) is True
    assert within_window('07:00', '20:00', now=at(6, 59)) is False
    assert within_window('07:00', '20:00', now=at(7, 0)) is True     # inclusive start
    assert within_window('07:00', '20:00', now=at(20, 0)) is True    # inclusive end
    assert within_window('07:00', '20:00', now=at(20, 1)) is False


def test_unpadded_config_no_longer_closes_the_window_forever():
    # THE BUG: lexicographically '7:00' > '20:00', so the old
    # `start <= now <= end` was false at every instant of the day — the bot
    # simply never traded again, silently.
    assert '7:00' > '20:00'                                   # the string trap, pinned
    assert within_window('7:00', '20:00', now=at(12)) is True  # parsed: fine
    assert within_window('7:00', '20:00', now=at(3)) is False


def test_window_wrapping_past_midnight():
    # The string form got this wrong too (nothing is both >= '22:00' and <= '04:00').
    assert within_window('22:00', '04:00', now=at(23)) is True
    assert within_window('22:00', '04:00', now=at(2)) is True
    assert within_window('22:00', '04:00', now=at(12)) is False


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
