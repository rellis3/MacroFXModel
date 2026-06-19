#!/usr/bin/env python3
"""
Cross-cutting breakdowns on top of range_fib_reaction_study.py's output: which pair, level,
day of week, session, and approach direction give the strongest/most reliable edge for fading
(mean-reverting against) a daily/monthly range Fib level.

Two-stage: first rank levels by statistical significance (binomial test vs 50%) on the full
touch set — that's what tells us which levels actually carry an edge. Then restrict the
pair/day/session/direction breakdowns to only those significant levels, so "best pair" etc.
isn't diluted by the ~50/50 noise at core (non-extension) levels.

Run range_fib_reaction_study.py first to produce {daily,monthly}_touches.csv.

Usage:
  python analysis/range_fib_reaction_breakdowns.py
  python analysis/range_fib_reaction_breakdowns.py --timeframe monthly --min-touches 30
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

OUT_DIR = Path(__file__).resolve().parent / "output" / "range_fib_reaction"

SESSION_HOURS = {h: ("Asia" if h <= 5 or h >= 22 else
                     "London" if h <= 12 else
                     "Overlap" if h <= 15 else
                     "NY") for h in range(24)}


def load(timeframe: str) -> pd.DataFrame:
    path = OUT_DIR / f"{timeframe}_touches.csv"
    if not path.exists():
        raise SystemExit(f"{path} not found — run range_fib_reaction_study.py first")
    df = pd.read_csv(path, parse_dates=["touch_time"])
    df["dow"]     = df["touch_time"].dt.day_name()
    df["session"] = df["touch_time"].dt.hour.map(SESSION_HOURS)
    df["year"]    = df["touch_time"].dt.year
    return df


def rank(df: pd.DataFrame, by, min_touches: int) -> pd.DataFrame:
    g = df.groupby(by)
    out = g.agg(
        n_touches=("outcome", "count"),
        pct_mean_reversion=("outcome", lambda s: (s == "mean_reversion").mean() * 100),
        avg_fade_pnl_pips=("fade_pnl_pips", "mean"),
        total_fade_pnl_pips=("fade_pnl_pips", "sum"),
    ).reset_index()
    p_hat = out["pct_mean_reversion"] / 100
    z = (p_hat - 0.5) / np.sqrt(0.25 / out["n_touches"])
    out["p_value"] = 2 * (1 - norm.cdf(z.abs()))
    out["significant"] = out["p_value"] < 0.05
    out = out[out["n_touches"] >= min_touches]
    return out.sort_values("avg_fade_pnl_pips", ascending=False).reset_index(drop=True)


def show(title: str, table: pd.DataFrame, n: int = 12):
    print(f"\n=== {title} ===")
    if table.empty:
        print("(no rows meet min-touches threshold)")
        return
    with pd.option_context("display.float_format", "{:.2f}".format, "display.width", 140):
        print(table.head(n).to_string(index=False))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--timeframe", choices=["daily", "monthly"], default="daily")
    ap.add_argument("--min-touches", type=int, default=100)
    args = ap.parse_args()

    df = load(args.timeframe)

    level_rank = rank(df, "level", args.min_touches)
    show("BEST LEVEL (all touches, ranked by avg fade pips/touch)", level_rank)

    sig_levels = set(level_rank.loc[level_rank["significant"], "level"])
    print(f"\n{len(sig_levels)} of {len(level_rank)} levels show a statistically significant "
          f"(p<0.05) bias: {sorted(sig_levels)}")

    edge = df[df["level"].isin(sig_levels)]
    if edge.empty:
        print("No significant levels found at this sample-size threshold — skipping drill-down.")
        return

    print(f"\n--- Drill-down restricted to the {len(sig_levels)} significant level(s) above "
          f"({len(edge):,} of {len(df):,} touches) ---")

    show("BEST PAIR", rank(edge, "pair", args.min_touches))
    show("BEST DAY OF WEEK (touch day)", rank(edge, "dow", max(args.min_touches, 50)))
    show("BEST SESSION (touch hour, UTC)", rank(edge, "session", max(args.min_touches, 50)))
    show("BEST DIRECTION (approach side)", rank(edge, "direction", max(args.min_touches, 50)))
    show("BEST PAIR x DIRECTION", rank(edge, ["pair", "direction"], max(args.min_touches // 2, 30)))
    show("BEST PAIR x SESSION", rank(edge, ["pair", "session"], max(args.min_touches // 2, 30)))
    show("STABILITY BY YEAR (is the edge persistent or decaying?)", rank(edge, "year", 20), n=20)

    combo = rank(edge, ["pair", "level"], max(args.min_touches // 5, 20))
    combo_path = OUT_DIR / f"{args.timeframe}_best_pair_level_combos.csv"
    combo.to_csv(combo_path, index=False)
    show("TOP PAIR x LEVEL combos", combo)
    print(f"\nFull pair x level combo table saved to {combo_path}")


if __name__ == "__main__":
    main()
