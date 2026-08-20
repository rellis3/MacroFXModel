"""Synthetic, offline tests for motif_touch -- no network, no files.

Run: python pylego/motif_touch_test.py (from repo root -- motif_touch
cross-imports pylego.swing_structure, same convention as
analog_signal_test.py).
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.motif_touch import detect_touch_motifs  # noqa: E402


def _flat_bars(prices):
    """Flat OHLC bars (open=high=low=close) -- deterministic pivot/breakout
    behaviour, easy to hand-verify."""
    arr = np.asarray(prices, dtype=np.float64)
    return pd.DataFrame({"open": arr, "high": arr, "low": arr, "close": arr})


# Hand-verified double-top: touch1 at idx3 (130), a genuine retracement to 90
# at idx5, touch2 at idx7 (130, same level as touch1). idx8=110 (still inside
# the zone), idx9 is where the two test variants diverge.
_COMMON = [100, 100, 110, 130, 110, 90, 110, 130, 110]


def test_double_top_confirms_reversal_when_it_breaks_support():
    prices = _COMMON + [85, 80, 80]  # closes BELOW the 90 support at idx9
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 5.0)
    motifs = detect_touch_motifs(bars, atr_arr, pivot_n=1, tol_atr_mult=1.2,
                                 min_retrace_atr_mult=2.5, min_bars_between_touches=3,
                                 breakout_max_bars=40)
    tops = [m for m in motifs if m.is_top]
    assert len(tops) == 1
    m = tops[0]
    assert m.n_touches == 2
    assert m.touch_idxs == [3, 7]
    assert m.level == 90.0
    assert m.touch_level == 130.0
    assert m.confirm_idx == 9
    assert m.direction == -1
    assert m.played_out is True


def test_double_top_flags_failure_when_it_breaks_the_touch_level_instead():
    prices = _COMMON + [135, 140, 140]  # closes ABOVE the 130 touch level at idx9
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 5.0)
    motifs = detect_touch_motifs(bars, atr_arr, pivot_n=1, tol_atr_mult=1.2,
                                 min_retrace_atr_mult=2.5, min_bars_between_touches=3,
                                 breakout_max_bars=40)
    tops = [m for m in motifs if m.is_top]
    assert len(tops) == 1
    m = tops[0]
    assert m.confirm_idx == 9
    assert m.direction == 1
    assert m.played_out is False  # a top "failing" up is NOT the textbook reversal


def test_double_top_unconfirmed_within_horizon_still_returned():
    # Same setup, but the breakout horizon is too short to reach idx9 at all.
    prices = _COMMON + [85, 80, 80]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 5.0)
    motifs = detect_touch_motifs(bars, atr_arr, pivot_n=1, tol_atr_mult=1.2,
                                 min_retrace_atr_mult=2.5, min_bars_between_touches=3,
                                 breakout_max_bars=1)  # last touch idx7 + 1 = 8 only
    tops = [m for m in motifs if m.is_top]
    assert len(tops) == 1
    assert tops[0].confirm_idx is None
    assert tops[0].direction == 0
    assert tops[0].played_out is None


def test_shallow_retracement_does_not_count_as_a_valid_run():
    # Same two touches, but the dip between them is far too shallow to be a
    # genuine pullback (min_retrace_atr_mult set high) -- no motif at all.
    prices = _COMMON + [85, 80, 80]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 5.0)
    motifs = detect_touch_motifs(bars, atr_arr, pivot_n=1, tol_atr_mult=1.2,
                                 min_retrace_atr_mult=100.0,  # 40 < 100*5 -- fails
                                 min_bars_between_touches=3, breakout_max_bars=40)
    assert not any(m.is_top for m in motifs)


def test_mirror_double_bottom():
    # Flip every price around 0 so the SAME shape becomes a double bottom.
    prices = [-p for p in (_COMMON + [85, 80, 80])]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 5.0)
    motifs = detect_touch_motifs(bars, atr_arr, pivot_n=1, tol_atr_mult=1.2,
                                 min_retrace_atr_mult=2.5, min_bars_between_touches=3,
                                 breakout_max_bars=40)
    bottoms = [m for m in motifs if not m.is_top]
    assert len(bottoms) == 1
    m = bottoms[0]
    assert m.touch_idxs == [3, 7]
    assert m.level == -90.0
    assert m.confirm_idx == 9
    assert m.direction == 1  # mirrored: closing above the mirrored "support" is up
    assert m.played_out is True


def test_no_motifs_on_flat_noiseless_series():
    bars = _flat_bars([100.0] * 20)
    atr_arr = np.full(len(bars), 5.0)
    motifs = detect_touch_motifs(bars, atr_arr, pivot_n=2)
    assert motifs == []


def test_confirm_idx_never_precedes_pivot_confirmability():
    # Regression guard: pivot_highs/pivot_lows need pivot_n bars AFTER a bar
    # to confirm it's a genuine local extreme (centered window) -- the last
    # touch of a run isn't actually KNOWABLE as a real pivot until pivot_n
    # bars have passed. A breakout "confirmed" earlier than that credits a
    # signal no live system could have had yet. Found on real data (2026-08):
    # 15.3% of confirmed motifs were resolving before this lag had elapsed,
    # before detect_touch_motifs delayed the scan start to account for it.
    prices = _COMMON + [85, 80, 80, 80, 80, 80]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 5.0)
    for pivot_n in (1, 2, 3):
        motifs = detect_touch_motifs(bars, atr_arr, pivot_n=pivot_n, tol_atr_mult=1.2,
                                     min_retrace_atr_mult=2.5, min_bars_between_touches=3,
                                     breakout_max_bars=40)
        for m in motifs:
            if m.confirm_idx is not None:
                assert m.confirm_idx - m.touch_idxs[-1] >= pivot_n, (
                    f"pivot_n={pivot_n}: confirm_idx {m.confirm_idx} is only "
                    f"{m.confirm_idx - m.touch_idxs[-1]} bars after the last touch "
                    f"{m.touch_idxs[-1]} -- not yet confirmable as a real pivot"
                )


def test_real_data_smoke():
    # Not a correctness check -- just confirms the detector runs end-to-end
    # on real bars without crashing and returns well-formed, causally sorted
    # instances (each confirm_idx, if set, is after its own last touch).
    try:
        from AnalogML.pattern_scan import load_bars
        from pylego.swing_structure import atr as atr_fn
    except Exception:
        print("  [skip] AnalogML data not available in this environment")
        return
    bars = load_bars("gbpjpy", "1h").iloc[-3000:].reset_index(drop=True)
    atr_arr = atr_fn(bars, period=14)
    motifs = detect_touch_motifs(bars, atr_arr)
    for m in motifs:
        assert m.touch_idxs == sorted(m.touch_idxs)
        if m.confirm_idx is not None:
            assert m.confirm_idx > m.touch_idxs[-1]
    print(f"  [real-data smoke] gbpjpy 1h, last 3000 bars: {len(motifs)} motifs, "
          f"{sum(1 for m in motifs if m.confirm_idx is not None)} confirmed")


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
