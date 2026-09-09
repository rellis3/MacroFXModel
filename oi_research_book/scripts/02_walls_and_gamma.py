#!/usr/bin/env python3
"""Part 4-7 of the book: wall definitions, persistence/migration, gamma-flip
regime tests, and the gamma-flip crossing event study. Reads the small parquet
files 01_build_daily_dataset.py produced; writes small result CSVs to
oi_research_book/data/results/.
"""
import numpy as np
import pandas as pd
from scipy import stats

DATA = "oi_research_book/data"
RES = f"{DATA}/results"
import os
os.makedirs(RES, exist_ok=True)


def load(tag):
    return pd.read_parquet(f"{DATA}/daily_master_{tag}.parquet").sort_values("date").reset_index(drop=True)


def wall_definition_agreement(near, allw):
    rows = []
    for tag, df in [("near", near), ("all", allw)]:
        for side in ["call", "put"]:
            a = df[f"{side}_wall_a"]
            for other in ["b", "c", "d", "e"]:
                o = df[f"{side}_wall_{other}"]
                agree = (a == o).mean()
                med_dist_pct = ((a - o).abs() / df["spot"]).median() * 100
                rows.append({"surface": tag, "side": side, "def_pair": f"a_vs_{other}",
                             "agreement_rate": agree, "median_abs_dist_when_diff_pct": med_dist_pct})
    out = pd.DataFrame(rows)
    out.to_csv(f"{RES}/wall_definition_agreement.csv", index=False)
    print("\n=== Wall definition agreement (Definition A vs others) ===")
    print(out.to_string(index=False))
    return out


def wall_persistence_migration(df, tag):
    d = df.copy()
    for side in ["call", "put"]:
        col = f"{side}_wall_a"
        d[f"{side}_wall_chg"] = d[col].diff()
        d[f"{side}_wall_same"] = (d[col] == d[col].shift(1)).astype(float)

    persistence = {
        "surface": tag,
        "call_wall_pct_days_unchanged": d["call_wall_same"].mean(),
        "put_wall_pct_days_unchanged": d["put_wall_same"].mean(),
        "call_wall_mean_run_length_days": run_length_mean(d["call_wall_a"]),
        "put_wall_mean_run_length_days": run_length_mean(d["put_wall_a"]),
    }

    # Lead/lag: does today's wall migration predict tomorrow's return (lead),
    # or does today's return predict tomorrow's wall migration (lag)?
    lag_lead = {}
    for side, expect_sign in [("call", +1), ("put", -1)]:
        wall_chg_pct = d[f"{side}_wall_chg"] / d["spot"]
        # LEAD: wall_chg(t) vs fwd_ret_1d(t)  [wall moved today -> price tomorrow]
        lead_corr, lead_p = spearman_safe(wall_chg_pct, d["fwd_ret_1d"])
        # LAG: ret(t) [=today's realized return] vs wall_chg(t+1) [wall moves tomorrow]
        lag_corr, lag_p = spearman_safe(d["ret"], wall_chg_pct.shift(-1))
        lag_lead[f"{side}_wall_migration_leads_return_spearman"] = lead_corr
        lag_lead[f"{side}_wall_migration_leads_return_p"] = lead_p
        lag_lead[f"{side}_return_leads_wall_migration_spearman"] = lag_corr
        lag_lead[f"{side}_return_leads_wall_migration_p"] = lag_p
    persistence.update(lag_lead)
    return persistence


def run_length_mean(series):
    vals = series.values
    runs = []
    cur = 1
    for i in range(1, len(vals)):
        if vals[i] == vals[i - 1]:
            cur += 1
        else:
            runs.append(cur)
            cur = 1
    runs.append(cur)
    return float(np.mean(runs))


def spearman_safe(a, b):
    m = a.notna() & b.notna() & np.isfinite(a) & np.isfinite(b)
    if m.sum() < 30:
        return np.nan, np.nan
    r, p = stats.spearmanr(a[m], b[m])
    return r, p


