"""walkforward -- expanding/rolling walk-forward fold builder (Category-A
math brick).

CLAUDE.md rule 5 ("validate the same way every time... true in-sample /
out-of-sample split") and the honest-results section ("costs and a true OOS
split are non-negotiable") apply just as much to an ML model as to a rule-
based strategy. A single train/test split (or `sklearn.TimeSeriesSplit`'s
row-count-based folds, as used in bot/scripts/train_gold_model.py) doesn't
answer "would this have kept working, quarter after quarter, as it was
periodically retrained" -- that needs CALENDAR-aligned expanding or rolling
folds, each one an honest holdout the model never trained on. This brick is
the one place that fold-building logic lives, so a walk-forward report is
never hand-rolled per script (the exact copy-paste-drift failure mode
PYTHON_LEGO.md / barrier_race.py exist to prevent for the SL/TP walker).

expanding_folds: train = everything before the test period (grows every
fold). rolling_folds: train = the preceding N periods only (fixed-size
window that slides forward, discarding old history). Both take a plain
datetime index and a pandas offset-alias frequency ('Q' quarterly, 'M'
monthly, 'Y' yearly, ...) and return one Fold per test period, with the
period boundaries and integer row positions a caller can index into any
same-length feature/label array.

Pure function of `times` + params -- no I/O, no model, no data source
knowledge, offline-testable (walkforward_test.py). Does not itself guard
against a model/feature pipeline that leaks future information WITHIN a
training fold (e.g. a rolling z-score computed over the whole series before
splitting) -- that discipline belongs to the caller's feature-engineering
code, same as every other fold-based tool in this repo.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class Fold:
    """One walk-forward fold. train_idx/test_idx are integer positions into
    whatever same-length array the caller built `times` from -- index with
    them directly (`X.iloc[fold.train_idx]`), don't re-derive a date filter."""
    label: str
    train_start: pd.Timestamp
    train_end: pd.Timestamp
    test_start: pd.Timestamp
    test_end: pd.Timestamp
    train_idx: np.ndarray
    test_idx: np.ndarray


def _periods(times: pd.DatetimeIndex, freq: str) -> pd.PeriodIndex:
    times = pd.DatetimeIndex(times)
    if times.tz is not None:
        times = times.tz_convert("UTC").tz_localize(None)
    return times.to_period(freq)


def expanding_folds(times, freq: str = 'Q', min_train_periods: int = 4) -> list[Fold]:
    """One fold per calendar period from `min_train_periods` onward; each
    fold's training set is EVERY period strictly before the test period
    (grows every fold, never shrinks, never drops old data)."""
    times = pd.DatetimeIndex(times)
    periods = _periods(times, freq)
    uniq = periods.unique().sort_values()
    folds: list[Fold] = []
    for i in range(min_train_periods, len(uniq)):
        test_period = uniq[i]
        train_mask = periods < test_period
        test_mask = periods == test_period
        train_idx = np.flatnonzero(train_mask)
        test_idx = np.flatnonzero(test_mask)
        if len(train_idx) == 0 or len(test_idx) == 0:
            continue
        folds.append(Fold(
            label=str(test_period),
            train_start=times[train_idx[0]], train_end=times[train_idx[-1]],
            test_start=times[test_idx[0]], test_end=times[test_idx[-1]],
            train_idx=train_idx, test_idx=test_idx,
        ))
    return folds


def rolling_folds(times, freq: str = 'Q', train_periods: int = 4) -> list[Fold]:
    """One fold per calendar period from `train_periods` onward; each fold's
    training set is exactly the preceding `train_periods` calendar periods
    (a fixed-size window that SLIDES forward -- e.g. train_periods=4 with
    freq='Q' is a rolling 1-year window, discarding data older than a year
    before each test quarter)."""
    times = pd.DatetimeIndex(times)
    periods = _periods(times, freq)
    uniq = periods.unique().sort_values()
    folds: list[Fold] = []
    for i in range(train_periods, len(uniq)):
        test_period = uniq[i]
        window_periods = uniq[i - train_periods:i]
        train_mask = periods.isin(window_periods)
        test_mask = periods == test_period
        train_idx = np.flatnonzero(train_mask)
        test_idx = np.flatnonzero(test_mask)
        if len(train_idx) == 0 or len(test_idx) == 0:
            continue
        folds.append(Fold(
            label=str(test_period),
            train_start=times[train_idx[0]], train_end=times[train_idx[-1]],
            test_start=times[test_idx[0]], test_end=times[test_idx[-1]],
            train_idx=train_idx, test_idx=test_idx,
        ))
    return folds
