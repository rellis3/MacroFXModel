"""Walk-forward, no-lookahead test of whether a macro composite tracks NAS100
ahead of price. Same statistical discipline as analysis/yield_asset_coupling.py
(rank-IC, circular-shift null, split-half stability), adapted to:

  * H4 bars instead of daily
  * an explicit walk-forward fit/predict loop (train on window N, predict
    ONLY window N+1, refit and roll forward) instead of one full-sample
    regression — so the "predicted line" plotted on the chart is built
    exclusively from coefficients that never saw the bars they're
    predicting. That's the difference between this and the curve-fit
    illusion the whole exercise started from.

Nothing here is a trading signal — see README.md.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# ── feature construction ────────────────────────────────────────────────────

# USD basket sign convention: USD is the QUOTE currency in usdjpy/usdcad/usdchf
# (basket rises with those) and the BASE currency in the rest (basket rises
# when those FALL).
_USD_BASE_LEGS  = ("eurusd", "gbpusd", "audusd", "nzdusd")
_USD_QUOTE_LEGS = ("usdjpy", "usdcad", "usdchf")


def _log_ret(close: pd.Series) -> pd.Series:
    return np.log(close).diff()


def build_fast_features(bars: dict[str, pd.DataFrame]) -> pd.DataFrame | None:
    """Aligns every fetched OANDA series onto the target's (NAS100) H4 index
    and returns per-bar log-return features. Any leg missing from `bars`
    (a failed fetch) is silently dropped from the basket / left NaN."""
    if "target" not in bars:
        return None
    idx = bars["target"].index
    out = pd.DataFrame(index=idx)
    out["target_close"] = bars["target"]["close"]
    out["target_ret"] = _log_ret(out["target_close"])

    for name in ("bond10", "bond2", "gold"):
        if name in bars:
            out[f"{name}_ret"] = _log_ret(bars[name]["close"].reindex(idx).ffill(limit=2))

    basket_legs = []
    for leg in _USD_BASE_LEGS:
        if leg in bars:
            basket_legs.append(-_log_ret(bars[leg]["close"].reindex(idx).ffill(limit=2)))
    for leg in _USD_QUOTE_LEGS:
        if leg in bars:
            basket_legs.append(_log_ret(bars[leg]["close"].reindex(idx).ffill(limit=2)))
    if basket_legs:
        out["usd_basket_ret"] = pd.concat(basket_legs, axis=1).mean(axis=1)

    return out


def build_fred_features(target_index: pd.DatetimeIndex, fred: pd.DataFrame,
                        lookback_bars: int = 6) -> pd.DataFrame:
    """Forward-fills the daily FRED yield series onto H4 bars (so the value
    only changes once a day — no interpolation) and returns the change over
    `lookback_bars` H4 bars (default 6 ~= 1 trading day), mirroring the
    lookback=1 cell in analysis/yield_asset_coupling.py's study_main.csv."""
    y = fred.reindex(fred.index.union(target_index)).sort_index().ffill()
    y = y.reindex(target_index)
    out = pd.DataFrame(index=target_index)
    for col in fred.columns:
        out[f"{col}_chg"] = y[col].diff(lookback_bars)
    return out


