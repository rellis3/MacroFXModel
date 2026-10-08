"""Walk-forward gradient boosting + shuffled-target placebo for the line-touch wide scan
(forge/LINE_TOUCH_WIDE_SCAN_PREREG.md).

    python scripts/line_touch_wide/scan.py            # discovery only (out-of-fold), no holdout read
    python scripts/line_touch_wide/scan.py --holdout  # freeze c from discovery, read the holdout once, run the placebo
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/line_touch_wide_scan"
HOLDOUT = "--holdout" in sys.argv
N_PLACEBO = 30
SPLIT = pd.Timestamp("2022-06-24")
HALF = pd.Timestamp("2024-06-01")
PER_WEEK = 2.0
COSTS = {0: 0.0, 0.02: 0.2, 0.05: 0.5}               # cost as share of expected range -> R (R = 0.10 of expected range)
TARGETS = ["ret60", "R_cont", "R_fade"]
rng = np.random.default_rng(20261008)

df = pd.read_parquet(OUT / "features.parquet")
df["dt"] = pd.to_datetime(df.t, unit="s")
df["weekday"] = pd.to_datetime(df.date).dt.dayofweek
df["fam"] = df.family.astype("category").cat.codes
df["abs_lvl"] = df.lvl_dist.abs()
df["prev_ret_s"] = df.prev_ret * df.side
FEAT = ["hour", "minsIn", "minsLeft", "weekday", "side", "rung", "fam", "lvl_dist", "abs_lvl", "day_ratio20",
        "prev_ret_s", "prev_rng", "n_prior", "last_prior15", "mv5", "mv15", "mv30", "mv60", "eff15", "eff60",
        "near60", "body1", "wf1", "wb1", "rng1", "body3", "wf3", "wb3", "rng3", "body5", "wf5", "wb5", "rng5",
        "since_counter", "vwap_dist", "vwap_slope", "rsi14", "vol15", "used", "pos", "since_ext"]
ELIG = 0.3 if "--elig03" in sys.argv else 0.5          # amendment 1: 5-min range at the touch <= ELIG of expected range
TAG = "_elig03" if "--elig03" in sys.argv else ""
df = df.dropna(subset=["R_cont", "R_fade", "ret60"])
df = df[(df.rng1 <= ELIG) & (df.hour < 20)].reset_index(drop=True)      # amendment 2: no 20:00-23:59 UTC
df["year"] = df.dt.dt.year
disc_mask = (df.dt < SPLIT).to_numpy()
hold_mask = ~disc_mask
trials = {"models": 0, "c_values": 0}


def fit(Xa, ya):
    m = HistGradientBoostingRegressor(max_iter=80, learning_rate=0.08, max_depth=4, min_samples_leaf=500,
                                      l2_regularization=1.0, random_state=1)
    trials["models"] += 1
    return m.fit(Xa, ya)


def oof_and_hold(Y, do_hold):
    """Walk-forward by year inside discovery (expanding); holdout predicted by a model fitted on all discovery."""
    X = df[FEAT].to_numpy(float)
    P = {t: np.full(len(df), np.nan) for t in TARGETS}
    years = sorted(df.year[disc_mask].unique())
    for yr in years[1:]:
        tr = disc_mask & (df.year < yr).to_numpy()
        te = disc_mask & (df.year == yr).to_numpy()
        if tr.sum() < 5000:
            continue
        for t in TARGETS:
            P[t][te] = fit(X[tr], Y[t][tr]).predict(X[te])
    if do_hold:
        for t in TARGETS:
            P[t][hold_mask] = fit(X[disc_mask], Y[t][disc_mask]).predict(X[hold_mask])
    return P


def decide(P, mask):
    """Continue/fade/skip from the two structure models; score = the larger predicted R."""
    pc, pf = P["R_cont"][mask], P["R_fade"][mask]
    return np.maximum(pc, pf), np.where(pc >= pf, 1, -1)


def weeks(mask):
    d = df.dt[mask]
    return max((d.max() - d.min()).days / 7.0, 1.0)


def select(P, c, mask):
    """Amendment 1: first eligible touch per instrument-day whose score clears c; realised R of the chosen side."""
    ok = mask & ~np.isnan(P["R_cont"])
    score, side = decide(P, ok)
    sub = df.loc[ok, ["pair", "date", "t", "dt", "year", "R_cont", "R_fade"]].copy()
    sub["score"], sub["side"] = score, side
    cand = sub[sub.score >= c].sort_values("t").drop_duplicates(["pair", "date"], keep="first")
    cand["r"] = np.where(cand.side > 0, cand.R_cont, cand.R_fade)
    return cand, weeks(ok)


def pick_c(P):
    ok = disc_mask & ~np.isnan(P["R_cont"])
    score, _ = decide(P, ok)
    trials["c_values"] += 1
    lo, hi = float(np.min(score)), float(np.max(score))
    for _ in range(40):
        mid = (lo + hi) / 2
        cand, wk = select(P, mid, disc_mask)
        if len(cand) / wk > PER_WEEK:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def match_rate(P, mask, n_target):
    ok = mask & ~np.isnan(P["R_cont"])
    score, _ = decide(P, ok)
    lo, hi = float(np.min(score)), float(np.max(score))
    for _ in range(40):
        mid = (lo + hi) / 2
        cand, _w = select(P, mid, mask)
        if len(cand) > n_target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def evaluate(P, c, mask, label):
    cand, wk = select(P, c, mask)
    r = cand.r.to_numpy()
    res = {"label": label, "n": int(len(cand)), "per_week": float(len(cand) / wk),
           "share_continue": float((cand.side > 0).mean()) if len(cand) else None}
    for cost, rc in COSTS.items():
        res[f"mean_R_cost{cost}"] = float((r - rc).mean()) if len(cand) else None
    res["_r"], res["_d"] = r, cand[["date", "pair", "dt"]].reset_index(drop=True)
    res["_c"] = cand
    return res


def boot(r, d, B=2000):
    g = d.date.to_numpy()
    u, inv = np.unique(g, return_inverse=True)
    sums = np.bincount(inv, weights=r - 0.2, minlength=len(u))
    cnts = np.bincount(inv, minlength=len(u))
    idx = rng.integers(0, len(u), (B, len(u)))
    return np.percentile(sums[idx].sum(1) / cnts[idx].sum(1), [2.5, 97.5]).tolist()


Y = {t: df[t].to_numpy(float) for t in TARGETS}
P = oof_and_hold(Y, HOLDOUT)
c = pick_c(P)
dres = evaluate(P, c, disc_mask, "discovery_oof")
np.savez(OUT / (f"preds_holdout{TAG}.npz" if HOLDOUT else f"preds_discovery{TAG}.npz"), **P)
report = {"c": c, "elig": ELIG, "discovery": {k: v for k, v in dres.items() if not k.startswith("_")}}
print("c =", round(c, 4))
print("DISCOVERY (out-of-fold):", json.dumps(report["discovery"], default=float))
by_year = {}
for yr, g in dres["_c"].groupby("year"):
    by_year[int(yr)] = {"n": int(len(g)), "meanR_gross": float(g.r.mean())}
dres["_c"].drop(columns=["R_cont", "R_fade"]).to_csv(OUT / f"selected_discovery{TAG}.csv", index=False)
report["discovery_by_year"] = by_year
print("by year:", by_year)
# descriptive: single-feature Spearman with R_cont (discovery vs holdout)
ic = {}
for f in FEAT:
    a = df.loc[disc_mask, [f, "R_cont"]].dropna()
    ic[f] = {"disc": float(a.corr(method="spearman").iloc[0, 1])}
    if HOLDOUT:
        b = df.loc[hold_mask, [f, "R_cont"]].dropna()
        ic[f]["hold"] = float(b.corr(method="spearman").iloc[0, 1])
report["spearman_R_cont"] = ic

if HOLDOUT:
    hres = evaluate(P, c, hold_mask, "holdout")
    r, d = hres["_r"], hres["_d"]
    report["holdout"] = {k: v for k, v in hres.items() if not k.startswith("_")}
    report["holdout"]["boot95_net0.02"] = boot(r, d)
    h1 = d.dt < HALF
    report["holdout"]["half1_net0.02"] = float((r[h1.to_numpy()] - 0.2).mean())
    report["holdout"]["half2_net0.02"] = float((r[~h1.to_numpy()] - 0.2).mean())
    bp = pd.DataFrame({"pair": d.pair, "r": r - 0.2}).groupby("pair").r.agg(["mean", "size"])
    report["holdout"]["instruments_positive"] = int((bp["mean"] > 0).sum())
    report["holdout"]["instruments_traded"] = int(len(bp))
    report["holdout"]["by_instrument"] = bp.round(4).to_dict("index")
    print("HOLDOUT:", json.dumps(report["holdout"], default=float))
    # placebo: shuffle targets (jointly) inside instrument-year-hour cells, rerun the pipeline
    cells = df.groupby(["pair", "year", "hour"]).indices
    plc, plcg = [], []
    for i in range(N_PLACEBO):
        perm = np.arange(len(df))
        for ix in cells.values():
            perm[ix] = rng.permutation(ix)
        Yp = {t: Y[t][perm] for t in TARGETS}
        Pp = oof_and_hold(Yp, True)
        # evaluate placebo realised outcomes with the shuffled targets
        save = {t: df[t].to_numpy().copy() for t in ("R_cont", "R_fade")}
        df["R_cont"], df["R_fade"] = Yp["R_cont"], Yp["R_fade"]
        cp = match_rate(Pp, hold_mask, hres["n"])      # rate-matched null: same number of holdout trades as the real run
        pr = evaluate(Pp, cp, hold_mask, f"placebo{i}")
        df["R_cont"], df["R_fade"] = save["R_cont"], save["R_fade"]
        plc.append(pr["mean_R_cost0.02"] if pr["n"] else 0.0)
        plcg.append(pr["mean_R_cost0"] if pr["n"] else 0.0)
        print("placebo", i, pr["n"], pr["mean_R_cost0"], pr["mean_R_cost0.02"], flush=True)
    report["placebo_net0.02"] = plc
    report["placebo_gross"] = plcg
    report["placebo_gross_p95"] = float(np.percentile(plcg, 95))
    report["placebo_p95"] = float(np.percentile(plc, 95))
    report["beats_placebo_p95"] = bool(report["holdout"]["mean_R_cost0.02"] > report["placebo_p95"])
report["trials"] = trials
(OUT / (f"results_holdout_ratematched{TAG}.json" if HOLDOUT else f"results_discovery{TAG}.json")).write_text(
    json.dumps(report, indent=1, default=float))
json.dump(trials, open(OUT / "trials.json", "w"))
print("trials", trials)
