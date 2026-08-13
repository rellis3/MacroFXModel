"""Tests for the level zoo, led by the one that matters: prefix invariance.

The bug this file exists to prevent is not a crash, it is a level that quietly
knows the future. That kind of bug produces *better* backtests, so nothing
about a green run will reveal it — only an explicit test will.

`test_prefix_invariance` is the general form of the check and it is worth
understanding rather than just running. Build the level set from the whole
history, then rebuild it from a truncated prefix of the same bars. Any level
whose `born` falls inside the prefix must come out **identical** in both runs.
If its definition touches even one bar at or after its own birth, truncating
the data will change its price, its zone, or make it vanish — and the
assertion fires. It catches lookahead in every family at once, including
families added later that nobody thought to write a test for.

This caught a real one: FVG/order-block/swing levels were stamped with the
OPEN of their confirming bar instead of its close, because `resample` is
left-labelled. An H1 gap "born" at 03:00 was visible to an M15 event at 03:15
while its own boundary was the low of the 03:00–04:00 bar — 45 minutes of
future price, feeding a 68%-win-rate "edge" that evaporated once fixed.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge import bars as B
from forge import levels as L


def _synthetic_m1(n: int = 60 * 24 * 40, seed: int = 3) -> pd.DataFrame:
    """Deterministic random-walk M1 with a real intraday shape and volume."""
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2024-01-01", periods=n, freq="1min", tz="UTC")
    step = rng.normal(0, 0.25, n)
    # A little intraday amplitude so sessions/profiles are not degenerate.
    step *= 1.0 + 0.8 * np.sin(np.arange(n) * 2 * np.pi / (60 * 24))
    close = 2000 + np.cumsum(step)
    spread = np.abs(rng.normal(0, 0.15, n)) + 0.02
    return pd.DataFrame({
        "open": close - step,
        "high": np.maximum(close, close - step) + spread,
        "low": np.minimum(close, close - step) - spread,
        "close": close,
        "volume": rng.integers(1, 500, n).astype(float),
    }, index=idx)


def _build(m1: pd.DataFrame) -> pd.DataFrame:
    frames = {tf: B.frame(m1, tf) for tf in ("m15", "h1")}
    return L.build_levels(m1, frames, round_steps=(50.0,))


def test_prefix_invariance():
    """A level born before time T must not change when data after T is removed."""
    m1 = _synthetic_m1()
    full = _build(m1)

    cut = m1.index[int(len(m1) * 0.6)]
    prefix = _build(m1[m1.index < cut])

    # Compare only levels born comfortably before the cut: a level born in the
    # last few bars of the prefix legitimately has a truncated LIFETIME (its
    # expiry depends on later price), which is not a causality violation. Its
    # identity — kind and price — still must match.
    margin = cut - pd.Timedelta(days=2)
    key = ["kind", "born", "price", "lo", "hi"]
    num = ["price", "lo", "hi"]

    def norm(df):
        out = df[df["born"] <= margin][key].copy()
        out[num] = out[num].round(6)
        return out.sort_values(key).reset_index(drop=True)

    a, b = norm(full), norm(prefix)

    assert len(a) > 200, f"test is vacuous — only {len(a)} levels before the cut"
    missing = len(a) - len(b)
    assert missing == 0, (
        f"{missing} levels changed or vanished when future bars were removed — "
        f"their definition reads data at or after their own `born`")
    pd.testing.assert_frame_equal(a, b)


def test_bar_derived_levels_are_born_after_their_source_bar_closes():
    """FVG / order-block / swing levels must be born no earlier than the close
    of the bar that confirms them (the specific off-by-one that bit)."""
    m1 = _synthetic_m1()
    h1 = B.frame(m1, "h1")
    times = h1.index

    for lv in (L.fvg_levels(h1, "h1"), L.order_block_levels(h1, "h1"),
               L.swing_levels(h1, "h1", n=5)):
        assert len(lv) > 0, "no levels produced — test would be vacuous"
        for _, row in lv.iterrows():
            born_i = int(times.searchsorted(row["born"], side="left"))
            past = h1.iloc[:born_i]
            # Every price the level quotes must be visible in already-closed
            # bars. A gap edge taken from the confirming bar's own low fails
            # this the moment `born` is stamped with that bar's open.
            for px in (row["lo"], row["hi"]):
                assert past["low"].min() - 1e-6 <= px <= past["high"].max() + 1e-6, (
                    f"{row['kind']} born {row['born']} quotes {px}, outside the "
                    f"range of every bar that had closed by then")


def test_daily_anchors_use_only_the_prior_day():
    m1 = _synthetic_m1()
    days = B.day_key(m1.index, 0)
    daily = L.period_ohlc(m1, days)
    lv = L.day_anchor_levels(daily)

    for i in range(1, min(len(daily), 8)):
        prev, cur = daily.iloc[i - 1], daily.iloc[i]
        born = cur["start"]
        got = lv[(lv["born"] == born) & (lv["kind"] == "pdh")]
        assert len(got) == 1
        assert abs(float(got["price"].iloc[0]) - prev["high"]) < 1e-9


def test_naked_poc_dies_when_price_trades_through_it():
    m1 = _synthetic_m1()
    days = B.day_key(m1.index, 0)
    lv = L.profile_levels(m1, days, "d1")
    npoc = lv[lv["kind"] == "d1_npoc"]
    assert len(npoc) > 0
    for _, row in npoc.iterrows():
        window = m1[(m1.index >= row["born"]) & (m1.index < row["expire"])]
        if len(window) < 10:
            continue
        # While it is alive it is by definition untouched, so price must not
        # have straddled it before its expiry.
        assert not ((window["low"] <= row["price"]) & (window["high"] >= row["price"])).any(), (
            f"naked POC at {row['price']} was traded through at "
            f"{window.index[0]} but stayed live until {row['expire']}")


def test_resample_drops_weekend_gaps_rather_than_inventing_bars():
    m1 = _synthetic_m1(60 * 24 * 10)
    gapped = m1.drop(m1.index[(60 * 24 * 3):(60 * 24 * 5)])   # a 2-day hole
    h1 = B.resample(gapped, "h1")
    assert h1[["open", "high", "low", "close"]].notna().all().all()
    assert len(h1) < 10 * 24, "empty weekend bins were not dropped"


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all level tests passed")
