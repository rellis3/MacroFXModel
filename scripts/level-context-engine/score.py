"""level-context-engine: score the touch events (forge/LEVEL_CONTEXT_ENGINE_PREREG.md).

    python scripts/level-context-engine/score.py   -> analysis/output/level-context-engine/{RESULTS inputs}

Primary H1-H5 + H6 (cell engine fitted 2020-23, traded 2024-26 vs the same procedure on the placebo ladder), BH q=0.10
over six; descriptive matrix with cluster-robust SEs and BH q-values; CFDs as a gross replication.
"""
from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/level-context-engine"
SEED, B = 20261125, 1000
Z90 = 1.6449
TOD = [(0, 420, "00-07 Asia"), (420, 600, "07-10 LDN open"), (600, 780, "10-13 LDN"),
       (780, 960, "13-16 NY overlap"), (960, 1320, "16-22 NY pm")]
FAM_PRI = {"HighLow": 0, "Close": 1, "HLproj": 2}
HALVES = {"2020-22": (2020, 2022), "2023-26": (2023, 2026)}
COLS = ["sym", "track", "date", "kind", "family", "line", "tier", "approach", "touch_n", "bar", "minute", "outcome",
        "exit_bar", "R_cont", "R_fade", "prior30", "consumed", "vol_reg", "trend_agree", "prev_same", "mfe15", "mae15",
        "mfe30", "mae30", "mfe60", "mae60", "mfe120", "mae120", "inner_gap", "inner_out", "ladder_up", "cost_R", "sig_px",
        "tick"]


def bucket(x, edges, labels):
    return pd.cut(x, [-np.inf] + list(edges) + [np.inf], labels=labels, right=False).astype(str)


def load(track):
    fs = sorted((OUT / "events").glob(f"{track}_*.parquet"))
    if not fs:
        return None
    D = pd.concat([pd.read_parquet(f, columns=COLS) for f in fs], ignore_index=True)
    D["date"] = pd.to_datetime(D["date"])
    D["year"] = D["date"].dt.year
    D["tod"] = "na"
    for a, b, lab in TOD:
        D.loc[(D.minute >= a) & (D.minute < b), "tod"] = lab
    D["tn"] = np.where(D.touch_n >= 4, "4+", D.touch_n.astype(str))
    D["tn3"] = np.where(D.touch_n >= 3, "3+", D.touch_n.astype(str))
    D["prior_b"] = bucket(D.prior30, [0.15, 0.35], ["slow", "normal", "fast"])
    D["cons_b"] = bucket(D.consumed, [0.6, 0.9, 1.2], ["<0.6", "0.6-0.9", "0.9-1.2", ">1.2"])
    D["vol_b"] = np.where(D.vol_reg.isna(), "na", bucket(D.vol_reg, [0.85, 1.15], ["low", "mid", "high"]))
    D["trend_b"] = np.where(D.trend_agree.isna(), "na", np.where(D.trend_agree == True, "with", "against"))  # noqa: E712
    D["speed_b"] = np.where(D.inner_gap.isna(), "na", np.where(D.inner_gap <= 30, "fast<=30m", "slow>30m"))
    D["cont"] = (D.outcome == "cont").astype(float)
    D["rej"] = (D.outcome == "rej").astype(float)
    D["cons"] = (D.outcome == "cons").astype(float)
    D["Rc"] = D.R_cont - D.cost_R
    D["Rf"] = D.R_fade - D.cost_R
    for c in ("mfe", "mae"):
        for w in (15, 30, 60, 120):
            D[f"{c}{w}_t"] = D[f"{c}{w}"] * D.sig_px / D.tick
    return D


# ------------------------------------------------------------------------------------------------ cluster bootstrap
def cboot(df, groups, stat, seed=SEED, B=B):
    """groups: list of (mask, col). stat(s, n) on totals (..., G). Resample London dates."""
    dates, codes = np.unique(df["date"].to_numpy(), return_inverse=True)
    nd, G = len(dates), len(groups)
    S, N = np.zeros((nd, G)), np.zeros((nd, G))
    for g, (mask, col) in enumerate(groups):
        mk = np.asarray(mask, bool)
        S[:, g] = np.bincount(codes[mk], weights=df[col].to_numpy(float)[mk], minlength=nd)
        N[:, g] = np.bincount(codes[mk], minlength=nd)
    est = float(stat(S.sum(0), N.sum(0)))
    rng = np.random.default_rng(seed)
    bs = np.empty(B)
    for b0 in range(0, B, 100):
        idx = rng.integers(0, nd, (min(100, B - b0), nd))
        bs[b0:b0 + len(idx)] = stat(S[idx].sum(1), N[idx].sum(1))
    bs = bs[np.isfinite(bs)]
    p = float(min(1.0, 2 * min((bs <= 0).mean(), (bs >= 0).mean()))) if len(bs) else np.nan
    return {"est": est, "ci": [float(np.quantile(bs, .05)), float(np.quantile(bs, .95))] if len(bs) else [np.nan] * 2,
            "p": p, "n": int(N.sum(0)[0])}


