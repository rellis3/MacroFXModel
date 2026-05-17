#!/usr/bin/env python3
"""
train_gold_model.py — Train XGBoost/LightGBM on historical gold macro features.

Usage:
  python train_gold_model.py --csv path/to/gold_lab_export.csv
  python train_gold_model.py --csv data.csv --output bot/models/
  python train_gold_model.py --csv data.csv --horizon 5d --target tp_hit

Options:
  --csv       Path to gold-lab exported CSV (required)
  --output    Output directory for model files (default: ./models/)
  --horizon   Outcome horizon: 1d or 5d (default: 1d)
  --target    What to predict: direction (up/down) or tp_hit (default: tp_hit)
  --min-rows  Minimum rows required before training (default: 60)
"""

import sys
import argparse
import json
import os
from pathlib import Path
from io import StringIO

# ---------------------------------------------------------------------------
# Dependency checks — give clear, actionable error messages
# ---------------------------------------------------------------------------
try:
    import xgboost as xgb
except ImportError:
    print("ERROR: xgboost is not installed.")
    print("Fix: pip install xgboost lightgbm scikit-learn pandas numpy")
    sys.exit(1)

try:
    import lightgbm as lgb
except ImportError:
    print("ERROR: lightgbm is not installed.")
    print("Fix: pip install xgboost lightgbm scikit-learn pandas numpy")
    sys.exit(1)

try:
    import pandas as pd
    import numpy as np
    from sklearn.model_selection import TimeSeriesSplit, cross_val_score
    from sklearn.preprocessing import LabelEncoder
except ImportError as e:
    print(f"ERROR: Missing dependency — {e}")
    print("Fix: pip install xgboost lightgbm scikit-learn pandas numpy")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Column definitions
# ---------------------------------------------------------------------------
CATEGORICAL_COLS = [
    "signal", "strength", "regime", "confidence",
    "tips_inflection", "bei_inflection",
]

NUMERIC_FEATURE_COLS = [
    "gold_score",
    "tips", "tips_mom", "tips_accel", "tips_zscore",
    "bei", "bei_mom", "bei_accel", "bei_zscore",
    "dxy", "dxy_mom", "dxy_accel", "dxy_zscore",
    "vix", "vix_accel",
    "hy", "hy_change",
    "us2y_mom",
    "regime_confidence", "hurst_proxy", "size_mult", "is_transitioning",
]

OUTCOME_COLS = [
    "outcome_1d", "outcome_5d", "outcome_hit_tp",
    "outcome_hit_sl", "forward_return_1d", "forward_return_5d",
]


# ---------------------------------------------------------------------------
# Data loading + cleaning
# ---------------------------------------------------------------------------
def load_and_clean(csv_path: str, horizon: str, target: str, min_rows: int) -> pd.DataFrame:
    """Load the gold-lab CSV, clean it and return a ready-to-train DataFrame."""
    print(f"\n[Data] Loading CSV: {csv_path}")
    df = pd.read_csv(csv_path, parse_dates=["date"])

    print(f"[Data] Raw rows: {len(df)}")

    # Drop NEUTRAL signals — only care about directional calls
    before = len(df)
    df = df[df["signal"] != "NEUTRAL"].copy()
    print(f"[Data] Dropped {before - len(df)} NEUTRAL rows → {len(df)} remaining")

    # Drop rows where outcome_hit_tp == -1 (still open / unknown)
    if "outcome_hit_tp" in df.columns:
        before = len(df)
        df = df[df["outcome_hit_tp"] != -1].copy()
        print(f"[Data] Dropped {before - len(df)} open-trade rows → {len(df)} remaining")

    # For direction target, drop rows with NaN forward returns
    fwd_col = f"forward_return_{horizon}"
    if target == "direction" and fwd_col in df.columns:
        before = len(df)
        df = df[df[fwd_col].notna()].copy()
        print(f"[Data] Dropped {before - len(df)} rows with NaN {fwd_col} → {len(df)} remaining")

    if len(df) < min_rows:
        print(
            f"\nWARNING: Only {len(df)} usable rows found (minimum required: {min_rows}).\n"
            f"Collect more historical data before training. Exiting."
        )
        sys.exit(0)

    # Fill NaNs — numeric → 0, categorical → 'UNKNOWN'
    for col in df.columns:
        if col in CATEGORICAL_COLS:
            df[col] = df[col].fillna("UNKNOWN").astype(str)
        elif col not in (["date"] + OUTCOME_COLS):
            if df[col].dtype in [float, "float64", int, "int64"]:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # Sort chronologically — required for time-series CV
    df = df.sort_values("date").reset_index(drop=True)

    return df


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------
def build_feature_matrix(df: pd.DataFrame):
    """One-hot encode categoricals and return (X DataFrame, feature_names list)."""
    # One-hot encode categorical columns
    cat_dummies = pd.get_dummies(
        df[CATEGORICAL_COLS], prefix=CATEGORICAL_COLS, dummy_na=False
    )

    # Collect numeric features that actually exist in the dataframe
    available_numeric = [c for c in NUMERIC_FEATURE_COLS if c in df.columns]

    X = pd.concat([df[available_numeric], cat_dummies], axis=1)
    feature_names = list(X.columns)

    return X, feature_names


