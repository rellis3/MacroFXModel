"""Placebo OI contamination + dose-response (corrected design swap+basis): how much OI sits on the grid placebo
strikes relative to the wall, and does the break rate fall as a level's OI rises?
    python scripts/null-audit/wall-placebo/oi_dose.py"""
import sys, os
import numpy as np
import pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
import reimpl as R

O = "analysis/output/null-audit/wall-placebo"
ev = pd.read_parquet(f"{O}/reimpl/events_swap+basis.parquet")
ev = ev[ev["kind"].isin(["wall", "grid"])].copy()
ev["date"] = pd.to_datetime(ev["date"])
out = []
for pair in R.PAIRS:
    inv = R.PAIR_CONFIG[pair]["inverted"]; step = R.STEP.get(pair, 0.005)
    raw = pd.read_csv(f"OI Data/{pair}.csv", usecols=["date", "expiry", "strike", "right", "open_interest"])
    raw["date"] = pd.to_datetime(raw["date"])
    raw = raw.sort_values(["expiry", "strike", "right", "date"])
    raw["oi"] = raw.groupby(["expiry", "strike", "right"], sort=False)["open_interest"].ffill(limit=5)
    surf = raw.dropna(subset=["oi"]).groupby(["date", "right", "strike"])["oi"].sum()
    surf.index = surf.index.set_levels(np.round(surf.index.levels[2], 7), level=2)
    surf = surf.groupby(level=[0, 1, 2]).sum()
    w = R.walls_from_raw(pair).sort_values("date")
    m1dates = set(pd.to_datetime(R.load_m1(pair)["date"].unique()))
    w = w[w["date"].isin(m1dates)].reset_index(drop=True)
    # OANDA call wall = native P on inverted pairs (swap)
    cmap = {"call": ("P" if inv else "C"), "put": ("C" if inv else "P")}
    w["book_date"] = w["date"]
    lag = w.shift(1); lag["date"] = w["date"]                     # label date -> previous CME row's book
    e = ev[ev["pair"] == pair]
    for side in ("call", "put"):
        rt = cmap[side]
        es = e[e["side"] == side].merge(lag[["date", "book_date", f"{rt}_strike", f"{rt}_oi"]], on="date", how="left")
        nat = np.round(es[f"{rt}_strike"].values + es["k"].values * step, 7)
        key = pd.MultiIndex.from_arrays([es["book_date"], np.full(len(es), rt), nat])
        es["oi_level"] = surf.reindex(key).fillna(0).values
        es["oi_ratio"] = es["oi_level"] / es[f"{rt}_oi"]
        out.append(es)
D = pd.concat(out, ignore_index=True)
g = D[D["kind"] == "grid"]
print("grid placebo OI / wall OI: quantiles", g["oi_ratio"].quantile([.1, .25, .5, .75, .9]).round(2).to_dict())
print("share of grid placebo touches with OI >= 50% of the wall:", round(float((g["oi_ratio"] >= .5).mean()), 3))
D["bin"] = pd.cut(D["oi_ratio"], [-0.01, 0.1, 0.25, 0.5, 0.75, 0.999, 1.001], labels=["<10%", "10-25%", "25-50%", "50-75%", "75-99.9%", "wall(100%)"])
for h in (15, 60):
    t = D[D[f"b{h}"].notna()].groupby(["side", "bin"], observed=True)[f"b{h}"].agg(["mean", "count"])
    t["mean"] = (100 * t["mean"]).round(1)
    print(f"\nbreak rate by level OI as share of wall OI, h={h}m (corrected design)\n", t.to_string())
# simple dose slope: logistic-free linear prob on oi_ratio, grid only, with pair-week cluster bootstrap
rng = np.random.default_rng(7)
for h in (15, 60):
    s = g[g[f"b{h}"].notna()].copy()
    iso = s["date"].dt.isocalendar(); s["cl"] = s["pair"] + iso["year"].astype(str) + iso["week"].astype(str)
    x, y = s["oi_ratio"].clip(0, 1).values, s[f"b{h}"].values
    slope = np.polyfit(x, y, 1)[0]
    cl = s["cl"].values; u = np.unique(cl); grp = {c: np.flatnonzero(cl == c) for c in u}
    bs = []
    for _ in range(500):
        ii = np.concatenate([grp[c] for c in rng.choice(u, len(u))])
        bs.append(np.polyfit(x[ii], y[ii], 1)[0])
    print(f"h={h}: grid break rate slope per 100% of wall OI = {100*slope:+.1f}pp  CI [{100*np.percentile(bs,2.5):+.1f}, {100*np.percentile(bs,97.5):+.1f}]")

# --- confound check: within (pair, side, k) strata (instrument mix and placebo position both move the break rate)
print("\nwithin-stratum (pair x side x k) slope, grid placebos only:")
for h in (15, 60):
    s = g[g[f"b{h}"].notna()].copy()
    iso = s["date"].dt.isocalendar(); s["cl"] = s["pair"] + iso["year"].astype(str) + iso["week"].astype(str)
    s["x"] = s["oi_ratio"].clip(0, 1); s["st"] = s["pair"] + s["side"] + s["k"].astype(str)
    s["xd"] = s["x"] - s.groupby("st")["x"].transform("mean"); s["yd"] = s[f"b{h}"] - s.groupby("st")[f"b{h}"].transform("mean")
    xd, yd = s["xd"].values, s["yd"].values
    sl = (xd * yd).sum() / (xd * xd).sum()
    cl = s["cl"].values; u = np.unique(cl); grp = {c: np.flatnonzero(cl == c) for c in u}; bs = []
    for _ in range(500):
        ii = np.concatenate([grp[c] for c in rng.choice(u, len(u))]); bs.append((xd[ii] * yd[ii]).sum() / (xd[ii] ** 2).sum())
    print(f"  h={h}: {100*sl:+.1f}pp per 100% of wall OI, CI [{100*np.percentile(bs,2.5):+.1f}, {100*np.percentile(bs,97.5):+.1f}]")
print("\nbreak rate 15m by pair (grid):", g.groupby("pair")["b15"].mean().mul(100).round(1).to_dict())
print("median oi_ratio by pair (grid):", g.groupby("pair")["oi_ratio"].median().round(2).to_dict())
print("break rate 15m by k (grid):", g.groupby(["side", "k"])["b15"].mean().mul(100).round(1).to_dict())
print("median oi_ratio by k (grid):", g.groupby(["side", "k"])["oi_ratio"].median().round(2).to_dict())
