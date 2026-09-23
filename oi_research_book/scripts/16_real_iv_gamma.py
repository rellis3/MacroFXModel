#!/usr/bin/env python3
"""Gamma flip / net GEX rebuilt with REAL per-strike implied vol. Frozen spec:
oi_research_book/GAMMA_REAL_IV_PREREG.md.

    python oi_research_book/scripts/16_real_iv_gamma.py build PAIR [PAIR ...]
    python oi_research_book/scripts/16_real_iv_gamma.py report

build  -> oi_research_book/data/gamma_iv_<pair>.parquet
report -> oi_research_book/data/results/gamma_real_iv_results.json
"""
import sys
import json
import importlib.util
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.stats import norm
from pair_config import PAIR_CONFIG

HERE = Path(__file__).parent
DATA = "oi_research_book/data"
FFILL_LIMIT = 5           # same as 01_build_daily_dataset.py
NEAR_DTE_MAX = 45         # the book's primary ("near") surface


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, str(HERE / file))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def build(pair):
    ivm = _load("ivs", "14_iv_surface.py")
    ivm.MIN_DTE = 1                          # gamma needs the short-dated strikes too
    w = ivm.invert_chain(pair)[["date", "expiry", "strike", "T", "F", "iv"]]

    oi = pd.read_csv(f"OI Data/{pair}.csv", usecols=["date", "expiry", "strike", "right", "open_interest"])
    oi["date"] = pd.to_datetime(oi["date"])
    oi["expiry"] = pd.to_datetime(oi["expiry"], utc=True).dt.tz_localize(None)
    oi = oi.groupby(["date", "expiry", "strike", "right"], as_index=False)["open_interest"].max()
    oi = oi.sort_values(["expiry", "strike", "right", "date"])
    oi["eoi"] = oi.groupby(["expiry", "strike", "right"])["open_interest"].ffill(limit=FFILL_LIMIT)
    oi = oi[(oi["eoi"] > 0) & ((oi["expiry"] - oi["date"]).dt.days <= NEAR_DTE_MAX)]

    # F and T per (date, expiry); IV per strike, nearest inverted strike if missing
    fwd = w.groupby(["date", "expiry"], as_index=False)[["T", "F"]].first()
    oi = oi.merge(fwd, on=["date", "expiry"], how="inner")
    oi = oi.sort_values("strike")
    w = w.sort_values("strike")
    oi = pd.merge_asof(oi, w[["date", "expiry", "strike", "iv"]], on="strike",
                       by=["date", "expiry"], direction="nearest")
    oi = oi.dropna(subset=["iv"])
    T = np.maximum(oi["T"].values, 1 / 365)
    s = oi["iv"].values * np.sqrt(T)
    d1 = (np.log(oi["F"].values / oi["strike"].values) + 0.5 * s * s) / s
    gamma = norm.pdf(d1) / (oi["F"].values * s)
    oi["gex"] = np.where(oi["right"] == "C", 1, -1) * oi["eoi"].values * gamma * oi["F"].values

    front = fwd.sort_values("T").groupby("date").first()["F"]
    rows = []
    for date, g in oi.groupby("date"):
        by_k = g.groupby("strike")["gex"].sum().sort_index()
        cum = by_k.cumsum().values
        ks = by_k.index.values
        Ff = front.get(date, np.nan)
        cross = []
        for i in range(len(cum) - 1):
            if cum[i] == 0 or (cum[i] < 0) != (cum[i + 1] < 0):
                frac = -cum[i] / (cum[i + 1] - cum[i]) if cum[i + 1] != cum[i] else 0.5
                cross.append(ks[i] + min(max(frac, 0), 1) * (ks[i + 1] - ks[i]))
        flip = np.array(cross)[np.argmin(np.abs(np.array(cross) - Ff))] if cross else np.nan
        rows.append({"date": date, "F_native": Ff, "flip_native": flip,
                     "net_gex": g["gex"].sum(), "gex_norm": g["gex"].sum() / g["gex"].abs().sum()})
    out = pd.DataFrame(rows)
    # regime in native terms: underlying above the flip = positive-gamma side
    out["regime_pos"] = np.where(out["flip_native"].isna(), np.nan,
                                 (out["F_native"] > out["flip_native"]).astype(float))
    path = f"{DATA}/gamma_iv_{pair.lower()}.parquet"
    out.to_parquet(path)
    print(f"[{pair}] {len(out)} days, flip found on {out['flip_native'].notna().mean():.0%} -> {path}", flush=True)


