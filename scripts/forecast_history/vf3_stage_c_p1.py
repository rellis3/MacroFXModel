"""VF3 Stage C, P1: intraday probability correction (forge/VF3_STAGE_C_PREREG.md, P1).

    PYTHONPATH=. python scripts/forecast_history/vf3_stage_c_p1.py

T1 next line (export O-H/O-L rungs, from the first touch) and T2 range-to-line (L_A COG HL median as displayed; L_B export HL p50).
Display (J2 / K3 formulas), Clim and Challenger tables (fitted < 2022, frozen; m = 30 shrinkage). E-dev 2022-2024, E-conf 2025-01..2026-08-20
(oos rows; retrospective, non-independent). Session-block bootstrap (5 dates), Holm over the three primary endpoints on E-conf.
Writes analysis/output/vf3_stage_c/P1.md, p1.json and frozen tables p1_tables.json.
"""
from __future__ import annotations

import json
import subprocess
from math import erf, sqrt
from pathlib import Path

import numpy as np
import pandas as pd

import sys
sys.path.insert(0, str(Path(__file__).parent))
from forecast_record import klass  # noqa: E402

OUT = Path("analysis/output/vf3_stage_c")
FH = Path("analysis/output/forecast_history")
FIT_END, DEV0, CONF0, CONF1 = "2022-01-01", "2022-01-01", "2025-01-01", "2026-08-21"
M = 30
RNG = np.random.default_rng(20261010)
NB = 1000
SESS = lambda h: np.select([h < 7, h < 12, h < 16, h < 19], ["asia", "london", "overlap", "ny"], "late")
ALIAS = {"US30": "DOW", "SPX500": "SPX"}


def node_json(js):
    return json.loads(subprocess.check_output(["node", "-e", js], text=True))


def phi(x):
    return 0.5 * (1 + np.vectorize(erf)(x / sqrt(2)))


# ---------------------------------------------------------------- data
def load():
    cols = ["inst", "date", "oos", "r_hl", "pit_hl_p50", "last_min"] + [f"ft_{s}_{r}" for s in ("OH", "OL") for r in ("p50", "p75", "p90")] + \
           [f"oh_h{k}" for k in range(1, 23)] + [f"ol_h{k}" for k in range(1, 23)]
    X = pd.concat([pd.read_csv(f, usecols=lambda c: c in cols) for f in sorted(FH.glob("*.csv"))], ignore_index=True)
    X = X[(X.last_min >= 1200) & (X.date < CONF1)].copy()
    X["klass"] = X.inst.map(klass)
    return X


def block(d):
    return np.select([d < FIT_END, d < CONF0], ["fit", "dev"], "conf")


