"""surprise-size-pooled scoring (called by engine.py run). See the prereg for every cell."""
from __future__ import annotations

import json
from math import erf, sqrt
from pathlib import Path

import numpy as np
import pandas as pd

import engine as E

B = 2000
BAR_UPLIFT = 0.075        # exp(1.5 * gamma) - 1 >= 7.5%  (|z| 0.5 -> 2.0), prereg §5
GROUPS = {"fx": ("grp", "fx"), "nq": ("asset", "nq"), "spx500": ("asset", "spx500"), "gold": ("asset", "gold")}


def p_norm(t: float) -> float:
    return 2 * (1 - 0.5 * (1 + erf(abs(t) / sqrt(2))))


def holm(ps: list[float]) -> list[float]:
    m = len(ps)
    order = np.argsort(ps)
    adj = np.empty(m)
    run = 0.0
    for r, i in enumerate(order):
        run = max(run, (m - r) * ps[i])
        adj[i] = min(run, 1.0)
    return adj.tolist()


def bh(ps: list[float]) -> list[float]:
    m = len(ps)
    order = np.argsort(ps)[::-1]
    adj = np.empty(m)
    run = 1.0
    for r, i in enumerate(order):
        rank = m - r
        run = min(run, ps[i] * m / rank)
        adj[i] = run
    return adj.tolist()


def sel(p: pd.DataFrame, g: str, w: str, kind: str = "cont") -> pd.DataFrame:
    col, val = GROUPS[g]
    return p[(p["kind"] == kind) & p["valid"] & (p["window"] == w) & (p[col] == val)]


def fit(d: pd.DataFrame, xvar="zc"):
    Xd, yd, cl, xs, nfe = E.design(d, xvar=xvar)
    b, se, e = E.ols_cr(Xd, yd, cl, nfe)
    return dict(zip(xs, b)), dict(zip(xs, se)), (Xd, yd, cl, nfe, e)


def r2_within(d, xvar):
    Xd, yd, cl, xs, nfe = E.design(d, xvar=xvar)
    b, *_ = np.linalg.lstsq(Xd, yd, rcond=None)
    e = yd - Xd @ b
    return 1 - e.var() / yd.var()


def oos_gain(d: pd.DataFrame) -> dict:
    """Fit 2016-2020, score 2021-2025-04: MSE of log range with vs without zc. FE = train
    lead-series means; leads not seen in train are dropped."""
    d = d.copy()
    d["ly"] = np.log(d["y"]); d["lpre"] = np.log(d["pre60"]); d["ltod"] = np.log(d["tod20"])
    d["fe"] = d["econ"] + "|" + d["lead"].astype(str)
    tr = d[d["t0"] < E.SPLIT]; te = d[d["t0"] >= E.SPLIT]
    te = te[te["fe"].isin(set(tr["fe"]))]
    out = {}
    for name, xs in (("base", E.CTRL), ("with_z", ["zc"] + E.CTRL)):
        # within-transform on train, then FE = train mean of (y - Xb)
        g = tr.groupby("fe")
        Xd = tr[xs].to_numpy(float) - g[xs].transform("mean").to_numpy(float)
        yd = tr["ly"].to_numpy() - g["ly"].transform("mean").to_numpy()
        b, *_ = np.linalg.lstsq(Xd, yd, rcond=None)
        fe = (tr["ly"] - tr[xs].to_numpy(float) @ b).groupby(tr["fe"]).mean()
        pred = te[xs].to_numpy(float) @ b + te["fe"].map(fe).to_numpy()
        out[name] = float(np.mean((te["ly"].to_numpy() - pred) ** 2))
    out["n_test"] = int(len(te))
    out["mse_reduction_pct"] = round(100 * (1 - out["with_z"] / out["base"]), 3)
    return out


