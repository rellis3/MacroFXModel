"""Trade and equity metrics. Daily series include every session in the sample (zero on no-trade days)."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .stats import block_indices, summarize


def daily_series(trades: pd.DataFrame, all_days: np.ndarray, col: str = "usd") -> pd.Series:
    s = trades.groupby("day")[col].sum() if len(trades) else pd.Series(dtype=float)
    return s.reindex(all_days, fill_value=0.0)


def max_drawdown(x: np.ndarray) -> float:
    eq = np.cumsum(x)
    peak = np.maximum.accumulate(np.concatenate([[0.0], eq]))[1:]
    return float((eq - peak).min()) if len(eq) else 0.0


def summary(trades: pd.DataFrame, all_days: np.ndarray) -> dict:
    n = len(trades)
    if n == 0:
        return {"trades": 0, "days": int(len(all_days)), "trade_days": 0}
    R = trades["R"].values
    usd = trades["usd"].values
    win = usd > 0
    dly = daily_series(trades, all_days).values
    sd = dly.std(ddof=1)
    dd = math.sqrt(np.mean(np.minimum(dly, 0) ** 2))
    gp, gl = usd[win].sum(), -usd[~win].sum()
    return {
        "trades": int(n), "days": int(len(all_days)), "trade_days": int(trades["day"].nunique()),
        "win_rate": float(win.mean()), "profit_factor": float(gp / gl) if gl > 0 else float("inf"),
        "exp_R": float(R.mean()), "exp_usd": float(usd.mean()), "exp_pts": float(trades["pts"].mean()),
        "avg_win_usd": float(usd[win].mean()) if win.any() else 0.0,
        "avg_loss_usd": float(usd[~win].mean()) if (~win).any() else 0.0,
        "avg_win_R": float(R[win].mean()) if win.any() else 0.0,
        "avg_loss_R": float(R[~win].mean()) if (~win).any() else 0.0,
        "total_usd": float(usd.sum()), "total_R": float(R.sum()),
        "sharpe": float(dly.mean() / sd * math.sqrt(252)) if sd > 0 else 0.0,
        "sortino": float(dly.mean() / dd * math.sqrt(252)) if dd > 0 else 0.0,
        "max_dd_usd": max_drawdown(dly),
        "max_dd_R": max_drawdown(daily_series(trades, all_days, "R").values),
        "mae_R_median": float(trades["mae_R"].median()), "mfe_R_median": float(trades["mfe_R"].median()),
        "mae_R_mean": float(trades["mae_R"].mean()), "mfe_R_mean": float(trades["mfe_R"].mean()),
        "long_n": int((trades["dir"] > 0).sum()), "short_n": int((trades["dir"] < 0).sum()),
        "long_exp_R": float(trades.loc[trades["dir"] > 0, "R"].mean()) if (trades["dir"] > 0).any() else None,
        "short_exp_R": float(trades.loc[trades["dir"] < 0, "R"].mean()) if (trades["dir"] < 0).any() else None,
        "exits": trades["reason"].value_counts().to_dict(),
        "ambiguous": int(trades["ambiguous"].sum()),
        "avg_hold_min": float((trades["exit_m"] - trades["entry_m"] + 1).mean()),
    }


def boot_expectancy(trades: pd.DataFrame, all_days: np.ndarray, idx: np.ndarray, col: str = "R") -> dict:
    """Session-block bootstrap of mean per-trade `col` (ratio of resampled day sums to day counts)."""
    g = trades.groupby("day")[col].agg(["sum", "count"]).reindex(all_days, fill_value=0)
    s, c = g["sum"].values, g["count"].values
    est = s.sum() / max(c.sum(), 1)
    b = s[idx].sum(1) / np.maximum(c[idx].sum(1), 1)
    return summarize(est, b)


def boot_sharpe(trades: pd.DataFrame, all_days: np.ndarray, idx: np.ndarray) -> dict:
    dly = daily_series(trades, all_days).values
    def sh(x):
        sd = x.std(ddof=1)
        return x.mean() / sd * math.sqrt(252) if sd > 0 else 0.0
    est = sh(dly)
    b = np.array([sh(dly[i]) for i in idx])
    return summarize(est, b)
