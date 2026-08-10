"""Synthetic, offline tests for shape_match -- no network, no files."""
import numpy as np

from shape_match import find_analogs, normalize_window, rolling_shapes


def _ramp_pattern(base: float, drift: float, noise, vol_scale: float) -> np.ndarray:
    """A small hand-built 'shape': drift + noise, scaled to an arbitrary price
    level and vol so two instances only match if normalization actually works."""
    steps = drift + noise
    log_path = np.cumsum(steps) * vol_scale
    return base * np.exp(log_path)


def test_normalize_window_removes_level_and_scale():
    noise = np.array([0.001, -0.0005, 0.0008, -0.0003, 0.0012, -0.0009])
    drift = np.array([0.0005] * len(noise))
    a = _ramp_pattern(base=100.0, drift=drift, noise=noise, vol_scale=1.0)
    b = _ramp_pattern(base=4000.0, drift=drift, noise=noise, vol_scale=3.0)  # different level AND vol
    shape_a = normalize_window(a)
    shape_b = normalize_window(b)
    assert shape_a is not None and shape_b is not None
    assert np.allclose(shape_a, shape_b, atol=1e-8)


def test_normalize_window_flat_series_is_none():
    flat = np.full(10, 1.2345)
    assert normalize_window(flat) is None


def test_normalize_window_too_short_is_none():
    assert normalize_window(np.array([1.0, 1.001])) is None


def test_rolling_shapes_alignment():
    rng = np.random.default_rng(0)
    closes = 100 * np.exp(np.cumsum(rng.normal(0, 0.001, size=200)))
    window_len = 16
    end_idx, shapes = rolling_shapes(closes, window_len)
    assert len(end_idx) == len(shapes)
    assert shapes.shape[1] == window_len - 1
    # every end_idx must be a valid, in-range bar position
    assert end_idx.min() >= window_len - 1
    assert end_idx.max() == len(closes) - 1


def test_rolling_shapes_too_short_series():
    end_idx, shapes = rolling_shapes(np.array([1.0, 1.01, 1.02]), window_len=10)
    assert len(end_idx) == 0
    assert shapes.shape == (0, 9)


def test_find_analogs_recovers_planted_repeat():
    rng = np.random.default_rng(42)
    window_len = 12
    pattern_noise = rng.normal(0, 0.001, size=window_len)  # the len-1 diff is window_len-1 returns

    # Build a long random walk, then OVERWRITE two disjoint spots with the
    # SAME return pattern (different level/vol), one early (the "history"
    # match) and one late (the "query").
    n = 500
    base_returns = rng.normal(0, 0.0008, size=n)
    closes = np.empty(n)
    closes[0] = 100.0
    for i in range(1, n):
        closes[i] = closes[i - 1] * np.exp(base_returns[i - 1])

    plant_returns = np.linspace(-0.002, 0.0025, window_len - 1) + pattern_noise[:window_len - 1]

    def _stamp(start_close: float, vol_mult: float, at: int) -> float:
        c = start_close
        for r in plant_returns:
            c = c * np.exp(r * vol_mult)
            closes[at] = c
            at += 1
        return c

    history_start = 100
    query_start = 450
    closes[history_start] = 50.0
    _stamp(50.0, vol_mult=1.0, at=history_start + 1)
    closes[query_start] = 8000.0
    _stamp(8000.0, vol_mult=2.5, at=query_start + 1)

    end_idx, shapes = rolling_shapes(closes, window_len)
    query_shape = normalize_window(closes[query_start:query_start + window_len])
    assert query_shape is not None

    query_end = query_start + window_len - 1
    matches, dists = find_analogs(query_shape, end_idx, shapes, k=3,
                                  min_gap_bars=5, exclude_after=query_end)
    assert len(matches) > 0
    best_match_end = history_start + window_len - 1
    assert matches[0] == best_match_end
    assert dists[0] < 1e-6


def test_find_analogs_exclude_after_blocks_future():
    rng = np.random.default_rng(1)
    closes = 100 * np.exp(np.cumsum(rng.normal(0, 0.001, size=100)))
    window_len = 10
    end_idx, shapes = rolling_shapes(closes, window_len)
    query_shape = shapes[-1]
    cutoff = int(end_idx[len(end_idx) // 2])
    matches, _ = find_analogs(query_shape, end_idx, shapes, k=50, exclude_after=cutoff)
    assert all(m < cutoff for m in matches)


def test_find_analogs_min_gap_dedupes_neighbours():
    rng = np.random.default_rng(2)
    closes = 100 * np.exp(np.cumsum(rng.normal(0, 0.001, size=300)))
    window_len = 10
    end_idx, shapes = rolling_shapes(closes, window_len)
    query_shape = shapes[-1]
    matches, _ = find_analogs(query_shape, end_idx, shapes, k=10, min_gap_bars=20,
                              exclude_after=int(end_idx[-1]))
    for i in range(len(matches)):
        for j in range(i + 1, len(matches)):
            assert abs(int(matches[i]) - int(matches[j])) >= 20


def test_find_analogs_empty_inputs():
    matches, dists = find_analogs(np.zeros(5), np.empty(0, dtype=np.int64),
                                  np.empty((0, 5)), k=3)
    assert len(matches) == 0 and len(dists) == 0


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
