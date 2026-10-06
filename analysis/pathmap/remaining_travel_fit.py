"""Layer 5 — REMAINING TRAVEL fit and score (forge/REMAINING_TRAVEL_PREREG.md).

Reads analysis/output/remaining_travel/<SYM>.csv and <SYM>_profile.csv (scripts/pathmap/remaining_travel_build.mjs).
Fits R0 (clock), R1 (vol-time), R2 (vol-time + today so far) on train (< 2025-09-05) and scores the test window by the
pre-registered rule. Writes analysis/output/remaining_travel_summary.json and remaining-travel.json for the page.
    python analysis/pathmap/remaining_travel_fit.py
"""
import glob
import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

SPLIT = "2025-09-05"
TAUS = {"p50": 0.50, "p75": 0.75, "p90": 0.90}
SIDES = ("up", "down")
BANDS = {1: "01-05", 3: "01-05", 5: "01-05", 7: "07-11", 9: "07-11", 11: "07-11", 13: "13-15", 15: "13-15", 17: "17-19", 19: "17-19", 21: "21"}
KGRID = np.round(np.arange(0, 1.01, 0.1), 2)

rows = pd.concat([pd.read_csv(f) for f in glob.glob("analysis/output/remaining_travel/*.csv") if not f.endswith("_profile.csv")], ignore_index=True)
rows["train"] = rows["date"] < SPLIT
rows["band"] = rows["h"].map(BANDS)
rows["regime"] = pd.cut(rows["sigRel"], [0, 0.85, 1.15, 99], labels=["quiet", "normal", "busy"]).astype(object).where(rows["sigRel"].notna(), "nan")

# intraday variance profile per class (train sessions only, built by the builder)
prof = {}
for f in glob.glob("analysis/output/remaining_travel/*_profile.csv"):
    sym = Path(f).name.replace("_profile.csv", "")
    cls = rows.loc[rows["inst"] == sym, "cls"].iloc[0]
    p = pd.read_csv(f).set_index("minute")
    acc = prof.setdefault(cls, pd.DataFrame({"sum": 0.0, "n": 0.0}, index=range(1500)))
    acc.loc[p.index, "sum"] += p["sum"]; acc.loc[p.index, "n"] += p["n"]
share_left = {}
for cls, acc in prof.items():
    v = (acc["sum"] / acc["n"].replace(0, np.nan)).fillna(0).to_numpy()
    cum = np.cumsum(v) / v.sum()
    share_left[cls] = {h: float(1 - cum[h * 60 - 1]) for h in BANDS}

rows["s0"] = np.sqrt((24 - rows["h"]) / 24)
rows["s1"] = [np.sqrt(max(share_left[c][h], 1e-4)) for c, h in zip(rows["cls"], rows["h"])]
rows["elapsed"] = 1 - rows["s1"] ** 2
rows["sig_sofar"] = np.sqrt(rows["rv"] / rows["elapsed"].clip(lower=1e-3))     # today's realised vol so far, in σ units


def pinball(y, q, t):
    d = y - q
    return np.where(d >= 0, t * d, (t - 1) * d)


def fit_multipliers(tr, scale):
    """m[class][side][rung] = quantile of target / scale on train."""
    m = {}
    for cls, g in tr.groupby("cls"):
        m[cls] = {s: {r: float(np.quantile(g[s] / scale[g.index], t)) for r, t in TAUS.items()} for s in SIDES}
    return m


def predict(df, scale, m):
    out = {}
    for s in SIDES:
        for r in TAUS:
            mult = df["cls"].map({c: m[c][s][r] for c in m})
            out[f"{s}_{r}"] = mult * scale
    return pd.DataFrame(out, index=df.index)


tr = rows[rows["train"]]
models = {}
models["R0"] = ("clock", rows["s0"])
models["R1"] = ("vol-time", rows["s1"])
# R2: k per class chosen on train by p50+p75 pinball
k_by_cls, s2 = {}, rows["s1"].copy()
for cls, g in tr.groupby("cls"):
    best = None
    for k in KGRID:
        f = np.power(g["sig_sofar"].clip(lower=0.05), g["elapsed"] * k)
        sc = g["s1"] * f
        L = 0.0
        for s in SIDES:
            for r in ("p50", "p75"):
                mq = np.quantile(g[s] / sc, TAUS[r])
                L += pinball(g[s].to_numpy(), (mq * sc).to_numpy(), TAUS[r]).mean()
        if best is None or L < best[0]:
            best = (L, k)
    k_by_cls[cls] = float(best[1])
kk = rows["cls"].map(k_by_cls)
models["R2"] = ("vol-time + today so far", rows["s1"] * np.power(rows["sig_sofar"].clip(lower=0.05), rows["elapsed"] * kk))

