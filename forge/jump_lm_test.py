"""forge/jump_lm.py: false-alarm rate on jump-free seasonal paths, planted bursts found, no forward bias."""
from __future__ import annotations

import numpy as np

from forge import jump_lm as J


def _paths(n=1500, seed=5, plant=None):
    rng = np.random.default_rng(seed)
    t = np.arange(J.N_SLOT)
    season = 1.0 + 1.5 * np.exp(-0.5 * ((t - 96) / 18) ** 2) + 2.0 * np.exp(-0.5 * ((t - 160) / 14) ** 2)
    season /= np.sqrt((season ** 2).mean())
    day = np.exp(np.cumsum(rng.normal(0, 0.05, n)))[:, None] / 1.5
    r = rng.normal(0, 3e-4, (n, J.N_SLOT)) * season * np.clip(day, 0.3, 3)
    if plant:
        for i, s, size in plant:
            r[i, s] += size
    C = 1.1 * np.exp(np.cumsum(r, axis=1))
    return C


def test_false_alarm_rate_is_near_the_design_on_seasonal_paths():
    d = J.detect(_paths())
    rate = d["flag"][400:].any(axis=1).mean()
    assert rate < 0.04, rate


def test_planted_burst_is_found_with_slot_and_sign():
    d = J.detect(_paths(plant=[(800, 120, 0.004), (900, 200, -0.004)]))
    assert d["flag"][800, 120] and d["L"][800, 120] > 0
    assert d["flag"][900, 200] and d["L"][900, 200] < 0


def test_a_hole_never_makes_a_zero_return():
    C = _paths(n=400)
    C[300, 50:53] = np.nan
    r = J.grid_returns(C)
    assert np.isnan(r[300, 50:54]).all()
    assert not (r[300, 40:49] == 0).any()


def test_prefix_invariance_no_forward_bias():
    C = _paths(n=700, plant=[(650, 100, 0.004)])
    full = J.detect(C)
    part = J.detect(C[:600])
    assert np.array_equal(full["L"][:600], part["L"], equal_nan=True)
    # changing a later bar of the SAME session leaves earlier slots alone
    D = C.copy()
    D[500, 200:] *= 1.05
    a, b = J.detect(C), J.detect(D)
    assert np.array_equal(a["L"][500, :200], b["L"][500, :200], equal_nan=True)


def test_first_flags():
    f = np.zeros((3, 5), bool)
    f[1, 2] = f[1, 4] = True
    assert list(J.first_flags(f)) == [-1, 2, -1]
