"""Synthetic, offline tests for walkforward -- no network, no files."""
import numpy as np
import pandas as pd

from walkforward import expanding_folds, rolling_folds


def _daily_index(start: str, end: str) -> pd.DatetimeIndex:
    return pd.date_range(start, end, freq='D')


def test_expanding_folds_grows_every_fold():
    times = _daily_index('2024-01-01', '2025-12-31')  # 8 quarters
    folds = expanding_folds(times, freq='Q', min_train_periods=4)
    assert len(folds) == 4  # 2024Q1..Q4 train, test on 2025Q1..Q4
    prev_train_n = 0
    for f in folds:
        assert len(f.train_idx) > prev_train_n
        prev_train_n = len(f.train_idx)
        assert f.train_end < f.test_start
        # train/test never overlap
        assert not set(f.train_idx.tolist()) & set(f.test_idx.tolist())


def test_expanding_folds_labels_and_bounds():
    times = _daily_index('2024-01-01', '2024-12-31')
    folds = expanding_folds(times, freq='Q', min_train_periods=1)
    labels = [f.label for f in folds]
    assert labels == ['2024Q2', '2024Q3', '2024Q4']
    q2 = folds[0]
    assert q2.test_start.month == 4 and q2.test_end.month == 6
    assert q2.train_start.month == 1 and q2.train_end.month == 3


def test_rolling_folds_fixed_window_size():
    times = _daily_index('2022-01-01', '2025-12-31')  # 16 quarters
    folds = rolling_folds(times, freq='Q', train_periods=4)
    assert len(folds) == 12
    sizes = set()
    for f in folds:
        # every fold's train window spans ~4 quarters of daily data --
        # count should be stable (+/- a day or two for quarter-length variance)
        sizes.add(round(len(f.train_idx), -1))
        assert not set(f.train_idx.tolist()) & set(f.test_idx.tolist())
    assert len(sizes) <= 3  # roughly constant window size across folds


def test_rolling_folds_window_slides_not_grows():
    times = _daily_index('2022-01-01', '2025-12-31')
    folds = rolling_folds(times, freq='Q', train_periods=4)
    n = [len(f.train_idx) for f in folds]
    # unlike expanding, this must NOT be monotonically increasing throughout
    assert not all(n[i] <= n[i + 1] for i in range(len(n) - 1)) or max(n) - min(n) < 5


def test_folds_empty_when_not_enough_history():
    times = _daily_index('2024-01-01', '2024-06-30')  # 2 quarters
    assert expanding_folds(times, freq='Q', min_train_periods=4) == []
    assert rolling_folds(times, freq='Q', train_periods=4) == []


def test_train_idx_indexes_correctly_into_source_array():
    times = _daily_index('2024-01-01', '2024-12-31')
    values = np.arange(len(times))
    folds = expanding_folds(times, freq='Q', min_train_periods=1)
    f = folds[0]  # test = 2024Q2, train = 2024Q1
    assert (values[f.train_idx] == f.train_idx).all()
    assert times[f.train_idx].max() < times[f.test_idx].min()


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
