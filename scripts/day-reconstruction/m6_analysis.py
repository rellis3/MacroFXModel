"""Day reconstruction, milestone 6: next-rung reach calibration (Part A), p90 as an outer boundary (Part B) and touch
timing (Part C). Prereg: forge/DAY_RECON_REACH_CALIBRATION_PREREG.md (v6, frozen in d7ce9e06 before this file existed).

Inputs: the M2 archive (days/touches parquet, in git; path parquet, gitignored), M3's phantom-ladder touch outcomes
(gitignored) and M5's frozen approach features (m5/features.parquet: P1, P2 and M5's exclusions, real and phantom).

Part A fits logistic models per instrument x family on a walk-forward (test Y3-Y6, expanding window), refitting every
model inside every bootstrap replicate (one Poisson(1) weight per calendar date shared by all touches that date, forecast
and phantom alike; 20-session moving-block bootstrap as the sensitivity). Parts B and C are descriptive, with the
20-session moving-block bootstrap (B6 uses the paired date bootstrap).

    python scripts/day-reconstruction/m6_analysis.py
Env M6_DATA = checkout holding the gitignored inputs (archive/*_path.parquet, m3/*_phantom_outcomes.parquet).
"""
import json
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("M6_DATA", ROOT))
ARC_GIT = ROOT / "analysis/output/day-reconstruction/archive"
ARC_DATA = DATA / "analysis/output/day-reconstruction/archive"
M3_DATA = DATA / "analysis/output/day-reconstruction/m3"
M5 = ROOT / "analysis/output/day-reconstruction/m5"
OUT = Path(os.environ.get("M6_OUT", ROOT / "analysis/output/day-reconstruction/m6"))   # M6_OUT/M6_B: smoke test only
OUT.mkdir(parents=True, exist_ok=True)

NAMES = ["GOLD", "NQ", "EURUSD"]
FAMS = {"OH": ("Fixed", 1), "OL": ("Fixed", -1), "ProjH": ("Projected", 1), "ProjL": ("Projected", -1)}
GROUPS = ["Fixed", "Projected"]
PCT = {"OH": "oh_{}_pct", "OL": "ol_{}_pct", "ProjH": "hl_{}", "ProjL": "hl_{}"}
NEXT = {"p50": "p75", "p75": "p90"}
FACT4 = (0.70, 0.85, 1.15, 1.30)
W_B2 = np.linalg.pinv(np.array([[1, f - 1, (f - 1) ** 2] for f in FACT4]))[0]     # (-1/6, 2/3, 2/3, -1/6)
B = int(os.environ.get("M6_B", 2000))
SEED = 20261030
BLOCK = 20
PIT_YEARS = [f"{y}-08-21" for y in range(2020, 2027)]        # Y1 = [2020-08-21, 2021-08-21) ... Y6
IS_YEARS = [f"{y}-08-21" for y in range(2017, 2021)]         # S1 = [start, 2017-08-21) ... S4 = [2019-08-21, 2020-08-21)
WINDOWS = [(0, 8), (8, 13.5), (13.5, 17), (17, 24)]          # London clock; the last window runs to the session end
WNAMES = ["00:00-08:00", "08:00-13:30", "13:30-17:00", "17:00-22:00"]
CHUNK = 400


def year_of(dates, era):
    d = np.asarray(dates, dtype=str)
    if era == "pit":
        return np.searchsorted(np.array(PIT_YEARS), d, side="right")              # 1..6
    return np.searchsorted(np.array(IS_YEARS), d, side="right") + 1               # 1..4


# ── weights ────────────────────────────────────────────────────────────────────────────────────────────────────────
def poisson_weights(nd):
    rng = np.random.default_rng(SEED)
    return np.vstack([np.ones(nd), rng.poisson(1.0, (B, nd)).astype(float)])      # row 0 = point estimate


def block_weights(nd):
    rng = np.random.default_rng([SEED, 1])
    nb = int(np.ceil(nd / BLOCK))
    W = np.zeros((B + 1, nd))
    W[0] = 1
    starts = rng.integers(0, nd - BLOCK + 1, (B, nb))
    for b in range(B):
        cover = (starts[b][:, None] + np.arange(BLOCK)[None, :]).ravel()
        W[b + 1] = np.bincount(cover, minlength=nd)[:nd]
    return W


def ci(draws):
    lo, hi = np.nanpercentile(draws, [2.5, 97.5])
    return [float(lo), float(hi)]


def pval(draws):
    draws = draws[np.isfinite(draws)]
    return float(max(1.0 / B, min(1.0, 2 * min(np.mean(draws <= 0), np.mean(draws >= 0)))))


def summ(v, scale=1.0):
    """v: [B+1] (row 0 = point)."""
    return {"est": float(v[0] * scale), "ci": [x * scale for x in ci(v[1:])], "p": pval(v[1:])}


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    o = np.argsort(ps)
    ok = ps[o] <= q * np.arange(1, len(ps) + 1) / len(ps)
    k = np.max(np.flatnonzero(ok)) + 1 if ok.any() else 0
    res = np.zeros(len(ps), bool)
    res[o[:k]] = True
    return res


def wmean(x, W):
    """x [n] or [R, n]; W [R, n]."""
    s = W.sum(1)
    return (W * x).sum(1) / np.where(s > 0, s, np.nan)


def wquant(x, W, qs):
    """Weighted quantiles per replicate row. x [n], W [R, n] -> [R, len(qs)]."""
    o = np.argsort(x)
    xs, cw = x[o], np.cumsum(W[:, o], 1)
    tot = cw[:, -1:]
    out = np.full((len(W), len(qs)), np.nan)
    ok = tot[:, 0] > 0
    for j, q in enumerate(qs):
        idx = (cw < q * tot).sum(1)                      # first position whose cumulative weight reaches q x total
        out[ok, j] = xs[np.clip(idx[ok], 0, len(xs) - 1)]
    return out


