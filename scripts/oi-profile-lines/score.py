#!/usr/bin/env python3
"""oi-profile-lines: score S1-S4, the mirror and the atlas (forge/OI_PROFILE_LINES_PREREG.md).
    python scripts/oi-profile-lines/score.py <touches parquet> <outDir> [--B 2000] [--perms 20]
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
B = int(sys.argv[sys.argv.index("--B") + 1]) if "--B" in sys.argv else 2000
PERMS = int(sys.argv[sys.argv.index("--perms") + 1]) if "--perms" in sys.argv else 20
SEED = 20261123
BARS = {"S1": 0.05, "S2": 0.08, "S3": 0.05, "S4": 0.05}
TYPES = ["put_wall", "call_wall", "gamma_peak", "zero_gamma", "gex_flip", "max_pain", "vanna_flip", "oi_volume",
         "short_gamma_node", "long_gamma_node", "exp_hi", "exp_lo"]

df = pd.read_parquet(SRC)
df["types"] = df["types"].str.replace("charm_flip", "vanna_flip")
df["tset"] = df["types"].str.split("|").map(lambda x: set(x))
df["y"] = (df["res"] == "back").astype(float)
df["resolved"] = df["res"].isin(["back", "through"])
dates = np.array(sorted(df.date.unique()))
di = {d: i for i, d in enumerate(dates)}
df["di"] = df.date.map(di)
half1 = set(dates[: len(dates) // 2])
rng = np.random.default_rng(SEED)
W = np.stack([np.bincount(rng.integers(0, len(dates), len(dates)), minlength=len(dates)) for _ in range(B)]).astype(float)  # B x dates


def per_date(m):
    s = df[m & df.resolved]
    back = np.bincount(s.di, weights=s.y, minlength=len(dates))
    n = np.bincount(s.di, minlength=len(dates)).astype(float)
    return back, n


def cell(mask, real=None, plc=None):
    """E = b(real) - b(placebo) in `mask`. Returns point, boot draws, halves, counts."""
    real = df.kind == "real" if real is None else real
    plc = df.kind == "placebo" if plc is None else plc
    br, nr = per_date(mask & real)
    bp, np_ = per_date(mask & plc)
    with np.errstate(invalid="ignore", divide="ignore"):
        point = br.sum() / nr.sum() - bp.sum() / np_.sum()
        boot = (W @ br) / (W @ nr) - (W @ bp) / (W @ np_)
        h = np.array([d in half1 for d in dates])
        halves = [br[h].sum() / nr[h].sum() - bp[h].sum() / np_[h].sum(), br[~h].sum() / nr[~h].sum() - bp[~h].sum() / np_[~h].sum()]
    return {"E": point, "boot": boot, "halves": halves, "b_real": br.sum() / max(nr.sum(), 1), "b_plc": bp.sum() / max(np_.sum(), 1),
            "n_real": int(nr.sum()), "n_plc": int(np_.sum())}


def summ(c, bar=None):
    bt = c["boot"][np.isfinite(c["boot"])]
    lo, hi = np.percentile(bt, [2.5, 97.5]) if len(bt) else (np.nan, np.nan)
    p = min(1.0, 2 * min((bt <= 0).mean(), (bt >= 0).mean())) if len(bt) else np.nan
    out = {"E_pp": round(100 * c["E"], 2), "ci_pp": [round(100 * lo, 2), round(100 * hi, 2)], "p": round(float(p), 4),
           "halves_pp": [round(100 * x, 2) for x in c["halves"]], "b_real": round(100 * c["b_real"], 1), "b_plc": round(100 * c["b_plc"], 1),
           "n_real": c["n_real"], "n_plc": c["n_plc"]}
    if bar is not None:
        same = np.sign(c["halves"][0]) == np.sign(c["halves"][1]) == np.sign(c["E"])
        if abs(c["E"]) >= bar and (lo > 0 or hi < 0) and same:
            v = "VALIDATED?"  # pending Holm
        elif lo > -bar and hi < bar:
            v = "NULL"
        else:
            v = "UNDERPOWERED"
        out["verdict_pre_holm"] = v
    return out


def diff(a, b):
    return {"E": a["E"] - b["E"], "boot": a["boot"] - b["boot"], "halves": [a["halves"][i] - b["halves"][i] for i in range(2)],
            "b_real": np.nan, "b_plc": np.nan, "n_real": a["n_real"] + b["n_real"], "n_plc": a["n_plc"] + b["n_plc"]}


ALL = pd.Series(True, index=df.index)
O1 = df.n == 1
res = {"source": str(SRC.name), "seed": SEED, "B": B, "dates": len(dates), "sessions": int(df.groupby(["date", "fk"]).ngroups),
       "counts": {k: int(v) for k, v in df.groupby(["kind", "res"]).size().items().__iter__()} if False else
       {f"{k[0]}:{k[1]}": int(v) for k, v in df.groupby(["kind", "res"]).size().items()}}

# ---- scored
S = {}
S["S1"] = summ(cell(O1), BARS["S1"])
pin, brk = cell(O1 & (df.regime == "PIN")), cell(O1 & (df.regime == "BREAKOUT"))
S["S2"] = summ(diff(pin, brk), BARS["S2"]); S["S2"]["parts"] = {"PIN": summ(pin), "BREAKOUT": summ(brk)}
o2, o1 = cell(df.n >= 2), cell(O1)
S["S3"] = summ(diff(o2, o1), BARS["S3"]); S["S3"]["parts"] = {"n>=2": summ(o2), "n=1": summ(o1)}
st, sg = cell(O1 & (df.conf_types >= 2)), cell(O1 & (df.conf_types == 1))
S["S4"] = summ(diff(st, sg), BARS["S4"]); S["S4"]["parts"] = {"stacked": summ(st), "single": summ(sg)}
# Holm on S1-S4
order = sorted(S, key=lambda k: S[k]["p"])
for rank, k in enumerate(order):
    S[k]["holm_alpha"] = round(0.05 / (len(order) - rank), 4)
stop = False
for k in order:
    passes = (not stop) and S[k]["p"] <= S[k]["holm_alpha"]
    if not passes:
        stop = True
    v = S[k].pop("verdict_pre_holm")
    S[k]["verdict"] = "VALIDATED" if (v == "VALIDATED?" and passes) else ("UNDERPOWERED" if v == "VALIDATED?" else v)
res["scored"] = S

# ---- mirror: +0.25 U placebo copies as "real" vs the other placebo copies
P = df.kind == "placebo"
mir = summ(cell(O1, real=P & (df["shift"] == 0.25), plc=P & (df["shift"] != 0.25)), BARS["S1"])
mir["void_design"] = bool(mir.pop("verdict_pre_holm") == "VALIDATED?" and np.sign(mir["E_pp"]) == np.sign(S["S1"]["E_pp"]))  # A2: same sign as S1 = bias
res["mirror"] = mir

# ---- A2 sensitivity: the same four cells against the ±0.5 U placebo copies only
P05 = P & (df["shift"].abs() == 0.5)
sen = {"S1": summ(cell(O1, plc=P05))}
sen["S2"] = summ(diff(cell(O1 & (df.regime == "PIN"), plc=P05), cell(O1 & (df.regime == "BREAKOUT"), plc=P05)))
sen["S3"] = summ(diff(cell(df.n >= 2, plc=P05), cell(O1, plc=P05)))
sen["S4"] = summ(diff(cell(O1 & (df.conf_types >= 2), plc=P05), cell(O1 & (df.conf_types == 1), plc=P05)))
res["sensitivity_pm05"] = sen

# ---- atlas (descriptive), BH q = 0.10 with a permutation chance baseline
def atlas_cells(frame_mask=None):
    cells = []
    has = {t: df.tset.map(lambda s, t=t: t in s) for t in TYPES}
    for t in TYPES:
        cells.append((f"type={t}", O1 & has[t]))
        for rg in ("PIN", "BREAKOUT"):
            cells.append((f"type={t}|regime={rg}", O1 & has[t] & (df.regime == rg)))
        for o, m in (("1", df.n == 1), ("2", df.n == 2), ("3+", df.n >= 3)):
            cells.append((f"type={t}|touch={o}", has[t] & m))
        for sd, nm in ((1, "from_below"), (-1, "from_above")):
            cells.append((f"type={t}|side={nm}", O1 & has[t] & (df.side == sd)))
    for c in (1, 2, 3):
        cells.append((f"conf={c}{'+' if c == 3 else ''}", O1 & ((df.conf_types >= 3) if c == 3 else (df.conf_types == c))))
    gq = df.gAt.rank(pct=True); vq = df.vAt.rank(pct=True)
    gt = pd.cut(gq, [0, 1 / 3, 2 / 3, 1], labels=["low", "mid", "high"], include_lowest=True)
    vt = pd.cut(vq, [0, 1 / 3, 2 / 3, 1], labels=["low", "mid", "high"], include_lowest=True)
    for g in ("low", "mid", "high"):
        for v in ("low", "mid", "high"):
            cells.append((f"gamma={g}|volume={v}", O1 & (gt == g) & (vt == v)))
    for a, b in ((0, 7), (7, 12), (12, 17), (17, 22)):
        cells.append((f"ldn_hour={a:02d}-{b:02d}", O1 & (df.ldn_hour >= a) & (df.ldn_hour < b)))
    vp = pd.to_numeric(df.vol_pct, errors="coerce")
    for nm, m in (("low", vp < 33.3), ("mid", (vp >= 33.3) & (vp < 66.7)), ("high", vp >= 66.7)):
        cells.append((f"vol_pct={nm}", O1 & m))
    ev = df.news.notna() & (df.news.astype(str) != "None")
    cells.append(("event_day=yes", O1 & ev)); cells.append(("event_day=no", O1 & ~ev))
    cells.append(("retest_after_through", df.retest))
    return cells


def bh(ps, q=0.10):
    ps = np.asarray(ps, float); n = np.isfinite(ps).sum(); o = np.argsort(np.where(np.isfinite(ps), ps, 9))
    passed = np.zeros(len(ps), bool); kmax = 0
    for r, i in enumerate(o, 1):
        if np.isfinite(ps[i]) and ps[i] <= q * r / n:
            kmax = r
    passed[o[:kmax]] = True
    return passed


cells = atlas_cells()
atlas = []
for name, m in cells:
    c = cell(m)
    atlas.append({"cell": name, **summ(c)})
pass_ = bh([a["p"] for a in atlas])
for a, p in zip(atlas, pass_):
    a["bh_q10"] = bool(p)
res["atlas_bh_passes"] = int(pass_.sum())

# chance baseline: permute which member of each (date, fk, family) is "real", rerun the atlas BH count
fam = np.where(df.kind == "real", df.price.round(8), df.get("parent", pd.Series(np.nan, index=df.index)))
df["fam"] = pd.Series(fam, index=df.index).astype(str) + "|" + df.date + "|" + df.fk
df["member"] = df["shift"].astype(str)
true_kind = df.kind.copy()
chance = []
prng = np.random.default_rng(SEED + 1)
fam_members = df.groupby("fam")["member"].unique()
for _ in range(PERMS):
    pick = {f: prng.choice(ms) for f, ms in fam_members.items()}
    df["kind"] = np.where(df.member.values == df.fam.map(pick).values, "real", "placebo")
    ps = [summ(cell(m))["p"] for _, m in atlas_cells()]
    chance.append(int(bh(ps).sum()))
df["kind"] = true_kind
res["atlas_chance_baseline"] = {"perms": PERMS, "median": float(np.median(chance)), "max": int(max(chance)), "all": chance}

# ---- descriptive: raw rates (not vs placebo) by regime / vol / event, excursions
R = df.kind == "real"
desc = []
vp = pd.to_numeric(df.vol_pct, errors="coerce")
ev = df.news.notna() & (df.news.astype(str) != "None")
for nm, m in (("all", ALL), ("PIN", df.regime == "PIN"), ("BREAKOUT", df.regime == "BREAKOUT"), ("vol_low", vp < 33.3), ("vol_high", vp >= 66.7),
              ("event", ev), ("no_event", ~ev)):
    for kind in ("real", "placebo"):
        s = df[O1 & m & (df.kind == kind)]
        r = s[s.resolved]
        desc.append({"slice": nm, "kind": kind, "touches": len(s), "resolved": len(r), "bounce_pct": round(100 * r.y.mean(), 1) if len(r) else None,
                     "both": int((s.res == "both").sum()), "unresolved": int((s.res == "unresolved").sum()),
                     "mfe_back60_med": round(float(s.mfe_back60.median()), 3), "mfe_thru60_med": round(float(s.mfe_thru60.median()), 3),
                     "bars_to_res_med": float(s.bars_to_res.median()) if s.bars_to_res.notna().any() else None})
res["descriptive"] = desc
res["atlas"] = atlas

OUT.mkdir(parents=True, exist_ok=True)
stem = SRC.stem
(OUT / f"results_{stem}.json").write_text(json.dumps(res, indent=1, default=float))
print(json.dumps({"scored": {k: {kk: v[kk] for kk in ("E_pp", "ci_pp", "p", "halves_pp", "verdict", "n_real")} for k, v in S.items()},
                  "mirror": {k: mir[k] for k in ("E_pp", "ci_pp", "void_design")}, "atlas_bh": res["atlas_bh_passes"], "chance": res["atlas_chance_baseline"]["median"],
                  "b_real_O1": S["S1"]["b_real"], "b_plc_O1": S["S1"]["b_plc"]}, indent=1))