def zscore(s: pd.Series, window: int) -> pd.Series:
    mu = s.rolling(window, min_periods=max(20, window // 4)).mean()
    sd = s.rolling(window, min_periods=max(20, window // 4)).std(ddof=0)
    return (s - mu) / sd.replace(0, np.nan)


# ── walk-forward OLS ────────────────────────────────────────────────────────

def _ols_fit(X: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Plain least squares with an intercept column prepended by the caller."""
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    return coef


def walk_forward(features: pd.DataFrame, feature_cols: list[str], target_ret: pd.Series,
                 train_bars: int = 500, test_bars: int = 100, step_bars: int = 100,
                 z_window: int = 250) -> pd.DataFrame:
    """Rolls train/test windows forward. In each window: z-score every
    feature using ONLY the trailing z_window of bars up to (not past) the
    current bar (so the scaling itself can't see the future), fit OLS on the
    train segment predicting NEXT-bar target_ret, predict the test segment
    with those frozen coefficients, then step forward. Returns one row per
    bar that fell in some window's TEST segment — i.e. the whole thing is
    out-of-sample by construction; there is no "in-sample" row in the output.
    """
    df = features.copy()
    for c in feature_cols:
        df[c + "_z"] = zscore(df[c], z_window)
    zcols = [c + "_z" for c in feature_cols]

    fwd = target_ret.shift(-1)   # what we're predicting: the NEXT bar's return
    df["_fwd"] = fwd

    n = len(df)
    rows = []
    start = 0
    while start + train_bars + test_bars <= n:
        train = df.iloc[start:start + train_bars]
        test = df.iloc[start + train_bars: start + train_bars + test_bars]

        tr = train.dropna(subset=zcols + ["_fwd"])
        if len(tr) < max(60, train_bars // 4):
            start += step_bars
            continue

        X = np.column_stack([np.ones(len(tr)), tr[zcols].to_numpy()])
        y = tr["_fwd"].to_numpy()
        coef = _ols_fit(X, y)

        te = test.dropna(subset=zcols)
        if len(te):
            Xte = np.column_stack([np.ones(len(te)), te[zcols].to_numpy()])
            pred = Xte @ coef
            rows.append(pd.DataFrame({
                "pred_ret": pred,
                "actual_next_ret": test["_fwd"].reindex(te.index).to_numpy(),
                "target_close": test["target_close"].reindex(te.index).to_numpy(),
                "window_start": train.index[0],
            }, index=te.index))

        start += step_bars

    if not rows:
        return pd.DataFrame(columns=["pred_ret", "actual_next_ret", "target_close", "window_start"])
    out = pd.concat(rows).sort_index()
    return out[~out.index.duplicated(keep="first")]


# ── stats (ported from analysis/yield_asset_coupling.py) ───────────────────

def _rank_z(a: np.ndarray) -> np.ndarray:
    r = pd.Series(a).rank().to_numpy()
    r = r - r.mean()
    sd = r.std()
    return r / sd if sd > 0 else r


def _null_p(xz: np.ndarray, yz: np.ndarray, ic: float, n_null: int, rng) -> float:
    n = len(xz)
    if n < 120:
        return float("nan")
    offs = rng.integers(30, n - 30, size=n_null)
    idx = (np.arange(n)[None, :] + offs[:, None]) % n
    null = (xz[idx] @ yz) / n
    return float((np.abs(null) >= abs(ic)).mean())


def oos_stats(oos: pd.DataFrame, n_null: int = 2000, seed: int = 7) -> dict:
    """Honest scorecard for a walk-forward OOS prediction stream: rank-IC,
    hit rate, a plain t-stat (h=1, non-overlapping -> no Newey-West needed),
    circular-shift null p-value, and split-half sign stability."""
    d = oos.dropna(subset=["pred_ret", "actual_next_ret"])
    n = len(d)
    if n < 60:
        return {"n": n, "ic": None, "hit": None, "t": None, "p_null": None, "stable": None}

    x = d["pred_ret"].to_numpy()
    y = d["actual_next_ret"].to_numpy()
    xz, yz = _rank_z(x), _rank_z(y)
    ic = float(xz @ yz / n)
    t = float(ic * np.sqrt(n - 2) / max(1e-9, np.sqrt(max(1e-9, 1 - ic ** 2))))
    hit = float(np.mean(np.sign(x) == np.sign(y)))

    half = n // 2
    ic1 = float(_rank_z(x[:half]) @ _rank_z(y[:half]) / half) if half > 30 else None
    ic2 = float(_rank_z(x[half:]) @ _rank_z(y[half:]) / (n - half)) if (n - half) > 30 else None
    stable = bool(ic1 is not None and ic2 is not None
                 and np.sign(ic1) == np.sign(ic2) and min(abs(ic1), abs(ic2)) > 0.02)

    rng = np.random.default_rng(seed)
    p_null = _null_p(xz, yz, ic, n_null, rng) if abs(ic) >= 0.02 else None

    return {
        "n": n, "ic": round(ic, 4), "t": round(t, 3),
        "hit": round(hit, 4),
        "p_null": (round(p_null, 4) if p_null is not None else None),
        "ic_h1": (round(ic1, 4) if ic1 is not None else None),
        "ic_h2": (round(ic2, 4) if ic2 is not None else None),
        "stable": stable,
    }


def anchored_window_path(oos: pd.DataFrame) -> pd.Series:
    """Re-anchors the cumulative predicted path to the ACTUAL close at the
    start of every walk-forward test window (rather than compounding one
    giant path from the first OOS bar), so a bad window can't visually drag
    every later window off the chart — this is the closer analogue to "the
    blue line" in a leading-indicator chart: a projected path re-drawn each
    time the model refits, never fit on the bars it's drawn over.

    The value plotted AT bar t_i is built only from predictions made at bars
    BEFORE t_i (pred_ret shifted by one before the cumsum) — i.e. it is what
    the model would have projected for t_i using nothing later than t_{i-1}.
    Without the shift, row i's own pred_ret (which targets t_{i+1}) would
    leak into the value plotted at t_i, silently making the line one bar
    better than it actually is."""
    if oos.empty:
        return pd.Series(dtype=float)
    out = pd.Series(index=oos.index, dtype=float)
    for _, grp in oos.groupby("window_start"):
        anchor = grp["target_close"].iloc[0]
        path = anchor * np.exp(grp["pred_ret"].shift(1).fillna(0.0).cumsum())
        out.loc[grp.index] = path
    return out


def next_bar_pred_price(oos: pd.DataFrame) -> pd.Series:
    """Per-bar 1-step-ahead forecast: price(t) * exp(pred_ret for t->t+1),
    i.e. "as of bar t, this is what the model expects bar t+1 to close at."
    Plotted against the REALIZED close one bar later, this is the direct
    test of "does the line move before the candle does" — bar by bar,
    entirely out-of-sample."""
    if oos.empty:
        return pd.Series(dtype=float)
    return oos["target_close"] * np.exp(oos["pred_ret"])
