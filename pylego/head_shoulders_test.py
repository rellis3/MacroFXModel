"""Synthetic, offline tests for head_shoulders -- no network, no files.

Run: python pylego/head_shoulders_test.py (from repo root -- head_shoulders
cross-imports pylego.swing_structure and pylego.trendline, same convention
as motif_touch_test.py/flag_pennant_test.py).

Every scenario below was verified computationally against the already-
tested pivot_highs/pivot_lows bricks before being baked into an assertion
(a first draft of the "failure" scenario was wrong -- the added spike bar
retroactively disqualified the right shoulder as a pivot by breaking its
centered-window neighbour check; caught by inspecting the actual detector
output before trusting it, not by pure mental arithmetic).
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.head_shoulders import detect_head_shoulders  # noqa: E402


def _flat_bars(prices):
    arr = np.asarray(prices, dtype=np.float64)
    return pd.DataFrame({"open": arr, "high": arr, "low": arr, "close": arr})


# L=110(idx1), trough=95(idx2), H=130(idx3), trough=90(idx4), R=112(idx5) --
# shoulders within the default 2.0xATR tolerance, head clears both by >=18
# (default floor is 1.5xATR=1.5), both troughs are >=15/22 deep (default
# floor is 0.75xATR=0.75).
_HS = [100, 110, 95, 130, 90, 112]


def test_regular_head_shoulders_confirms_reversal_down():
    prices = _HS + [80]  # idx6: closes below the declining neckline
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_head_shoulders(bars, atr_arr, pivot_n=1)
    assert len(out) == 1
    hs = out[0]
    assert hs.is_inverse is False
    assert (hs.left_idx, hs.head_idx, hs.right_idx) == (1, 3, 5)
    assert hs.confirm_idx == 6
    assert hs.direction == -1 and hs.expected_direction == -1
    assert hs.played_out is True
    assert hs.measured_move == 37.5
    assert hs.breakout_level == 85.0
    assert hs.neckline_p1_price == 95.0 and hs.neckline_p2_price == 90.0


def test_regular_head_shoulders_flags_failure_beyond_right_shoulder():
    # A buffer bar (idx6=100) keeps the right shoulder a valid centered-
    # window pivot before the failure spike (idx7=120, above R=112).
    prices = _HS + [100, 120]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_head_shoulders(bars, atr_arr, pivot_n=1)
    assert len(out) == 1
    hs = out[0]
    assert hs.confirm_idx == 7
    assert hs.direction == 1
    assert hs.expected_direction == -1
    assert hs.played_out is False
    assert hs.breakout_level == 112.0  # the failure level (right shoulder), not the neckline


def test_mirror_inverse_head_shoulders():
    # Flip every price around 0 -- the same shape becomes an inverse (bullish)
    # head & shoulders, same mirroring convention as motif_touch_test.py's
    # double-bottom case and flag_pennant_test.py's bear-flag case.
    prices = [-p for p in (_HS + [80])]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_head_shoulders(bars, atr_arr, pivot_n=1)
    assert len(out) == 1
    hs = out[0]
    assert hs.is_inverse is True
    assert hs.direction == 1 and hs.expected_direction == 1
    assert hs.played_out is True
    assert hs.measured_move == 37.5  # abs(), unchanged by mirroring


def test_uneven_shoulders_no_instance():
    prices = [100, 110, 95, 130, 90, 150, 80]  # R=150 way past the 2.0xATR tolerance
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_head_shoulders(bars, atr_arr, pivot_n=1)
    assert out == []


def test_head_not_tall_enough_no_instance():
    prices = [100, 110, 95, 111, 90, 112, 80]  # H=111 barely above L/R -- fails the margin floor
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_head_shoulders(bars, atr_arr, pivot_n=1)
    assert out == []


def test_shallow_prominence_no_instance():
    prices = [100, 110, 109.5, 130, 109.6, 112, 80]  # troughs barely dip -- no genuine pullback
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_head_shoulders(bars, atr_arr, pivot_n=1)
    assert out == []


def test_confirm_idx_never_precedes_pivot_confirmability():
    # Regression guard for a REAL bug found and fixed 2026-08-13: R (like
    # every pivot from pivot_highs/pivot_lows) isn't KNOWABLE as a genuine
    # pivot until pivot_n bars have passed after it (centered window). This
    # scenario's idx11 (price=90) closes below the flat neckline (95) --
    # under the ORIGINAL unfixed code (confirm scan starting at R.idx+1)
    # that would have confirmed the pattern ONE BAR TOO EARLY, before R was
    # actually confirmable at pivot_n=2. The fix delays the scan to
    # R.idx+pivot_n=12, correctly resolving at idx12 (price=93, still below
    # the neckline) instead. Measured on real data: 92/225 GBPJPY instances
    # (40.9%) had a different confirm_idx/direction before this fix -- even
    # larger than motif_touch.py's 15.3%, since head&shoulders shares the
    # exact same "extremes from one global batch pivot call" construction
    # that bug came from (flag_pennant/triangle_channel re-slice a window
    # per candidate and get the lag for free; this detector's L/H/R do not).
    prices = [100, 105, 110, 105, 100, 95, 130, 95, 100, 105, 112, 90, 93, 80, 75]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_head_shoulders(bars, atr_arr, pivot_n=2, shoulder_tol_atr_mult=5.0,
                                shoulder_prominence_atr_mult=0.5, head_min_atr_mult=1.0)
    assert len(out) == 1
    hs = out[0]
    assert hs.right_idx == 10
    assert hs.confirm_idx == 12  # NOT 11 -- the premature-by-one-bar confirmation
    assert hs.confirm_idx - hs.right_idx >= 2  # >= pivot_n, the invariant itself


def test_causal_ordering_invariant():
    scenarios = [_HS + [80], _HS + [100, 120], [-p for p in (_HS + [80])]]
    for prices in scenarios:
        bars = _flat_bars(prices)
        atr_arr = np.full(len(bars), 1.0)
        out = detect_head_shoulders(bars, atr_arr, pivot_n=1)
        for hs in out:
            assert hs.left_idx < hs.head_idx < hs.right_idx < hs.confirm_idx


def test_real_data_smoke():
    try:
        from AnalogML.pattern_scan import load_bars
        from pylego.swing_structure import atr as atr_fn
    except Exception:
        print("  [skip] AnalogML data not available in this environment")
        return
    bars = load_bars("gbpjpy", "1h").iloc[-5000:].reset_index(drop=True)
    atr_arr = atr_fn(bars, period=14)
    instances = detect_head_shoulders(bars, atr_arr)
    for hs in instances:
        assert hs.left_idx < hs.head_idx < hs.right_idx < hs.confirm_idx
    n_played_out = sum(1 for hs in instances if hs.played_out)
    print(f"  [real-data smoke] gbpjpy 1h, last 5000 bars: {len(instances)} instances, "
          f"{n_played_out} played out as the textbook reversal "
          f"({n_played_out / len(instances):.1%})" if instances else
          "  [real-data smoke] gbpjpy 1h, last 5000 bars: 0 instances")


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
