"""
GlobalLiquidity — backtest + walk-forward validation.

Two views:

  * run_backtest()  — full-sample equity curve and stats for the sized book.
                      Positions at week i are applied to returns at week i+1
                      (no lookahead). Costs are charged on turnover.

  * walk_forward()  — the honesty check. Rolls a train/test window across the
                      sample (defaults mirror the equity system: 156w train /
                      52w test / 26w step) and reports out-of-sample Sharpe plus
                      Walk-Forward Efficiency (OOS Sharpe / IS Sharpe). The
                      failure mode of every liquidity model is overfitting the
                      2009-2021 QE regime; WFE < 0.5 means it's curve-fit.

The pipeline is parameter-light by design (weights/thresholds in config), so
there is little to overfit — walk-forward here mainly tests regime stability,
not parameter selection.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np

from . import config, mathx
from .gli import compute_gli
from .regime import classify
from .ranker import build_book
from .sizer import size_book

COST_PER_UNIT_TURNOVER = 0.0002   # ~2bp round-trip per unit gross traded


@dataclass
class BacktestStats:
    weeks: int
    sharpe: float
    ann_return: float
    ann_vol: float
    max_drawdown: float
    hit_rate: float
    avg_gross: float
    avg_weekly_turnover: float
    est_trades_per_week: float
    total_cost_drag: float


def _pipeline(ds):
    gli = compute_gli(ds)
    reg = classify(ds, gli)
    book = build_book(gli, reg)
    sized = size_book(book, reg, ds.fx_returns)
    return gli, reg, book, sized


def _strategy_returns(sized, ds, charge_costs=True):
    pairs = sized.pairs
    n, m = len(sized.dates), len(pairs)
    R = np.zeros((n, m))
    for j, p in enumerate(pairs):
        r = ds.fx_returns.get(p)
        if r is not None:
            R[:, j] = np.nan_to_num(r[:n] if len(r) >= n else np.pad(r, (0, n - len(r))))

    gross_ret = np.zeros(n)
    cost = np.zeros(n)
    for i in range(1, n):
        gross_ret[i] = float(np.dot(sized.weights[i - 1], R[i]))
        if charge_costs:
            dw = np.abs(sized.weights[i] - sized.weights[i - 1]).sum()
            cost[i] = dw * COST_PER_UNIT_TURNOVER
    net = gross_ret - cost
    return net, gross_ret, cost


def _count_trades_per_week(book) -> float:
    """A 'trade' = a pair whose signed weight crosses a meaningful threshold.
    Count sign-state changes per week, averaged."""
    w = book.weights
    state = np.sign(np.where(np.abs(w) > 1e-6, w, 0.0))
    changes = (np.abs(np.diff(state, axis=0)) > 0).sum(axis=1)
    return float(changes.mean()) if len(changes) else 0.0


def run_backtest(ds) -> tuple[BacktestStats, dict]:
    gli, reg, book, sized = _pipeline(ds)
    net, gross_ret, cost = _strategy_returns(sized, ds)

    valid = net[52:]               # skip warm-up
    equity = np.cumprod(1 + net)
    sharpe = mathx.annualised_sharpe(valid)
    ann_return = float(valid.mean() * 52)
    ann_vol = float(valid.std(ddof=1) * np.sqrt(52)) if valid.size > 4 else 0.0
    hit = float((valid > 0).mean()) if valid.size else 0.0
    trades_pw = _count_trades_per_week(book)

    stats = BacktestStats(
        weeks=len(net),
        sharpe=round(sharpe, 3),
        ann_return=round(ann_return, 4),
        ann_vol=round(ann_vol, 4),
        max_drawdown=round(mathx.max_drawdown(equity), 4),
        hit_rate=round(hit, 3),
        avg_gross=round(float(sized.gross[52:].mean()), 3),
        avg_weekly_turnover=round(float(book.turnover[52:].mean()), 3),
        est_trades_per_week=round(trades_pw, 2),
        total_cost_drag=round(float(cost.sum()), 4),
    )
    detail = {
        "equity": equity,
        "net_returns": net,
        "regime_counts": _regime_counts(reg),
        "gate_weeks": int(reg.gate_tripped.sum()),
        "latest_gli": gli.latest(),
        "latest_regime": reg.latest(),
        "latest_book": book.latest_book(),
        "synthetic": ds.synthetic,
    }
    return stats, detail


def _regime_counts(reg) -> dict:
    out: dict[str, int] = {}
    for r in reg.regime:
        out[r] = out.get(r, 0) + 1
    return out


def walk_forward(ds, train=156, test=52, step=26) -> dict:
    """Rolling OOS evaluation. Returns IS/OOS Sharpe and WFE.

    Because the model is parameter-light, IS == OOS computation (no refit); the
    test measures whether edge persists out-of-sample across windows, which is
    the real concern for a regime model."""
    gli, reg, book, sized = _pipeline(ds)
    net, _, _ = _strategy_returns(sized, ds)
    n = len(net)

    windows = []
    start = 52  # after warm-up
    while start + train + test <= n:
        is_seg = net[start:start + train]
        oos_seg = net[start + train:start + train + test]
        windows.append({
            "is_sharpe": round(mathx.annualised_sharpe(is_seg), 3),
            "oos_sharpe": round(mathx.annualised_sharpe(oos_seg), 3),
        })
        start += step

    if not windows:
        return {"windows": 0, "note": "not enough data for walk-forward"}

    is_mean = float(np.mean([w["is_sharpe"] for w in windows]))
    oos_mean = float(np.mean([w["oos_sharpe"] for w in windows]))
    wfe = round(oos_mean / is_mean, 3) if abs(is_mean) > 1e-6 else 0.0
    return {
        "windows": len(windows),
        "is_sharpe_mean": round(is_mean, 3),
        "oos_sharpe_mean": round(oos_mean, 3),
        "wfe": wfe,
        "oos_positive_share": round(float(np.mean([w["oos_sharpe"] > 0 for w in windows])), 3),
        "detail": windows,
    }