# ── logistic fits, vectorised over replicates ──────────────────────────────────────────────────────────────────────
def expit(x):
    return 1.0 / (1.0 + np.exp(-np.clip(x, -35, 35)))


def logit_fit(X, y, W):
    """Ridge (1e-6 x n, intercept unpenalised) logistic fit for every weight row. X [n, p], y [n], W [R, n] -> [R, p]."""
    n, p = X.shape
    lam = 1e-6 * n
    pen = lam * np.eye(p)
    pen[0, 0] = 0
    Z = (X[:, :, None] * X[:, None, :]).reshape(n, p * p)
    out = np.zeros((len(W), p))
    for c0 in range(0, len(W), CHUNK):
        Wc = W[c0:c0 + CHUNK]
        beta = np.zeros((len(Wc), p))
        for _ in range(50):
            mu = expit(beta @ X.T)
            g = (Wc * (y - mu)) @ X - beta @ pen
            H = ((Wc * mu * (1 - mu)) @ Z).reshape(len(Wc), p, p) + pen
            step = np.linalg.solve(H + 1e-12 * np.eye(p), g[:, :, None])[:, :, 0]
            beta += step
            if np.abs(step).max() < 1e-9:
                break
        out[c0:c0 + CHUNK] = beta
    return out


def slope_fit(lp, y, W):
    """Calibration slope: logistic y ~ a + s * logit(p), with replicate-specific predictions lp [R, n]."""
    a = np.zeros(len(W))
    s = np.ones(len(W))
    for _ in range(50):
        mu = expit(a[:, None] + s[:, None] * lp)
        r = W * (y - mu)
        v = W * mu * (1 - mu)
        g0, g1 = r.sum(1), (r * lp).sum(1)
        h00, h01, h11 = v.sum(1), (v * lp).sum(1), (v * lp * lp).sum(1)
        det = h00 * h11 - h01 ** 2
        da = (h11 * g0 - h01 * g1) / det
        ds = (-h01 * g0 + h00 * g1) / det
        a += da
        s += ds
        if max(np.abs(da).max(), np.abs(ds).max()) < 1e-9:
            break
    return s


# ── data ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def load(name):
    days = pd.read_parquet(ARC_GIT / f"{name}_days.parquet")
    days["date"] = days.date.astype(str)
    real = pd.read_parquet(ARC_GIT / f"{name}_touches.parquet")
    real["date"] = real.date.astype(str)
    real["factor"] = 1.0
    ph = pd.read_parquet(M3_DATA / f"{name}_phantom_outcomes.parquet")
    ph["date"] = ph.date.astype(str)
    cols = [c for c in real.columns if c in ph.columns]
    t = pd.concat([real[cols + ["float32_tie"]], ph[cols].assign(float32_tie=False)], ignore_index=True)
    t = t[t.family.isin(FAMS)].copy()
    t["fkey"] = t.factor.round(2)
    feat = pd.read_parquet(M5 / "features.parquet")
    feat = feat[feat.instrument == name].copy()
    feat["date"] = feat.date.astype(str)
    feat["fkey"] = feat.factor.round(2)
    t = t.merge(feat[["date", "level", "fkey", "p1", "p2", "excluded"]], on=["date", "level", "fkey"], how="left",
                validate="one_to_one")
    assert t.excluded.notna().all(), "touch without an M5 feature row"
    d = days.set_index("date")
    t["group"] = t.family.map(lambda x: FAMS[x][0])
    t["s"] = t.family.map(lambda x: FAMS[x][1])
    t["u"] = t.hl_before_pct / t.date.map(d.hl_p50)                    # range used, on the REAL day's HL p50
    t["T"] = np.log1p(t.min_to_end)
    t["P1"] = np.log1p(t.p1)
    t["P2"] = t.p2
    # distance to the next rung (G) and the p90 - p75 step (B3), in sigma, at the touch bar, on each line set's own ladder
    nxt = t.rung.map(NEXT)
    pct_now = np.array([d.at[dt, PCT[fa].format(ru)] for dt, fa, ru in zip(t.date, t.family, t.rung)])
    pct_nxt = np.array([d.at[dt, PCT[fa].format(nx)] if isinstance(nx, str) else np.nan
                        for dt, fa, nx in zip(t.date, t.family, nxt)])
    p75 = np.array([d.at[dt, PCT[fa].format("p75")] for dt, fa in zip(t.date, t.family)])
    p90 = np.array([d.at[dt, PCT[fa].format("p90")] for dt, fa in zip(t.date, t.family)])
    base = np.where(t.family.isin(["OH", "OL"]), t.open,
                    np.where(t.family == "ProjH", t.run_lo_before, t.run_hi_before))
    t["d"] = base * t.factor * (pct_nxt - pct_now) / 100 / t.scale
    t["step_d"] = base * t.factor * (p90 - p75) / 100 / t.scale
    t["y"] = [float(pd.notna(getattr(r, f"next_{r.family}_{NEXT[r.rung]}_min"))) if r.rung in NEXT else np.nan
              for r in t[["family", "rung"] + [c for c in t.columns if c.startswith("next_")]].itertuples(index=False)]
    path = pd.read_parquet(ARC_DATA / f"{name}_path.parquet", columns=["date", "high", "low"])
    path["date"] = path.date.astype(str)
    pbd = {dt: (g.high.to_numpy(), g.low.to_numpy()) for dt, g in path.groupby("date")}
    return days, t, pbd


