"""Cost phase (forge/LINE_TOUCH_COST_PREREG.md): per-instrument spread, stop width, net-score selection.

    python scripts/line_touch_wide/scan2.py --w 0.1            # discovery only
    python scripts/line_touch_wide/scan2.py --w 0.2 --holdout [--placebo]
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/line_touch_wide_scan"
arg = lambda k, d: type(d)(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
W = arg("--w", 0.1)
LOCAL = arg("--local", 0.0)                 # adaptive stop: m x last-60-min range (forge/LINE_TOUCH_ADAPTIVE_STOP_PREREG.md)
BASE_MULT = 2.0
HOLDOUT, PLACEBO = "--holdout" in sys.argv, "--placebo" in sys.argv
SPLIT, HALF, PER_WEEK = pd.Timestamp("2022-06-24"), pd.Timestamp("2024-06-01"), 2.0
rng = np.random.default_rng(20261008)
SPREAD = {"eurusd": 0.00006, "gbpusd": 0.00009, "usdjpy": 0.007, "audusd": 0.00007, "usdchf": 0.00008,
          "audjpy": 0.010, "gold": 0.25, "nq": 1.0, "spx": 0.5, "de30": 1.0, "uk100": 1.0, "dow": 2.0,
          "cadjpy": 0.012, "chfjpy": 0.014, "euraud": 0.00014, "eurchf": 0.00010, "us2000": 0.4}

df = pd.read_parquet(OUT / "features.parquet")
tw = pd.read_parquet(OUT / "targets_widths.parquet")
assert (df.t.to_numpy() == tw.t.to_numpy()).all() and (df.pair.to_numpy() == tw.pair.to_numpy()).all()
if LOCAL:
    tl = pd.read_parquet(OUT / "targets_local.parquet")
    assert (df.t.to_numpy() == tl.t.to_numpy()).all() and (df.pair.to_numpy() == tl.pair.to_numpy()).all()
    df["R_cont"], df["R_fade"] = tl[f"R_cont_L{LOCAL}"].to_numpy(), tl[f"R_fade_L{LOCAL}"].to_numpy()
    df["Rp"], df["L_over_scale"] = tl[f"Rp_L{LOCAL}"].to_numpy(), tl["L_over_scale"].to_numpy()
elif W != 0.1:
    df["R_cont"], df["R_fade"] = tw[f"R_cont_{W}"].to_numpy(), tw[f"R_fade_{W}"].to_numpy()
df["dt"] = pd.to_datetime(df.t, unit="s")
df["weekday"] = pd.to_datetime(df.date).dt.dayofweek
df["fam"] = df.family.astype("category").cat.codes
df["abs_lvl"] = df.lvl_dist.abs()
df["prev_ret_s"] = df.prev_ret * df.side
FEAT = ["hour", "minsIn", "minsLeft", "weekday", "side", "rung", "fam", "lvl_dist", "abs_lvl", "day_ratio20",
        "prev_ret_s", "prev_rng", "n_prior", "last_prior15", "mv5", "mv15", "mv30", "mv60", "eff15", "eff60",
        "near60", "body1", "wf1", "wb1", "rng1", "body3", "wf3", "wb3", "rng3", "body5", "wf5", "wb5", "rng5",
        "since_counter", "vwap_dist", "vwap_slope", "rsi14", "vol15", "used", "pos", "since_ext"]
if LOCAL:
    FEAT = FEAT + ["L_over_scale"]
df = df.dropna(subset=["R_cont", "R_fade", "ret60"])
df = df[(df.rng1 <= 0.5) & (df.hour < 20)].reset_index(drop=True)
df["year"] = df.dt.dt.year
df["cost1"] = df.pair.map(SPREAD).to_numpy() / (df.Rp.to_numpy() if LOCAL else W * df.scale.to_numpy())      # R cost at 1x the table
disc = (df.dt < SPLIT).to_numpy()
hold = ~disc
nfit = [0]


def fit(X, y):
    nfit[0] += 1
    return HistGradientBoostingRegressor(max_iter=80, learning_rate=0.08, max_depth=4, min_samples_leaf=500,
                                         l2_regularization=1.0, random_state=1).fit(X, y)


def predict(Y, do_hold):
    X = df[FEAT].to_numpy(float)
    P = {t: np.full(len(df), np.nan) for t in ("R_cont", "R_fade")}
    ys = sorted(df.year[disc].unique())
    for yr in ys[1:]:
        tr, te = disc & (df.year < yr).to_numpy(), disc & (df.year == yr).to_numpy()
        if tr.sum() < 5000:
            continue
        for t in P:
            P[t][te] = fit(X[tr], Y[t][tr]).predict(X[te])
    if do_hold:
        for t in P:
            P[t][hold] = fit(X[disc], Y[t][disc]).predict(X[hold])
    return P


def weeks(mask):
    d = df.dt[mask]
    return max((d.max() - d.min()).days / 7.0, 1.0)


def select(P, c, mask, R=None):
    R = R or {"R_cont": df.R_cont.to_numpy(), "R_fade": df.R_fade.to_numpy()}
    ok = mask & ~np.isnan(P["R_cont"])
    cost = BASE_MULT * df.cost1.to_numpy()[ok]
    pc, pf = P["R_cont"][ok] - cost, P["R_fade"][ok] - cost
    sub = df.loc[ok, ["pair", "date", "t", "dt", "year", "cost1"]].copy()
    sub["score"], sub["side"] = np.maximum(pc, pf), np.where(pc >= pf, 1, -1)
    sub["g"] = np.where(sub.side > 0, R["R_cont"][ok], R["R_fade"][ok])
    cand = sub[sub.score >= c].sort_values("t").drop_duplicates(["pair", "date"], keep="first")
    return cand, weeks(ok)


def bisect(P, mask, target_n=None):
    lo, hi = -5.0, 5.0
    for _ in range(45):
        mid = (lo + hi) / 2
        cand, wk = select(P, mid, mask)
        n = len(cand)
        if (n > target_n) if target_n is not None else (n / wk > PER_WEEK):
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def summarise(cand, wk, label):
    r = {"label": label, "n": int(len(cand)), "per_week": float(len(cand) / wk) if len(cand) else 0.0}
    if not len(cand):
        return r
    r["fade_share"] = float((cand.side < 0).mean())
    r["gross"] = float(cand.g.mean())
    for m in (1, 2, 3):
        r[f"net_x{m}"] = float((cand.g - m * cand.cost1).mean())
    r["mean_cost_R_x2"] = float((2 * cand.cost1).mean())
    return r


def boot(cand, B=2000):
    net = (cand.g - BASE_MULT * cand.cost1).to_numpy()
    u, inv = np.unique(cand.date.to_numpy(), return_inverse=True)
    s, n = np.bincount(inv, weights=net, minlength=len(u)), np.bincount(inv, minlength=len(u))
    ix = rng.integers(0, len(u), (B, len(u)))
    return np.percentile(s[ix].sum(1) / n[ix].sum(1), [2.5, 97.5]).tolist()


Y = {"R_cont": df.R_cont.to_numpy(float), "R_fade": df.R_fade.to_numpy(float)}
P = predict(Y, HOLDOUT)
c = bisect(P, disc)
dc, wk = select(P, c, disc)
rep = {"width": W, "local_m": LOCAL, "c": c, "discovery": summarise(dc, wk, "discovery_oof")}
rep["discovery"]["by_year_net_x2"] = {int(y): float((g.g - 2 * g.cost1).mean()) for y, g in dc.groupby("year")}
print("W", W, "c", round(c, 4), json.dumps(rep["discovery"], default=float))
if HOLDOUT:
    hc, hwk = select(P, c, hold)
    rep["holdout"] = summarise(hc, hwk, "holdout")
    net = hc.g - BASE_MULT * hc.cost1
    rep["holdout"]["boot95_net_x2"] = boot(hc)
    first = (hc.dt < HALF).to_numpy()
    rep["holdout"]["half1_net_x2"], rep["holdout"]["half2_net_x2"] = float(net[first].mean()), float(net[~first].mean())
    bp = pd.DataFrame({"pair": hc.pair, "n": net}).groupby("pair").n.agg(["mean", "size"])
    rep["holdout"]["instruments_positive"], rep["holdout"]["instruments_traded"] = int((bp["mean"] > 0).sum()), len(bp)
    rep["holdout"]["by_instrument"] = bp.round(3).to_dict("index")
    print("HOLDOUT", json.dumps(rep["holdout"], default=float))
    if PLACEBO:
        cells, pn, pg = df.groupby(["pair", "year", "hour"]).indices, [], []
        for i in range(30):
            perm = np.arange(len(df))
            for ix in cells.values():
                perm[ix] = rng.permutation(ix)
            Yp = {t: Y[t][perm] for t in Y}
            Pp = predict(Yp, True)
            cp = bisect(Pp, hold, target_n=len(hc))
            cand, w2 = select(Pp, cp, hold, R=Yp)
            s = summarise(cand, w2, "p")
            pn.append(s.get("net_x2", 0.0)); pg.append(s.get("gross", 0.0))
            print("placebo", i, s["n"], pg[-1], pn[-1], flush=True)
        rep["placebo_net_x2"], rep["placebo_gross"] = pn, pg
        rep["placebo_net_p95"], rep["placebo_gross_p95"] = float(np.percentile(pn, 95)), float(np.percentile(pg, 95))
        rep["beats_placebo_net_p95"] = bool(rep["holdout"]["net_x2"] > rep["placebo_net_p95"])
rep["fits"] = nfit[0]
(OUT / f"cost_{'L'+str(LOCAL) if LOCAL else 'w'+str(W)}{'_holdout' if HOLDOUT else ''}.json").write_text(json.dumps(rep, indent=1, default=float))
