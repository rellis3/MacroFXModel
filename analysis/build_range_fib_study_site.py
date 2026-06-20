#!/usr/bin/env python3
"""
Builds a single compact JSON bundle of pre-aggregated breakdowns from the
{daily,monthly,monday}_touches.csv files produced by range_fib_reaction_study.py.

This is deliberately NOT raw touch-level data (that's hundreds of MB across ~500K+ rows) —
it's pre-aggregated by every dimension the standalone site lets you filter/group by, kept
small enough (a few thousand rows total) to ship as one JSON file and filter entirely in
the browser with no backend.

Run range_fib_reaction_study.py first. Then:
  python analysis/build_range_fib_study_site.py
Output: analysis/output/range_fib_reaction/site_data.json
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

OUT_DIR = Path(__file__).resolve().parent / "output" / "range_fib_reaction"

DOW_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
SESSION_HOURS = {h: ("Asia" if h <= 5 or h >= 22 else
                     "London" if h <= 12 else
                     "Overlap" if h <= 15 else
                     "NY") for h in range(24)}

DIMENSIONS = {
    "level":             ["level", "is_key"],
    "dow":               ["dow", "dow_n"],
    "month":             ["month", "month_n"],
    "year":              ["year"],
    "session":           ["session"],
    "vol_regime":        ["vol_regime"],
    "trend_regime":      ["trend_regime"],
    "confluence_bucket": ["confluence_bucket"],
    "direction":         ["direction"],
}


def load(timeframe: str) -> pd.DataFrame:
    path = OUT_DIR / f"{timeframe}_touches.csv"
    if not path.exists():
        return pd.DataFrame()
    df = pd.read_csv(path, parse_dates=["touch_time"])
    df["dow"] = df["touch_time"].dt.day_name()
    df["dow_n"] = df["touch_time"].dt.dayofweek
    df["month_n"] = df["touch_time"].dt.month
    df["month"] = df["month_n"].map(lambda m: MONTH_NAMES[m - 1])
    df["year"] = df["touch_time"].dt.year
    df["session"] = df["touch_time"].dt.hour.map(SESSION_HOURS)
    return df


def agg_rows(df: pd.DataFrame, dim_cols: list) -> pd.DataFrame:
    """
    Emits both the ready-to-display stats (pct_mr, avg_fade_pnl, p_value, significant) AND the
    raw building blocks (n, n_mr, sum_fade_pnl) needed to correctly RE-aggregate across a
    client-side year-range filter — you can't just average a column of percentages across years,
    you have to re-derive it from the underlying counts.
    """
    g = df.groupby(dim_cols, dropna=True)
    out = g.agg(
        n=("outcome", "count"),
        n_mr=("outcome", lambda s: int((s == "mean_reversion").sum())),
        sum_fade_pnl=("fade_pnl_pips", lambda s: round(s.sum(), 1)),
    ).reset_index()
    out["pct_mr"] = (out["n_mr"] / out["n"] * 100).round(2)
    out["avg_fade_pnl"] = (out["sum_fade_pnl"] / out["n"]).round(2)
    out["total_fade_pnl"] = out["sum_fade_pnl"]
    p_hat = out["pct_mr"] / 100
    z = (p_hat - 0.5) / np.sqrt(0.25 / out["n"])
    out["p_value"] = (2 * (1 - norm.cdf(z.abs()))).round(4)
    out["significant"] = out["p_value"] < 0.05
    return out


def build_pair_table(df: pd.DataFrame, timeframe: str) -> list:
    """Breakdown by real pair (across ALL its levels/days/etc combined) — for 'best pair' ranking.
    Includes 'year' so the frontend can re-aggregate this across a selected year range too."""
    rows = agg_rows(df.dropna(subset=["outcome"]), ["pair", "instrument_class", "year"])
    rows.insert(0, "timeframe", timeframe)
    return rows.to_dict("records")


def build_tables(df: pd.DataFrame, timeframe: str) -> dict:
    """Per-dimension breakdown rows across every pair scope: each real pair, ALL, ALL_FX, ALL_GOLD.
    Every row also carries 'year' (except the 'year' table itself, which IS the year breakdown) so
    the frontend can filter to a year range and correctly re-aggregate any other dimension on the fly."""
    scopes = {
        "ALL": df,
        "ALL_FX": df[df["instrument_class"] == "fx"],
        "ALL_GOLD": df[df["instrument_class"] == "gold"],
    }
    for pair in sorted(df["pair"].unique()):
        scopes[pair] = df[df["pair"] == pair]

    tables = {dim: [] for dim in DIMENSIONS}
    for pair_scope, sub in scopes.items():
        if sub.empty:
            continue
        for dim, cols in DIMENSIONS.items():
            if dim == "confluence_bucket" and "confluence_bucket" not in sub.columns:
                continue
            full_cols = cols if dim == "year" else cols + ["year"]
            usable = sub.dropna(subset=full_cols + ["outcome"])
            if usable.empty:
                continue
            rows = agg_rows(usable, full_cols)
            rows.insert(0, "pair", pair_scope)
            rows.insert(0, "timeframe", timeframe)
            tables[dim].extend(rows.to_dict("records"))
    return tables


def merge_tables(all_tables: list) -> dict:
    merged = {dim: [] for dim in DIMENSIONS}
    for t in all_tables:
        for dim, rows in t.items():
            merged[dim].extend(rows)
    return merged


def main():
    bundle_tables = []
    by_pair = []
    pairs_seen = set()
    years_seen = set()
    for tf in ("daily", "monthly", "monday"):
        df = load(tf)
        if df.empty:
            print(f"  {tf}: no data, skipping")
            continue
        print(f"  {tf}: {len(df):,} touches, {df['pair'].nunique()} pairs")
        pairs_seen |= set(df["pair"].unique())
        years_seen |= set(df["year"].unique().tolist())
        bundle_tables.append(build_tables(df, tf))
        by_pair.extend(build_pair_table(df, tf))

    tables = merge_tables(bundle_tables)
    for dim, rows in tables.items():
        print(f"  table '{dim}': {len(rows)} rows")
    print(f"  table 'by_pair': {len(by_pair)} rows")

    bundle = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "meta": {
            "pairs": sorted(pairs_seen),
            "years": sorted(int(y) for y in years_seen),
            "timeframes": ["daily", "monthly", "monday"],
            "dimensions": list(DIMENSIONS.keys()),
            "dow_order": DOW_ORDER,
            "month_order": MONTH_NAMES,
        },
        "tables": tables,
        "by_pair": by_pair,
    }

    out_path = OUT_DIR / "site_data.json"
    out_path.write_text(json.dumps(bundle, default=str), encoding="utf-8")
    print(f"\nWrote {out_path} ({out_path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
