"""Tests for drift.py — dominated by the bug this module was built on top of.

The drift effect that motivated this work (a 14.5pp swing in O-H exceedance across
drift terciles) turned out to be LOOKAHEAD. The measurement computed mu over a window
ending on the CURRENT day's close, and a day that closes up has mechanically already
printed a high above the O-H level. Removing the peek shrinks the effect to ~5pp and
reverses its sign.

So the tests that matter here are causality tests, not numerical ones.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge import drift as D
from forge import vol as V


def _synth(n: int = 600, seed: int = 3) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2019-01-01", periods=n, freq="B")
    close = 100 * np.exp(np.cumsum(rng.normal(0.0004, 0.01, n)))
    open_ = np.empty(n); open_[0] = close[0]
    open_[1:] = close[:-1] * np.exp(rng.normal(0, 0.003, n - 1))
    hi = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, 0.006, n)))
    lo = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, 0.006, n)))
    return pd.DataFrame({"open": open_, "high": hi, "low": lo, "close": close}, index=idx)


def test_drift_is_causal_row_by_row():
    """d on row t must not change when every bar from t onward is replaced.

    This is the exact property the original measurement violated. A prefix-invariance
    check is the only reliable way to catch it — the contaminated series looks
    perfectly ordinary, it just quietly knows today's close.
    """
    daily = _synth()
    frame = V.build_forecast_frame(daily)
    est = "yz_30"
    full = D.frame_drift(frame, daily, est)

    cut = len(daily) - 40
    truncated = daily.iloc[:cut]
    f2 = V.build_forecast_frame(truncated)
    part = D.frame_drift(f2, truncated, est)

    n = min(len(part), len(full))
    a, b = full[:n], part[:n]
    ok = np.isfinite(a) & np.isfinite(b)
    assert ok.sum() > 100, "not enough overlap to test"
    assert np.allclose(a[ok], b[ok], atol=1e-12), "drift on early rows changed when later bars were added"


def test_lookahead_variant_is_detectably_different():
    """Guard the guard: if the causal and peeking versions were identical, the test
    above would pass trivially and prove nothing."""
    daily = _synth()
    frame = V.build_forecast_frame(daily)
    est = "yz_30"
    causal = D.frame_drift(frame, daily, est)
    sig = frame[f"sigma_{est}"].to_numpy() / V.SQRT252 / 100.0
    peek = np.clip(D.mu_series(daily).reindex(pd.DatetimeIndex(frame["date"])).to_numpy() / sig, -2, 2)
    ok = np.isfinite(causal) & np.isfinite(peek)
    assert not np.allclose(causal[ok], peek[ok]), "causal and lookahead drift are indistinguishable"


def test_bm_quantile_matches_the_js_reference():
    """Ported from js/volForecast.js `_bmMaxQuantile`; values checked against it."""
    ref = {(-1.0, 0.5): 0.31104, (0.0, 0.5): 0.67449, (1.0, 0.5): 1.35603,
           (0.0, 0.75): 1.15035, (0.0, 0.9): 1.64485, (0.3, 0.9): 1.89123}
    for (d, p), want in ref.items():
        got = float(D.bm_max_quantile(d, p)[0])
        assert abs(got - want) < 1e-4, f"d={d} p={p}: {got} vs {want}"


def test_zero_drift_reduces_to_the_half_normal():
    """With d=0 the running max of a driftless BM is half-normal, so the quantiles
    must equal the standard ones the ladder's analytic fallback uses."""
    assert abs(float(D.bm_max_quantile(0.0, 0.50)[0]) - 0.6745) < 1e-3
    assert abs(float(D.bm_max_quantile(0.0, 0.75)[0]) - 1.1503) < 1e-3
    assert abs(float(D.bm_max_quantile(0.0, 0.90)[0]) - 1.6449) < 1e-3


def test_predict_none_ignores_drift():
    sig = np.array([0.01, 0.01]); d = np.array([-1.0, 1.0])
    out = D.predict({"form": "none", "m": 1.2}, sig, d, 0.5)
    assert out[0] == out[1]


def test_predict_linear_widens_with_positive_drift():
    sig = np.array([0.01, 0.01]); d = np.array([-1.0, 1.0])
    out = D.predict({"form": "linear", "m": 1.0, "beta": 0.3}, sig, d, 0.5)
    assert out[1] > out[0]


if __name__ == "__main__":
    import sys
    fns = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    ok = fail = 0
    for n, f in fns:
        try:
            f(); ok += 1; print(f"  ok   {n}")
        except Exception as e:                                  # noqa: BLE001
            fail += 1; print(f"  FAIL {n}: {e}")
    print(f"{ok} passed, {fail} failed")
    sys.exit(1 if fail else 0)
