"""Synthetic, offline tests for pattern_lifecycle -- no network, no files.

Run: python pylego/pattern_lifecycle_test.py
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.pattern_lifecycle import Acceptance, compute_acceptance, compute_confidence  # noqa: E402


def _flat_bars(prices):
    arr = np.asarray(prices, dtype=np.float64)
    return pd.DataFrame({"open": arr, "high": arr, "low": arr, "close": arr})


def test_acceptance_full_hold_accepted():
    prices = [100, 100, 100, 100, 100, 105.75, 105.75, 105.75, 105.75, 105.75]
    bars = _flat_bars(prices)
    a = compute_acceptance(bars, confirm_idx=5, breakout_level=105.0, direction=1)
    assert a.checked == 3 and a.held == 3
    assert a.hold_frac == 1.0
    assert a.accepted is True


def test_acceptance_snap_back_rejected():
    prices = [100, 100, 100, 100, 100, 105.75, 104.0, 104.0, 104.0, 104.0]
    bars = _flat_bars(prices)
    a = compute_acceptance(bars, confirm_idx=5, breakout_level=105.0, direction=1)
    assert a.checked == 3 and a.held == 0
    assert a.hold_frac == 0.0
    assert a.accepted is False


def test_acceptance_partial_hold_clears_default_threshold():
    # 2/3 = 0.6667 >= the default 0.66 floor -- accepted, but just barely.
    prices = [100, 100, 100, 100, 100, 105.75, 106.0, 104.0, 106.0, 104.0]
    bars = _flat_bars(prices)
    a = compute_acceptance(bars, confirm_idx=5, breakout_level=105.0, direction=1)
    assert a.checked == 3 and a.held == 2
    assert a.hold_frac == 0.6667
    assert a.accepted is True


def test_acceptance_direction_down_mirrors_up():
    prices = [100, 100, 100, 100, 100, 94.25, 94.25, 94.25]
    bars = _flat_bars(prices)
    a = compute_acceptance(bars, confirm_idx=5, breakout_level=95.0, direction=-1)
    assert a.checked == 2 and a.held == 2
    assert a.accepted is True


def test_confidence_hand_verified_weighted_sum():
    # atr=1.0 flat, atr_slow=1/0.6 flat -> vol_ratio=0.6 exactly -> perfect
    # compression (vol_compression=1.0). close[5]=105.75, breakout_level=105.0,
    # local_atr=1.0 -> breakout_distance=0.75 -> breakout_strength=1.0 (max).
    # acceptance held 3/3 -> acceptance_score=1.0.
    # score = 0.8*20 + 0.6*20 + 0.4*15 + 1.0*15 + 1.0*15 + 1.0*15 = 79
    prices = [100, 100, 100, 100, 100, 105.75, 105.75, 105.75, 105.75, 105.75]
    bars = _flat_bars(prices)
    raw = {"impulse_quality": 0.8, "shape_quality": 0.6, "retracement_quality": 0.4}
    atr_arr = np.full(10, 1.0)
    atr_slow_arr = np.full(10, 1.0 / 0.6)
    acceptance = Acceptance(checked=3, held=3, hold_frac=1.0, accepted=True)
    c = compute_confidence(raw, bars, atr_arr, atr_slow_arr, start_idx=0, confirm_idx=5,
                           breakout_level=105.0, acceptance=acceptance)
    assert c.total == 79
    assert c.sub["vol_compression"] == 1.0
    assert c.sub["breakout_strength"] == 1.0
    assert c.sub["acceptance"] == 1.0
    assert c.sub["impulse_quality"] == 0.8
    assert c.sub["shape_quality"] == 0.6
    assert c.sub["retracement_quality"] == 0.4


def test_confidence_missing_raw_scores_default_to_half():
    prices = [100] * 10
    bars = _flat_bars(prices)
    atr_arr = np.full(10, 1.0)
    atr_slow_arr = np.full(10, 1.0)
    c = compute_confidence({}, bars, atr_arr, atr_slow_arr, start_idx=0, confirm_idx=5,
                           breakout_level=None, acceptance=None)
    assert c.sub["impulse_quality"] == 0.5
    assert c.sub["shape_quality"] == 0.5
    assert c.sub["retracement_quality"] == 0.5
    assert c.sub["breakout_strength"] == 0.0  # no breakout_level -> 0 distance
    assert c.sub["acceptance"] == 0.0  # no acceptance object -> 0


def test_confidence_vol_expansion_scores_lower_than_compression():
    # vol_ratio=1.0 (no compression at all, atr==atr_slow) should score lower
    # on vol_compression than vol_ratio=0.6 (the healthy-contraction peak).
    prices = [100] * 10
    bars = _flat_bars(prices)
    atr_arr = np.full(10, 1.0)
    atr_slow_expanded = np.full(10, 1.0)   # ratio = 1.0 -> off the 0.6 peak
    atr_slow_compressed = np.full(10, 1.0 / 0.6)  # ratio = 0.6 -> peak
    c_expanded = compute_confidence({}, bars, atr_arr, atr_slow_expanded, 0, 5, None, None)
    c_compressed = compute_confidence({}, bars, atr_arr, atr_slow_compressed, 0, 5, None, None)
    assert c_compressed.sub["vol_compression"] > c_expanded.sub["vol_compression"]
    assert abs(c_expanded.sub["vol_compression"] - round(1 - (1.0 - 0.6) / 0.6, 4)) < 1e-9  # formula check


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
