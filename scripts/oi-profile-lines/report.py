#!/usr/bin/env python3
"""oi-profile-lines: results.json (protocol shape), atlas.csv and the page data for OI Lab 2.
    python scripts/oi-profile-lines/report.py <score json> <touches parquet> <outDir>
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

SJ, TP, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)
j = json.loads(SJ.read_text())
MDE = {"S1": 5.5, "S2": 11.0, "S3": 7.7, "S4": 11.0}
BAR = {"S1": 5, "S2": 8, "S3": 5, "S4": 5}
NAME = {"S1": "lines vs placebo, first touch", "S2": "PIN minus BREAKOUT", "S3": "touch 2+ minus touch 1", "S4": "stacked (2+ types) minus single"}
cells = [{"name": f"{k} {NAME[k]}", "n": v["n_real"], "est": v["E_pp"] / 100, "lo": v["ci_pp"][0] / 100, "hi": v["ci_pp"][1] / 100,
          "mde": MDE[k] / 100, "bar": BAR[k] / 100, "p": v["p"], "holm_alpha": v["holm_alpha"], "halves": [h / 100 for h in v["halves_pp"]],
          "verdict": v["verdict"].lower()} for k, v in j["scored"].items()]
res = {"id": "oi-profile-lines", "verdict": "null", "ranAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "seed": j["seed"], "B": j["B"],
       "prereg": "forge/OI_PROFILE_LINES_PREREG.md", "preregCommit": "a6ce5ff4", "branch": "claude/oi-profile-lines",
       "dates": j["dates"], "sessions": j["sessions"], "counts": j["counts"], "cells": cells, "mirror": j["mirror"],
       "sensitivity_pm05": {k: {kk: v[kk] for kk in ("E_pp", "ci_pp")} for k, v in j["sensitivity_pm05"].items()},
       "atlas_bh_passes": j["atlas_bh_passes"], "atlas_chance_baseline": j["atlas_chance_baseline"], "descriptive": j["descriptive"]}
(OUT / "results.json").write_text(json.dumps(res, indent=1))
atlas = pd.DataFrame(j["atlas"])
atlas["ci_lo"] = atlas.ci_pp.map(lambda x: x[0]); atlas["ci_hi"] = atlas.ci_pp.map(lambda x: x[1])
atlas.drop(columns=["ci_pp", "halves_pp"]).to_csv(OUT / "atlas.csv", index=False)

# page data: the owner's questions as plain tables (first-touch bounce % real vs placebo, n), per type x touch, per type x regime, extras
df = pd.read_parquet(TP)
df["types"] = df["types"].str.replace("charm_flip", "vanna_flip")
r = df[df.res.isin(["back", "through"])].copy()
r["y"] = (r.res == "back").astype(float)
TYPES = ["put_wall", "call_wall", "gamma_peak", "zero_gamma", "gex_flip", "max_pain", "vanna_flip", "oi_volume", "short_gamma_node", "long_gamma_node", "exp_hi", "exp_lo"]


def rate(m):
    a, b = r[m & (r.kind == "real")], r[m & (r.kind == "placebo")]
    return {"real": round(100 * a.y.mean(), 1) if len(a) else None, "plc": round(100 * b.y.mean(), 1) if len(b) else None, "n": int(len(a)),
            "mfeBack": round(float(df[m.reindex(df.index, fill_value=False) & (df.kind == "real")].mfe_back60.median()), 3) if len(a) else None}


page = {"generated": res["ranAt"], "dates": j["dates"], "sessions": j["sessions"], "window": "2026-08-20 to 2026-11-23",
        "scored": cells, "mirror": j["mirror"], "atlasBH": j["atlas_bh_passes"], "chance": j["atlas_chance_baseline"],
        "byTypeTouch": {}, "byTypeRegime": {}, "byTypeSide": {}, "conf": {}, "gammaVolume": {}, "hours": {}, "vol": {}, "event": {}}
for t in TYPES:
    has = r.types.str.contains(t)
    page["byTypeTouch"][t] = {o: rate(has & m) for o, m in (("1", r.n == 1), ("2", r.n == 2), ("3+", r.n >= 3))}
    page["byTypeRegime"][t] = {g: rate(has & (r.n == 1) & (r.regime == g)) for g in ("PIN", "BREAKOUT")}
    page["byTypeSide"][t] = {nm: rate(has & (r.n == 1) & (r.side == s)) for nm, s in (("fromBelow", 1), ("fromAbove", -1))}
for c in (1, 2, 3):
    page["conf"][str(c) + ("+" if c == 3 else "")] = rate((r.n == 1) & ((r.conf_types >= 3) if c == 3 else (r.conf_types == c)))
gq = pd.cut(r.gAt.rank(pct=True), [0, 1 / 3, 2 / 3, 1], labels=["low", "mid", "high"], include_lowest=True)
vq = pd.cut(r.vAt.rank(pct=True), [0, 1 / 3, 2 / 3, 1], labels=["low", "mid", "high"], include_lowest=True)
for g in ("low", "mid", "high"):
    page["gammaVolume"][g] = {v: rate((r.n == 1) & (gq == g) & (vq == v)) for v in ("low", "mid", "high")}
for a, b in ((0, 7), (7, 12), (12, 17), (17, 22)):
    page["hours"][f"{a:02d}-{b:02d}"] = rate((r.n == 1) & (r.ldn_hour >= a) & (r.ldn_hour < b))
vp = pd.to_numeric(r.vol_pct, errors="coerce")
for nm, m in (("low", vp < 33.3), ("mid", (vp >= 33.3) & (vp < 66.7)), ("high", vp >= 66.7)):
    page["vol"][nm] = rate((r.n == 1) & m)
ev = r.news.notna() & (r.news.astype(str) != "None")
page["event"] = {"yes": rate((r.n == 1) & ev), "no": rate((r.n == 1) & ~ev)}
page["candidate"] = {"cell": "gamma_peak on PIN days, first touch", **next(a for a in j["atlas"] if a["cell"] == "type=gamma_peak|regime=PIN")}
(OUT / "page.json").write_text(json.dumps(page, indent=1, default=float))
print("wrote", [p.name for p in OUT.iterdir()])
