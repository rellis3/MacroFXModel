"""Synthetic, offline tests for triangle_channel -- no network, no files.

Run: python pylego/triangle_channel_test.py

Mirror scenarios use a POSITIVE-AFFINE reflection (mirrored = 2*C - price
for a constant C, not pure negation) -- pure negation through zero was tried
first and silently zeroed out every extra touch beyond the 2 anchors,
because `pylego.trendline.line_touches` (regenerated faithfully from
`js/patternEngine.js`'s `lineTouches`) only counts a touch when its
projected price is `> 0` -- a sensible guard for real (always-positive)
price data, but one that breaks literal negation as a test technique the
moment more than the 2 anchor points are needed to clear
`min_touches_per_side`. Caught by comparing hand-derived touch counts
against the actual computed pivot lists before trusting the mirrored
scenario, same discipline as every other detector's tests here.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.triangle_channel import detect_triangles_channels  # noqa: E402


def _flat_bars(prices):
    arr = np.asarray(prices, dtype=np.float64)
    return pd.DataFrame({"open": arr, "high": arr, "low": arr, "close": arr})


_DEFAULT_OPTS = dict(pivot_n=1, min_touches_per_side=3, touch_tol_pct=0.01,
                     flat_slope_atr_frac=0.05, breakout_max_bars=5)


def test_ascending_triangle_confirms_up():
    # flat top (~110, slope -0.0125) + rising bottom (102->108.5, slope 1.08)
    prices = [100, 110, 102, 109.5, 105, 109.8, 107, 110, 108.5, 109.9, 109, 130]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_triangles_channels(bars, atr_arr, window_bars=10, **_DEFAULT_OPTS)
    assert len(out) == 1
    tc = out[0]
    assert tc.shape_type == "ascending_triangle"
    assert tc.win_end_idx == 10
    assert tc.confirm_idx == 11
    assert tc.direction == 1
    assert tc.expected_direction == 1
    assert tc.played_out is True
    assert tc.upper_touches == 5 and tc.lower_touches == 4


def test_descending_triangle_via_positive_reflection():
    asc_prices = [100, 110, 102, 109.5, 105, 109.8, 107, 110, 108.5, 109.9, 109, 130]
    reflected = [2000 - p for p in asc_prices]
    bars = _flat_bars(reflected)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_triangles_channels(bars, atr_arr, window_bars=10, **_DEFAULT_OPTS)
    assert len(out) == 1
    tc = out[0]
    assert tc.shape_type == "descending_triangle"
    assert tc.direction == -1 and tc.expected_direction == -1
    assert tc.played_out is True


def test_channel_up_confirms_up():
    prices = [100, 110, 102, 112.2, 104.2, 114.4, 106.4, 116.6, 108.6, 118.8, 110.8, 140]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_triangles_channels(bars, atr_arr, window_bars=9, **_DEFAULT_OPTS)
    assert len(out) == 1
    tc = out[0]
    assert tc.shape_type == "channel_up"
    assert tc.direction == 1 and tc.expected_direction == 1
    assert tc.played_out is True
    assert tc.upper_touches == 4 and tc.lower_touches == 4


def test_channel_down_via_positive_reflection():
    up_prices = [100, 110, 102, 112.2, 104.2, 114.4, 106.4, 116.6, 108.6, 118.8, 110.8, 140]
    reflected = [2000 - p for p in up_prices]
    bars = _flat_bars(reflected)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_triangles_channels(bars, atr_arr, window_bars=9, **_DEFAULT_OPTS)
    assert len(out) == 1
    tc = out[0]
    assert tc.shape_type == "channel_down"
    assert tc.direction == -1 and tc.expected_direction == -1
    assert tc.played_out is True


def test_symmetrical_triangle_has_no_forced_expectation():
    # Falling top (110->103.5) + rising bottom (98->103), converging to an apex.
    prices = [100, 110, 98, 107, 100.5, 105, 102, 104, 103, 103.5, 103.2, 120]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_triangles_channels(bars, atr_arr, window_bars=10, pivot_n=1,
                                    min_touches_per_side=3, touch_tol_pct=0.02,
                                    flat_slope_atr_frac=0.05, breakout_max_bars=5)
    assert len(out) == 1
    tc = out[0]
    assert tc.shape_type == "symmetrical_triangle"
    assert tc.expected_direction is None  # genuinely undecided, not a fabricated 50/50
    assert tc.played_out is None


def test_rising_wedge_confirms_down():
    # Both lines rising, but the lower line (98->105.5, slope 1.25) catches up
    # to the upper line (110->113, slope 0.5) -- a converging same-sign wedge.
    prices = [100, 110, 98, 111, 100.5, 112, 103, 113, 105.5, 114, 107]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_triangles_channels(bars, atr_arr, window_bars=9, **_DEFAULT_OPTS)
    assert len(out) == 1
    tc = out[0]
    assert tc.shape_type == "rising_wedge"
    assert tc.direction == -1  # the classic exhaustion read: rising wedge -> down
    assert tc.expected_direction == -1
    assert tc.played_out is True


def test_insufficient_touches_no_instance():
    # A shallow, low-amplitude chop with only 1 real pivot per side inside
    # the window -- can't clear min_touches_per_side, no shape classified.
    prices = [100, 110, 95, 105, 100, 102, 101, 103, 102.5, 103.5, 103, 101]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_triangles_channels(bars, atr_arr, window_bars=9, **_DEFAULT_OPTS)
    assert out == []


def test_causal_ordering_invariant():
    scenarios = [
        [100, 110, 102, 109.5, 105, 109.8, 107, 110, 108.5, 109.9, 109, 130],
        [100, 110, 98, 111, 100.5, 112, 103, 113, 105.5, 114, 107],
        [100, 110, 98, 107, 100.5, 105, 102, 104, 103, 103.5, 103.2, 120],
    ]
    for prices in scenarios:
        bars = _flat_bars(prices)
        atr_arr = np.full(len(bars), 1.0)
        out = detect_triangles_channels(bars, atr_arr, window_bars=9, pivot_n=1,
                                        min_touches_per_side=3, touch_tol_pct=0.02,
                                        flat_slope_atr_frac=0.05, breakout_max_bars=5)
        for tc in out:
            assert tc.start_idx <= tc.win_end_idx < tc.confirm_idx


def test_real_data_smoke():
    try:
        from AnalogML.pattern_scan import load_bars
        from pylego.swing_structure import atr as atr_fn
    except Exception:
        print("  [skip] AnalogML data not available in this environment")
        return
    bars = load_bars("gbpjpy", "1h").iloc[-8000:].reset_index(drop=True)
    atr_arr = atr_fn(bars, period=14)
    instances = detect_triangles_channels(bars, atr_arr)
    for tc in instances:
        assert tc.start_idx <= tc.win_end_idx < tc.confirm_idx
        assert tc.shape_type in (
            "ascending_triangle", "descending_triangle", "symmetrical_triangle",
            "rising_wedge", "falling_wedge", "channel_up", "channel_down",
        )
    by_type = {}
    for tc in instances:
        by_type[tc.shape_type] = by_type.get(tc.shape_type, 0) + 1
    print(f"  [real-data smoke] gbpjpy 1h, last 8000 bars: {len(instances)} instances -- {by_type}")


if __name__ == '__main__':
    fns = [v for k, v in list(globals().items()) if k.startswith('test_')]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f'ok   {fn.__name__}')
        except Exception as e:
            failed += 1
            print(f'FAIL {fn.__name__}: {type(e).__name__}: {e}')
    print(f'\n{len(fns) - failed}/{len(fns)} passed')
    sys.exit(1 if failed else 0)