def mean_of(df, mask, col, seed=SEED):
    return cboot(df, [(mask, col)], lambda s, n: s[..., 0] / n[..., 0], seed)


def diff_of(df, m1, m2, col, seed=SEED):
    return cboot(df, [(m1, col), (m2, col)], lambda s, n: s[..., 0] / n[..., 0] - s[..., 1] / n[..., 1], seed)


def did_of(df, a, b, c, d, col, seed=SEED):
    """(a - b) - (c - d)"""
    return cboot(df, [(a, col), (b, col), (c, col), (d, col)],
                 lambda s, n: (s[..., 0] / n[..., 0] - s[..., 1] / n[..., 1]) - (s[..., 2] / n[..., 2] - s[..., 3] / n[..., 3]),
                 seed)


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    ok = np.isfinite(ps)
    out = np.full(len(ps), np.nan)
    if not ok.any():
        return out
    p = ps[ok]
    o = np.argsort(p)
    m = len(p)
    adj = np.minimum.accumulate((p[o] * m / np.arange(1, m + 1))[::-1])[::-1]
    r = np.empty(m); r[o] = np.minimum(adj, 1)
    out[ok] = r
    return out


# ------------------------------------------------------------------------------------- analytic cluster SE per cell
def cell_table(D, by, cols=("cont", "rej", "cons", "Rc", "Rf")):
    """Per cell: n, mean and cluster-robust SE (dates) for each col, for line; plus line - placebo for cont and best R."""
    out = {}
    for kind in ("line", "placebo"):
        X = D[D.kind == kind]
        if X.empty:
            out[kind] = out["line"].iloc[:0].reindex(out["line"].index)
            continue
        g = X.groupby(list(by) + ["date"])
        agg = g[list(cols)].sum()
        cnt = g.size().rename("n_d")
        A = agg.join(cnt)
        tot = A.groupby(level=list(range(len(by)))).sum()
        res = pd.DataFrame({"n": tot["n_d"]})
        for c in cols:
            m = tot[c] / tot["n_d"]
            A2 = A.join(m.rename("m"), on=list(by))
            e2 = ((A2[c] - A2["m"] * A2["n_d"]) ** 2).groupby(level=list(range(len(by)))).sum()
            res[c] = m
            res[c + "_se"] = np.sqrt(e2) / tot["n_d"]
        out[kind] = res
    L_, P_ = out["line"], out["placebo"].add_prefix("pl_")
    T = L_.join(P_, how="left")
    for c in [x for x in ("cont", "Rc", "Rf") if x in cols]:
        T[c + "_vs_pl"] = T[c] - T["pl_" + c]
        T[c + "_vs_pl_se"] = np.sqrt(T[c + "_se"] ** 2 + T["pl_" + c + "_se"] ** 2)   # conservative (ignores + cov)
    return T.reset_index()


def zp(est, se):
    from math import erf, sqrt
    z = np.abs(np.asarray(est) / np.asarray(se))
    return np.array([2 * (1 - 0.5 * (1 + erf(v / sqrt(2)))) if np.isfinite(v) else np.nan for v in z])


def excursion_table(D, by):
    X = D[D.kind == "line"]
    f = {}
    for c in ("mfe", "mae"):
        for w in (15, 30, 60, 120):
            f[f"{c}{w}_med"] = (f"{c}{w}", "median")
            f[f"{c}{w}_p90"] = (f"{c}{w}", lambda s: s.quantile(.9))
    f["mae60_p75"] = ("mae60", lambda s: s.quantile(.75))
    f["mfe60_p75"] = ("mfe60", lambda s: s.quantile(.75))
    return X.groupby(list(by)).agg(**f).reset_index()


