#!/usr/bin/env python3
"""ml_walkforward.py — XGBoost / LightGBM / regression-stack walk-forward.

Trains gradient-boosted classifiers (XGBoost, LightGBM — same libraries and
hyperparameter style as bot/scripts/train_gold_model.py) and an sklearn
regression stack (Ridge + XGBRegressor + LGBMRegressor -> Ridge meta-learner)
to predict a triple-barrier LONG outcome, then walks it forward the way
CLAUDE.md rule 5 requires: real calendar folds, never trained on the quarter
it's scored on (pylego.walkforward — both EXPANDING, training on everything
before the test quarter, and ROLLING, training on only the preceding N
quarters, so a decayed-vs-still-working comparison is available for free).

Label = pylego.barrier_race's triple barrier (same "tp_hit" framing as
train_gold_model.py): did a LONG entry at bar i+1 touch TP before SL, at a
FIXED sl/tp_r cell. Every fold's classifier gets a probability threshold of
0.5 ("model says long is more likely to win than not") as its trade filter;
every fold's regressor takes the trade when its predicted R is positive.
Predictions and realised outcomes are pooled ACROSS all OOS folds (not
reported fold-by-fold) into one n / total R / win rate / profit factor / AUC
line per training scheme — the same shape as the walk-forward report quoted
in the brief this was built from.

Features are price/volatility-derived only (returns, realized vol, RSI, ATR,
distance from SMA, session/day-of-week) — genuinely macro features (yield
spreads, FRED surprises, COT positioning: RegimeV2/regime_score.py,
MacroEquityBot/fred_signal.py, bot/modules/cot_filter.py) need live API keys
this sandbox doesn't have. Merging their output in is a real next step, not
faked here — see the README.

Usage:
  python ml_walkforward.py --pair gbpjpy --timeframe 1h --sl-pips 20 --tp-r 1.5

Data: reads VolRangeForecaster/data/m1/<pair>_m1.parquet (must exist locally).
"""
from __future__ import annotations

import argparse
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.barrier_race import Entry, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402
from pylego.walkforward import Fold, expanding_folds, rolling_folds  # noqa: E402

M1_DIR = REPO_ROOT / "VolRangeForecaster" / "data" / "m1"

FEATURE_COLS = [
    "ret_1", "ret_4", "ret_24",
    "realized_vol_20", "rsi_14", "atr_14_pct",
    "dist_sma_50", "range_pct",
    "hour_of_day", "day_of_week",
]


def load_bars(pair: str, timeframe: str) -> pd.DataFrame:
    path = M1_DIR / f"{pair.lower()}_m1.parquet"
    if not path.exists():
        raise SystemExit(f"no local M1 data for {pair!r} at {path}")
    m1 = pd.read_parquet(path, columns=["open", "high", "low", "close"])
    bars = m1.resample(timeframe).agg(
        {"open": "first", "high": "max", "low": "min", "close": "last"}
    ).dropna()
    return bars


def _rsi(close: pd.Series, period: int) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    return 100 - (100 / (1 + rs))


