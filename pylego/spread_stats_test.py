"""Offline tests for the spread_stats brick (rewritten 2026-09-19).

Run:  python pylego/spread_stats_test.py   (or pytest)
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.spread_stats import (  # noqa: E402
    ENTRY_HOURS, MIN_LIVE_HOURS, MIN_LIVE_SAMPLES, WINDOW_DAYS,
    entry_hours_mean, is_market_open, live_spread_pips, update_pair_stats,
)


def _t(y, m, d, hh, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=timezone.utc).timestamp()


def test_average_is_a_real_mean_not_the_first_sample():
    # The bug being fixed: 1,200 alternating samples must average ~1.0, not
    # sit on whichever value happened to arrive first.
    stats = {}
    t0 = _t(2026, 9, 17, 9)
    for i in range(1200):
        update_pair_stats(stats, "eurusd", 0.8 if i % 2 else 1.2, t0 + 3 * i)
    mean, n, hours = entry_hours_mean(stats, "eurusd")
    assert n == 1200 and abs(mean - 1.0) < 1e-6


def test_only_entry_hours_count_toward_the_gate_average():
    stats = {}
    for i in range(300):
        update_pair_stats(stats, "eurusd", 0.8, _t(2026, 9, 17, 9) + 3 * i)    # 09 UTC, entry hour
        update_pair_stats(stats, "eurusd", 4.0, _t(2026, 9, 17, 22) + 3 * i)   # 22 UTC, not an entry hour
    mean, n, hours = entry_hours_mean(stats, "eurusd")
    assert n == 300 and abs(mean - 0.8) < 1e-6
    assert stats["eurusd"]["n"] == 600   # both still recorded


def test_weekend_and_zero_spreads_are_dropped():
    stats = {}
    update_pair_stats(stats, "eurusd", 9.0, _t(2026, 9, 19, 10))   # Saturday
    update_pair_stats(stats, "eurusd", 9.0, _t(2026, 9, 18, 22))   # Friday after the close
    update_pair_stats(stats, "eurusd", 0.0, _t(2026, 9, 17, 10))   # zero spread
    assert "eurusd" not in stats
    update_pair_stats(stats, "eurusd", 0.9, _t(2026, 9, 20, 22))   # Sunday after the open
    assert stats["eurusd"]["n"] == 1


def test_market_open_boundaries():
    assert is_market_open(_t(2026, 9, 18, 20, 59))       # Fri 20:59
    assert not is_market_open(_t(2026, 9, 18, 21))       # Fri 21:00
    assert not is_market_open(_t(2026, 9, 20, 20, 59))   # Sun 20:59
    assert is_market_open(_t(2026, 9, 20, 21))           # Sun 21:00


def test_window_rolls_off_old_days():
    stats = {}
    update_pair_stats(stats, "eurusd", 5.0, _t(2026, 8, 1, 10))          # far in the past
    for i in range(10):
        update_pair_stats(stats, "eurusd", 1.0, _t(2026, 9, 17, 10) + i)
    assert list(stats["eurusd"]["days"]) == ["2026-09-17"]
    assert stats["eurusd"]["n"] == 10


def test_live_spread_needs_enough_samples_across_enough_hours():
    stats = {}
    # 250 samples but all in ONE entry hour -> not trusted
    for i in range(250):
        update_pair_stats(stats, "eurusd", 0.8, _t(2026, 9, 17, 9) + 3 * i)
    assert live_spread_pips(stats, "eurusd") is None
    # spread the same count over three hours -> trusted
    stats = {}
    for h in (8, 9, 10):
        for i in range(80):
            update_pair_stats(stats, "eurusd", 0.8, _t(2026, 9, 17, h) + 3 * i)
    assert live_spread_pips(stats, "eurusd") == 0.8


def test_legacy_ewma_rows_are_ignored_not_misread():
    stats = {"eurusd": {"avg_pips": 0.1, "n": 870, "updated_at": 1.0}}
    assert live_spread_pips(stats, "eurusd") is None
    update_pair_stats(stats, "eurusd", 0.9, _t(2026, 9, 17, 9))
    assert "avg_pips" not in stats["eurusd"] and stats["eurusd"]["n"] == 1


def test_unknown_pair_is_none():
    assert live_spread_pips({}, "gbpnzd") is None


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