def o120(t, pbd):
    """Overshoot within 120 bars of the touch (bars k .. k+119), touches with >= 120 min left; NaN otherwise."""
    out = np.full(len(t), np.nan)
    for i, r in enumerate(t[["date", "k", "min_to_end", "level_price", "s", "scale"]].itertuples(index=False)):
        if r.min_to_end < 120:
            continue
        H, L = pbd[r.date]
        k = int(r.k)
        ext = H[k:k + 120].max() if r.s > 0 else L[k:k + 120].min()
        out[i] = max(0.0, (ext - r.level_price) * r.s / r.scale)
    return out


# ── Part A ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def design(g, model, q):
    r75 = (g.rung == "p75").to_numpy(float)
    T = g["T"].to_numpy()
    cols = [np.ones(len(g)), r75, T, r75 * T]
    if model in ("M1", "M2", "G"):
        u = np.clip(g.u.to_numpy(), *q["u"])
        cols += [u, u ** 2]
    if model in ("M2", "G"):
        cols += [np.clip(g.P1.to_numpy(), *q["P1"]), np.clip(g.P2.to_numpy(), *q["P2"])]
    if model == "G":
        dd = np.clip(g.d.to_numpy(), *q["d"])
        cols += [dd, dd ** 2]
    return np.column_stack(cols)


def wins(g, cols):
    return {c: (float(g[c].quantile(0.01)), float(g[c].quantile(0.99))) for c in cols}


def walk_forward(A, era, W, dpos_of, mask=None):
    """A: one instrument x group, p50/p75, M5 exclusions applied, all line sets. Returns test-row frames with
    replicate predictions for M0/M1/M2 (forecast rows) and G (forecast + placebo rows), plus M0 betas of the last fit."""
    A = A[A.era_k == era]
    if mask is not None:
        A = A[mask.loc[A.index]]
    tests = [3, 4, 5, 6] if era == "pit" else [2, 3, 4]
    res = {"rows": [], "pred": {m: [] for m in ("M0", "M1", "M2")}, "G_rows": [], "G": []}
    for ty in tests:
        tr_fc = A[(A.factor == 1.0) & (A.yr < ty)]
        te_fc = A[(A.factor == 1.0) & (A.yr == ty)]
        tr_pl = A[(A.factor != 1.0) & (A.yr < ty)]
        te_all = A[A.yr == ty]
        if len(te_fc) == 0 or len(tr_fc) < 50:
            continue
        q = wins(tr_fc, ["u", "P1", "P2"])
        Wtr = W[:, dpos_of(tr_fc)]
        Wte = None
        for m in ("M0", "M1", "M2"):
            beta = logit_fit(design(tr_fc, m, q), tr_fc.y.to_numpy(), Wtr)
            res["pred"][m].append(expit(beta @ design(te_fc, m, q).T))
            if m == "M0":
                res["M0_beta_last"] = beta
        res["rows"].append(te_fc)
        qg = wins(tr_pl, ["u", "P1", "P2", "d"])
        beta = logit_fit(design(tr_pl, "G", qg), tr_pl.y.to_numpy(), W[:, dpos_of(tr_pl)])
        res["G"].append(expit(beta @ design(te_all, "G", qg).T))
        res["G_rows"].append(te_all)
    res["rows"] = pd.concat(res["rows"])
    res["G_rows"] = pd.concat(res["G_rows"])
    for m in ("M0", "M1", "M2"):
        res["pred"][m] = np.hstack(res["pred"][m])
    res["G"] = np.hstack(res["G"])
    return res


def ll(p, y):
    p = np.clip(p, 1e-9, 1 - 1e-9)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def skill(pl, ps, y, Wt):
    """1 - sum loss(larger) / sum loss(smaller); log loss and Brier."""
    return (1 - (Wt * ll(pl, y)).sum(1) / (Wt * ll(ps, y)).sum(1),
            1 - (Wt * (pl - y) ** 2).sum(1) / (Wt * (ps - y) ** 2).sum(1))


def delta_adj(res, Wg, sel=None):
    g = res["G_rows"]
    r = g.y.to_numpy() - res["G"]
    keep = np.ones(len(g), bool) if sel is None else sel(g)
    fac = g.factor.to_numpy()
    out = {"fc_resid": wmean(r[:, (fac == 1.0) & keep], Wg[:, (fac == 1.0) & keep])}
    pl = 0
    for w, f in zip(W_B2, FACT4):
        mf = np.isclose(fac, f) & keep
        out[f"pl_resid_{f}"] = wmean(r[:, mf], Wg[:, mf])
        pl = pl + w * out[f"pl_resid_{f}"]
    out["pl_resid_B2"] = pl
    out["delta_adj"] = out["fc_resid"] - pl
    m1 = (fac == 1.0) & keep
    out["obs_fc"] = wmean(g.y.to_numpy()[m1][None, :].repeat(len(Wg), 0), Wg[:, m1])
    out["G_pred_fc"] = wmean(res["G"][:, m1], Wg[:, m1])
    return out


