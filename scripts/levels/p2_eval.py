"""Level engine Phase 2 evaluation (forge/LEVEL_P2_PREREG.md). Reads data/levels/p2/*.parquet; writes analysis/output/level_p2/.

    PYTHONPATH=. python scripts/levels/p2_eval.py
"""
from __future__ import annotations

import json
from math import erf, sqrt
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

IN = Path("data/levels/p2")
OUT = Path("analysis/output/level_p2")
FIT_END, DEV0, CONF0, CONF1 = "2022-01-01", "2022-01-01", "2025-01-01", "2026-08-21"
HZ = {"30": (30, "v05", 0.5), "60": (60, "v1", 1), "120": (120, "v2", 2), "240": (240, "v4", 4)}
RNG = np.random.default_rng(20261011)
NB, NTR = 1000, 600_000
phi = np.vectorize(lambda x: 0.5 * (1 + erf(x / sqrt(2))))


def block(d):
    return np.select([d < FIT_END, d < CONF0], ["fit", "dev"], "conf")


def boot(dates, ref, new):
    df = pd.DataFrame({"d": dates, "r": ref, "n": new}).groupby("d")[["r", "n"]].sum().sort_index()
    r, n = df.r.to_numpy(), df.n.to_numpy()
    k = len(r)
    st = RNG.integers(0, max(1, k - 4), size=(NB, int(np.ceil(k / 5))))
    idx = (st[:, :, None] + np.arange(5)).reshape(NB, -1)[:, :k]
    sk = 1 - n[idx].sum(1) / r[idx].sum(1)
    return float(1 - n.sum() / r.sum()), [float(x) for x in np.quantile(sk, [0.025, 0.975])], float((np.sum(sk <= 0) + 1) / (NB + 1))


def calib(y, p):
    q = pd.qcut(p, 10, labels=False, duplicates="drop")
    t = pd.DataFrame({"q": q, "p": p, "y": y}).groupby("q").agg(p=("p", "mean"), y=("y", "mean"), n=("y", "size"))
    t = t[t.n >= 300]
    return round(float((t.p - t.y).abs().max() * 100), 2) if len(t) else None


def design(D, fam=False):
    X = pd.DataFrame({"z": D.z, "lz": np.log(D.z.clip(lower=1e-3)), "lv": np.log(D.v.clip(lower=1e-4)), "used": D.used, "ext": D.ext.astype(float)}, index=D.index)
    X = pd.concat([X, pd.get_dummies(D.h, prefix="h", dtype=float), pd.get_dummies(D.cls, prefix="c", dtype=float)], axis=1)
    if fam:
        X = pd.concat([X, pd.get_dummies(D.family, prefix="f", dtype=float)], axis=1)
    return X


def fit_predict(D, y, fam=False):
    X = design(D, fam)
    tr = (D.block == "fit").to_numpy()
    ti = np.flatnonzero(tr)
    if len(ti) > NTR:
        ti = np.sort(RNG.choice(ti, NTR, replace=False))
    sc = StandardScaler().fit(X.iloc[ti])
    m = LogisticRegression(C=1.0, max_iter=2000).fit(sc.transform(X.iloc[ti]), y[ti])
    return m.predict_proba(sc.transform(X))[:, 1]


def score(D, y, ref, new):
    lr, ln = (ref - y) ** 2, (new - y) ** 2
    out = {}
    for b in ("dev", "conf"):
        mk = (D.block == b).to_numpy()
        pt, ci, p = boot(D.date.to_numpy()[mk], lr[mk], ln[mk])
        out[b] = {"n": int(mk.sum()), "dates": int(D.date[mk].nunique()), "realised%": round(100 * y[mk].mean(), 2), "ref%": round(100 * ref[mk].mean(), 2),
                  "new%": round(100 * new[mk].mean(), 2), "skill%": round(100 * pt, 2), "ci%": [round(100 * ci[0], 2), round(100 * ci[1], 2)], "p": p,
                  "calib_ref_pp": calib(y[mk], ref[mk]), "calib_new_pp": calib(y[mk], new[mk])}
    return out


