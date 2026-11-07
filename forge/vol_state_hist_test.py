"""forge/vol_state_hist.py: every field for session i must be unchanged by anything at or after session i."""
from __future__ import annotations

import numpy as np

from forge import vol_state_hist as S


def _series(n=900, seed=11):
    rng = np.random.default_rng(seed)
    regime = np.cumsum(rng.random(n) < 0.01) % 2
    x = np.zeros(n)
    for t in range(1, n):
        x[t] = 0.9 * x[t - 1] + 0.6 * regime[t] * 0.1 + rng.normal(0, 0.3)
    return x


def test_har_is_prefix_invariant():
    x = _series()
    full = S.har_state(x)
    cut = 600
    part = S.har_state(x[:cut])
    for k in ("p1", "p5", "dsig", "sig_rel", "res"):
        assert np.array_equal(full[k][:cut], part[k], equal_nan=True), k


def test_changing_session_i_never_changes_the_value_stamped_i():
    x = _series()
    i = 700
    y = x.copy()
    y[i:] += 5.0
    a, b = S.har_state(x), S.har_state(y)
    for k in ("p1", "p5", "dsig", "sig_rel", "res"):
        assert np.array_equal(a[k][: i + 1], b[k][: i + 1], equal_nan=True), k
    assert np.array_equal(S.hmm_filtered(x)[: i + 1], S.hmm_filtered(y)[: i + 1], equal_nan=True)
    assert np.array_equal(S.ewma_before(x, 10)[: i + 1], S.ewma_before(y, 10)[: i + 1], equal_nan=True)


def test_no_refit_uses_an_incomplete_target():
    # At a refit date, sessions at or after it must not move that refit's 5-day fit.
    x = _series()
    i = 250 + 63 * 3
    a = S.har_state(x)
    z = x.copy()
    z[i:] = 99.0
    assert np.array_equal(a["p5"][: i + 1], S.har_state(z)["p5"][: i + 1], equal_nan=True)


def test_hmm_prefix_invariant_and_finds_high_state():
    rng = np.random.default_rng(3)
    x = np.r_[rng.normal(0, 0.2, 400), rng.normal(2, 0.2, 200), rng.normal(0, 0.2, 200), rng.normal(2, 0.2, 200)]
    p = S.hmm_filtered(x)
    cut = 900
    assert np.array_equal(p[:cut], S.hmm_filtered(x[:cut]), equal_nan=True)
    assert np.nanmean(p[850:]) > 0.9 and np.nanmean(p[700:790]) < 0.1


def test_hmm_by_variance_labels_the_noisy_state_high():
    rng = np.random.default_rng(4)
    x = np.r_[rng.normal(0, 0.2, 400), rng.normal(0, 1.5, 200), rng.normal(0, 0.2, 200)]
    p = S.hmm_filtered(x, by="var")
    assert np.nanmean(p[410:590] if np.isfinite(p[410:590]).any() else p[-5:]) > 0.7
    assert np.nanmean(p[-100:]) < 0.3


def test_ewma_before_is_stamped_forward():
    v = S.ewma_before([1.0, 2.0, np.nan, 4.0], 1.0)
    assert np.isnan(v[0]) and v[1] == 1.0 and np.isclose(v[2], 1.5) and np.isclose(v[3], 1.5)
