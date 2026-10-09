"""iep_stage2 — Stage 2 of forge/INTRADAY_EXTREME_PATHS_PREREG.md: Family A (Holm), Family B (BH-FDR), model ladder.

    python -m forge.iep_stage2 edges     # discovery-only cut points (run first; reads no Validation outcome)
    python -m forge.iep_stage2 run       # tests + ladder on Validation 2022-2024

Population (registered): large-move rows, bands asia/london/overlap/ny (h 2-18), H = 2 h, barrier 1.0u. Validation =
2022-01-01 .. 2024-12-31. Nothing dated 2025 or later is read. Outcomes:
  CONT|res  continuation among resolved (CONT vs REV)          — direction
  CONS      consolidation vs any 1u move (AMB rows dropped)     — size
  RACE      CONT / REV / CONS jointly (competing barriers)      — barrier probabilities (ladder only)
Operational definitions fixed in this file before the run (recorded in the prereg Stage 2 section):
  effects are linear-probability differences in percentage points with date-clustered (CR1) standard errors;
  trend hypotheses report the slope per step AND the extreme contrast (top bin minus bottom bin, the size criterion);
  A7 / A9 / A10 combine their sub-tests by Bonferroni inside the hypothesis (p = k * min p) before Holm across A1-A10;
  A9 dollar agree = o * s_usd * usdfac > 0 (USD instruments only), risk agree = o * riskfac > 0 (all instruments);
  A10 = {VIX tercile, curve-slope tercile, tier1-vs-none event day} x {CONS, CONT|res}, 6 sub-tests;
  Family B: each of the six interactions on both outcomes (12 Wald tests, BH-FDR 10%), plus the prior-day-level x pullback
  replication test (near = |distance to the prior-day extreme on the oriented side| <= 0.25 sigma) alone at 0.05.
"""
from __future__ import annotations

import json
import sys

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from forge.iep_build import JOBS, OUT, SUM, cls_of, DISC_END

VAL0, VAL1 = "2022-01-01", "2025-01-01"
HALF = "2023-07-01"
RNG = np.random.default_rng(20261011)
COST = SUM / "stage1_costs.csv"


# ---------------------------------------------------------------- data
def band(h):
    return np.select([h < 7, h < 12, h < 16, h < 19], ["asia", "london", "overlap", "ny"], "late")


def load(disc_only=False):
    cols = None
    parts = []
    for s in JOBS:
        x = pd.read_parquet(OUT / f"{s}.parquet")
        parts.append(x[x.date < (DISC_END if disc_only else VAL1)])
    d = pd.concat(parts, ignore_index=True)
    f = pd.read_parquet(OUT / "features_2016_2024.parquet")
    d = d.merge(f, on=["inst", "date", "h"], how="left")
    d["cls"] = d.inst.map(cls_of)
    d["band"] = band(d.h.to_numpy())
    d["o"] = np.where(d.D >= 0.25, 1, np.where(d.D <= -0.25, -1, 0))
    q = pd.read_csv(SUM / "large_move_tercile_edges_disc.csv")
    d = d.merge(q, on=["cls", "h"], how="left")
    d["large"] = (d.o != 0) & (d.D.abs() >= 0.5) & (d.D.abs() >= d.q67)
    d = d[d.large & (d.band != "late")].copy()
    d["absD"] = d.D.abs()
    d["pb"] = np.where(d.o == 1, d.hi_pb, d.lo_pb)
    d["opp_pb"] = np.where(d.o == 1, d.lo_pb, d.hi_pb)
    d["age"] = np.where(d.o == 1, d.hi_age, d.lo_age)
    d["pd_dist"] = np.where(d.o == 1, d.pdh, d.pdl)
    d["pb_s"] = np.digitize(d.pb, [0.15, 0.5, 1.0], right=True)          # 0 F, 1 S, 2 M, 3 D
    d["age_s"] = np.digitize(d.age, [59, 180], right=True)                # 0 <60, 1 60-180, 2 >180
    d["mom"] = d.o * d.m1
    e = pd.read_csv(SUM / "large_move_used_mom_tercile_edges_disc.csv")
    d = d.merge(e, on=["cls", "h"], how="left")
    d["used_s"] = np.select([d.used50 <= d.used_q1, d.used50 <= d.used_q2], [0, 1], 2)
    d["mom_s"] = np.select([d.mom <= d.mom_q1, d.mom <= d.mom_q2], [0, 1], 2)
    d["reg_s"] = np.select([d.sigRel < 0.85, d.sigRel <= 1.15], [0, 1], 2)
    d.loc[d.sigRel.isna(), "reg_s"] = -1
    try:
        ed = json.loads((SUM / "stage2_edges_disc.json").read_text())
        de = pd.DataFrame(ed["disp"])
        d = d.merge(de, on=["cls", "h"], how="left")
        d["disp_s"] = np.select([d.absD <= d.disp_q1, d.absD <= d.disp_q2], [0, 1], 2)
        for k in ("vix", "slope", "iv_sig"):
            a, b = ed[k]
            d[f"{k}_s"] = np.where(d[k].isna(), -1, np.digitize(d[k], [a, b], right=True))
    except FileNotFoundError:
        pass
    r = d["res2_1.0"]
    d["lab"] = np.select([r == 2, r == 0, r * d.o == 1, r * d.o == -1], ["AMB", "CONS", "CONT", "REV"], "NA")
    d = d[d.lab != "NA"].copy()
    d["val"] = d.date >= VAL0
    return d


