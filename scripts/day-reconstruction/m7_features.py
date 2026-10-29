"""Day reconstruction, milestone 7, stage 1: eligibility, race distances, condition levels and cell counts. NO OUTCOMES.

Reads only what is known at the close of each first-touch bar k: the touch's level/family/rung/side/k, the day's open,
rungs and sigma scale, the running extremes through bar k-1 (archive run_hi_before/run_lo_before), the CLOSE of bar k
(E), the touch-bar clock time, range used before the touch and M5's frozen P1/P2 terciles and exclusions. No path bar after
k is read; no next_* / cont_* / rev_* / close / return column is loaded. Rules: forge/DAY_RECON_PATH_BOOK_DECISION_RULES.md.

    python scripts/day-reconstruction/m7_features.py
Env M7_DATA = checkout holding the gitignored inputs (archive/*_path.parquet, m3/*_phantom_outcomes.parquet).
"""
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("M7_DATA", ROOT))
ARC_GIT = ROOT / "analysis/output/day-reconstruction/archive"
ARC_DATA = DATA / "analysis/output/day-reconstruction/archive"
M3_DATA = DATA / "analysis/output/day-reconstruction/m3"
M5 = ROOT / "analysis/output/day-reconstruction/m5"
OUT = Path(os.environ.get("M7_OUT", ROOT / "analysis/output/day-reconstruction/m7"))
OUT.mkdir(parents=True, exist_ok=True)

NAMES = ["GOLD", "NQ", "EURUSD"]
FAMS = {"OH": ("Fixed", 1), "OL": ("Fixed", -1), "ProjH": ("Projected", 1), "ProjL": ("Projected", -1)}
PCT = {"OH": "oh_{}_pct", "OL": "ol_{}_pct", "ProjH": "hl_{}", "ProjL": "hl_{}"}
NEXT = {"p50": "p75", "p75": "p90"}
FACTORS = (1.0, 0.70, 0.85, 1.15, 1.30)
WINDOWS = [(0, 8, "00:00-08:00"), (8, 13.5, "08:00-13:30"), (13.5, 17, "13:30-17:00"), (17, 24, "17:00-22:00")]
# pre-touch / at-touch columns only
KEEP = ["instrument", "date", "era", "tag_status", "factor", "open", "scale", "level", "family", "rung", "side", "k", "t",
        "level_price", "run_hi_before", "run_lo_before", "hl_before_pct"]
PIT_YEARS = np.array([f"{y}-08-21" for y in range(2020, 2027)])


def load(name):
    real = pd.read_parquet(ARC_GIT / f"{name}_touches.parquet", columns=[c for c in KEEP if c != "factor"])
    real["factor"] = 1.0
    ph = pd.read_parquet(M3_DATA / f"{name}_phantom_outcomes.parquet", columns=KEEP)
    t = pd.concat([real[KEEP], ph[KEEP]], ignore_index=True)
    t = t[t.family.isin(FAMS) & t.rung.isin(["p50", "p75"])].copy()
    t["date"] = t.date.astype(str)
    t["fkey"] = t.factor.round(2)
    feat = pd.read_parquet(M5 / "features.parquet", columns=["instrument", "date", "level", "factor", "excluded", "p1_tercile", "p2_tercile"])
    feat = feat[feat.instrument == name].drop(columns="instrument")
    feat["date"] = feat.date.astype(str)
    feat["fkey"] = feat.factor.round(2)
    t = t.merge(feat.drop(columns="factor"), on=["date", "level", "fkey"], how="left", validate="one_to_one")
    assert t.excluded.notna().all()
    days = pd.read_parquet(ARC_GIT / f"{name}_days.parquet")
    days["date"] = days.date.astype(str)
    d = days.set_index("date")
    path = pd.read_parquet(ARC_DATA / f"{name}_path.parquet", columns=["date", "i", "close"])
    path["date"] = path.date.astype(str)
    close_at = {dt: g.close.to_numpy() for dt, g in path.groupby("date")}
    # E = close of the touch bar k (float32 as the archive loaded it)
    t["E"] = [float(np.float32(close_at[dt][int(k)])) for dt, k in zip(t.date, t.k)]
    s = t.family.map(lambda x: FAMS[x][1]).to_numpy()
    t["s"] = s
    t["group"] = t.family.map(lambda x: FAMS[x][0])
    pct = lambda fam, ru: np.array([d.at[dt, PCT[f].format(r)] for dt, f, r in zip(t.date, fam, ru)])
    nxt = pct(t.family, t.rung.map(NEXT)) * t.factor / 100
    prev = np.where(t.rung == "p75", pct(t.family, pd.Series(["p50"] * len(t), index=t.index)) * t.factor / 100, np.nan)
    fixed = t.family.isin(["OH", "OL"]).to_numpy()
    # N and P frozen at the touch bar: fixed = open x (1 +- pct); projected = running opposite extreme through k-1 x (1 +- pct)
    base = np.where(fixed, t.open, np.where(t.family == "ProjH", t.run_lo_before, t.run_hi_before))
    t["N"] = base * (1 + s * nxt)
    t["P"] = np.where(t.rung == "p50", t.open, base * (1 + s * prev))
    t["a"] = s * (t.N - t.E) / t.scale
    t["b"] = -s * (t.P - t.E) / t.scale
    clk = pd.to_datetime(t.t, unit="s", utc=True).dt.tz_convert("Europe/London")
    h = (clk.dt.hour + clk.dt.minute / 60).to_numpy()
    t["window"] = np.select([(h >= a_) & (h < b_) for a_, b_, _ in WINDOWS], [w for _, _, w in WINDOWS], "")
    t["u"] = t.hl_before_pct / t.date.map(d.hl_p50)
    t["yr"] = np.where(t.era == "oos_pit", np.searchsorted(PIT_YEARS, t.date.to_numpy(), side="right"), 0)
    # eligibility (R1, R1-x, D1)
    t["elig_reason"] = np.select([t.excluded != "", t.a <= 0, t.b <= 0], [t.excluded, "a<=0", "b<=0"], "")
    t["elig_share"] = t.elig_reason == ""
    t["elig_ev"] = t.elig_share & (t.a >= 0.10) & (t.b >= 0.10)
    return t