# ------------------------------------------------------------------------------------------------------- engine
ENG_KEY = ["family", "tier", "tod", "tn3", "approach", "cons_b"]


def occupancy(T):
    """One open position per instrument: earliest signal first; ties P90 > P75 > Median, High/Low > Close > HL."""
    T = T.assign(_pr=-T.tier, _fp=T.family.map(FAM_PRI)).sort_values(["sym", "date", "bar", "_pr", "_fp"])
    keep = np.zeros(len(T), bool)
    sym, dt, bar, ex = T.sym.to_numpy(), T.date.to_numpy(), T.bar.to_numpy(), T.exit_bar.to_numpy()
    last = (None, None, -1)
    for k in range(len(T)):
        if (sym[k], dt[k]) != last[:2]:
            last = (sym[k], dt[k], -1)
        if bar[k] > last[2]:
            keep[k] = True
            last = (sym[k], dt[k], ex[k])
    return T[keep]


def engine(D):
    res = {}
    trades = []
    cells_out = {}
    for kind in ("line", "placebo"):
        X = D[D.kind == kind]
        tr = X[X.year <= 2023]
        C = cell_table(tr.assign(kind="line"), ENG_KEY, cols=("Rc", "Rf"))   # stats within this ladder
        C["lo_c"] = C.Rc - Z90 * C.Rc_se
        C["lo_f"] = C.Rf - Z90 * C.Rf_se
        C["side"] = np.where((C.n >= 150) & (C.lo_c > 0) & (C.Rc >= C.Rf), "cont",
                             np.where((C.n >= 150) & (C.lo_f > 0), "fade", ""))
        sel = C[C.side != ""][ENG_KEY + ["side", "n", "Rc", "Rf", "lo_c", "lo_f"]]
        cells_out[kind] = sel
        te = X[X.year >= 2024].merge(sel[ENG_KEY + ["side"]], on=ENG_KEY, how="inner")
        te = occupancy(te)
        te["R"] = np.where(te.side == "cont", te.Rc, te.Rf)
        te["kind"] = kind
        trades.append(te)
    T = pd.concat(trades, ignore_index=True)
    ln, pl = (T.kind == "line").to_numpy(), (T.kind == "placebo").to_numpy()
    res["cells_line"] = len(cells_out["line"]); res["cells_placebo"] = len(cells_out["placebo"])
    res["trades_line"] = int(ln.sum()); res["trades_placebo"] = int(pl.sum())
    if ln.sum() and pl.sum():
        res["H6a"] = mean_of(T, ln, "R")
        res["H6b"] = diff_of(T, ln, pl, "R")
        res["H6a_years"] = {lab: mean_of(T, ln & (T.year >= a).to_numpy() & (T.year <= b).to_numpy(), "R")["est"]
                            for lab, (a, b) in {"2024": (2024, 2024), "2025-26": (2025, 2026)}.items()}
        res["by_side"] = T[ln].groupby("side")["R"].agg(["size", "mean"]).round(4).to_dict()
    return res, cells_out, T


def design(X, cols_cat, levels=None):
    parts, lv = [], {} if levels is None else levels
    for c in cols_cat:
        v = X[c].astype(str)
        if levels is None:
            lv[c] = sorted(v.unique())
        for lvl in lv[c][1:]:
            parts.append((v == lvl).to_numpy(float))
    return np.column_stack([np.ones(len(X))] + parts), lv