def edges():
    d = load(disc_only=True)
    disp = d.groupby(["cls", "h"]).absD.quantile([1 / 3, 2 / 3]).unstack()
    disp.columns = ["disp_q1", "disp_q2"]
    out = {"disp": disp.reset_index().to_dict("list")}
    for k in ("vix", "slope", "iv_sig"):
        v = d[k].dropna()
        out[k] = [float(v.quantile(1 / 3)), float(v.quantile(2 / 3))]
    (SUM / "stage2_edges_disc.json").write_text(json.dumps(out, indent=1))
    print({k: v for k, v in out.items() if k != "disp"})


# ---------------------------------------------------------------- inference helpers
def ols_cr1(y, X, g):
    """OLS with date-clustered CR1 covariance. X includes the intercept column."""
    X = np.asarray(X, float)
    y = np.asarray(y, float)
    XtX_inv = np.linalg.pinv(X.T @ X)
    b = XtX_inv @ X.T @ y
    e = y - X @ b
    codes, uniq = pd.factorize(g)
    G = len(uniq)
    S = np.zeros((G, X.shape[1]))
    np.add.at(S, codes, X * e[:, None])
    n, k = X.shape
    meat = S.T @ S
    V = XtX_inv @ meat @ XtX_inv * (G / (G - 1)) * ((n - 1) / (n - k))
    return b, V, G


def contrast(y, x, g, controls=None):
    """Effect of x (numeric/indicator) on y, pp, with CI and p."""
    cols = [np.ones(len(y)), np.asarray(x, float)]
    if controls is not None:
        cols += [controls[:, j] for j in range(controls.shape[1])]
    b, V, G = ols_cr1(y, np.column_stack(cols), g)
    se = np.sqrt(V[1, 1])
    z = b[1] / se
    return {"eff_pp": 100 * b[1], "lo": 100 * (b[1] - 1.96 * se), "hi": 100 * (b[1] + 1.96 * se), "p": 2 * stats.norm.sf(abs(z)), "dates": G}


def dummies(s, drop_first=True):
    return pd.get_dummies(pd.Series(s).astype(str), drop_first=drop_first).to_numpy(float)


def wald_interaction(y, a, b, g):
    A, B = dummies(a), dummies(b)
    AB = np.column_stack([A[:, i] * B[:, j] for i in range(A.shape[1]) for j in range(B.shape[1])])
    keep = AB.sum(0) >= 30
    AB = AB[:, keep]
    X = np.column_stack([np.ones(len(y)), A, B, AB])
    bb, V, G = ols_cr1(y, X, g)
    k0 = 1 + A.shape[1] + B.shape[1]
    bi, Vi = bb[k0:], V[k0:, k0:]
    W = float(bi @ np.linalg.pinv(Vi) @ bi)
    df = AB.shape[1]
    return {"wald": W, "df": df, "p": stats.chi2.sf(W, df), "max_int_pp": 100 * float(np.abs(bi).max()) if df else np.nan, "dates": G}


def holm(p):
    p = np.asarray(p)
    o = np.argsort(p)
    m = len(p)
    adj = np.empty(m)
    run = 0
    for r, i in enumerate(o):
        run = max(run, (m - r) * p[i])
        adj[i] = min(1, run)
    return adj


def bh(p):
    p = np.asarray(p)
    m = len(p)
    o = np.argsort(p)
    q = np.empty(m)
    prev = 1
    for r in range(m - 1, -1, -1):
        i = o[r]
        prev = min(prev, p[i] * m / (r + 1))
        q[i] = prev
    return q


