"""Tests for forge/rv.py: grid rules, session/bar boundaries, and above all no forward bias."""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge import rv as R


def _m1(start_utc: str, end_utc: str, seed: int = 1, vol: float = 2e-4) -> pd.DataFrame:
    """A continuous synthetic M1 random walk (every minute, weekends included; the builders must drop them)."""
    idx = pd.date_range(start_utc, end_utc, freq="1min", tz="UTC", inclusive="left")
    rng = np.random.default_rng(seed)
    c = 1.1 * np.exp(np.cumsum(rng.normal(0, vol, idx.size)))
    o = np.r_[c[0], c[:-1]]
    hi = np.maximum(o, c) * (1 + 5e-5)
    lo = np.minimum(o, c) * (1 - 5e-5)
    return pd.DataFrame({"open": o, "high": hi, "low": lo, "close": c, "volume": 1.0}, index=idx)


def test_rv_is_sum_of_squared_5min_returns_on_a_full_session():
    m1 = _m1("2025-01-06 00:00", "2025-01-07 00:00")          # Monday, GMT: London = UTC
    s = R.session_rv(m1, last_date=None)
    assert list(s.index) == ["2025-01-06"]
    loc = m1[m1.index.hour < 22]
    last = loc["close"].groupby(loc.index.hour * 12 + loc.index.minute // 5).last()
    r = np.diff(np.log(last.to_numpy()))
    assert s.loc["2025-01-06", "n"] == 263
    assert np.isclose(s.loc["2025-01-06", "rv"], np.sum(r ** 2))
    assert np.isclose(s.loc["2025-01-06", "rs_up"] + s.loc["2025-01-06", "rs_dn"], s.loc["2025-01-06", "rv"])


def test_hole_drops_returns_instead_of_inserting_a_zero():
    m1 = _m1("2025-01-06 00:00", "2025-01-07 00:00")
    hole = (m1.index >= "2025-01-06 10:00") & (m1.index < "2025-01-06 10:15")   # three empty 5-min slots
    s = R.session_rv(m1[~hole], last_date=None)
    # 264 slots - 3 empty = 261 non-empty; 263 adjacent steps lose the 4 that touch the hole
    assert s.loc["2025-01-06", "slots"] == 261
    assert s.loc["2025-01-06", "n"] == 259
    # a forward-filled grid would have made 3 zero returns; none exist here
    full = R.session_rv(m1, last_date=None)
    assert s.loc["2025-01-06", "rv"] < full.loc["2025-01-06", "rv"]


def test_weekends_after_22_london_and_bst_are_handled():
    m1 = _m1("2025-06-27 00:00", "2025-07-01 00:00")          # Fri..Mon, London on BST (UTC+1)
    s = R.session_rv(m1, last_date=None)
    assert list(s.index) == ["2025-06-27", "2025-06-30"]       # no Saturday / Sunday sessions
    # BST: the London session for Monday 30 Jun starts 23:00 UTC Sunday and ends 21:00 UTC Monday
    assert np.isclose(s.loc["2025-06-30", "open"], m1.loc["2025-06-29 23:00", "open"])
    assert np.isclose(s.loc["2025-06-30", "close"], m1.loc["2025-06-30 20:59", "close"])


def test_overnight_return_is_separate_and_uses_previous_session():
    m1 = _m1("2025-01-06 00:00", "2025-01-08 00:00")
    s = R.session_rv(m1, last_date=None)
    assert np.isnan(s.loc["2025-01-06", "r_on"])
    exp = np.log(s.loc["2025-01-07", "open"] / s.loc["2025-01-06", "close"])
    assert np.isclose(s.loc["2025-01-07", "r_on"], exp)


def test_session_rv_prefix_invariance_no_forward_bias():
    m1 = _m1("2025-03-03 00:00", "2025-04-12 00:00", seed=7)   # crosses the UK clock change (30 Mar)
    full = R.session_rv(m1, last_date=None)
    for cut in ["2025-03-12 13:37", "2025-03-28 21:59", "2025-04-02 00:00"]:
        part = R.session_rv(m1[m1.index < pd.Timestamp(cut, tz="UTC")], last_date=None)
        done = [d for d in part.index if R.london_open_utc(d) + pd.Timedelta(hours=23) <= pd.Timestamp(cut, tz="UTC")]
        assert done, cut
        pd.testing.assert_frame_equal(part.loc[done], full.loc[done])


def test_ny_close_bars_end_at_1700_new_york_and_skip_weekends():
    m1 = _m1("2025-01-03 00:00", "2025-01-08 00:00")          # Fri..Tue
    ny = R.ny_close_daily(m1, last_date=None)
    assert list(ny.index) == ["2025-01-03", "2025-01-06", "2025-01-07"]
    assert ny.loc["2025-01-06", "end_utc"] == pd.Timestamp("2025-01-06 22:00", tz="UTC")   # EST: 17:00 NY = 22:00 UTC
    # Monday's bar opens with Sunday 17:00 NY, the weekend open
    assert np.isclose(ny.loc["2025-01-06", "open"], m1.loc["2025-01-05 22:00", "open"])


def test_ny_bars_prefix_invariance_and_unfinished_bar_dropped():
    m1 = _m1("2025-03-03 00:00", "2025-03-20 00:00", seed=3)  # crosses the US clock change (9 Mar)
    full = R.ny_close_daily(m1, last_date=None)
    cut = pd.Timestamp("2025-03-12 15:00", tz="UTC")           # mid NY day: that day's bar is not finished
    part = R.ny_close_daily(m1[m1.index < cut], last_date=None)
    assert part.index[-1] == "2025-03-11"
    pd.testing.assert_frame_equal(part, full.loc[part.index])


def test_bars_before_never_includes_a_bar_closing_after_the_london_open():
    m1 = _m1("2025-03-03 00:00", "2025-04-12 00:00", seed=5)
    ny = R.ny_close_daily(m1, last_date=None)
    s = R.session_rv(m1, last_date=None)
    pos = R.last_bar_index_before(ny, list(s.index))
    for d, p in zip(s.index, pos):
        open_ = R.london_open_utc(d)
        if p >= 0:
            assert ny["end_utc"].iloc[p] <= open_
        if p + 1 < len(ny):
            assert ny["end_utc"].iloc[p + 1] > open_
        assert len(R.bars_before(ny, d)) == p + 1


def test_lockbox_cut_is_the_default():
    m1 = _m1("2026-08-19 00:00", "2026-08-27 00:00")
    s = R.session_rv(m1)
    ny = R.ny_close_daily(m1)
    assert s.index.max() == "2026-08-21"
    assert ny.index.max() <= "2026-08-21"
    assert R.session_rv(m1, last_date=None).index.max() > "2026-08-21"