def model_engine(D):
    """Ridge regressions of Rc and Rf (gross) on context + tier x time / tier x consumed, fit 2020-23, trade 2024-26."""
    cats = ["family", "tier", "tod", "tn", "approach", "cons_b", "prior_b", "vol_b", "trend_b", "prev_same",
            "tier_tod", "tier_cons"]
    D = D.assign(tier_tod=D.tier.astype(str) + D.tod, tier_cons=D.tier.astype(str) + D.cons_b)
    res, trades = {}, []
    for kind in ("line", "placebo"):
        X = D[D.kind == kind]
        tr, te = X[X.year <= 2023], X[X.year >= 2024].copy()
        A, lv = design(tr, cats)
        At, _ = design(te, cats, lv)
        lam = 50.0 * np.eye(A.shape[1]); lam[0, 0] = 0
        pc = At @ np.linalg.solve(A.T @ A + lam, A.T @ tr.R_cont.to_numpy(float))
        pf = At @ np.linalg.solve(A.T @ A + lam, A.T @ tr.R_fade.to_numpy(float))
        # out-of-sample AUC for continuation vs rejection (resolved touches)
        rs = te.outcome.isin(["cont", "rej"]).to_numpy()
        y, s = (te.outcome[rs] == "cont").to_numpy(), pc[rs]
        r = pd.Series(s).rank().to_numpy()
        auc = (r[y].sum() - y.sum() * (y.sum() + 1) / 2) / (y.sum() * (~y).sum())
        res[f"auc_{kind}"] = float(auc)
        cost = te.cost_R.to_numpy()
        side = np.where((pc - cost > 0) & (pc >= pf), "cont", np.where(pf - cost > 0, "fade", ""))
        te["side"] = side
        te = occupancy(te[te.side != ""])
        te["R"] = np.where(te.side == "cont", te.Rc, te.Rf)
        te["kind"] = kind
        trades.append(te)
    T = pd.concat(trades, ignore_index=True)
    ln, pl = (T.kind == "line").to_numpy(), (T.kind == "placebo").to_numpy()
    res["trades_line"], res["trades_placebo"] = int(ln.sum()), int(pl.sum())
    if ln.sum() and pl.sum():
        res["line"] = mean_of(T, ln, "R")
        res["line_minus_placebo"] = diff_of(T, ln, pl, "R")
    return res


# ------------------------------------------------------------------------------------------------------- primaries
def primaries(D):
    k = D.kind.to_numpy()
    L_, P_ = k == "line", k == "placebo"
    out = {}
    ins = (D.approach == "in").to_numpy()
    # H1
    m = ins & (D.tier == 50).to_numpy() & (D.touch_n == 1).to_numpy() & (D.minute < 600).to_numpy()
    out["H1"] = {"stat": "continue net R, Median, 1st inside touch, 00-10 London",
                 "line": mean_of(D, m & L_, "Rc"), "vs_placebo": diff_of(D, m & L_, m & P_, "Rc"),
                 "gross_line": float(D.loc[m & L_, "R_cont"].mean()),
                 "cont_rate": float(D.loc[m & L_, "cont"].mean()), "rej_rate": float(D.loc[m & L_, "rej"].mean()),
                 "halves": {h: diff_of(D, m & L_ & yr(D, a, b), m & P_ & yr(D, a, b), "Rc")["est"] for h, (a, b) in HALVES.items()},
                 "halves_line": {h: mean_of(D, m & L_ & yr(D, a, b), "Rc")["est"] for h, (a, b) in HALVES.items()},
                 "mirror": {f: mean_of(D, m & L_ & (D.family == f).to_numpy(), "Rc")["est"] for f in FAM_PRI}}
    # H2
    m = ins & D.tier.isin([75, 90]).to_numpy() & (D.minute >= 780).to_numpy()
    out["H2"] = {"stat": "fade net R, P75+P90, inside touches, 13-22 London",
                 "line": mean_of(D, m & L_, "Rf"), "vs_placebo": diff_of(D, m & L_, m & P_, "Rf"),
                 "gross_line": float(D.loc[m & L_, "R_fade"].mean()),
                 "cont_rate": float(D.loc[m & L_, "cont"].mean()), "rej_rate": float(D.loc[m & L_, "rej"].mean()),
                 "halves": {h: diff_of(D, m & L_ & yr(D, a, b), m & P_ & yr(D, a, b), "Rf")["est"] for h, (a, b) in HALVES.items()},
                 "halves_line": {h: mean_of(D, m & L_ & yr(D, a, b), "Rf")["est"] for h, (a, b) in HALVES.items()},
                 "mirror": {f: mean_of(D, m & L_ & (D.family == f).to_numpy(), "Rf")["est"] for f in FAM_PRI}}
    # H3
    hi, lo = (D.cons_b == ">1.2").to_numpy() & ins, (D.cons_b == "<0.6").to_numpy() & ins
    out["H3"] = {"stat": "P(rejection), range consumed >1.2 minus <0.6, inside touches",
                 "line": diff_of(D, hi & L_, lo & L_, "rej"),
                 "vs_placebo": did_of(D, hi & L_, lo & L_, hi & P_, lo & P_, "rej"),
                 "halves": {h: did_of(D, hi & L_ & yr(D, a, b), lo & L_ & yr(D, a, b), hi & P_ & yr(D, a, b),
                                      lo & P_ & yr(D, a, b), "rej")["est"] for h, (a, b) in HALVES.items()},
                 "halves_line": {h: diff_of(D, hi & L_ & yr(D, a, b), lo & L_ & yr(D, a, b), "rej")["est"] for h, (a, b) in HALVES.items()}}
    # H4
    t2, t1 = (D.touch_n >= 2).to_numpy(), (D.touch_n == 1).to_numpy()
    out["H4"] = {"stat": "P(continuation), touch 2+ minus touch 1",
                 "line": diff_of(D, t2 & L_, t1 & L_, "cont"),
                 "vs_placebo": did_of(D, t2 & L_, t1 & L_, t2 & P_, t1 & P_, "cont"),
                 "halves": {h: did_of(D, t2 & L_ & yr(D, a, b), t1 & L_ & yr(D, a, b), t2 & P_ & yr(D, a, b),
                                      t1 & P_ & yr(D, a, b), "cont")["est"] for h, (a, b) in HALVES.items()}}
    # H5
    p90 = (D.tier == 90).to_numpy()
    fa, sl = p90 & (D.speed_b == "fast<=30m").to_numpy(), p90 & (D.speed_b == "slow>30m").to_numpy()
    out["H5"] = {"stat": "P(continuation) at P90, fast ladder (P75 <=30 min earlier) minus slow",
                 "line": diff_of(D, fa & L_, sl & L_, "cont"),
                 "vs_placebo": did_of(D, fa & L_, sl & L_, fa & P_, sl & P_, "cont"),
                 "halves": {h: did_of(D, fa & L_ & yr(D, a, b), sl & L_ & yr(D, a, b), fa & P_ & yr(D, a, b),
                                      sl & P_ & yr(D, a, b), "cont")["est"] for h, (a, b) in HALVES.items()}}
    return out


