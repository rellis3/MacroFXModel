"""
GlobalLiquidity — offline smoke tests.

Runs the full pipeline on seeded synthetic data and asserts structural sanity:
no lookahead leakage, shapes line up, the risk gate trips during the planted
stress episodes, and the backtest produces finite numbers. Not a test of edge —
a test that the machine is wired correctly.

    python -m GlobalLiquidity.test_smoke   (or: pytest GlobalLiquidity/test_smoke.py)
"""

from __future__ import annotations

import numpy as np

from . import data, mathx
from .gli import compute_gli
from .regime import classify
from .ranker import build_book
from .sizer import size_book
from . import backtest


def _build():
    ds = data.load_synthetic(n_weeks=500, seed=11)
    gli = compute_gli(ds)
    reg = classify(ds, gli)
    book = build_book(gli, reg)
    sized = size_book(book, reg, ds.fx_returns)
    return ds, gli, reg, book, sized


def test_shapes_align():
    ds, gli, reg, book, sized = _build()
    n = ds.n
    assert len(gli.gli_level) == n
    assert len(reg.regime) == n
    assert book.weights.shape == (n, len(book.pairs))
    assert sized.weights.shape == (n, len(book.pairs))


def test_no_lookahead_in_z():
    # rolling_z at i must equal recomputation on the prefix [:i+1].
    a = np.linspace(0, 10, 80) + np.sin(np.arange(80))
    z = mathx.rolling_z(a, 156, 26)
    i = 60
    z_prefix = mathx.rolling_z(a[:i + 1], 156, 26)
    assert np.isclose(z[i], z_prefix[i], equal_nan=True)


def test_gross_normalised_book():
    _, _, _, book, _ = _build()
    # Each active week's raw book is gross-normalised to ~1.
    g = np.abs(book.weights).sum(axis=1)
    active = g[g > 1e-6]
    assert np.allclose(active, 1.0, atol=1e-6)


def test_risk_gate_trips_on_stress():
    ds, gli, reg, _, _ = _build()
    # Planted stress episodes -> gate must trip at least some weeks.
    assert reg.gate_tripped.sum() > 0
    # When tripped, gross multiplier is the configured cut.
    from . import config
    tripped = reg.gross_mult[reg.gate_tripped]
    assert np.allclose(tripped, config.RISK_GATE["gross_cut"])


def test_backtest_finite_and_low_frequency():
    ds = data.load_synthetic(n_weeks=520, seed=3)
    stats, detail = backtest.run_backtest(ds)
    assert np.isfinite(stats.sharpe)
    assert np.isfinite(stats.max_drawdown)
    assert stats.ann_vol > 0
    # Designed to be low frequency: a handful of trades/week, not dozens.
    assert stats.est_trades_per_week < 10, stats.est_trades_per_week


def test_walk_forward_runs():
    ds = data.load_synthetic(n_weeks=600, seed=5)
    wf = backtest.walk_forward(ds)
    assert wf["windows"] >= 1
    assert "wfe" in wf


def _run_all():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for fn in fns:
        fn()
        print(f"  PASS {fn.__name__}")
        passed += 1
    print(f"\n{passed}/{len(fns)} smoke tests passed.")


if __name__ == "__main__":
    _run_all()