# ---------------------------------------------------------------- Family A
def fam_a(v):
    res = v[v.lab.isin(["CONT", "REV"])]
    yc = (res.lab == "CONT").astype(float).to_numpy()
    nam = v[v.lab != "AMB"]
    ys = (nam.lab == "CONS").astype(float).to_numpy()
    out = {}

    def rc(mask=None):
        return (res if mask is None else res[mask(res)])

    # A1 fresh extremes: CONT share - 0.5
    f = res[(res.pb_s == 0) & (res.age < 60)]
    y = (f.lab == "CONT").astype(float).to_numpy()
    b, V, G = ols_cr1(y - 0.5, np.ones((len(y), 1)), f.date.to_numpy())
    se = np.sqrt(V[0, 0])
    out["A1 fresh large extreme: CONT|res - 50%"] = dict(outcome="CONT|res", eff_pp=100 * b[0], lo=100 * (b[0] - 1.96 * se), hi=100 * (b[0] + 1.96 * se),
                                                       p=2 * stats.norm.sf(abs(b[0] / se)), n=len(f), dates=G, size_pp=100 * b[0], rows=f)
    # A2 pullback trend
    r = contrast(yc, res.pb_s, res.date)
    ext = contrast(yc[(res.pb_s.isin([0, 3])).to_numpy()], (res.pb_s[res.pb_s.isin([0, 3])] == 3), res.date[res.pb_s.isin([0, 3])])
    out["A2 pullback depth trend (per bin; size = D>1 minus F)"] = dict(outcome="CONT|res", **r, n=len(res), size_pp=ext["eff_pp"], rows=res, x="pb_s")
    # A3 age at fixed pullback
    r = contrast(yc, res.age_s, res.date, controls=dummies(res.pb_s))
    ext = contrast(yc[res.age_s.isin([0, 2]).to_numpy()], res.age_s[res.age_s.isin([0, 2])] == 2, res.date[res.age_s.isin([0, 2])],
                   controls=dummies(res.pb_s[res.age_s.isin([0, 2])]))
    out["A3 age of extreme | pullback (per bin; size = >180m minus <60m)"] = dict(outcome="CONT|res", **r, n=len(res), size_pp=ext["eff_pp"], rows=res, x="age_s")
    # A4 range used on CONS
    r = contrast(ys, nam.used_s, nam.date)
    ext = contrast(ys[nam.used_s.isin([0, 2]).to_numpy()], nam.used_s[nam.used_s.isin([0, 2])] == 2, nam.date[nam.used_s.isin([0, 2])])
    out["A4 range used tercile on CONS (size = high minus low)"] = dict(outcome="CONS", **r, n=len(nam), size_pp=ext["eff_pp"], rows=nam, x="used_s")
    # A5 momentum top tercile
    r = contrast(yc, res.mom_s == 2, res.date)
    out["A5 momentum top tercile vs rest on CONT|res"] = dict(outcome="CONT|res", **r, n=len(res), size_pp=r["eff_pp"], rows=res, x="mom_top")
    # A6 regime busy vs quiet on CONS
    m = nam.reg_s.isin([0, 2])
    r = contrast(ys[m.to_numpy()], nam.reg_s[m] == 2, nam.date[m])
    out["A6 busy vs quiet regime on CONS"] = dict(outcome="CONS", **r, n=int(m.sum()), size_pp=r["eff_pp"], rows=nam[m], x="busy")
    # A7 IV/sigma tercile: CONS and CONT (Bonferroni 2)
    mi = nam.iv_sig_s >= 0
    a = contrast(ys[mi.to_numpy()], nam.iv_sig_s[mi], nam.date[mi])
    ai = contrast(ys[(mi & nam.iv_sig_s.isin([0, 2])).to_numpy()], nam.iv_sig_s[mi & nam.iv_sig_s.isin([0, 2])] == 2, nam.date[mi & nam.iv_sig_s.isin([0, 2])])
    mr = res.iv_sig_s >= 0
    c = contrast(yc[mr.to_numpy()], res.iv_sig_s[mr], res.date[mr])
    ci = contrast(yc[(mr & res.iv_sig_s.isin([0, 2])).to_numpy()], res.iv_sig_s[mr & res.iv_sig_s.isin([0, 2])] == 2, res.date[mr & res.iv_sig_s.isin([0, 2])])
    best = a if a["p"] <= c["p"] else c
    out["A7 IV/sigma tercile (7 instruments): CONS and CONT|res"] = dict(outcome="CONS" if best is a else "CONT|res", **{**best, "p": min(1, 2 * min(a["p"], c["p"]))},
                                                                          n=int(mi.sum()), size_pp=(ai if best is a else ci)["eff_pp"],
                                                                          sub={"CONS per tercile": a, "CONS high-low": ai, "CONT per tercile": c, "CONT high-low": ci},
                                                                          rows=nam[mi] if best is a else res[mr], x="iv_sig_s")
    # A8 hour band: joint Wald, size = max - min band share
    Xb = dummies(res.band)
    bb, V, G = ols_cr1(yc, np.column_stack([np.ones(len(yc)), Xb]), res.date.to_numpy())
    W = float(bb[1:] @ np.linalg.pinv(V[1:, 1:]) @ bb[1:])
    shares = res.assign(y=yc).groupby("band").y.mean() * 100
    out["A8 hour band on CONT|res (joint Wald)"] = dict(outcome="CONT|res", eff_pp=shares.max() - shares.min(), lo=np.nan, hi=np.nan,
                                                       p=stats.chi2.sf(W, Xb.shape[1]), n=len(res), dates=G, size_pp=shares.max() - shares.min(),
                                                       sub={"band shares %": shares.round(2).to_dict()}, rows=res, x="band")
    # A9 cross-asset agreement
    mu = (res.s_usd != 0) & res.usdfac.notna()
    du = contrast(yc[mu.to_numpy()], (res.o * res.s_usd * res.usdfac > 0)[mu], res.date[mu])
    mr2 = res.riskfac.notna()
    dr = contrast(yc[mr2.to_numpy()], (res.o * res.riskfac > 0)[mr2], res.date[mr2])
    best = du if du["p"] <= dr["p"] else dr
    out["A9 dollar / risk factor agreeing with orientation on CONT|res"] = dict(outcome="CONT|res", **{**best, "p": min(1, 2 * min(du["p"], dr["p"]))},
                                                                               n=int(mu.sum()) if best is du else int(mr2.sum()), size_pp=best["eff_pp"],
                                                                               sub={"dollar agree": du, "risk agree": dr},
                                                                               rows=res[mu] if best is du else res[mr2], x="usd_agree" if best is du else "risk_agree")
    # A10 macro: 6 sub-tests
    subs = {}
    for k in ("vix", "slope"):
        mm = nam[f"{k}_s"] >= 0
        subs[f"{k} tercile on CONS (high-low)"] = contrast(ys[(mm & nam[f"{k}_s"].isin([0, 2])).to_numpy()], nam[f"{k}_s"][mm & nam[f"{k}_s"].isin([0, 2])] == 2, nam.date[mm & nam[f"{k}_s"].isin([0, 2])])
        mm = res[f"{k}_s"] >= 0
        subs[f"{k} tercile on CONT|res (high-low)"] = contrast(yc[(mm & res[f"{k}_s"].isin([0, 2])).to_numpy()], res[f"{k}_s"][mm & res[f"{k}_s"].isin([0, 2])] == 2, res.date[mm & res[f"{k}_s"].isin([0, 2])])
    me = nam.event.isin(["tier1", "none"])
    subs["tier1 vs none on CONS"] = contrast(ys[me.to_numpy()], nam.event[me] == "tier1", nam.date[me])
    me = res.event.isin(["tier1", "none"])
    subs["tier1 vs none on CONT|res"] = contrast(yc[me.to_numpy()], res.event[me] == "tier1", res.date[me])
    kbest = min(subs, key=lambda k: subs[k]["p"])
    best = subs[kbest]
    out["A10 macro regime (VIX, curve slope, event day) on CONS / CONT|res"] = dict(outcome=kbest, **{**best, "p": min(1, 6 * best["p"])}, n=len(nam),
                                                                                  size_pp=best["eff_pp"], sub=subs, rows=None)
    return out