def ru_terciles(t):
    """Range-used tercile boundaries, fixed levels only: per instrument x rung x line set, from point-in-time
    expectancy-eligible touches (features only)."""
    b = {}
    g = t[(t.group == "Fixed") & (t.era == "oos_pit") & t.elig_ev]
    for (inst, ru, f), x in g.groupby(["instrument", "rung", "fkey"]):
        b[f"{inst}|{ru}|{f}"] = [float(x.u.quantile(1 / 3)), float(x.u.quantile(2 / 3))]
    return b


def assign_ru(t, b):
    out = []
    for inst, grp, ru, f, u in zip(t.instrument, t.group, t.rung, t.fkey, t.u):
        if grp != "Fixed":
            out.append(""); continue
        lo, hi = b[f"{inst}|{ru}|{f}"]
        out.append("bottom" if u <= lo else ("top" if u > hi else "middle"))
    t["ru_tercile"] = out
    return t


def inventory(t):
    pit = t[t.era == "oos_pit"]
    rows = []
    for (inst, grp, ru), g in pit.groupby(["instrument", "group", "rung"]):
        conds = [("all", np.ones(len(g), bool))]
        conds += [(f"window {w}", (g.window == w).to_numpy()) for _, _, w in WINDOWS]
        if grp == "Fixed":
            conds += [(f"range used {q}", (g.ru_tercile == q).to_numpy()) for q in ("bottom", "middle", "top")]
        conds += [(f"P1 {q}", (g.p1_tercile == q).to_numpy()) for q in ("bottom", "middle", "top")]
        conds += [(f"P2 {q}", (g.p2_tercile == q).to_numpy()) for q in ("bottom", "middle", "top")]
        for cname, m in conds:
            r = {"instrument": inst, "family": grp, "rung": ru, "condition": cname}
            for f in FACTORS:
                mf = m & np.isclose(g.factor, f)
                r[f"n_ev_{f}"] = int((mf & g.elig_ev.to_numpy()).sum())
            r["n_share_fc"] = int((m & np.isclose(g.factor, 1.0) & g.elig_share.to_numpy()).sum())
            r["in_family"] = r["n_ev_1.0"] >= 150
            rows.append(r)
    return pd.DataFrame(rows)


if __name__ == "__main__":
    t = pd.concat([load(n) for n in NAMES], ignore_index=True)
    b = ru_terciles(t)
    t = assign_ru(t, b)
    inv = inventory(t)
    fc = t[np.isclose(t.factor, 1.0)]
    excl = fc.groupby(["instrument", "era", "group", "rung", "elig_reason"]).size()
    d1 = fc[fc.elig_share].groupby(["instrument", "era", "group", "rung"]).apply(lambda x: int((~x.elig_ev).sum()))
    meta = {"exclusions_forecast": {"|".join(map(str, k)): int(v) for k, v in excl.items()},
            "d1_excluded_forecast": {"|".join(map(str, k)): int(v) for k, v in d1.items()},
            "a_b_median_forecast_pit": {f"{i}|{g}|{r}": [round(float(x.a.median()), 3), round(float(x.b.median()), 3)]
                                        for (i, g, r), x in fc[(fc.era == "oos_pit") & fc.elig_ev].groupby(["instrument", "group", "rung"])},
            "touches_per_session_ev_pit": {f"{i}|{g}|{r}": round(len(x) / 1550, 3)
                                           for (i, g, r), x in fc[(fc.era == "oos_pit") & fc.elig_ev].groupby(["instrument", "group", "rung"])},
            "t2_cells": int(len(inv)), "t2_cells_in_family": int(inv.in_family.sum())}
    (OUT / "range_used_terciles.json").write_text(json.dumps(b, indent=1))
    (OUT / "stage1_meta.json").write_text(json.dumps(meta, indent=1))
    inv.to_csv(OUT / "cell_inventory.csv", index=False)
    cols = ["instrument", "date", "era", "yr", "tag_status", "factor", "level", "family", "group", "rung", "side", "k", "t",
            "E", "N", "P", "a", "b", "window", "u", "ru_tercile", "p1_tercile", "p2_tercile", "elig_reason", "elig_share", "elig_ev"]
    t[cols].to_parquet(OUT / "features.parquet", index=False)
    print(json.dumps({k: meta[k] for k in ("t2_cells", "t2_cells_in_family")}))