def gamma_regime_test(df, tag):
    d = df.copy()
    d["above_flip"] = d["spot"] > d["gamma_flip"]
    d = d[d["gamma_flip"].notna()]
    grp = d.groupby("above_flip")
    rows = []
    for name, g in grp:
        rows.append({
            "surface": tag, "regime": "above_flip" if name else "below_flip",
            "n_days": len(g),
            "mean_abs_fwd_ret_1d_pct": g["fwd_ret_1d"].abs().mean() * 100,
            "std_fwd_ret_1d_pct": g["fwd_ret_1d"].std() * 100,
            "mean_fwd_range_pct": ((g["fwd_hi_1d"] - g["fwd_lo_1d"]) / g["spot"]).mean() * 100,
            "ret_autocorr_lag1": g["ret"].autocorr(1),
        })
    out = pd.DataFrame(rows)

    above = d.loc[d["above_flip"], "fwd_ret_1d"].abs().dropna()
    below = d.loc[~d["above_flip"], "fwd_ret_1d"].abs().dropna()
    tstat, pval = stats.mannwhitneyu(above, below, alternative="two-sided") if len(above) > 5 and len(below) > 5 else (np.nan, np.nan)
    out["mannwhitney_p_abs_fwd_ret_above_vs_below"] = pval
    out.to_csv(f"{RES}/gamma_regime_{tag}.csv", index=False)
    print(f"\n=== Gamma-flip regime test ({tag}): |next-day return| above vs below flip ===")
    print(out.to_string(index=False))
    return out


def gamma_crossing_event_study(df, tag, horizons=(1, 3, 5)):
    d = df.copy()
    d = d[d["gamma_flip"].notna()].reset_index(drop=True)
    side = np.sign(d["spot"] - d["gamma_flip"])
    crossed = side != side.shift(1)
    crossed.iloc[0] = False
    d["crossed"] = crossed
    n_cross = int(d["crossed"].sum())

    rows = []
    close = d["close"].values
    for h in horizons:
        fwd = pd.Series(close).pct_change(h).shift(-h).values
        d[f"fwd_ret_{h}d"] = fwd
        cross_vals = d.loc[d["crossed"], f"fwd_ret_{h}d"].abs().dropna()
        base_vals = d.loc[~d["crossed"], f"fwd_ret_{h}d"].abs().dropna()
        if len(cross_vals) > 5 and len(base_vals) > 5:
            _, p = stats.mannwhitneyu(cross_vals, base_vals, alternative="two-sided")
        else:
            p = np.nan
        rows.append({
            "surface": tag, "horizon_days": h, "n_crossing_events": n_cross,
            "mean_abs_fwd_ret_after_crossing_pct": cross_vals.mean() * 100,
            "mean_abs_fwd_ret_baseline_pct": base_vals.mean() * 100,
            "mannwhitney_p": p,
        })
    out = pd.DataFrame(rows)
    out.to_csv(f"{RES}/gamma_crossing_event_study_{tag}.csv", index=False)
    print(f"\n=== Gamma-flip crossing event study ({tag}), n_events={n_cross} ===")
    print(out.to_string(index=False))
    return out


def wall_strength_vs_reaction(df, tag):
    """P2-1-style test: bucket days by call/put wall OI percentile (a crude
    'strength' proxy) and check whether stronger walls precede smaller or
    larger next-day moves toward them."""
    d = df.copy()
    d["call_wall_pctile"] = d["call_wall_a_oi"].rank(pct=True)
    d["put_wall_pctile"] = d["put_wall_a_oi"].rank(pct=True)
    d["tercile_call"] = pd.qcut(d["call_wall_pctile"], 3, labels=["weak", "mid", "strong"])
    d["dist_to_call_wall_pct"] = (d["call_wall_a"] - d["spot"]) / d["spot"] * 100
    rows = []
    for t, g in d.groupby("tercile_call", observed=True):
        rows.append({
            "surface": tag, "call_wall_strength_tercile": t, "n": len(g),
            "mean_dist_to_wall_pct": g["dist_to_call_wall_pct"].mean(),
            "mean_abs_fwd_ret_1d_pct": g["fwd_ret_1d"].abs().mean() * 100,
            "corr_dist_vs_fwd_ret_1d": spearman_safe(g["dist_to_call_wall_pct"], g["fwd_ret_1d"])[0],
        })
    out = pd.DataFrame(rows)
    out.to_csv(f"{RES}/wall_strength_vs_reaction_{tag}.csv", index=False)
    print(f"\n=== Call-wall strength tercile vs next-day move ({tag}) ===")
    print(out.to_string(index=False))
    return out


def main():
    near = load("near")
    allw = load("all")
    wall_definition_agreement(near, allw)

    persist_rows = [wall_persistence_migration(near, "near"), wall_persistence_migration(allw, "all")]
    pdf = pd.DataFrame(persist_rows)
    pdf.to_csv(f"{RES}/wall_persistence_migration.csv", index=False)
    print("\n=== Wall persistence & lead/lag (migration vs return) ===")
    print(pdf.T.to_string())

    for tag, df in [("near", near), ("all", allw)]:
        gamma_regime_test(df, tag)
        gamma_crossing_event_study(df, tag)
        wall_strength_vs_reaction(df, tag)


if __name__ == "__main__":
    main()
