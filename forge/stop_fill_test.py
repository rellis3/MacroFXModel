"""forge/stop_fill.py: fills pay the spread, gaps slip, and same-bar conflicts are losses."""
from __future__ import annotations

import numpy as np

from forge.stop_fill import first_trigger, stop_trade


def _bars(mid, half=0.5):
    """mid = list of (o, h, l, c). Returns the eight bid/ask arrays with a constant half spread."""
    a = np.array(mid, float)
    b, s = a - half, a + half
    return dict(bid_o=b[:, 0], bid_h=b[:, 1], bid_l=b[:, 2], bid_c=b[:, 3], ask_o=s[:, 0], ask_h=s[:, 1], ask_l=s[:, 2], ask_c=s[:, 3])


def test_long_target_pays_the_spread_on_the_way_out():
    x = _bars([(99, 100, 98.8, 99.8), (100, 104, 99.8, 103), (103, 112, 103, 111)])
    t = first_trigger(1, 100.0, x["ask_h"], x["bid_l"])
    assert t == 0                                           # ask high 100.5 reaches 100 while mid high is 100
    r = stop_trade(1, 100.0, t, 5.0, 10.0, 3, **x)
    assert r["outcome"] == "target" and r["fill"] == 100.0 and r["r"] == 2.0
    # the target needed the BID at 110, i.e. mid 110.5, not mid 110
    y = _bars([(99, 100, 98.8, 99.8), (100, 110.2, 99.8, 103)])
    assert stop_trade(1, 100.0, 0, 5.0, 10.0, 2, **y)["outcome"] == "time"


def test_gap_through_the_stop_entry_fills_worse():
    x = _bars([(103, 104, 102.8, 103)])
    r = stop_trade(1, 100.0, 0, 5.0, 10.0, 1, **x)
    assert r["fill"] == 103.5


def test_same_bar_conflict_is_a_loss():
    x = _bars([(100, 120, 90, 100)])
    assert stop_trade(1, 100.0, 0, 5.0, 10.0, 1, **x)["outcome"] == "stop"
    x = _bars([(100, 101, 99.9, 100), (100, 120, 90, 100)])
    r = stop_trade(1, 100.0, 0, 5.0, 10.0, 2, **x)
    assert r["outcome"] == "stop"


def test_stop_gap_slips_past_the_stop():
    x = _bars([(100, 101, 99.9, 100), (90, 91, 89, 90)])
    r = stop_trade(1, 100.0, 0, 5.0, 10.0, 2, **x)
    assert r["outcome"] == "stop" and r["exit"] == 89.5 and np.isclose(r["r"], (89.5 - 100.5) / 5)


def test_short_mirrors():
    x = _bars([(101, 101.2, 100, 100.2), (100, 100.2, 89, 90)])
    t = first_trigger(-1, 100.0, x["ask_h"], x["bid_l"])
    assert t == 0
    r = stop_trade(-1, 100.0, t, 5.0, 10.0, 2, **x)
    assert r["outcome"] == "target" and r["r"] == 2.0


def test_time_exit_on_the_right_side_of_the_book():
    x = _bars([(100, 100.8, 99.9, 100), (100, 101, 99.9, 101)])
    r = stop_trade(1, 100.0, 0, 5.0, 10.0, 2, **x)
    assert r["outcome"] == "time" and r["exit"] == 100.5
