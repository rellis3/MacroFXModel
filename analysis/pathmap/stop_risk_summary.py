"""Layer 7 — STOP RISK MAP summary (forge/STOP_RISK_PREREG.md).

Reads analysis/output/stop_risk/*.csv (scripts/pathmap/stop_risk_build.mjs). Per stop distance (× HAR σ) and by
condition: P(hit within 24 trading hours), P(gap-through | hit), mean / p99 / worst loss in R given a hit, expected
excess loss beyond 1R, and the pre-registered MATERIAL flag (p99 ≥ 1.25R or excess ≥ 0.05R, with ≥ 200 hits).
    python analysis/pathmap/stop_risk_summary.py
"""
import glob
import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

df = pd.concat([pd.read_csv(f) for f in glob.glob("analysis/output/stop_risk/*.csv")], ignore_index=True)
hits = df[df["hit"] == 1].copy()
hits["release_min"] = np.where(hits["hitMin"].isin([0, 1, 2, 3, 4, 30, 31, 32, 33, 34]), "on :00/:30 (+4 min)", "other minutes")
hits["weekend"] = np.where(hits["wknd"] == 1, "crossed a weekend", "within the week")
hits["xsess_b"] = np.where(hits["xsess"] == 1, "next session", "same session")
COND = {"cls": "class", "weekend": "weekend", "xsess_b": "hit in", "event": "event day", "release_min": "hit minute"}


def stats(g: pd.DataFrame, n_all: int) -> dict:
    lr = g["lossR"].to_numpy()
    p99 = float(np.quantile(lr, 0.99)) if len(lr) else None
    exc = float(lr.mean() - 1) if len(lr) else None
    return {"hits": int(len(g)), "p_hit": round(len(g) / n_all, 4) if n_all else None, "p_gap": round(float(g["gap"].mean()), 4),
            "mean": round(float(lr.mean()), 4), "p99": round(p99, 3), "worst": round(float(lr.max()), 3),
            "excess": round(exc, 4), "material": bool(len(g) >= 200 and (p99 >= 1.25 or exc >= 0.05))}


res = {"generated": str(date.today()), "spec": "forge/STOP_RISK_PREREG.md", "records": int(len(df)), "hits": int(len(hits)),
       "instruments": int(df["inst"].nunique()), "by_d": {}, "cells": []}
print(f"{len(df):,} stop records, {len(hits):,} hits, {df['inst'].nunique()} instruments\n")
print(f"{'stop d×σ':>9} {'P(hit)':>7} {'P(gap|hit)':>10} {'mean R':>7} {'p99 R':>6} {'worst R':>7} {'excess':>7}")
for d, g in hits.groupby("d"):
    s = stats(g, int((df["d"] == d).sum()))
    res["by_d"][str(d)] = s
    print(f"{d:9.2f} {s['p_hit']:7.3f} {s['p_gap']:10.3f} {s['mean']:7.3f} {s['p99']:6.2f} {s['worst']:7.2f} {s['excess']:+7.3f}{'  MATERIAL' if s['material'] else ''}")
for col, label in COND.items():
    print(f"\nby {label}:")
    for d in sorted(hits["d"].unique()):
        for b, g in hits[hits["d"] == d].groupby(col):
            s = stats(g, 0)
            res["cells"].append({"d": float(d), "var": label, "bucket": str(b), **s})
            if d in (0.5, 1.0, 2.0):
                print(f"   d {d:4.2f} {str(b):22} hits {s['hits']:7,}  gap {s['p_gap']:.3f}  mean {s['mean']:.3f}  p99 {s['p99']:.2f}  worst {s['worst']:.2f}{'  MATERIAL' if s['material'] else ''}")
mat = [c for c in res["cells"] if c["material"]]
print(f"\n{len(mat)} of {len(res['cells'])} condition cells are MATERIAL:")
for c in sorted(mat, key=lambda c: -c["p99"]):
    print(f"   d {c['d']:4.2f} {c['var']:10} {c['bucket']:22} hits {c['hits']:6,}  gap {c['p_gap']:.3f}  p99 {c['p99']:.2f}  excess {c['excess']:+.3f}  worst {c['worst']:.2f}")
Path("stop-risk.json").write_text(json.dumps(res, indent=1))