# ---------------------------------------------------------------------------
# Target variable construction
# ---------------------------------------------------------------------------
def build_target(df: pd.DataFrame, horizon: str, target: str) -> pd.Series:
    """Return binary target Series (0/1)."""
    if target == "tp_hit":
        y = (df["outcome_hit_tp"] == 1).astype(int)
        print(f"[Target] tp_hit  — positive rate: {y.mean():.1%}")
    else:  # direction
        fwd_col = f"forward_return_{horizon}"
        y = (df[fwd_col] > 0).astype(int)
        print(f"[Target] direction ({horizon})  — up rate: {y.mean():.1%}")
    return y


# ---------------------------------------------------------------------------
# Time-series cross-validation
# ---------------------------------------------------------------------------
def run_cv(model, X: np.ndarray, y: np.ndarray, n_splits: int = 5):
    """Run TimeSeriesSplit CV and return (mean_accuracy, std_accuracy)."""
    tscv = TimeSeriesSplit(n_splits=n_splits)
    scores = cross_val_score(model, X, y, cv=tscv, scoring="accuracy")
    return scores.mean(), scores.std()


# ---------------------------------------------------------------------------
# Feature importance table
# ---------------------------------------------------------------------------
def build_importance_table(
    feature_names: list,
    importances_xgb: np.ndarray,
    importances_lgb: np.ndarray,
) -> pd.DataFrame:
    """Return a DataFrame sorted by mean importance (XGB + LGB averaged)."""
    df_imp = pd.DataFrame(
        {
            "Feature": feature_names,
            "XGB_Importance": importances_xgb,
            "LGB_Importance": importances_lgb,
        }
    )
    df_imp["Mean_Importance"] = (df_imp["XGB_Importance"] + df_imp["LGB_Importance"]) / 2
    df_imp = df_imp.sort_values("Mean_Importance", ascending=False).reset_index(drop=True)
    return df_imp


# ---------------------------------------------------------------------------
# Win-rate lookup table
# ---------------------------------------------------------------------------
def build_win_rate_lookup(df: pd.DataFrame) -> dict:
    """
    Compute historical win rates grouped by (regime, signal, strength).
    Returns a dict serialisable to JSON.
    """
    if "outcome_hit_tp" not in df.columns:
        return {}

    lookup = (
        df.groupby(["regime", "signal", "strength"])["outcome_hit_tp"]
        .agg(win_rate="mean", count="count")
        .reset_index()
    )

    result = {}
    for _, row in lookup.iterrows():
        key = f"{row['regime']}|{row['signal']}|{row['strength']}"
        result[key] = {
            "win_rate": round(float(row["win_rate"]), 4),
            "count": int(row["count"]),
            "regime": row["regime"],
            "signal": row["signal"],
            "strength": row["strength"],
        }
    return result