def robustness(v, out):
    """Halves, instrument consistency, AMB sensitivity — for each Family A entry with a simple x."""
    for name, r in out.items():
        rows, x = r.get("rows"), r.get("x")
        r["half1_pp"] = r["half2_pp"] = r["inst_same_sign_%"] = np.nan
        if rows is None:
            continue
        y = ((rows.lab == "CONT") if r["outcome"].startswith("CONT") else (rows.lab == "CONS")).astype(float)

        def eff(sub, ys):
            if x is None:
                return 100 * (ys.mean() - 0.5)
            xs = {"mom_top": sub.mom_s == 2, "busy": sub.reg_s == 2, "usd_agree": sub.o * sub.s_usd * sub.usdfac > 0,
                  "risk_agree": sub.o * sub.riskfac > 0}.get(x)
            if xs is None:
                xs = sub[x] if x in sub else None
                if x == "band":
                    s = ys.groupby(sub.band).mean() * 100
                    return s.max() - s.min()
                lo, hi = xs.min(), xs.max()
                return 100 * (ys[xs == hi].mean() - ys[xs == lo].mean())
            return 100 * (ys[xs].mean() - ys[~xs].mean())

        h1 = rows.date < HALF
        r["half1_pp"], r["half2_pp"] = eff(rows[h1], y[h1]), eff(rows[~h1], y[~h1])
        signs = []
        for inst, g in rows.groupby("inst"):
            if len(g) >= 200:
                e = eff(g, y.loc[g.index])
                if np.isfinite(e):
                    signs.append(np.sign(e) == np.sign(r["size_pp"]))
        r["inst_same_sign_%"] = 100 * np.mean(signs) if signs else np.nan
        if r["outcome"].startswith("CONT"):  # AMB sensitivity: add AMB rows as CONT, then as REV
            amb = v[(v.lab == "AMB")]
            if x is None:
                amb = amb[(amb.pb_s == 0) & (amb.age < 60)]
            effs = []
            for as_ in ("CONT", "REV"):
                rr = pd.concat([rows, amb.assign(lab=as_)])
                yy = (rr.lab == "CONT").astype(float)
                effs.append(eff(rr, yy))
            r["amb_bounds_pp"] = [round(e, 3) for e in effs]
    return out