def yr(D, a, b):
    return ((D.year >= a) & (D.year <= b)).to_numpy()


def verdicts(P, E):
    ps = [P["H1"]["vs_placebo"]["p"], P["H2"]["vs_placebo"]["p"], P["H3"]["vs_placebo"]["p"],
          P["H4"]["vs_placebo"]["p"], P["H5"]["vs_placebo"]["p"], E.get("H6b", {}).get("p", np.nan)]
    q = bh(ps)
    V = {}
    for i, h in enumerate(("H1", "H2", "H3")):
        x = P[h]
        lo_l, lo_p, hi_p = x["line"]["ci"][0], x["vs_placebo"]["ci"][0], x["vs_placebo"]["ci"][1]
        same = all(v > 0 for v in x["halves"].values())
        thr = 0.02 if h != "H3" else 0.01
        if lo_l > 0 and lo_p > 0 and same and q[i] <= 0.10:
            V[h] = "VALIDATED"
        elif hi_p < thr:
            V[h] = "NULL"
        else:
            V[h] = "UNDERPOWERED"
    for i, h in ((3, "H4"), (4, "H5")):
        x = P[h]["vs_placebo"]
        if (x["ci"][0] > 0 or x["ci"][1] < 0) and q[i] <= 0.10:
            V[h] = "CONTEXT"
        elif x["ci"][0] > -0.01 and x["ci"][1] < 0.01:
            V[h] = "NULL"
        else:
            V[h] = "UNDERPOWERED"
    if "H6b" in E:
        a, b_ = E["H6a"], E["H6b"]
        yrs_ok = all(v > 0 for v in E["H6a_years"].values())
        if a["ci"][0] > 0 and b_["ci"][0] > 0 and q[5] <= 0.10 and yrs_ok:
            V["H6"] = "VALIDATED"
        elif b_["ci"][1] < 0.02:
            V["H6"] = "NULL"
        else:
            V["H6"] = "UNDERPOWERED"
    else:
        V["H6"] = "NULL (no cell passed the train screen)"
    return V, dict(zip(["H1", "H2", "H3", "H4", "H5", "H6b"], [None if not np.isfinite(v) else float(v) for v in q]))


