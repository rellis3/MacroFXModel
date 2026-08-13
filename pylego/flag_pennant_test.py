"""Synthetic, offline tests for flag_pennant -- no network, no files.

Run: python pylego/flag_pennant_test.py (from repo root -- flag_pennant
cross-imports pylego.swing_structure, same convention as motif_touch_test.py).

Every synthetic scenario below was hand-derived from the JS spec
(js/patternEngine.js's findPole/findConsolidation/findBreakout) AND
cross-checked against the already-tested pylego.swing_structure.pivot_highs/
pivot_lows bricks before being baked into an assertion (printed intermediate
pivot lists, confirmed by eye, then computed the resulting slopes/retrace/
breakout by hand) -- the same rigor motif_touch_test.py's hand-verified
double-top cases used.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.flag_pennant import detect_flags_pennants  # noqa: E402


def _flat_bars(prices):
    """Flat OHLC bars (open=high=low=close) -- deterministic pivot/breakout
    behaviour, easy to hand-verify (same helper as motif_touch_test.py)."""
    arr = np.asarray(prices, dtype=np.float64)
    return pd.DataFrame({"open": arr, "high": arr, "low": arr, "close": arr})


# Shared pole segment: 5 flat pad bars (idx0-4, all 100) then a dead-straight
# efficient impulse to 115 (idx5-9). findPole tries w in [4,5] from i=4 (the
# main loop's first candidate start is poleMinBars, not 0): w=4 -> net=12,
# w=5 -> net=15, both clear the 3xATR/0.55-efficiency thresholds (atr=1
# flat), and w=5 scores higher (15 > 12) so pole.end_idx=9 wins.
_POLE = [100, 100, 100, 100, 100, 103, 106, 109, 112, 115]

# Flag consolidation (idx10-15, parallel channel drifting against the pole):
# first window with >=2 pivot highs AND >=2 pivot lows (consol_pivot_n=1) is
# win_end=14 (h1=(11,113), h2=(13,111), l1=(10,110), l2=(12,108)) -- both
# lines slope exactly -1.0 (parallel, slope_diff=0), retrace=(115-106)/15=0.6.
_FLAG_CONSOL = [110, 113, 108, 111, 106, 109]

# Pennant consolidation (idx10-15, converging lines): first qualifying
# window is also win_end=14 (h1=(11,113), h2=(13,112) slope=-0.5;
# l1=(10,108), l2=(12,109) slope=+0.5) -- opposite-signed slopes, converging.
_PENNANT_CONSOL = [108, 113, 109, 112, 110, 111]

_DEFAULT_OPTS = dict(pole_min_bars=4, pole_max_bars=5, consol_min_bars=3,
                     consol_max_bars=20, consol_pivot_n=1, breakout_max_bars=10,
                     min_touches_total=4)


def test_bull_flag_detected_and_confirms_continuation():
    prices = _POLE + _FLAG_CONSOL + [118]  # idx16: big close above the upper line
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_flags_pennants(bars, atr_arr, **_DEFAULT_OPTS)
    assert len(out) == 1
    fp = out[0]
    assert fp.label == "bull_flag"
    assert fp.pole_start_idx == 4
    assert fp.pole_end_idx == 9
    assert fp.consol_end_idx == 14
    assert fp.confirm_idx == 16
    assert fp.direction == 1
    assert fp.expected_direction == 1
    assert fp.played_out is True
    assert fp.measured_move == 15.0
    assert fp.breakout_level == 108.0
    assert fp.upper_touches == 2 and fp.lower_touches == 2
    assert abs(fp.retrace - 0.6) < 1e-9


def test_bull_flag_flags_failure_when_breakout_goes_against_pole():
    prices = _POLE + _FLAG_CONSOL + [95]  # idx16: closes BELOW the lower line instead
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_flags_pennants(bars, atr_arr, **_DEFAULT_OPTS)
    assert len(out) == 1
    fp = out[0]
    assert fp.label == "bull_flag"  # identity fixed by the pole, not the outcome
    assert fp.confirm_idx == 16
    assert fp.direction == -1
    assert fp.expected_direction == 1
    assert fp.played_out is False


def test_pennant_when_lines_converge():
    prices = _POLE + _PENNANT_CONSOL + [118]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_flags_pennants(bars, atr_arr, **_DEFAULT_OPTS)
    assert len(out) == 1
    fp = out[0]
    assert fp.label == "bull_pennant"
    assert fp.consol_end_idx == 14
    assert fp.confirm_idx == 16
    assert fp.direction == 1 and fp.played_out is True
    assert fp.breakout_level == 110.5
    assert abs(fp.retrace - (7 / 15)) < 1e-9


def test_mirror_bear_flag():
    # Flip every price around 0 -- the SAME shape becomes a bear flag: the
    # original "highs" (upper line) become local minima (the mirrored lows),
    # and vice versa, same mirroring convention as motif_touch_test.py's
    # double-bottom case.
    prices = [-p for p in (_POLE + _FLAG_CONSOL + [118])]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_flags_pennants(bars, atr_arr, **_DEFAULT_OPTS)
    assert len(out) == 1
    fp = out[0]
    assert fp.label == "bear_flag"
    assert fp.pole_start_idx == 4 and fp.pole_end_idx == 9
    assert fp.direction == -1
    assert fp.expected_direction == -1
    assert fp.played_out is True
    assert fp.measured_move == 15.0  # abs(), unchanged by mirroring
    assert fp.breakout_level == -108.0


def test_no_consolidation_when_retrace_too_deep():
    # Same pole, then a sharp drop straight through the max-retrace floor --
    # every candidate consolidation window includes it, so find_consolidation
    # never returns (retrace = (115-40)/15 = 5.0, way past the 0.65 cap).
    prices = _POLE + [40, 40, 40, 40, 40, 40]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_flags_pennants(bars, atr_arr, pole_min_bars=4, pole_max_bars=5,
                                consol_min_bars=3, consol_max_bars=10, consol_pivot_n=1,
                                breakout_max_bars=10, min_touches_total=4)
    assert out == []


def test_no_pole_on_choppy_zero_efficiency_series():
    # Equal-sized up/down zigzag: any w>=4 gives efficiency <= 1/w <= 0.25,
    # always below the 0.55 floor, regardless of net move or ATR -- no pole
    # is ever found, so no instance can be built off of it.
    prices = [100, 105, 100, 105, 100, 105, 100, 105, 100, 105, 100, 105, 100]
    bars = _flat_bars(prices)
    atr_arr = np.full(len(bars), 1.0)
    out = detect_flags_pennants(bars, atr_arr)
    assert out == []


def test_causal_ordering_invariant_on_all_synthetic_scenarios():
    # Regression guard: every instance's confirm_idx must strictly follow its
    # own consol_end_idx, which must be >= its own pole_end_idx + consol_min_bars,
    # which must strictly follow pole_start_idx -- no component of an instance
    # is ever built from bars after its own confirm_idx (the lookahead-lag bug
    # class already found twice elsewhere in AnalogML: k-NN self-adjacency,
    # motif_touch's confirmability lag).
    scenarios = [
        _POLE + _FLAG_CONSOL + [118],
        _POLE + _FLAG_CONSOL + [95],
        _POLE + _PENNANT_CONSOL + [118],
        [-p for p in (_POLE + _FLAG_CONSOL + [118])],
    ]
    for prices in scenarios:
        bars = _flat_bars(prices)
        atr_arr = np.full(len(bars), 1.0)
        out = detect_flags_pennants(bars, atr_arr, **_DEFAULT_OPTS)
        for fp in out:
            assert fp.pole_start_idx < fp.pole_end_idx
            assert fp.pole_end_idx < fp.consol_end_idx
            assert fp.consol_end_idx < fp.confirm_idx


def test_real_data_smoke():
    # Not a correctness check -- confirms the detector runs end-to-end on
    # real bars without crashing and returns well-formed, causally sorted
    # instances (same convention as motif_touch_test.py's real-data smoke test).
    try:
        from AnalogML.pattern_scan import load_bars
        from pylego.swing_structure import atr as atr_fn
    except Exception:
        print("  [skip] AnalogML data not available in this environment")
        return
    bars = load_bars("gbpjpy", "1h").iloc[-5000:].reset_index(drop=True)
    atr_arr = atr_fn(bars, period=14)
    instances = detect_flags_pennants(bars, atr_arr)
    for fp in instances:
        assert fp.pole_start_idx < fp.pole_end_idx < fp.consol_end_idx < fp.confirm_idx
        assert fp.label in ("bull_flag", "bear_flag", "bull_pennant", "bear_pennant")
    n_played_out = sum(1 for fp in instances if fp.played_out)
    print(f"  [real-data smoke] gbpjpy 1h, last 5000 bars: {len(instances)} instances, "
          f"{n_played_out} played out as the textbook continuation "
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
