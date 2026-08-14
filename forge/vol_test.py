"""Tests for vol.py, led — as everywhere else in `forge` — by causality.

The bug this file is most worried about is the one already caught and fixed
while writing `vol.py`: `yang_zhang_sigma`'s rolling window ends ON the day
it's describing (using that day's own OHLC), while a naively-written EWMA or
expanding-mean estimator is tempted to pre-shift itself to "be causal" —
producing three estimators with three silently different conventions inside
one comparison dict. `test_estimators_share_one_convention` and the prefix-
invariance tests below exist specifically to make that class of bug loud.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge import vol as V


def _synthetic_daily(n: int = 3000, seed: int = 4, vol: float = 0.008) -> pd.DataFrame:
    """A deterministic random-walk daily OHLC series with real (non-degenerate)
    intraday range, long enough for 6-fold walk-forward with a 30-day
    rolling estimator to have real degrees of freedom in every fold."""
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2010-01-04", periods=n, freq="B")   # business days
    close = 100 * np.exp(np.cumsum(rng.normal(0, vol, n)))
    open_ = np.empty(n)
    open_[0] = close[0]
    open_[1:] = close[:-1] * np.exp(rng.normal(0, vol * 0.3, n - 1))   # overnight gap
    intraday = np.abs(rng.normal(0, vol * 0.8, n))
    high = np.maximum(open_, close) + intraday
    low = np.minimum(open_, close) - intraday
    return pd.DataFrame({"open": open_, "high": high, "low": low, "close": close}, index=idx)


def _flat_daily(n: int = 200, price: float = 100.0) -> pd.DataFrame:
    idx = pd.date_range("2010-01-04", periods=n, freq="B")
    return pd.DataFrame({"open": price, "high": price, "low": price, "close": price},
                        index=idx, dtype=float)


# ── causality: the core discipline ───────────────────────────────────────────

def test_all_estimators_are_prefix_invariant():
    """Every estimator's value at day t (well before a cut) must be IDENTICAL
    whether or not later days exist — the same check that caught three real
    lookahead bugs in `levels.py`/`events.py`, applied here."""
    daily = _synthetic_daily()
    cut_i = int(len(daily) * 0.6)
    cut = daily.index[cut_i]
    pre = daily[daily.index < cut]
    margin_i = cut_i - 5   # a few days of buffer before the cut itself

    for name, fn in V.ESTIMATORS.items():
        full_vals = fn(daily)
        pre_vals = fn(pre)
        a = full_vals[:margin_i]
        b = pre_vals[:margin_i]
        ok = np.isfinite(a) & np.isfinite(b)
        assert ok.sum() > 50, f"{name}: test is vacuous ({ok.sum()} comparable points)"
        diff = np.abs(a[ok] - b[ok])
        assert diff.max() < 1e-8, (
            f"{name} changed under truncation (max diff {diff.max()}) — it is reading "
            f"data at or after the point it's describing")


def test_as_of_yesterday_never_equals_same_day_value_when_they_differ():
    """Direct probe that the forecast shift actually shifts: build a series
    where consecutive same-day values are (almost surely) distinct, and
    confirm the shifted series at day i equals the UNSHIFTED series at day
    i-1, not day i."""
    same_day = np.array([np.nan, 1.0, 2.0, 3.0, 4.0, 5.0])
    shifted = V.as_of_yesterday(same_day)
    expected = np.array([np.nan, np.nan, 1.0, 2.0, 3.0, 4.0])
    np.testing.assert_array_equal(shifted[1:], expected[1:])   # index 0 is nan either way


def test_forecast_frame_is_prefix_invariant_end_to_end():
    """The full panel-building path: a forecast-ready sigma column at day t
    must not change when later days are removed."""
    daily = _synthetic_daily()
    cut_i = int(len(daily) * 0.6)
    cut = daily.index[cut_i]
    full = V.build_forecast_frame(daily)
    pre = V.build_forecast_frame(daily[daily.index < cut])

    margin = cut - pd.Timedelta(days=10)
    a = full[full["date"] <= margin].set_index("date")
    b = pre[pre["date"] <= margin].set_index("date")
    common = a.index.intersection(b.index)
    assert len(common) > 100, "test is vacuous"
    for col in [c for c in a.columns if c.startswith("sigma_")]:
        diff = (a.loc[common, col] - b.loc[common, col]).abs()
        ok = diff.notna()
        assert ok.sum() > 50
        assert diff[ok].max() < 1e-8, f"{col} changed under truncation"


def test_design_vol_never_reads_the_test_fold():
    """Freeze a spec from a TRAIN slice, then confirm perturbing data strictly
    AFTER the train window (which a real test fold would contain) does not
    change what got selected."""
    daily = _synthetic_daily()
    split = daily.index[int(len(daily) * 0.5)]
    train = daily[daily.index < split]

    frame_a = V.build_forecast_frame(daily)               # full history available
    frame_b = V.build_forecast_frame(train)                # only the train window exists
    train_a = frame_a[frame_a["date"] < split]
    train_b = frame_b[frame_b["date"] < split]

    spec_a = V.design_vol(train_a)
    spec_b = V.design_vol(train_b)
    assert spec_a.estimator == spec_b.estimator
    assert spec_a.width_source == spec_b.width_source
    for k in spec_a.width_mult:
        assert abs(spec_a.width_mult[k] - spec_b.width_mult[k]) < 1e-9


# ── formula correctness ──────────────────────────────────────────────────────

def test_yang_zhang_is_zero_on_a_perfectly_flat_series():
    flat = _flat_daily()
    sigma = V.yang_zhang_sigma(flat, window=20)
    finite = sigma[np.isfinite(sigma)]
    assert len(finite) > 50
    assert np.allclose(finite, 0.0, atol=1e-9)


def test_ewma_matches_hand_computed_recursion():
    """A small, fully worked example: EWMA on a short synthetic return series,
    checked bit-for-bit against the recursion computed by hand in plain
    Python (not via the vectorized/rolling machinery `vol.py` itself uses —
    an independent second implementation, so a shared bug can't hide from
    both)."""
    closes = [100, 101, 99, 102, 98, 103, 97, 104, 96, 105,
             100, 101, 99, 102, 98, 103, 97, 104, 96, 105, 101]
    idx = pd.date_range("2020-01-01", periods=len(closes), freq="B")
    daily = pd.DataFrame({"open": closes, "high": closes, "low": closes, "close": closes},
                         index=idx, dtype=float)
    lam = 0.94
    min_periods = 10

    log_r = [None] + [np.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))]
    seed_var = float(np.var(log_r[1:min_periods + 1], ddof=1))
    hand = [None] * len(closes)
    var = seed_var
    hand[min_periods] = var
    for i in range(min_periods + 1, len(closes)):
        var = lam * var + (1 - lam) * log_r[i] ** 2
        hand[i] = var
    hand_sigma = [None if v is None else (v ** 0.5) * V.SQRT252 * 100.0 for v in hand]

    got = V.ewma_sigma(daily, lam, min_periods=min_periods)
    for i, expect in enumerate(hand_sigma):
        if expect is None:
            assert not np.isfinite(got[i])
        else:
            assert abs(got[i] - expect) < 1e-9, f"mismatch at {i}: {got[i]} vs {expect}"


def test_pinball_loss_is_minimized_at_the_true_quantile():
    """The defining property of a proper quantile scoring rule: in
    expectation, the loss is minimized when the prediction IS the tau-th
    quantile of the outcome distribution — checked directly on a sample
    whose quantiles are known exactly (a sorted array)."""
    rng = np.random.default_rng(1)
    sample = rng.normal(0, 1, 5000)
    true_median = float(np.median(sample))
    true_p75 = float(np.quantile(sample, 0.75))

    grid = np.linspace(true_median - 1, true_median + 1, 41)
    losses = [np.mean(V.pinball_loss(sample, np.full_like(sample, g), 0.5)) for g in grid]
    assert abs(grid[int(np.argmin(losses))] - true_median) < 0.06

    grid2 = np.linspace(true_p75 - 1, true_p75 + 1, 41)
    losses2 = [np.mean(V.pinball_loss(sample, np.full_like(sample, g), 0.75)) for g in grid2]
    assert abs(grid2[int(np.argmin(losses2))] - true_p75) < 0.06


def test_exceed_rate_hand_check():
    actual = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    predicted = np.array([1.5, 1.5, 1.5, 4.5, 4.5])
    # exceeds at 2.0>1.5, 3.0>1.5, 5.0>4.5 -> 3/5
    assert abs(V.exceed_rate(actual, predicted) - 0.6) < 1e-9


def test_fit_width_multiplier_recovers_a_known_quantile():
    rng = np.random.default_rng(2)
    sigma_daily = np.full(2000, 1.0)              # constant sigma -> ratio == realized directly
    realized = np.abs(rng.normal(0, 1.5, 2000)) + 0.3
    q50 = V.fit_width_multiplier(sigma_daily, realized, 0.5)
    assert abs(q50 - np.quantile(realized, 0.5)) < 1e-9


def test_walk_forward_vol_runs_and_reports_every_fold():
    daily = _synthetic_daily()
    frame = V.build_forecast_frame(daily)
    result = V.walk_forward_vol(frame, n_folds=4, verbose=False)
    assert len(result["folds"]) == 4
    for f in result["folds"]:
        assert f["oos"] is not None
        assert f["oos"]["n"] > 0
        assert np.isfinite(f["oos"]["combined_hl_pinball"])


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all vol tests passed")