def report():
    t15 = _load("t15", "15_iv_forecast_test.py")
    res = {}
    for pair in PAIR_CONFIG:
        g = pd.read_parquet(f"{DATA}/gamma_iv_{pair.lower()}.parquet")
        iv = pd.read_parquet(f"{DATA}/iv_daily_{pair.lower()}.parquet")
        d1 = t15.load_d1(pair)
        m = d1.reset_index().rename(columns={"index": "bar"})
        x = iv.merge(g, on="date").merge(m, on="date")         # alignment shift 0, per IV_FORECAST V2
        nh, nl, nc = d1["high"].shift(-1).values, d1["low"].shift(-1).values, d1["close"].values
        rng = (nh[x["bar"]] - nl[x["bar"]]) / nc[x["bar"]]
        x["y1"] = np.log(np.where(rng > 0, rng, np.nan))
        x["log_iv"], x["log_iv2"] = np.log(x["iv30"]), np.log(x["iv_front"])
        x["neg"] = 1 - x["regime_pos"]
        v = x.dropna(subset=["y1", "neg"])

        # G1 -- next-bar log range, below-flip minus above-flip, NW t
        X = np.column_stack([np.ones(len(v)), v["neg"]])
        beta, *_ = np.linalg.lstsq(X, v["y1"].values, rcond=None)
        e = v["y1"].values - X @ beta
        xc = v["neg"].values - v["neg"].mean()
        # HAC sandwich for the slope: Var(b) = n * S / (sum xc^2)^2
        t_g1 = beta[1] / np.sqrt(len(v) * _nw_var(xc * e, 5) / (xc @ xc) ** 2)
        res[pair] = {"G1": {"diff_log_range_below_minus_above": float(beta[1]), "nw_t": float(t_g1),
                            "share_below_flip": float(v["neg"].mean()), "n": int(len(v))}}

        # G2 -- does gamma add beyond IV?
        har = ["har_d", "har_w", "har_m"]
        base = har + ["log_iv", "log_iv2"]
        ea, ec, _ = t15.oos(x.dropna(subset=["neg", "gex_norm"]), "y1", base, base + ["neg", "gex_norm"])
        t, n = t15.nw_mean_t(ea - ec, 1)
        res[pair]["G2"] = {"improve_pct": float(100 * (1 - ec.mean() / ea.mean())), "dm_t": float(t),
                           "dm_p_one_sided": float(1 - norm.cdf(t)), "n_oos": int(n)}
        print(pair, res[pair], flush=True)

    # G0 -- EUR_USD only: real-IV flip vs the book's RV-proxy flip
    g = pd.read_parquet(f"{DATA}/gamma_iv_eur_usd.parquet")
    book = pd.read_parquet(f"{DATA}/daily_master_near.parquet")[["date", "gamma_flip", "spot"]]
    j = g.merge(book, on="date").dropna(subset=["flip_native", "gamma_flip"])
    res["G0_EUR_USD"] = {"n": int(len(j)),
                         "median_abs_flip_diff_pct_spot": float((100 * (j["flip_native"] - j["gamma_flip"]).abs() / j["spot"]).median()),
                         "regime_disagree_share": float(((j["spot"] > j["gamma_flip"]) != (j["F_native"] > j["flip_native"])).mean())}
    print("G0", res["G0_EUR_USD"])
    pairs = list(PAIR_CONFIG)
    g1_sign = sum(res[p]["G1"]["diff_log_range_below_minus_above"] > 0 for p in pairs)
    g1_sig = sum(res[p]["G1"]["nw_t"] > 2 for p in pairs)
    g2_w = sum(res[p]["G2"]["improve_pct"] > 0 for p in pairs)
    g2_s = sum(res[p]["G2"]["dm_p_one_sided"] < 0.05 for p in pairs)
    res["G1_verdict"] = {"textbook_sign": g1_sign, "t_gt_2": g1_sig, "PASS": g1_sign >= 5 and g1_sig >= 4}
    res["G2_verdict"] = {"beats_iv_model": g2_w, "dm_sig": g2_s, "PASS": g2_w >= 5 and g2_s >= 4}
    print("G1", res["G1_verdict"]); print("G2", res["G2_verdict"])
    with open(f"{DATA}/results/gamma_real_iv_results.json", "w") as f:
        json.dump(res, f, indent=2)


def _nw_var(u, lag):
    u = np.asarray(u, float)
    n = len(u)
    s = u @ u / n
    for L in range(1, lag + 1):
        s += 2 * (1 - L / (lag + 1)) * (u[L:] @ u[:-L]) / n
    return s


if __name__ == "__main__":
    if sys.argv[1] == "build":
        for p in sys.argv[2:]:
            build(p)
    else:
        report()
