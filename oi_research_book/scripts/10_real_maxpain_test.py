#!/usr/bin/env python3
"""Audit finding (2026-09-10): Part 7's "pinning" test never actually tested
max pain -- it tested whether price gravitates toward the single strike with
the most OI (a "magnet"), which is a related but genuinely different
calculation from max pain (the strike where option sellers collectively lose
the LEAST, summing OI-weighted ITM payouts across every strike). This script
closes that gap: computes real max pain (formula cross-checked against the
actual production `oiCalcMaxPain` in js/oi.js on synthetic cases before
trusting it -- see the audit notes) and tests it the same way Part 9 tests
everything else: a real chronological IS/OOS split, Spearman rank-IC.

Honest limitation: max pain is a single-expiry concept, but this uses the
near-dated AGGREGATE surface (every expiry with DTE<=45 combined, same as
`surface_near.parquet` everywhere else in this book) as the input chain --
not a byte-true single-expiry max pain. A per-expiry version needs the raw
contract-level chain (gitignored, requires R2 access) as a follow-up.

Output: oi_research_book/data/results/maxpain_vs_magnet.csv and
maxpain_predictive_ic.csv.
"""
import numpy as np
import pandas as pd
from scipy import stats

DATA = "oi_research_book/data"
RES = f"{DATA}/results"


def max_pain(strikes, calls, puts):
    """Cross-checked against js/oi.js's real oiCalcMaxPain on 3 synthetic
    cases (identical strike picked every time) before use -- see audit."""
    strikes = np.asarray(strikes, dtype=float)
    calls = np.asarray(calls, dtype=float)
    puts = np.asarray(puts, dtype=float)
    best_pain, best_strike = np.inf, strikes[0]
    for si in strikes:
        below, above = strikes < si, strikes > si
        pain = (calls[below] * (si - strikes[below])).sum() + (puts[above] * (strikes[above] - si)).sum()
        if pain < best_pain:
            best_pain, best_strike = pain, si
    return best_strike


def main():
    surf = pd.read_parquet(f"{DATA}/surface_near.parquet")
    wall = pd.read_parquet(f"{DATA}/daily_master_near.parquet")[["date", "spot", "fwd_ret_1d"]].sort_values("date")

    rows = []
    for date, g in surf.groupby("date"):
        g = g[(g.call_oi > 0) | (g.put_oi > 0)].sort_values("strike")
        if len(g) < 3:
            continue
        mp = max_pain(g["strike"].values, g["call_oi"].values, g["put_oi"].values)
        magnet = g.loc[(g.call_oi + g.put_oi).idxmax(), "strike"]
        rows.append({"date": date, "max_pain": mp, "magnet_strike": magnet})
    mp_df = pd.DataFrame(rows).merge(wall, on="date", how="left").sort_values("date").reset_index(drop=True)

    mp_df["mp_eq_magnet"] = mp_df["max_pain"] == mp_df["magnet_strike"]
    mp_df["dist_when_diff_pct"] = np.where(
        mp_df["mp_eq_magnet"], np.nan,
        (mp_df["max_pain"] - mp_df["magnet_strike"]).abs() / mp_df["spot"] * 100)
    mp_df["dist_to_maxpain_pct"] = (mp_df["max_pain"] - mp_df["spot"]).abs() / mp_df["spot"] * 100
    mp_df.to_csv(f"{RES}/maxpain_vs_magnet.csv", index=False)

    print(f"n days: {len(mp_df)}")
    print(f"max pain == magnet strike on {mp_df['mp_eq_magnet'].mean()*100:.1f}% of days")
    print(f"median |max pain - magnet| as % of spot when they differ: {mp_df['dist_when_diff_pct'].median():.2f}%")
    print(f"\nmax pain distance from spot (%):\n{mp_df['dist_to_maxpain_pct'].describe()}")

    # Predictive test: does distance-to-max-pain predict next-day return
    # (reversion toward it), with the same chronological 60/20/20 split and
    # Spearman rank-IC discipline as Part 9.
    mp_df["dist_signed"] = mp_df["spot"] - mp_df["max_pain"]
    sub = mp_df.dropna(subset=["dist_signed", "fwd_ret_1d"]).reset_index(drop=True)
    n = len(sub)
    i1, i2 = int(n * 0.6), int(n * 0.8)
    ic_rows = []
    for label, seg in [("full", sub), ("train", sub.iloc[:i1]), ("val", sub.iloc[i1:i2]), ("OOS", sub.iloc[i2:])]:
        r, p = stats.spearmanr(seg["dist_signed"], seg["fwd_ret_1d"])
        ic_rows.append({"segment": label, "n": len(seg), "spearman_ic": r, "p_value": p})
    ic_df = pd.DataFrame(ic_rows)
    ic_df.to_csv(f"{RES}/maxpain_predictive_ic.csv", index=False)
    print("\n=== Does distance-to-real-max-pain predict next-day return (reversion)? ===")
    print(ic_df.to_string(index=False))


if __name__ == "__main__":
    main()
