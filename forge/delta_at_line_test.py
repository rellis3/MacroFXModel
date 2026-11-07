"""scripts/delta-at-line/score.py on hand-built bars: divergences as drawn on a chart, no lookahead, London touch times, the sign flip for 6J."""
import importlib.util
import pathlib

import numpy as np
import pandas as pd

spec = importlib.util.spec_from_file_location("dal", pathlib.Path(__file__).resolve().parents[1] / "scripts" / "delta-at-line" / "score.py")
dal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dal)


def test_regular_divergence_price_above_the_swing_high_with_delta_below_it():
    #            0   1   2   3  4   5   6   7  8   9
    H = np.array([10, 11, 12, 15, 12, 11, 12, 13, 14, 16], float)     # swing high at 3, new high at the end
    L = H - 1
    C = np.array([1, 2, 3, 9, 8, 7, 6, 5, 5, 4], float)               # cumulative delta at the end is under its value at the swing
    assert dal.divergences(H, L, C)[0] is True
    C2 = np.array([1, 2, 3, 9, 8, 9, 10, 11, 12, 20], float)          # delta confirms: no divergence
    assert dal.divergences(H, L, C2)[0] is False
    H3 = H.copy()
    H3[-2:] = 13                                                      # price has not gone beyond the swing
    assert dal.divergences(H3, H3 - 1, C)[0] is False


def test_hidden_divergence_higher_low_on_lower_delta():
    L = np.array([10, 9, 5, 9, 10, 11, 9, 7, 9, 11, 12, 13], float)   # swing lows at 2 and 7, the later higher
    H = L + 1
    C = np.array([5, 5, 6, 7, 8, 8, 6, 3, 4, 5, 6, 6], float)         # delta lower at the later low
    assert dal.divergences(H, L, C)[1] is True
    C2 = np.array([5, 5, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9], float)        # delta also higher
    assert dal.divergences(H, L, C2)[1] is False
    L3 = np.array([10, 9, 5, 9, 10, 11, 9, 4, 9, 11, 12, 13], float)  # a lower low is not hidden
    assert dal.divergences(L3 + 1, L3, C)[1] is False


def test_a_swing_needs_two_later_blocks_so_the_last_two_can_never_be_swings():
    x = np.array([1, 2, 3, 4, 9, 3, 2, 3, 12], float)
    assert dal.swings(x) == [4]
    x2 = np.array([1, 2, 3, 4, 5, 6, 9, 3], float)                    # only one block after the peak
    assert dal.swings(x2) == []


def test_blocks_are_oriented_and_use_only_bars_before_the_touch():
    t = np.datetime64("2024-03-04T14:00", "m")
    ts = t - np.arange(120, 0, -1).astype("timedelta64[m]")
    hi, lo = np.arange(120.0) + 1, np.arange(120.0)
    delta = np.ones(120)
    H, L, C = dal.blocks_back(ts, hi, lo, delta, t, 1)
    assert H[-1] == 120 and L[0] == 0 and C[-1] == 120
    H2, L2, C2 = dal.blocks_back(ts, hi, lo, delta, t, -1)
    assert H2[-1] == -115 and L2[-1] == -120 and C2[-1] == -120
    # A bar at the touch minute or later cannot change anything.
    ts3 = np.r_[ts, t, t + np.timedelta64(1, "m")]
    H3, _, C3 = dal.blocks_back(ts3, np.r_[hi, 999, 999], np.r_[lo, 0, 0], np.r_[delta, 99, 99], t, 1)
    assert H3[-1] == 120 and C3[-1] == 120
    assert dal.blocks_back(ts[30:], hi[30:], lo[30:], delta[30:], t, 1) is None        # under 100 of 120 minutes


def test_touch_time_is_london_in_summer_and_winter():
    assert dal.touch_utc("2024-07-01", 600).strftime("%H:%M") == "09:00"               # 10:00 London in BST
    assert dal.touch_utc("2024-01-15", 600).strftime("%H:%M") == "10:00"


def test_usdjpy_uses_6j_with_the_sign_flipped():
    assert dal.MAP["USDJPY"][:2] == ("6J", -1) and dal.MAP["EURUSD"][:2] == ("6E", 1)


def test_contrast_recovers_a_planted_effect_and_rejects_noise():
    rng = np.random.default_rng(1)
    n = 3000
    dates = pd.date_range("2023-01-01", periods=300).strftime("%Y-%m-%d").to_numpy()
    flag = rng.random(n) < .2
    y = (rng.random(n) < np.where(flag, .65, .45)).astype(float)
    d = pd.DataFrame(dict(inst="X", rung="p50", side="up", date=rng.choice(dates, n), y=y, resolved=True, F=flag))
    c = dal.contrast(d, "F", np.random.default_rng(2), B_=300)
    assert abs(c["est"] - .20) < .05 and c["lo"] > .1
    d2 = d.assign(y=(rng.random(n) < .5).astype(float))
    c2 = dal.contrast(d2, "F", np.random.default_rng(2), B_=300)
    assert abs(c2["est"]) < .06 and c2["lo"] < 0 < c2["hi"]


def test_contrast_ignores_unmeasured_touches():
    d = pd.DataFrame(dict(inst="X", rung="p50", side="up", date=[f"2023-01-{i % 28 + 1:02d}" for i in range(60)], y=[1.0, 0.0] * 30, resolved=True, F=[True] * 10 + [None] * 10 + [False] * 40))
    c = dal.contrast(d, "F", np.random.default_rng(2), B_=50)
    assert c["n"] == 10 and c["m"] == 40


def test_minute_bars_sign_from_the_side_field():
    t = pd.DataFrame(dict(ts_event=pd.to_datetime(["2024-03-04 14:00:01", "2024-03-04 14:00:30", "2024-03-04 14:01:00"], utc=True), instrument_id=1, price=[1.0, 1.1, 1.05], size=[2, 3, 4], side=["B", "A", "N"]))
    b = dal.minute_bars(t)
    assert list(b.buy) == [2, 0] and list(b.sell) == [3, 0] and b.high[0] == 1.1 and b.close[0] == 1.1
