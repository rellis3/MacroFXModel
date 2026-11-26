"""level-near-miss-entry: score episodes / states / aggregates (forge/LEVEL_NEAR_MISS_ENTRY_PREREG.md).

    python scripts/level-near-miss-entry/score.py -> analysis/output/level-near-miss-entry/

train 2020-22 (fit), validation 2023 (choose x*, k*, theta, model class), test 2024-01-02 -> 2026-08-21 (scored once).
"""
from __future__ import annotations

import importlib.util
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("lces", ROOT / "scripts/level-context-engine/score.py")
S_ = importlib.util.module_from_spec(spec); spec.loader.exec_module(S_)
cboot, mean_of, diff_of, bh = S_.cboot, S_.mean_of, S_.diff_of, S_.bh
OUT = ROOT / "analysis/output/level-near-miss-entry"
SEED = 20261125
XS, KS, TS = (20, 15, 10, 5), (0.25, 0.5, 0.75, 1.0), (5, 15, 30, 60)
THETAS = (0.0, 0.02, 0.05, 0.10)
TOD = [(0, 420, "00-07 Asia"), (420, 600, "07-10 LDN open"), (600, 780, "10-13 LDN"),
       (780, 960, "13-16 NY overlap"), (960, 1320, "16-22 NY pm")]
FEATS = ["z60", "dW", "dticks", "vel5", "vel15", "vel30", "momdet", "vol_reg", "vwap_dev", "consumed",
         "touches_before", "misses_before", "trend_agree", "fp0_30", "fpd_30"]
CATS = ["tier", "family", "tod", "x"]


def split(y):
    return np.where(y <= 2022, "train", np.where(y == 2023, "val", "test"))


def todb(m):
    out = np.full(len(m), "na", dtype=object)
    for a, b, lab in TOD:
        out[(m >= a) & (m < b)] = lab
    return out


def volb(v):
    return np.where(np.isnan(v), "na", np.where(v < 0.85, "low", np.where(v <= 1.15, "mid", "high")))


def load():
    E = pd.concat([pd.read_parquet(f) for f in sorted((OUT / "episodes").glob("*.parquet"))], ignore_index=True)
    S = pd.concat([pd.read_parquet(f) for f in sorted((OUT / "states").glob("*.parquet"))], ignore_index=True)
    for D in (E, S):
        D["date"] = pd.to_datetime(D["date"]); D["year"] = D.date.dt.year; D["split"] = split(D.year)
        D["tod"] = todb(D.minute.to_numpy()); D["vol_b"] = volb(D.vol_reg.to_numpy(float))
    E["ep"] = E.sym + "|" + E.date.astype(str) + "|" + E.kind + "|" + E.line + "|" + E.tier.astype(str) + "|" + E.start.astype(str)
    S["ep"] = S.sym + "|" + S.date.astype(str) + "|" + S.kind + "|" + S.line + "|" + S.tier.astype(str) + "|" + S.start.astype(str)
    return E, S


# ------------------------------------------------------------------------------------------------ models
def design(X, mu=None, sd=None, levels=None):
    num = X[FEATS].astype(float).copy()
    num["trend_agree"] = num["trend_agree"].fillna(0.5)
    num["vol_reg"] = num["vol_reg"].fillna(1.0)
    num["dticks"] = np.log1p(num["dticks"].clip(lower=0))
    num = num.clip(-50, 50)
    if mu is None:
        mu, sd = num.mean(), num.std().replace(0, 1)
    Z = ((num - mu) / sd).fillna(0).to_numpy()
    lv = levels or {c: sorted(X[c].astype(str).unique()) for c in CATS}
    parts = [Z] + [np.column_stack([(X[c].astype(str) == v).to_numpy(float) for v in lv[c][1:]]) for c in CATS]
    return np.column_stack(parts), mu, sd, lv


def fit_logit(A, y):
    from sklearn.linear_model import LogisticRegression
    return LogisticRegression(C=1.0, max_iter=300).fit(A, y)