# ---------------------------------------------------------------- Family B
def fam_b(v):
    res = v[v.lab.isin(["CONT", "REV"])]
    nam = v[v.lab != "AMB"]
    pairs = [("pb_s", "age_s"), ("pb_s", "band"), ("used_s", "band"), ("mom_s", "pb_s"), ("reg_s", "used_s"), ("disp_s", "reg_s")]
    rows = []
    for a, b in pairs:
        for oname, df, y in (("CONT|res", res, (res.lab == "CONT")), ("CONS", nam, (nam.lab == "CONS"))):
            m = (df[a].astype(str) != "-1") & (df[b].astype(str) != "-1")
            w = wald_interaction(y[m].astype(float).to_numpy(), df[a][m], df[b][m], df.date[m].to_numpy())
            rows.append({"interaction": f"{a} x {b}", "outcome": oname, **w})
    B = pd.DataFrame(rows)
    B["q_bh"] = bh(B.p)
    B["pass_fdr10"] = B.q_bh <= 0.10
    # prior-day level replication (alone at 0.05)
    res = res.assign(near=(res.pd_dist.abs() <= 0.25))
    m = res.pd_dist.notna()
    rep = wald_interaction((res.lab == "CONT")[m].astype(float).to_numpy(), res.near[m], res.pb_s[m], res.date[m].to_numpy())
    main = contrast((res.lab == "CONT")[m].astype(float).to_numpy(), res.near[m], res.date[m])
    return B, {"interaction near x pullback": rep, "main effect near (descriptive)": main}


# ---------------------------------------------------------------- ladder
def layer_features(d, prof_cum):
    X = {}
    X["L1"] = pd.DataFrame({"absD": d.absD, "pb": d.pb, "lage": np.log1p(d.age), "used": d.used, "om1": d.o * d.m1.fillna(0),
                            "om4": d.o * d.m4.fillna(0), "m4na": d.m4.isna().astype(float), "opp_pb": d.opp_pb,
                            "pd_dist": d.pd_dist.fillna(0), "pdna": d.pd_dist.isna().astype(float), "rv": np.log1p(d.rv)}, index=d.index)
    X["L1"] = pd.concat([X["L1"], pd.get_dummies(d.inst, prefix="i", dtype=float), pd.get_dummies(d.h, prefix="h", dtype=float)], axis=1)
    elapsed = np.array([prof_cum[c][h] for c, h in zip(d.cls, d.h)])
    X["L2"] = pd.DataFrame({"lsigrel": np.log(d.sigRel.fillna(1)), "srna": d.sigRel.isna().astype(float),
                            "lsig_inst": np.log(d.sig) - d.groupby("inst").sig.transform(lambda s: np.log(s[d.loc[s.index, "date"] < DISC_END].median())),
                            "iv": d.iv_sig.fillna(0), "ivna": d.iv_sig.isna().astype(float), "used50": d.used50,
                            "rv_ratio": np.log1p(d.rv / np.maximum(elapsed, 1e-3))}, index=d.index)
    X["L3"] = pd.DataFrame({"o_usd": (d.o * d.usdfac).fillna(0), "o_s_usd": (d.o * d.s_usd * d.usdfac).fillna(0), "usdna": d.usdfac.isna().astype(float),
                            "o_risk": (d.o * d.riskfac).fillna(0), "riskna": d.riskfac.isna().astype(float),
                            "o_r2y": (d.o * d.r2y).fillna(0), "o_s_r2y": (d.o * d.s_usd * d.r2y).fillna(0), "r2na": d.r2y.isna().astype(float),
                            "o_r10y": (d.o * d.r10y).fillna(0), "r10na": d.r10y.isna().astype(float)}, index=d.index)
    X["L4"] = pd.concat([pd.DataFrame({"lvix": np.log(d.vix), "vixr": (d.vix / d.vix3m).fillna(1), "vixrna": d.vix3m.isna().astype(float),
                                       "slope": d.slope, "d2y63": d.d2y63, "o_s_d2y": d.o * d.s_usd * d.d2y63}, index=d.index),
                         pd.get_dummies(d.event, prefix="ev", dtype=float)], axis=1)
    return X


