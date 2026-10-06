"""Layer 4 — PATH MAP summary (forge/PATH_MAP_SPEC.md, variant 3 / Amendment 2).

Reads analysis/output/path_map/*.csv (scripts/pathmap/path_map_build.mjs): real HAR-line touches and placebo-ladder
touches raced by the same code. For every rung x condition cell: continuation share among resolved races for the
real lines and for the placebo lines, their difference with a date-clustered SE, the random-walk null b/(a+b) from the
touch-bar close (reported), next / back / held / unresolved rates; split into halves (2016-2020, 2021-2026). A
DYNAMIC = real differs from placebo by > 2 SE of the difference, same sign, in both halves.
Writes path-map.json (read by path-map.html).
    python analysis/pathmap/path_map_summary.py
"""
import glob
import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from forge.run_combined_range import asof_before, cboe

OUT = Path("path-map.json")   # served next to path-map.html (/data/ is gitignored)
HALF = "2021-01-01"
MIN_TWO_WAY = 300
IVFILE = {"EURUSD": "eur_usd", "GBPUSD": "gbp_usd", "AUDUSD": "aud_usd", "USDJPY": "usd_jpy", "USDCAD": "usd_cad", "USDCHF": "usd_chf"}
CBOE = {"GOLD": "GVZ", "NQ": "VXN", "SPX500": "VIX", "US30": "VIX", "US2000": "VIX"}

df = pd.concat([pd.read_csv(f) for f in glob.glob("analysis/output/path_map/*.csv")], ignore_index=True)
df["dt"] = pd.to_datetime(df["date"])

# IV ÷ σ (IV = last value strictly before the session)
df["ivr"] = np.nan
cb = {s: cboe(s) for s in set(CBOE.values())}
for inst, g in df.groupby("inst"):
    if inst in IVFILE:
        t = pd.read_parquet(f"oi_research_book/data/iv_daily_{IVFILE[inst]}.parquet")
        s = pd.Series(t["iv30"].astype(float).to_numpy() * 100, index=pd.to_datetime(t["date"])).sort_index()
    elif inst in CBOE:
        s = cb[CBOE[inst]]
    else:
        continue
    iv = asof_before(pd.DatetimeIndex(g["dt"]), s.dropna())
    df.loc[g.index, "ivr"] = iv / np.sqrt(252) / g["sig"].to_numpy()

real = df["kind"] == "real"
df["hourb"] = pd.cut(df["hour"], [-1, 6, 11, 15, 19, 23], labels=["00-07 Asia", "07-12 London", "12-16 overlap", "16-20 NY", "20-24 late"]).astype(str)
df["regime"] = pd.cut(df["sigRel"], [0, 0.85, 1.15, 99], labels=["quiet", "normal", "busy"]).astype(str)
df.loc[df["sigRel"].isna(), "regime"] = "nan"
df["usedb"] = pd.cut(df["used"], [-1, 0.8, 1.2, 99], labels=["<0.8", "0.8-1.2", ">1.2"]).astype(str)
df["otherb"] = np.where(df["other"] == 1, "yes", "no")
df["eventb"] = df["event"]
q = df.loc[real, "approach"].quantile([1 / 3, 2 / 3]).to_numpy()            # tercile edges from REAL touches
df["approachb"] = pd.cut(df["approach"], [-1, q[0], q[1], 1e9], labels=["slow", "mid", "fast"]).astype(str)
df["prevb"] = df["prevlvl"].map({1: "on prior-day level", 0: "not"}).fillna("nan")
qi = df.loc[real & df["ivr"].notna(), "ivr"].quantile([1 / 3, 2 / 3]).to_numpy()
df["ivrb"] = pd.cut(df["ivr"], [0, qi[0], qi[1], 1e9], labels=["IV cheap", "IV fair", "IV rich"]).astype(str)
df["half"] = np.where(df["date"] < HALF, "H1", "H2")
df["c"] = (df["race"] == "cont").astype(float)
df["res"] = df["race"].isin(["cont", "fade"]).astype(float)
df["nul"] = (df["b2"] / (df["a2"] + df["b2"])) * df["res"]
VARS = {"hourb": "London hour", "regime": "regime (σ vs its norm)", "eventb": "event day", "usedb": "range used",
        "otherb": "other side touched", "cls": "class", "approachb": "approach speed (30 min)",
        "prevb": "prior-day high/low", "ivrb": "implied vol ÷ σ"}
for _v in VARS:
    df[_v] = df[_v].astype(object).where(df[_v].notna(), "nan").map(str)
EXCLUDE = {"regime": {"nan"}, "eventb": {"unknown"}, "prevb": {"nan"}, "ivrb": {"nan"}}
TWO_WAY = (("hourb", "regime"), ("hourb", "usedb"), ("regime", "usedb"), ("hourb", "otherb"),
           ("hourb", "approachb"), ("hourb", "prevb"), ("hourb", "ivrb"))
R, P = df[real], df[~real]