def fit_gbm(A, y):
    from sklearn.ensemble import HistGradientBoostingClassifier
    return HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=200,
                                          random_state=SEED).fit(A, y)


def brier(p, y):
    return float(np.mean((p - y) ** 2))


def logloss(p, y):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def auc(p, y):
    r = pd.Series(p).rank().to_numpy(); y = np.asarray(y, bool)
    n1, n0 = y.sum(), (~y).sum()
    return float((r[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)) if n1 and n0 else np.nan


def reliability(p, y, bins=10):
    b = np.clip((p * bins).astype(int), 0, bins - 1)
    d = pd.DataFrame({"b": b, "p": p, "y": y}).groupby("b").agg(n=("y", "size"), pred=("p", "mean"), obs=("y", "mean"))
    return d.reset_index()


# ------------------------------------------------------------------------------------------------ methods
def method_stats(T, col="R"):
    if not len(T):
        return {"trades": 0}
    r = T[col].to_numpy()
    pos, neg = r[r > 0].sum(), -r[r < 0].sum()
    cum = np.cumsum(T.sort_values(["date", "bar"])[col].to_numpy())
    dd = float(np.max(np.maximum.accumulate(cum) - cum)) if len(cum) else 0.0
    out = {"trades": int(len(T)), "win": float(np.mean(r > 0)), "exp_net": float(r.mean()),
           "pf": float(pos / neg) if neg > 0 else np.nan, "maxDD_R": dd,
           "recovered": int(((T.ep_outcome != "touch") & (r > 0)).sum()),
           "false_entries": int(((T.ep_outcome == "touch") & (T.through) & (r < 0)).sum())}
    if "hold" in T:
        out["hold_med"] = float(T.hold.median())
    return out


def main():
    E, S = load()
    res = {"seed": SEED, "n_episodes_line": int((E.kind == "line").sum()), "n_states_line": int((S.kind == "line").sum())}
    # ======================================================== 1. near misses (episodes)
    k = E.kind.to_numpy()
    r10 = E.reach010.to_numpy(bool)
    E["retreat"] = (E.outcome == "retreat").astype(float)
    res["P1"] = {"line": mean_of(E, r10 & (k == "line"), "retreat"),
                 "placebo": mean_of(E, r10 & (k == "placebo"), "retreat"),
                 "vs_placebo": diff_of(E, r10 & (k == "line"), r10 & (k == "placebo"), "retreat"),
                 "halves": {h: diff_of(E, r10 & (k == "line") & ((E.year >= a) & (E.year <= b)).to_numpy(),
                                       r10 & (k == "placebo") & ((E.year >= a) & (E.year <= b)).to_numpy(), "retreat")["est"]
                            for h, (a, b) in {"2020-22": (2020, 2022), "2023-26": (2023, 2026)}.items()}}
    nm = E.groupby(["kind", "tier"]).outcome.value_counts(normalize=True).unstack().round(4)
    nm.to_csv(OUT / "nearmiss_rates_tier.csv")
    for by in ("tod", "vol_b", "family"):
        E.groupby(["kind", "tier", by]).outcome.value_counts(normalize=True).unstack().round(4).to_csv(OUT / f"nearmiss_rates_{by}.csv")
    miss = E[(E.outcome == "retreat")]
    dist = miss.groupby(["kind", "tier"])[["closest_W", "closest_Z", "closest_ticks"]].quantile([.1, .25, .5, .75]).unstack().round(3)
    dist.to_csv(OUT / "nearmiss_closest_distance.csv")
    res["feed_ambiguous_share_of_misses"] = float((miss[miss.kind == "line"].closest_ticks <= 2).mean())
    res["miss_within_010W_share"] = float((miss[miss.kind == "line"].closest_W <= 0.10).mean())
    # near miss vs touch: features at the 0.10 W state
    s10 = S[(S.kind == "line") & (S.x == 0.10)]
    s10.groupby("ep_outcome")[["z60", "vel5", "vel15", "vel30", "momdet", "vwap_dev", "consumed", "touches_before",
                                "misses_before", "vol_reg"]].mean().round(3).to_csv(OUT / "nearmiss_vs_touch_features.csv")
    # does distance predict? univariate AUC for reach30 on test, by scale
    st = S[(S.kind == "line") & (S.split == "test")]
    res["distance_scale_auc_reach30"] = {c: auc(-st[c].to_numpy(float), st.reach30.to_numpy()) for c in ("z60", "dW", "dticks")}
    res["distance_scale_auc_retreat"] = {c: auc(st[c].to_numpy(float), st.retreat.to_numpy()) for c in ("z60", "dW", "dticks")}
    # ======================================================== 2. first passage
    fp = []
    for T in TS:
        y = st[f"reach{T}"].to_numpy()
        base = S[(S.kind == "line") & (S.split == "train")][f"reach{T}"].mean()
        for nm_, col in (("Brownian mu=0", f"fp0_{T}"), ("Brownian drift", f"fpd_{T}")):
            p = st[col].to_numpy()
            fp.append({"T": T, "model": nm_, "brier": brier(p, y), "logloss": logloss(p, y), "auc": auc(p, y),
                       "mean_pred": float(p.mean()), "obs": float(y.mean())})
            rel = reliability(p, y); rel["T"] = T; rel["model"] = nm_
            rel.to_csv(OUT / f"fpt_reliability_{T}_{nm_.split()[1]}.csv", index=False)
        fp.append({"T": T, "model": "base rate (train)", "brier": brier(np.full(len(y), base), y),
                   "logloss": logloss(np.full(len(y), base), y), "auc": 0.5, "mean_pred": float(base), "obs": float(y.mean())})
    # ======================================================== 3. bridge
    br = sum(np.load(f) for f in (OUT / "agg").glob("bridge_*.npy"))
    brt = []
    for slot, sp in ((0, 1), (1, 5)):
        for b in range(br.shape[1]):
            n, sp_, act = br[slot, b]
            if n:
                brt.append({"spacing_min": sp, "bin": f"{b / 20:.2f}-{(b + 1) / 20:.2f}", "n": int(n), "pred": sp_ / n, "obs": act / n})
        res[f"bridge_{sp}min"] = {"pairs": int(br[slot, :, 0].sum()), "pred_crossings": float(br[slot, :, 1].sum()),
                                  "actual_crossings": float(br[slot, :, 2].sum())}
    pd.DataFrame(brt).to_csv(OUT / "bridge_reliability.csv", index=False)
    # ======================================================== 4. conditional drift toward the level (OU vs drift)
    S["zb"] = pd.cut(S.z60, [0, 0.25, 0.5, 0.75, 1, 1.5, 2, np.inf]).astype(str)
    S["vwb"] = pd.cut(S.vwap_dev, [-np.inf, 0, 0.5, 1, np.inf]).astype(str)
    S["momb"] = pd.cut(S.vel15, [-np.inf, 1, 2, 3, np.inf]).astype(str)
    S["tb_b"] = np.where(S.touches_before >= 2, "2+", S.touches_before.astype(str))
    drift = {}
    for by in ("zb", "tier", "tod", "vol_b", "momb", "vwb", "tb_b"):
        g = S.groupby(["kind", by])[["fwd15", "fwd30"]].agg(["mean", "size"]).round(4)
        g.to_csv(OUT / f"drift_toward_level_{by}.csv")
        drift[by] = g
    # ======================================================== 5. competing risks
    Hz = pd.concat([pd.read_parquet(f) for f in (OUT / "agg").glob("hazard_*.parquet")], ignore_index=True)
    for by in ("zb", "mb", "eb", "todb"):
        h = Hz.groupby(["kind", by])[["at_risk", "touch", "retreat"]].sum()
        h["h_touch"] = h.touch / h.at_risk; h["h_retreat"] = h.retreat / h.at_risk
        h.round(5).to_csv(OUT / f"hazard_{by}.csv")
    cif = []
    for (kd, tier, tod), g in E.groupby(["kind", "tier", "tod"]):
        row = {"kind": kd, "tier": tier, "tod": tod, "n": len(g)}
        for t in (15, 30, 60, 120):
            row[f"touch_{t}"] = float(((g.outcome == "touch") & (g.dur <= t)).mean())
            row[f"retreat_{t}"] = float(((g.outcome == "retreat") & (g.dur <= t)).mean())
        row["neither"] = float((g.outcome == "neither").mean())
        cif.append(row)
    pd.DataFrame(cif).round(4).to_csv(OUT / "cif_touch_retreat.csv", index=False)
    # ======================================================== 6-9. entry methods (line only)
    EL = E[E.kind == "line"].copy()
    EL["ep_outcome"] = EL.outcome
    trades = {}
    a = EL[EL.touch_bar >= 0].copy()
    a["R"] = a.A_fade_R - a.cost_R; a["bar"] = a.touch_bar; a["hold"] = a.A_fade_hold
    trades["A touch fade"] = a
    a2 = a.copy(); a2["R"] = a2.A_cont_R - a2.cost_R; a2["hold"] = a2.A_cont_hold
    trades["A touch follow"] = a2
    for x in XS:
        b = EL[EL[f"B{x}_bar"].notna()].copy(); b["R"] = b[f"B{x}_R"] - b.cost_R; b["bar"] = b[f"B{x}_bar"]; b["hold"] = b[f"B{x}_hold"]
        trades[f"B {x}%W"] = b
    for kk in KS:
        c = EL[EL[f"C{kk:g}_bar"].notna()].copy(); c["R"] = c[f"C{kk:g}_R"] - c.cost_R; c["bar"] = c[f"C{kk:g}_bar"]; c["hold"] = c[f"C{kk:g}_hold"]
        trades[f"C {kk:g}sig"] = c
    # validation choices for B and C
    def val_best(prefix):
        best, bv = None, -9
        for nm_, T in trades.items():
            if nm_.startswith(prefix):
                v = T[T.split == "val"]
                if len(v) >= 300 and v.R.mean() > bv:
                    best, bv = nm_, v.R.mean()
        return best, bv
    res["B_choice"], res["C_choice"] = val_best("B "), val_best("C ")
    # D / E: models
    SL = S[S.kind == "line"].copy().sort_values(["ep", "bar"])
    SL["y_fade"] = (SL.R_fade > 0).astype(int); SL["y_follow"] = (SL.R_follow > 0).astype(int)
    tr, va, te = (SL[SL.split == s] for s in ("train", "val", "test"))
    A_tr, mu, sd, lv = design(tr)
    A_va, *_ = design(va, mu, sd, lv); A_te, *_ = design(te, mu, sd, lv)
    models = {}
    choice = {}
    for tgt in ("y_fade", "y_follow"):
        lg = fit_logit(A_tr, tr[tgt]); gb = fit_gbm(A_tr, tr[tgt])
        pl, pg = lg.predict_proba(A_va)[:, 1], gb.predict_proba(A_va)[:, 1]
        choice[tgt] = {"logit_val_ll": logloss(pl, va[tgt]), "gbm_val_ll": logloss(pg, va[tgt])}
        models[tgt] = (lg, gb)

    def run_D(df, A, cls, theta, confirm=False):
        pf = models["y_fade"][cls].predict_proba(A)[:, 1]
        pc = models["y_follow"][cls].predict_proba(A)[:, 1]
        evf, evc = 2 * pf - 1 - df.cost_R.to_numpy(), 2 * pc - 1 - df.cost_R.to_numpy()
        side = np.where((evf >= evc) & (evf > theta), "fade", np.where(evc > theta, "follow", ""))
        d = df.assign(side=side, p_fade=pf, p_follow=pc)
        if confirm:
            ok = ((d.side == "fade") & (d.conf_fade_lag >= 0)) | ((d.side == "follow") & (d.conf_follow_lag >= 0))
            d = d[ok]
            d["R"] = np.where(d.side == "fade", d.R_fade_conf, d.R_follow_conf) - d.cost_R
        else:
            d = d[d.side != ""]
            d["R"] = np.where(d.side == "fade", d.R_fade, d.R_follow) - d.cost_R
        d = d.groupby("ep", sort=False).head(1)
        d = d.merge(EL[["ep", "through"]], on="ep", how="left")
        d["hold"] = d.hold_fade
        return d

    # choose class and theta on validation (net R with >= 300 trades); gbm only if ll better by >= 1% AND val R better
    best = None
    for cls in (0, 1):
        for th in THETAS:
            d = run_D(va, A_va, cls, th)
            if len(d) >= 300:
                cand = (d.R.mean(), cls, th)
                if best is None or cand[0] > best[0]:
                    best = cand
    ll_gain = all(choice[t]["gbm_val_ll"] <= 0.99 * choice[t]["logit_val_ll"] for t in choice)
    if best and best[1] == 1 and not ll_gain:
        best = max([(run_D(va, A_va, 0, th).R.mean(), 0, th) for th in THETAS if len(run_D(va, A_va, 0, th)) >= 300] or [best])
    res["D_choice"] = {"class": ["logit", "gbm"][best[1]] if best else None, "theta": best[2] if best else None,
                       "val_R": best[0] if best else None, "val_ll": choice}
    cls, th = (best[1], best[2]) if best else (0, 0.0)
    trades["D probability"] = run_D(te, A_te, cls, th)
    trades["E prob + confirm"] = run_D(te, A_te, cls, th, confirm=True)
    # calibration on test (chosen class)
    cal = {}
    for tgt in ("y_fade", "y_follow"):
        p = models[tgt][cls].predict_proba(A_te)[:, 1]; y = te[tgt].to_numpy()
        cal[tgt] = {"brier": brier(p, y), "logloss": logloss(p, y), "auc": auc(p, y),
                    "base_brier": brier(np.full(len(y), tr[tgt].mean()), y)}
        reliability(p, y).to_csv(OUT / f"calibration_{tgt}.csv", index=False)
        tt = te.assign(p=p, y=y)
        rows = []
        for by in ("sym", "tier", "tod", "vol_b"):
            for kk_, g in tt.groupby(by):
                rows.append({"by": by, "cell": kk_, "n": len(g), "pred": g.p.mean(), "obs": g.y.mean(),
                             "brier": brier(g.p.to_numpy(), g.y.to_numpy())})
        pd.DataFrame(rows).round(4).to_csv(OUT / f"calibration_{tgt}_cells.csv", index=False)
    res["calibration_test"] = cal
    # separate probability targets (logit, test)
    sep = {}
    for tgt in ("reach30", "retreat", "cont_through", "y_follow", "y_fade"):
        lg = fit_logit(A_tr, tr[tgt].astype(int))
        p = lg.predict_proba(A_te)[:, 1]; y = te[tgt].astype(int).to_numpy()
        sep[tgt] = {"auc": auc(p, y), "brier": brier(p, y), "base_brier": brier(np.full(len(y), tr[tgt].mean()), y),
                    "logloss": logloss(p, y), "base_ll": logloss(np.full(len(y), tr[tgt].mean()), y)}
    fp.append({"T": 30, "model": "logit reach30", **{k_: sep["reach30"][k_] for k_ in ("brier", "logloss", "auc")},
               "mean_pred": np.nan, "obs": float(te.reach30.mean())})
    pd.DataFrame(fp).round(4).to_csv(OUT / "fpt_scores.csv", index=False)
    res["first_passage"] = fp
    res["separate_targets_test"] = sep
    # ---- method table on test + primaries
    MT, BRK = [], []
    for nm_, T in trades.items():
        t = T[T.split == "test"] if "split" in T else T
        st_ = method_stats(t)
        if len(t):
            st_["ci"] = mean_of(t, np.ones(len(t), bool), "R")["ci"]
        MT.append({"method": nm_, **st_})
        for by in ("tier", "tod", "vol_b"):
            for kk_, g in t.groupby(by):
                BRK.append({"method": nm_, "by": by, "cell": kk_, "n": len(g), "win": float((g.R > 0).mean()), "exp_net": float(g.R.mean())})
    pd.DataFrame(MT).to_csv(OUT / "methods_test.csv", index=False)
    pd.DataFrame(BRK).round(4).to_csv(OUT / "methods_test_breakdown.csv", index=False)
    res["methods_test"] = MT

    def paired(m1, m2):
        a_, b_ = trades[m1], trades[m2]
        a_ = a_[a_.split == "test"]; b_ = b_[b_.split == "test"]
        J = pd.concat([a_[["date", "R", "year"]].assign(g=1), b_[["date", "R", "year"]].assign(g=2)], ignore_index=True)
        g1, g2 = (J.g == 1).to_numpy(), (J.g == 2).to_numpy()
        out = diff_of(J, g1, g2, "R")
        out["years"] = {lab: diff_of(J, g1 & ((J.year >= y0) & (J.year <= y1)).to_numpy(), g2 & ((J.year >= y0) & (J.year <= y1)).to_numpy(), "R")["est"]
                        for lab, (y0, y1) in {"2024": (2024, 2024), "2025-26": (2025, 2026)}.items()}
        return out
    P = {"P2": paired("D probability", "A touch fade"), "P3": paired(res["B_choice"][0], "A touch fade"),
         "P4": paired(res["C_choice"][0], "A touch fade"), "P5": paired("E prob + confirm", "D probability")}
    D_own = mean_of(trades["D probability"], np.ones(len(trades["D probability"]), bool), "R")
    q = bh([res["P1"]["vs_placebo"]["p"], P["P2"]["p"], P["P3"]["p"], P["P4"]["p"], P["P5"]["p"]])
    V = {}
    p1 = res["P1"]["vs_placebo"]
    V["P1"] = ("VALIDATED" if p1["ci"][0] > 0 and q[0] <= 0.10 and all(v > 0 for v in res["P1"]["halves"].values())
               else ("NULL" if p1["ci"][1] < 0.01 else "UNDERPOWERED"))
    for i, h in enumerate(("P2", "P3", "P4", "P5"), 1):
        x = P[h]
        ok = x["ci"][0] > 0 and q[i] <= 0.10 and all(v > 0 for v in x["years"].values())
        if h == "P2":
            ok = ok and D_own["ci"][0] > 0
        V[h] = "VALIDATED" if ok else ("NULL" if x["ci"][1] < 0.02 else "UNDERPOWERED")
    res["primaries"] = P; res["D_own"] = D_own; res["bh_q"] = dict(zip(["P1", "P2", "P3", "P4", "P5"], q.tolist())); res["verdicts"] = V
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=lambda o: float(o) if isinstance(o, (np.floating, np.integer)) else str(o)))
    pd.set_option("display.width", 250)
    print(json.dumps({k_: res[k_] for k_ in ("P1", "verdicts", "bh_q", "B_choice", "C_choice", "D_choice", "D_own",
                                              "feed_ambiguous_share_of_misses", "miss_within_010W_share",
                                              "distance_scale_auc_reach30", "distance_scale_auc_retreat",
                                              "bridge_1min", "bridge_5min", "calibration_test", "separate_targets_test")},
                     indent=1, default=str))
    print(pd.DataFrame(MT).round(4).to_string(index=False))
    print(json.dumps(P, indent=1, default=str))
    print(pd.DataFrame(fp).round(4).to_string(index=False))
    print(nm)


if __name__ == "__main__":
    main()