te = rows[~rows["train"]].copy()
res = {"generated": str(date.today()), "spec": "forge/REMAINING_TRAVEL_PREREG.md", "k_by_class": k_by_cls,
       "share_left": {c: {str(h): round(v, 4) for h, v in d.items()} for c, d in share_left.items()},
       "test": {"rows": int(len(te)), "dates": int(te["date"].nunique()), "instruments": int(te["inst"].nunique())}, "models": {}}
print(f"test {te['date'].min()} -> {te['date'].max()}: {len(te)} checkpoints, {te['date'].nunique()} sessions, {te['inst'].nunique()} instruments")
print("R2 k per class:", k_by_cls)
pin0 = None
for name, (label, scale) in models.items():
    m = fit_multipliers(tr, scale)
    pr = predict(te, scale, m)
    x = te.join(pr)
    cells, worst, table = [], 0.0, []
    for (band, reg), g in x[x["regime"] != "nan"].groupby(["band", "regime"]):
        for s in SIDES:
            for r, t in TAUS.items():
                ex = (g[s] > g[f"{s}_{r}"]).groupby(g["date"]).mean().mean()
                dev = ex - (1 - t)
                cells.append(abs(dev))
                if r != "p50":
                    worst = max(worst, abs(dev))
                table.append({"band": band, "regime": reg, "side": s, "rung": r, "exceed": round(float(ex), 4), "n": int(len(g))})
    miss = float(np.mean(cells) * 100)
    # pinball p50+p75 per instrument, ratio vs R0
    pin = {}
    for inst, g in x.groupby("inst"):
        pin[inst] = sum(pinball(g[s].to_numpy(), g[f"{s}_{r}"].to_numpy(), TAUS[r]).mean() for s in SIDES for r in ("p50", "p75"))
    if name == "R0":
        pin0 = pin
    ratio = float(np.median([pin[i] / pin0[i] for i in pin]))
    passed = miss <= 2.5 and worst <= 0.05
    by_band = x.groupby("band").apply(lambda g: {f"{s}_{r}": round(float((g[s] > g[f"{s}_{r}"]).mean()), 3) for s in SIDES for r in TAUS}).to_dict()
    res["models"][name] = {"label": label, "multipliers": m, "miss90": round(miss, 2), "worst_p75_p90": round(worst * 100, 2),
                           "pinball_vs_R0": round(ratio, 4), "pass": bool(passed), "cells": table, "by_band": by_band}
    print(f"\n{name} {label}: 90-cell miss {miss:.2f}pp, worst p75/p90 cell {worst*100:.1f}pp, pinball vs R0 {ratio:.4f} -> {'PASS' if passed else 'FAIL'}")
    for band in ("01-05", "07-11", "13-15", "17-19", "21"):
        b = by_band[band]
        print(f"   {band}: up p50/75/90 {b['up_p50']:.2f}/{b['up_p75']:.2f}/{b['up_p90']:.2f}   down {b['down_p50']:.2f}/{b['down_p75']:.2f}/{b['down_p90']:.2f}")
    for reg in ("quiet", "normal", "busy"):
        g = x[x["regime"] == reg]
        print(f"   {reg:6}: up p75 {(g['up'] > g['up_p75']).mean():.3f} p90 {(g['up'] > g['up_p90']).mean():.3f}   down p75 {(g['down'] > g['down_p75']).mean():.3f} p90 {(g['down'] > g['down_p90']).mean():.3f}")

passing = [n for n, v in res["models"].items() if v["pass"]]
res["preferred"] = min(passing, key=lambda n: res["models"][n]["pinball_vs_R0"]) if passing else None
print(f"\nVERDICT: passing {passing or 'none'}; preferred {res['preferred']}")
# descriptive: remaining travel by range used so far (does it shrink as the budget is spent?)
te["usedb"] = pd.cut(te["used"], [-1, 0.6, 1.0, 1.4, 99], labels=["<0.6", "0.6-1.0", "1.0-1.4", ">1.4"]).astype(str)
desc = te.groupby(["band", "usedb"])[["up", "down"]].median().round(3)
print("\nMedian remaining travel (σ) by checkpoint band × range used so far (H-L so far in σ):")
print(desc.unstack("usedb").to_string())
res["by_used"] = {f"{b}|{u}": {"up": float(v["up"]), "down": float(v["down"])} for (b, u), v in desc.iterrows()}
Path("analysis/output/remaining_travel_summary.json").write_text(json.dumps(res, indent=1, default=float))
Path("remaining-travel.json").write_text(json.dumps({k: v for k, v in res.items()}, default=float))