# ---------------------------------------------------------------------------
# Report formatting helpers
# ---------------------------------------------------------------------------
def format_importance_table(df_imp: pd.DataFrame, top_n: int = 10) -> str:
    header = f"{'Feature':<40} {'XGB Importance':>16}   {'LGB Importance':>14}"
    sep = "-" * len(header)
    lines = [header, sep]
    for _, row in df_imp.head(top_n).iterrows():
        lines.append(
            f"{row['Feature']:<40} {row['XGB_Importance']:>16.3f}   {row['LGB_Importance']:>14.3f}"
        )
    return "\n".join(lines)


def format_win_rate_table(win_rates: dict, top_n: int = 15) -> str:
    if not win_rates:
        return "  (no outcome_hit_tp data)"
    rows = sorted(win_rates.values(), key=lambda x: -x["win_rate"])
    header = f"  {'Regime':<22} {'Signal':<10} {'Strength':<12} {'Win Rate':>9}  {'N':>5}"
    sep = "  " + "-" * (len(header) - 2)
    lines = [header, sep]
    for r in rows[:top_n]:
        lines.append(
            f"  {r['regime']:<22} {r['signal']:<10} {r['strength']:<12} "
            f"{r['win_rate']:>8.1%}  {r['count']:>5}"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Train XGBoost/LightGBM on gold macro model features.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--csv", required=True, help="Path to gold-lab exported CSV")
    parser.add_argument(
        "--output", default="./models/", help="Output directory for model files (default: ./models/)"
    )
    parser.add_argument(
        "--horizon",
        choices=["1d", "5d"],
        default="1d",
        help="Outcome horizon: 1d or 5d (default: 1d)",
    )
    parser.add_argument(
        "--target",
        choices=["tp_hit", "direction"],
        default="tp_hit",
        help="What to predict: tp_hit or direction (default: tp_hit)",
    )
    parser.add_argument(
        "--min-rows",
        type=int,
        default=60,
        dest="min_rows",
        help="Minimum rows required before training (default: 60)",
    )
    args = parser.parse_args()

    # Validate CSV path
    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"ERROR: CSV file not found: {csv_path}")
        sys.exit(1)

    # Prepare output directory
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # 1. Load + clean data
    # ------------------------------------------------------------------
    df = load_and_clean(
        csv_path=str(csv_path),
        horizon=args.horizon,
        target=args.target,
        min_rows=args.min_rows,
    )

    date_min = df["date"].min().strftime("%Y-%m-%d")
    date_max = df["date"].max().strftime("%Y-%m-%d")
    signal_dist = df["signal"].value_counts().to_dict()

    print(f"\n[Data] Date range : {date_min}  →  {date_max}")
    print(f"[Data] Usable rows: {len(df)}")
    print(f"[Data] Signal dist: {signal_dist}")

    # ------------------------------------------------------------------
    # 2. Build features and target
    # ------------------------------------------------------------------
    X_df, feature_names = build_feature_matrix(df)
    y = build_target(df, horizon=args.horizon, target=args.target)

    X = X_df.values.astype(np.float32)
    y_arr = y.values

    print(f"[Features] Matrix shape: {X.shape}  ({len(feature_names)} features)")

    # ------------------------------------------------------------------
    # 3. Define models
    # ------------------------------------------------------------------
    model_xgb = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="logloss",
        random_state=42,
    )

    model_lgb = lgb.LGBMClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        verbose=-1,
    )

    # ------------------------------------------------------------------
    # 4. Time-series cross-validation
    # ------------------------------------------------------------------
    print("\n[CV] Running TimeSeriesSplit(n_splits=5) cross-validation …")
    cv_mean_xgb, cv_std_xgb = run_cv(model_xgb, X, y_arr)
    # Pass the named DataFrame to LightGBM so feature names stay consistent
    # and sklearn does not emit feature-name mismatch warnings during CV.
    cv_mean_lgb, cv_std_lgb = run_cv(model_lgb, X_df, y_arr)

    print(f"[CV] XGBoost  accuracy: {cv_mean_xgb:.4f} ± {cv_std_xgb:.4f}")
    print(f"[CV] LightGBM accuracy: {cv_mean_lgb:.4f} ± {cv_std_lgb:.4f}")

    # ------------------------------------------------------------------
    # 5. Train final models on full dataset
    # ------------------------------------------------------------------
    print("\n[Train] Fitting XGBoost on full dataset …")
    model_xgb.fit(X, y_arr)

    print("[Train] Fitting LightGBM on full dataset …")
    model_lgb.fit(X, y_arr)

    # ------------------------------------------------------------------
    # 6. Feature importance
    # ------------------------------------------------------------------
    # XGBoost: feature_importances_ returns normalised gain by default
    importances_xgb = model_xgb.feature_importances_

    # LightGBM: request gain-based importances so both models are on the same
    # scale (normalised 0–1), rather than the default split-count integers.
    lgb_gain = model_lgb.booster_.feature_importance(importance_type="gain")
    lgb_gain_sum = lgb_gain.sum()
    importances_lgb = lgb_gain / lgb_gain_sum if lgb_gain_sum > 0 else lgb_gain

    df_importance = build_importance_table(feature_names, importances_xgb, importances_lgb)

    # ------------------------------------------------------------------
    # 7. Win-rate lookup table
    # ------------------------------------------------------------------
    win_rates = build_win_rate_lookup(df)

    # ------------------------------------------------------------------
    # 8. Save outputs
    # ------------------------------------------------------------------
    # XGBoost model (native JSON format)
    xgb_path = output_dir / "xgb_model.json"
    model_xgb.save_model(str(xgb_path))
    print(f"\n[Save] XGBoost model → {xgb_path}")

    # LightGBM model (text format)
    lgb_path = output_dir / "lgb_model.txt"
    model_lgb.booster_.save_model(str(lgb_path))
    print(f"[Save] LightGBM model → {lgb_path}")

    # Feature importance CSV
    imp_path = output_dir / "feature_importance.csv"
    df_importance.to_csv(imp_path, index=False)
    print(f"[Save] Feature importance → {imp_path}")

    # Win-rate lookup JSON
    win_rates_path = output_dir / "win_rates.json"
    with open(win_rates_path, "w") as f:
        json.dump(win_rates, f, indent=2)
    print(f"[Save] Win-rate lookup → {win_rates_path}")

    # Training report text
    report_lines = [
        "=" * 65,
        "  GOLD MACRO MODEL — TRAINING REPORT",
        "=" * 65,
        "",
        "DATASET",
        f"  CSV file    : {csv_path}",
        f"  Date range  : {date_min}  →  {date_max}",
        f"  Total rows  : {len(df)}",
        f"  Features    : {len(feature_names)}",
        f"  Horizon     : {args.horizon}",
        f"  Target      : {args.target}",
        f"  Signal dist : {signal_dist}",
        f"  Positive rate (target=1): {y_arr.mean():.1%}",
        "",
        "CROSS-VALIDATION  (TimeSeriesSplit, n_splits=5)",
        f"  XGBoost   accuracy: {cv_mean_xgb:.4f} ± {cv_std_xgb:.4f}",
        f"  LightGBM  accuracy: {cv_mean_lgb:.4f} ± {cv_std_lgb:.4f}",
        "",
        "TOP 10 FEATURES",
        format_importance_table(df_importance, top_n=10),
        "",
        "WIN RATE BY REGIME / SIGNAL / STRENGTH",
        format_win_rate_table(win_rates),
        "",
        "OUTPUT FILES",
        f"  {xgb_path}",
        f"  {lgb_path}",
        f"  {imp_path}",
        f"  {win_rates_path}",
        "",
        "=" * 65,
    ]
    report_text = "\n".join(report_lines)

    report_path = output_dir / "training_report.txt"
    with open(report_path, "w") as f:
        f.write(report_text)
    print(f"[Save] Training report → {report_path}")

    # ------------------------------------------------------------------
    # 9. Print report to stdout
    # ------------------------------------------------------------------
    print()
    print(report_text)


if __name__ == "__main__":
    main()
