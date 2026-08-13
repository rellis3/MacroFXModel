"""Tests for confidence.py, led by the same causality discipline as the rest of
`forge` — a leak here is worse than a leak in `levels.py` because confidence is
meant to be the FINAL gate: if it peeks ahead, every gated result looks better
than it should, exactly like the three bugs `levels_test.py` documents.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge import bars as B
from forge import events as E
from forge import levels as L
from forge.confidence import CONFIDENCE_FACTORS, score_events
from forge.levels_test import _synthetic_m1


def _setup(m1: pd.DataFrame):
    frames = {tf: B.frame(m1, tf) for tf in ("m15", "h1", "h4")}
    lv = L.build_levels(m1, {k: frames[k] for k in ("m15", "h1")}, round_steps=(50.0,))
    ev = E.extract_events(frames["m15"], lv,
                          trend_frames={"h1": frames["h1"], "h4": frames["h4"]})
    return frames, ev


def _synthetic_dxy(m1: pd.DataFrame, tf: str, seed: int = 5) -> pd.Series:
    """A standalone fake dollar-basket series — same shape contract as
    `build_dollar_basket`'s output (a cumulative log-index) without touching
    real FX parquet files, so this test is fast and self-contained."""
    bars = B.resample(m1, tf) if tf != "m1" else m1
    rng = np.random.default_rng(seed)
    steps = rng.normal(0, 0.001, len(bars))
    return pd.Series(np.cumsum(steps), index=bars.index, name="dxy_proxy")


def test_confidence_score_is_prefix_invariant():
    """The whole point of the module: gating on this must not let the future
    leak in. Score the same events from the full history and from a truncated
    prefix; the flags for events well before the cut must be identical."""
    m1 = _synthetic_m1()
    frames, ev_full = _setup(m1)
    dxy_full = _synthetic_dxy(m1, "m15")
    scored_full = score_events(ev_full, dxy=dxy_full)

    cut = m1.index[int(len(m1) * 0.65)]
    _, ev_pre = _setup(m1[m1.index < cut])
    dxy_pre = _synthetic_dxy(m1[m1.index < cut], "m15")
    scored_pre = score_events(ev_pre, dxy=dxy_pre)

    margin = cut - pd.Timedelta(days=2)
    cols = ["time", "kind", "level_price", "confidence_long", "confidence_short"] + \
           [f"{f}_{d}" for f in CONFIDENCE_FACTORS for d in ("long", "short")]
    key = ["time", "kind", "level_price"]

    def norm(df):
        d = df[pd.DatetimeIndex(df["time"]) <= margin][cols].copy()
        return d.sort_values(key).reset_index(drop=True)

    a, b = norm(scored_full), norm(scored_pre)
    assert len(a) > 100, "test is vacuous"
    pd.testing.assert_frame_equal(a, b, check_dtype=False)


def test_dxy_confirm_never_reads_a_future_bar():
    """Directly probe the ffill join: a dxy value at exactly feature_time must
    equal what a hand-computed causal lookup gives, for a sample of events —
    not just 'unchanged under truncation', but provably backward-only."""
    m1 = _synthetic_m1()
    frames, ev = _setup(m1)
    dxy = _synthetic_dxy(m1, "m15")
    scored = score_events(ev, dxy=dxy, dxy_window=8)

    mom = dxy - dxy.shift(8)
    sigma = mom.rolling(500, min_periods=50).std()
    z = mom / sigma

    for _, row in scored.head(300).iterrows():
        ft = row["feature_time"]
        # The causal value at ft is the most recent z at or before ft.
        eligible = z[z.index <= ft]
        if eligible.empty or not np.isfinite(eligible.iloc[-1]):
            continue
        expected_long = bool(eligible.iloc[-1] <= -0.5)
        expected_short = bool(eligible.iloc[-1] >= 0.5)
        assert bool(row["dxy_confirm_long"]) == expected_long
        assert bool(row["dxy_confirm_short"]) == expected_short


def test_confidence_score_is_bounded_and_direction_specific():
    m1 = _synthetic_m1()
    frames, ev = _setup(m1)
    dxy = _synthetic_dxy(m1, "m15")
    scored = score_events(ev, dxy=dxy)

    assert scored["confidence_long"].between(0, len(CONFIDENCE_FACTORS)).all()
    assert scored["confidence_short"].between(0, len(CONFIDENCE_FACTORS)).all()
    # A single event's long and short confidence need not be equal (reject
    # and htf_with are direction-specific) — this asserts they CAN differ,
    # catching an implementation that accidentally computed one score and
    # copied it to both columns.
    assert (scored["confidence_long"] != scored["confidence_short"]).any()


def test_no_dxy_series_degrades_to_zero_not_a_crash():
    m1 = _synthetic_m1()
    frames, ev = _setup(m1)
    scored = score_events(ev, dxy=None)
    assert (scored["dxy_confirm_long"] == False).all()  # noqa: E712
    assert (scored["dxy_confirm_short"] == False).all()  # noqa: E712
    assert scored["confidence_long"].max() <= len(CONFIDENCE_FACTORS) - 1


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all confidence tests passed")