def fit_predict(Xtr, ytr, Xte, multi=False, gbm=False):
    if gbm:
        m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=200, random_state=0)
        m.fit(Xtr, ytr)
        return m.predict_proba(Xte)
    sc = StandardScaler().fit(Xtr)
    m = LogisticRegression(C=1.0, max_iter=3000)
    m.fit(sc.transform(Xtr), ytr)
    return m.predict_proba(sc.transform(Xte))


def losses(P, y, k):
    Y = np.eye(k)[y]
    br = ((P - Y) ** 2).sum(1)
    ll = -np.log(np.clip(P[np.arange(len(y)), y], 1e-12, 1))
    return br, ll


def block_boot(diff, dates, reps=500, block=5):
    """Mean of diff with a moving-block bootstrap over consecutive dates (5-day blocks)."""
    df = pd.DataFrame({"d": dates, "x": diff}).groupby("d").x.agg(["sum", "count"])
    s, c = df["sum"].to_numpy(), df["count"].to_numpy()
    n = len(s)
    nb = int(np.ceil(n / block))
    starts = RNG.integers(0, n - block + 1, size=(reps, nb))
    idx = (starts[:, :, None] + np.arange(block)).reshape(reps, -1)[:, :n]
    return s[idx].sum(1) / c[idx].sum(1)


def calib(p, y, bins=10):
    q = pd.qcut(p, bins, labels=False, duplicates="drop")
    t = pd.DataFrame({"q": q, "p": p, "y": y}).groupby("q").agg(p=("p", "mean"), y=("y", "mean"), n=("y", "size"))
    return float((t.p - t.y).abs().max() * 100), t


def ladder(d, prof_cum):
    X = layer_features(d, prof_cum)
    tasks = {"CONT|res": (d.lab.isin(["CONT", "REV"]), lambda s: (s.lab == "REV").astype(int), 2),
             "CONS": (d.lab != "AMB", lambda s: (s.lab == "CONS").astype(int), 2),
             "RACE": (d.lab != "AMB", lambda s: s.lab.map({"CONT": 0, "REV": 1, "CONS": 2}).astype(int), 3)}
    order = ["L0", "L1", "L2", "L3", "L4"]
    report, preds_store = {}, {}
    for tname, (mask, ylab, k) in tasks.items():
        sub = d[mask]
        y = ylab(sub).to_numpy()
        P = {m: np.zeros((len(sub), k)) for m in order + ["GBM_L4"]}
        test_mask = np.zeros(len(sub), bool)
        for year in ("2022", "2023", "2024"):
            tr = (sub.date < f"{year}-01-01").to_numpy()
            te = (sub.date.str[:4] == year).to_numpy()
            test_mask |= te
            # L0: instrument x hour frequencies, shrunk to the class x hour rate (m = 50)
            t = sub[tr].assign(y=y[tr])
            for c in range(k):
                t[f"c{c}"] = (t.y == c).astype(float)
            ch = t.groupby(["cls", "h"])[[f"c{c}" for c in range(k)]].mean()
            ih = t.groupby(["inst", "h"])[[f"c{c}" for c in range(k)]].agg(["sum", "count"])
            tt = sub[te]
            p0 = np.zeros((te.sum(), k))
            for c in range(k):
                prior = ch[f"c{c}"].reindex(pd.MultiIndex.from_arrays([tt.cls, tt.h])).to_numpy()
                sm = ih[(f"c{c}", "sum")].reindex(pd.MultiIndex.from_arrays([tt.inst, tt.h])).fillna(0).to_numpy()
                cnt = ih[(f"c{c}", "count")].reindex(pd.MultiIndex.from_arrays([tt.inst, tt.h])).fillna(0).to_numpy()
                p0[:, c] = (sm + 50 * prior) / (cnt + 50)
            P["L0"][te] = p0 / p0.sum(1, keepdims=True)
            cols = []
            for L in ("L1", "L2", "L3", "L4"):
                cols.append(X[L].loc[sub.index])
                Xl = pd.concat(cols, axis=1).to_numpy(float)
                P[L][te] = fit_predict(Xl[tr], y[tr], Xl[te])
            P["GBM_L4"][te] = fit_predict(Xl[tr], y[tr], Xl[te], gbm=True)
        yt, dt, ct = y[test_mask], sub.date.to_numpy()[test_mask], sub.cls.to_numpy()[test_mask]
        L = {m: losses(P[m][test_mask], yt, k) for m in P}
        rep = {"n_test": int(test_mask.sum()), "dates": int(pd.unique(dt).size), "layers": {}}
        prev = None
        for m in order + ["GBM_L4"]:
            br, ll = L[m]
            e = {"brier": float(br.mean()), "logloss": float(ll.mean())}
            ref = "L0" if m in ("L1", "GBM_L4") else prev
            for refname, refm in (("vs_prev", ref), ("vs_L0", "L0")):
                if m == "L0" or refm is None:
                    continue
                for metric, idx in (("brier", 0), ("logloss", 1)):
                    diff = L[refm][idx] - L[m][idx]
                    bs = block_boot(diff, dt) / L[refm][idx].mean()
                    e[f"skill_{metric}_{refname}_%"] = round(100 * diff.mean() / L[refm][idx].mean(), 3)
                    e[f"ci_{metric}_{refname}_%"] = [round(100 * np.quantile(bs, 0.025), 3), round(100 * np.quantile(bs, 0.975), 3)]
            byc = {}
            for c in np.unique(ct):
                mm = ct == c
                if m != "L0":
                    refm = "L0" if m in ("L1", "GBM_L4") else prev
                    diff = L[refm][0][mm] - L[m][0][mm]
                    bs = block_boot(diff, dt[mm]) / L[refm][0][mm].mean()
                    byc[c] = {"skill_brier_vs_prev_%": round(100 * diff.mean() / L[refm][0][mm].mean(), 3),
                              "ci": [round(100 * np.quantile(bs, 0.025), 3), round(100 * np.quantile(bs, 0.975), 3)], "n": int(mm.sum())}
            e["by_class"] = byc
            if k == 2:
                mx, tab = calib(P[m][test_mask][:, 1], yt)
                e["calib_max_decile_gap_pp"] = round(mx, 2)
                e["pred_range_p10_p90"] = [round(float(np.quantile(P[m][test_mask][:, 1], q)), 4) for q in (0.1, 0.9)]
            else:
                e["calib_max_decile_gap_pp"] = {cn: round(calib(P[m][test_mask][:, c], (yt == c).astype(float))[0], 2) for c, cn in enumerate(["CONT", "REV", "CONS"])}
            rep["layers"][m] = e
            if m.startswith("L") and m != "L0":
                prev = m
            elif m == "L0":
                prev = "L0"
        report[tname] = rep
        preds_store[tname] = (sub[test_mask][["inst", "cls", "date", "h", "lab"]].reset_index(drop=True), {m: P[m][test_mask] for m in P})
    return report, preds_store


