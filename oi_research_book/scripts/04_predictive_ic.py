#!/usr/bin/env python3
"""Part 10 (OI change as signal), Part 15/26-29 (predictive IC with a real
chronological IS/OOS split), and the Part 32/34 variable-reduction ranking.

No shuffling: train = first 60% of trading days, val = next 20%, test = last
20% (OOS). Every "as of date t" feature uses only information dated <= t.
"""
import numpy as np
import pandas as pd
from scipy import stats

DATA = "oi_research_book/data"
RES = f"{DATA}/results"


def add_oi_change_totals(daily, tag):
    surf = pd.read_parquet(f"{DATA}/surface_{tag}.parquet")
    chg = surf.groupby("date").agg(
        total_call_oi_chg=("call_oi_chg", "sum"),
        total_put_oi_chg=("put_oi_chg", "sum"),
    ).reset_index()
    return daily.merge(chg, on="date", how="left")


def build_features(daily):
    d = daily.copy()
    d["dist_call_wall_pct"] = (d["call_wall_a"] - d["spot"]) / d["spot"] * 100
    d["dist_put_wall_pct"] = (d["spot"] - d["put_wall_a"]) / d["spot"] * 100
    d["dist_gamma_flip_pct"] = (d["spot"] - d["gamma_flip"]) / d["spot"] * 100
    d["pc_oi_ratio_z"] = (d["pc_oi_ratio"] - d["pc_oi_ratio"].rolling(60, min_periods=20).mean()) / d[
        "pc_oi_ratio"].rolling(60, min_periods=20).std()
    d["net_gex_z"] = (d["net_gex_sum"] - d["net_gex_sum"].rolling(60, min_periods=20).mean()) / d[
        "net_gex_sum"].rolling(60, min_periods=20).std()
    d["call_oi_chg_z"] = zscore_roll(d["total_call_oi_chg"])
    d["put_oi_chg_z"] = zscore_roll(d["total_put_oi_chg"])
    d["call_wall_oi_pctile"] = d["call_wall_a_oi"].rank(pct=True)
    d["put_wall_oi_pctile"] = d["put_wall_a_oi"].rank(pct=True)
    d["yday_ret"] = d["ret"]  # momentum baseline
    d["fwd_abs_ret_1d"] = d["fwd_ret_1d"].abs()
    return d


def zscore_roll(s, window=60, minp=20):
    return (s - s.rolling(window, min_periods=minp).mean()) / s.rolling(window, min_periods=minp).std()


FEATURES = [
    "dist_call_wall_pct", "dist_put_wall_pct", "dist_gamma_flip_pct",
    "pc_oi_ratio_z", "net_gex_z", "call_oi_chg_z", "put_oi_chg_z",
    "call_wall_oi_pctile", "put_wall_oi_pctile", "yday_ret",
]
TARGETS = ["fwd_ret_1d", "fwd_abs_ret_1d"]


def split(d):
    n = len(d)
    i1, i2 = int(n * 0.6), int(n * 0.8)
    return d.iloc[:i1], d.iloc[i1:i2], d.iloc[i2:]


def ic(a, b):
    m = a.notna() & b.notna() & np.isfinite(a) & np.isfinite(b)
    if m.sum() < 20:
        return np.nan, np.nan, int(m.sum())
    r, p = stats.spearmanr(a[m], b[m])
    return r, p, int(m.sum())


def run_ic_table(d, tag):
    train, val, test = split(d)
    rows = []
    for feat in FEATURES:
        for targ in TARGETS:
            tr_ic, tr_p, tr_n = ic(train[feat], train[targ])
            va_ic, va_p, va_n = ic(val[feat], val[targ])
            te_ic, te_p, te_n = ic(test[feat], test[targ])
            rows.append({
                "surface": tag, "feature": feat, "target": targ,
                "train_ic": tr_ic, "train_p": tr_p, "train_n": tr_n,
                "val_ic": va_ic, "val_p": va_p, "val_n": va_n,
                "test_ic": te_ic, "test_p": te_p, "test_n": test_n if False else te_n,
                "same_sign_train_test": bool(np.sign(tr_ic) == np.sign(te_ic)) if pd.notna(tr_ic) and pd.notna(te_ic) else False,
            })
    out = pd.DataFrame(rows)
    out.to_csv(f"{RES}/predictive_ic_{tag}.csv", index=False)
    return out


def variable_reduction(all_ic):
    survivors = all_ic[
        (all_ic["same_sign_train_test"]) &
        (all_ic["test_p"] < 0.10) &
        (all_ic["train_p"] < 0.10)
    ].copy()
    survivors["abs_test_ic"] = survivors["test_ic"].abs()
    survivors = survivors.sort_values("abs_test_ic", ascending=False)
    survivors.to_csv(f"{RES}/predictive_ic_survivors.csv", index=False)
    print(f"\n=== Variables with train+test-significant, sign-stable IC (p<0.10 both sides): {len(survivors)} of {len(all_ic)} feature/target/surface combos tested ===")
    if len(survivors):
        print(survivors[["surface", "feature", "target", "train_ic", "test_ic", "train_p", "test_p"]].to_string(index=False))
    else:
        print("NONE. No feature/target combination in this dataset showed a sign-stable, "
              "jointly-significant (p<0.10 in both train and test) relationship. This is a real null.")
    return survivors


def main():
    for tag in ["near", "all"]:
        daily = pd.read_parquet(f"{DATA}/daily_master_{tag}.parquet").sort_values("date").reset_index(drop=True)
        daily = add_oi_change_totals(daily, tag)
        feat = build_features(daily)
        out = run_ic_table(feat, tag)
        print(f"\n=== Predictive IC table ({tag} surface) -- Spearman rank-IC, chronological 60/20/20 split ===")
        print(out[["feature", "target", "train_ic", "train_p", "val_ic", "test_ic", "test_p"]].to_string(index=False))

    all_ic = pd.concat([pd.read_csv(f"{RES}/predictive_ic_near.csv"), pd.read_csv(f"{RES}/predictive_ic_all.csv")])
    variable_reduction(all_ic)


if __name__ == "__main__":
    main()