def main():
    res = {"seed": SEED}
    for track in ("F", "C"):
        D = load(track)
        if D is None:
            continue
        print(track, len(D), "events", flush=True)
        P = primaries(D)
        E, cells, T = engine(D)
        Eg, cells_g, _ = engine(D.assign(Rc=D.R_cont, Rf=D.R_fade))          # descriptive: before costs
        for kind, sel in cells_g.items():
            sel.to_csv(OUT / f"engine_cells_gross_{track}_{kind}.csv", index=False)
        M = model_engine(D) if track == "F" else {}
        res[track] = {"primaries": P, "engine": E, "engine_gross": Eg, "model": M, "n_line": int((D.kind == "line").sum())}
        if track == "F":
            V, Q = verdicts(P, E)
            res["verdicts"], res["bh_q"] = V, Q
            for kind, sel in cells.items():
                sel.to_csv(OUT / f"engine_cells_{kind}.csv", index=False)
            T.to_parquet(OUT / "events" / "engine_trades.parquet")
        # descriptive matrix + margins
        mat = cell_table(D, ["family", "tier", "tod", "tn", "approach"])
        for c in ("Rc", "Rf", "cont_vs_pl"):
            mat[c + "_p"] = zp(mat[c], mat[c + "_se"]) if c != "cont_vs_pl" else zp(mat["cont_vs_pl"], mat["cont_vs_pl_se"])
        mat["best_side"] = np.where(mat.Rc >= mat.Rf, "cont", "fade")
        mat["best_R"] = np.maximum(mat.Rc, mat.Rf)
        mat["best_p"] = np.where(mat.Rc >= mat.Rf, mat.Rc_p, mat.Rf_p)
        mat["best_q"] = bh(mat.best_p)
        mat["cont_vs_pl_q"] = bh(mat.cont_vs_pl_p)
        mat = mat.merge(excursion_table(D, ["family", "tier", "tod", "tn", "approach"]), how="left")
        mat.to_csv(OUT / f"matrix_{track}.csv", index=False)
        res[track]["matrix_cells"] = len(mat)
        res[track]["matrix_best_q_pass"] = int((mat.best_q <= 0.10).sum())
        res[track]["matrix_best_q_pass_net_pos"] = int(((mat.best_q <= 0.10) & (mat.best_R > 0)).sum())
        res[track]["matrix_contvspl_q_pass"] = int((mat.cont_vs_pl_q <= 0.10).sum())
        margins = {}
        for name, by in {"tier_tod": ["tier", "tod"], "tier_family_tod": ["family", "tier", "tod"],
                         "tier_consumed": ["tier", "cons_b"], "tier_touch": ["tier", "tn"],
                         "tier_approach": ["tier", "approach"], "tier_prior": ["tier", "prior_b"],
                         "tier_vol": ["tier", "vol_b"], "tier_trend": ["tier", "trend_b"],
                         "tier_prev_same": ["tier", "prev_same"], "tier_inner_out": ["tier", "inner_out"],
                         "tier_speed": ["tier", "speed_b"], "tier_tod_consumed": ["tier", "tod", "cons_b"],
                         "median_tod_touch_approach": ["tier", "tod", "tn", "approach"]}.items():
            X = D if name != "median_tod_touch_approach" else D[D.tier == 50]
            mg = cell_table(X, by).merge(excursion_table(X, by), how="left")
            mg["cont_vs_pl_q"] = bh(zp(mg.cont_vs_pl, mg.cont_vs_pl_se))
            mg.to_csv(OUT / f"margin_{track}_{name}.csv", index=False)
            margins[name] = mg
        # ladder race at the first inside P75 touch
        lr = D[D.ladder_up.notna()]
        lrt = lr.groupby(["kind", "tod"])["ladder_up"].agg(["size", "mean"]).unstack("kind")
        lrs = lr.groupby(["kind", "prior_b"])["ladder_up"].agg(["size", "mean"]).unstack("kind")
        lrt.to_csv(OUT / f"ladder_race_{track}_tod.csv"); lrs.to_csv(OUT / f"ladder_race_{track}_prior.csv")
        k_ = lr.kind.to_numpy()
        res[track]["ladder_race"] = {"line": mean_of(lr, k_ == "line", "ladder_up"),
                                     "vs_placebo": diff_of(lr, k_ == "line", k_ == "placebo", "ladder_up")}
        print(json.dumps(res[track]["primaries"], default=str)[:3000], flush=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=lambda o: float(o) if isinstance(o, np.floating) else str(o)))
    print(json.dumps({k: res.get(k) for k in ("verdicts", "bh_q")}, indent=1))
    print(json.dumps(res["F"]["engine"], indent=1, default=str))
    print(json.dumps(res["F"]["engine_gross"], indent=1, default=str))
    print(json.dumps(res.get("C", {}).get("engine"), indent=1, default=str))
    print(json.dumps(res["F"]["model"], indent=1, default=str))


if __name__ == "__main__":
    main()