def econ(preds_store):
    """Research translation only (not a strategy): for the best direction model, CONT - REV share (pp of all rows) in the
    top / bottom predicted deciles vs the class cost/u at H = 2h."""
    meta, P = preds_store["RACE"]
    cost = pd.read_csv(COST).groupby("cls")["cost/u median"].median()
    out = {}
    for m in ("L0", "L2", "L4", "GBM_L4"):
        edge = P[m][:, 0] - P[m][:, 1]
        t = meta.assign(edge=edge)
        t["dec"] = t.groupby("cls").edge.transform(lambda s: pd.qcut(s, 10, labels=False, duplicates="drop"))
        rows = {}
        for c, g in t.groupby("cls"):
            top, bot = g[g.dec == g.dec.max()], g[g.dec == 0]
            rows[c] = {"top_decile_CONTminusREV_pp": round(100 * ((top.lab == "CONT").mean() - (top.lab == "REV").mean()), 2),
                       "bottom_decile_REVminusCONT_pp": round(100 * ((bot.lab == "REV").mean() - (bot.lab == "CONT").mean()), 2),
                       "cost_over_u_pp": round(100 * cost[c], 1)}
        out[m] = rows
    return out


def run():
    d = load()
    prof = json.loads((SUM / "discovery_profile.json").read_text())
    prof_cum = {c: {h: sum(prof["share"][c][f"{hh}|1"] for hh in range(0, h) if f"{hh}|1" in prof["share"][c]) for h in range(2, 22)} for c in prof["share"]}
    v = d[d.val]
    A = robustness(v, fam_a(v))
    pa = [A[k]["p"] for k in A]
    for k, ph in zip(A, holm(pa)):
        A[k]["p_holm"] = ph
    B, rep = fam_b(v)
    lad, store = ladder(d, prof_cum)
    ec = econ(store)
    cost = pd.read_csv(COST)
    write(A, B, rep, lad, ec, cost, v)