def build_features(bars: pd.DataFrame) -> pd.DataFrame:
    """Causal-only rolling features: every value at row i uses data <= i, so
    there is no in-window lookahead (CLAUDE.md: "no lookahead ... data < i
    only"). One-off feature glue for this study, not a shared brick (nothing
    else in the repo consumes this exact feature set yet — PYTHON_LEGO.md's
    bar for extraction is >=2 real callers or a stable published contract)."""
    close, high, low = bars["close"], bars["high"], bars["low"]
    prev_close = close.shift(1)
    tr = pd.concat([
        (high - low),
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)

    feats = pd.DataFrame(index=bars.index)
    feats["ret_1"] = np.log(close / close.shift(1))
    feats["ret_4"] = np.log(close / close.shift(4))
    feats["ret_24"] = np.log(close / close.shift(24))
    feats["realized_vol_20"] = feats["ret_1"].rolling(20).std()
    feats["rsi_14"] = _rsi(close, 14)
    feats["atr_14_pct"] = (tr.rolling(14).mean() / close)
    feats["dist_sma_50"] = close / close.rolling(50).mean() - 1.0
    feats["range_pct"] = (high - low) / close
    feats["hour_of_day"] = bars.index.hour
    feats["day_of_week"] = bars.index.dayofweek
    return feats


def build_long_labels(bars: pd.DataFrame, sl_price: float, tp_r: float,
                      max_bars_ahead: int, min_bars_ahead: int, cost_price: float) -> dict[int, float]:
    """One LONG entry at every bar i+1. Returns {i: realised_R} for every bar
    with enough forward runway to resolve (race_trades silently drops the
    rest -- that's the SAME barrier walker every other SL/TP study here uses,
    not a second copy)."""
    entries = [Entry(idx=i + 1, direction=1) for i in range(len(bars) - 1)]
    trades = race_trades(bars, entries, sl=sl_price, tp_r=tp_r,
                         max_bars_ahead=max_bars_ahead, cost_price=cost_price,
                         min_bars_ahead=min_bars_ahead)
    return {t["idx"] - 1: t["r"] for t in trades}  # keyed by the FEATURE row i, not the entry bar i+1


def _pooled_classifier_report(name: str, y_true_all: list[int], y_prob_all: list[float],
                              r_all: list[float]) -> None:
    from sklearn.metrics import roc_auc_score
    took = [r for prob, r in zip(y_prob_all, r_all) if prob > 0.5]
    s = summarize_r(took)
    auc = roc_auc_score(y_true_all, y_prob_all) if len(set(y_true_all)) > 1 else float("nan")
    print(f"  {name:<10} n={s['n']:>6d}  total_R={s['total_r']:>9.2f}  "
          f"WR={s['win_rate']:>6.1%}  PF={s['profit_factor']:>6.2f}  AUC={auc:.3f}")


def _pooled_regressor_report(name: str, y_pred_all: list[float], r_all: list[float]) -> None:
    y_pred = np.asarray(y_pred_all)
    r = np.asarray(r_all)
    took = r[y_pred > 0]
    s = summarize_r(took)
    ic = float(np.corrcoef(y_pred, r)[0, 1]) if len(y_pred) > 1 and y_pred.std() > 0 else float("nan")
    dir_acc = float((np.sign(y_pred) == np.sign(r))[y_pred != 0].mean()) if (y_pred != 0).any() else float("nan")
    print(f"  {name:<10} n={s['n']:>6d}  total_R={s['total_r']:>9.2f}  "
          f"WR={s['win_rate']:>6.1%}  PF={s['profit_factor']:>6.2f}  IC={ic:.3f}  dir_acc={dir_acc:.1%}")


def run_scheme(scheme_name: str, folds: list[Fold], X: pd.DataFrame, y: pd.Series,
               r: pd.Series) -> None:
    import lightgbm as lgb
    import xgboost as xgb
    from sklearn.ensemble import StackingRegressor
    from sklearn.linear_model import Ridge

    print(f"\n== {scheme_name} — {len(folds)} OOS folds "
          f"({folds[0].label} .. {folds[-1].label}) ==" if folds else f"\n== {scheme_name} — 0 folds ==")
    if not folds:
        return

    xgb_true, xgb_prob, xgb_r = [], [], []
    lgb_true, lgb_prob, lgb_r = [], [], []
    stack_pred, stack_r = [], []

    for fold in folds:
        # X/y/r were already filtered to rows with a resolved label before the
        # folds were built from X.index, so train_idx/test_idx need no further
        # NaN filtering here -- they index straight into X/y/r by position.
        tr_idx, te_idx = fold.train_idx, fold.test_idx
        if len(tr_idx) < 50 or len(te_idx) == 0:
            continue
        X_tr, y_tr, r_tr = X.iloc[tr_idx], y.iloc[tr_idx], r.iloc[tr_idx]
        X_te, y_te, r_te = X.iloc[te_idx], y.iloc[te_idx], r.iloc[te_idx]
        if y_tr.nunique() < 2:
            continue

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")

            m_xgb = xgb.XGBClassifier(n_estimators=200, max_depth=4, learning_rate=0.05,
                                      subsample=0.8, colsample_bytree=0.8,
                                      eval_metric="logloss", random_state=42)
            m_xgb.fit(X_tr, y_tr)
            p = m_xgb.predict_proba(X_te)[:, 1]
            xgb_true.extend(y_te.tolist()); xgb_prob.extend(p.tolist()); xgb_r.extend(r_te.tolist())

            m_lgb = lgb.LGBMClassifier(n_estimators=200, max_depth=4, learning_rate=0.05,
                                       subsample=0.8, colsample_bytree=0.8,
                                       random_state=42, verbose=-1)
            m_lgb.fit(X_tr, y_tr)
            p2 = m_lgb.predict_proba(X_te)[:, 1]
            lgb_true.extend(y_te.tolist()); lgb_prob.extend(p2.tolist()); lgb_r.extend(r_te.tolist())

            stack = StackingRegressor(
                estimators=[
                    ("ridge", Ridge(alpha=1.0)),
                    ("xgb", xgb.XGBRegressor(n_estimators=150, max_depth=3, learning_rate=0.05,
                                             subsample=0.8, colsample_bytree=0.8, random_state=42)),
                    ("lgb", lgb.LGBMRegressor(n_estimators=150, max_depth=3, learning_rate=0.05,
                                              subsample=0.8, colsample_bytree=0.8,
                                              random_state=42, verbose=-1)),
                ],
                final_estimator=Ridge(alpha=1.0),
            )
            stack.fit(X_tr, r_tr)
            sp = stack.predict(X_te)
            stack_pred.extend(sp.tolist()); stack_r.extend(r_te.tolist())

    _pooled_classifier_report("xgboost", xgb_true, xgb_prob, xgb_r)
    _pooled_classifier_report("lightgbm", lgb_true, lgb_prob, lgb_r)
    _pooled_regressor_report("stack", stack_pred, stack_r)


def run(args: argparse.Namespace) -> None:
    bars = load_bars(args.pair, args.timeframe)
    print(f"[data] {args.pair} {args.timeframe}: {len(bars)} bars, {bars.index[0]} -> {bars.index[-1]}")

    features = build_features(bars)
    pip = pip_size(args.pair)
    sl_price = args.sl_pips * pip
    cost_price = default_spread(args.pair) if args.cost else 0.0
    label_map = build_long_labels(bars, sl_price, args.tp_r, args.max_bars_ahead,
                                  args.min_bars_ahead, cost_price)
    print(f"[labels] {len(label_map)} bars have a resolved long tp_hit outcome "
          f"(sl={args.sl_pips}p, tp_r={args.tp_r}, cost={'on' if args.cost else 'off'})")

    r_series = pd.Series(index=features.index, dtype=float)
    for i, r in label_map.items():
        if 0 <= i < len(r_series):
            r_series.iloc[i] = r
    y_series = (r_series > 0).astype(float)
    y_series[r_series.isna()] = np.nan

    valid = features[FEATURE_COLS].notna().all(axis=1) & r_series.notna()
    X = features.loc[valid, FEATURE_COLS]
    y = y_series.loc[valid]
    r = r_series.loc[valid]
    print(f"[features] {len(X)} usable rows, {len(FEATURE_COLS)} features, "
          f"tp_hit rate={y.mean():.1%}")

    exp_folds = expanding_folds(X.index, freq=args.fold_freq, min_train_periods=args.min_train_periods)
    roll_folds = rolling_folds(X.index, freq=args.fold_freq, train_periods=args.train_periods)

    run_scheme(f"EXPANDING (min {args.min_train_periods} {args.fold_freq} periods train)",
              exp_folds, X, y, r)
    run_scheme(f"ROLLING ({args.train_periods} {args.fold_freq} periods train)",
              roll_folds, X, y, r)

    print("\n[caveat] price-derived features only, one instrument, one sl/tp_r cell, "
          "unoptimised hyperparameters -- a first honest OOS read, not a validated edge "
          "(CLAUDE.md: built != works != has edge). Macro features (yield spreads, FRED "
          "surprises, COT) are a real next step, not included here (see README).")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pair", required=True)
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--sl-pips", type=float, default=20.0)
    p.add_argument("--tp-r", type=float, default=1.5)
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--fold-freq", default="Q", help="pandas period alias: Q, M, Y")
    p.add_argument("--min-train-periods", type=int, default=4, help="expanding scheme warm-up")
    p.add_argument("--train-periods", type=int, default=4, help="rolling scheme window size")
    p.add_argument("--cost", action="store_true", default=True)
    p.add_argument("--no-cost", dest="cost", action="store_false")
    args = p.parse_args()
    run(args)


if __name__ == "__main__":
    main()
