#!/usr/bin/env python3
"""Part 8 (pinning vs control), Part 9 (expiry-day vol), and Part 13/14
(wall rejection vs break, and what happens after a break) -- see book."""
import numpy as np
import pandas as pd
from scipy import stats

DATA = "oi_research_book/data"
RES = f"{DATA}/results"


def load_contracts():
    return pd.read_parquet(f"{DATA}/cache/contract_level_ffilled.parquet")


def load_price():
    d1 = pd.read_parquet(f"{DATA}/daily_master_all.parquet")[
        ["date", "spot", "close", "high", "low", "ret"]
    ]
    return d1


# ---------------------------------------------------------------- pinning ---
def pinning_test(contracts, d1, lookback_days=5, min_oi_liquidity=200):
    trading_dates = np.sort(d1["date"].unique())
    date_to_idx = {d: i for i, d in enumerate(trading_dates)}

    by_exp_strike = contracts.groupby(["expiry", "date", "strike"])["effective_oi"].sum().reset_index()
    expiries = np.sort(contracts["expiry"].unique())

    pairs = []
    for exp in expiries:
        exp_date = pd.Timestamp(exp).tz_localize(None) if pd.Timestamp(exp).tzinfo else pd.Timestamp(exp)
        exp_day = exp_date.normalize()
        after = trading_dates[trading_dates <= exp_day]
        if len(after) < lookback_days + 1:
            continue
        expiry_trade_idx = date_to_idx[after[-1]]
        if expiry_trade_idx < lookback_days:
            continue
        ref_date = trading_dates[expiry_trade_idx - lookback_days]
        final_date = trading_dates[expiry_trade_idx]

        chain_ref = by_exp_strike[(by_exp_strike.expiry == exp) & (by_exp_strike.date == ref_date)]
        if chain_ref.empty or chain_ref["effective_oi"].sum() < min_oi_liquidity:
            continue
        spot_ref = d1.loc[d1.date == ref_date, "close"]
        spot_final = d1.loc[d1.date == final_date, "close"]
        if spot_ref.empty or spot_final.empty:
            continue
        spot_ref, spot_final = spot_ref.values[0], spot_final.values[0]

        magnet_row = chain_ref.loc[chain_ref["effective_oi"].idxmax()]
        magnet_strike, magnet_oi = magnet_row["strike"], magnet_row["effective_oi"]
        magnet_init_dist = abs(magnet_strike - spot_ref)

        candidates = chain_ref[chain_ref["strike"] != magnet_strike].copy()
        if candidates.empty:
            continue
        candidates["dist"] = (candidates["strike"] - spot_ref).abs()
        candidates["low_oi"] = candidates["effective_oi"] <= candidates["effective_oi"].median()
        pool = candidates[candidates["low_oi"]] if candidates["low_oi"].any() else candidates
        control_row = pool.iloc[(pool["dist"] - magnet_init_dist).abs().argsort().values[0]]
        control_strike, control_oi = control_row["strike"], control_row["effective_oi"]
        control_init_dist = abs(control_strike - spot_ref)

        # intraday high/low between ref_date (exclusive) and final_date (inclusive) for crossing check
        window = d1[(d1.date > ref_date) & (d1.date <= final_date)]
        if window.empty:
            continue
        pairs.append({
            "expiry": exp, "ref_date": ref_date, "final_date": final_date,
            "spot_ref": spot_ref, "spot_final": spot_final,
            "magnet_strike": magnet_strike, "magnet_oi": magnet_oi,
            "magnet_init_dist_pct": magnet_init_dist / spot_ref * 100,
            "magnet_final_dist_pct": abs(magnet_strike - spot_final) / spot_ref * 100,
            "magnet_crossed": bool((window["high"].max() >= magnet_strike) and (window["low"].min() <= magnet_strike)),
            "control_strike": control_strike, "control_oi": control_oi,
            "control_init_dist_pct": control_init_dist / spot_ref * 100,
            "control_final_dist_pct": abs(control_strike - spot_final) / spot_ref * 100,
            "control_crossed": bool((window["high"].max() >= control_strike) and (window["low"].min() <= control_strike)),
        })

    out = pd.DataFrame(pairs)
    out.to_csv(f"{RES}/pinning_pairs.csv", index=False)

    summary = {
        "n_expiry_cycles_tested": len(out),
        "magnet_mean_init_dist_pct": out["magnet_init_dist_pct"].mean(),
        "control_mean_init_dist_pct": out["control_init_dist_pct"].mean(),
        "magnet_mean_final_dist_pct": out["magnet_final_dist_pct"].mean(),
        "control_mean_final_dist_pct": out["control_final_dist_pct"].mean(),
        "magnet_pct_crossed": out["magnet_crossed"].mean() * 100,
        "control_pct_crossed": out["control_crossed"].mean() * 100,
        "wilcoxon_p_final_dist_magnet_vs_control": np.nan,
    }
    if len(out) > 8:
        w, p = stats.wilcoxon(out["magnet_final_dist_pct"], out["control_final_dist_pct"])
        summary["wilcoxon_p_final_dist_magnet_vs_control"] = p
    sdf = pd.DataFrame([summary])
    sdf.to_csv(f"{RES}/pinning_summary.csv", index=False)
    print("\n=== Strike pinning: max-OI strike ('magnet') vs matched control strike ===")
    print(sdf.T.to_string())

    # The raw final-distance comparison above is confounded: the magnet starts
    # closer to spot than the control on average (OI concentrates near ATM by
    # construction), so "magnet ends up closer" partly just repeats that
    # starting gap. Control for it by comparing the CHANGE in distance
    # (final - initial), which nets the starting-point bias out.
    out["magnet_dist_change_pp"] = out["magnet_final_dist_pct"] - out["magnet_init_dist_pct"]
    out["control_dist_change_pp"] = out["control_final_dist_pct"] - out["control_init_dist_pct"]
    out["magnet_rel_shrink"] = out["magnet_dist_change_pp"] / out["magnet_init_dist_pct"]
    out["control_rel_shrink"] = out["control_dist_change_pp"] / out["control_init_dist_pct"]
    change_summary = {
        "magnet_mean_dist_change_pp": out["magnet_dist_change_pp"].mean(),
        "control_mean_dist_change_pp": out["control_dist_change_pp"].mean(),
        "wilcoxon_p_dist_change_magnet_vs_control": np.nan,
        "magnet_mean_rel_shrink": out["magnet_rel_shrink"].mean(),
        "control_mean_rel_shrink": out["control_rel_shrink"].mean(),
        "wilcoxon_p_rel_shrink_magnet_vs_control": np.nan,
    }
    if len(out) > 8:
        _, p1 = stats.wilcoxon(out["magnet_dist_change_pp"], out["control_dist_change_pp"])
        _, p2 = stats.wilcoxon(out["magnet_rel_shrink"], out["control_rel_shrink"])
        change_summary["wilcoxon_p_dist_change_magnet_vs_control"] = p1
        change_summary["wilcoxon_p_rel_shrink_magnet_vs_control"] = p2
    cdf = pd.DataFrame([change_summary])
    cdf.to_csv(f"{RES}/pinning_summary_confound_controlled.csv", index=False)
    print("\n=== Same test, controlling for the initial-distance confound (distance CHANGE, not raw final distance) ===")
    print(cdf.T.to_string())
    return out, sdf