def part_a_stats(res, W, dpos_of):
    rows = res["rows"]
    y = rows.y.to_numpy()
    Wt = W[:, dpos_of(rows)]
    P = res["pred"]
    out = {"n_test": int(len(rows)), "n_test_by_year": {int(k): int(v) for k, v in rows.yr.value_counts().sort_index().items()}}
    for nm, (lg, sm) in {"M1_vs_M0": ("M1", "M0"), "M2_vs_M1": ("M2", "M1")}.items():
        sl, sb = skill(P[lg], P[sm], y, Wt)
        out[nm] = {"logloss_skill": summ(sl, 100), "brier_skill": summ(sb, 100), "by_year": {}}
        for yr in sorted(rows.yr.unique()):
            m = (rows.yr == yr).to_numpy()
            a, b2 = skill(P[lg][:, m], P[sm][:, m], y[m], Wt[:, m])
            out[nm]["by_year"][int(yr)] = {"logloss_skill": summ(a, 100), "brier_skill": summ(b2, 100)}
    out["citl"] = {}
    for m in ("M0", "M1", "M2"):
        c = wmean(P[m], Wt) - wmean(y[None, :].repeat(len(Wt), 0), Wt)
        out["citl"][m] = summ(c, 100)
        out["citl"][m]["by_year"] = {int(yr): summ(wmean(P[m][:, (rows.yr == yr).to_numpy()], Wt[:, (rows.yr == yr).to_numpy()])
                                                    - wmean(y[(rows.yr == yr).to_numpy()][None, :].repeat(len(Wt), 0),
                                                            Wt[:, (rows.yr == yr).to_numpy()]), 100)
                                     for yr in sorted(rows.yr.unique())}
    return out


