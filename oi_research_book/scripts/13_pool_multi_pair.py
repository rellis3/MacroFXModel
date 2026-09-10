#!/usr/bin/env python3
"""Roadmap item 3, the payoff of the multi-pair refactor in scripts 01/05/06:
pools wall-touch episodes ACROSS pairs and re-runs the exact same
episode-cluster bootstrap `06_intraday_cluster_significance.py` already
validated on EUR/USD alone -- so "does the wall-rejection effect replicate"
gets a real answer instead of a guess, and the break/reject classifier
(Part 15) gets more than 13-18 independent test episodes to validate on.

Runs against WHATEVER pairs already have `01_build_daily_dataset.py` ->
`05_intraday_validation.py` -> `06_intraday_cluster_significance.py`
completed for them -- skips any pair missing its files with a clear message
rather than failing outright, so this is safe to run as pairs get added one
at a time. Reports both the POOLED result (the real payoff: many more
independent episodes) and the PER-PAIR breakdown (does the effect actually
replicate in each pair, or does pooling hide a pair where it doesn't hold?
-- pooling without this check would repeat exactly the kind of
un-scrutinized aggregation this book has avoided everywhere else).

Usage: python3 13_pool_multi_pair.py [PAIR1] [PAIR2] ...
       (defaults to every pair in pair_config.PAIR_CONFIG)
"""
import sys
import numpy as np
import pandas as pd
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from pair_config import PAIR_CONFIG, suffix
import importlib.util
spec = importlib.util.spec_from_file_location("cs", str(Path(__file__).parent / "06_intraday_cluster_significance.py"))
cs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cs)

DATA = "oi_research_book/data"
RES = f"{DATA}/results"
HORIZONS = [15, 60, 240]


def load_pair_events(pair):
    """Returns (call_events, put_events) with episode_id assigned, or None
    if this pair hasn't been through 01->05 yet."""
    _suffix = suffix(pair)
    events_path = Path(f"{RES}/intraday_touch_events{_suffix}.csv")
    levels_path = Path(f"{DATA}/daily_master_all{_suffix}.parquet")
    if not events_path.exists() or not levels_path.exists():
        return None

    levels = cs.load_lagged_levels(pair)
    ep_call = cs.assign_episodes(levels, "call_wall_a")
    ep_put = cs.assign_episodes(levels, "put_wall_a")
    # episode ids are only unique WITHIN a pair's own wall-level series --
    # prefix by pair so pooling never accidentally merges two different
    # pairs' unrelated episodes into one cluster.
    ep_call["episode_id"] = pair + "_" + ep_call["episode_id"]
    ep_put["episode_id"] = pair + "_" + ep_put["episode_id"]

    events = pd.read_csv(events_path, parse_dates=["date"])
    events["date"] = events["date"].dt.tz_localize(None) if events["date"].dt.tz is not None else events["date"]
    call_ev = events[events.side == "call"].merge(ep_call, on="date", how="left")
    put_ev = events[events.side == "put"].merge(ep_put, on="date", how="left")
    call_ev["pair"] = pair
    put_ev["pair"] = pair
    return call_ev, put_ev


def main():
    pairs = sys.argv[1:] if len(sys.argv) > 1 else list(PAIR_CONFIG.keys())
    loaded = {}
    for p in pairs:
        r = load_pair_events(p)
        if r is None:
            print(f"  {p}: skipped -- no intraday_touch_events{suffix(p)}.csv / "
                  f"daily_master_all{suffix(p)}.parquet yet (run 01->05->06 for it first)")
            continue
        loaded[p] = r
        print(f"  {p}: {len(r[0])} call touches, {len(r[1])} put touches loaded")

    if not loaded:
        print("\nNo pairs available to pool. Run 01_build_daily_dataset.py -> "
              "05_intraday_validation.py -> 06_intraday_cluster_significance.py "
              "for at least one additional pair (needs R2 access), then re-run this.")
        return

    print(f"\n{len(loaded)} pair(s) loaded: {list(loaded.keys())}")

    per_pair_rows, pooled_rows = [], []
    for side in ["call", "put"]:
        idx = 0 if side == "call" else 1
        all_ev = pd.concat([loaded[p][idx] for p in loaded], ignore_index=True)
        for h in HORIZONS:
            oc = f"outcome_{h}m"

            # per-pair breakdown -- does it replicate everywhere, or just on average?
            for p in loaded:
                sub = loaded[p][idx]
                sub = sub[sub[oc].notna() & sub["episode_id"].notna()].copy()
                if len(sub) < 10:
                    continue
                sub["is_break"] = (sub[oc] == "break").astype(int)
                res = cs.cluster_bootstrap_break_rate(sub, sub["episode_id"])
                res.update({"pair": p, "side": side, "horizon_min": h})
                per_pair_rows.append(res)

            # pooled -- the actual payoff: many more independent episodes
            sub = all_ev[all_ev[oc].notna() & all_ev["episode_id"].notna()].copy()
            if len(sub) < 10:
                continue
            sub["is_break"] = (sub[oc] == "break").astype(int)
            res = cs.cluster_bootstrap_break_rate(sub, sub["episode_id"])
            res.update({"side": side, "horizon_min": h, "n_pairs": len(loaded)})
            pooled_rows.append(res)

    per_pair_df = pd.DataFrame(per_pair_rows)
    pooled_df = pd.DataFrame(pooled_rows)
    per_pair_df.to_csv(f"{RES}/pooled_per_pair_breakdown.csv", index=False)
    pooled_df.to_csv(f"{RES}/pooled_cluster_bootstrap.csv", index=False)

    print("\n=== Per-pair breakdown (does the effect replicate in EACH pair?) ===")
    cols = ["pair", "side", "horizon_min", "n_events", "n_episodes",
            "observed_break_rate_pct", "cluster_bootstrap_p_vs_50pct"]
    print(per_pair_df[cols].to_string(index=False) if len(per_pair_df) else "(none)")

    print("\n=== POOLED across all loaded pairs (the payoff: real episode count) ===")
    cols2 = ["side", "horizon_min", "n_pairs", "n_events", "n_episodes",
             "observed_break_rate_pct", "boot_ci_lo_pct", "boot_ci_hi_pct", "cluster_bootstrap_p_vs_50pct"]
    print(pooled_df[cols2].to_string(index=False) if len(pooled_df) else "(none)")


if __name__ == "__main__":
    main()
