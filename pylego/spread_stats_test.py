"""Offline tests for the spread_stats brick.

Run:  python pylego/spread_stats_test.py   (or pytest)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.spread_stats import (  # noqa: E402
    ewma_update, live_spread_pips, update_pair_stats,
)

HOUR = 3600.0


def test_first_sample_seeds_the_average():
    avg, n, t = ewma_update(None, 0, None, 1.2, now=1000.0)
    assert avg == 1.2 and n == 1 and t == 1000.0


def test_sample_after_exactly_one_halflife_weighs_50_50():
    avg, n, _ = ewma_update(1.0, 5, 0.0, 3.0, now=168 * HOUR, halflife_hours=168.0)
    assert abs(avg - 2.0) < 1e-9   # (1.0 + 3.0) / 2
    assert n == 6


def test_sample_seconds_later_barely_moves_the_average():
    avg, _, _ = ewma_update(1.0, 100, 0.0, 5.0, now=60.0, halflife_hours=168.0)
    assert 1.0 < avg < 1.01, "a single outlier moments later shouldn't swing a week-long average"


def test_sample_after_many_halflives_nearly_overwrites_the_average():
    avg, _, _ = ewma_update(1.0, 50, 0.0, 5.0, now=10 * 168 * HOUR, halflife_hours=168.0)
    assert abs(avg - 5.0) < 5e-3   # 10 halflives -> old weight 0.5**10 ~= 0.001


def test_update_pair_stats_accumulates_sample_count():
    stats = {}
    update_pair_stats(stats, "eurusd", 0.8, now=0.0)
    update_pair_stats(stats, "eurusd", 0.9, now=3600.0)
    update_pair_stats(stats, "eurusd", 1.0, now=7200.0)
    assert stats["eurusd"]["n"] == 3
    assert 0.8 < stats["eurusd"]["avg_pips"] < 1.0


def test_update_pair_stats_keeps_pairs_independent():
    stats = {}
    update_pair_stats(stats, "eurusd", 0.8, now=0.0)
    update_pair_stats(stats, "gbpcad", 2.9, now=0.0)
    assert stats["eurusd"]["avg_pips"] == 0.8
    assert stats["gbpcad"]["avg_pips"] == 2.9


def test_live_spread_pips_none_below_min_samples():
    stats = {"gbpcad": {"avg_pips": 1.9, "n": 50, "updated_at": 0.0}}
    assert live_spread_pips(stats, "gbpcad", min_samples=200) is None


def test_live_spread_pips_returns_average_once_enough_samples():
    stats = {"gbpcad": {"avg_pips": 1.9, "n": 250, "updated_at": 0.0}}
    assert live_spread_pips(stats, "gbpcad", min_samples=200) == 1.9


def test_live_spread_pips_none_for_unknown_pair():
    assert live_spread_pips({}, "eurusd") is None


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