# ------------------------------------------------------------- wall react ---
def wall_reaction_test(daily, buffer_pct=0.0015, horizons=(1, 3, 5)):
    d = daily.copy().reset_index(drop=True)
    events = []
    for i in range(1, len(d) - max(horizons)):
        prev_close = d.loc[i - 1, "close"]
        hi, lo, close = d.loc[i, "high"], d.loc[i, "low"], d.loc[i, "close"]
        cw, pw = d.loc[i, "call_wall_a"], d.loc[i, "put_wall_a"]

        if prev_close < cw and hi >= cw * (1 - buffer_pct):
            outcome = "break" if close > cw else "reject"
            row = {"date": d.loc[i, "date"], "wall_type": "call", "level": cw, "outcome": outcome}
            for h in horizons:
                row[f"fwd_ret_{h}d"] = d.loc[i + h, "close"] / close - 1
            events.append(row)
        if prev_close > pw and lo <= pw * (1 + buffer_pct):
            outcome = "break" if close < pw else "reject"
            row = {"date": d.loc[i, "date"], "wall_type": "put", "level": pw, "outcome": outcome}
            for h in horizons:
                row[f"fwd_ret_{h}d"] = d.loc[i + h, "close"] / close - 1
            events.append(row)

    ev = pd.DataFrame(events)
    ev.to_csv(f"{RES}/wall_reaction_events.csv", index=False)

    rows = []
    for (wtype, outcome), g in ev.groupby(["wall_type", "outcome"]):
        r = {"wall_type": wtype, "outcome": outcome, "n_events": len(g)}
        for h in horizons:
            r[f"mean_fwd_ret_{h}d_pct"] = g[f"fwd_ret_{h}d"].mean() * 100
            r[f"pct_continuation_{h}d"] = (
                (g[f"fwd_ret_{h}d"] > 0).mean() * 100 if wtype == "call"
                else (g[f"fwd_ret_{h}d"] < 0).mean() * 100
            )
        rows.append(r)
    out = pd.DataFrame(rows)
    out.to_csv(f"{RES}/wall_reaction_summary.csv", index=False)
    print("\n=== Wall approach outcome: break vs reject, then forward returns ===")
    print(out.to_string(index=False))
    return ev, out


def main():
    contracts = load_contracts()
    d1 = load_price()
    pinning_test(contracts, d1)

    daily = pd.read_parquet(f"{DATA}/daily_master_all.parquet").sort_values("date").reset_index(drop=True)
    wall_reaction_test(daily)


if __name__ == "__main__":
    main()