def score(p: pd.DataFrame) -> None:
    rng = np.random.default_rng(E.SEED)
    plc = pd.read_parquet(E.OUT / "panel_power.parquet")      # week-before windows, real event z
    res = {"seed": E.SEED, "B": B, "bar_uplift": BAR_UPLIFT, "primary": {}, "disagg": {}, "robust": {},
           "placebo_week": {}, "permutation": {}, "positive_control": {}, "oos": {}, "discrete": {},
           "population": {}}

    # population actually scored
    pv = p[(p["kind"] == "cont") & p["valid"]]
    res["population"] = {
        "fx_events_by_econ_w30": pv[(pv.grp == "fx") & (pv.window == "w30")].groupby("econ").size().to_dict(),
        "us_risk_events_w30": pv[(pv.grp == "risk") & (pv.window == "w30")].groupby("asset").size().to_dict(),
        "rows_invalid_share": round(float(1 - p["valid"].mean()), 4),
    }

    # ── primary 12 cells ────────────────────────────────────────────────────────
    cells = [(g, w) for g in GROUPS for w in E.WINDOWS]
    prim = {}
    for g, w in cells:
        d = sel(p, g, w)
        b, se, (Xd, yd, cl, nfe, e) = fit(d)
        boot = E.cluster_boot(Xd, yd, cl, B, rng, col=0)
        pb = max(2 * min((boot <= 0).mean(), (boot >= 0).mean()), 1 / B)
        halves = {}
        for hn, hd in (("h1_2016_2020", d[d["t0"] < E.SPLIT]), ("h2_2021_2025", d[d["t0"] >= E.SPLIT])):
            hb, hs, _ = fit(hd)
            halves[hn] = {"gamma": round(hb["zc"], 4), "se": round(hs["zc"], 4), "n": int(len(hd))}
        dp = sel(plc, g, w)
        pbx, pse, _ = fit(dp)
        prim[f"{g}_{w}"] = {
            "n": int(len(d)), "n_dates": int(cl.max() + 1),
            "gamma": round(b["zc"], 4), "se_cr": round(se["zc"], 4),
            "ci95": [round(float(np.quantile(boot, 0.025)), 4), round(float(np.quantile(boot, 0.975)), 4)],
            "p_boot": pb, "t_cr": round(b["zc"] / se["zc"], 2),
            "uplift_0.5_to_2": round(float(np.exp(1.5 * b["zc"]) - 1), 4),
            "uplift_ci": [round(float(np.exp(1.5 * np.quantile(boot, 0.025)) - 1), 4),
                          round(float(np.exp(1.5 * np.quantile(boot, 0.975)) - 1), 4)],
            "controls": {k: round(v, 4) for k, v in b.items() if k != "zc"},
            "r2_within_base": round(r2_within(d, None), 4), "r2_within_with_z": round(r2_within(d, "zc"), 4),
            "halves": halves,
            "placebo_week": {"gamma": round(pbx["zc"], 4), "se": round(pse["zc"], 4), "n": int(len(dp))},
        }
    adj = holm([prim[k]["p_boot"] for k in prim])
    for k, a in zip(prim, adj):
        c = prim[k]
        c["p_holm"] = round(a, 5)
        pl = c["placebo_week"]
        placebo_ok = (abs(pl["gamma"]) < 1.96 * pl["se"]) or (pl["gamma"] < c["gamma"] / 3)
        gates = {"positive": c["gamma"] > 0, "holm": a < 0.05,
                 "material": c["uplift_0.5_to_2"] >= BAR_UPLIFT,
                 "both_halves": all(h["gamma"] > 0 for h in c["halves"].values()),
                 "placebo": bool(placebo_ok)}
        c["gates"] = gates
        c["pass"] = all(gates.values())
        if c["pass"]:
            c["cell_verdict"] = "VALIDATED"
        elif gates["positive"] and gates["holm"] and gates["both_halves"] and gates["placebo"] and not gates["material"]:
            c["cell_verdict"] = "CONTEXT"          # real but below the materiality bar
        elif c["uplift_ci"][1] < BAR_UPLIFT:
            c["cell_verdict"] = "NULL"             # CI rules out a material effect
        else:
            c["cell_verdict"] = "UNDERPOWERED"
    res["primary"] = prim

    # ── disaggregation (BH q = 0.10) ─────────────────────────────────────────────
    dis = {}
    for w in E.WINDOWS:
        d = sel(p, "fx", w)
        for e in sorted(d["econ"].unique()):
            de = d[d["econ"] == e]
            if len(de) < 40:
                dis[f"econ_{e}_{w}"] = {"n": int(len(de)), "skipped": "n<40"}
                continue
            b, se, _ = fit(de)
            dis[f"econ_{e}_{w}"] = {"n": int(len(de)), "gamma": round(b["zc"], 4), "se": round(se["zc"], 4),
                                    "p": p_norm(b["zc"] / se["zc"])}
        # homogeneity: zc x econ interactions (Wald, CR1)
        d2 = d.copy()
        econs = sorted(d2["econ"].unique())
        xs = ["zc"]
        for e in econs[1:]:
            d2[f"zc_{e}"] = d2["zc"] * (d2["econ"] == e)
            xs.append(f"zc_{e}")
        Xd, yd, cl, names, nfe = E.design(d2, xvar=xs)
        bb, *_ = np.linalg.lstsq(Xd, yd, rcond=None)
        ee = yd - Xd @ bb
        XtXi = np.linalg.pinv(Xd.T @ Xd)
        G = cl.max() + 1
        S = np.zeros((G, Xd.shape[1])); np.add.at(S, cl, Xd * ee[:, None])
        Vm = XtXi @ (S.T @ S) @ XtXi * G / (G - 1)
        k = len(xs) - 1
        idx = list(range(1, len(xs)))
        bi = bb[idx]; Vi = Vm[np.ix_(idx, idx)]
        W = float(bi @ np.linalg.pinv(Vi) @ bi)
        from scipy.stats import chi2
        dis[f"homogeneity_fx_{w}"] = {"wald": round(W, 3), "df": k, "p": float(1 - chi2.cdf(W, k))}
        for g in GROUPS:
            dg = sel(p, g, w)
            for imp in ("high", "medium"):
                di = dg[dg["impact"] == imp]
                if len(di) < 40:
                    continue
                b, se, _ = fit(di)
                dis[f"tier_{g}_{imp}_{w}"] = {"n": int(len(di)), "gamma": round(b["zc"], 4),
                                              "se": round(se["zc"], 4), "p": p_norm(b["zc"] / se["zc"])}
            for fam in sorted(dg["family"].dropna().unique()):
                df_ = dg[dg["family"] == fam]
                if len(df_) < 40:
                    continue
                b, se, _ = fit(df_)
                dis[f"family_{g}_{fam}_{w}"] = {"n": int(len(df_)), "gamma": round(b["zc"], 4),
                                                "se": round(se["zc"], 4), "p": p_norm(b["zc"] / se["zc"])}
    keys = [k for k in dis if "p" in dis[k] and not k.startswith("homogeneity")]
    adjb = bh([dis[k]["p"] for k in keys])
    for k, a in zip(keys, adjb):
        dis[k]["q_bh"] = round(a, 5)
        dis[k]["survives_bh"] = bool(a < 0.10 and dis[k]["gamma"] > 0)
    res["disagg"] = dis
    res["disagg_summary"] = {"tests": len(keys), "survive_bh_positive": int(sum(dis[k]["survives_bh"] for k in keys)),
                             "chance_expected_at_0.10": round(0.10 * len(keys), 1)}

    # ── robustness (descriptive) ─────────────────────────────────────────────────
    rob = {}
    for g, w in cells:
        d = sel(p, g, w)
        out = {}
        b, se, _ = fit(d, xvar="zmean"); out["zmean"] = [round(b["zmean"], 4), round(se["zmean"], 4)]
        dd = d[d["imputed"] == False]  # noqa: E712
        b, se, _ = fit(dd); out["real_clock_only"] = [round(b["zc"], 4), round(se["zc"], 4), int(len(dd))]
        dd = d[d["conc"] == 0]
        b, se, _ = fit(dd); out["no_concurrent"] = [round(b["zc"], 4), round(se["zc"], 4), int(len(dd))]
        d2 = d.copy(); d2["big"] = (d2["zc"] >= 1.5).astype(float)
        b, se, _ = fit(d2, xvar="big"); out["big_ge_1.5_dummy"] = [round(b["big"], 4), round(se["big"], 4)]
        rob[f"{g}_{w}"] = out
        res["oos"][f"{g}_{w}"] = oos_gain(d)
    res["robust"] = rob

    # ── permutation placebo (z shuffled within lead series), 200 reps on w30 cells ─
    for g in GROUPS:
        d = sel(p, g, "w30").copy()
        vals = []
        for _ in range(200):
            d["zc"] = d.groupby(["econ", "lead"])["zc"].transform(lambda s: rng.permutation(s.values))
            b, _, _ = fit(d)
            vals.append(b["zc"])
        res["permutation"][f"{g}_w30"] = {"mean": round(float(np.mean(vals)), 5),
                                          "p97.5": round(float(np.quantile(vals, 0.975)), 5)}

    # ── positive control: planted gamma = 0.05 on the week-before windows ────────
    for g in GROUPS:
        d = sel(plc, g, "w30").copy()
        d["y"] = d["y"] * np.exp(0.05 * d["zc"])
        b, se, _ = fit(d)
        b0, se0, _ = fit(sel(plc, g, "w30"))
        res["positive_control"][f"{g}_w30"] = {"planted": 0.05, "recovered": round(b["zc"], 4),
                                               "zero_case": round(b0["zc"], 4), "se": round(se["zc"], 4)}

    # ── discrete series (rate decisions etc.): any surprise vs none ──────────────
    for g in GROUPS:
        for w in E.WINDOWS:
            d = sel(p, g, w, kind="disc").copy()
            if len(d) < 40 or d["any_surprise"].nunique() < 2:
                continue
            d["anys"] = d["any_surprise"].astype(float)
            b, se, _ = fit(d, xvar="anys")
            res["discrete"][f"{g}_{w}"] = {"n": int(len(d)), "n_surprise": int(d["anys"].sum()),
                                           "coef_log": round(b["anys"], 4), "se": round(se["anys"], 4)}

    # ── ledger-level verdicts ────────────────────────────────────────────────────
    def agg(keys):
        v = [prim[k]["cell_verdict"] for k in keys]
        for word in ("VALIDATED", "CONTEXT", "UNDERPOWERED", "NULL"):
            if word in v:
                return word
        return "NULL"
    res["verdicts"] = {"surprise-size-pooled-fx": agg([f"fx_{w}" for w in E.WINDOWS]),
                       "surprise-size-pooled-us-risk": agg([f"{g}_{w}" for g in ("nq", "spx500", "gold") for w in E.WINDOWS])}
    (E.OUT / "results.json").write_text(json.dumps(res, indent=2, default=float))
    print(json.dumps({k: {kk: (vv["gamma"], vv["ci95"], vv["p_holm"], vv["uplift_0.5_to_2"], vv["cell_verdict"]) for kk, vv in res["primary"].items()} if k == "primary" else res[k] for k in ("primary", "verdicts", "disagg_summary")}, indent=1, default=float))
