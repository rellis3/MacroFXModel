"""Layer 4 — PATH MAP summary (forge/PATH_MAP_SPEC.md).

Reads analysis/output/path_map/*.csv (scripts/pathmap/path_map_build.mjs). For every rung x condition cell: events,
dates, continuation share among resolved races with a date-clustered SE, the random-walk null b/(a+b), next / back /
held / unresolved rates, minutes to resolve; split into halves (2016-2020, 2021-2026) and flagged a DYNAMIC only by
the pre-registered rule. Writes path-map.json (read by path-map.html) and prints the dynamics.
    python analysis/pathmap/path_map_summary.py
"""
import glob
import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path("path-map.json")   # served next to path-map.html (/data/ is gitignored)
HALF = "2021-01-01"
MIN_TWO_WAY = 300

df = pd.concat([pd.read_csv(f) for f in glob.glob("analysis/output/path_map/*.csv")], ignore_index=True)
df["hourb"] = pd.cut(df["hour"], [-1, 6, 11, 15, 19, 23], labels=["00-07 Asia", "07-12 London", "12-16 overlap", "16-20 NY", "20-24 late"]).astype(str)
df["regime"] = pd.cut(df["sigRel"], [0, 0.85, 1.15, 99], labels=["quiet", "normal", "busy"]).astype(str)
df.loc[df["sigRel"].isna(), "regime"] = "nan"
df["usedb"] = pd.cut(df["used"], [-1, 0.8, 1.2, 99], labels=["<0.8", "0.8-1.2", ">1.2"]).astype(str)
df["otherb"] = np.where(df["other"] == 1, "yes", "no")
df["eventb"] = df["event"]
df["half"] = np.where(df["date"] < HALF, "H1", "H2")
df["c"] = (df["race"] == "cont").astype(float)
df["res"] = df["race"].isin(["cont", "fade"]).astype(float)
# Amendment 1 (variant 2): distances from the touch bar's close, where the race actually starts. VARIANT=1 reproduces
# the original line-start null for the record.
import os
V1 = os.environ.get("VARIANT") == "1"
A, B = ("a", "b") if V1 or "a2" not in df else ("a2", "b2")
df["nul"] = (df[B] / (df[A] + df[B])) * df["res"]
VARS = {"hourb": "London hour", "regime": "regime (σ vs its norm)", "eventb": "event day", "usedb": "range used",
        "otherb": "other side touched", "cls": "class"}
EXCLUDE = {"regime": {"nan"}, "eventb": {"unknown"}}


def cell(g: pd.DataFrame) -> dict:
    d = g.groupby("date")[["c", "res", "nul"]].sum()
    R = d["res"].sum()
    if R < 30:
        return None
    share, null = d["c"].sum() / R, d["nul"].sum() / R
    D = len(d)
    se = float(np.sqrt(((d["c"] - share * d["res"]) ** 2).sum() * D / max(D - 1, 1)) / R)
    return {"n": int(len(g)), "dates": int(D), "resolved": int(R), "cont": round(float(share), 4), "null": round(float(null), 4),
            "se": round(se, 4), "next": round(float(g["next"].mean()), 4), "back": round(float(g["back"].mean()), 4),
            "held": round(float(g["held"].mean()), 4), "unresolved": round(float((g["race"] == "none").mean()), 4),
            "mins": float(g.loc[g["res"] == 1, "mins"].median()) if R else None}


def with_halves(g: pd.DataFrame, pooled: dict) -> dict:
    c = cell(g)
    if not c:
        return None
    c["z_null"] = round((c["cont"] - c["null"]) / c["se"], 2) if c["se"] > 0 else 0.0
    halves, dyn = {}, True
    for h, gh in g.groupby("half"):
        ch = cell(gh)
        if not ch or ch["se"] == 0:
            dyn = False
            continue
        zn = (ch["cont"] - ch["null"]) / ch["se"]
        zp = (ch["cont"] - pooled[h]) / ch["se"]
        halves[h] = {"cont": ch["cont"], "null": ch["null"], "se": ch["se"], "z_null": round(zn, 2), "z_pooled": round(zp, 2), "n": ch["n"]}
        dyn &= abs(zn) > 2 and abs(zp) > 2
    if len(halves) < 2:
        dyn = False
    else:
        signs = {np.sign(v["z_null"]) for v in halves.values()} | {np.sign(v["z_pooled"]) for v in halves.values()}
        dyn &= len(signs) == 1
    c["halves"] = halves
    c["dynamic"] = bool(dyn)
    c["direction"] = ("continuation" if c["cont"] > c["null"] else "fade") if dyn else None
    return c


res = {"generated": str(date.today()), "variant": 1 if A == "a" else 2, "spec": "forge/PATH_MAP_SPEC.md", "events": int(len(df)), "dates": int(df["date"].nunique()),
       "instruments": int(df["inst"].nunique()), "span": [df["date"].min(), df["date"].max()], "rungs": {}, "oneway": [], "twoway": []}
pooled_h = {}
for rung, g in df.groupby("rung"):
    pooled_h[rung] = {h: cell(gh)["cont"] for h, gh in g.groupby("half")}
    res["rungs"][rung] = with_halves(g, pooled_h[rung])
cells = 0
for rung, g in df.groupby("rung"):
    for v, label in VARS.items():
        for b, gb in g.groupby(v):
            if b in EXCLUDE.get(v, ()):
                continue
            c = with_halves(gb, pooled_h[rung]); cells += 1
            if c:
                res["oneway"].append({"rung": rung, "var": label, "bucket": b, **c})
    for v1, v2 in (("hourb", "regime"), ("hourb", "usedb"), ("regime", "usedb"), ("hourb", "otherb")):
        for (b1, b2), gb in g.groupby([v1, v2]):
            if b1 in EXCLUDE.get(v1, ()) or b2 in EXCLUDE.get(v2, ()) or len(gb) < MIN_TWO_WAY:
                continue
            c = with_halves(gb, pooled_h[rung]); cells += 1
            if c:
                res["twoway"].append({"rung": rung, "var": f"{VARS[v1]} × {VARS[v2]}", "bucket": f"{b1} · {b2}", **c})
res["cells_examined"] = cells
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(res, indent=1, default=float))

print(f"{res['events']} touches, {res['dates']} sessions, {res['instruments']} instruments, {res['span']}")
for r, c in res["rungs"].items():
    print(f"  {r}: n={c['n']} cont {c['cont']:.3f} vs null {c['null']:.3f} (z {c['z_null']:+.1f})  next {c['next']:.2f} back {c['back']:.2f} held {c['held']:.2f} unresolved {c['unresolved']:.2f}")
dyn = [x for x in res["oneway"] + res["twoway"] if x["dynamic"]]
print(f"\n{cells} cells examined; {len(dyn)} pass the dynamic rule:")
for x in sorted(dyn, key=lambda x: -abs(x["cont"] - x["null"])):
    print(f"  {x['rung']} {x['var']:38} {x['bucket']:28} cont {x['cont']:.3f} null {x['null']:.3f} "
          f"H1 {x['halves']['H1']['cont']:.3f} H2 {x['halves']['H2']['cont']:.3f}  n={x['n']}  -> {x['direction']}")
print("\nOne-way, every cell (cont − null, pp):")
for x in res["oneway"]:
    print(f"  {x['rung']} {x['var']:24} {x['bucket']:16} {100*(x['cont']-x['null']):+5.1f}  (z {x['z_null']:+.1f}, n {x['n']})  "
          f"next {x['next']:.2f} back {x['back']:.2f} held {x['held']:.2f}{'  DYNAMIC' if x['dynamic'] else ''}")
