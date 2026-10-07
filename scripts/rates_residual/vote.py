"""S6 direction vote at C.OG's lines (forge/DIRECTION_VOTE_PREREG.md). Needs study.py's line_trades_gap.csv.

    python scripts/rates_residual/vote.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path("analysis/output/rates_residual")
B, SEED, HALF = 2000, 20261009, "2022-05-01"
rng = np.random.default_rng(SEED)

T = pd.read_csv(OUT / "line_trades_gap.csv")
# T20 per (ins, date), from the setups study (computed on London closes before the day)
S = pd.read_csv("analysis/output/cog_setups/trades.csv")[["ins", "date", "t20"]].drop_duplicates(["ins", "date"])
T = T.merge(S, on=["ins", "date"], how="left")

# yield book (EURUSD open trade over the session)
YS = [t for t in json.load(open("analysis/output/meta_label_ys/ys_run.json"))["combined"]["trades"] if t["pair"] == "EURUSD"]
def ys_bias(d):
    for t in YS:
        if t["date"] < d <= t["exitDate"]: return 1 if t["dir"] == "LONG" else -1
    return 0

# US-DE 2y 63-obs change (2-business-day lag); widening -> short EURUSD
us = pd.read_csv("analysis/output/cog_yield_dir/fred/DGS2.csv"); us.columns = ["date", "v"]; us["v"] = pd.to_numeric(us.v, errors="coerce")
de = pd.read_csv("analysis/output/policy_direction/DE2Y.csv")
sp = us.dropna().merge(de.dropna(), on="date").assign(s=lambda x: x.v - x.value).set_index("date").s.sort_index()
chg, sidx = sp.diff(63), sp.index.to_numpy()
def mom(d):
    j = np.searchsorted(sidx, (pd.Timestamp(d) - pd.offsets.BDay(2)).strftime("%Y-%m-%d"), side="right") - 1
    v = chg.iloc[j] if j >= 0 else np.nan
    return 0 if not np.isfinite(v) or v == 0 else -int(np.sign(v))      # side that agrees

# FOMC D+1..D+5 -> short side agrees
ev = sorted(pd.read_csv("analysis/fomc_event_study/stage1_events.csv").date.tolist() + ["2026-06-17", "2026-07-29"])
bd = pd.bdate_range("2015-12-01", "2026-12-31").strftime("%Y-%m-%d").tolist()
fomc = {d for e in ev if e in bd for d in bd[bd.index(e) + 1:bd.index(e) + 6]}

def comp(row):
    v = []
    v.append(row.t20 if pd.notna(row.t20) else 0)
    if row.ins == "EURUSD":
        v.append(ys_bias(row.date)); v.append(mom(row.date))
    if row.ins in ("EURUSD", "GOLD"):
        v.append(-1 if row.date in fomc else 0)
    return v

T["agree_nogap"] = [sum(int(s == row.side) - int(s == -row.side) for s in comp(row)) for row in T.itertuples()]
g = np.where(T.gap.abs() > 0.5, np.sign(T.gap), 0)
T["v"] = T.agree_nogap + np.where(g == 0, 0, np.where(g == T.side, 1, -1))
T["month"] = T.date.str[:7]


def boot(a, b=None):
    ms = sorted(set(a.month) | (set(b.month) if b is not None else set()))
    ga = {m: x.R.to_numpy() for m, x in a.groupby("month")}; gb = {m: x.R.to_numpy() for m, x in b.groupby("month")} if b is not None else None
    reps = []
    for _ in range(B):
        pick = rng.choice(ms, len(ms))
        x = np.concatenate([ga.get(m, np.empty(0)) for m in pick]); val = x.mean()
        if gb is not None: val -= np.concatenate([gb.get(m, np.empty(0)) for m in pick]).mean()
        reps.append(val)
    pt = a.R.mean() - (b.R.mean() if b is not None else 0)
    return [round(float(pt), 4), *np.round(np.nanpercentile(reps, [2.5, 97.5]), 4).tolist()]


P = T[T.gap.notna() & (T.date >= "2018-02-01")]
K = P[P.v >= 2]
res = {"n_all": int(len(P)), "keep": boot(K), "n_keep": int(len(K)), "keep_minus_all": boot(K, P),
       "halves": [round(float(K[K.date < HALF].R.mean()), 4), round(float(K[K.date >= HALF].R.mean()), 4)],
       "ladder": {lab: [round(float(x.R.mean()), 4), int(len(x))] for lab, x in
                  (("v>=2", P[P.v >= 2]), ("v=1", P[P.v == 1]), ("v=0", P[P.v == 0]), ("v=-1", P[P.v == -1]), ("v<=-2", P[P.v <= -2]))},
       "by_setup_ins": {f"{s}|{i}": [round(float(x.R.mean()), 4), int(len(x))] for (s, i), x in K.groupby(["setup", "ins"])}}
Q = T[T.date >= "2016-10-04"]
res["nogap_2016"] = {lab: [round(float(x.R.mean()), 4), int(len(x))] for lab, x in
                     (("v>=2", Q[Q.agree_nogap >= 2]), ("v=1", Q[Q.agree_nogap == 1]), ("v=0", Q[Q.agree_nogap == 0]),
                      ("v=-1", Q[Q.agree_nogap == -1]), ("v<=-2", Q[Q.agree_nogap <= -2]))}
res["pass"] = bool(res["keep"][1] > 0 and res["keep_minus_all"][1] > 0 and min(res["halves"]) > 0)
(OUT / "vote_results.json").write_text(json.dumps(res, indent=1))
f = lambda c: f"{c[0]:+.4f} [{c[1]:+.4f}, {c[2]:+.4f}]"
md = ["", f"## S6 — direction vote (forge/DIRECTION_VOTE_PREREG.md): **{'PASS' if res['pass'] else 'FAIL'}**", "",
      f"- v ≥ 2 kept: {f(res['keep'])} R, n {res['n_keep']} of {res['n_all']}; minus all {f(res['keep_minus_all'])}",
      f"- halves: {res['halves'][0]:+.4f} / {res['halves'][1]:+.4f}",
      "- ladder (mean R, n): " + "; ".join(f"{k} {v[0]:+.3f} ({v[1]})" for k, v in res["ladder"].items()),
      "- without the rates gap, 2016-10 →: " + "; ".join(f"{k} {v[0]:+.3f} ({v[1]})" for k, v in res["nogap_2016"].items()),
      "- kept by setup|instrument: " + "; ".join(f"{k} {v[0]:+.3f} ({v[1]})" for k, v in res["by_setup_ins"].items())]
with open(OUT / "RESULTS.md", "a", encoding="utf-8") as fh: fh.write("\n".join(md) + "\n")
print("\n".join(md).encode("ascii", "replace").decode())