# ---------------------------------------------------------------- T1
def t1_rows(X, oos):
    out = []
    for side, S in (("OH", "oh"), ("OL", "ol")):
        for a, b in (("p50", "p75"), ("p75", "p90")):
            fa, fb = X[f"ft_{side}_{a}"], X[f"ft_{side}_{b}"]
            m = fa.notna()
            t = X.loc[m, ["inst", "date", "oos", "klass"]].copy()
            t["step"] = f"{side} {a}->{b}"
            t["minute"] = fa[m].to_numpy()
            t["hour"] = (t.minute // 60).astype(int)
            t["y"] = (fb[m].notna() & (fb[m] >= fa[m])).astype(float).to_numpy()
            t["display"] = [np.clip(oos.get(ALIAS.get(i, i), {}).get(f"{S}_{b}", np.nan) / max(oos.get(ALIAS.get(i, i), {}).get(f"{S}_{a}", np.nan), 1e-9), 0, 1) for i in t.inst]
            out.append(t)
    T = pd.concat(out, ignore_index=True)
    T["block"] = block(T.date)
    fit = T[T.block == "fit"]
    clim = fit.groupby("step").y.mean()
    g = fit.groupby(["step", "hour"]).y.agg(["sum", "count"])
    tab = {(s, h): (r["sum"] + M * clim[s]) / (r["count"] + M) for (s, h), r in g.iterrows()}
    T["clim"] = T.step.map(clim)
    T["chal"] = [tab.get((s, h), clim[s]) for s, h in zip(T.step, T.hour)]
    T["session"] = SESS(T.hour.to_numpy())
    return T, {"clim": clim.to_dict(), "table": {f"{s}|{h}": v for (s, h), v in tab.items()}}


def t7_comparator(T):
    bp = node_json("import('./js/bandReachParams.js').then(m=>console.log(JSON.stringify({c:m.BAND_REACH_CHECKPOINTS,p:m.BAND_REACH_PARAMS})))")
    cps = [(n, mm) for n, mm in bp["c"]]
    vals = []
    for inst, step, minute in zip(T.inst, T.step, T.minute):
        P = bp["p"].get(inst)
        if P is None or not step.endswith("p50->p75"):
            vals.append(np.nan)
            continue
        side = "up" if step.startswith("OH") else "dn"
        cp = [n for n, mm in cps if mm <= minute]
        v = P["byCheckpoint"].get(cp[-1], {}).get(side, {}).get("p75givenMed", {}).get("p") if cp else None
        vals.append(np.nan if v is None else v)
    return np.array(vals, float)


# ---------------------------------------------------------------- T2
def t2_rows(X, C, line):
    if line == "L_A":
        X = X.merge(C, on=["inst", "date"], how="inner")
        L = X.C_hl_p50
    else:
        L = X.pit_hl_p50
    out = []
    for h in range(2, 21):
        run = X[f"oh_h{h}"] + X[f"ol_h{h}"]
        m = run < L
        g = X.loc[m, ["inst", "date", "oos", "klass"]].copy()
        g["h"] = h
        g["consumed"] = (run[m] / L[m]).clip(0, 1).to_numpy()
        ts = (pd.to_datetime(g.date) + pd.to_timedelta(h, unit="h")).dt.tz_localize("Europe/London").dt.tz_convert("UTC")
        tf = np.minimum(0.99, (ts.dt.hour * 60) / 1440)   # page: the last H1 bar is the one that just opened at the checkpoint (UTC clock)
        z = (1 - g.consumed) / np.sqrt(np.maximum(0.01, 1 - tf))
        g["display"] = np.clip(2 * (1 - phi(z.to_numpy())), 0, 1)
        g["y"] = (X.loc[m, "r_hl"] >= L[m]).astype(float).to_numpy()
        out.append(g)
    G = pd.concat(out, ignore_index=True)
    G["block"] = block(G.date)
    G["cdec"] = np.minimum((G.consumed * 10).astype(int), 9)
    fit = G[G.block == "fit"]
    clim = fit.y.mean()
    hr = fit.groupby("h").y.mean()
    g = fit.groupby(["h", "cdec"]).y.agg(["sum", "count"])
    tab = {(h, c): (r["sum"] + M * hr[h]) / (r["count"] + M) for (h, c), r in g.iterrows()}
    G["clim"] = clim
    G["chal"] = [tab.get((h, c), hr.get(h, clim)) for h, c in zip(G.h, G.cdec)]
    G["session"] = SESS(G.h.to_numpy())
    G["cterc"] = pd.cut(G.consumed, [-0.01, 1 / 3, 2 / 3, 1.01], labels=["low", "mid", "high"])
    return G, {"clim": clim, "hour": hr.to_dict(), "table": {f"{h}|{c}": v for (h, c), v in tab.items()}}


# ---------------------------------------------------------------- scoring
def boot(dates, ref_loss, new_loss):
    df = pd.DataFrame({"d": dates, "r": ref_loss, "n": new_loss}).groupby("d")[["r", "n"]].sum().sort_index()
    r, n = df.r.to_numpy(), df.n.to_numpy()
    k = len(r)
    nb = int(np.ceil(k / 5))
    st = RNG.integers(0, max(1, k - 5 + 1), size=(NB, nb))
    idx = (st[:, :, None] + np.arange(5)).reshape(NB, -1)[:, :k]
    rs, ns = r[idx].sum(1), n[idx].sum(1)
    sk = 1 - ns / rs
    point = 1 - n.sum() / r.sum()
    return point, np.quantile(sk, [0.025, 0.975]), (np.sum(sk <= 0) + 1) / (NB + 1)


def calib(y, p):
    q = pd.qcut(p, 10, labels=False, duplicates="drop")
    t = pd.DataFrame({"q": q, "p": p, "y": y}).groupby("q").agg(p=("p", "mean"), y=("y", "mean"), n=("y", "size"))
    t = t[t.n >= 300]
    return float((t.p - t.y).abs().max() * 100) if len(t) else np.nan


def score(D, ref="display", new="chal"):
    y = D.y.to_numpy()
    lr, ln = (D[ref].to_numpy() - y) ** 2, (D[new].to_numpy() - y) ** 2
    pt, ci, p = boot(D.date.to_numpy(), lr, ln)
    return {"n": int(len(D)), "dates": int(D.date.nunique()), "realised%": round(100 * y.mean(), 1), f"{ref}%": round(100 * D[ref].mean(), 1),
            f"{new}%": round(100 * D[new].mean(), 1), "skill%": round(100 * pt, 2), "ci%": [round(100 * ci[0], 2), round(100 * ci[1], 2)], "p_one_sided": float(p),
            f"calib_{ref}_pp": round(calib(y, D[ref].to_numpy()), 1), f"calib_{new}_pp": round(calib(y, D[new].to_numpy()), 1)}


def breakdown(D, cuts, min_rows=300):
    out = {}
    for cut in cuts:
        rows = {}
        for k, g in D.groupby(cut, observed=True):
            if len(g) < min_rows:
                continue
            s = score(g)
            rows[str(k)] = {"n": s["n"], "skill%": s["skill%"], "ci%": s["ci%"], "realised%": s["realised%"], "display%": s["display%"], "chal%": s["chal%"],
                            "FAIL(ci<0)": s["ci%"][1] < 0}
        out[cut] = rows
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    X = load()
    oos = node_json("import('./js/forecastLadderParams.js').then(m=>console.log(JSON.stringify(Object.fromEntries(Object.entries(m.LADDER_PARAMS.pairs).map(([k,v])=>[k,v.oos_exceed])))))")
    T1, t1tab = t1_rows(X, oos)
    T1["t7"] = t7_comparator(T1)
    C = pd.read_parquet("analysis/output/vf3_stage_b/part1_lines.parquet", columns=["inst", "date", "C_hl_p50"])
    Gb, tb = t2_rows(X, C, "L_B")
    Ga, ta = t2_rows(X, C, "L_A")
    (OUT / "p1_tables.json").write_text(json.dumps({"T1": t1tab, "T2_L_B": tb, "T2_L_A": ta, "fit_end": FIT_END, "m": M}, default=float, indent=0))
    R = {}
    for name, D in (("T1", T1), ("T2_L_B", Gb), ("T2_L_A", Ga)):
        D = D[(D.oos == 1) & D.display.notna()]
        res = {}
        for blk in ("dev", "conf"):
            B = D[D.block == blk]
            res[blk] = {"vs_display": score(B), "vs_clim": score(B, ref="clim")}
            res[blk]["by_year"] = {yr: score(g)["skill%"] for yr, g in B.groupby(B.date.str[:4])}
        cuts = ["klass", "session", "inst"] + (["step"] if name == "T1" else ["cterc"])
        res["conf_breakdown"] = breakdown(D[D.block == "conf"], cuts)
        res["dev_breakdown"] = breakdown(D[D.block == "dev"], cuts)
        if name == "T1":
            c = D[D.t7.notna()]
            res["t7_comparator"] = {blk: {"challenger_vs_t7": score(c[c.block == blk], ref="t7"), "display_vs_t7": score(c[c.block == blk], ref="t7", new="display")} for blk in ("dev", "conf")}
        R[name] = res
    ps = [R[k]["conf"]["vs_display"]["p_one_sided"] for k in ("T1", "T2_L_B", "T2_L_A")]
    o = np.argsort(ps)
    adj = np.empty(3)
    run = 0
    for r, i in enumerate(o):
        run = max(run, (3 - r) * ps[i])
        adj[i] = min(1, run)
    for k, a in zip(("T1", "T2_L_B", "T2_L_A"), adj):
        c = R[k]["conf"]
        yrs = list(R[k]["dev"]["by_year"].values()) + list(c["by_year"].values())
        fails = [f"{cut}:{cell}" for cut, cells in R[k]["conf_breakdown"].items() if cut == "klass" for cell, v in cells.items() if v["FAIL(ci<0)"]]
        c["p_holm"] = float(a)
        c["accept"] = {"skill>=2%_and_holm<0.05": c["vs_display"]["skill%"] >= 2 and a < 0.05,
                       "vs_clim_lb>0": c["vs_clim"]["ci%"][0] > 0,
                       "calib<=3pp": c["vs_display"]["calib_chal_pp"] <= 3,
                       "positive_every_year": all(v > 0 for v in yrs),
                       "no_class_failing": not fails}
        c["ACCEPTED"] = all(c["accept"].values())
    (OUT / "p1.json").write_text(json.dumps(R, indent=1, default=float))
    print(json.dumps({k: {"conf": {kk: R[k]["conf"][kk] for kk in ("vs_display", "vs_clim", "by_year", "p_holm", "accept", "ACCEPTED")},
                          "dev": {kk: R[k]["dev"][kk] for kk in ("vs_display", "by_year")}} for k in R}, indent=1, default=float))


if __name__ == "__main__":
    main()
