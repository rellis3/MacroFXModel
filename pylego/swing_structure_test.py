"""Synthetic, offline tests for swing_structure -- no network, no files."""
import numpy as np
import pandas as pd

from swing_structure import atr, classify_swing_structure, pivot_highs, pivot_lows, regime_at, regime_known_at


def _bars(highs, lows=None, closes=None, opens=None):
    highs = np.asarray(highs, dtype=np.float64)
    lows = np.asarray(lows, dtype=np.float64) if lows is not None else highs - 1.0
    closes = np.asarray(closes, dtype=np.float64) if closes is not None else (highs + lows) / 2
    opens = np.asarray(opens, dtype=np.float64) if opens is not None else closes
    return pd.DataFrame({"open": opens, "high": highs, "low": lows, "close": closes})


def test_pivot_highs_finds_planted_peak():
    highs = [1, 2, 3, 4, 10, 4, 3, 2, 1, 1, 1]
    bars = _bars(highs)
    pivots = pivot_highs(bars, n=3)
    assert len(pivots) == 1
    assert pivots[0].idx == 4
    assert pivots[0].price == 10


def test_pivot_lows_finds_planted_trough():
    lows = [10, 9, 8, 7, 1, 7, 8, 9, 10, 10, 10]
    highs = [v + 1 for v in lows]
    bars = _bars(highs, lows=lows)
    pivots = pivot_lows(bars, n=3)
    assert len(pivots) == 1
    assert pivots[0].idx == 4
    assert pivots[0].price == 1


def test_pivot_boundary_bars_never_flagged():
    # A monotonically decreasing high series -- bar 0 is the largest value in
    # the whole series but has no full window on its left, so it must never
    # be flagged (same convention as the JS original: only i in [n, len-n)
    # is even checked).
    highs = [100, 90, 80, 70, 60, 50, 40]
    bars = _bars(highs)
    pivots = pivot_highs(bars, n=2)
    assert all(p.idx not in (0, 1, len(highs) - 1, len(highs) - 2) for p in pivots)


def test_pivot_ties_all_count():
    # A flat-top plateau: bars 4 and 5 tie at the max -- tie-inclusive
    # semantics (only a STRICTLY greater neighbour disqualifies a bar).
    highs = [1, 2, 3, 4, 10, 10, 4, 3, 2, 1, 1]
    bars = _bars(highs)
    pivots = pivot_highs(bars, n=3)
    idxs = {p.idx for p in pivots}
    assert idxs == {4, 5}


def test_atr_converges_to_constant_true_range():
    # Every bar has the SAME true range (high-low=2, no gaps) -- ATR must
    # converge to exactly that value once past the seed period.
    n = 30
    highs = [101.0] * n
    lows = [99.0] * n
    closes = [100.0] * n
    bars = _bars(highs, lows=lows, closes=closes)
    a = atr(bars, period=14)
    assert abs(a[-1] - 2.0) < 1e-9
    assert a[0] == 2.0  # first bar: simple average of just itself


def test_classify_swing_structure_uptrend():
    # A clean staircase: each swing high AND low higher than the last ->
    # trend_up once two of each have been seen.
    highs = [1, 5, 3, 8, 6, 11, 9, 14]
    lows = [v - 2 for v in highs]
    bars = _bars(highs, lows=lows)
    series = classify_swing_structure(bars, pivot_n=1)
    regimes = {p.regime for p in series}
    assert "trend_up" in regimes


def test_classify_swing_structure_downtrend():
    highs = [14, 9, 11, 6, 8, 3, 5, 1]
    lows = [v - 2 for v in highs]
    bars = _bars(highs, lows=lows)
    series = classify_swing_structure(bars, pivot_n=1)
    regimes = {p.regime for p in series}
    assert "trend_down" in regimes


def test_regime_at_binary_search():
    highs = [1, 5, 3, 8, 6, 11, 9, 14]
    lows = [v - 2 for v in highs]
    bars = _bars(highs, lows=lows)
    series = classify_swing_structure(bars, pivot_n=1)
    # Every index must resolve to SOME change-point at or before it.
    for idx in range(len(bars)):
        r = regime_at(series, idx)
        assert r is not None and r.idx <= idx


def test_regime_at_empty_series():
    assert regime_at([], 5) is None


if __name__ == '__main__':
    import sys
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


# ── regime_known_at: the knowability property (2026-09-19) ──────────────────
# A pivot at bar i needs bars i-n..i+n, so a regime change it produces is not
# knowable until bar i+n closes. `regime_at` (by pivot bar) hands a caller at
# bar i changes it could not have seen -- 21% of the motif strategy's confirm
# bars relabelled between backtest (full history) and live (data ending at
# the bar). `regime_known_at` must make the two views agree.

def _zigzag(n_bars, period=6, amp=5.0, drift=0.0, flip_every=None):
    """A wave with drift; `flip_every` reverses the drift every that-many
    bars so the swing regime actually changes (HH+HL -> LH+LL -> ...)."""
    import math
    highs, level = [], 100.0
    for i in range(n_bars):
        d = drift if (flip_every is None or (i // flip_every) % 2 == 0) else -drift
        level += d
        highs.append(level + amp * math.sin(2 * math.pi * i / period))
    return _bars(highs, lows=[h - 2 for h in highs])


def test_known_idx_is_pivot_plus_pivot_n():
    bars = _zigzag(120, period=8, drift=0.4)
    for p in classify_swing_structure(bars, pivot_n=3)[1:]:
        assert p.known_idx == p.idx + 3


def test_regime_known_at_never_uses_an_unconfirmed_pivot():
    bars = _zigzag(120, period=8, drift=0.4)
    series = classify_swing_structure(bars, pivot_n=3)
    for i in range(len(bars)):
        r = regime_known_at(series, i)
        assert r is not None and r.known_idx <= i


def test_truncated_and_full_history_agree_at_the_same_bar():
    """The property that makes backtest == live: the regime knowable at bar i
    must be the same whether the series was built from data ending at i or
    from the whole history. regime_at (hindsight) fails this; regime_known_at
    must pass it on every bar."""
    full = _zigzag(240, period=9, drift=0.6, flip_every=45)
    series_full = classify_swing_structure(full, pivot_n=3)
    assert len(series_full) > 3, 'test data must actually change regime'
    mismatches_known = mismatches_hindsight = 0
    for i in range(40, len(full)):
        series_trunc = classify_swing_structure(full.iloc[: i + 1], pivot_n=3)
        a, b = regime_known_at(series_full, i), regime_known_at(series_trunc, i)
        if (a.regime, a.dir) != (b.regime, b.dir):
            mismatches_known += 1
        h1, h2 = regime_at(series_full, i), regime_at(series_trunc, i)
        if (h1.regime, h1.dir) != (h2.regime, h2.dir):
            mismatches_hindsight += 1
    assert mismatches_known == 0, f"regime_known_at disagreed on {mismatches_known} bars"
    # And the bug is real on this data: the hindsight lookup DOES disagree.
    assert mismatches_hindsight > 0


def test_regime_known_at_empty_series():
    assert regime_known_at([], 5) is None