def calib_extra(res, W, dpos_of, model, rng):
    rows = res["rows"]
    y = rows.y.to_numpy()
    Wt = W[:, dpos_of(rows)]
    p = res["pred"][model]
    lp = np.log(np.clip(p, 1e-9, 1 - 1e-9) / (1 - np.clip(p, 1e-9, 1 - 1e-9)))
    out = {"slope": summ(slope_fit(lp, y, Wt))}
    edges = np.quantile(p[0], [0.2, 0.4, 0.6, 0.8])
    bins = np.searchsorted(edges, p[0], side="right")
    rel = []
    for bi in range(5):
        m = bins == bi
        rel.append({"bin": bi + 1, "n": int(m.sum()), "pred": summ(wmean(p[:, m], Wt[:, m]), 100),
                    "obs": summ(wmean(y[m][None, :].repeat(len(Wt), 0), Wt[:, m]), 100)})
    out["reliability"] = rel
    rel_y = {}
    for yr in sorted(rows.yr.unique()):
        my = (rows.yr == yr).to_numpy()
        rel_y[int(yr)] = [{"bin": bi + 1, "n": int((my & (bins == bi)).sum()),
                           "pred_pp": float(100 * p[0][my & (bins == bi)].mean()) if (my & (bins == bi)).any() else None,
                           "obs": summ(wmean(y[my & (bins == bi)][None, :].repeat(len(Wt), 0), Wt[:, my & (bins == bi)]), 100)}
                          for bi in range(5)]
    out["reliability_by_year"] = rel_y

    def ece(yy):
        return sum((bins == bi).mean() * abs(yy[bins == bi].mean() - p[0][bins == bi].mean()) for bi in range(5))
    sims = np.array([ece((rng.random(len(y)) < p[0]).astype(float)) for _ in range(2000)])
    out["ece_pp"] = {"est": 100 * ece(y), "noise_floor_mean": 100 * float(sims.mean()), "noise_floor_p95": 100 * float(np.quantile(sims, 0.95))}
    r = pd.Series(p[0]).rank().to_numpy()
    n1, n0 = y.sum(), len(y) - y.sum()
    out["auc"] = float((r[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))
    return out


def classify_a8(cells, key):
    ps = [c[key]["logloss_skill"]["p"] for c in cells]
    sig = bh(ps)
    out = []
    for c, s in zip(cells, sig):
        sk = c[key]["logloss_skill"]
        if s and sk["est"] >= 1.0:
            cl = "Improves"
        elif sk["ci"][1] < 1.0:
            cl = "No material improvement"
        else:
            cl = "Inconclusive (underpowered)"
        out.append((cl, bool(s)))
    return out


def classify_a10(cells, key="delta_adj"):
    ps = [c[key]["p"] for c in cells]
    sig = bh(ps)
    out = []
    for c, s in zip(cells, sig):
        d = c[key]
        if s and abs(d["est"]) >= 3 and c.get("sign_2016_20") is not None and np.sign(c["sign_2016_20"]) == np.sign(d["est"]):
            cl = "Forecast-specific"
        elif -3 <= d["ci"][0] and d["ci"][1] <= 3:
            cl = "No forecast-specific difference beyond +-3pp"
        else:
            cl = "Inconclusive"
        out.append((cl, bool(s)))
    return out


def citl_class(c):
    lo, hi = c["ci"]
    if -3 <= lo and hi <= 3:
        return "CITL supported (+-3pp)"
    if hi < -3 or lo > 3:
        return "CITL inconsistent"
    return "CITL inconclusive"


def m0_at_clock(beta, med_last_min):
    """M0 predicted reach at 08/12/16/20 London from the last walk-forward fit (trained on Y1-Y5)."""
    out = {}
    for h in (8, 12, 16, 20):
        T = np.log1p(med_last_min - h * 60)
        for r75, rung in ((0.0, "p50"), (1.0, "p75")):
            x = np.array([1.0, r75, T, r75 * T])
            out[f"{h:02d}:00|{rung}"] = summ(expit(beta @ x), 100)
    return out


def part_a(all_t, dates, WP, WK):
    dpos_index = {d: i for i, d in enumerate(dates)}

    def dpos_of(g):
        return g.date.map(dpos_index).to_numpy()
    rng = np.random.default_rng([SEED, 7])
    out = {"cells": {}, "exclusions": {}}
    sens = {"block": {}, "untagged_excluded": {}, "is_2016_20": {}}
    for name in NAMES:
        t = all_t[name]
        base = t[t.rung.isin(["p50", "p75"])]
        ex = base[base.factor == 1.0].groupby(["era", "group", "excluded"]).size()
        out["exclusions"][name] = {"|".join(map(str, k)) if k[2] else f"{k[0]}|{k[1]}|kept": int(v) for k, v in ex.items()}
        A = base[base.excluded == ""].copy()
        for grp in GROUPS:
            G = A[A.group == grp]
            key = f"{name}|{grp}"
            t0 = time.time()
            res = walk_forward(G, "pit", WP, dpos_of)
            st = part_a_stats(res, WP, dpos_of)
            Wg = WP[:, dpos_of(res["G_rows"])]
            da = delta_adj(res, Wg)
            st["A10"] = {k: summ(v, 100) for k, v in da.items()}
            st["A10"]["n_test"] = {str(f): int((np.isclose(res["G_rows"].factor, f)).sum()) for f in (1.0,) + FACT4}
            st["A10_by_rung"] = {ru: summ(delta_adj(res, Wg, lambda g, ru=ru: (g.rung == ru).to_numpy())["delta_adj"], 100)
                                 for ru in ("p50", "p75")}
            st["A10_by_side"] = {sd: summ(delta_adj(res, Wg, lambda g, sd=sd: (g.side == sd).to_numpy())["delta_adj"], 100)
                                 for sd in ("up", "dn")}
            st["A10_by_year"] = {int(yr): summ(delta_adj(res, Wg, lambda g, yr=yr: (g.yr == yr).to_numpy())["delta_adj"], 100)
                                 for yr in sorted(res["G_rows"].yr.unique())}
            st["citl_by_side"] = {}
            rows = res["rows"]
            Wt = WP[:, dpos_of(rows)]
            for sd in ("up", "dn"):
                m = (rows.side == sd).to_numpy()
                st["citl_by_side"][sd] = {mm: summ(wmean(res["pred"][mm][:, m], Wt[:, m])
                                                   - wmean(rows.y.to_numpy()[m][None, :].repeat(len(Wt), 0), Wt[:, m]), 100)
                                          for mm in ("M0", "M1", "M2")}
            med_last = float(np.median(t.drop_duplicates("date").min_since_open + t.drop_duplicates("date").min_to_end))
            st["Q1_M0_at_clock"] = m0_at_clock(res["M0_beta_last"], med_last)
            st["_res"] = res
            out["cells"][key] = st
            # sensitivities
            rb = walk_forward(G, "pit", WK, dpos_of)
            sb = part_a_stats(rb, WK, dpos_of)
            sb["A10"] = {k: summ(v, 100) for k, v in delta_adj(rb, WK[:, dpos_of(rb["G_rows"])]).items()}
            sens["block"][key] = sb
            ru = walk_forward(G, "pit", WP, dpos_of, mask=(G.tag_status != "unknown"))
            su = part_a_stats(ru, WP, dpos_of)
            su["A10"] = {k: summ(v, 100) for k, v in delta_adj(ru, WP[:, dpos_of(ru["G_rows"])]).items()}
            su["_res"] = ru
            sens["untagged_excluded"][key] = su
            ri = walk_forward(G, "is", WP, dpos_of)
            si = part_a_stats(ri, WP, dpos_of)
            si["A10"] = {k: summ(v, 100) for k, v in delta_adj(ri, WP[:, dpos_of(ri["G_rows"])]).items()}
            sens["is_2016_20"][key] = si
            print(key, f"{time.time() - t0:.0f}s", flush=True)
    keys = list(out["cells"])
    # A8 classes, main and block, wider interval decides when they disagree
    for comp in ("M1_vs_M0", "M2_vs_M1"):
        main = classify_a8([out["cells"][k] for k in keys], comp)
        blk = classify_a8([sens["block"][k] for k in keys], comp)
        unt = classify_a8([sens["untagged_excluded"][k] for k in keys], comp)
        for k, a, b2, u in zip(keys, main, blk, unt):
            wa = np.diff(out["cells"][k][comp]["logloss_skill"]["ci"])[0]
            wb = np.diff(sens["block"][k][comp]["logloss_skill"]["ci"])[0]
            final = a[0] if a[0] == b2[0] else (b2[0] if wb > wa else a[0])
            out["cells"][k][comp].update({"bh_sig": a[1], "class_poisson": a[0], "class_block": b2[0], "class": final,
                                          "class_untagged_excluded": u[0],
                                          "not_robust_to_untagged": u[0] != final,
                                          "is_2016_20": sens["is_2016_20"][k][comp]["logloss_skill"]})
    # A9 working model + CITL class
    for k in keys:
        c = out["cells"][k]
        wm = "M2" if c["M2_vs_M1"]["class"] == "Improves" else ("M1" if c["M1_vs_M0"]["class"] == "Improves" else "M0")
        cm = citl_class(c["citl"][wm])
        cb = citl_class(sens["block"][k]["citl"][wm])
        wa, wb = np.diff(c["citl"][wm]["ci"])[0], np.diff(sens["block"][k]["citl"][wm]["ci"])[0]
        final = cm if cm == cb else (cb if wb > wa else cm)
        cu = citl_class(sens["untagged_excluded"][k]["citl"][wm])
        c["A9"] = {"working_model": wm, "citl": c["citl"][wm], "class_poisson": cm, "class_block": cb, "class": final,
                   "class_untagged_excluded": cu, "not_robust_to_untagged": cu != final,
                   **calib_extra(c["_res"], WP, dpos_of, wm, rng)}
        c["A9"]["M0_citl_class"] = citl_class(c["citl"]["M0"])
    # A10 classes
    for src, tag in ((out["cells"], "poisson"), (sens["block"], "block"), (sens["untagged_excluded"], "untagged")):
        for k in keys:
            src[k]["A10"]["sign_2016_20"] = sens["is_2016_20"][k]["A10"]["delta_adj"]["est"]
    def a10_classes(src):
        cells = [{"delta_adj": src[k]["A10"]["delta_adj"], "sign_2016_20": src[k]["A10"]["sign_2016_20"]} for k in keys]
        return classify_a10(cells)
    main, blk, unt = a10_classes(out["cells"]), a10_classes(sens["block"]), a10_classes(sens["untagged_excluded"])
    for k, a, b2, u in zip(keys, main, blk, unt):
        wa = np.diff(out["cells"][k]["A10"]["delta_adj"]["ci"])[0]
        wb = np.diff(sens["block"][k]["A10"]["delta_adj"]["ci"])[0]
        final = a[0] if a[0] == b2[0] else (b2[0] if wb > wa else a[0])
        out["cells"][k]["A10"].update({"bh_sig": a[1], "class_poisson": a[0], "class_block": b2[0], "class": final,
                                       "class_untagged_excluded": u[0], "not_robust_to_untagged": u[0] != final})
    for k in keys:
        out["cells"][k].pop("_res")
        sens["untagged_excluded"][k].pop("_res")
    out["sensitivities"] = sens
    return out


# ── Part B ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def rate(e, W):
    return wmean(e[None, :].repeat(len(W), 0).astype(float), W)


def b1_class(c):
    lo, hi = c["ci"]
    if 7 <= lo and hi <= 13:
        return "Consistent with 10% +-3pp"
    if hi < 7 or lo > 13:
        return "Inconsistent"
    return "Inconclusive"


def part_b(all_days, all_t, pbd_all, dates, WK, WP):
    dpos_index = {d: i for i, d in enumerate(dates)}
    out = {"B1": {}, "B2": {}, "B3": {}, "B4": {}, "B5": {}, "B6": {}}
    for name in NAMES:
        days = all_days[name]
        days = days.assign(yr_pit=year_of(days.date, "pit"))
        pit = days[days.era == "oos_pit"]
        ev = {"fixed_up": pit.high >= pit.lvl_OH_p90, "fixed_dn": pit.low <= pit.lvl_OL_p90}
        ev["fixed_either"] = ev["fixed_up"] | ev["fixed_dn"]
        ev["fixed_both"] = ev["fixed_up"] & ev["fixed_dn"]
        ev["proj_hl"] = pit.hl_pct >= pit.hl_p90
        ev["proj_p90_touched_either"] = pit.first_ProjH_p90_min.notna() | pit.first_ProjL_p90_min.notna()
        Wd = WK[:, pit.date.map(dpos_index).to_numpy()]
        tagged = (pit.tag_status != "unknown").to_numpy()
        res = {"n_days": int(len(pit))}
        for k, e in ev.items():
            e = e.to_numpy()
            r = summ(rate(e, Wd), 100)
            pt = r["est"] / 100
            r["ci_iid"] = [100 * (pt - 1.96 * np.sqrt(pt * (1 - pt) / len(e))), 100 * (pt + 1.96 * np.sqrt(pt * (1 - pt) / len(e)))]
            if k in ("fixed_up", "fixed_dn", "proj_hl"):
                r["class"] = b1_class(r)
                ru = summ(rate(e[tagged], Wd[:, tagged]), 100)
                r["untagged_excluded"] = {"est": ru["est"], "ci": ru["ci"], "class": b1_class(ru)}
            r["halves"] = {}
            for lab, m in (("Y1-Y3", pit.yr_pit.between(1, 3)), ("Y4-Y6", pit.yr_pit.between(4, 6))):
                m = m.to_numpy()
                h = summ(rate(e[m], Wd[:, m]), 100)
                r["halves"][lab] = {"est": h["est"], "ci": h["ci"]}
            res[k] = r
        isd = days[days.era == "insample_prod_params"]
        Wi = WK[:, isd.date.map(dpos_index).to_numpy()]
        ev_is = {"fixed_up": isd.high >= isd.lvl_OH_p90, "fixed_dn": isd.low <= isd.lvl_OL_p90, "proj_hl": isd.hl_pct >= isd.hl_p90}
        for k, e in ev_is.items():
            h = summ(rate(e.to_numpy(), Wi), 100)
            res[k]["halves"]["2016-20"] = {"est": h["est"], "ci": h["ci"], "n_days": int(len(isd))}
        out["B1"][name] = res

        # B2-B6: p90 first touches
        t = all_t[name]
        p90 = t[(t.rung == "p90") & (t.era == "oos_pit") & (~t.ambiguous_order.astype(bool))].copy()
        p90["O"] = p90.cont_max_sig
        p90["O120"] = o120(p90, pbd_all[name])
        fc = p90[p90.factor == 1.0]
        for grp in GROUPS:
            key = f"{name}|{grp}"
            g = fc[fc.group == grp]
            fams = [f for f in FAMS if FAMS[f][0] == grp]
            # unconditional: one unit per day x side, all PIT days; days whose p90 touch is ambiguous dropped for that side
            uncond = {}
            amb = t[(t.rung == "p90") & (t.era == "oos_pit") & (t.factor == 1.0) & t.ambiguous_order.astype(bool)]
            for sides, lab in (([fams[0]], fams[0]), ([fams[1]], fams[1]), (fams, "pooled")):
                vals, pos = [], []
                for fa in sides:
                    o = g[g.family == fa].set_index("date").O
                    dd = pit[~pit.date.isin(amb[amb.family == fa].date)]
                    vals.append(dd.date.map(o).fillna(0.0).to_numpy())
                    pos.append(dd.date.map(dpos_index).to_numpy())
                v, ps = np.concatenate(vals), np.concatenate(pos)
                Wv = WK[:, ps]
                reached = np.concatenate([dd_.astype(bool) for dd_ in [np.isin(pit[~pit.date.isin(amb[amb.family == fa].date)].date, g[g.family == fa].date) for fa in sides]])
                u_ = {"n_day_sides": int(len(v)), "P_not_reached": summ(rate(~reached, Wv), 100),
                      "mean_O_day": summ(wmean(v[None, :].repeat(len(Wv), 0), Wv))}
                for x in (0.10, 0.25, 0.50, 1.00):
                    u_[f"P_O_day_ge_{x:.2f}"] = summ(rate(v >= x, Wv), 100)
                uncond[lab] = u_
            cond = {}
            for sides, lab in (([fams[0]], fams[0]), ([fams[1]], fams[1]), (fams, "pooled")):
                gg = g[g.family.isin(sides)]
                Wv = WK[:, gg.date.map(dpos_index).to_numpy()]
                O = gg.O.to_numpy()
                qs = wquant(O, Wv, [0.5, 0.75, 0.9])
                cond[lab] = {"n": int(len(gg)), "median": summ(qs[:, 0]), "p75": summ(qs[:, 1]), "p90": summ(qs[:, 2]),
                             "mean": summ(wmean(O[None, :].repeat(len(Wv), 0), Wv)),
                             "P_contained_lt_0.10": summ(rate(O < 0.10, Wv), 100),
                             "P_between": summ(rate((O >= 0.10) & (O < 0.25), Wv), 100),
                             "P_extended_ge_0.25": summ(rate(O >= 0.25, Wv), 100)}
            out["B2"][key] = {"unconditional": uncond, "conditional": cond}
            Wv = WK[:, g.date.map(dpos_index).to_numpy()]
            out["B3"][key] = {"P_O_ge_step": summ(rate(g.O.to_numpy() >= g.step_d.to_numpy(), Wv), 100),
                              "median_step_sigma": float(g.step_d.median()), "n": int(len(g))}

            def split_stats(gg, flag, Wall):
                res_ = {}
                for col in ("O", "O120"):
                    ok = gg[col].notna().to_numpy()
                    v = gg[col].to_numpy()
                    a_, b_ = ok & flag, ok & ~flag
                    Wa, Wb = Wall[:, a_], Wall[:, b_]
                    qa, qb = wquant(v[a_], Wa, [0.5]), wquant(v[b_], Wb, [0.5])
                    res_[col] = {"n_first": int(a_.sum()), "n_second": int(b_.sum()),
                                 "P_extended_first": summ(rate(v[a_] >= 0.25, Wa), 100),
                                 "P_extended_second": summ(rate(v[b_] >= 0.25, Wb), 100),
                                 "diff_P_extended": summ(rate(v[a_] >= 0.25, Wa) - rate(v[b_] >= 0.25, Wb), 100),
                                 "P_contained_first": summ(rate(v[a_] < 0.10, Wa), 100),
                                 "P_contained_second": summ(rate(v[b_] < 0.10, Wb), 100),
                                 "diff_P_contained": summ(rate(v[a_] < 0.10, Wa) - rate(v[b_] < 0.10, Wb), 100),
                                 "median_first": summ(qa[:, 0]), "median_second": summ(qb[:, 0]),
                                 "diff_median": summ(qa[:, 0] - qb[:, 0])}
                return res_
            med_mte = float(g.min_to_end.median())
            out["B4"][key] = {"split_min_to_end": med_mte, "first=early (more time left)": True,
                              **split_stats(g, (g.min_to_end > med_mte).to_numpy(), Wv)}
            if grp == "Fixed":
                med_u = float(g.u.median())
                out["B5"][key] = {"split_u": med_u, "first=low range used": True,
                                  **split_stats(g, (g.u <= med_u).to_numpy(), Wv)}
            else:
                out["B5"][key] = {"not_estimable": "u pinned by construction",
                                  "u_quantiles_10_50_90": [float(x) for x in g.u.quantile([0.1, 0.5, 0.9])], "n": int(len(g))}
            # B6: forecast vs B2-weighted phantom p90, paired date bootstrap
            b6 = {}
            for col, lab in (("O", "full_session"), ("O120", "common_horizon_120")):
                vals, ns = {}, {}
                for f in (1.0,) + FACT4:
                    gg = p90[(p90.group == grp) & np.isclose(p90.factor, f) & p90[col].notna()]
                    Wf = WP[:, gg.date.map(dpos_index).to_numpy()]
                    v = gg[col].to_numpy()
                    vals[f] = {"contained": rate(v < 0.10, Wf), "extended": rate(v >= 0.25, Wf)}
                    ns[str(f)] = int(len(gg))
                b6[lab] = {"n": ns}
                for meas in ("contained", "extended"):
                    ref = sum(w * vals[f][meas] for w, f in zip(W_B2, FACT4))
                    b6[lab][meas] = {"forecast": summ(vals[1.0][meas], 100), "B2_reference": summ(ref, 100),
                                     "diff": summ(vals[1.0][meas] - ref, 100),
                                     "by_factor": {str(f): 100 * float(vals[f][meas][0]) for f in FACT4}}
            out["B6"][key] = b6
        print("B", name, flush=True)
    return out


# ── Part C ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def part_c(all_days, all_t, dates, WK):
    dpos_index = {d: i for i, d in enumerate(dates)}
    out = {}
    LEVELS = [f"{fa}_{ru}" for fa in FAMS for ru in ("p50", "p75", "p90")]
    for name in NAMES:
        days = all_days[name]
        t = all_t[name]
        ph = t[t.factor != 1.0]
        for era, lab in (("oos_pit", "pit"), ("insample_prod_params", "2016_20")):
            dd = days[days.era == era].reset_index(drop=True)
            W = WK[:, dd.date.map(dpos_index).to_numpy()]
            yr = year_of(dd.date, "pit") if era == "oos_pit" else np.zeros(len(dd), int)
            t_open = dd.t_open.to_numpy()

            def clock_of(mins):
                ts = pd.to_datetime(t_open + np.nan_to_num(mins) * 60, unit="s", utc=True).tz_convert("Europe/London")
                c = ts.hour + ts.minute / 60
                return np.where(np.isnan(mins), np.nan, c)
            first = {(1.0, L): dd[f"first_{L}_min"].to_numpy(float) for L in LEVELS}
            for f in FACT4:
                pf = ph[np.isclose(ph.factor, f)]
                for L in LEVELS:
                    s = pf[pf.level == L].set_index("date").min_since_open
                    first[(f, L)] = dd.date.map(s).to_numpy(float)

            clock = {kk: clock_of(v) for kk, v in first.items()}

            def measures(keys_, Wm, m=None):
                """keys_: (factor, level) per side; units = day x side (NaN = not touched). Returns dict of [R] arrays."""
                sel = slice(None) if m is None else m
                mins_list = [first[kk][sel] for kk in keys_]
                mins = np.concatenate(mins_list)
                clk = np.concatenate([clock[kk][sel] for kk in keys_])
                Wu = np.hstack([Wm] * len(mins_list))
                hit = ~np.isnan(mins)
                res = {f"F_{h:02d}": rate(hit & (clk < h), Wu) for h in range(1, 23)}
                res["F_end"] = rate(hit, Wu)
                for (a, b), wn in zip(WINDOWS, WNAMES):
                    inw = hit & (clk >= a) & (clk < b)
                    res[f"share_all|{wn}"] = rate(inw, Wu)
                    res[f"share_touched|{wn}"] = wmean(inw[hit][None, :].repeat(len(Wu), 0).astype(float), Wu[:, hit])
                if hit.sum() >= 5:
                    qc = wquant(clk[hit], Wu[:, hit], [0.1, 0.25, 0.5, 0.75, 0.9])
                    qm = wquant(mins[hit], Wu[:, hit], [0.1, 0.25, 0.5, 0.75, 0.9])
                    for j, q in enumerate((10, 25, 50, 75, 90)):
                        res[f"clock_q{q}"] = qc[:, j]
                        res[f"mins_q{q}"] = qm[:, j]
                res["_n_touched"] = int(hit.sum())
                return res

            for grp in GROUPS:
                fams = [f for f in FAMS if FAMS[f][0] == grp]
                for ru in ("p50", "p75", "p90"):
                    for sides, slab in (([fams[0]], fams[0]), ([fams[1]], fams[1]), (fams, "pooled")):
                        key = f"{name}|{lab}|{grp}|{ru}|{slab}"
                        fc = measures([(1.0, f"{fa}_{ru}") for fa in sides], W)
                        pls = {f: measures([(f, f"{fa}_{ru}") for fa in sides], W) for f in FACT4}
                        cell = {"n_days": int(len(dd)), "n_touched": fc.pop("_n_touched"),
                                "n_touched_phantom": {str(f): pls[f].pop("_n_touched") for f in FACT4}, "m": {}}
                        for mk, v in fc.items():
                            sc = 100 if (mk.startswith("F_") or mk.startswith("share")) else 1
                            entry = {"forecast": summ(v, sc)}
                            if all(mk in pls[f] for f in FACT4):
                                ref = sum(w * pls[f][mk] for w, f in zip(W_B2, FACT4))
                                entry["reference_B2"] = summ(ref, sc)
                                entry["diff"] = summ(v - ref, sc)
                            cell["m"][mk] = entry
                        if lab == "pit":
                            by = {}
                            for y in range(1, 7):
                                m = yr == y
                                Wy = W[:, m]
                                ry = measures([(1.0, f"{fa}_{ru}") for fa in sides], Wy, m)
                                by[f"Y{y}"] = {k2: summ(ry[k2], 100 if k2.startswith("share") else 1)
                                               for k2 in ["clock_q50"] + [f"share_touched|{wn}" for wn in WNAMES] if k2 in ry}
                                by[f"Y{y}"]["n_touched"] = ry["_n_touched"]
                            cell["by_year"] = by
                        out[key] = cell
        print("C", name, flush=True)
    return out


def main():
    t0 = time.time()
    all_days, all_t, pbd_all = {}, {}, {}
    for name in NAMES:
        days, t, pbd = load(name)
        t["era_k"] = np.where(t.era == "oos_pit", "pit", "is")
        t["yr"] = np.where(t.era_k == "pit", year_of(t.date, "pit"), year_of(t.date, "is"))
        all_days[name], all_t[name], pbd_all[name] = days, t, pbd
        print("loaded", name, len(t), flush=True)
    dates = sorted(set().union(*[set(d.date) for d in all_days.values()]))
    WP, WK = poisson_weights(len(dates)), block_weights(len(dates))
    res = {"meta": {"prereg": "forge/DAY_RECON_REACH_CALIBRATION_PREREG.md", "frozen_commit": "d7ce9e06", "B": B, "seed": SEED,
                    "block": BLOCK, "W_B2": [float(w) for w in W_B2], "n_calendar_dates": len(dates)}}
    res["A"] = part_a(all_t, dates, WP, WK)
    res["B"] = part_b(all_days, all_t, pbd_all, dates, WK, WP)
    res["C"] = part_c(all_days, all_t, dates, WK)
    res["meta"]["runtime_s"] = round(time.time() - t0)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=float))
    print("done", res["meta"]["runtime_s"], "s")


if __name__ == "__main__":
    main()
