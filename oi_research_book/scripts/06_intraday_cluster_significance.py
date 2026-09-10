#!/usr/bin/env python3
"""Roadmap item 0: re-test Part 9b's intraday wall-touch rejection effect
with a clustering correction, because touch events are NOT independent draws
-- a wall level persists 8-18 trading days on average (Part 4), so many
touches in that table are repeated visits to the SAME underlying level
across consecutive days, not unrelated experiments. The naive binomial
p-values in intraday_touch_summary.csv almost certainly overstate
significance.

Method: group events into "episodes" -- maximal runs of consecutive trading
days where the (T-1 lagged) wall level is unchanged -- then cluster-bootstrap
over EPISODES (not individual events): resample episodes with replacement,
pool every event belonging to the sampled episodes, recompute the break
rate. This treats "one wall level's whole life" as the unit of resampling,
which is the right level for events that share a level to not be treated as
independent.

Output: oi_research_book/data/results/intraday_cluster_bootstrap.csv
"""
import os
import sys
import numpy as np
import pandas as pd

# Self-register this file's own directory on sys.path before importing
# pair_config -- this module is loaded two different ways elsewhere in this
# book: `python 06_intraday_cluster_significance.py` (sys.path[0] is set
# automatically) AND `importlib.util.spec_from_file_location(...)` from
# 12_break_reject_classifier.py (which does NOT get that for free -- it only
# works today because that caller happens to sys.path.insert first; don't
# depend on every future importer remembering to do the same).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pair_config import suffix

DATA = "oi_research_book/data"
RES = f"{DATA}/results"
N_BOOT = 5000
RNG = np.random.default_rng(20260909)


def load_lagged_levels(pair="EUR_USD"):
    """pair is an explicit argument, not read from sys.argv here -- this
    function is imported directly by 11_feature_discovery.py and
    12_break_reject_classifier.py (via importlib), which must control which
    pair's levels they get regardless of their own CLI args, not inherit
    whatever happens to be in sys.argv at import time."""
    d = pd.read_parquet(f"{DATA}/daily_master_all{suffix(pair)}.parquet").sort_values("date").reset_index(drop=True)
    d["date"] = pd.to_datetime(d["date"]).dt.tz_localize(None)
    lagged = d[["date", "call_wall_a", "put_wall_a"]].copy()
    lagged["call_wall_a"] = lagged["call_wall_a"].shift(1)
    lagged["put_wall_a"] = lagged["put_wall_a"].shift(1)
    return lagged


def assign_episodes(levels, col):
    s = levels[["date", col]].dropna().sort_values("date").reset_index(drop=True)
    changed = (s[col] != s[col].shift(1)).cumsum()
    s["episode_id"] = f"{col}_" + changed.astype(str)
    return s[["date", "episode_id"]]


def cluster_bootstrap_break_rate(events_side, episode_ids, n_boot=N_BOOT):
    """events_side: df with columns episode_id, outcome (already dropna'd for this horizon).
    Returns observed break rate, bootstrap mean/CI, two-sided p-value vs 0.5,
    number of distinct episodes (the real effective sample size)."""
    by_ep = events_side.groupby("episode_id")
    ep_groups = {ep: g["is_break"].values for ep, g in by_ep}
    n_ep = len(ep_groups)
    ep_list = list(ep_groups.keys())

    observed_rate = events_side["is_break"].mean()

    boot_rates = np.empty(n_boot)
    for b in range(n_boot):
        sampled_eps = RNG.choice(ep_list, size=n_ep, replace=True)
        pooled = np.concatenate([ep_groups[e] for e in sampled_eps])
        boot_rates[b] = pooled.mean()

    lo, hi = np.percentile(boot_rates, [2.5, 97.5])
    # two-sided bootstrap p-value against H0: true rate = 0.5, via the
    # proportion of the bootstrap distribution on the other side of 0.5
    # from the observed estimate (standard percentile-based test)
    p_below = (boot_rates <= 0.5).mean()
    p_above = (boot_rates >= 0.5).mean()
    p_value = 2 * min(p_below, p_above)
    p_value = min(p_value, 1.0)

    return {
        "n_events": len(events_side), "n_episodes": n_ep,
        "observed_break_rate_pct": observed_rate * 100,
        "boot_mean_pct": boot_rates.mean() * 100,
        "boot_ci_lo_pct": lo * 100, "boot_ci_hi_pct": hi * 100,
        "cluster_bootstrap_p_vs_50pct": p_value,
    }


def main():
    pair = sys.argv[1] if len(sys.argv) > 1 else "EUR_USD"
    _suffix = suffix(pair)
    levels = load_lagged_levels(pair)
    ep_call = assign_episodes(levels, "call_wall_a")
    ep_put = assign_episodes(levels, "put_wall_a")

    events = pd.read_csv(f"{RES}/intraday_touch_events{_suffix}.csv", parse_dates=["date"])
    events["date"] = events["date"].dt.tz_localize(None) if events["date"].dt.tz is not None else events["date"]

    call_events = events[events.side == "call"].merge(ep_call, on="date", how="left")
    put_events = events[events.side == "put"].merge(ep_put, on="date", how="left")

    horizons = [15, 60, 240]
    rows = []
    naive = pd.read_csv(f"{RES}/intraday_touch_summary{_suffix}.csv")

    for side, ev in [("call", call_events), ("put", put_events)]:
        for h in horizons:
            col = f"outcome_{h}m"
            sub = ev[ev[col].notna() & ev["episode_id"].notna()].copy()
            sub["is_break"] = (sub[col] == "break").astype(int)
            res = cluster_bootstrap_break_rate(sub, sub["episode_id"])
            res["side"] = side
            res["horizon_min"] = h
            naive_row = naive[(naive.side == side) & (naive.horizon_min == h)]
            res["naive_binomial_p"] = naive_row["binom_p_vs_50pct"].values[0] if len(naive_row) else np.nan
            rows.append(res)

    out = pd.DataFrame(rows)[
        ["side", "horizon_min", "n_events", "n_episodes", "observed_break_rate_pct",
         "boot_mean_pct", "boot_ci_lo_pct", "boot_ci_hi_pct",
         "naive_binomial_p", "cluster_bootstrap_p_vs_50pct"]
    ]
    out.to_csv(f"{RES}/intraday_cluster_bootstrap{_suffix}.csv", index=False)
    print("\n=== Episode-clustered bootstrap test: does the wall-rejection effect survive treating "
          "correlated touches (same wall level, consecutive days) as ONE cluster, not N independent events? ===")
    print(out.to_string(index=False))


if __name__ == "__main__":
    main()
