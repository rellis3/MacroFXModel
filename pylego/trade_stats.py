"""trade_stats — the one place a pooled R-multiple series becomes a report
(Category-A math brick).

n / total R / win rate / profit factor / avg R is computed ad hoc in at least
six places already (RegimeV2/backtest_v3.py, VolRangeForecaster/vol_backtest.py,
portfolioBacktest/portfolio_backtest.py, ...) -- exactly the copy-paste drift
PYTHON_LEGO.md exists to stop. This brick doesn't retire those (each is its own
adoption PR, PYTHON_LEGO.md Section 5), but new Python work should call this
instead of adding copy #7/#8: both pattern_scan.py and ml_walkforward.py (the
shape-matching and walk-forward-ML studies this brick was built for) share it,
so their headline numbers are computed identically by construction.

Pure function of an R-multiple array -- no I/O, offline-testable
(trade_stats_test.py).
"""
from __future__ import annotations

import numpy as np


def summarize_r(r_values) -> dict:
    """r_values: iterable of realised R-multiples (one per closed trade, any
    sign). Returns {n, total_r, win_rate, profit_factor, avg_r} -- all full
    precision, rounding is a caller/display concern (same rule as
    barrier_race.BarrierResult). profit_factor is +inf when there are wins and
    no losses, and nan when there are no trades at all (nothing to divide)."""
    r = np.asarray(list(r_values), dtype=np.float64)
    n = len(r)
    if n == 0:
        return {"n": 0, "total_r": 0.0, "win_rate": float("nan"),
                "profit_factor": float("nan"), "avg_r": float("nan")}
    gross_win = float(r[r > 0].sum())
    gross_loss = float(-r[r < 0].sum())
    pf = (gross_win / gross_loss) if gross_loss > 0 else float("inf")
    return {
        "n": n,
        "total_r": float(r.sum()),
        "win_rate": float((r > 0).mean()),
        "profit_factor": pf,
        "avg_r": float(r.mean()),
    }