def write(A, B, rep, lad, ec, cost, v):
    rows = []
    for k, r in A.items():
        merits = (r["p_holm"] < 0.05) and abs(r["size_pp"]) >= 3 and np.sign(r["half1_pp"]) == np.sign(r["half2_pp"]) == np.sign(r["size_pp"]) \
                 and (np.isnan(r["inst_same_sign_%"]) or r["inst_same_sign_%"] >= 60)
        verdict = ("passes Validation criteria (Confirmation still required)" if merits else
                   "significant, below the 3pp size bar or inconsistent: research finding" if r["p_holm"] < 0.05 else
                   "null at Validation")
        rows.append({"hypothesis": k, "outcome": r["outcome"], "effect_pp": round(r["eff_pp"], 2), "ci95": f"[{r['lo']:.2f}, {r['hi']:.2f}]" if np.isfinite(r["lo"]) else "-",
                     "size_pp": round(r["size_pp"], 2), "p": f"{r['p']:.2g}", "p_holm": f"{r['p_holm']:.2g}", "n": r["n"], "dates": r["dates"],
                     "half1/half2_pp": f"{r['half1_pp']:.2f} / {r['half2_pp']:.2f}" if np.isfinite(r["half1_pp"]) else "-",
                     "inst_same_sign_%": round(r["inst_same_sign_%"], 0) if np.isfinite(r["inst_same_sign_%"]) else "-",
                     "amb_bounds_pp": r.get("amb_bounds_pp", "-"), "verdict": verdict})
    TA = pd.DataFrame(rows)
    subs = {k: {kk: (vv if not isinstance(vv, dict) else {a: (round(b, 4) if isinstance(b, float) else b) for a, b in vv.items()}) for kk, vv in r["sub"].items()}
            for k, r in A.items() if "sub" in r}
    md = ["# INTRADAY-EXTREME-PATHS - Stage 2 results (Validation 2022-2024)", "",
          "Population: large-move rows, bands asia-ny (h 2-18), H = 2 h, barrier 1.0u, Validation 2022-01-01..2024-12-31.",
          f"Rows: {len(v):,} ({v.date.nunique()} dates). Effects are percentage points with date-clustered 95% intervals.", "",
          "## Family A (Holm across A1-A10)", "```", TA.to_string(index=False), "```", "",
          "Sub-tests inside A7 / A8 / A9 / A10 (each hypothesis's p is Bonferroni over its sub-tests):", "```", json.dumps(subs, indent=1, default=str), "```", "",
          "## Family B (12 interaction Wald tests, BH-FDR 10%)", "```", B.round(4).to_string(index=False), "```", "",
          "Prior-day level replication (alone at 0.05):", "```", json.dumps(rep, indent=1, default=float), "```", "",
          "## Model ladder (walk-forward yearly refits; test = Validation years; skills in % of the reference loss)"]
    for t, r in lad.items():
        md += [f"### {t}  (n_test {r['n_test']:,}, {r['dates']} dates)", "```"]
        rowsL = []
        for m, e in r["layers"].items():
            rowsL.append({"layer": m, "brier": round(e["brier"], 5), "logloss": round(e["logloss"], 5),
                          "skill_brier_vs_prev": e.get("skill_brier_vs_prev_%", "-"), "ci": e.get("ci_brier_vs_prev_%", "-"),
                          "skill_ll_vs_prev": e.get("skill_logloss_vs_prev_%", "-"), "ci_ll": e.get("ci_logloss_vs_prev_%", "-"),
                          "skill_brier_vs_L0": e.get("skill_brier_vs_L0_%", "-"), "calib_gap_pp": e["calib_max_decile_gap_pp"],
                          "pred_p10_p90": e.get("pred_range_p10_p90", "-")})
        md += [pd.DataFrame(rowsL).to_string(index=False), "```", "By class (Brier skill vs previous layer, 95% CI):", "```"]
        bc = {m: e["by_class"] for m, e in r["layers"].items() if e["by_class"]}
        md += [pd.DataFrame({m: {c: f"{x['skill_brier_vs_prev_%']:+.2f} [{x['ci'][0]:+.2f},{x['ci'][1]:+.2f}]" for c, x in bc[m].items()} for m in bc}).to_string(), "```", ""]
    md += ["## Research translation (not a strategy): CONT-REV share in extreme predicted deciles vs cost/u (pp of the barrier)", "```",
           json.dumps(ec, indent=1), "```", "",
           "## Cost table used (2x the registered LINE_TOUCH_COST table; `estimated` = not from the registered table)", "```",
           cost.to_string(index=False), "```"]
    (SUM / "STAGE2.md").write_text("\n".join(md), encoding="utf-8")
    (SUM / "stage2.json").write_text(json.dumps({"A": {k: {kk: vv for kk, vv in r.items() if kk != "rows"} for k, r in A.items()},
                                                  "B": B.to_dict("records"), "replication": rep, "ladder": lad, "econ": ec}, indent=1, default=str), encoding="utf-8")
    print("\n".join(md).encode("ascii", "replace").decode())


if __name__ == "__main__":
    {"edges": edges, "run": run}[sys.argv[1]]()