def cell(g: pd.DataFrame):
    d = g.groupby("date")[["c", "res", "nul"]].sum()
    Rn = d["res"].sum()
    if Rn < 30:
        return None
    share = d["c"].sum() / Rn
    D = len(d)
    se = float(np.sqrt(((d["c"] - share * d["res"]) ** 2).sum() * D / max(D - 1, 1)) / Rn)
    return {"n": int(len(g)), "dates": int(D), "resolved": int(Rn), "cont": float(share), "se": se,
            "null": float(d["nul"].sum() / Rn), "next": float(g["next"].mean()), "back": float(g["back"].mean()),
            "held": float(g["held"].mean()), "unresolved": float((g["race"] == "none").mean()),
            "mins": float(g.loc[g["res"] == 1, "mins"].median())}


def compare(mask_r, mask_p) -> dict:
    gr, gp = R[mask_r], P[mask_p]
    cr, cp = cell(gr), cell(gp)
    if not cr or not cp:
        return None
    out = {k: round(v, 4) if isinstance(v, float) else v for k, v in cr.items()}
    out["placebo"] = round(cp["cont"], 4)
    out["diff"] = round(cr["cont"] - cp["cont"], 4)
    out["se_diff"] = round(float(np.hypot(cr["se"], cp["se"])), 4)
    out["z"] = round(out["diff"] / out["se_diff"], 2) if out["se_diff"] > 0 else 0.0
    halves, dyn = {}, True
    for h in ("H1", "H2"):
        hr, hp = cell(gr[gr["half"] == h]), cell(gp[gp["half"] == h])
        if not hr or not hp:
            dyn = False
            continue
        z = (hr["cont"] - hp["cont"]) / float(np.hypot(hr["se"], hp["se"]))
        halves[h] = {"cont": round(hr["cont"], 4), "placebo": round(hp["cont"], 4), "z": round(z, 2), "n": hr["n"]}
        dyn &= abs(z) > 2
    if len(halves) == 2:
        dyn &= np.sign(halves["H1"]["z"]) == np.sign(halves["H2"]["z"])
    else:
        dyn = False
    out["halves"], out["dynamic"] = halves, bool(dyn)
    out["direction"] = ("continuation" if out["diff"] > 0 else "fade") if dyn else None
    return out


res = {"generated": str(date.today()), "spec": "forge/PATH_MAP_SPEC.md", "variant": 3,
       "events": int(len(R)), "placebo_events": int(len(P)), "dates": int(R["date"].nunique()),
       "instruments": int(R["inst"].nunique()), "span": [R["date"].min(), R["date"].max()], "rungs": {}, "oneway": [], "twoway": []}
for rung in ("p50", "p75", "p90"):
    res["rungs"][rung] = compare(R["rung"] == rung, P["rung"] == rung)
cells = 0
for rung in ("p50", "p75", "p90"):
    for v, label in VARS.items():
        for b in sorted(R[v].unique()):
            if b in EXCLUDE.get(v, ()):
                continue
            c = compare((R["rung"] == rung) & (R[v] == b), (P["rung"] == rung) & (P[v] == b)); cells += 1
            if c:
                res["oneway"].append({"rung": rung, "var": label, "bucket": b, **c})
    for v1, v2 in TWO_WAY:
        for (b1, b2), gb in R[R["rung"] == rung].groupby([v1, v2]):
            if b1 in EXCLUDE.get(v1, ()) or b2 in EXCLUDE.get(v2, ()) or len(gb) < MIN_TWO_WAY:
                continue
            c = compare((R["rung"] == rung) & (R[v1] == b1) & (R[v2] == b2), (P["rung"] == rung) & (P[v1] == b1) & (P[v2] == b2)); cells += 1
            if c:
                res["twoway"].append({"rung": rung, "var": f"{VARS[v1]} × {VARS[v2]}", "bucket": f"{b1} · {b2}", **c})
res["cells_examined"] = cells
OUT.write_text(json.dumps(res, indent=1, default=float))

print(f"{res['events']} real touches + {res['placebo_events']} placebo, {res['dates']} sessions, {res['instruments']} instruments, {res['span']}")
for r, c in res["rungs"].items():
    print(f"  {r}: real {c['cont']:.3f}  placebo {c['placebo']:.3f}  diff {100*c['diff']:+.1f}pp (z {c['z']:+.1f})  rw-null {c['null']:.3f}  held {c['held']:.2f}")
dyn = [x for x in res["oneway"] + res["twoway"] if x["dynamic"]]
print(f"\n{cells} cells examined; {len(dyn)} pass the dynamic rule (real vs placebo, both halves):")
for x in sorted(dyn, key=lambda x: -abs(x["diff"])):
    print(f"  {x['rung']} {x['var']:42} {x['bucket']:30} real {x['cont']:.3f} placebo {x['placebo']:.3f} "
          f"H1 z {x['halves']['H1']['z']:+.1f} H2 z {x['halves']['H2']['z']:+.1f} n={x['n']} -> {x['direction']}")
print("\nOne-way, every cell (real − placebo, pp):")
for x in res["oneway"]:
    print(f"  {x['rung']} {x['var']:26} {x['bucket']:20} {100*x['diff']:+5.1f} (z {x['z']:+.1f}, n {x['n']})  "
          f"held {x['held']:.2f}{'  DYNAMIC' if x['dynamic'] else ''}")
