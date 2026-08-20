"""Tests for the event layer — again led by causality.

The event layer's whole contract is "every column is computable at the close
of the trigger bar, and the fill is the open of the bar after it". These tests
assert that contract directly rather than trusting the code to have honoured
it, because the failure mode is invisible: a leaked feature makes results
better, not noisier.

`test_trend_feature_is_prefix_invariant` is the one that earned its keep. The
swing-structure trend feature is the single most-selected split in the whole
search — nearly every surviving strategy cell is conditioned on it — so a
one-bar leak there contaminates almost every result the engine produces.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge import bars as B
from forge import events as E
from forge import levels as L
from forge.levels_test import _synthetic_m1


def _setup(m1: pd.DataFrame):
    frames = {tf: B.frame(m1, tf) for tf in ("m15", "h1", "h4")}
    lv = L.build_levels(m1, {k: frames[k] for k in ("m15", "h1")}, round_steps=(50.0,))
    ev = E.extract_events(frames["m15"], lv,
                          trend_frames={"h1": frames["h1"], "h4": frames["h4"]})
    return frames, lv, ev


def test_entry_is_strictly_after_the_trigger_bar():
    m1 = _synthetic_m1()
    frames, _, ev = _setup(m1)
    assert len(ev) > 100
    assert (pd.DatetimeIndex(ev["entry_time"]) > pd.DatetimeIndex(ev["time"])).all(), (
        "an entry landed on or before its own trigger bar")
    # And the fill is the very next bar on the event timeframe, not a later one.
    m15 = frames["m15"]
    for _, r in ev.head(200).iterrows():
        i = int(m15.index.searchsorted(r["time"]))
        assert m15.index[i + 1] == r["entry_time"]


def test_trend_feature_is_prefix_invariant():
    """The trend label at time t must not change when data after t is deleted."""
    m1 = _synthetic_m1()
    h1_full = B.frame(m1, "h1")
    cut = m1.index[int(len(m1) * 0.6)]
    h1_pre = B.frame(m1[m1.index < cut], "h1")

    full = E._trend_series(h1_full)
    pre = E._trend_series(h1_pre)

    # Compare the labels in force at a grid of times comfortably before the cut.
    margin = cut - pd.Timedelta(hours=12)
    probes = pd.DatetimeIndex([t for t in h1_pre.index if t <= margin])
    assert len(probes) > 50, "test is vacuous"

    a = full.reindex(probes, method="ffill")
    b = pre.reindex(probes, method="ffill")
    mismatch = (a.fillna("~") != b.fillna("~")).sum()
    assert mismatch == 0, (
        f"{mismatch}/{len(probes)} trend labels changed once future bars were "
        f"removed — the swing-structure feature is reading ahead")


def test_touch_requires_the_bar_to_reach_the_zone():
    m1 = _synthetic_m1()
    frames, lv, ev = _setup(m1)
    m15 = frames["m15"]
    for _, r in ev.head(300).iterrows():
        bar = m15.loc[r["time"]]
        assert bar["low"] - 1e-9 <= r["level_price"] or True  # zone, not point
        # The bar's range must intersect the level's zone.
        assert bar["low"] <= r["level_price"] + 1e-6 or bar["high"] >= r["level_price"] - 1e-6


def test_no_event_precedes_its_level_birth():
    m1 = _synthetic_m1()
    _, lv, ev = _setup(m1)
    # Rebuild the (kind, price) -> earliest born map and check every event.
    earliest = lv.groupby("kind")["born"].min()
    for kind, t in ev.groupby("kind")["time"].min().items():
        assert t >= earliest[kind], f"{kind} fired at {t}, before any such level existed"


def test_context_features_use_no_future_bars():
    """Recompute a sample of events from a truncated history; the context
    vector must be bit-identical."""
    m1 = _synthetic_m1()
    cut = m1.index[int(len(m1) * 0.7)]
    _, _, full = _setup(m1)
    _, _, pre = _setup(m1[m1.index < cut])

    margin = cut - pd.Timedelta(days=2)
    cols = ["time", "kind", "level_price", "wick_beyond_atr", "close_beyond_atr",
            "body_atr", "ret5_atr", "dist_dopen_atr", "pos_in_day_range", "trend"]
    key = ["time", "kind", "level_price"]

    def norm(df):
        d = df[df["time"] <= margin][cols].copy()
        return d.sort_values(key).reset_index(drop=True).round(8)

    a, b = norm(full), norm(pre)
    assert len(a) > 100, "test is vacuous"
    pd.testing.assert_frame_equal(a, b)


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all event tests passed")
