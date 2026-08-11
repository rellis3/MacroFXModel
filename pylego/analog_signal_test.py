"""Synthetic, offline tests for analog_signal -- no network, no files.

Run:  python pylego/analog_signal_test.py   (from the repo root -- unlike the
leaf bricks' tests, analog_signal cross-imports pylego.barrier_race /
pylego.shape_match, so it needs the repo root on sys.path, same as
sizing_test.py / costs.py's other cross-importing siblings.)
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.analog_signal import neighbor_consensus  # noqa: E402


def _bars(opens, highs, lows, closes):
    return pd.DataFrame({'open': opens, 'high': highs, 'low': lows, 'close': closes})


def test_flat_when_no_candidate_shapes():
    bars = _bars([100] * 5, [100] * 5, [100] * 5, [100] * 5)
    res = neighbor_consensus(bars, np.empty(0, dtype=np.int64), np.empty((0, 3)),
                             query_shape=np.zeros(3), query_end=4, k=5, min_gap_bars=0,
                             sl_price=1.0, tp_r=1.0, cost_price=0.0,
                             max_bars_ahead=10, min_bars_ahead=1)
    assert res.direction == 0
    assert res.n_neighbours == 0
    assert res.avg_long_r is None


def test_excludes_future_candidates():
    bars = _bars([100] * 20, [100] * 20, [100] * 20, [100] * 20)
    end_idx = np.array([10], dtype=np.int64)
    shapes = np.zeros((1, 3))
    res = neighbor_consensus(bars, end_idx, shapes, np.zeros(3), query_end=5,
                             k=5, min_gap_bars=0, sl_price=1.0, tp_r=1.0, cost_price=0.0,
                             max_bars_ahead=5, min_bars_ahead=1)
    assert res.direction == 0
    assert res.n_neighbours == 0


def test_flat_when_too_few_neighbours():
    bars = _bars([100] * 10, [100] * 10, [100] * 10, [100] * 10)
    end_idx = np.array([1], dtype=np.int64)
    shapes = np.zeros((1, 3))
    res = neighbor_consensus(bars, end_idx, shapes, np.zeros(3), query_end=8,
                             k=5, min_gap_bars=0, sl_price=1.0, tp_r=1.0, cost_price=0.0,
                             max_bars_ahead=5, min_bars_ahead=1, min_neighbours=3)
    assert res.direction == 0
    assert res.n_neighbours == 1
    assert res.avg_long_r is None


def test_flat_when_both_sides_lose_to_cost():
    # dead-flat forward path forever -> every entry times out at 0 raw R,
    # then cost drags both directions slightly negative -> no edge to act on.
    n = 20
    bars = _bars([100.0] * n, [100.0] * n, [100.0] * n, [100.0] * n)
    end_idx = np.array([1, 3], dtype=np.int64)
    shapes = np.zeros((2, 3))
    res = neighbor_consensus(bars, end_idx, shapes, np.zeros(3), query_end=15,
                             k=5, min_gap_bars=0, sl_price=2.0, tp_r=1.0, cost_price=0.5,
                             max_bars_ahead=10, min_bars_ahead=1, min_neighbours=1)
    assert res.direction == 0
    assert res.avg_long_r is not None and res.avg_long_r <= 0
    assert res.avg_short_r is not None and res.avg_short_r <= 0
    assert res.margin == 0.0


def test_consensus_picks_long_when_analogs_ran_up():
    # Two candidate windows (ending idx=1, idx=3); price after EACH
    # candidate's entry (idx+1) rallies hard -> long should win the vote.
    n = 20
    opens = [100.0] * n
    highs = [100.0] * n
    lows = [100.0] * n
    closes = [100.0] * n
    for start in (2, 4):
        for i in range(start, start + 6):
            closes[i] = closes[i - 1] + 1.0
            highs[i] = closes[i] + 0.1
            lows[i] = closes[i] - 0.1
            opens[i] = closes[i - 1]
    bars = _bars(opens, highs, lows, closes)

    end_idx = np.array([1, 3], dtype=np.int64)
    shapes = np.zeros((2, 3))  # identical shapes -> both always qualify as neighbours

    res = neighbor_consensus(bars, end_idx, shapes, np.zeros(3), query_end=15,
                             k=5, min_gap_bars=0, sl_price=2.0, tp_r=1.0, cost_price=0.0,
                             max_bars_ahead=10, min_bars_ahead=1, min_neighbours=1)
    assert res.direction == 1
    assert res.n_neighbours == 2
    assert res.avg_long_r is not None and res.avg_long_r > 0
    assert res.avg_short_r is not None and res.avg_short_r < 0
    assert res.margin is not None and res.margin > 0


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