def by(D, y, ref, new, col, blk="conf"):
    out = {}
    mk0 = (D.block == blk).to_numpy()
    for k in sorted(D[col][mk0].unique(), key=str):
        mk = mk0 & (D[col] == k).to_numpy()
        if mk.sum() < 2000:
            continue
        pt, ci, _ = boot(D.date.to_numpy()[mk], ((ref - y) ** 2)[mk], ((new - y) ** 2)[mk])
        out[str(k)] = {"n": int(mk.sum()), "skill%": round(100 * pt, 2), "ci%": [round(100 * ci[0], 2), round(100 * ci[1], 2)],
                       "realised%": round(100 * y[mk].mean(), 1), "new%": round(100 * new[mk].mean(), 1), "calib_new_pp": calib(y[mk], new[mk])}
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    L = pd.concat([pd.read_parquet(f) for f in sorted(IN.glob("*_levels.parquet"))], ignore_index=True)
    L = L[L.date < CONF1].copy()
    L["block"] = block(L.date)
    L = L[(L.block == "fit") | (L.oos == 1)].reset_index(drop=True)
    L["d"] = L.dist.abs()
    L["ext"] = np.sign(L.dist) == np.sign(L.D)
    L["year"] = L.date.str[:4]
    L["dband"] = pd.cut(L.d, [0, 0.25, 0.5, 1, 2, 3], labels=["<.25", ".25-.5", ".5-1", "1-2", "2-3"])
    res = {"rows": {b: int((L.block == b).sum()) for b in ("fit", "dev", "conf")}, "families": L.family.value_counts().to_dict()}
    # --- reach at each horizon + end
    preds = {}
    for hz, (mins, vcol, hcal) in list(HZ.items()) + [("end", (None, "vend", None))]:
        y = (L.t_min.notna() & ((L.t_min < mins) if mins else True)).astype(float).to_numpy()
        hcal_arr = (22 - L.h).to_numpy() if hz == "end" else np.full(len(L), hcal, float)
        D = L.assign(v=L[vcol], z=L.d / np.sqrt(L[vcol].clip(lower=1e-6)))
        b0 = np.clip(2 * (1 - phi(L.d.to_numpy() / np.sqrt(hcal_arr / 24))), 1e-4, 1 - 1e-4)
        b1 = np.clip(2 * (1 - phi(D.z.to_numpy())), 1e-4, 1 - 1e-4)
        m1 = fit_predict(D, y)
        preds[hz] = (y, b0, b1, m1)
        res[f"reach_{hz}"] = {"M1_vs_B1": score(L, y, b1, m1), "M1_vs_B0": score(L, y, b0, m1), "B1_vs_B0": score(L, y, b0, b1)}
        if hz == "end":
            res["reach_end"]["breakdown_M1_vs_B1"] = {c: by(L, y, b1, m1, c) for c in ("cls", "family", "h", "dband", "year")}
            mf = fit_predict(D, y, fam=True)
            res["family_invariance"] = score(L, y, m1, mf)
            res["family_invariance"]["breakdown_by_family"] = by(L, y, m1, mf, "family")
    # --- time: integrated Brier over the five horizons (mean), M1 vs B1
    yy = np.column_stack([preds[k][0] for k in ("30", "60", "120", "240", "end")])
    lb1 = np.mean(np.column_stack([(preds[k][2] - preds[k][0]) ** 2 for k in ("30", "60", "120", "240", "end")]), axis=1)
    lm1 = np.mean(np.column_stack([(preds[k][3] - preds[k][0]) ** 2 for k in ("30", "60", "120", "240", "end")]), axis=1)
    res["time_ibs"] = {}
    for b in ("dev", "conf"):
        mk = (L.block == b).to_numpy()
        pt, ci, p = boot(L.date.to_numpy()[mk], lb1[mk], lm1[mk])
        res["time_ibs"][b] = {"skill%": round(100 * pt, 2), "ci%": [round(100 * ci[0], 2), round(100 * ci[1], 2)], "p": p, "n": int(mk.sum())}
    # median time to reach among reached rows (minutes), by distance band, realised vs B1 implied
    reached = L[L.t_min.notna() & (L.block == "conf")]
    res["time_median_by_dband_conf"] = reached.groupby("dband", observed=True).t_min.median().round(0).to_dict()
    # --- race
    R = pd.concat([pd.read_parquet(f) for f in sorted(IN.glob("*_race.parquet"))], ignore_index=True)
    R = R[R.date < CONF1].copy()
    R["block"] = block(R.date)
    R = R[(R.block == "fit") | (R.oos == 1)].reset_index(drop=True)
    res["race_counts"] = {b: R[R.block == b].res.value_counts().to_dict() for b in ("fit", "dev", "conf")}
    Rr = R[R.res.isin(["up", "down"])].reset_index(drop=True)
    y = (Rr.res == "up").astype(float).to_numpy()
    base = np.clip((Rr.b / (Rr.a + Rr.b)).to_numpy(), 1e-4, 1 - 1e-4)
    X = pd.concat([pd.DataFrame({"lr": np.log(Rr.a / Rr.b), "used": Rr.used, "D": Rr.D}, index=Rr.index),
                   pd.get_dummies(Rr.h, prefix="h", dtype=float), pd.get_dummies(Rr.cls, prefix="c", dtype=float)], axis=1)
    tr = (Rr.block == "fit").to_numpy()
    sc = StandardScaler().fit(X[tr])
    mr = LogisticRegression(max_iter=2000).fit(sc.transform(X[tr]), y[tr])
    pr = mr.predict_proba(sc.transform(X))[:, 1]
    res["race"] = score(Rr, y, base, pr)
    res["race"]["coef_D_sign"] = float(np.sign(mr.coef_[0][2]))
    res["race"]["breakdown_conf"] = {c: by(Rr, y, base, pr, c) for c in ("cls", "h")}
    # Holm over the three primary endpoints on E-conf
    ps = {"reach_end": res["reach_end"]["M1_vs_B1"]["conf"]["p"], "race": res["race"]["conf"]["p"], "time": res["time_ibs"]["conf"]["p"]}
    order = sorted(ps, key=ps.get)
    run = 0
    hol = {}
    for r_, k in enumerate(order):
        run = max(run, (3 - r_) * ps[k])
        hol[k] = min(1, run)
    res["holm"] = hol
    acc = {}
    for k, blkres in (("reach_end", res["reach_end"]["M1_vs_B1"]), ("race", res["race"])):
        cls_fail = [c for c, v in (res["reach_end"]["breakdown_M1_vs_B1"]["cls"] if k == "reach_end" else res["race"]["breakdown_conf"]["cls"]).items() if v["ci%"][1] < 0]
        acc[k] = {"lb>0_dev_and_conf": blkres["dev"]["ci%"][0] > 0 and blkres["conf"]["ci%"][0] > 0, "holm<0.05": hol[k] < 0.05,
                  "calib<=3pp": (blkres["dev"]["calib_new_pp"] or 99) <= 3 and (blkres["conf"]["calib_new_pp"] or 99) <= 3, "no_class_fail": not cls_fail}
        acc[k]["ACCEPTED"] = all(acc[k].values())
    acc["time"] = {"lb>0_dev_and_conf": res["time_ibs"]["dev"]["ci%"][0] > 0 and res["time_ibs"]["conf"]["ci%"][0] > 0, "holm<0.05": hol["time"] < 0.05}
    acc["time"]["ACCEPTED"] = all(acc["time"].values())
    fi = res["family_invariance"]["conf"]
    acc["family_adds_reach_information"] = bool(fi["skill%"] >= 0.3 and fi["ci%"][0] > 0)
    res["acceptance"] = acc
    (OUT / "p2.json").write_text(json.dumps(res, indent=1, default=float))
    print(json.dumps({k: res[k] for k in ("rows", "acceptance", "holm")}, indent=1, default=float))


if __name__ == "__main__":
    main()
